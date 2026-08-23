\set ON_ERROR_STOP off
\set QUIET on
\pset format unaligned
\pset tuples_only on

set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000009';   -- same branch, owns nothing

\echo '--- 1. a colleague''s case is still visible (cover and handover) ---'
select 'visible=' || count(*) from public.cases
  where id = '00000000-0000-4000-8000-00000000dddd';

\echo '--- 2. but it cannot be edited ---'
update public.cases set target = 'Hijacked'
  where id = '00000000-0000-4000-8000-00000000dddd';
select 'edited=' || count(*) from public.cases
  where id = '00000000-0000-4000-8000-00000000dddd' and target = 'Hijacked';

\echo '--- 3. and it cannot be moved through the pipeline ---'
select lifecycle_stage from public.move_case_lifecycle(
  '00000000-0000-4000-8000-00000000dddd','student','Not mine to move');

\echo '--- 4. nor can its client record be changed ---'
update public.clients set last_name = 'Hijacked'
  where id = '00000000-0000-4000-8000-00000000cccc';
select 'client_edited=' || count(*) from public.clients
  where id = '00000000-0000-4000-8000-00000000cccc' and last_name = 'Hijacked';

\echo '--- 5. nor its applications ---'
insert into public.education_applications (organisation_id,case_id,institution,course)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000dddd','Sneaky University','Sneaky Course');
select 'application_added=' || count(*) from public.education_applications
  where case_id = '00000000-0000-4000-8000-00000000dddd' and institution = 'Sneaky University';

\echo '--- 6. once it is reassigned to them, they can work it ---'
set test.uid = '00000000-0000-4000-8000-000000000001';   -- an administrator
update public.cases set owner_id = '00000000-0000-4000-8000-000000000009'
  where id = '00000000-0000-4000-8000-00000000dddd';
set test.uid = '00000000-0000-4000-8000-000000000009';
update public.cases set target = 'Now mine'
  where id = '00000000-0000-4000-8000-00000000dddd';
select 'after_reassignment=' || count(*) from public.cases
  where id = '00000000-0000-4000-8000-00000000dddd' and target = 'Now mine';

\echo '--- 7. an administrator is unaffected ---'
set test.uid = '00000000-0000-4000-8000-000000000001';
update public.cases set target = 'Manager edit'
  where id = '00000000-0000-4000-8000-00000000dddd';
select 'admin_edited=' || count(*) from public.cases
  where id = '00000000-0000-4000-8000-00000000dddd' and target = 'Manager edit';

\echo '--- 8. a case officer asks for an archive rather than doing it ---'
set test.uid = '00000000-0000-4000-8000-000000000009';
select public.request_case_archive(
  '00000000-0000-4000-8000-00000000dddd','Client stopped responding');
select 'archive_requests=' || count(*) from public.audit_events
  where action = 'case.archive_requested';
set test.uid = '00000000-0000-4000-8000-000000000001';
select 'managers_notified=' || count(*) from public.notifications
  where kind = 'archive_request';
