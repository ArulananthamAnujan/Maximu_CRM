-- Workspace and action permissions extend existing access objects; null retains role defaults.
begin;
alter table public.profiles add column if not exists staff_details jsonb not null default '{}'::jsonb;
alter table public.staff_invitations add column if not exists staff_details jsonb not null default '{}'::jsonb;

create or replace function private.valid_function_access(p_access jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_access is null or (jsonb_typeof(p_access)='object' and not exists(
 select 1 from jsonb_each(case when jsonb_typeof(p_access)='object' then p_access else '{}'::jsonb end) e
 where jsonb_typeof(e.value)<>'boolean' or e.key<>all(array['dashboard','enquiries','students','applications','visas','direct_visas','defer','case_complete','work','calendar','documents','communications','courseFinder','finance','reports','templates','workflows','compliance','ai','administration','integrations','view_applications','all_applications','partner_access','student_documents','whatsapp','action_delete','action_bulk_delete','action_export','action_assign','action_send_email','action_send_sms','action_send_whatsapp','study_access','direct_visa_access','special_access','study.dashboard','study.enquiries','study.students','study.applications','study.visas','study.direct_visas','study.defer','study.case_complete','study.work','study.calendar','study.documents','study.communications','study.courseFinder','study.finance','study.reports','study.templates','study.workflows','study.compliance','study.ai','study.administration','study.integrations','study.view_applications','study.all_applications','study.partner_access','study.student_documents','study.whatsapp','direct_visa.dashboard','direct_visa.enquiries','direct_visa.students','direct_visa.applications','direct_visa.visas','direct_visa.direct_visas','direct_visa.defer','direct_visa.case_complete','direct_visa.work','direct_visa.calendar','direct_visa.documents','direct_visa.communications','direct_visa.courseFinder','direct_visa.finance','direct_visa.reports','direct_visa.templates','direct_visa.workflows','direct_visa.compliance','direct_visa.ai','direct_visa.administration','direct_visa.integrations','direct_visa.view_applications','direct_visa.all_applications','direct_visa.partner_access','direct_visa.student_documents','direct_visa.whatsapp'])))
$$;

-- Pure evaluator shared by row policies and the authenticated profile lookup.
create function private.access_allows(p_level text,p_access jsonb,p_key text,p_mode text default null)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text:=p_key; mode text:=p_mode; parent_key text;
begin
 if p_level in ('super_admin','platform_owner','student') then return true; end if;
 if k<>all(array['dashboard','enquiries','students','applications','visas','direct_visas','defer','case_complete','work','calendar','documents','communications','courseFinder','finance','reports','templates','workflows','compliance','ai','administration','integrations','view_applications','all_applications','partner_access','student_documents','whatsapp','action_delete','action_bulk_delete','action_export','action_assign','action_send_email','action_send_sms','action_send_whatsapp','study_access','direct_visa_access','special_access','study.dashboard','study.enquiries','study.students','study.applications','study.visas','study.direct_visas','study.defer','study.case_complete','study.work','study.calendar','study.documents','study.communications','study.courseFinder','study.finance','study.reports','study.templates','study.workflows','study.compliance','study.ai','study.administration','study.integrations','study.view_applications','study.all_applications','study.partner_access','study.student_documents','study.whatsapp','direct_visa.dashboard','direct_visa.enquiries','direct_visa.students','direct_visa.applications','direct_visa.visas','direct_visa.direct_visas','direct_visa.defer','direct_visa.case_complete','direct_visa.work','direct_visa.calendar','direct_visa.documents','direct_visa.communications','direct_visa.courseFinder','direct_visa.finance','direct_visa.reports','direct_visa.templates','direct_visa.workflows','direct_visa.compliance','direct_visa.ai','direct_visa.administration','direct_visa.integrations','direct_visa.view_applications','direct_visa.all_applications','direct_visa.partner_access','direct_visa.student_documents','direct_visa.whatsapp']) then return false; end if;
 if k in ('study_access','direct_visa_access','special_access') then return coalesce((p_access->>k)::boolean,true); end if;
 if k=any(array['action_delete','action_bulk_delete','action_export','action_assign','action_send_email','action_send_sms','action_send_whatsapp']) then return coalesce((p_access->>'special_access')::boolean,true)
 and coalesce((p_access->>k)::boolean,true) and (k<>'action_bulk_delete' or coalesce((p_access->>'action_delete')::boolean,true)); end if;
 if strpos(k,'.')>0 then mode:=split_part(k,'.',1); k:=split_part(k,'.',2); end if;
 if k='integrations' or (k in ('administration','partner_access') and p_level not in ('branch_admin','manager')) then return false; end if;
 if not coalesce((p_access->>k)::boolean,true) then return false; end if;
 if mode is null then return private.access_allows(p_level,p_access,k,'study') or private.access_allows(p_level,p_access,k,'direct_visa'); end if;
 mode:=case when mode='direct_visa' then 'direct_visa' else 'study' end;
 if not coalesce((p_access->>(case mode when 'study' then 'study_access' else 'direct_visa_access' end))::boolean,true)
 or not coalesce((p_access->>(mode||'.'||k))::boolean,true) then return false; end if;
 parent_key:=case k when 'view_applications' then 'applications' when 'all_applications' then 'view_applications'
 when 'partner_access' then 'administration' when 'student_documents' then 'documents' when 'whatsapp' then 'communications' end;
 return parent_key is null or private.access_allows(p_level,p_access,parent_key,mode);
end $$;
revoke all on function private.access_allows(text,jsonb,text,text) from public,anon;
grant execute on function private.access_allows(text,jsonb,text,text) to authenticated;
create or replace function private.function_allowed(p_key text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select active and private.access_allows(level::text,function_access,p_key) from public.profiles where id=(select auth.uid())),false)
$$;

