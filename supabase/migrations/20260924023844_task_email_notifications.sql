-- Durable, server-only task email queue. No historical tasks are backfilled.
create table public.task_email_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  recipient_id uuid not null references public.profiles on delete cascade,
  event_kind text not null check (event_kind in ('assigned','completed')),
  event_at timestamptz not null,
  recipient_email text not null,
  subject text not null,
  message text not null,
  action_path text not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','skipped')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_at timestamptz,
  lock_token uuid,
  payload jsonb,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(task_id,recipient_id,event_kind,event_at)
);
create index task_email_pending_idx on public.task_email_outbox(available_at,created_at) where status in ('queued','processing');
create index task_email_recipient_idx on public.task_email_outbox(recipient_id);
create index task_email_org_idx on public.task_email_outbox(organisation_id);
alter table public.task_email_outbox enable row level security;
revoke all on public.task_email_outbox from public,anon,authenticated;
grant select,update on public.task_email_outbox to service_role;

create function private.queue_task_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor_name text; branch uuid; kind text; event_time timestamptz;
begin
  if auth.uid() is null then return new; end if;
  select display_name into actor_name from public.profiles
    where id=auth.uid() and active and level<>'student' and organisation_id=new.organisation_id;
  if not found then return new; end if;
  branch=new.branch_id;
  if new.case_id is not null then select branch_id into branch from public.cases where id=new.case_id; end if;
  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
    kind='completed'; event_time=new.completed_at;
  elsif new.status='open' and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
    kind='assigned'; event_time=new.updated_at;
  else return new; end if;
  insert into public.task_email_outbox(organisation_id,task_id,recipient_id,event_kind,event_at,recipient_email,subject,message,action_path)
  select new.organisation_id,new.id,p.id,kind,event_time,p.email,
    case when kind='assigned' then 'Task assigned: ' else 'Task completed: ' end||new.title,
    actor_name||case when kind='assigned' then ' assigned a task to you.' else ' completed this task.' end||E'\n\n'||new.title||
      case when new.due_at is not null then E'\nDue: '||to_char(new.due_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC' else '' end,
    case when new.case_id is not null then '/?case='||new.case_id::text||'&tab=tasks' else '/?module=work' end
  from public.profiles p where p.organisation_id=new.organisation_id and p.active and p.level<>'student'
    and ((kind='assigned' and p.id=new.assigned_to) or (kind='completed' and p.id in (new.assigned_by,new.created_by)))
    and (p.level in ('super_admin','platform_owner') or
      (coalesce((p.function_access->>'work')::boolean,true) and
       (p.branch_id=branch or (branch is null and new.case_id is null and p.id=new.assigned_to))))
  on conflict do nothing;
  return new;
end $$;
revoke all on function private.queue_task_email() from public,anon,authenticated;
create trigger queue_task_email after insert or update on public.tasks for each row execute function private.queue_task_email();

-- Recheck current branch, task state, account and permissions immediately before dispatch.
create function private.task_email_allowed(q public.task_email_outbox) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.profiles p on p.id=q.recipient_id
    left join public.cases c on c.id=t.case_id
    where t.id=q.task_id and t.organisation_id=q.organisation_id and p.organisation_id=q.organisation_id
      and p.active and p.level<>'student' and p.email=q.recipient_email
      and ((q.event_kind='assigned' and t.status='open' and t.assigned_to=p.id
        and not exists(select 1 from public.task_email_outbox later where later.task_id=q.task_id
          and later.event_kind='assigned' and later.event_at>q.event_at)) or
        (q.event_kind='completed' and t.status='completed' and t.completed_at=q.event_at))
      and (p.level in ('super_admin','platform_owner') or
        (coalesce((p.function_access->>'work')::boolean,true) and
         (p.branch_id=case when t.case_id is null then t.branch_id else c.branch_id end or
          (t.case_id is null and t.branch_id is null and t.assigned_to=p.id)))))
$$;
revoke all on function private.task_email_allowed(public.task_email_outbox) from public,anon,authenticated;

create function private.claim_task_emails(p_from text,p_origin text) returns setof public.task_email_outbox
language plpgsql security definer set search_path='' as $$
begin
  if length(btrim(p_from))=0 or p_origin !~ '^https://[^/]+$' then raise exception 'Email sender and HTTPS origin required'; end if;
  -- Never retry past Resend's 24-hour idempotency retention; leave uncertain sends for review.
  update public.task_email_outbox set status='failed',last_error='Retry limit reached; check provider delivery before retrying.'
    where status in ('queued','processing') and (first_attempt_at < now()-interval '23 hours' or attempts>=10)
      and (locked_at is null or locked_at < now()-interval '2 minutes');
  update public.task_email_outbox q set status='skipped',last_error='Recipient access, address or task state changed.'
    where status in ('queued','processing') and (locked_at is null or locked_at<now()-interval '2 minutes')
      and not private.task_email_allowed(q);
  return query
    with candidates as (
      select id from public.task_email_outbox q where available_at<=now()
        and (status='queued' or (status='processing' and locked_at<now()-interval '2 minutes'))
        and private.task_email_allowed(q)
      order by created_at for update skip locked limit 5
    )
    update public.task_email_outbox q set status='processing',attempts=attempts+1,locked_at=now(),lock_token=gen_random_uuid(),
      first_attempt_at=coalesce(first_attempt_at,now()),
      payload=coalesce(payload,jsonb_build_object('from',p_from,'to',jsonb_build_array(recipient_email),
        'subject',subject,'text',message||E'\n\nOpen in Maximus CRM: '||p_origin||action_path||E'\nSign in with your staff account to view the task.'))
    from candidates where q.id=candidates.id returning q.*;
end $$;
revoke all on function private.claim_task_emails(text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.claim_task_emails(text,text) to service_role;
create function public.claim_task_emails(p_from text,p_origin text) returns setof public.task_email_outbox
language sql security invoker set search_path='' as $$ select * from private.claim_task_emails(p_from,p_origin) $$;
revoke all on function public.claim_task_emails(text,text) from public,anon,authenticated;
grant execute on function public.claim_task_emails(text,text) to service_role;

-- Token fencing prevents an expired worker overwriting a newer attempt.
create function public.finish_task_email(p_id uuid,p_token uuid,p_status text,p_provider_id text default null,p_error text default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('sent','queued','failed') then raise exception 'Invalid delivery result'; end if;
  update public.task_email_outbox set status=p_status,provider_message_id=p_provider_id,last_error=p_error,
    sent_at=case when p_status='sent' then now() else null end,
    available_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6))::integer)),
    locked_at=null,lock_token=null
  where id=p_id and lock_token=p_token and status='processing';
end $$;
revoke all on function public.finish_task_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_task_email(uuid,uuid,text,text,text) to service_role;

-- A single server-only heartbeat exposes readiness without revealing credentials.
create table public.task_email_worker_status (
  id integer primary key check(id=1),
  checked_at timestamptz not null,
  configured boolean not null,
  status text not null,
  claimed integer not null default 0,
  sent integer not null default 0
);
alter table public.task_email_worker_status enable row level security;
revoke all on public.task_email_worker_status from public,anon,authenticated;
grant select,insert,update on public.task_email_worker_status to service_role;
