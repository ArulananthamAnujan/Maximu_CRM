begin;

-- Creating a member of staff was written down but never finished: an
-- invitation row was inserted and nothing ever read it, so an invited person
-- signing in was told their account "is not linked to an active Maximus CRM
-- profile" and there was no way to link it.
--
-- A profile's id must be the id of the Supabase auth user, which is not known
-- until that person exists. So there are two honest routes, and this migration
-- completes the second:
--
--   1. the deployment holds a service-role key, and the CRM creates the login
--      and the profile together;
--   2. it does not, and an administrator records the invitation here; the
--      profile is created from it the first time that person signs in.

alter table public.staff_invitations
  add column if not exists display_name text,
  add column if not exists department text,
  add column if not exists level public.user_level;

-- Claims a pending invitation for whoever is calling.
--
-- SECURITY DEFINER, because the caller has no profile yet and so cannot pass
-- any policy on public.profiles. It is bounded to exactly that: the email is
-- read from auth.users for auth.uid() rather than taken as an argument, so a
-- caller can only ever claim an invitation an administrator addressed to them,
-- and only while it is pending and unexpired. It creates one profile and takes
-- its level and branch from the invitation, never from the caller.
create or replace function public.claim_staff_invitation()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  invitation public.staff_invitations;
  role_row public.roles;
  created public.profiles;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Already set up: nothing to claim.
  select * into created from public.profiles where id = caller;
  if created.id is not null then
    return created;
  end if;

  select email into caller_email from auth.users where id = caller;
  if caller_email is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into invitation
  from public.staff_invitations
  where lower(email) = lower(caller_email)
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invitation.id is null then
    raise exception 'There is no invitation for this account' using errcode = 'P0002';
  end if;

  select * into role_row from public.roles where id = invitation.role_id;

  insert into public.profiles
    (id, organisation_id, branch_id, display_name, email, level, department, active)
  values
    (caller, invitation.organisation_id, invitation.branch_id,
     coalesce(invitation.display_name, split_part(caller_email, '@', 1)),
     lower(caller_email),
     coalesce(invitation.level, role_row.level, 'staff'::public.user_level),
     invitation.department, true)
  returning * into created;

  -- profile_roles is keyed on the branch, so a role can only be attached when
  -- the invitation named one. The account level on the profile is what the CRM
  -- reads for access; this is the finer-grained assignment on top of it.
  if invitation.branch_id is not null then
    insert into public.profile_roles (profile_id, role_id, branch_id)
    values (caller, invitation.role_id, invitation.branch_id)
    on conflict do nothing;
  end if;

  update public.staff_invitations
    set status = 'accepted', accepted_at = now()
    where id = invitation.id;

  insert into public.audit_events
    (organisation_id, actor_id, action, resource_type, resource_id,
     summary, after_data)
  values
    (invitation.organisation_id, caller, 'staff.invitation_claimed', 'profile',
     caller::text,
     'Staff account activated from an invitation',
     jsonb_build_object('email', lower(caller_email), 'level', created.level,
                        'branch_id', invitation.branch_id));

  return created;
end;
$$;

revoke all on function public.claim_staff_invitation() from public;
grant execute on function public.claim_staff_invitation() to authenticated;

comment on function public.claim_staff_invitation is
  'Creates the caller''s own profile from an invitation addressed to their email address. The only way an invited person becomes a staff account without a service-role key.';

commit;
