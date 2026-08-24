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

\echo '--- 5b. nor what its client has been billed, before the case is theirs ---'
select 'invoice_visible_before_reassignment=' || count(*) from public.invoices
  where id = '00000000-0000-4000-8000-00000000fee1';

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

\echo '--- 9. the case owner reads their own interaction ---'
set test.uid = '00000000-0000-4000-8000-000000000002';
select 'owner_reads=' || count(*) from public.ai_interactions
  where case_id = '00000000-0000-4000-8000-00000000dddd';

\echo '--- 10. the colleague who now owns the case (reassigned above) can also read it ---'
set test.uid = '00000000-0000-4000-8000-000000000009';
select 'new_owner_reads=' || count(*) from public.ai_interactions
  where case_id = '00000000-0000-4000-8000-00000000dddd';

\echo '--- 11. a portal account reads none of it ---'
set test.uid = '00000000-0000-4000-8000-000000000003';
select 'portal_reads=' || count(*) from public.ai_interactions
  where case_id = '00000000-0000-4000-8000-00000000dddd';

\echo '--- 12. an interaction cannot be written against a case that is not accessible ---'
set test.uid = '00000000-0000-4000-8000-000000000003';
insert into public.ai_interactions
  (organisation_id, profile_id, case_id, purpose, prompt_redacted, response_redacted, status)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-00000000dddd','case_draft','x','y','completed');
select 'portal_writes=' || count(*) from public.ai_interactions
  where profile_id = '00000000-0000-4000-8000-000000000003';

\echo '--- 13. the case owner (reassigned in step 6) sees what their client has been billed ---'
set test.uid = '00000000-0000-4000-8000-000000000009';
select 'invoice_visible_to_owner=' || count(*) from public.invoices
  where id = '00000000-0000-4000-8000-00000000fee1';
