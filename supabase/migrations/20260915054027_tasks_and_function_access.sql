-- Per-person function restrictions preserve the existing tenant, branch and role policies.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter table public.profiles add column if not exists function_access jsonb;

create function private.function_allowed(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select active and (
    level in ('super_admin','platform_owner','student') or
    (p_key <> 'integrations' and (p_key <> 'administration' or level in ('branch_admin','manager'))
      and coalesce((function_access ->> p_key)::boolean, true)))
    from public.profiles where id = (select auth.uid())), false)
$$;
revoke all on function private.function_allowed(text) from public, anon;
grant execute on function private.function_allowed(text) to authenticated;
create function private.any_function_allowed(p_keys text[]) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from unnest(p_keys) k where private.function_allowed(k))
$$;
revoke all on function private.any_function_allowed(text[]) from public, anon;
grant execute on function private.any_function_allowed(text[]) to authenticated;

create function private.guard_function_access() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.function_access is null) or
     (tg_op = 'UPDATE' and new.function_access is not distinct from old.function_access) then return new; end if;
  if auth.uid() is null or public.current_user_level() not in ('super_admin','platform_owner')
     or new.organisation_id <> public.current_organisation_id() then
    raise exception 'Only Super Admin can change function access' using errcode = '42501';
  end if;
  if new.level in ('super_admin','platform_owner','student') then
    raise exception 'Function access is managed for staff and admins only' using errcode='22023';
  end if;
  if new.function_access is not null then
    if jsonb_typeof(new.function_access) <> 'object' then raise exception 'Access must be an object' using errcode='22023'; end if;
    if exists(select 1 from jsonb_each(new.function_access) e where jsonb_typeof(e.value) <> 'boolean' or
      e.key <> all(array['dashboard','enquiries','students','applications','visas','direct_visas','defer','case_complete','work','calendar','documents','communications','courseFinder','finance','reports','templates','workflows','compliance','ai','administration','integrations'])) then
      raise exception 'Unknown function or non-boolean access value' using errcode='22023';
    end if;
  end if;
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,before_data,after_data)
  values(new.organisation_id,auth.uid(),'staff.function_access_changed','profile',new.id::text,'Updated staff function access',
    case when tg_op='UPDATE' then jsonb_build_object('function_access',old.function_access) else null end,
    jsonb_build_object('function_access',new.function_access));
  return new;
end $$;
revoke all on function private.guard_function_access() from public, anon;
create trigger guard_function_access before insert or update on public.profiles for each row execute function private.guard_function_access();

