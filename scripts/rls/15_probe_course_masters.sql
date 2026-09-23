\set ON_ERROR_STOP on
begin;
set role authenticated;
set test.uid='00000000-0000-4000-8000-000000000011';
insert into public.institutions(id,organisation_id,name,country,city) values
 ('00000000-0000-4000-8000-00000000f201','00000000-0000-4000-8000-00000000aaaa','Manual QA University','Australia','Melbourne');
insert into public.courses(id,organisation_id,institution_id,name,level,intake_months) values
 ('00000000-0000-4000-8000-00000000f202','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f201','Manual QA Computing','Master','February, July');
set test.uid='00000000-0000-4000-8000-000000000009';
do $$ declare catalogue jsonb; begin
 catalogue:=public.search_course_catalog_v2(p_query=>'Manual QA Computing');
 if catalogue->>'total'<>'1' or catalogue#>>'{courses,0,institution_name}'<>'Manual QA University'
 or catalogue#>>'{courses,0,intake_months}'<>'February, July' then raise exception 'Manual course missing from staff catalogue/autofill'; end if;
 begin
  insert into public.institutions(organisation_id,name,country) values('00000000-0000-4000-8000-00000000aaaa','Unauthorised master','Australia');
  raise exception 'Staff created a master';
 exception when insufficient_privilege then null; end;
end $$;
set test.uid='00000000-0000-4000-8000-000000000001';
update public.profiles set function_access='{"courseFinder":false}' where id='00000000-0000-4000-8000-000000000009';
set test.uid='00000000-0000-4000-8000-000000000009';
do $$ begin
 if exists(select 1 from public.courses) or exists(select 1 from public.institutions) then raise exception 'Catalogue permission denial bypassed'; end if;
end $$;
rollback;
\echo 'Manual masters, staff catalogue and function permission checks passed.'
