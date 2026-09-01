begin;

-- Appointment requests are a two-party workflow. Keep the client's preferred
-- slot, the staff response and every later change on the same durable record.
alter table public.appointments
  add column if not exists requested_by uuid references public.profiles(id),
  add column if not exists responded_by uuid references public.profiles(id),
  add column if not exists responded_at timestamptz,
  add column if not exists response_note text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

create index if not exists appointments_status_start_idx
  on public.appointments(organisation_id, status, starts_at);

-- Complete finance ledger. Payments remain immutable entries; refunds are
-- negative entries, receipts point to the exact payment and reconciliation
-- records prove what was matched to a bank/accounting statement.
alter table public.payments
  add column if not exists transaction_type text not null default 'payment',
  add column if not exists external_reference text,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciliation_id uuid;

alter table public.credit_notes
  add column if not exists credit_note_number text,
  add column if not exists document_id uuid references public.documents(id),
  add column if not exists voided_at timestamptz;

create unique index if not exists credit_notes_number_unique
  on public.credit_notes(organisation_id, credit_note_number)
  where credit_note_number is not null;

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  payment_id uuid not null unique references public.payments on delete restrict,
  receipt_number text not null,
  document_id uuid references public.documents(id),
  issued_by uuid references public.profiles,
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  unique (organisation_id, receipt_number)
);

create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  reminder_type text not null check (reminder_type in ('due_soon','due_today','overdue','final_notice','manual')),
  delivery_channel text not null default 'email',
  status text not null default 'queued' check (status in ('queued','sent','failed','cancelled')),
  provider_message_id text,
  sent_by uuid references public.profiles,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
create unique index if not exists invoice_reminders_daily_unique
  on public.invoice_reminders(invoice_id, reminder_type, ((scheduled_for at time zone 'UTC')::date));

create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source text not null,
  statement_reference text,
  currency text not null default 'AUD',
  statement_total numeric(14,2) not null default 0,
  matched_total numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','balanced','exception','closed')),
  started_by uuid references public.profiles,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text
);

alter table public.payments
  drop constraint if exists payments_reconciliation_id_fkey;
alter table public.payments
  add constraint payments_reconciliation_id_fkey
  foreign key (reconciliation_id) references public.reconciliation_runs(id) on delete set null;

-- Owner-managed configuration replaces hard-coded/future master settings.
create table if not exists public.organisation_settings (
  organisation_id uuid primary key references public.organisations on delete cascade,
  timezone text not null default 'Australia/Melbourne',
  default_currency text not null default 'AUD',
  tax_label text not null default 'GST',
  tax_rate numeric(7,4) not null default 0.10 check (tax_rate between 0 and 1),
  invoice_prefix text not null default 'INV',
  receipt_prefix text not null default 'RCT',
  credit_note_prefix text not null default 'CN',
  payment_terms_days integer not null default 14 check (payment_terms_days between 0 and 365),
  overdue_reminders_enabled boolean not null default true,
  appointment_duration_minutes integer not null default 30 check (appointment_duration_minutes between 15 and 480),
  updated_by uuid references public.profiles,
  updated_at timestamptz not null default now()
);
insert into public.organisation_settings(organisation_id)
select id from public.organisations on conflict do nothing;

-- Operational evidence: backup archives, restore validation, dependency
-- probes and alert delivery all leave an auditable result.
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  status text not null check (status in ('running','completed','failed')),
  object_path text,
  table_counts jsonb not null default '{}',
  checksum text,
  bytes bigint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crm-backups','crm-backups',false,524288000,array['application/json'])
on conflict (id) do update set public=false;

create table if not exists public.restore_drills (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  backup_run_id uuid references public.backup_runs on delete set null,
  status text not null check (status in ('running','passed','failed')),
  checks jsonb not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.operational_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  component text not null,
  status text not null check (status in ('healthy','degraded','failed')),
  latency_ms integer,
  details jsonb not null default '{}',
  checked_at timestamptz not null default now()
);
create index if not exists operational_checks_latest_idx
  on public.operational_checks(organisation_id, component, checked_at desc);