create function public.set_function_access(p_profile uuid, p_access jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or public.current_user_level() not in ('super_admin','platform_owner') then
    raise exception 'Only Super Admin can change function access' using errcode='42501'; end if;
  update public.profiles set function_access=p_access where id=p_profile and organisation_id=public.current_organisation_id();
  if not found then raise exception 'Staff member unavailable' using errcode='42501'; end if;
end $$;
revoke all on function public.set_function_access(uuid,jsonb) from public, anon;
grant execute on function public.set_function_access(uuid,jsonb) to authenticated;

-- A task belongs to its current case branch, or to a branch for general work.
alter table public.tasks add column if not exists branch_id uuid references public.branches;
alter table public.tasks add column if not exists created_by uuid references public.profiles;
update public.tasks t set created_by=assigned_by,
  branch_id=coalesce((select c.branch_id from public.cases c where c.id=t.case_id),
                    (select p.branch_id from public.profiles p where p.id=t.assigned_to));
create index if not exists tasks_case_status_due_idx on public.tasks(case_id,status,due_at,id);
create index if not exists tasks_branch_assignee_idx on public.tasks(branch_id,assigned_to);
create index if not exists tasks_creator_idx on public.tasks(created_by);

drop policy if exists tasks_internal_write on public.tasks;
drop policy if exists tasks_scoped_select on public.tasks;
create policy tasks_scoped_select on public.tasks for select to authenticated using (
  organisation_id=public.current_organisation_id() and public.is_internal_user() and
  case when case_id is not null then public.can_access_case(case_id)
    else public.can_access_branch(branch_id) or (branch_id is null and assigned_to=auth.uid()) end);
create policy tasks_internal_write on public.tasks for all to authenticated using (
  organisation_id=public.current_organisation_id() and public.is_internal_user() and
  case when case_id is not null then public.can_modify_case(case_id)
    else public.can_access_branch(branch_id) or (branch_id is null and assigned_to=auth.uid()) end)
with check (organisation_id=public.current_organisation_id() and public.is_internal_user() and
  case when case_id is not null then public.can_modify_case(case_id)
    else public.can_access_branch(branch_id) or (branch_id is null and assigned_to=auth.uid()) end);

create function private.prepare_task() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare target public.profiles; target_branch uuid; target_client uuid;
begin
  if auth.uid() is null then return new; end if;
  if not public.is_internal_user() or not private.function_allowed('work') then
    raise exception 'Task access is not enabled' using errcode='42501'; end if;
  new.title=btrim(new.title);
  if length(new.title) not between 1 and 250 or length(coalesce(new.description,''))>10000 then
    raise exception 'Enter a task title up to 250 characters and description up to 10000 characters' using errcode='22023'; end if;
  if new.priority not in ('low','medium','high','critical') or new.status not in ('open','completed') then
    raise exception 'Invalid task priority or status' using errcode='22023'; end if;
  if tg_op='INSERT' then
    new.created_by=auth.uid(); new.assigned_by=auth.uid(); new.created_at=clock_timestamp();
    new.assigned_to=coalesce(new.assigned_to,auth.uid());
  else
    if new.organisation_id is distinct from old.organisation_id or new.case_id is distinct from old.case_id
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Task ownership cannot be rewritten' using errcode='42501'; end if;
    new.assigned_by=case when new.assigned_to is distinct from old.assigned_to then auth.uid() else old.assigned_by end;
  end if;
  if tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to then
    select * into target from public.profiles where id=new.assigned_to and active and level<>'student' and organisation_id=new.organisation_id;
    if not found then raise exception 'Choose an active staff member in this organisation' using errcode='22023'; end if;
    if coalesce((target.function_access->>'work')::boolean,true)=false and target.level not in ('super_admin','platform_owner') then
      raise exception 'That staff member does not have Task access' using errcode='22023'; end if;
    if new.case_id is not null then
      select branch_id,client_id into target_branch,target_client from public.cases where id=new.case_id and organisation_id=new.organisation_id;
      if not found then raise exception 'Case unavailable' using errcode='42501'; end if;
      new.client_id=target_client;
    else target_branch=case when public.current_user_level() in ('super_admin','platform_owner') then target.branch_id else public.current_user_branch() end;
    end if;
    if target.level not in ('super_admin','platform_owner') and target.branch_id is distinct from target_branch then
      raise exception 'Choose a staff member in the case or task branch' using errcode='22023'; end if;
    new.branch_id=target_branch;
  elsif tg_op='UPDATE' then new.branch_id=old.branch_id; new.client_id=old.client_id;
  end if;
  if new.status='completed' then
    if tg_op='INSERT' or old.status is distinct from 'completed' then
      new.completed_at=clock_timestamp(); new.completed_by=auth.uid();
    else new.completed_at=old.completed_at; new.completed_by=old.completed_by; end if;
  else new.completed_at=null; new.completed_by=null; end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
revoke all on function private.prepare_task() from public, anon;
create trigger prepare_task before insert or update on public.tasks for each row execute function private.prepare_task();

-- Trigger is atomic with completion, covers old/new clients and sends once per transition.
create function private.notify_task_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare branch uuid; actor_name text;
begin
  if auth.uid() is null or new.completed_by is distinct from auth.uid() or
     new.status<>'completed' or old.status='completed' then return new; end if;
  select display_name into actor_name from public.profiles where id=auth.uid() and active and organisation_id=new.organisation_id and level<>'student';
  if not found then raise exception 'Completion actor unavailable' using errcode='42501'; end if;
  branch=new.branch_id;
  if new.case_id is not null then select branch_id into branch from public.cases where id=new.case_id; end if;
  insert into public.notifications(organisation_id,recipient_id,case_id,kind,title,body,action_url)
  select new.organisation_id,p.id,new.case_id,'task_completed','Task completed: '||new.title,
    actor_name||' completed this task.',case when new.case_id is not null then '/?case='||new.case_id::text||'&tab=tasks' else '/?module=work' end
  from public.profiles p where p.id in (new.assigned_by,new.created_by,new.assigned_to)
    and p.active and p.level<>'student' and p.organisation_id=new.organisation_id
    and (p.level in ('super_admin','platform_owner') or (p.branch_id=branch and coalesce((p.function_access->>'work')::boolean,true)));
  return new;
end $$;
revoke all on function private.notify_task_completed() from public, anon;
create trigger task_completed_notification after update on public.tasks for each row execute function private.notify_task_completed();

create table public.task_comments (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks on delete cascade,
 organisation_id uuid not null references public.organisations, author_id uuid not null references public.profiles,
 body text not null check(length(btrim(body)) between 1 and 5000), created_at timestamptz not null default clock_timestamp()
);
create index task_comments_task_created_idx on public.task_comments(task_id,created_at,id);
create index task_comments_author_idx on public.task_comments(author_id);
create index task_comments_org_idx on public.task_comments(organisation_id);
alter table public.task_comments enable row level security;
grant select,insert on public.task_comments to authenticated;
revoke all on public.task_comments from anon;
create policy task_comments_read on public.task_comments for select to authenticated using (
 organisation_id=public.current_organisation_id() and exists(select 1 from public.tasks t where t.id=task_id));
create policy task_comments_add on public.task_comments for insert to authenticated with check (
 organisation_id=public.current_organisation_id() and author_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id));

