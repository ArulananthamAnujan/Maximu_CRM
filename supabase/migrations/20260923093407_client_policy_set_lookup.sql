begin;
set local lock_timeout='2s';
-- Compute visible client IDs once for each statement, preserving branch, workspace and stage checks.
create function private.visible_client_ids()
returns setof uuid language sql stable security definer set search_path='' as $$
  select c.id from public.clients c join public.profiles p on p.organisation_id=c.organisation_id
  where p.id=(select auth.uid()) and p.active and (
   p.level::text in ('platform_owner','super_admin')
   or (p.level::text in ('branch_admin','manager','staff','partner') and (
    exists(select 1 from public.cases f where f.client_id=c.id and f.organisation_id=p.organisation_id
      and f.branch_id=p.branch_id
      and private.access_allows(p.level::text,p.function_access,
        case when f.service_type='direct_visa' then 'direct_visa_access' else 'study_access' end)
      and private.access_allows(p.level::text,p.function_access,
        case f.lifecycle_stage::text when 'student' then case when f.service_type='direct_visa' then 'direct_visas' else 'students' end
        when 'application' then 'applications' when 'visa' then 'visas' when 'deferred' then 'defer' when 'completed' then 'case_complete' else 'enquiries' end,f.service_type))
    or (c.branch_id=p.branch_id and not exists(select 1 from public.cases f where f.client_id=c.id)
      and private.access_allows(p.level::text,p.function_access,'enquiries'))))
   or (p.level::text='student' and exists(select 1 from public.client_user_links l where l.profile_id=p.id and l.client_id=c.id))
  )
$$;

revoke all on function private.visible_client_ids() from public,anon;
grant execute on function private.visible_client_ids() to authenticated;
alter policy clients_scoped_select on public.clients
using (organisation_id=(select public.current_organisation_id()) and id in (select private.visible_client_ids()));
alter policy clients_scoped_write on public.clients
using (organisation_id=(select public.current_organisation_id()) and (select public.is_internal_user()) and id in (select private.visible_client_ids()));
commit;
