begin;

alter table public.institutions
  add column if not exists external_code text,
  add column if not exists country_code text,
  add column if not exists source_url text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists last_verified_at timestamptz;

update public.institutions set country = 'United Kingdom', country_code = 'GB'
where lower(trim(country)) in ('uk', 'u.k.', 'great britain', 'united kingdom');
update public.institutions set country = 'United States', country_code = 'US'
where lower(trim(country)) in ('usa', 'u.s.a.', 'us', 'united states', 'united states of america');
update public.institutions set country = 'United Arab Emirates', country_code = 'AE'
where lower(trim(country)) in ('uae', 'u.a.e.', 'dubai', 'united arab emirates');
update public.institutions set country_code = 'AU' where lower(trim(country)) = 'australia' and country_code is null;
update public.institutions set country_code = 'CA' where lower(trim(country)) = 'canada' and country_code is null;
update public.institutions set country_code = 'IE' where lower(trim(country)) = 'ireland' and country_code is null;
update public.institutions set country_code = 'NZ' where lower(trim(country)) = 'new zealand' and country_code is null;
update public.institutions set country_code = 'FR' where lower(trim(country)) = 'france' and country_code is null;
update public.institutions set country_code = 'PL' where lower(trim(country)) = 'poland' and country_code is null;
update public.institutions set country_code = 'SG' where lower(trim(country)) = 'singapore' and country_code is null;
update public.institutions set country_code = 'MT' where lower(trim(country)) = 'malta' and country_code is null;

alter table public.courses
  add column if not exists external_code text,
  add column if not exists source_url text,
  add column if not exists last_verified_at timestamptz;

create index if not exists courses_field_filter_idx
  on public.courses(organisation_id, field_of_study, active);
create index if not exists courses_fee_filter_idx
  on public.courses(organisation_id, tuition_fee, active);
create index if not exists courses_verified_filter_idx
  on public.courses(organisation_id, last_verified_at, active);

-- The catalogue is non-personal reference information. Clients can browse
-- only the same organisation catalogue as their own portal account; all
-- mutations remain protected by the existing manager-only policies.
drop policy if exists institutions_portal_read on public.institutions;
create policy institutions_portal_read on public.institutions
for select to authenticated
using (organisation_id = public.current_organisation_id());

drop policy if exists courses_portal_read on public.courses;
create policy courses_portal_read on public.courses
for select to authenticated
using (organisation_id = public.current_organisation_id());

create table if not exists public.course_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  source_system text not null,
  status text not null check (status in ('running','completed','failed')),
  institutions_seen integer not null default 0,
  courses_seen integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.course_catalog_sync_runs enable row level security;
drop policy if exists course_catalog_sync_runs_admin_read on public.course_catalog_sync_runs;
create policy course_catalog_sync_runs_admin_read on public.course_catalog_sync_runs
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')
);