-- A small invoker RPC keeps edits, comments and optimistic concurrency transactional.
create function public.task_action(p_action text,p_id uuid,p_values jsonb default '{}',p_expected timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t public.tasks; c public.task_comments; result jsonb;
begin
 if auth.uid() is null or not public.is_internal_user() or not private.function_allowed('work') then
   raise exception 'Task access is not enabled' using errcode='42501'; end if;
 if p_action='create' then
   select * into t from public.tasks where id=p_id;
   if found then
     if t.created_by<>auth.uid() then raise exception 'Task ID unavailable' using errcode='42501'; end if;
     return to_jsonb(t);
   end if;
   insert into public.tasks(id,organisation_id,case_id,title,description,assigned_to,priority,task_type,due_at)
   values(p_id,public.current_organisation_id(),nullif(p_values->>'caseId','')::uuid,p_values->>'title',nullif(p_values->>'description',''),
    coalesce(nullif(p_values->>'assignedTo','')::uuid,auth.uid()),coalesce(p_values->>'priority','medium'),
    coalesce(p_values->>'taskType','case_work'),nullif(p_values->>'due','')::timestamptz) returning * into t;
   return to_jsonb(t);
 end if;
 select * into t from public.tasks where id=p_id for update;
 if not found then raise exception 'Task unavailable' using errcode='42501'; end if;
 if p_action='comment' then
   select * into c from public.task_comments where id=(p_values->>'id')::uuid;
   if found then
     if c.task_id<>p_id or c.author_id<>auth.uid() then raise exception 'Comment ID unavailable' using errcode='42501'; end if;
     return to_jsonb(c);
   end if;
   insert into public.task_comments(id,task_id,organisation_id,author_id,body)
   values((p_values->>'id')::uuid,t.id,t.organisation_id,auth.uid(),btrim(p_values->>'body')) returning * into c;
   insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,case_id,summary)
   values(t.organisation_id,auth.uid(),'task.comment_added','task',t.id::text,t.case_id,'Added a task comment');
   return to_jsonb(c);
 end if;
 if p_expected is null or t.updated_at is distinct from p_expected then
   raise exception 'This task changed. Refresh and try again.' using errcode='40001'; end if;
 if p_action='delete' then delete from public.tasks where id=t.id; return jsonb_build_object('id',t.id); end if;
 if p_action='status' then
   update public.tasks set status=p_values->>'status' where id=t.id returning * into t;
 elsif p_action='edit' then
   update public.tasks set title=p_values->>'title',description=nullif(p_values->>'description',''),
    assigned_to=coalesce(nullif(p_values->>'assignedTo','')::uuid,auth.uid()),priority=p_values->>'priority',
    task_type=coalesce(p_values->>'taskType',task_type),due_at=nullif(p_values->>'due','')::timestamptz
   where id=t.id returning * into t;
 else raise exception 'Unknown task action' using errcode='22023'; end if;
 return to_jsonb(t);
