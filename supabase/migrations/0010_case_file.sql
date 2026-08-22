begin;

-- 1. Service stream and matter type are different things.
--
-- `service_type` is the stream the case is worked in: study_abroad or
-- direct_visa. The matter type is the product itself -- Student Visa 500,
-- Subclass 482, Partner 820/801, Visitor 600, EOI. Until now the matter type
-- was written into custom_fields.intake_type at intake and never read back, so
-- the interface showed "direct_visa" where it should have shown "Partner
-- 820/801", and an edit could reclassify the case.
alter table public.cases
  add column if not exists matter_type text;

update public.cases
  set matter_type = nullif(custom_fields->>'intake_type', '')
  where matter_type is null;

comment on column public.cases.service_type is
  'Service stream: study_abroad or direct_visa.';
comment on column public.cases.matter_type is
  'The matter itself, for example "Student Visa 500", "482", "Partner 820/801".';

-- 2. A visa matter as a migration agent actually works it.
alter table public.visa_matters
  add column if not exists responsible_agent_marn text,
  add column if not exists trn text,
  add column if not exists bridging_visa text,
  add column if not exists bridging_visa_granted_on date,
  add column if not exists health_examination_status text not null default 'not_started',
  add column if not exists biometrics_status text not null default 'not_started',
  add column if not exists police_clearance_status text not null default 'not_started',
  add column if not exists skills_assessment_status text not null default 'not_started',
  add column if not exists information_requested_at timestamptz,
  add column if not exists information_due_at timestamptz,
  add column if not exists information_provided_at timestamptz,
  add column if not exists refusal_reason text,
  add column if not exists visa_conditions text[] not null default '{}';

-- education_applications had no creation timestamp, so a list of a student's
-- applications could not be ordered by when they were lodged with the agency.
alter table public.education_applications
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists visa_matters_case_idx on public.visa_matters(case_id);
create index if not exists education_applications_case_idx
  on public.education_applications(case_id, status);
create index if not exists dependants_client_idx on public.dependants(client_id);

comment on column public.visa_matters.information_due_at is
  'Deadline for a s56 request for further information. Missing it can end the application.';

-- 3. Client files must be retained. The Code of Conduct requires a
-- contemporaneous written record of oral advice and instructions, and files are
-- generally kept for seven years after the last action. Give every organisation
-- that default rather than leaving retention unset.
create or replace function public.seed_default_retention_rules(target_organisation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.data_retention_rules (organisation_id, resource_type, retain_days, action)
  values
    (target_organisation, 'client_file', 2557, 'review'),
    (target_organisation, 'case_notes', 2557, 'review'),
    (target_organisation, 'communications', 2557, 'review'),
    (target_organisation, 'invoices', 2557, 'review')
  on conflict (organisation_id, resource_type) do nothing;
end;
$$;

create or replace function public.seed_retention_after_organisation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_retention_rules(new.id);
  return new;
end;
$$;

drop trigger if exists seed_retention_after_organisation_insert on public.organisations;
create trigger seed_retention_after_organisation_insert
after insert on public.organisations
for each row execute function public.seed_retention_after_organisation_insert();

do $$
declare organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.seed_default_retention_rules(organisation_row.id);
  end loop;
end $$;

commit;