create or replace function public.search_course_catalog_v2(
  p_query text default null,
  p_country text default null,
  p_level text default null,
  p_field text default null,
  p_intake text default null,
  p_max_fee numeric default null,
  p_max_duration integer default null,
  p_verified_only boolean default false,
  p_institution uuid default null,
  p_limit integer default 30,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  result jsonb;
  safe_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if public.current_organisation_id() is null then
    raise exception 'Course Finder requires an organisation account' using errcode = '42501';
  end if;

  with raw_matched as (
    select c.*, i.name institution_name, i.country, i.city institution_city,
           i.website institution_website, i.external_code institution_external_code,
           i.source_url institution_source_url,
           coalesce(c.last_verified_at, c.source_updated_at, i.last_verified_at, i.source_updated_at) catalogue_verified_at
    from public.courses c
    join public.institutions i on i.id = c.institution_id
    where c.organisation_id = public.current_organisation_id()
      and i.organisation_id = public.current_organisation_id()
      and c.active and i.active
      and (nullif(trim(p_country), '') is null or i.country = p_country)
      and (nullif(trim(p_level), '') is null or c.level = p_level)
      and (nullif(trim(p_field), '') is null or c.field_of_study ilike '%' || trim(p_field) || '%')
      and (nullif(trim(p_intake), '') is null or c.intake_months ilike '%' || trim(p_intake) || '%')
      and (p_max_fee is null or c.tuition_fee <= p_max_fee)
      and (p_max_duration is null or c.duration_months <= p_max_duration)
      and (not coalesce(p_verified_only, false) or coalesce(c.last_verified_at, c.source_updated_at, i.last_verified_at, i.source_updated_at) >= now() - interval '180 days')
      and (p_institution is null or i.id = p_institution)
      and (
        nullif(trim(p_query), '') is null or
        c.name ilike '%' || trim(p_query) || '%' or
        i.name ilike '%' || trim(p_query) || '%' or
        coalesce(c.field_of_study, '') ilike '%' || trim(p_query) || '%' or
        coalesce(c.campus, '') ilike '%' || trim(p_query) || '%' or
        coalesce(c.external_code, '') ilike '%' || trim(p_query) || '%'
      )
  ), matched as (
    select distinct on (
      lower(trim(institution_name)),
      lower(trim(name)),
      lower(trim(coalesce(campus, '')))
    ) *
    from raw_matched
    order by
      lower(trim(institution_name)),
      lower(trim(name)),
      lower(trim(coalesce(campus, ''))),
      catalogue_verified_at desc nulls last
  ), page as (
    select * from matched
    order by catalogue_verified_at desc nulls last, institution_name, name
    limit safe_limit offset safe_offset
  ), country_facets as (
    select i.country value, count(*) amount
    from public.courses c join public.institutions i on i.id = c.institution_id
    where c.organisation_id = public.current_organisation_id() and c.active and i.active
    group by i.country order by i.country
  ), level_facets as (
    select c.level value, count(*) amount
    from public.courses c
    where c.organisation_id = public.current_organisation_id() and c.active and c.level is not null
    group by c.level order by c.level
  ), field_facets as (
    select c.field_of_study value, count(*) amount
    from public.courses c
    where c.organisation_id = public.current_organisation_id() and c.active and nullif(trim(c.field_of_study), '') is not null
    group by c.field_of_study order by count(*) desc, c.field_of_study limit 100
  ), health as (
    select
      count(*) course_count,
      count(distinct c.institution_id) institution_count,
      count(distinct i.country) country_count,
      count(*) filter (where coalesce(c.last_verified_at, c.source_updated_at, i.last_verified_at, i.source_updated_at) < now() - interval '180 days' or coalesce(c.last_verified_at, c.source_updated_at, i.last_verified_at, i.source_updated_at) is null) stale_count,
      count(*) filter (where c.tuition_fee is null) missing_fee_count,
      count(*) filter (where nullif(trim(coalesce(c.website, i.website)), '') is null) missing_website_count,
      max(coalesce(c.last_verified_at, c.source_updated_at, i.last_verified_at, i.source_updated_at)) last_verified_at
    from public.courses c join public.institutions i on i.id = c.institution_id
    where c.organisation_id = public.current_organisation_id() and c.active and i.active
  )
  select jsonb_build_object(
    'courses', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
    'total', (select count(*) from matched),
    'countries', coalesce((select jsonb_agg(to_jsonb(country_facets)) from country_facets), '[]'::jsonb),
    'levels', coalesce((select jsonb_agg(to_jsonb(level_facets)) from level_facets), '[]'::jsonb),
    'fields', coalesce((select jsonb_agg(to_jsonb(field_facets)) from field_facets), '[]'::jsonb),
    'health', (select to_jsonb(health) from health)
  ) into result;
  return result;
end;
$$;

revoke all on function public.search_course_catalog_v2(text,text,text,text,text,numeric,integer,boolean,uuid,integer,integer) from public;
grant execute on function public.search_course_catalog_v2(text,text,text,text,text,numeric,integer,boolean,uuid,integer,integer) to authenticated;

comment on function public.search_course_catalog_v2 is 'Student-safe course catalogue search with practical advising filters and source freshness reporting.';

commit;
