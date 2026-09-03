begin;

-- A migration is complete only when every declared source row was received,
-- every row has a durable source snapshot, and every required file has been
-- copied and checksum-verified. These fields make that proof queryable.
alter table public.import_batches
  add column if not exists declared_rows integer,
  add column if not exists received_rows integer not null default 0,
  add column if not exists source_timezone text not null default 'Australia/Melbourne',
  add column if not exists source_checksum text,
  add column if not exists reconciliation jsonb not null default '{}'::jsonb,
  add column if not exists reconciled_at timestamptz;

alter table public.import_rows
  add column if not exists protected_data text,
  add column if not exists source_checksum text,
  add column if not exists imported_at timestamptz;

alter table public.email_messages
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.whatsapp_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.sms_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.payments
  add column if not exists description text,
  add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists import_rows_batch_source_key_idx
  on public.import_rows(batch_id, source_key)
  where source_key is not null;

-- display_data is safe to inspect. protected_data is an AES-GCM encrypted JSON
-- object containing values such as passport numbers that must never be plain
-- text in a database copy. Together they preserve the complete source row.
create table if not exists public.legacy_record_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null,
  entity_type text not null,
  source_key text not null,
  target_table text,
  target_id uuid,
  display_data jsonb not null default '{}'::jsonb,
  protected_data text,
  source_checksum text not null,
  imported_by uuid references public.profiles,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, source_system, entity_type, source_key)
);

-- Historical comments, transitions and staff actions cannot be represented as
-- current-state columns. Keep them as first-class chronological events and
-- optionally connect an old staff label to a current profile.
create table if not exists public.legacy_activity_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  case_id uuid references public.cases on delete cascade,
  source_entity_type text not null,
  source_key text not null,
  event_type text not null,
  subject text,
  body text,
  actor_label text,
  actor_profile_id uuid references public.profiles,
  occurred_at timestamptz,
  attachment_name text,
  attachment_source text,
  metadata jsonb not null default '{}'::jsonb,
  unique (organisation_id, source_entity_type, source_key)
);
create index if not exists legacy_activity_case_time_idx
  on public.legacy_activity_events(case_id, occurred_at desc);

-- CSV/XLSX files can name an old attachment but cannot contain its bytes. A
-- manifest row prevents the migration being marked reconciled until the file
-- is copied to Shared Drive and its checksum is verified.
create table if not exists public.legacy_file_manifests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null,
  source_key text not null,
  case_id uuid references public.cases on delete cascade,
  client_id uuid references public.clients on delete cascade,
  document_id uuid references public.documents on delete set null,
  source_path text,
  source_url text,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  expected_checksum text,
  drive_file_id text,
  copied_checksum text,
  status text not null default 'pending'
    check (status in ('pending','copied','verified','missing','failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (organisation_id, source_system, source_key)
);
create index if not exists legacy_file_manifest_status_idx
  on public.legacy_file_manifests(organisation_id, status, imported_at);

-- Partner and university commission exports contain student-level lines. The
-- aggregate invoice remains commission_claims; this table retains the exact
-- fee, percentage and commission for each included student.
create table if not exists public.legacy_finance_line_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null,
  source_key text not null,
  invoice_id uuid references public.invoices on delete cascade,
  commission_claim_id uuid references public.commission_claims on delete cascade,
  case_id uuid references public.cases on delete set null,
  client_id uuid references public.clients on delete set null,
  student_name text,
  contact_email text,
  contact_mobile text,
  course text,
  intake text,
  tuition_fee numeric(14,2),
  commission_rate numeric(7,4),
  commission_amount numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  unique (organisation_id, source_system, source_key)
);

-- Old or inactive staff still need to appear in historical attribution even
-- when they cannot be recreated as an authenticated account.
create table if not exists public.legacy_staff_directory (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null,
  source_key text not null,
  display_name text not null,
  email text,
  mobile text,
  branch_label text,
  role_label text,
  status text,
  target_profile_id uuid references public.profiles,
  original_created_at timestamptz,
  original_updated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (organisation_id, source_system, source_key)
);

create table if not exists public.legacy_master_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null,
  category text not null,
  source_key text not null,
  label text not null,
  value text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  unique (organisation_id, source_system, category, source_key)
);

alter table public.legacy_record_snapshots enable row level security;
alter table public.legacy_activity_events enable row level security;
alter table public.legacy_file_manifests enable row level security;
alter table public.legacy_finance_line_items enable row level security;
alter table public.legacy_staff_directory enable row level security;
alter table public.legacy_master_records enable row level security;

create policy legacy_snapshots_admin on public.legacy_record_snapshots
for all to authenticated
using (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

create policy legacy_activity_case_read on public.legacy_activity_events
for select to authenticated
using (organisation_id=public.current_organisation_id() and public.is_internal_user() and (case_id is null or public.can_view_case(case_id)));
create policy legacy_activity_admin_write on public.legacy_activity_events
for all to authenticated
using (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

create policy legacy_files_admin on public.legacy_file_manifests
for all to authenticated
using (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));
create policy legacy_finance_admin on public.legacy_finance_line_items
for all to authenticated
using (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));
create policy legacy_staff_admin on public.legacy_staff_directory
for all to authenticated
using (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));
create policy legacy_masters_admin on public.legacy_master_records
for all to authenticated
using (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id=public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

commit;
