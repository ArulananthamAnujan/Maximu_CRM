begin;
set local lock_timeout='2s';
-- Resolve the actor once inside each indexed client lookup. The previous
-- nested helper chain reread the same profile repeatedly for every case.
create function private.client_visible(target_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.clients c join public.profiles p on p.organisation_id=c.organisation_id
  where c.id=target_client and p.id=(select auth.uid()) and p.active and (
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
 )
$$;
revoke all on function private.client_visible(uuid) from public,anon;
grant execute on function private.client_visible(uuid) to authenticated;
create or replace function public.can_access_client(target_client uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select private.client_visible(target_client)
$$;
revoke all on function public.can_access_client(uuid) from public,anon;
grant execute on function public.can_access_client(uuid) to authenticated;
commit;
