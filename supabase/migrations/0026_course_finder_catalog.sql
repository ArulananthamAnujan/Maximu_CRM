begin;

create extension if not exists pg_trgm with schema extensions;

-- Preserve the full legacy Course Finder export and search it server-side.
-- The earlier schema was deliberately small and forced the browser to download
-- every course; that is not viable for the 61,000+ row Maximus catalogue.

alter table public.institutions
  add column if not exists source_system text,
  add column if not exists source_key text;

alter table public.courses
  add column if not exists source_system text,
  add column if not exists source_key text,
  add column if not exists campus text,
  add column if not exists website text,
  add column if not exists application_fee numeric(12,2),
  add column if not exists expected_commission text,
  add column if not exists ielts_overall numeric(5,2),
  add column if not exists ielts_band text,
  add column if not exists toefl_overall numeric(6,2),
  add column if not exists toefl_band text,
  add column if not exists pte_overall numeric(6,2),
  add column if not exists pte_band text,
  add column if not exists duolingo_score numeric(6,2),
  add column if not exists gpa_score text,
  add column if not exists application_deadline text,
  add column if not exists entry_requirements text,
  add column if not exists scholarship text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists legacy_data jsonb not null default '{}'::jsonb;

create unique index if not exists institutions_source_key_uidx
  on public.institutions(organisation_id, source_system, source_key);
create unique index if not exists courses_source_key_uidx
  on public.courses(organisation_id, source_system, source_key);
create index if not exists institutions_country_name_idx
  on public.institutions(organisation_id, country, name);
create index if not exists courses_catalog_filter_idx
  on public.courses(organisation_id, active, level, institution_id);
create index if not exists institutions_name_trgm_idx
  on public.institutions using gin (name extensions.gin_trgm_ops);
create index if not exists courses_name_trgm_idx
  on public.courses using gin (name extensions.gin_trgm_ops);
create index if not exists courses_field_trgm_idx
  on public.courses using gin (field_of_study extensions.gin_trgm_ops);

create or replace function public.search_course_catalog(
  p_query text default null,
  p_country text default null,
  p_level text default null,
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
  if not public.is_internal_user() then
    raise exception 'Course Finder is available to staff only' using errcode = '42501';
  end if;

  with matched as (
    select c.*, i.name institution_name, i.country, i.city institution_city,
           i.website institution_website
    from public.courses c
    join public.institutions i on i.id = c.institution_id
    where c.organisation_id = public.current_organisation_id()
      and i.organisation_id = public.current_organisation_id()
      and c.active and i.active
      and (nullif(trim(p_country), '') is null or i.country = p_country)
      and (nullif(trim(p_level), '') is null or c.level = p_level)
      and (p_institution is null or i.id = p_institution)
      and (
        nullif(trim(p_query), '') is null or
        c.name ilike '%' || trim(p_query) || '%' or
        i.name ilike '%' || trim(p_query) || '%' or
        coalesce(c.field_of_study, '') ilike '%' || trim(p_query) || '%' or
        coalesce(c.campus, '') ilike '%' || trim(p_query) || '%'
      )
  ), page as (
    select * from matched order by institution_name, name limit safe_limit offset safe_offset
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
  )
  select jsonb_build_object(
    'courses', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
    'total', (select count(*) from matched),
    'countries', coalesce((select jsonb_agg(to_jsonb(country_facets)) from country_facets), '[]'::jsonb),
    'levels', coalesce((select jsonb_agg(to_jsonb(level_facets)) from level_facets), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.search_course_catalog(text,text,text,uuid,integer,integer) from public;
grant execute on function public.search_course_catalog(text,text,text,uuid,integer,integer) to authenticated;

comment on function public.search_course_catalog is 'Paginated, organisation-scoped Course Finder search with filter facets.';

commit;
