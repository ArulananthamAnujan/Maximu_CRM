\set ON_ERROR_STOP on
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000009';
insert into public.clients (id,organisation_id,branch_id,crm_id,first_name,last_name)
values ('00000000-0000-4000-8000-00000000f100','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','BRANCH-FILTER-QA','Branch','Shared');
insert into public.cases (id,organisation_id,client_id,branch_id,case_number,service_type)
values ('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f100','00000000-0000-4000-8000-00000000bbbb','BRANCH-WORK-QA','study_abroad');
set test.uid = '00000000-0000-4000-8000-000000000002';
do $$ begin
 if not public.can_modify_client('00000000-0000-4000-8000-00000000f100') then raise exception 'Branch client edit/portal access denied'; end if;
 if not exists(select 1 from public.cases where id='00000000-0000-4000-8000-00000000f101') then raise exception 'Colleague cannot see new unassigned case'; end if;
end $$;
update public.clients set preferred_name='Shared edit' where id='00000000-0000-4000-8000-00000000f100';
set test.uid = '00000000-0000-4000-8000-000000000001';
insert into public.education_applications (id,organisation_id,case_id,institution)
values ('00000000-0000-4000-8000-00000000f102','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f101','Owner action in branch');
set test.uid = '00000000-0000-4000-8000-000000000011';
do $$ begin
 if not exists(select 1 from public.clients where id='00000000-0000-4000-8000-00000000f100' and preferred_name='Shared edit') then raise exception 'Branch admin cannot see shared work'; end if;
 if not exists(select 1 from public.audit_events where resource_id='00000000-0000-4000-8000-00000000f102' and after_data->>'branch_id'='00000000-0000-4000-8000-00000000bbbb') then raise exception 'Branch admin cannot see owner changes to application'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000010';
do $$ begin
 if public.can_modify_client('00000000-0000-4000-8000-00000000f100') then raise exception 'Cross-branch client/portal access permitted'; end if;
 if exists(select 1 from public.cases where id='00000000-0000-4000-8000-00000000f101') then raise exception 'Cross-branch case visible'; end if;
 update public.clients set preferred_name='Cross branch' where id='00000000-0000-4000-8000-00000000f100';
 if found then raise exception 'Cross-branch client edit permitted'; end if;
 begin
  insert into public.cases (organisation_id,client_id,branch_id,case_number,service_type)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000f100','00000000-0000-4000-8000-00000000bbbb','CROSS-BRANCH-DENIED','study_abroad');
  raise exception 'Cross-branch case creation permitted';
 exception when insufficient_privilege then null; end;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000012';
do $$ begin
 if exists(select 1 from public.audit_events where resource_id='00000000-0000-4000-8000-00000000f102') then raise exception 'Other branch admin sees branch audit'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000003';
do $$ begin
 if public.can_modify_client('00000000-0000-4000-8000-00000000f100') then raise exception 'Portal account can edit another client'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from public.cases where id='00000000-0000-4000-8000-00000000f101') then raise exception 'Super admin cannot see staff-created case'; end if;
end $$;
\echo 'Branch creation, editing, portal permission and audit visibility passed.'