-- The caller's workspace choice is not trusted to decide which records they may read.
-- Determine that from each stored case, in addition to existing organisation/branch policies.
create function private.case_module_allowed(p_case uuid,p_key text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p.active and p.organisation_id=c.organisation_id
 and private.access_allows(p.level::text,p.function_access,p_key,c.service_type)
 from public.profiles p join public.cases c on c.id=p_case where p.id=(select auth.uid())),false)
$$;
revoke all on function private.case_module_allowed(uuid,text) from public,anon;
grant execute on function private.case_module_allowed(uuid,text) to authenticated;
create function private.case_workspace_allowed(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p.active and p.organisation_id=c.organisation_id and
 private.access_allows(p.level::text,p.function_access,case when c.service_type='direct_visa' then 'direct_visa_access' else 'study_access' end)
 from public.profiles p join public.cases c on c.id=p_case where p.id=(select auth.uid())),false)
$$;
revoke all on function private.case_workspace_allowed(uuid) from public,anon;
grant execute on function private.case_workspace_allowed(uuid) to authenticated;

create function private.case_row_allowed(p_service text,p_stage text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p.active and private.access_allows(p.level::text,p.function_access,
 case p_stage when 'student' then case when p_service='direct_visa' then 'direct_visas' else 'students' end
 when 'application' then 'applications' when 'visa' then 'visas' when 'deferred' then 'defer' when 'completed' then 'case_complete' else 'enquiries' end,p_service)
 from public.profiles p where id=(select auth.uid())),false)
$$;
revoke all on function private.case_row_allowed(text,text) from public,anon;
grant execute on function private.case_row_allowed(text,text) to authenticated;
create or replace function public.can_access_case(target_case uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cases c where c.id=target_case and c.organisation_id=public.current_organisation_id() and (
 public.current_user_level()::text in ('platform_owner','super_admin')
 or (public.is_internal_user() and c.branch_id=public.current_user_branch() and private.case_workspace_allowed(c.id) and private.case_row_allowed(c.service_type,c.lifecycle_stage::text))
 or (public.current_user_level()='student' and exists(select 1 from public.client_user_links l where l.profile_id=auth.uid() and l.client_id=c.client_id))))
