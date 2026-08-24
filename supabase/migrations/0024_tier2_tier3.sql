begin;

-- ---------------------------------------------------------------------------
-- Fix: client_user_links has never had a write policy. Row-level security was
-- switched on with only client_links_access (select), so link_client_account
-- has been failing for every caller, super_admin included, since the day it
-- was written -- an RLS-blocked insert raises a genuine Postgres error rather
-- than silently doing nothing. Restricted to the same roles that could
-- already see every link.
create policy client_links_write on public.client_user_links
for insert to authenticated
with check (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));
create policy client_links_update on public.client_user_links
for update to authenticated
using (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'))
with check (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));
create policy client_links_delete on public.client_user_links
for delete to authenticated
using (public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));

-- ---------------------------------------------------------------------------
-- Merging two client records that turned out to be the same person. Everything
-- that hangs off the duplicate is reassigned to the surviving record; a table
-- with a uniqueness constraint on client_id keeps the survivor's own row
-- rather than erroring, and the duplicate's is dropped along with the rest of
-- the merged record.
create or replace function public.merge_duplicate_clients(p_keep_client_id uuid, p_merge_client_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_org uuid;
  merge_org uuid;
  result public.clients;
begin
  if public.current_user_level()::text not in ('platform_owner','super_admin','branch_admin') then
    raise exception 'Only an administrator can merge duplicate client records.' using errcode = 'P0001';
  end if;
  if p_keep_client_id = p_merge_client_id then
    raise exception 'A client record cannot be merged into itself.' using errcode = 'P0001';
  end if;

  select organisation_id into keep_org from public.clients where id = p_keep_client_id;
  select organisation_id into merge_org from public.clients where id = p_merge_client_id;
  if keep_org is null or merge_org is null then
    raise exception 'One of these client records could not be found.' using errcode = 'P0001';
  end if;
  if keep_org <> public.current_organisation_id() or merge_org <> public.current_organisation_id() then
    raise exception 'These client records are not in your organisation.' using errcode = 'P0001';
  end if;

  update public.cases set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.documents set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.dependants set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.tasks set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.invoices set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.email_threads set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.enquiries set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.client_education_history set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.client_employment_history set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.english_tests set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.visa_history set client_id = p_keep_client_id where client_id = p_merge_client_id;
  update public.service_agreements set client_id = p_keep_client_id where client_id = p_merge_client_id;

  update public.study_preferences set client_id = p_keep_client_id
    where client_id = p_merge_client_id
      and not exists (select 1 from public.study_preferences where client_id = p_keep_client_id);
  delete from public.study_preferences where client_id = p_merge_client_id;

  update public.client_declarations d set client_id = p_keep_client_id
    where d.client_id = p_merge_client_id
      and not exists (
        select 1 from public.client_declarations k
        where k.client_id = p_keep_client_id and k.declaration_type = d.declaration_type
      );
  delete from public.client_declarations where client_id = p_merge_client_id;

  update public.client_user_links set client_id = p_keep_client_id
    where client_id = p_merge_client_id
      and not exists (select 1 from public.client_user_links where client_id = p_keep_client_id);
  delete from public.client_user_links where client_id = p_merge_client_id;

  insert into public.audit_events (organisation_id, actor_id, action, resource_type, resource_id, summary, before_data, after_data)
  values (
    keep_org, auth.uid(), 'client.merged', 'client', p_keep_client_id::text,
    format('Merged duplicate client record %s into %s', p_merge_client_id, p_keep_client_id),
    jsonb_build_object('merged_client_id', p_merge_client_id),
    jsonb_build_object('surviving_client_id', p_keep_client_id)
  );

  delete from public.clients where id = p_merge_client_id;

  select * into result from public.clients where id = p_keep_client_id;
  return result;
end;
$$;
grant execute on function public.merge_duplicate_clients(uuid, uuid) to authenticated;
comment on function public.merge_duplicate_clients(uuid, uuid) is
  'Reassigns everything that hangs off a duplicate client record onto the surviving one, then removes the duplicate. Administrator only.';

-- ---------------------------------------------------------------------------
-- A client updating their own contact details. clients_scoped_write does not
-- include the student level at all -- a portal login has never been able to
-- change so much as its own phone number. Narrow on purpose: only contact
-- fields, only the caller's own linked record, nothing that affects casework.
create or replace function public.update_own_contact_details(
  p_email text default null,
  p_mobile text default null,
  p_preferred_name text default null
)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client uuid;
  result public.clients;
begin
  select client_id into target_client from public.client_user_links where profile_id = auth.uid();
  if target_client is null then
    raise exception 'No client record is linked to this account.' using errcode = 'P0001';
  end if;
  update public.clients set
    email = coalesce(p_email, email),
    mobile = coalesce(p_mobile, mobile),
    preferred_name = coalesce(p_preferred_name, preferred_name),
    updated_at = now()
  where id = target_client
  returning * into result;
  return result;
end;
$$;
grant execute on function public.update_own_contact_details(text, text, text) to authenticated;
comment on function public.update_own_contact_details(text, text, text) is
  'A client portal login updating its own email, mobile or preferred name -- nothing else, and only its own linked client record.';

-- ---------------------------------------------------------------------------
-- A client acknowledging a consent/privacy declaration themselves, rather
-- than it only ever being recorded by staff during intake.
create or replace function public.acknowledge_own_consent(
  p_declaration_type text,
  p_response boolean,
  p_details text default null
)
returns public.client_declarations
language plpgsql
security definer
set search_path = public
as $$
declare
  target_client uuid;
  target_org uuid;
  result public.client_declarations;
begin
  select cl.client_id, c.organisation_id into target_client, target_org
    from public.client_user_links cl
    join public.clients c on c.id = cl.client_id
    where cl.profile_id = auth.uid();
  if target_client is null then
    raise exception 'No client record is linked to this account.' using errcode = 'P0001';
  end if;
  insert into public.client_declarations
    (id, organisation_id, client_id, declaration_type, response, details, declared_by, declared_at)
  values
    (gen_random_uuid(), target_org, target_client, p_declaration_type, p_response, p_details, auth.uid(), now())
  on conflict (client_id, declaration_type) do update
    set response = excluded.response, details = excluded.details,
        declared_by = excluded.declared_by, declared_at = excluded.declared_at
  returning * into result;
  return result;
end;
$$;
grant execute on function public.acknowledge_own_consent(text, boolean, text) to authenticated;
comment on function public.acknowledge_own_consent(text, boolean, text) is
  'A client portal login recording its own answer to a consent/privacy declaration.';

-- ---------------------------------------------------------------------------
-- Credit notes: forgiving part of an invoice without a cash refund having
-- happened, as its own ledger entry rather than a payment that never occurred.
create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  reason text,
  issued_by uuid references public.profiles,
  issued_at timestamptz not null default now()
);
alter table public.credit_notes enable row level security;
create policy credit_notes_internal on public.credit_notes
for all to authenticated
using (organisation_id = public.current_organisation_id()
       and public.current_user_level()::text in
           ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id()
            and public.current_user_level()::text in
                ('platform_owner','super_admin','branch_admin','manager'));
comment on table public.credit_notes is
  'An amount forgiven against an invoice without a refund of cash already paid. Management only, same as payments.';

-- ---------------------------------------------------------------------------
-- Saved views: a named filter a person can return to, private to whoever
-- saved it -- nobody else's screen changes because of someone else's view.
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  profile_id uuid not null references public.profiles on delete cascade,
  module text not null,
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (profile_id, module, name)
);
alter table public.saved_views enable row level security;
create policy saved_views_owner on public.saved_views
for all to authenticated
using (organisation_id = public.current_organisation_id() and profile_id = auth.uid())
with check (organisation_id = public.current_organisation_id() and profile_id = auth.uid());
comment on table public.saved_views is
  'A named filter preset for one screen, private to the profile that saved it.';

commit;
