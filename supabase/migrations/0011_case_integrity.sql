begin;

-- 1. Passport numbers are protected, not ordinary text.
--
-- The schema always had passport_number_encrypted, but nothing wrote to it and
-- dependant passports were being kept in a plain JSON field. The number is now
-- encrypted by the application before it reaches the database, and a masked
-- form is stored alongside so the interface can show "N12•••••7" without ever
-- holding the real value.
alter table public.clients
  add column if not exists passport_masked text;
alter table public.dependants
  add column if not exists passport_masked text,
  add column if not exists passport_expiry date,
  add column if not exists nationality text,
  add column if not exists included_in_application boolean not null default false,
  add column if not exists visa_status text;

comment on column public.clients.passport_number_encrypted is
  'AES-GCM ciphertext written by the application. Never store a plain number here.';
comment on column public.clients.passport_masked is
  'Display-only masked form, for example N12•••••7.';

-- 2. Migration file records are archived, never destroyed.
--
-- Applications and dependants could be removed outright, which does not sit
-- with a seven-year retention obligation: what was withdrawn, when and by whom
-- is part of the file's history.
alter table public.education_applications
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;
alter table public.dependants
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id),
  add column if not exists archive_reason text;

create index if not exists education_applications_live_idx
  on public.education_applications(case_id) where archived_at is null;
create index if not exists dependants_live_idx
  on public.dependants(client_id) where archived_at is null;

-- 3. A client may attach a file to a document that was requested from them.
--
-- The portal offered the action while the database refused it. A portal account
-- may now attach to its own requested or rejected document and nothing else: it
-- cannot touch a verified document, another client's, or any other column set.
drop policy if exists documents_client_attach on public.documents;
create policy documents_client_attach on public.documents
for update to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = 'student'
  and client_id = public.current_client_id()
  and state in ('requested', 'rejected')
)
with check (
  organisation_id = public.current_organisation_id()
  and client_id = public.current_client_id()
  and state = 'uploaded'
  and uploaded_by = auth.uid()
);

-- 4. A client may ask for an appointment. Staff confirm it.
drop policy if exists appointments_client_request on public.appointments;
create policy appointments_client_request on public.appointments
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = 'student'
  and status = 'requested'
  and exists (
    select 1 from public.cases c
    where c.id = appointments.case_id
      and c.client_id = public.current_client_id()
  )
);

-- 5. A case officer must be able to read the history of their own case.
--
-- audit_events could only be read at manager level and above, so the case
-- timeline showed notes and stage changes but none of the recorded actions to
-- the people who work the file. Organisation-wide audit reading stays with
-- management; this adds the case's own history for whoever may see the case.
drop policy if exists audit_case_read on public.audit_events;
create policy audit_case_read on public.audit_events
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and case_id is not null
  and exists (
    select 1 from public.cases c
    where c.id = audit_events.case_id
      and public.can_access_client(c.client_id)
  )
);

commit;
