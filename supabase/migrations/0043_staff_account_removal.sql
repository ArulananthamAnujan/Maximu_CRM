begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Authentication is irreversibly deleted through Supabase Auth first. This
-- transaction then releases the CRM email and retires the historical actor.
-- A failed transaction leaves the inactive profile visible for a safe retry.
create or replace function public.retire_staff_profile(p_profile_id uuid, p_replacement_profile_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare person public.profiles; org uuid := public.current_organisation_id(); retired_email text;
begin
  if public.current_user_level()::text not in ('platform_owner','super_admin') or org is null then
    raise exception 'Only a Super Admin can delete a staff account.' using errcode='42501';
  end if;
  if p_profile_id = auth.uid() then raise exception 'You cannot delete your own account.' using errcode='22023'; end if;
  select * into person from public.profiles where id=p_profile_id and organisation_id=org for update;
  if not found or person.level::text='student' then raise exception 'That staff account is not available.' using errcode='42501'; end if;
  retired_email := 'removed+'||person.id::text||'@accounts.invalid';
  if person.email=retired_email then return jsonb_build_object('removed',true,'profileId',person.id); end if;
  if person.active then raise exception 'Deactivate this account before deleting its login.' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=person.id and deleted_at is not null) then
    raise exception 'Delete the authentication account before retiring its CRM profile.' using errcode='22023';
  end if;
  if person.level::text in ('platform_owner','super_admin') and not exists(
    select 1 from public.profiles where organisation_id=org and active and id<>person.id and level::text in ('platform_owner','super_admin')
  ) then raise exception 'Keep another active Super Admin before deleting this account.' using errcode='22023'; end if;
  if exists(select 1 from public.cases where organisation_id=org and closed_at is null and (owner_id=person.id or supervisor_id=person.id)) then
    raise exception 'Hand over this staff member''s open cases before deleting their account.' using errcode='22023';
  end if;
  delete from public.profile_roles where profile_id=person.id;
  delete from public.mailbox_connections where organisation_id=org and profile_id=person.id;
  delete from public.staff_invitations where organisation_id=org and lower(email)=lower(person.email);
  update public.profiles set email=retired_email,active=false,branch_id=null,department=null where id=person.id;
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,after_data)
  values(org,auth.uid(),'staff.removed','profile',person.id::text,
    'Deleted '||person.display_name||'''s staff login; historical case attribution retained',
    jsonb_build_object('replacement_profile_id',p_replacement_profile_id,'branch_id',person.branch_id));
  return jsonb_build_object('removed',true,'profileId',person.id);
end $$;
revoke all on function public.retire_staff_profile(uuid,uuid) from public,anon;
grant execute on function public.retire_staff_profile(uuid,uuid) to authenticated;

create or replace function public.guard_retired_staff_profile() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.email='removed+'||old.id::text||'@accounts.invalid' and
    (new.active or new.email is distinct from old.email) then
    raise exception 'Deleted staff accounts cannot be reactivated. Create a fresh account.' using errcode='22023';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_retired_staff on public.profiles;
create trigger profiles_guard_retired_staff before update on public.profiles
for each row execute function public.guard_retired_staff_profile();
commit;
