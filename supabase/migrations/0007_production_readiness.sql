begin;

alter table public.profiles
  add column if not exists require_mfa boolean not null default false,
  add column if not exists access_reviewed_at timestamptz,
  add column if not exists access_reviewed_by uuid references public.profiles(id),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

alter table public.clients
  add column if not exists title text,
  add column if not exists gender text,
  add column if not exists marital_status text,
  add column if not exists country_of_birth text,
  add column if not exists current_country text,
  add column if not exists passport_country text,
  add column if not exists passport_expiry date,
  add column if not exists preferred_language text,
  add column if not exists address jsonb not null default '{}'::jsonb,
  add column if not exists emergency_contact jsonb not null default '{}'::jsonb,
  add column if not exists marketing_consent boolean,
  add column if not exists privacy_consent_at timestamptz;

create table if not exists public.client_education_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  country_code text,
  institution text not null,
  qualification text not null,
  field_of_study text,
  started_on date,
  completed_on date,
  result text,
  currently_studying boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_employment_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  employer text not null,
  job_title text not null,
  country_code text,
  started_on date,
  ended_on date,
  currently_employed boolean not null default false,
  hours_per_week numeric(5,2),
  duties text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.english_tests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  test_type text not null,
  test_date date,
  overall numeric(5,2),
  listening numeric(5,2),
  reading numeric(5,2),
  writing numeric(5,2),
  speaking numeric(5,2),
  reference_number text,
  expires_on date,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.study_preferences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null unique references public.clients(id) on delete cascade,
  destination_countries text[] not null default '{}',
  study_levels text[] not null default '{}',
  fields_of_study text[] not null default '{}',
  preferred_institutions text[] not null default '{}',
  preferred_cities text[] not null default '{}',
  target_intakes text[] not null default '{}',
  annual_budget numeric(14,2),
  budget_currency text not null default 'AUD',
  funding_source text,
  accommodation_required boolean,
  scholarship_required boolean,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.visa_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  country_code text not null,
  visa_type text not null,
  status text not null,
  applied_on date,
  granted_on date,
  expires_on date,
  refusal_reason text,
  reference_number text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.client_declarations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  declaration_type text not null,
  response boolean,
  details text,
  declared_by uuid references public.profiles(id),
  declared_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  unique(client_id, declaration_type)
);

create table if not exists public.service_agreements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  agreement_type text not null,
  version text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired','terminated')),
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_ip_hash text,
  evidence_document_id uuid references public.documents(id),
  terms_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source_system text not null,
  source_file_name text,
  status text not null default 'validating' check (status in ('validating','ready','importing','completed','failed','cancelled')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  imported_rows integer not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  started_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  source_key text,
  raw_data jsonb not null,
  normalized_data jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','valid','invalid','imported','skipped')),
  target_client_id uuid references public.clients(id),
  unique(batch_id,row_number)
);

create table if not exists public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  severity text not null check (severity in ('low','medium','high','critical')),
  component text not null,
  summary text not null,
  status text not null default 'open' check (status in ('open','investigating','monitoring','resolved')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  owner_id uuid references public.profiles(id),
  details jsonb not null default '{}'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array[
    'client_education_history','client_employment_history','english_tests','study_preferences',
    'visa_history','client_declarations','service_agreements','import_batches','import_rows','operational_incidents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'client_education_history','client_employment_history','english_tests','study_preferences',
    'visa_history','client_declarations','service_agreements'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (organisation_id = public.current_organisation_id() and public.can_access_client(client_id))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (organisation_id = public.current_organisation_id() and public.is_internal_user() and public.can_access_client(client_id)) with check (organisation_id = public.current_organisation_id() and public.is_internal_user() and public.can_access_client(client_id))', t || '_write', t);
  end loop;
end $$;

create policy import_batches_admin on public.import_batches for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));
create policy import_rows_admin on public.import_rows for all to authenticated
using (organisation_id = public.current_organisation_id() and exists (select 1 from public.import_batches b where b.id=import_rows.batch_id and b.organisation_id=public.current_organisation_id()))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));
create policy incidents_admin on public.operational_incidents for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin'));

create or replace function public.client_intake_completeness(target_client uuid)
returns integer language sql stable security invoker set search_path=public as $$
  select least(100,
    (case when c.first_name <> '' and c.last_name <> '' then 15 else 0 end) +
    (case when c.email is not null and c.mobile is not null then 10 else 0 end) +
    (case when c.date_of_birth is not null and c.nationality is not null then 10 else 0 end) +
    (case when c.address <> '{}'::jsonb then 10 else 0 end) +
    (case when c.passport_number_encrypted is not null and c.passport_expiry is not null then 15 else 0 end) +
    (case when exists(select 1 from public.client_education_history e where e.client_id=c.id) then 10 else 0 end) +
    (case when exists(select 1 from public.english_tests e where e.client_id=c.id) then 10 else 0 end) +
    (case when exists(select 1 from public.study_preferences s where s.client_id=c.id) or exists(select 1 from public.visa_history v where v.client_id=c.id) then 10 else 0 end) +
    (case when c.privacy_consent_at is not null then 10 else 0 end)
  ) from public.clients c where c.id=target_client and public.can_access_client(c.id)
$$;

create or replace function public.production_readiness(target_organisation uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'active_branches', (select count(*) from public.branches where organisation_id=target_organisation and active),
    'active_internal_users', (select count(*) from public.profiles where organisation_id=target_organisation and active and level <> 'student'),
    'workflow_templates', (select count(*) from public.workflow_templates where organisation_id=target_organisation and active),
    'retention_rules', (select count(*) from public.data_retention_rules where organisation_id=target_organisation and active),
    'open_incidents', (select count(*) from public.operational_incidents where organisation_id=target_organisation and status <> 'resolved'),
    'pending_import_rows', (select count(*) from public.import_rows where organisation_id=target_organisation and status in ('pending','invalid')),
    'generated_at', now()
  ) where target_organisation=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin')
$$;

commit;
