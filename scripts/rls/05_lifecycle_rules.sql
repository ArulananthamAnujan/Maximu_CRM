\set ON_ERROR_STOP off
\set QUIET on
\pset format unaligned
\pset tuples_only on

set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000002';   -- staff (case owner)

\echo '--- 1. enquiry -> student (forward) ---'
select 'stage=' || lifecycle_stage || ' progress=' || progress
  from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','student','Converted from enquiry');

\echo '--- 2. student -> application (forward) ---'
select 'stage=' || lifecycle_stage || ' progress=' || progress
  from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','application');

\echo '--- 3. application -> visa WITHOUT visa expiry (must fail) ---'
select lifecycle_stage from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','visa');

\echo '--- 4. record visa expiry, then application -> visa ---'
update public.cases set visa_expiry_on = '2027-03-31'
  where id = '00000000-0000-4000-8000-00000000dddd';
select 'stage=' || lifecycle_stage || ' progress=' || progress
  from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','visa');

\echo '--- 5. visa -> application (backward, the requested reversal) ---'
select 'stage=' || lifecycle_stage || ' progress=' || progress
  from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','application');

\echo '--- 6. application -> completed (must fail: only from visa) ---'
select lifecycle_stage from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','completed');

\echo '--- 7. back to visa, then complete (visa approved) ---'
select lifecycle_stage from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','visa');
select 'stage=' || lifecycle_stage || ' progress=' || progress
       || ' closed=' || (closed_at is not null) || ' outcome=' || coalesce(outcome,'-')
  from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','completed','Visa approved');

\echo '--- 8. reopen a long-completed case into applications ---'
select 'stage=' || lifecycle_stage || ' progress=' || progress
       || ' closed=' || (closed_at is not null)
       || ' reopened=' || (reopened_at is not null) || ' health=' || health
  from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','application','Student changed course');

\echo '--- 9. moving to the stage it is already on (must fail) ---'
select lifecycle_stage from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','application');

\echo '--- 10. student portal account attempts a transition (must fail) ---'
set test.uid = '00000000-0000-4000-8000-000000000003';
select lifecycle_stage from public.move_case_lifecycle('00000000-0000-4000-8000-00000000dddd','visa');

\echo '--- 11. recorded lifecycle history ---'
set test.uid = '00000000-0000-4000-8000-000000000002';
select coalesce(from_stage::text,'(new)') || ' -> ' || to_stage || ' :: ' || coalesce(reason,'-')
  from public.case_lifecycle_events order by id;
