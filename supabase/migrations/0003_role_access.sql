-- Maximus CRM role model, matching the legacy portal's visible account types.
-- Super Admin: organisation-wide control.
-- Admin: assigned-branch administration and operations.
-- Staff (legacy Employee): assigned branch/case delivery.
-- Client / Student: own journey, documents, appointments and communications only.

create table if not exists public.client_user_links (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id),
  branch_id uuid references public.branches(id),
  invited_by uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organisation_id, email, status)
);

create table if not exists public.login_activity (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('sign_in','sign_out','failed_sign_in','password_reset','account_activated')),
  device_label text,
  ip_hash text,
  occurred_at timestamptz not null default now()
);

create or replace function public.seed_maximus_system_roles(target_organisation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  role_row record;
begin
  insert into public.roles (organisation_id, name, level, data_scope, system_role)
  values
    (target_organisation, 'Super Admin', 'super_admin', 'organisation', true),
    (target_organisation, 'Admin', 'branch_admin', 'assigned_branches', true),
    (target_organisation, 'Staff', 'staff', 'assigned_cases', true),
    (target_organisation, 'Client / Student', 'student', 'own_record', true)
  on conflict (organisation_id, name) do update
    set level = excluded.level,
        data_scope = excluded.data_scope,
        system_role = true;

  for role_row in
    select id, name from public.roles where organisation_id = target_organisation and system_role = true
  loop
    delete from public.permissions where role_id = role_row.id;

    if role_row.name = 'Super Admin' then
      insert into public.permissions (role_id, resource, action)
      select role_row.id, resource, action from (values
        ('organisation','manage'),('branches','manage'),('staff','manage'),('roles','manage'),
        ('clients','manage'),('enquiries','manage'),('cases','manage'),('applications','manage'),
        ('visas','manage'),('tasks','manage'),('documents','manage'),('communications','manage'),
        ('appointments','manage'),('templates','manage'),('finance','manage'),('reports','view'),
        ('workflows','manage'),('integrations','manage'),('audit','view'),('login_activity','view'),
        ('client_portal','preview')) as permission(resource, action);
    elsif role_row.name = 'Admin' then
      insert into public.permissions (role_id, resource, action)
      select role_row.id, resource, action from (values
        ('branches','view_assigned'),('staff','manage_assigned'),('clients','manage_branch'),
        ('enquiries','manage_branch'),('cases','manage_branch'),('applications','manage_branch'),
        ('visas','manage_branch'),('tasks','manage_branch'),('documents','manage_branch'),
        ('communications','manage_branch'),('appointments','manage_branch'),('templates','use'),
        ('finance','manage_branch'),('reports','view_branch'),('workflows','view'),
        ('audit','view_branch'),('login_activity','view_branch'),('client_portal','preview'))
        as permission(resource, action);
    elsif role_row.name = 'Staff' then
      insert into public.permissions (role_id, resource, action)
      select role_row.id, resource, action from (values
        ('clients','view_assigned'),('enquiries','manage_assigned'),('cases','manage_assigned'),
        ('applications','manage_assigned'),('visas','manage_assigned'),('tasks','manage_assigned'),
        ('documents','manage_assigned'),('communications','manage_assigned'),
        ('appointments','manage_assigned'),('templates','use'),('finance','view_assigned'))
        as permission(resource, action);
    else
      insert into public.permissions (role_id, resource, action)
      select role_row.id, resource, action from (values
        ('client_portal','access'),('profile','update_own'),('cases','view_own'),
        ('tasks','view_own'),('documents','view_own'),('documents','upload_own'),
        ('communications','view_own'),('communications','send_own'),
        ('appointments','view_own'),('appointments','request_own'),('invoices','view_own'))
        as permission(resource, action);
    end if;
  end loop;
end;
$$;

create or replace function public.seed_roles_after_organisation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_maximus_system_roles(new.id);
  return new;
end;
$$;

drop trigger if exists seed_roles_after_organisation_insert on public.organisations;
create trigger seed_roles_after_organisation_insert
after insert on public.organisations
for each row execute function public.seed_roles_after_organisation_insert();

do $$
declare organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.seed_maximus_system_roles(organisation_row.id);
  end loop;
end $$;

create or replace function public.current_user_level()
returns public.user_level
language sql
stable
security definer
set search_path = public
as $$
  select level from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.client_user_links where profile_id = auth.uid()
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_level() = 'super_admin' then true
    when public.current_user_level() in ('branch_admin','manager','staff') then
      target_branch is null or target_branch = (select branch_id from public.profiles where id = auth.uid())
    else false
  end
$$;

create or replace function public.can_access_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_level() = 'super_admin' then true
    when public.current_user_level() in ('branch_admin','manager') then exists (
      select 1 from public.clients c where c.id = target_client
      and c.organisation_id = public.current_organisation_id()
      and public.can_access_branch(c.branch_id)
    )
    when public.current_user_level() = 'staff' then exists (
      select 1 from public.clients c where c.id = target_client
      and c.organisation_id = public.current_organisation_id()
      and (c.owner_id = auth.uid() or public.can_access_branch(c.branch_id))
    )
    when public.current_user_level() = 'student' then target_client = public.current_client_id()
    else false
  end
$$;

alter table public.client_user_links enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.login_activity enable row level security;

drop policy if exists client_links_access on public.client_user_links;
create policy client_links_access on public.client_user_links
for select to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_level() in ('super_admin','branch_admin')
);

drop policy if exists staff_invitations_admin on public.staff_invitations;
create policy staff_invitations_admin on public.staff_invitations
for all to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin')
)
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin')
);

drop policy if exists login_activity_visibility on public.login_activity;
create policy login_activity_visibility on public.login_activity
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and (
    profile_id = auth.uid()
    or public.current_user_level() in ('super_admin','branch_admin')
  )
);

-- Replace the broad tenant-only policies on client-facing core tables with scoped access.
drop policy if exists tenant_isolation on public.clients;
create policy clients_scoped_select on public.clients for select to authenticated
using (organisation_id = public.current_organisation_id() and public.can_access_client(id));
create policy clients_scoped_write on public.clients for all to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin','manager','staff')
  and public.can_access_client(id)
)
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin','manager','staff')
  and public.can_access_branch(branch_id)
);

drop policy if exists tenant_isolation on public.cases;
create policy cases_scoped_select on public.cases for select to authenticated
using (organisation_id = public.current_organisation_id() and public.can_access_client(client_id));
create policy cases_scoped_write on public.cases for all to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin','manager','staff')
  and public.can_access_client(client_id)
)
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin','manager','staff')
  and public.can_access_client(client_id)
);

drop policy if exists tenant_isolation on public.documents;
create policy documents_scoped_select on public.documents for select to authenticated
using (organisation_id = public.current_organisation_id() and public.can_access_client(client_id));
create policy documents_staff_write on public.documents for all to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin','manager','staff')
  and public.can_access_client(client_id)
)
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() in ('super_admin','branch_admin','manager','staff')
  and public.can_access_client(client_id)
);
create policy documents_client_upload on public.documents for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level() = 'student'
  and client_id = public.current_client_id()
  and uploaded_by = auth.uid()
  and state = 'uploaded'
);

comment on table public.client_user_links is 'Separates each client/student login from staff and limits the portal to the linked client record.';
comment on table public.staff_invitations is 'Legacy-compatible staff invitation, activation, branch and role assignment workflow.';
comment on table public.login_activity is 'Sign-in and account activity visible according to Super Admin/Admin scope.';