create table if not exists public.course_source_registry (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  country_code text not null,
  country_name text not null,
  source_system text not null,
  source_name text not null,
  source_url text not null,
  authority_type text not null check (authority_type in ('official','licensed','manual')),
  coverage text not null check (coverage in ('institutions','qualifications','courses','partial')),
  sync_mode text not null check (sync_mode in ('automatic','configured','manual_review')),
  status text not null default 'pending' check (status in ('active','pending','blocked','error')),
  last_success_at timestamptz,
  last_error text,
  unique (organisation_id, country_code, source_system)
);

insert into public.course_source_registry
  (organisation_id,country_code,country_name,source_system,source_name,source_url,authority_type,coverage,sync_mode,status)
select o.id, source.country_code, source.country_name, source.source_system,
       source.source_name, source.source_url, 'official', source.coverage,
       source.sync_mode, source.status
from public.organisations o
cross join (values
  ('AU','Australia','au_cricos','Australian Government CRICOS','https://data.gov.au/data/dataset/cricos','courses','automatic','active'),
  ('US','United States','us_college_scorecard','U.S. Department of Education College Scorecard','https://collegescorecard.ed.gov/data/api/','partial','configured','pending'),
  ('GB','United Kingdom','uk_discover_uni','Discover Uni','https://discoveruni.gov.uk/','courses','manual_review','pending'),
  ('CA','Canada','ca_ircc_dli','IRCC Designated Learning Institutions','https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html','institutions','manual_review','pending'),
  ('NZ','New Zealand','nz_nzqa','New Zealand Qualifications Authority','https://www.nzqa.govt.nz/qualifications/courses/results.do','qualifications','manual_review','pending'),
  ('AE','United Arab Emirates','ae_caa','UAE Commission for Academic Accreditation','https://caa.ae/Pages/Programs/All.aspx','courses','manual_review','pending')
) as source(country_code,country_name,source_system,source_name,source_url,coverage,sync_mode,status)
on conflict (organisation_id,country_code,source_system) do update set
  source_name=excluded.source_name, source_url=excluded.source_url,
  authority_type=excluded.authority_type, coverage=excluded.coverage,
  sync_mode=excluded.sync_mode;

-- Private catalogue records remain visible for historical advising but cannot
-- be presented as current merely because they exist.
update public.institutions set last_verified_at=null
where source_system in ('legacy','import','manual') and last_verified_at is not null
  and source_updated_at is null;
update public.courses set last_verified_at=null
where source_system in ('legacy','import','manual') and last_verified_at is not null
  and source_updated_at is null;

-- RLS for all new organisation data.
alter table public.payment_receipts enable row level security;
alter table public.invoice_reminders enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.organisation_settings enable row level security;
alter table public.backup_runs enable row level security;
alter table public.restore_drills enable row level security;
alter table public.operational_checks enable row level security;
alter table public.course_source_registry enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'payment_receipts','invoice_reminders','reconciliation_runs',
    'organisation_settings','backup_runs','restore_drills','operational_checks',
    'course_source_registry'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_admin', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in (''platform_owner'',''super_admin'',''branch_admin'',''manager'')) with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in (''platform_owner'',''super_admin'',''branch_admin'',''manager''))',
      table_name || '_admin', table_name
    );
  end loop;
end $$;

create policy course_source_registry_catalogue_read on public.course_source_registry
for select to authenticated using (organisation_id = public.current_organisation_id());

-- Clients may read receipts issued for their own invoices, never another
-- client's ledger.
create policy payment_receipts_client_read on public.payment_receipts
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = 'student'
  and exists (
    select 1 from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p.id = payment_receipts.payment_id
      and i.client_id = public.current_client_id()
  )
);

