-- Task emails for the rest of a task's life, not only its assignment and
-- completion: an open task that is edited, a completed task that is reopened,
-- and a comment each tell the people on the task. A comment also counts as
-- activity, so the task rises to the top of a "recently updated" list.

alter table public.task_email_outbox drop constraint if exists task_email_outbox_event_kind_check;
alter table public.task_email_outbox add constraint task_email_outbox_event_kind_check
  check (event_kind in ('assigned','completed','reopened','updated','comment'));

create or replace function private.queue_task_email() returns trigger
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
  elsif new.status='open' and tg_op='UPDATE' and old.status='completed' then
    kind='reopened'; event_time=new.updated_at;
  elsif new.status='open' and tg_op='UPDATE' and (new.title is distinct from old.title
      or new.description is distinct from old.description or new.due_at is distinct from old.due_at
      or new.priority is distinct from old.priority or new.task_type is distinct from old.task_type) then
    kind='updated'; event_time=new.updated_at;
  else return new; end if;
  insert into public.task_email_outbox(organisation_id,task_id,recipient_id,event_kind,event_at,recipient_email,subject,message,action_path)
  select new.organisation_id,new.id,p.id,kind,event_time,p.email,
    case kind when 'assigned' then 'Task assigned: ' when 'completed' then 'Task completed: '
      when 'reopened' then 'Task reopened: ' else 'Task updated: ' end||new.title,
    actor_name||case kind when 'assigned' then ' assigned a task to you.' when 'completed' then ' completed this task.'
      when 'reopened' then ' reopened this task.' else ' updated this task.' end||E'\n\n'||new.title||
      case when kind='updated' and new.title is distinct from old.title then E'\nWas: '||old.title else '' end||
      case when kind='updated' and new.priority is distinct from old.priority then E'\nPriority: '||new.priority else '' end||
      case when kind='updated' and new.description is distinct from old.description then E'\nThe description was changed.' else '' end||
      case when new.due_at is not null then E'\nDue: '||to_char(new.due_at at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC' else '' end,
    case when new.case_id is not null then '/?case='||new.case_id::text||'&tab=tasks' else '/?module=work' end
  from public.profiles p where p.organisation_id=new.organisation_id and p.active and p.level<>'student'
    and ((kind='assigned' and p.id=new.assigned_to)
      or (kind='completed' and (p.id in (new.assigned_by,new.created_by) or (p.id=new.assigned_to and p.id<>auth.uid())))
      -- Whoever made the change already knows about it.
      or (kind in ('reopened','updated') and p.id in (new.assigned_to,new.assigned_by,new.created_by) and p.id<>auth.uid()))
    and (p.level in ('super_admin','platform_owner') or
      (coalesce((p.function_access->>'work')::boolean,true) and
       (p.branch_id=branch or (branch is null and new.case_id is null and p.id=new.assigned_to))))
  on conflict do nothing;
  return new;
end $$;
revoke all on function private.queue_task_email() from public,anon,authenticated;

-- A comment emails everyone on the task but its author, and marks the task as
-- just updated.
create function private.queue_task_comment_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor_name text; t public.tasks; branch uuid;
begin
  select * into t from public.tasks where id=new.task_id;
  if not found then return new; end if;
  update public.tasks set updated_at=clock_timestamp() where id=t.id;
  select display_name into actor_name from public.profiles
    where id=new.author_id and active and level<>'student' and organisation_id=t.organisation_id;
  if not found then return new; end if;
  branch=t.branch_id;
  if t.case_id is not null then select branch_id into branch from public.cases where id=t.case_id; end if;
  insert into public.task_email_outbox(organisation_id,task_id,recipient_id,event_kind,event_at,recipient_email,subject,message,action_path)
  select t.organisation_id,t.id,p.id,'comment',new.created_at,p.email,'New comment on task: '||t.title,
    actor_name||' commented on this task.'||E'\n\n'||t.title||E'\n\n'||left(new.body,1000),
    case when t.case_id is not null then '/?case='||t.case_id::text||'&tab=tasks' else '/?module=work' end
  from public.profiles p where p.organisation_id=t.organisation_id and p.active and p.level<>'student'
    and p.id in (t.assigned_to,t.assigned_by,t.created_by) and p.id<>new.author_id
    and (p.level in ('super_admin','platform_owner') or
      (coalesce((p.function_access->>'work')::boolean,true) and
       (p.branch_id=branch or (branch is null and t.case_id is null and p.id=t.assigned_to))))
  on conflict do nothing;
  return new;
end $$;
revoke all on function private.queue_task_comment_email() from public,anon,authenticated;
create trigger queue_task_comment_email after insert on public.task_comments
  for each row execute function private.queue_task_comment_email();

-- Recheck current branch, task state, account and permissions immediately before dispatch.
create or replace function private.task_email_allowed(q public.task_email_outbox) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.profiles p on p.id=q.recipient_id
    left join public.cases c on c.id=t.case_id
    where t.id=q.task_id and t.organisation_id=q.organisation_id and p.organisation_id=q.organisation_id
      and p.active and p.level<>'student' and p.email=q.recipient_email
      and ((q.event_kind='assigned' and t.status='open' and t.assigned_to=p.id
        and not exists(select 1 from public.task_email_outbox later where later.task_id=q.task_id
          and later.event_kind='assigned' and later.event_at>q.event_at)) or
        (q.event_kind='completed' and t.status='completed' and t.completed_at=q.event_at) or
        -- Several quick edits send the latest one only.
        (q.event_kind in ('reopened','updated') and t.status='open' and p.id in (t.assigned_to,t.assigned_by,t.created_by)
          and not exists(select 1 from public.task_email_outbox later where later.task_id=q.task_id
            and later.recipient_id=q.recipient_id and later.event_kind=q.event_kind and later.event_at>q.event_at)) or
        (q.event_kind='comment' and p.id in (t.assigned_to,t.assigned_by,t.created_by)))
      and (p.level in ('super_admin','platform_owner') or
        (coalesce((p.function_access->>'work')::boolean,true) and
         (p.branch_id=case when t.case_id is null then t.branch_id else c.branch_id end or
          (t.case_id is null and t.branch_id is null and t.assigned_to=p.id)))))
$$;
revoke all on function private.task_email_allowed(public.task_email_outbox) from public,anon,authenticated;

-- The CRM delivers these itself straight after the change, from a connected
-- staff Gmail, so the claim also accepts the local address used in testing.
create or replace function private.claim_task_emails(p_from text,p_origin text) returns setof public.task_email_outbox
language plpgsql security definer set search_path='' as $$
begin
  if length(btrim(p_from))=0 or (p_origin !~ '^https://[^/]+$' and p_origin !~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$') then
    raise exception 'Email sender and HTTPS origin required'; end if;
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
grant execute on function private.claim_task_emails(text,text) to service_role;

create or replace function public.schema_version()
returns text language sql stable security definer set search_path=public as $$
  select '20261124000000'
$$;
