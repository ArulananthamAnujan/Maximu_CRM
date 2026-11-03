\set ON_ERROR_STOP on
-- A view-only section: the account reads its records and nothing more. The
-- refusal happens in the database, so it holds for every client of the API.
-- The probe makes its own enquiry so earlier probes moving the seed case
-- through the pipeline cannot change what section it belongs to.
begin;
set role authenticated;
set test.uid='00000000-0000-4000-8000-000000000001';
insert into public.clients (id,organisation_id,branch_id,crm_id,first_name,last_name,email,owner_id) values
  ('00000000-0000-4000-8000-0000000016cc','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','MAX-2026-0016','Vihaan','Probe','vihaan.probe@example.test','00000000-0000-4000-8000-000000000002');
insert into public.cases (id,organisation_id,client_id,branch_id,case_number,service_type,owner_id) values
  ('00000000-0000-4000-8000-0000000016dd','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-0000000016cc','00000000-0000-4000-8000-00000000bbbb','CASE-2026-0016','study_abroad','00000000-0000-4000-8000-000000000002');
set test.uid='00000000-0000-4000-8000-000000000002';
do $$ begin
 if not exists(select 1 from public.cases where id='00000000-0000-4000-8000-0000000016dd') then raise exception 'The officer cannot see the probe case'; end if;
 if not private.case_edit_allowed('00000000-0000-4000-8000-0000000016dd') then raise exception 'Edit was denied before any restriction'; end if;
 update public.cases set next_action='Chase documents' where id='00000000-0000-4000-8000-0000000016dd';
 insert into public.case_notes(organisation_id,case_id,author_id,body) values('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-0000000016dd',auth.uid(),'A note while edit is allowed');
end $$;
set test.uid='00000000-0000-4000-8000-000000000001';
update public.profiles set function_access='{"edit.enquiries":false,"study.edit.students":false}' where id='00000000-0000-4000-8000-000000000002';
set test.uid='00000000-0000-4000-8000-000000000002';
do $$ begin
 if not exists(select 1 from public.cases where id='00000000-0000-4000-8000-0000000016dd') then raise exception 'View-only staff lost sight of their case'; end if;
 if not private.function_allowed('enquiries') then raise exception 'View permission was withdrawn with edit'; end if;
 if private.edit_allowed('enquiries') then raise exception 'Edit reported as allowed on a view-only section'; end if;
 if not private.edit_allowed('work') then raise exception 'A section without an edit restriction lost edit access'; end if;
 if private.case_edit_allowed('00000000-0000-4000-8000-0000000016dd') then raise exception 'The enquiry reports as editable under a view-only rule'; end if;
 begin
  update public.cases set next_action='Chase documents again' where id='00000000-0000-4000-8000-0000000016dd';
  raise exception 'View-only staff changed a case';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.case_notes(organisation_id,case_id,author_id,body) values('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-0000000016dd',auth.uid(),'A note from a view-only account');
  raise exception 'View-only staff wrote a file note';
 exception when insufficient_privilege then null; end;
 begin
  update public.clients set mobile='+61400000999' where id='00000000-0000-4000-8000-0000000016cc';
  raise exception 'View-only staff changed a client';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.case_notes where case_id='00000000-0000-4000-8000-0000000016dd')<>1 then raise exception 'Reading notes is affected by a view-only rule'; end if;
end $$;
set test.uid='00000000-0000-4000-8000-000000000001';
update public.profiles set function_access='{"study.edit.enquiries":false}' where id='00000000-0000-4000-8000-000000000002';
set test.uid='00000000-0000-4000-8000-000000000002';
do $$ begin
 if private.edit_allowed('enquiries','study_abroad') then raise exception 'Study workspace edit still allowed'; end if;
 if not private.edit_allowed('enquiries','direct_visa') then raise exception 'Direct Visa workspace edit was withdrawn too'; end if;
 if private.case_edit_allowed('00000000-0000-4000-8000-0000000016dd') then raise exception 'A study enquiry was editable under a Study view-only rule'; end if;
end $$;
set test.uid='00000000-0000-4000-8000-000000000001';
update public.profiles set function_access=null where id='00000000-0000-4000-8000-000000000002';
set test.uid='00000000-0000-4000-8000-000000000002';
do $$ begin
 if not private.case_edit_allowed('00000000-0000-4000-8000-0000000016dd') then raise exception 'Edit access was not restored'; end if;
 update public.cases set next_action='Chase documents once more' where id='00000000-0000-4000-8000-0000000016dd';
end $$;
rollback;
\echo 'View-only function access checks passed.'
