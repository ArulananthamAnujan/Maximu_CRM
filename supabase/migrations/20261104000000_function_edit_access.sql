begin;
set local lock_timeout='2s';

-- Each section an account can use now carries two permissions: view and edit.
-- A view-only account reads a section's records and exports them, but every
-- write -- a new enquiry, a changed invoice, an uploaded document -- is refused
-- here in the database as well as at the API, so no screen can get around it.
--
-- Stored as "edit.<section>" and "<workspace>.edit.<section>" beside the
-- existing view keys. An absent key means edit is allowed, so every account
-- keeps exactly the access it had before this migration.

create or replace function private.known_access_key(p_key text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case
  when p_key = any(array['dashboard','enquiries','students','applications','visas','direct_visas','defer','case_complete','work','calendar','documents','communications','courseFinder','finance','reports','templates','workflows','compliance','ai','administration','integrations','view_applications','all_applications','partner_access','student_documents','whatsapp','action_transfer_branch','action_delete','action_bulk_delete','action_export','action_assign','action_send_email','action_send_sms','action_send_whatsapp','study_access','direct_visa_access','special_access','study.dashboard','study.enquiries','study.students','study.applications','study.visas','study.direct_visas','study.defer','study.case_complete','study.work','study.calendar','study.documents','study.communications','study.courseFinder','study.finance','study.reports','study.templates','study.workflows','study.compliance','study.ai','study.administration','study.integrations','study.view_applications','study.all_applications','study.partner_access','study.student_documents','study.whatsapp','direct_visa.dashboard','direct_visa.enquiries','direct_visa.students','direct_visa.applications','direct_visa.visas','direct_visa.direct_visas','direct_visa.defer','direct_visa.case_complete','direct_visa.work','direct_visa.calendar','direct_visa.documents','direct_visa.communications','direct_visa.courseFinder','direct_visa.finance','direct_visa.reports','direct_visa.templates','direct_visa.workflows','direct_visa.compliance','direct_visa.ai','direct_visa.administration','direct_visa.integrations','direct_visa.view_applications','direct_visa.all_applications','direct_visa.partner_access','direct_visa.student_documents','direct_visa.whatsapp']) then true
  when p_key ~ '^(study|direct_visa)\.edit\.' then split_part(p_key,'.',3) = any(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','finance','documents','templates','administration','work','calendar','communications','workflows','courseFinder'])
  when p_key ~ '^edit\.' then split_part(p_key,'.',2) = any(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','finance','documents','templates','administration','work','calendar','communications','workflows','courseFinder'])
  else false end
$$;
revoke all on function private.known_access_key(text) from public,anon;
grant execute on function private.known_access_key(text) to authenticated;

create or replace function private.valid_function_access(p_access jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_access is null or (jsonb_typeof(p_access)='object' and not exists(
 select 1 from jsonb_each(case when jsonb_typeof(p_access)='object' then p_access else '{}'::jsonb end) e
 where jsonb_typeof(e.value)<>'boolean' or not private.known_access_key(e.key)))
$$;

-- The section a case row belongs to, by stream and pipeline stage: the same
-- mapping row visibility uses (private.case_row_allowed), so edit never
-- disagrees with view.
create or replace function private.case_section(p_service text,p_stage text) returns text
language sql immutable security invoker set search_path='' as $$
 select case p_stage when 'student' then case when p_service='direct_visa' then 'direct_visas' else 'students' end
  when 'application' then 'applications' when 'visa' then 'visas' when 'deferred' then 'defer' when 'completed' then 'case_complete' else 'enquiries' end
$$;
revoke all on function private.case_section(text,text) from public,anon;
grant execute on function private.case_section(text,text) to authenticated;

-- Edit requires view; a section without its own edit permission is editable
-- whenever it is visible. Detail permissions resolve to the section they
-- belong to (student documents -> documents, WhatsApp -> communications).
create or replace function private.edit_allows(p_level text,p_access jsonb,p_key text,p_mode text default null)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text:=p_key; mode text:=p_mode; base text;
begin
 if p_level in ('super_admin','platform_owner','student') then return true; end if;
 if k ~ '^(study|direct_visa)\.' then mode:=split_part(k,'.',1); k:=substr(k,strpos(k,'.')+1); end if;
 if k like 'edit.%' then k:=substr(k,6); end if;
 if not private.access_allows(p_level,p_access,k,mode) then return false; end if;
 base:=case k when 'student_documents' then 'documents' when 'whatsapp' then 'communications'
  when 'view_applications' then 'applications' when 'all_applications' then 'applications' when 'partner_access' then 'administration' else k end;
 if base<>all(array['enquiries','students','applications','visas','direct_visas','defer','case_complete','finance','documents','templates','administration','work','calendar','communications','workflows','courseFinder']) then return true; end if;
 if not coalesce((p_access->>('edit.'||base))::boolean,true) then return false; end if;
 if mode is null then return private.edit_allows(p_level,p_access,base,'study') or private.edit_allows(p_level,p_access,base,'direct_visa'); end if;
 mode:=case when mode='direct_visa' then 'direct_visa' else 'study' end;
 return coalesce((p_access->>(mode||'.edit.'||base))::boolean,true);
end $$;
revoke all on function private.edit_allows(text,jsonb,text,text) from public,anon;
grant execute on function private.edit_allows(text,jsonb,text,text) to authenticated;

create or replace function private.access_allows(p_level text,p_access jsonb,p_key text,p_mode text default null)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare k text:=p_key; mode text:=p_mode; parent_key text;
begin
 if k like 'edit.%' or k ~ '^(study|direct_visa)\.edit\.' then return private.edit_allows(p_level,p_access,k,p_mode); end if;
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

create or replace function private.edit_allowed(p_key text,p_mode text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select active and private.edit_allows(level::text,function_access,p_key,p_mode) from public.profiles where id=(select auth.uid())),false)
$$;
revoke all on function private.edit_allowed(text,text) from public,anon;
grant execute on function private.edit_allowed(text,text) to authenticated;

create or replace function private.case_edit_allowed(p_case uuid,p_key text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p.active and p.organisation_id=c.organisation_id
  and private.edit_allows(p.level::text,p.function_access,coalesce(p_key,private.case_section(c.service_type,c.lifecycle_stage::text)),c.service_type)
  from public.profiles p join public.cases c on c.id=p_case where p.id=(select auth.uid())),false)
$$;
revoke all on function private.case_edit_allowed(uuid,text) from public,anon;
grant execute on function private.case_edit_allowed(uuid,text) to authenticated;

create or replace function private.guard_permission_actions() returns trigger
language plpgsql security invoker set search_path='' as $$
declare data jsonb; before_data jsonb; k text; ref uuid; mode text; channel text; assigned text; ek text; eref uuid;
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
 -- View-only access: reading a section is allowed, changing its records is not.
 if tg_table_name not in ('audit_events') then
   eref:=case when data ? 'case_id' then nullif(data->>'case_id','')::uuid end;
   if tg_table_name='cases' then
     if not private.edit_allowed(private.case_section(data->>'service_type',data->>'lifecycle_stage'),data->>'service_type')
     or (tg_op='UPDATE' and not private.edit_allowed(private.case_section(before_data->>'service_type',before_data->>'lifecycle_stage'),before_data->>'service_type')) then
       raise exception 'This section is view-only for your account' using errcode='42501'; end if;
   elsif tg_table_name='clients' then
     if not private.edit_allowed('enquiries') and not exists(select 1 from public.cases c where c.client_id=(data->>'id')::uuid and private.case_edit_allowed(c.id)) then
       raise exception 'This section is view-only for your account' using errcode='42501'; end if;
   elsif tg_table_name in ('enquiries','case_notes','case_collaborators') then
     if not (case when eref is not null then private.case_edit_allowed(eref) else private.edit_allowed('enquiries') end) then
       raise exception 'This section is view-only for your account' using errcode='42501'; end if;
   elsif tg_table_name='appointments' then ek:='calendar';
   elsif tg_table_name in ('email_templates','document_checklist_templates') then ek:='templates';
   elsif tg_table_name='workflow_templates' then ek:='workflows';
   elsif (tg_table_name='staff_invitations' and lower(coalesce(data->>'email','')) is distinct from (select lower(email) from public.profiles where id=auth.uid()))
      or (tg_table_name='profiles' and data->>'id' is distinct from auth.uid()::text) then ek:='administration';
   elsif tg_table_name in ('email_messages','communication_campaigns') then ek:='communications';
   elsif tg_nargs>0 then ek:=tg_argv[0];
   end if;
   if ek is not null and not (case when eref is not null then private.case_edit_allowed(eref,ek) else private.edit_allowed(ek) end) then
     raise exception 'This section is view-only for your account' using errcode='42501'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.guard_permission_actions() from public,anon;

-- File notes are case writes too.
drop trigger if exists permission_actions on public.case_notes;
create trigger permission_actions before insert or update or delete on public.case_notes for each row execute function private.guard_permission_actions();

commit;
