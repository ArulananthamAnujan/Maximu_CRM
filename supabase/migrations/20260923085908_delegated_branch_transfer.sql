begin;
set local lock_timeout='2s';
create or replace function private.valid_function_access(p_access jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_access is null or (jsonb_typeof(p_access)='object' and not exists(
 select 1 from jsonb_each(case when jsonb_typeof(p_access)='object' then p_access else '{}'::jsonb end) e
 where jsonb_typeof(e.value)<>'boolean' or e.key<>all(array['dashboard','enquiries','students','applications','visas','direct_visas','defer','case_complete','work','calendar','documents','communications','courseFinder','finance','reports','templates','workflows','compliance','ai','administration','integrations','view_applications','all_applications','partner_access','student_documents','whatsapp','action_transfer_branch','action_delete','action_bulk_delete','action_export','action_assign','action_send_email','action_send_sms','action_send_whatsapp','study_access','direct_visa_access','special_access','study.dashboard','study.enquiries','study.students','study.applications','study.visas','study.direct_visas','study.defer','study.case_complete','study.work','study.calendar','study.documents','study.communications','study.courseFinder','study.finance','study.reports','study.templates','study.workflows','study.compliance','study.ai','study.administration','study.integrations','study.view_applications','study.all_applications','study.partner_access','study.student_documents','study.whatsapp','direct_visa.dashboard','direct_visa.enquiries','direct_visa.students','direct_visa.applications','direct_visa.visas','direct_visa.direct_visas','direct_visa.defer','direct_visa.case_complete','direct_visa.work','direct_visa.calendar','direct_visa.documents','direct_visa.communications','direct_visa.courseFinder','direct_visa.finance','direct_visa.reports','direct_visa.templates','direct_visa.workflows','direct_visa.compliance','direct_visa.ai','direct_visa.administration','direct_visa.integrations','direct_visa.view_applications','direct_visa.all_applications','direct_visa.partner_access','direct_visa.student_documents','direct_visa.whatsapp'])))
$$;

create or replace function private.guard_function_access() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; invitation public.staff_invitations;
begin
 if tg_op='UPDATE' and new.function_access is not distinct from old.function_access then return new; end if;
 if not private.valid_function_access(new.function_access) then raise exception 'Invalid function access' using errcode='22023'; end if;
 select * into actor from public.profiles where id=auth.uid();
 if tg_op='INSERT' and actor.id is null then
   if new.function_access is null then return new; end if;
   invitation:=private.own_pending_invitation();
   if new.id=auth.uid() and invitation.id is not null
     and new.organisation_id=invitation.organisation_id and new.branch_id is not distinct from invitation.branch_id
     and new.level=coalesce(invitation.level,(select level from public.roles where id=invitation.role_id),'staff'::public.user_level)
     and lower(new.email)=lower(invitation.email) and new.function_access is not distinct from invitation.function_access then return new; end if;
   raise exception 'No matching staff invitation' using errcode='42501';
 end if;
 if tg_op='INSERT' and actor.active and actor.level in ('branch_admin','manager')
   and new.organisation_id=actor.organisation_id and new.branch_id=actor.branch_id and new.level in ('staff','partner') then
   -- Admins cannot create a second account to escape their own restrictions.
   if coalesce((new.function_access->>'action_transfer_branch')::boolean,false) then raise exception 'Only Super Admin can grant branch transfer permission' using errcode='42501'; end if;
   new.function_access:=coalesce(new.function_access,'{}'::jsonb) || coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(actor.function_access,'{}'::jsonb)) where value='false'::jsonb),'{}'::jsonb);
 elsif not coalesce(actor.active and actor.level in ('super_admin','platform_owner') and actor.organisation_id=new.organisation_id,false) then
   raise exception 'Only Super Admin can change function access' using errcode='42501';
 end if;
 if new.level in ('super_admin','platform_owner','student') and new.function_access is not null then
   raise exception 'Function access is managed for staff and admins only' using errcode='22023'; end if;
 insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,before_data,after_data)
 values(new.organisation_id,auth.uid(),'staff.function_access_changed','profile',new.id::text,'Set staff function access',
 case when tg_op='UPDATE' then jsonb_build_object('function_access',old.function_access) else null end,jsonb_build_object('function_access',new.function_access));
 return new;
