begin;
set local lock_timeout='2s';
-- Cache row-independent permission checks once per statement, retaining all RLS predicates.
alter policy courses_internal_read on public.courses using (organisation_id=(select public.current_organisation_id()) and (select public.is_internal_user()));
alter policy courses_portal_read on public.courses using (organisation_id=(select public.current_organisation_id()));
alter policy courses_admin_write on public.courses using (organisation_id=(select public.current_organisation_id()) and (select public.current_user_level())::text in ('platform_owner','super_admin','branch_admin','manager')) with check (organisation_id=(select public.current_organisation_id()) and (select public.current_user_level())::text in ('platform_owner','super_admin','branch_admin','manager'));
alter policy function_access on public.courses using ((select private.any_function_allowed(array['courseFinder']))) with check ((select private.any_function_allowed(array['courseFinder'])));
alter policy institutions_internal_read on public.institutions using (organisation_id=(select public.current_organisation_id()) and (select public.is_internal_user()));
alter policy institutions_portal_read on public.institutions using (organisation_id=(select public.current_organisation_id()));
alter policy institutions_admin_write on public.institutions using (organisation_id=(select public.current_organisation_id()) and (select public.current_user_level())::text in ('platform_owner','super_admin','branch_admin','manager')) with check (organisation_id=(select public.current_organisation_id()) and (select public.current_user_level())::text in ('platform_owner','super_admin','branch_admin','manager'));
alter policy function_access on public.institutions using ((select private.any_function_allowed(array['courseFinder']))) with check ((select private.any_function_allowed(array['courseFinder'])));
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
  caller_organisation uuid := public.current_organisation_id();
  safe_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if caller_organisation is null then
    raise exception 'Course Finder requires an organisation account' using errcode = '42501';
  end if;

  with raw_matched as (
    select c.*, i.name institution_name, i.country, i.city institution_city,
           i.website institution_website, i.external_code institution_external_code,
           i.source_url institution_source_url,
           coalesce(c.last_verified_at, c.source_updated_at, i.last_verified_at, i.source_updated_at) catalogue_verified_at
    from public.courses c
    join public.institutions i on i.id = c.institution_id
    where c.organisation_id = caller_organisation
      and i.organisation_id = caller_organisation
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
    where c.organisation_id = caller_organisation and c.active and i.active
    group by i.country order by i.country
  ), level_facets as (
    select c.level value, count(*) amount
    from public.courses c
    where c.organisation_id = caller_organisation and c.active and c.level is not null
    group by c.level order by c.level
  ), field_facets as (
    select c.field_of_study value, count(*) amount
    from public.courses c
    where c.organisation_id = caller_organisation and c.active and nullif(trim(c.field_of_study), '') is not null
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
    where c.organisation_id = caller_organisation and c.active and i.active
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


commit;