$$;
create or replace function public.can_modify_case(target_case uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_internal_user() and public.can_access_case(target_case)
$$;
create or replace function public.can_access_client(target_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clients c where c.id=target_client and c.organisation_id=public.current_organisation_id() and (
 public.current_user_level()::text in ('platform_owner','super_admin')
 or (public.is_internal_user() and c.branch_id=public.current_user_branch() and
 (exists(select 1 from public.cases f where f.client_id=c.id and public.can_access_case(f.id))
 or (not exists(select 1 from public.cases f where f.client_id=c.id) and private.function_allowed('enquiries'))))
 or (public.current_user_level()='student' and exists(select 1 from public.client_user_links l where l.profile_id=auth.uid() and l.client_id=c.id))))
$$;

-- Existing case creation is allowed without requiring the new row to be queryable yet.

alter policy function_access on public.cases using(private.case_row_allowed(service_type,lifecycle_stage::text)) with check(private.case_row_allowed(service_type,lifecycle_stage::text));

-- All applications controls branch-wide application visibility; View applications
-- with it disabled limits the list to cases the caller owns or collaborates on.
create function private.application_visible(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.case_module_allowed(p_case,'view_applications') and (
 private.case_module_allowed(p_case,'all_applications') or exists(select 1 from public.cases c where c.id=p_case and c.owner_id=auth.uid())
 or exists(select 1 from public.case_collaborators m where m.case_id=p_case and m.profile_id=auth.uid()))
$$;
revoke all on function private.application_visible(uuid) from public,anon;
grant execute on function private.application_visible(uuid) to authenticated;
alter policy function_access on public.education_applications using(private.application_visible(case_id)) with check(private.case_module_allowed(case_id,'applications'));
alter policy function_access on public.documents using(private.case_module_allowed(case_id,'student_documents') or (case_id is null and private.function_allowed('student_documents'))) with check(private.case_module_allowed(case_id,'student_documents') or (case_id is null and private.function_allowed('student_documents')));

-- Row triggers cover old RPCs that use SECURITY DEFINER, and direct table writes.
create function private.guard_permission_actions() returns trigger
language plpgsql security invoker set search_path='' as $$
declare data jsonb; before_data jsonb; k text; ref uuid; mode text; channel text; assigned text;
begin
 if auth.uid() is null or public.current_user_level() is null then
   if tg_op='DELETE' then return old; end if; return new;
 end if;
 data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 before_data:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 if tg_op='DELETE' or (tg_op='UPDATE' and ((data->>'archived_at' is not null and before_data->>'archived_at' is null)
 or (tg_table_name='invoices' and data->>'state'='void' and before_data->>'state' is distinct from 'void'))) then
 if not private.function_allowed('action_delete') then raise exception 'Delete permission is disabled' using errcode='42501'; end if;
 end if;
 foreach assigned in array array['assigned_to','owner_id','agent_id'] loop
 if data ? assigned and nullif(data->>assigned,'') is not null and
 ((tg_op='INSERT' and data->>assigned<>auth.uid()::text) or (tg_op='UPDATE' and data->>assigned is distinct from before_data->>assigned))
 and not private.function_allowed('action_assign') then raise exception 'Assign permission is disabled' using errcode='42501'; end if;
 end loop;
 if tg_table_name='case_collaborators' and not private.function_allowed('action_assign') then raise exception 'Assign permission is disabled' using errcode='42501'; end if;
 if tg_table_name='cases' then
   if not private.case_row_allowed(data->>'service_type',data->>'lifecycle_stage')
   or (tg_op='UPDATE' and not private.case_row_allowed(before_data->>'service_type',before_data->>'lifecycle_stage')) then
     raise exception 'This case section is disabled for your account' using errcode='42501'; end if;
 end if;
 if tg_table_name in ('email_messages','whatsapp_messages','sms_messages','communication_campaigns') and tg_op<>'DELETE' then
   channel:=case tg_table_name when 'whatsapp_messages' then 'whatsapp' when 'sms_messages' then 'sms' when 'email_messages' then 'email' else data->>'channel' end;
   if (coalesce(data->>'direction','outbound')='outbound') and not private.function_allowed('action_send_'||channel) then
     raise exception 'Sending through this channel is disabled' using errcode='42501'; end if;
 end if;
 if tg_table_name='audit_events' and data->>'action' like '%export%' and not private.function_allowed('action_export') then
 raise exception 'Export permission is disabled' using errcode='42501'; end if;
 if tg_table_name='profiles' and data->>'level'='partner' and not private.function_allowed('partner_access') then
 raise exception 'Partner access is disabled' using errcode='42501'; end if;
 if tg_nargs>0 then
 k:=tg_argv[0]; ref:=nullif(data->>'case_id','')::uuid;
 if ref is not null then
   if not private.case_module_allowed(ref,k) then raise exception 'This case function is disabled for your account' using errcode='42501'; end if;
 elsif not private.function_allowed(k) then raise exception 'This function is disabled for your account' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.guard_permission_actions() from public,anon;
alter policy function_access on public.tasks using((case_id is not null and private.case_module_allowed(case_id,'work')) or (case_id is null and private.function_allowed('work'))) with check((case_id is not null and private.case_module_allowed(case_id,'work')) or (case_id is null and private.function_allowed('work')));
create trigger permission_actions before insert or update or delete on public.tasks for each row execute function private.guard_permission_actions('work');
create trigger permission_actions before insert or update or delete on public.education_applications for each row execute function private.guard_permission_actions('applications');
alter policy function_access on public.visa_matters using((case_id is not null and private.case_module_allowed(case_id,'visas')) or (case_id is null and private.function_allowed('visas'))) with check((case_id is not null and private.case_module_allowed(case_id,'visas')) or (case_id is null and private.function_allowed('visas')));
create trigger permission_actions before insert or update or delete on public.visa_matters for each row execute function private.guard_permission_actions('visas');
create trigger permission_actions before insert or update or delete on public.documents for each row execute function private.guard_permission_actions('student_documents');
alter policy function_access on public.invoices using((case_id is not null and private.case_module_allowed(case_id,'finance')) or (case_id is null and private.function_allowed('finance'))) with check((case_id is not null and private.case_module_allowed(case_id,'finance')) or (case_id is null and private.function_allowed('finance')));
create trigger permission_actions before insert or update or delete on public.invoices for each row execute function private.guard_permission_actions('finance');
alter policy function_access on public.case_checklist_items using((case_id is not null and private.case_module_allowed(case_id,'student_documents')) or (case_id is null and private.function_allowed('student_documents'))) with check((case_id is not null and private.case_module_allowed(case_id,'student_documents')) or (case_id is null and private.function_allowed('student_documents')));
create trigger permission_actions before insert or update or delete on public.case_checklist_items for each row execute function private.guard_permission_actions('student_documents');
alter policy function_access on public.email_threads using((case_id is not null and private.case_module_allowed(case_id,'communications')) or (case_id is null and private.function_allowed('communications'))) with check((case_id is not null and private.case_module_allowed(case_id,'communications')) or (case_id is null and private.function_allowed('communications')));
create trigger permission_actions before insert or update or delete on public.email_threads for each row execute function private.guard_permission_actions('communications');
alter policy function_access on public.whatsapp_messages using((case_id is not null and private.case_module_allowed(case_id,'whatsapp')) or (case_id is null and private.function_allowed('whatsapp'))) with check((case_id is not null and private.case_module_allowed(case_id,'whatsapp')) or (case_id is null and private.function_allowed('whatsapp')));
create trigger permission_actions before insert or update or delete on public.whatsapp_messages for each row execute function private.guard_permission_actions('whatsapp');
alter policy function_access on public.sms_messages using((case_id is not null and private.case_module_allowed(case_id,'communications')) or (case_id is null and private.function_allowed('communications'))) with check((case_id is not null and private.case_module_allowed(case_id,'communications')) or (case_id is null and private.function_allowed('communications')));
create trigger permission_actions before insert or update or delete on public.sms_messages for each row execute function private.guard_permission_actions('communications');
create trigger permission_actions before insert or update or delete on public.cases for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.clients for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.enquiries for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.case_collaborators for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.appointments for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.email_messages for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.communication_campaigns for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.profiles for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.staff_invitations for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.audit_events for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.email_templates for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.document_checklist_templates for each row execute function private.guard_permission_actions();
create trigger permission_actions before insert or update or delete on public.workflow_templates for each row execute function private.guard_permission_actions();

create function private.guard_bulk_delete() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null and pg_trigger_depth()=1 and (select count(*) from deleted_rows)>1 and not private.function_allowed('action_bulk_delete') then
 raise exception 'Bulk delete permission is disabled' using errcode='42501'; end if; return null;
end $$;
revoke all on function private.guard_bulk_delete() from public,anon;
create trigger permission_bulk_delete after delete on public.tasks referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.documents referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.appointments referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.email_threads referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.email_messages referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.email_templates referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.document_checklist_templates referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.cases referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create trigger permission_bulk_delete after delete on public.clients referencing old table as deleted_rows for each statement execute function private.guard_bulk_delete();
create or replace function public.task_bulk_action(p_items jsonb,p_operation text,p_assignee uuid default null) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; t public.tasks;
begin
 if p_operation='delete' and not private.function_allowed('action_bulk_delete') then raise exception 'Bulk delete permission is disabled' using errcode='42501'; end if;

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

create or replace function private.claim_staff_invitation() returns public.profiles
language plpgsql security definer set search_path='' as $$
declare invitation public.staff_invitations; created public.profiles; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Not signed in' using errcode='42501'; end if;
 -- Serialize concurrent first requests for this account.
 perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
 select * into created from public.profiles where id=caller;
 if created.id is not null then return created; end if;
 invitation:=private.own_pending_invitation();
 if invitation.id is null then raise exception 'There is no verified invitation for this account' using errcode='P0002'; end if;
 perform 1 from public.staff_invitations where id=invitation.id for update;
 insert into public.profiles(id,organisation_id,branch_id,display_name,email,level,department,active,function_access,staff_details)
 values(caller,invitation.organisation_id,invitation.branch_id,coalesce(invitation.display_name,split_part(invitation.email,'@',1)),lower(invitation.email),
 coalesce(invitation.level,(select level from public.roles where id=invitation.role_id),'staff'::public.user_level),invitation.department,true,invitation.function_access,invitation.staff_details)
 returning * into created;
 if invitation.branch_id is not null then
 insert into public.profile_roles(profile_id,role_id,branch_id) values(caller,invitation.role_id,invitation.branch_id) on conflict do nothing;
 end if;
 update public.staff_invitations set status='accepted',accepted_at=now() where id=invitation.id;
 insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,after_data)
 values(invitation.organisation_id,caller,'staff.invitation_claimed','profile',caller::text,'Staff account activated from an invitation',jsonb_build_object('function_access',created.function_access,'level',created.level));
 return created;
end $$;

commit;