end $$;

create or replace function private.guard_invitation_access() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; invitation public.staff_invitations;
begin
 if not private.valid_function_access(new.function_access) then raise exception 'Invalid function access' using errcode='22023'; end if;
 select * into actor from public.profiles where id=auth.uid();
 if actor.active and actor.level in ('super_admin','platform_owner') and actor.organisation_id=new.organisation_id then return new; end if;
 if tg_op='UPDATE' and new.status='accepted' and old.status='pending'
   and (to_jsonb(new)-array['status','accepted_at'])=(to_jsonb(old)-array['status','accepted_at']) then
   invitation:=private.own_pending_invitation();
   if invitation.id=old.id then return new; end if;
 end if;
 if actor.active and actor.level in ('branch_admin','manager') and actor.organisation_id=new.organisation_id
 and actor.branch_id=new.branch_id and new.level in ('staff','partner')
 and exists(select 1 from public.roles where id=new.role_id and organisation_id=actor.organisation_id and level in ('staff','partner')) then
   if tg_op='UPDATE' and new.function_access is distinct from old.function_access then raise exception 'Only Super Admin can change invitation access' using errcode='42501'; end if;
   if coalesce((new.function_access->>'action_transfer_branch')::boolean,false) then raise exception 'Only Super Admin can grant branch transfer permission' using errcode='42501'; end if;
   new.function_access:=coalesce(new.function_access,'{}'::jsonb) || coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(actor.function_access,'{}'::jsonb)) where value='false'::jsonb),'{}'::jsonb);
   return new;
 end if;
 raise exception 'Only Super Admin can set invitation access' using errcode='42501';
