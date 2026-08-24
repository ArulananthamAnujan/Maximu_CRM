begin;

-- Course Finder: the institution and course reference data a Study Abroad
-- agency advises clients against. This never existed -- "Course or visa
-- target" on a case was a free-text field with nothing behind it, so the
-- same institution or course got typed differently every time it came up
-- and nothing connected a case to a canonical record of either.

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  name text not null,
  country text not null,
  city text,
  website text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  institution_id uuid not null references public.institutions on delete cascade,
  name text not null,
  level text,
  field_of_study text,
  duration_months smallint,
  tuition_fee numeric(12,2),
  currency text not null default 'AUD',
  intake_months text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index courses_institution_idx on public.courses(institution_id);

alter table public.institutions enable row level security;
alter table public.courses enable row level security;

-- Any internal user browses -- advising a client is exactly what a case
-- officer does with this, not a management-only lookup -- and only the
-- roles that maintain masters data elsewhere (branches, templates,
-- workflows) can add or change an entry.
create policy institutions_internal_read on public.institutions
for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy institutions_admin_write on public.institutions
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

create policy courses_internal_read on public.courses
for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy courses_admin_write on public.courses
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

comment on table public.institutions is 'Course Finder: institutions an agency places students with, scoped to the organisation.';
comment on table public.courses is 'Course Finder: courses offered by an institution, browsed when advising a client.';

commit;
