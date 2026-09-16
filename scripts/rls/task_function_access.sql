-- Run after scripts/audit/seed.sql. All verification data is rolled back.
begin;
insert into auth.users(id,email) values('c0000000-0000-4000-8000-000000000091','limited@maximus.test'),('c0000000-0000-4000-8000-000000000092','inherited@maximus.test');
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000001';
insert into public.profiles(id,organisation_id,branch_id,display_name,email,level,function_access) values('c0000000-0000-4000-8000-000000000091','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Limited account','limited@maximus.test','staff','{"work":false,"finance":false,"administration":false,"enquiries":true,"applications":true}');
insert into public.roles(id,organisation_id,name,level) values('f9000000-0000-4000-8000-000000000091','a0000000-0000-4000-8000-000000000001','Limited test role','staff');
insert into public.staff_invitations(id,organisation_id,branch_id,role_id,email,level,invited_by,function_access) values('f9000000-0000-4000-8000-000000000092','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000091','invited@maximus.test','staff',auth.uid(),'{"finance":false,"work":false,"enquiries":true,"applications":true}');
select public.task_action('create','f9000000-0000-4000-8000-000000000001','{"title":"Completion test","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
select public.task_action('create','f9000000-0000-4000-8000-000000000001','{"title":"Retry","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
select public.task_action('create','f9000000-0000-4000-8000-000000000002','{"title":"Case follow-up","caseId":"e0000000-0000-4000-8000-000000000001","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
set local test.uid='c0000000-0000-4000-8000-000000000003';
do $$declare t public.tasks; begin
 select * into t from public.tasks where id='f9000000-0000-4000-8000-000000000001';
 if t.title<>'Completion test' then raise exception 'Retry changed original task'; end if;
 perform public.task_action('status',t.id,'{"status":"completed"}',t.updated_at);
 select * into t from public.tasks where id=t.id;
 if t.completed_by<>auth.uid() or t.completed_at is null then raise exception 'Completion attribution missing'; end if;
 perform public.task_action('status',t.id,'{"status":"completed"}',t.updated_at);
 if (select count(*) from public.notifications where recipient_id=auth.uid() and title = 'Task completed: Completion test')<>1 then raise exception 'Expected exactly one completion notification'; end if;
 begin perform public.task_action('edit',t.id,'{}','2000-01-01');raise exception 'Stale write succeeded';exception when serialization_failure then null;end;
 perform public.task_action('comment',t.id,'{"id":"f9000000-0000-4000-8000-000000000003","body":"Work done"}',null);
 perform public.task_action('comment',t.id,'{"id":"f9000000-0000-4000-8000-000000000003","body":"Work done"}',null);
 if (select count(*) from public.task_comments where task_id=t.id)<>1 then raise exception 'Comment retry duplicated'; end if;
 begin perform public.set_function_access(auth.uid(),'{}');raise exception 'Staff elevated access';exception when insufficient_privilege then null;end;
 begin perform public.task_action('create',gen_random_uuid(),'{"title":"Cross branch","assignedTo":"c0000000-0000-4000-8000-000000000005"}',null);raise exception 'Cross branch assignment succeeded';exception when invalid_parameter_value then null;end;
end $$;
set local test.uid='c0000000-0000-4000-8000-000000000005';
do $$begin if exists(select 1 from public.tasks where id='f9000000-0000-4000-8000-000000000001') or exists(select 1 from public.task_comments where task_id='f9000000-0000-4000-8000-000000000001') then raise exception 'Cross branch data leak';end if;end $$;
set local test.uid='c0000000-0000-4000-8000-000000000001';
do $$begin if (select count(*) from public.notifications where recipient_id=auth.uid() and title = 'Task completed: Completion test')<>1 then raise exception 'Assigner notification missing';end if;end $$;
select public.set_function_access('c0000000-0000-4000-8000-000000000002','{"work":false,"finance":false}');
set local test.uid='c0000000-0000-4000-8000-000000000002';
insert into public.profiles(id,organisation_id,branch_id,display_name,email,level,function_access) values('c0000000-0000-4000-8000-000000000092','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Inherited account','inherited@maximus.test','staff','{"work":true,"finance":true}');
do $$begin
 if (select function_access->>'work' from public.profiles where id='c0000000-0000-4000-8000-000000000092')<>'false' then raise exception 'New account escaped creator restrictions';end if;
 begin update public.staff_invitations set level='super_admin' where id='f9000000-0000-4000-8000-000000000092';raise exception 'Invitation role escalated';exception when insufficient_privilege then null;end;
end $$;
set local test.uid='c0000000-0000-4000-8000-000000000006';
select public.claim_staff_invitation();
select public.claim_staff_invitation();
do $$begin
 if (select function_access->>'finance' from public.profiles where id=auth.uid())<>'false' then raise exception 'Invitation lost selected access';end if;
 if private.function_allowed('finance') or private.function_allowed('work') then raise exception 'Invited staff can access disabled function';end if;
 if not private.function_allowed('enquiries') or not private.function_allowed('applications') then raise exception 'Allowed function blocked';end if;
 if exists(select 1 from public.invoices) or exists(select 1 from public.tasks) then raise exception 'Disabled data visible';end if;
 begin perform public.task_action('create',gen_random_uuid(),'{"title":"Denied"}',null);raise exception 'Disabled task write succeeded';exception when insufficient_privilege then null;end;
end $$;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.set_function_access('c0000000-0000-4000-8000-000000000003','{"calendar":true,"communications":false}');
set local test.uid='c0000000-0000-4000-8000-000000000003';
insert into public.mailbox_connections(organisation_id,profile_id,email,provider) values('a0000000-0000-4000-8000-000000000001',auth.uid(),'officer@maximus.test','google_calendar');
do $$begin
 if not exists(select 1 from public.mailbox_connections where profile_id=auth.uid() and provider='google_calendar') then raise exception 'Calendar connection hidden';end if;
 begin insert into public.mailbox_connections(organisation_id,profile_id,email,provider) values('a0000000-0000-4000-8000-000000000001',auth.uid(),'blocked@maximus.test','gmail');raise exception 'Disabled Gmail write succeeded';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if (select status from public.staff_invitations where id='f9000000-0000-4000-8000-000000000092')<>'accepted' then raise exception 'Invitation acceptance missing';end if;
 if not exists(select 1 from public.profile_roles where profile_id='c0000000-0000-4000-8000-000000000006') then raise exception 'Invitation role link missing';end if;
end $$;
rollback;