end $$;
create or replace function private.transfer_case_branch(
  p_case_id uuid, p_destination_branch_id uuid, p_expected_branch_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  subject public.cases;
  client_record public.clients;
  destination public.branches;
  source_name text;
  actor uuid := auth.uid();
  org uuid := public.current_organisation_id();
  move_client_branch boolean;
  actor_profile public.profiles;
begin
  select * into actor_profile from public.profiles where id=actor and active for share;
  if actor_profile.id is null or not public.is_internal_user() or not (
    actor_profile.level::text in ('platform_owner','super_admin') or
    (actor_profile.level::text in ('branch_admin','manager','staff','partner')
     and coalesce(actor_profile.function_access->>'action_transfer_branch'='true',false)
     and coalesce((actor_profile.function_access->>'special_access')::boolean,true))) then
    raise exception 'Super Admin must enable branch transfers for your account.' using errcode='42501';
  end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'Enter a transfer reason of up to 2,000 characters.' using errcode='22023';
  end if;
  select * into destination from public.branches
    where id=p_destination_branch_id and organisation_id=org and active=true for share;
  if not found then raise exception 'Choose an active branch in this organisation.' using errcode='22023'; end if;

  -- Lock the shared client first, then its case: simultaneous transfers of
  -- sibling cases cannot leave the home branch pointing at an empty branch.
  select * into subject from public.cases where id=p_case_id and organisation_id=org;
  if not found then raise exception 'That case is not available.' using errcode='42501'; end if;
  select * into client_record from public.clients where id=subject.client_id and organisation_id=org for update;
  if not found then raise exception 'The client profile is not available.' using errcode='42501'; end if;
  select * into subject from public.cases where id=p_case_id and organisation_id=org for update;
  if not found or subject.client_id<>client_record.id then
    raise exception 'The case changed. Refresh and try again.' using errcode='40001';
  end if;
  if not public.can_modify_case(subject.id) then
    raise exception 'That case is not available in your branch or enabled functions.' using errcode='42501';
  end if;
  if subject.branch_id is distinct from p_expected_branch_id then
    raise exception 'The case branch changed. Refresh before transferring it.' using errcode='40001';
  end if;
  if subject.branch_id=p_destination_branch_id then
    raise exception 'Choose a different destination branch.' using errcode='22023';
  end if;
  select name into source_name from public.branches where id=subject.branch_id and organisation_id=org;
  move_client_branch := client_record.branch_id is not distinct from subject.branch_id
    and not exists(select 1 from public.cases k where k.client_id=subject.client_id
      and k.id<>subject.id and k.branch_id is not distinct from subject.branch_id);

  update public.cases set branch_id=destination.id,
    owner_id=case when exists(select 1 from public.profiles p where p.id=subject.owner_id and p.branch_id=destination.id and p.active) then subject.owner_id else null end,
    supervisor_id=case when exists(select 1 from public.profiles p where p.id=subject.supervisor_id and p.branch_id=destination.id and p.active) then subject.supervisor_id else null end
    where id=subject.id;
  update public.enquiries set branch_id=destination.id, assigned_to=null where case_id=subject.id;
  update public.commission_claims cc set branch_id=destination.id
    from public.education_applications a where cc.application_id=a.id and a.case_id=subject.id;
  if move_client_branch then
    update public.clients set branch_id=destination.id, updated_at=now() where id=subject.client_id;
    update public.enquiries set branch_id=destination.id, assigned_to=null
      where client_id=subject.client_id and case_id is null and branch_id is not distinct from subject.branch_id;
  end if;

  -- IDs, original authors, history, Drive locations and all child records
  -- stay unchanged. Their existing case-scoped permissions follow the case.
  insert into public.audit_events
    (organisation_id,actor_id,action,resource_type,resource_id,case_id,summary,before_data,after_data)
  values (org,actor,'case.branch_transferred','case',subject.id::text,subject.id,
    'Transferred from '||coalesce(source_name,'Unassigned')||' to '||destination.name||': '||btrim(p_reason),
    jsonb_build_object('branch_id',subject.branch_id,'owner_id',subject.owner_id,'supervisor_id',subject.supervisor_id),
    jsonb_build_object('branch_id',destination.id,'previous_branch_id',subject.branch_id,
      'reason',btrim(p_reason),'client_home_branch_moved',move_client_branch));
  return jsonb_build_object('caseId',subject.id,'branchId',destination.id,'branch',destination.name,
    'previousBranchId',subject.branch_id,'clientHomeBranchMoved',move_client_branch);
end;
$$;

-- Only the checked transaction runs as its trusted owner. Direct client updates
-- still run as authenticated and cannot bypass branch isolation.
create or replace function public.guard_branch_change()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.branch_id is distinct from old.branch_id and auth.uid() is not null
 and coalesce(public.current_user_level()::text,'') not in ('platform_owner','super_admin')
 and current_user <> (select pg_catalog.pg_get_userbyid(p.proowner) from pg_catalog.pg_proc p
   where p.oid='private.transfer_case_branch(uuid,uuid,uuid,text)'::regprocedure) then
   raise exception 'Use the authorised branch transfer action.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.transfer_case_branch(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.transfer_case_branch(uuid,uuid,uuid,text) to authenticated;
create or replace function public.transfer_case_branch(p_case_id uuid,p_destination_branch_id uuid,p_expected_branch_id uuid,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.transfer_case_branch(p_case_id,p_destination_branch_id,p_expected_branch_id,p_reason)
$$;
revoke all on function public.transfer_case_branch(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.transfer_case_branch(uuid,uuid,uuid,text) to authenticated;

-- Only destination labels are exposed; branch cases/profiles remain scoped.
create function private.branch_transfer_destinations()
returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
 select b.id,b.name from public.branches b join public.profiles p on p.organisation_id=b.organisation_id
 where p.id=(select auth.uid()) and p.active and b.active and (
 p.level::text in ('platform_owner','super_admin') or
 (p.level::text in ('branch_admin','manager','staff','partner') and p.function_access->>'action_transfer_branch'='true'
 and coalesce((p.function_access->>'special_access')::boolean,true))) order by b.name
$$;
revoke all on function private.branch_transfer_destinations() from public,anon;
grant execute on function private.branch_transfer_destinations() to authenticated;
create function public.branch_transfer_destinations()
returns table(id uuid,name text) language sql stable security invoker set search_path='' as $$
 select * from private.branch_transfer_destinations()
$$;
revoke all on function public.branch_transfer_destinations() from public,anon;
grant execute on function public.branch_transfer_destinations() to authenticated;

commit;