end $$;
revoke all on function public.task_action(text,uuid,jsonb,timestamptz) from public, anon;
grant execute on function public.task_action(text,uuid,jsonb,timestamptz) to authenticated;

-- Restrictive policies combine with (never replace) every existing branch/tenant policy.
-- The trigger also guards writes through older SECURITY DEFINER business functions.
create function private.guard_function_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null and public.current_user_level() is not null and not private.any_function_allowed(tg_argv) then
   raise exception 'This function is disabled for your account' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.guard_function_write() from public,anon;

create policy function_access on public.tasks as restrictive for all to authenticated using (private.any_function_allowed(array['work'])) with check (private.any_function_allowed(array['work']));
create trigger function_access_write before insert or update or delete on public.tasks for each row execute function private.guard_function_write('work');
create policy function_access on public.task_comments as restrictive for all to authenticated using (private.any_function_allowed(array['work'])) with check (private.any_function_allowed(array['work']));
create trigger function_access_write before insert or update or delete on public.task_comments for each row execute function private.guard_function_write('work');
create policy function_access on public.education_applications as restrictive for all to authenticated using (private.any_function_allowed(array['applications'])) with check (private.any_function_allowed(array['applications']));
create trigger function_access_write before insert or update or delete on public.education_applications for each row execute function private.guard_function_write('applications');
create policy function_access on public.visa_matters as restrictive for all to authenticated using (private.any_function_allowed(array['visas','direct_visas'])) with check (private.any_function_allowed(array['visas','direct_visas']));
create trigger function_access_write before insert or update or delete on public.visa_matters for each row execute function private.guard_function_write('visas','direct_visas');
create policy function_access on public.visa_history as restrictive for all to authenticated using (private.any_function_allowed(array['visas','direct_visas'])) with check (private.any_function_allowed(array['visas','direct_visas']));
create trigger function_access_write before insert or update or delete on public.visa_history for each row execute function private.guard_function_write('visas','direct_visas');
create policy function_access on public.documents as restrictive for all to authenticated using (private.any_function_allowed(array['documents'])) with check (private.any_function_allowed(array['documents']));
create trigger function_access_write before insert or update or delete on public.documents for each row execute function private.guard_function_write('documents');
create policy function_access on public.drive_jobs as restrictive for all to authenticated using (private.any_function_allowed(array['documents'])) with check (private.any_function_allowed(array['documents']));
create trigger function_access_write before insert or update or delete on public.drive_jobs for each row execute function private.guard_function_write('documents');
create policy function_access on public.case_checklist_items as restrictive for all to authenticated using (private.any_function_allowed(array['documents'])) with check (private.any_function_allowed(array['documents']));
create trigger function_access_write before insert or update or delete on public.case_checklist_items for each row execute function private.guard_function_write('documents');
create policy function_access on public.legacy_file_manifests as restrictive for all to authenticated using (private.any_function_allowed(array['documents'])) with check (private.any_function_allowed(array['documents']));
create trigger function_access_write before insert or update or delete on public.legacy_file_manifests for each row execute function private.guard_function_write('documents');
create policy function_access on public.mailbox_connections as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.mailbox_connections for each row execute function private.guard_function_write('communications');
create policy function_access on public.email_threads as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.email_threads for each row execute function private.guard_function_write('communications');
create policy function_access on public.email_messages as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.email_messages for each row execute function private.guard_function_write('communications');
create policy function_access on public.whatsapp_messages as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.whatsapp_messages for each row execute function private.guard_function_write('communications');
create policy function_access on public.sms_messages as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.sms_messages for each row execute function private.guard_function_write('communications');
create policy function_access on public.communication_campaigns as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.communication_campaigns for each row execute function private.guard_function_write('communications');
create policy function_access on public.campaign_recipients as restrictive for all to authenticated using (private.any_function_allowed(array['communications'])) with check (private.any_function_allowed(array['communications']));
create trigger function_access_write before insert or update or delete on public.campaign_recipients for each row execute function private.guard_function_write('communications');
create policy function_access on public.invoices as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.invoices for each row execute function private.guard_function_write('finance');
create policy function_access on public.payments as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.payments for each row execute function private.guard_function_write('finance');
create policy function_access on public.commission_claims as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.commission_claims for each row execute function private.guard_function_write('finance');
create policy function_access on public.commission_payments as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.commission_payments for each row execute function private.guard_function_write('finance');
create policy function_access on public.commission_receipts as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.commission_receipts for each row execute function private.guard_function_write('finance');
create policy function_access on public.credit_notes as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.credit_notes for each row execute function private.guard_function_write('finance');
create policy function_access on public.finance_requests as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.finance_requests for each row execute function private.guard_function_write('finance');
create policy function_access on public.invoice_reminders as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.invoice_reminders for each row execute function private.guard_function_write('finance');
create policy function_access on public.payment_receipts as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.payment_receipts for each row execute function private.guard_function_write('finance');
create policy function_access on public.reconciliation_runs as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.reconciliation_runs for each row execute function private.guard_function_write('finance');
create policy function_access on public.legacy_finance_line_items as restrictive for all to authenticated using (private.any_function_allowed(array['finance'])) with check (private.any_function_allowed(array['finance']));
create trigger function_access_write before insert or update or delete on public.legacy_finance_line_items for each row execute function private.guard_function_write('finance');
create policy function_access on public.appointments as restrictive for all to authenticated using (private.any_function_allowed(array['calendar'])) with check (private.any_function_allowed(array['calendar']));
create trigger function_access_write before insert or update or delete on public.appointments for each row execute function private.guard_function_write('calendar');
create policy function_access on public.content_templates as restrictive for all to authenticated using (private.any_function_allowed(array['templates'])) with check (private.any_function_allowed(array['templates']));
create trigger function_access_write before insert or update or delete on public.content_templates for each row execute function private.guard_function_write('templates');
create policy function_access on public.email_templates as restrictive for all to authenticated using (private.any_function_allowed(array['templates'])) with check (private.any_function_allowed(array['templates']));
create trigger function_access_write before insert or update or delete on public.email_templates for each row execute function private.guard_function_write('templates');
create policy function_access on public.document_checklist_templates as restrictive for all to authenticated using (private.any_function_allowed(array['templates'])) with check (private.any_function_allowed(array['templates']));
create trigger function_access_write before insert or update or delete on public.document_checklist_templates for each row execute function private.guard_function_write('templates');
create policy function_access on public.workflow_templates as restrictive for all to authenticated using (private.any_function_allowed(array['workflows'])) with check (private.any_function_allowed(array['workflows']));
create trigger function_access_write before insert or update or delete on public.workflow_templates for each row execute function private.guard_function_write('workflows');
create policy function_access on public.workflow_stages as restrictive for all to authenticated using (private.any_function_allowed(array['workflows'])) with check (private.any_function_allowed(array['workflows']));
create trigger function_access_write before insert or update or delete on public.workflow_stages for each row execute function private.guard_function_write('workflows');
create policy function_access on public.ai_interactions as restrictive for all to authenticated using (private.any_function_allowed(array['ai'])) with check (private.any_function_allowed(array['ai']));
create trigger function_access_write before insert or update or delete on public.ai_interactions for each row execute function private.guard_function_write('ai');
create policy function_access on public.ai_action_proposals as restrictive for all to authenticated using (private.any_function_allowed(array['ai'])) with check (private.any_function_allowed(array['ai']));
create trigger function_access_write before insert or update or delete on public.ai_action_proposals for each row execute function private.guard_function_write('ai');
create policy function_access on public.ai_citations as restrictive for all to authenticated using (private.any_function_allowed(array['ai'])) with check (private.any_function_allowed(array['ai']));
create trigger function_access_write before insert or update or delete on public.ai_citations for each row execute function private.guard_function_write('ai');
create policy function_access on public.integration_connections as restrictive for all to authenticated using (private.any_function_allowed(array['integrations'])) with check (private.any_function_allowed(array['integrations']));
create trigger function_access_write before insert or update or delete on public.integration_connections for each row execute function private.guard_function_write('integrations');
create policy function_access on public.integration_jobs as restrictive for all to authenticated using (private.any_function_allowed(array['integrations'])) with check (private.any_function_allowed(array['integrations']));
create trigger function_access_write before insert or update or delete on public.integration_jobs for each row execute function private.guard_function_write('integrations');
create policy function_access on public.webhook_events as restrictive for all to authenticated using (private.any_function_allowed(array['integrations'])) with check (private.any_function_allowed(array['integrations']));
create trigger function_access_write before insert or update or delete on public.webhook_events for each row execute function private.guard_function_write('integrations');
create policy function_access on public.course_source_registry as restrictive for all to authenticated using (private.any_function_allowed(array['integrations'])) with check (private.any_function_allowed(array['integrations']));
create trigger function_access_write before insert or update or delete on public.course_source_registry for each row execute function private.guard_function_write('integrations');
create policy function_access on public.course_catalog_sync_runs as restrictive for all to authenticated using (private.any_function_allowed(array['integrations'])) with check (private.any_function_allowed(array['integrations']));
create trigger function_access_write before insert or update or delete on public.course_catalog_sync_runs for each row execute function private.guard_function_write('integrations');
create policy function_access on public.institutions as restrictive for all to authenticated using (private.any_function_allowed(array['courseFinder'])) with check (private.any_function_allowed(array['courseFinder']));
create trigger function_access_write before insert or update or delete on public.institutions for each row execute function private.guard_function_write('courseFinder');
create policy function_access on public.courses as restrictive for all to authenticated using (private.any_function_allowed(array['courseFinder'])) with check (private.any_function_allowed(array['courseFinder']));
create trigger function_access_write before insert or update or delete on public.courses for each row execute function private.guard_function_write('courseFinder');
create policy function_access on public.backup_runs as restrictive for all to authenticated using (private.any_function_allowed(array['compliance'])) with check (private.any_function_allowed(array['compliance']));
create trigger function_access_write before insert or update or delete on public.backup_runs for each row execute function private.guard_function_write('compliance');
create policy function_access on public.restore_drills as restrictive for all to authenticated using (private.any_function_allowed(array['compliance'])) with check (private.any_function_allowed(array['compliance']));
create trigger function_access_write before insert or update or delete on public.restore_drills for each row execute function private.guard_function_write('compliance');
create policy function_access on public.operational_checks as restrictive for all to authenticated using (private.any_function_allowed(array['compliance'])) with check (private.any_function_allowed(array['compliance']));
create trigger function_access_write before insert or update or delete on public.operational_checks for each row execute function private.guard_function_write('compliance');
create policy function_access on public.operational_incidents as restrictive for all to authenticated using (private.any_function_allowed(array['compliance'])) with check (private.any_function_allowed(array['compliance']));
create trigger function_access_write before insert or update or delete on public.operational_incidents for each row execute function private.guard_function_write('compliance');
create policy function_access on public.data_retention_rules as restrictive for all to authenticated using (private.any_function_allowed(array['compliance'])) with check (private.any_function_allowed(array['compliance']));
create trigger function_access_write before insert or update or delete on public.data_retention_rules for each row execute function private.guard_function_write('compliance');
create policy function_access on public.login_activity as restrictive for all to authenticated using (private.any_function_allowed(array['compliance'])) with check (private.any_function_allowed(array['compliance']));
create trigger function_access_write before insert or update or delete on public.login_activity for each row execute function private.guard_function_write('compliance');
create policy function_access on public.staff_invitations as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.staff_invitations for each row execute function private.guard_function_write('administration');
create policy function_access on public.organisation_settings as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.organisation_settings for each row execute function private.guard_function_write('administration');
create policy function_access on public.import_batches as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.import_batches for each row execute function private.guard_function_write('administration');
create policy function_access on public.import_rows as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.import_rows for each row execute function private.guard_function_write('administration');
create policy function_access on public.legacy_external_keys as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.legacy_external_keys for each row execute function private.guard_function_write('administration');
create policy function_access on public.legacy_master_records as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.legacy_master_records for each row execute function private.guard_function_write('administration');
create policy function_access on public.legacy_record_snapshots as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.legacy_record_snapshots for each row execute function private.guard_function_write('administration');
create policy function_access on public.legacy_staff_directory as restrictive for all to authenticated using (private.any_function_allowed(array['administration'])) with check (private.any_function_allowed(array['administration']));
create trigger function_access_write before insert or update or delete on public.legacy_staff_directory for each row execute function private.guard_function_write('administration');
create policy function_access on public.enquiries as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries'])) with check (private.any_function_allowed(array['enquiries']));
create trigger function_access_write before insert or update or delete on public.enquiries for each row execute function private.guard_function_write('enquiries');
create policy function_access on public.public_intake_links as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries'])) with check (private.any_function_allowed(array['enquiries']));
create trigger function_access_write before insert or update or delete on public.public_intake_links for each row execute function private.guard_function_write('enquiries');
create policy function_access on public.dependants as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.dependants for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.client_consents as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.client_consents for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.client_declarations as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.client_declarations for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.client_education_history as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.client_education_history for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.client_employment_history as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.client_employment_history for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.english_tests as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.english_tests for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.study_preferences as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.study_preferences for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.case_notes as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.case_notes for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.case_collaborators as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.case_collaborators for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.case_stage_history as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.case_stage_history for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.case_lifecycle_events as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.case_lifecycle_events for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.legacy_activity_events as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.legacy_activity_events for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.service_agreements as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete']));
create trigger function_access_write before insert or update or delete on public.service_agreements for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete');
create policy function_access on public.cases as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar']));
create trigger function_access_write before insert or update or delete on public.cases for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar');
create policy function_access on public.clients as restrictive for all to authenticated using (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar'])) with check (private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar']));
create trigger function_access_write before insert or update or delete on public.clients for each row execute function private.guard_function_write('enquiries','students','applications','visas','direct_visas','defer','case_complete','work','documents','finance','communications','calendar');
create trigger function_access_write before insert or update or delete on public.profiles for each row execute function private.guard_function_write('administration');
create trigger function_access_write before insert or update or delete on public.roles for each row execute function private.guard_function_write('administration');
create trigger function_access_write before insert or update or delete on public.permissions for each row execute function private.guard_function_write('administration');
create trigger function_access_write before insert or update or delete on public.profile_roles for each row execute function private.guard_function_write('administration');
create trigger function_access_write before insert or update or delete on public.branches for each row execute function private.guard_function_write('administration');
create trigger function_access_write before insert or update or delete on public.organisations for each row execute function private.guard_function_write('administration');
create trigger function_access_write before insert or update or delete on public.client_user_links for each row execute function private.guard_function_write('administration');

