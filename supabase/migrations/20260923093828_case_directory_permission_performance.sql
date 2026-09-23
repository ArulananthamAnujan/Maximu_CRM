begin;
set local lock_timeout='2s';
-- Test branch scope directly on the row; do not fetch the same case again
-- through nested SECURITY DEFINER helpers during a directory scan.
alter policy cases_scoped_select on public.cases using (
 organisation_id=(select public.current_organisation_id()) and
 case when (select public.current_user_level())::text in ('platform_owner','super_admin') then true
 when (select public.is_internal_user()) then branch_id=(select public.current_user_branch())
 when (select public.current_user_level())::text='student' then client_id=(select public.current_client_id())
 else false end
);
alter policy cases_scoped_write on public.cases using (
 organisation_id=(select public.current_organisation_id()) and (select public.is_internal_user())
 and ((select public.current_user_level())::text in ('platform_owner','super_admin') or branch_id=(select public.current_user_branch()))
);
-- Keep the existing restrictive workspace/stage policy. Only its actor
-- lookup is cached; the stage and service remain row-specific.
alter policy function_access on public.cases using (
 private.access_allows((select public.current_user_level())::text,
 (select p.function_access from public.profiles p where p.id=(select auth.uid())),
 case lifecycle_stage::text when 'student' then case when service_type='direct_visa' then 'direct_visas' else 'students' end
 when 'application' then 'applications' when 'visa' then 'visas' when 'deferred' then 'defer' when 'completed' then 'case_complete' else 'enquiries' end,service_type)
);
alter policy enquiries_read on public.enquiries using (
 organisation_id=(select public.current_organisation_id()) and
 case when (select public.is_internal_user()) then
 ((case_id is not null and case_id in (select id from public.cases)) or (case_id is null and client_id in (select id from public.clients)))
 else ((case_id is not null and public.can_access_case(case_id)) or (case_id is null and public.can_access_client(client_id))) end
);
alter policy enquiries_write on public.enquiries using (
 organisation_id=(select public.current_organisation_id()) and (select public.is_internal_user()) and
 ((case_id is not null and case_id in (select id from public.cases)) or (case_id is null and client_id in (select id from public.clients)))
);
commit;
