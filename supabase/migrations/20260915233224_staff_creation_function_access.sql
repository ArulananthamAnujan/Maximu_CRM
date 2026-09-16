-- Account creation must persist restrictions before first sign-in.
alter table public.staff_invitations add column if not exists function_access jsonb;

create function private.valid_function_access(p_access jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_access is null or (jsonb_typeof(p_access)='object' and not exists (
 select 1 from jsonb_each(case when jsonb_typeof(p_access)='object' then p_access else '{}'::jsonb end) e
 where jsonb_typeof(e.value)<>'boolean' or e.key<>all(array['dashboard','enquiries','students','applications','visas','direct_visas','defer','case_complete','work','calendar','documents','communications','courseFinder','finance','reports','templates','workflows','compliance','ai','administration','integrations'])))
$$;
revoke all on function private.valid_function_access(jsonb) from public, anon;
grant execute on function private.valid_function_access(jsonb) to authenticated;

-- This helper is only for the caller's verified, unexpired invitation. It does
-- not accept an email or return other people's invitation/profile information.
create function private.own_pending_invitation() returns public.staff_invitations
language sql stable security definer set search_path='' as $$
 select i from public.staff_invitations i join auth.users u on lower(u.email)=lower(i.email)
 where u.id=(select auth.uid()) and u.email_confirmed_at is not null
 and i.status='pending' and i.expires_at>now()
 order by i.created_at desc,i.id desc limit 1
$$;
revoke all on function private.own_pending_invitation() from public,anon;
grant execute on function private.own_pending_invitation() to authenticated;

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

create function private.guard_invitation_access() returns trigger
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
   new.function_access:=coalesce(new.function_access,'{}'::jsonb) || coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(actor.function_access,'{}'::jsonb)) where value='false'::jsonb),'{}'::jsonb);
   return new;
 end if;
 raise exception 'Only Super Admin can set invitation access' using errcode='42501';
end $$;
revoke all on function private.guard_invitation_access() from public,anon;
create trigger guard_invitation_access before insert or update on public.staff_invitations for each row execute function private.guard_invitation_access();

-- The invitation claim legitimately writes its own role link and acceptance
-- after its profile exists. The exception is narrow; ordinary writes still
-- pass the table's existing RLS and function restrictions.
create or replace function private.guard_function_write() returns trigger
language plpgsql security invoker set search_path='' as $$
declare invitation public.staff_invitations;
begin
 if auth.uid() is not null and public.current_user_level() is not null and not private.any_function_allowed(tg_argv) then
   if tg_table_name='profile_roles' and tg_op='INSERT' then
     invitation:=private.own_pending_invitation();
     if invitation.id is not null and new.profile_id=auth.uid() and new.role_id=invitation.role_id and new.branch_id=invitation.branch_id then return new; end if;
   elsif tg_table_name='staff_invitations' and tg_op='UPDATE' then
     invitation:=private.own_pending_invitation();
     if invitation.id=old.id and new.status='accepted' and old.status='pending' and new.accepted_at is not null
       and (to_jsonb(new)-array['status','accepted_at'])=(to_jsonb(old)-array['status','accepted_at']) then return new; end if;
   end if;
   raise exception 'This function is disabled for your account' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

create function private.claim_staff_invitation() returns public.profiles
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
 insert into public.profiles(id,organisation_id,branch_id,display_name,email,level,department,active,function_access)
 values(caller,invitation.organisation_id,invitation.branch_id,coalesce(invitation.display_name,split_part(invitation.email,'@',1)),lower(invitation.email),
 coalesce(invitation.level,(select level from public.roles where id=invitation.role_id),'staff'::public.user_level),invitation.department,true,invitation.function_access)
 returning * into created;
 if invitation.branch_id is not null then
 insert into public.profile_roles(profile_id,role_id,branch_id) values(caller,invitation.role_id,invitation.branch_id) on conflict do nothing;
 end if;
 update public.staff_invitations set status='accepted',accepted_at=now() where id=invitation.id;
 insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,after_data)
 values(invitation.organisation_id,caller,'staff.invitation_claimed','profile',caller::text,'Staff account activated from an invitation',jsonb_build_object('function_access',created.function_access,'level',created.level));
 return created;
end $$;
revoke all on function private.claim_staff_invitation() from public,anon;
grant execute on function private.claim_staff_invitation() to authenticated;
create or replace function public.claim_staff_invitation() returns public.profiles
language sql security invoker set search_path='' as $$ select private.claim_staff_invitation() $$;
revoke all on function public.claim_staff_invitation() from public,anon;
grant execute on function public.claim_staff_invitation() to authenticated;
