\set ON_ERROR_STOP on
begin;
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000001';

-- This entire probe is rolled back. The client and first case were created
-- by the branch-work probe, with a real note and institution application.
insert into public.cases(id,organisation_id,client_id,branch_id,case_number,service_type)
values('00000000-0000-4000-8000-00000000f105','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f100','00000000-0000-4000-8000-00000000bbbb','BRANCH-SIBLING-QA','direct_visa');
insert into public.documents(id,organisation_id,client_id,case_id,document_type,display_name,drive_file_id,checksum)
values('00000000-0000-4000-8000-00000000f106','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f100','00000000-0000-4000-8000-00000000f101','passport','Transfer fixture','unchanged-drive-id','unchanged-checksum');
insert into public.tasks(id,organisation_id,case_id,client_id,title,assigned_to)
values('00000000-0000-4000-8000-00000000f107','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000f100','Original branch task','00000000-0000-4000-8000-000000000009');
insert into public.appointments(id,organisation_id,case_id,owner_id,title,appointment_type,starts_at,ends_at)
values('00000000-0000-4000-8000-00000000f108','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-000000000009','Original branch appointment','consultation',now()+interval '1 day',now()+interval '1 day 1 hour');

do $$ declare actor text; begin
  foreach actor in array array['00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003'] loop
    perform set_config('test.uid',actor,true);
    begin
      perform public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbb2','00000000-0000-4000-8000-00000000bbbb','Unauthorized transfer');
      raise exception 'A non-Super-Admin transferred a case';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    perform public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbb2',null,'Stale form');
    raise exception 'Stale source branch accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbbb','00000000-0000-4000-8000-00000000bbbb','Same branch');
    raise exception 'Same-branch transfer accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000ffff','00000000-0000-4000-8000-00000000bbbb','Unknown branch');
    raise exception 'Unknown branch accepted';
  exception when invalid_parameter_value then null; end;
end $$;
select public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbb2','00000000-0000-4000-8000-00000000bbbb','Requested branch handover');

-- Destination colleagues need no assignment and can edit the common client
-- even while a sibling case remains in the original branch.
do $$ declare actor text; begin
  foreach actor in array array['00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012'] loop
    perform set_config('test.uid',actor,true);
    if not public.can_modify_case('00000000-0000-4000-8000-00000000f101') then raise exception 'Destination colleague cannot work the case'; end if;
    update public.clients set preferred_name='Destination edit' where id='00000000-0000-4000-8000-00000000f100';
    if not found then raise exception 'Destination colleague cannot edit common profile'; end if;
    if exists(select 1 from public.cases where id='00000000-0000-4000-8000-00000000f105') then raise exception 'Untransferred sibling case leaked'; end if;
    if not exists(select 1 from public.documents where id='00000000-0000-4000-8000-00000000f106' and drive_file_id='unchanged-drive-id' and checksum='unchanged-checksum') then raise exception 'Document lost or changed'; end if;
    if not exists(select 1 from public.case_notes where id='00000000-0000-4000-8000-00000000f103' and body='Original branch note') then raise exception 'Original note lost'; end if;
    if not exists(select 1 from public.education_applications where id='00000000-0000-4000-8000-00000000f102') then raise exception 'Application lost'; end if;
    if not exists(select 1 from public.tasks where id='00000000-0000-4000-8000-00000000f107') then raise exception 'Task lost'; end if;
    if not exists(select 1 from public.appointments where id='00000000-0000-4000-8000-00000000f108') then raise exception 'Appointment lost'; end if;
    begin
      update public.clients set branch_id='00000000-0000-4000-8000-00000000bbb2' where id='00000000-0000-4000-8000-00000000f100';
      raise exception 'Shared profile permission allowed changing its branch';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000009';
do $$ begin
  if exists(select 1 from public.cases where id='00000000-0000-4000-8000-00000000f101') then raise exception 'Previous branch retains case'; end if;
  if exists(select 1 from public.case_notes where id='00000000-0000-4000-8000-00000000f103') then raise exception 'Previous branch retains notes'; end if;
  if exists(select 1 from public.documents where id='00000000-0000-4000-8000-00000000f106') then raise exception 'Previous branch retains documents'; end if;
  if exists(select 1 from public.tasks where id='00000000-0000-4000-8000-00000000f107') then raise exception 'Former task assignee retains access'; end if;
  if exists(select 1 from public.appointments where id='00000000-0000-4000-8000-00000000f108') then raise exception 'Former appointment owner retains access'; end if;
  if not public.can_modify_case('00000000-0000-4000-8000-00000000f105') then raise exception 'Original sibling case lost'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000001';
select public.transfer_case_branch('00000000-0000-4000-8000-00000000f105','00000000-0000-4000-8000-00000000bbb2','00000000-0000-4000-8000-00000000bbbb','Transfer final sibling');
do $$ begin
  if not exists(select 1 from public.clients where id='00000000-0000-4000-8000-00000000f100' and branch_id='00000000-0000-4000-8000-00000000bbb2') then raise exception 'Client home branch not moved'; end if;
  if (select count(*) from public.audit_events where action='case.branch_transferred' and case_id='00000000-0000-4000-8000-00000000f101' and actor_id=auth.uid() and before_data->>'branch_id'='00000000-0000-4000-8000-00000000bbbb' and after_data->>'reason'='Requested branch handover')<>1 then raise exception 'Transfer audit missing or duplicated'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000009';
do $$ begin
  if exists(select 1 from public.clients where id='00000000-0000-4000-8000-00000000f100') then raise exception 'Previous branch retains profile after all cases moved'; end if;
end $$;
rollback;
\echo 'Branch transfer permission, preservation, sibling isolation and audit checks passed.'
