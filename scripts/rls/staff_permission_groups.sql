begin;
-- All data and account changes in this verification are rolled back.
insert into public.cases(id,organisation_id,client_id,branch_id,case_number,service_type,owner_id,lifecycle_stage)
select 'e0000000-0000-4000-8000-000000000099',organisation_id,client_id,branch_id,'TEST-DIRECT-PERMISSIONS','direct_visa',owner_id,'enquiry'
from public.cases where id='e0000000-0000-4000-8000-000000000001';
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.set_function_access('c0000000-0000-4000-8000-000000000003','{"study_access":true,"direct_visa_access":false,"study.finance":false,"action_delete":false,"action_assign":false,"action_export":false,"action_send_email":false,"action_send_sms":false,"action_send_whatsapp":false}');
set local test.uid='c0000000-0000-4000-8000-000000000003';
do $$ declare item uuid; stamp timestamptz;
begin
 if private.case_workspace_allowed('e0000000-0000-4000-8000-000000000099') then raise exception 'Direct Visa workspace still allowed';end if;
 if exists(select 1 from public.cases where service_type='direct_visa') then raise exception 'Direct Visa records leaked';end if;
 if not exists(select 1 from public.cases where id='e0000000-0000-4000-8000-000000000001') then raise exception 'Study record hidden';end if;
 if private.function_allowed('finance') then raise exception 'Disabled account function still allowed';end if;
 if private.function_allowed('action_delete') or private.function_allowed('action_bulk_delete') then raise exception 'Delete restriction bypassed';end if;
 item:=gen_random_uuid();
 perform public.task_action('create',item,'{"title":"Own task allowed"}',null);
 select updated_at into stamp from public.tasks where id=item;
 begin perform public.task_action('delete',item,'{}',stamp);raise exception 'Disabled delete succeeded';exception when insufficient_privilege then null;end;
 begin perform public.task_action('edit',item,'{"assignedTo":"c0000000-0000-4000-8000-000000000002"}',stamp);raise exception 'Disabled assignment succeeded';exception when insufficient_privilege then null;end;
 perform public.task_action('status',item,'{"status":"completed"}',stamp);
 begin insert into public.audit_events(organisation_id,actor_id,action,resource_type,summary) values(public.current_organisation_id(),auth.uid(),'records.exported','export','Denied export');raise exception 'Disabled export succeeded';exception when insufficient_privilege then null;end;
 if private.access_allows('staff','{"study_access":false,"direct_visa_access":true,"direct_visa.enquiries":true}','enquiries','study') then raise exception 'Mode ignored';end if;
 if not private.access_allows('staff','{"study_access":false,"direct_visa_access":true,"direct_visa.enquiries":true}','enquiries','direct_visa') then raise exception 'Direct permission not applied';end if;
 if private.access_allows('staff','{"special_access":false,"action_send_email":true}','action_send_email') then raise exception 'Special master ignored';end if;
 if private.access_allows('staff','{"study.applications":false}','view_applications','study') then raise exception 'Application dependency ignored';end if;
 if private.valid_function_access('{"study.unknown":true}') or private.valid_function_access('{"action_delete":"yes"}') then raise exception 'Invalid permission accepted';end if;
 begin update public.profiles set function_access='{}' where id=auth.uid();exception when insufficient_privilege then null;end;
 if private.function_allowed('action_delete') then raise exception 'Self escalation succeeded';end if;
end $$;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.set_function_access('c0000000-0000-4000-8000-000000000003','{"study_access":false,"direct_visa_access":true}');
set local test.uid='c0000000-0000-4000-8000-000000000003';
do $$begin
 if exists(select 1 from public.cases where service_type<>'direct_visa') then raise exception 'Study records leaked to Direct Visa-only account';end if;
 if not exists(select 1 from public.cases where id='e0000000-0000-4000-8000-000000000099') then raise exception 'Allowed Direct Visa record hidden';end if;
end $$;

set local test.uid='c0000000-0000-4000-8000-000000000001';
insert into public.roles(id,organisation_id,name,level) values('f9000000-0000-4000-8000-000000000095',public.current_organisation_id(),'Grouped permission invite','staff');
insert into public.staff_invitations(organisation_id,branch_id,role_id,email,level,invited_by,function_access,staff_details)
values(public.current_organisation_id(),'b0000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000095','invited@maximus.test','staff',auth.uid(),'{"direct_visa_access":false,"action_export":false}', '{"mobile":"+61400123456","timezone":"Asia/Dhaka"}');
set local test.uid='c0000000-0000-4000-8000-000000000006';
select public.claim_staff_invitation();
do $$begin
 if private.function_allowed('direct_visa_access') or private.function_allowed('action_export') then raise exception 'Invitation lost grouped permissions';end if;
 if (select staff_details->>'timezone' from public.profiles where id=auth.uid())<>'Asia/Dhaka' then raise exception 'Invitation lost staff details';end if;
end $$;
reset role;
rollback;