create function public.task_bulk_action(p_items jsonb,p_operation text,p_assignee uuid default null) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; t public.tasks;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 or p_operation not in ('completed','open','delete','assign') then
  raise exception 'Choose 1–50 tasks and a valid operation' using errcode='22023'; end if;
 -- Stable lock order avoids deadlocks across overlapping bulk selections.
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
  if p_operation='assign' then
   if p_assignee is null then raise exception 'Choose an assignee' using errcode='22023';end if;
   select * into t from public.tasks where id=(item->>'id')::uuid;
   perform public.task_action('edit',(item->>'id')::uuid,jsonb_build_object('title',t.title,'description',t.description,'assignedTo',p_assignee,'priority',t.priority,'taskType',t.task_type,'due',t.due_at),(item->>'expected')::timestamptz);
  else
  perform public.task_action(case when p_operation='delete' then 'delete' else 'status' end,
   (item->>'id')::uuid,jsonb_build_object('status',p_operation),(item->>'expected')::timestamptz);
  end if;
 end loop;
end $$;
revoke all on function public.task_bulk_action(jsonb,text,uuid) from public,anon;
grant execute on function public.task_bulk_action(jsonb,text,uuid) to authenticated;

-- A task-only/document-only account can use case context, but cannot edit a case.
create function private.stage_function(p_stage text,p_service text) returns text
language sql immutable security invoker set search_path='' as $$
 select case p_stage when 'student' then 'students' when 'application' then 'applications'
 when 'visa' then case when p_service='direct_visa' then 'direct_visas' else 'visas' end
 when 'deferred' then 'defer' when 'completed' then 'case_complete' else 'enquiries' end