-- Atomic staff response: an accessible staff member confirms, reschedules or
-- declines the request and the client is notified through their linked login.
create or replace function public.respond_to_appointment(
  p_appointment_id uuid,
  p_status text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_note text default null
) returns public.appointments
language plpgsql security invoker set search_path = public as $$
declare result public.appointments; target_case public.cases; client_profile uuid;
begin
  if not public.is_internal_user() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_status not in ('scheduled','declined','cancelled') then raise exception 'Invalid appointment response'; end if;
  select c.* into target_case from public.appointments a join public.cases c on c.id=a.case_id
    where a.id=p_appointment_id and a.organisation_id=public.current_organisation_id();
  if target_case.id is null or not public.can_access_client(target_case.client_id) then
    raise exception 'Appointment not available' using errcode='42501';
  end if;
  update public.appointments set
    status=p_status,
    starts_at=coalesce(p_starts_at, starts_at),
    ends_at=coalesce(p_ends_at, ends_at),
    owner_id=coalesce(owner_id, auth.uid()),
    responded_by=auth.uid(), responded_at=now(), response_note=nullif(trim(p_note),''),
    cancelled_at=case when p_status='cancelled' then now() else null end
  where id=p_appointment_id returning * into result;
  select profile_id into client_profile from public.client_user_links
    where client_id=target_case.client_id limit 1;
  if client_profile is not null then
    insert into public.notifications(organisation_id,recipient_id,case_id,kind,title,body)
    values(result.organisation_id,client_profile,result.case_id,'appointment_response',
      case p_status when 'scheduled' then 'Your appointment is confirmed' when 'declined' then 'Your appointment request needs another time' else 'Your appointment was cancelled' end,
      coalesce(nullif(trim(p_note),''),'Open your portal for the appointment details.'));
  end if;
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,case_id,summary,after_data)
  values(result.organisation_id,auth.uid(),'appointment.'||p_status,'appointment',result.id::text,result.case_id,
    'Appointment request '||p_status,jsonb_build_object('starts_at',result.starts_at,'note',p_note));
  return result;
end $$;
grant execute on function public.respond_to_appointment(uuid,text,timestamptz,timestamptz,text) to authenticated;

-- Safely remove a former staff login only after every live responsibility has
-- been transferred. Historical foreign keys continue pointing at the retired
-- profile, preserving attribution.
create or replace function public.transfer_staff_ownership(
  p_from uuid, p_to uuid
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare moved_cases integer; moved_tasks integer; moved_enquiries integer;
begin
  if public.current_user_level()::text not in ('platform_owner','super_admin') then
    raise exception 'Super Admin access required' using errcode='42501';
  end if;
  if p_from=p_to then raise exception 'Choose a different replacement owner'; end if;
  if not exists(select 1 from public.profiles where id=p_to and organisation_id=public.current_organisation_id() and active) then
    raise exception 'Replacement owner is not active';
  end if;
  update public.cases set owner_id=p_to where organisation_id=public.current_organisation_id() and owner_id=p_from and closed_at is null;
  get diagnostics moved_cases=row_count;
  update public.cases set supervisor_id=p_to where organisation_id=public.current_organisation_id() and supervisor_id=p_from and closed_at is null;
  update public.tasks set assigned_to=p_to where organisation_id=public.current_organisation_id() and assigned_to=p_from and status<>'completed';
  get diagnostics moved_tasks=row_count;
  update public.enquiries set assigned_to=p_to where organisation_id=public.current_organisation_id() and assigned_to=p_from and status not in ('converted','lost');
  get diagnostics moved_enquiries=row_count;
  insert into public.audit_events(organisation_id,actor_id,action,resource_type,resource_id,summary,after_data)
  values(public.current_organisation_id(),auth.uid(),'staff.ownership_transferred','profile',p_from::text,
    'Transferred active responsibilities before staff removal',jsonb_build_object('replacement',p_to,'cases',moved_cases,'tasks',moved_tasks,'enquiries',moved_enquiries));
  return jsonb_build_object('cases',moved_cases,'tasks',moved_tasks,'enquiries',moved_enquiries);
end $$;
grant execute on function public.transfer_staff_ownership(uuid,uuid) to authenticated;

commit;