$$;
revoke all on function private.stage_function(text,text) from public,anon;
grant execute on function private.stage_function(text,text) to authenticated;
create function private.guard_case_function() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or public.current_user_level()='student' then
  if tg_op='DELETE' then return old;end if;return new;
 end if;
 if tg_op<>'INSERT' and not private.function_allowed(private.stage_function(old.lifecycle_stage::text,old.service_type)) then
  raise exception 'This case function is disabled for your account' using errcode='42501';end if;
 if tg_op<>'DELETE' and not private.function_allowed(private.stage_function(new.lifecycle_stage::text,new.service_type)) then
  raise exception 'The destination case function is disabled for your account' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.guard_case_function() from public,anon;
create trigger case_function_write before insert or update or delete on public.cases for each row execute function private.guard_case_function();

-- Search must honor course visibility just like the table endpoint.
alter function public.search_course_catalog(text,text,text,uuid,integer,integer) security invoker;

-- Audit history must not reveal details of a disabled function.
create function private.resource_function_allowed(p_resource text) returns boolean
language sql stable security invoker set search_path='' as $$
 select case
 when p_resource ~* 'invoice|payment|commission|credit|finance|reconcil' then private.function_allowed('finance')
 when p_resource ~* 'mail|message|campaign|communication' then private.function_allowed('communications')
 when p_resource ~* 'document|checklist' then private.function_allowed('documents')
 when p_resource ~* 'application' then private.function_allowed('applications')
 when p_resource ~* 'visa' then private.any_function_allowed(array['visas','direct_visas'])
 when p_resource ~* 'task' then private.function_allowed('work')
 when p_resource ~* 'appointment|calendar' then private.function_allowed('calendar')
 when p_resource ~* 'staff|profile|role|permission|setting|branch' then private.function_allowed('administration')
 when p_resource ~* 'integration' then private.function_allowed('integrations')
 when p_resource ~* 'template' then private.function_allowed('templates')
 when p_resource ~* 'workflow' then private.function_allowed('workflows')
 when p_resource ~* '^ai' then private.function_allowed('ai')
 else private.any_function_allowed(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','compliance']) end
$$;
revoke all on function private.resource_function_allowed(text) from public,anon;
grant execute on function private.resource_function_allowed(text) to authenticated;
create policy audit_function_read on public.audit_events as restrictive for select to authenticated
 using(private.resource_function_allowed(resource_type));
create policy legacy_function_read on public.legacy_activity_events as restrictive for select to authenticated
 using(private.resource_function_allowed(source_entity_type));

create function private.prepare_task_comment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to add a comment' using errcode='42501';end if;
 new.author_id=auth.uid(); new.created_at=clock_timestamp(); return new;
end $$;
revoke all on function private.prepare_task_comment() from public,anon;
create trigger prepare_task_comment before insert on public.task_comments for each row execute function private.prepare_task_comment();
