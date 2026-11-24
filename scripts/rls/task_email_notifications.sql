-- Run after scripts/audit/seed.sql. Never sends email; all data is rolled back.
begin;
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.task_action('create','f8000000-0000-4000-8000-000000000001','{"title":"Email test","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
select public.task_action('create','f8000000-0000-4000-8000-000000000001','{"title":"Retry","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
do $$begin
 begin perform * from public.task_email_outbox; raise exception 'Staff can read outbox'; exception when insufficient_privilege then null; end;
 begin perform * from public.claim_task_emails('sender@test.invalid','https://crm.test'); raise exception 'Staff can claim emails'; exception when insufficient_privilege then null; end;
 begin perform public.finish_task_email(gen_random_uuid(),gen_random_uuid(),'sent'); raise exception 'Staff can forge delivery'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$begin
 if (select count(*) from public.task_email_outbox where task_id='f8000000-0000-4000-8000-000000000001' and event_kind='assigned')<>1 then raise exception 'Assignment must queue exactly once'; end if;
end $$;
set local role service_role;
set local test.uid='';
do $$declare q public.task_email_outbox; again public.task_email_outbox; begin
 select * into q from public.claim_task_emails('sender@test.invalid','https://crm.test');
 if q.recipient_id<>'c0000000-0000-4000-8000-000000000003' or q.event_kind<>'assigned' then raise exception 'Wrong assignment recipient'; end if;
 if exists(select 1 from public.claim_task_emails('sender@test.invalid','https://crm.test')) then raise exception 'Concurrent claim duplicated email'; end if;
 perform public.finish_task_email(q.id,gen_random_uuid(),'sent','fake');
 if (select status from public.task_email_outbox where id=q.id)<>'processing' then raise exception 'Stale token accepted'; end if;
 perform public.finish_task_email(q.id,q.lock_token,'queued',null,'Transient failure');
 update public.task_email_outbox set available_at=now() where id=q.id;
 select * into again from public.claim_task_emails('changed@test.invalid','https://changed.test');
 if q.payload is distinct from again.payload or q.id<>again.id or q.lock_token=again.lock_token then raise exception 'Retry payload/key not stable'; end if;
 perform public.finish_task_email(again.id,again.lock_token,'sent','provider-id');
end $$;
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000003';
do $$declare t public.tasks; begin
 select * into t from public.tasks where id='f8000000-0000-4000-8000-000000000001';
 perform public.task_action('status',t.id,'{"status":"completed"}',t.updated_at);
 select * into t from public.tasks where id=t.id;
 perform public.task_action('status',t.id,'{"status":"completed"}',t.updated_at);
end $$;
reset role;
do $$begin
 if (select count(*) from public.task_email_outbox where task_id='f8000000-0000-4000-8000-000000000001' and event_kind='completed')<>1 then raise exception 'Completion duplicated or missing'; end if;
 if not exists(select 1 from public.task_email_outbox where event_kind='completed' and recipient_id='c0000000-0000-4000-8000-000000000001') then raise exception 'Assigner did not receive completion email'; end if;
end $$;
set local role service_role;
set local test.uid='';
do $$declare q public.task_email_outbox; begin
 select * into q from public.claim_task_emails('sender@test.invalid','https://crm.test');
 update public.task_email_outbox set first_attempt_at=now()-interval '25 hours',locked_at=now()-interval '3 minutes' where id=q.id;
 if exists(select 1 from public.claim_task_emails('sender@test.invalid','https://crm.test')) then raise exception 'Retried outside idempotency window'; end if;
 if (select status from public.task_email_outbox where id=q.id)<>'failed' then raise exception 'Expired attempt not held'; end if;
end $$;
-- Revoke work access while an assignment is queued: it must be skipped.
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.task_action('create','f8000000-0000-4000-8000-000000000002','{"title":"Revoked access","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
select public.set_function_access('c0000000-0000-4000-8000-000000000003','{"work":false}');
set local role service_role;
set local test.uid='';
do $$begin
 if exists(select 1 from public.claim_task_emails('sender@test.invalid','https://crm.test')) then raise exception 'Email leaked after access revoked'; end if;
 if not exists(select 1 from public.task_email_outbox where task_id='f8000000-0000-4000-8000-000000000002' and status='skipped') then raise exception 'Revoked assignment not skipped'; end if;
end $$;
reset role;
-- Creator and later assigner both receive completion, with no duplicate recipients.
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.set_function_access('c0000000-0000-4000-8000-000000000003','{"work":true}');
select public.task_action('create','f8000000-0000-4000-8000-000000000003','{"title":"Handoff","caseId":"e0000000-0000-4000-8000-000000000001","assignedTo":"c0000000-0000-4000-8000-000000000002"}',null);
set local test.uid='c0000000-0000-4000-8000-000000000002';
do $$declare t public.tasks; begin
 select * into t from public.tasks where id='f8000000-0000-4000-8000-000000000003';
 perform public.task_action('edit',t.id,'{"title":"Handoff","priority":"medium","assignedTo":"c0000000-0000-4000-8000-000000000003"}',t.updated_at);
end $$;
set local test.uid='c0000000-0000-4000-8000-000000000003';
do $$declare t public.tasks; begin
 select * into t from public.tasks where id='f8000000-0000-4000-8000-000000000003';
 perform public.task_action('status',t.id,'{"status":"completed"}',t.updated_at);
end $$;
reset role;
do $$begin
 if (select count(*) from public.task_email_outbox where task_id='f8000000-0000-4000-8000-000000000003' and event_kind='completed')<>2 then raise exception 'Creator and assigner must both receive completion'; end if;
 -- Simulate the case moving after completion but before queued email delivery.
 perform set_config('test.uid','',true);
 update public.cases set branch_id='b0000000-0000-4000-8000-000000000002' where id='e0000000-0000-4000-8000-000000000001';
end $$;
set local role service_role;
set local test.uid='';
do $$declare q public.task_email_outbox; n integer=0; begin
 for q in select * from public.claim_task_emails('sender@test.invalid','https://crm.test') loop
   n=n+1;
   if q.recipient_id<>'c0000000-0000-4000-8000-000000000001' then raise exception 'Email leaked across branch after transfer'; end if;
 end loop;
 if n<>1 then raise exception 'Super admin should retain completion email after transfer'; end if;
end $$;
reset role;
-- Editing, commenting on and reopening a task each tell the other people on it, never the person who did it.
set local role authenticated;
set local test.uid='c0000000-0000-4000-8000-000000000001';
select public.task_action('create','f8000000-0000-4000-8000-000000000004','{"title":"Follow up","assignedTo":"c0000000-0000-4000-8000-000000000003"}',null);
do $$declare t public.tasks; before timestamptz; begin
 select * into t from public.tasks where id='f8000000-0000-4000-8000-000000000004';
 perform public.task_action('edit',t.id,'{"title":"Follow up today","priority":"high","assignedTo":"c0000000-0000-4000-8000-000000000003"}',t.updated_at);
 select * into t from public.tasks where id=t.id; before=t.updated_at;
 perform public.task_action('comment',t.id,'{"id":"f9000000-0000-4000-8000-000000000001","body":"Client called back."}',null);
 if (select updated_at from public.tasks where id=t.id)<=before then raise exception 'A comment must mark the task as updated'; end if;
end $$;
set local test.uid='c0000000-0000-4000-8000-000000000003';
do $$declare t public.tasks; begin
 select * into t from public.tasks where id='f8000000-0000-4000-8000-000000000004';
 perform public.task_action('status',t.id,'{"status":"completed"}',t.updated_at);
 select * into t from public.tasks where id=t.id;
 perform public.task_action('status',t.id,'{"status":"open"}',t.updated_at);
end $$;
reset role;
do $$declare task constant uuid='f8000000-0000-4000-8000-000000000004'; begin
 if (select count(*) from public.task_email_outbox where task_id=task and event_kind='updated' and recipient_id='c0000000-0000-4000-8000-000000000003')<>1 then raise exception 'The assignee must hear about an edit'; end if;
 if exists(select 1 from public.task_email_outbox where task_id=task and event_kind='updated' and recipient_id='c0000000-0000-4000-8000-000000000001') then raise exception 'The editor emailed themselves'; end if;
 if (select count(*) from public.task_email_outbox where task_id=task and event_kind='comment' and recipient_id='c0000000-0000-4000-8000-000000000003')<>1 then raise exception 'The assignee must hear about a comment'; end if;
 if exists(select 1 from public.task_email_outbox where task_id=task and event_kind='comment' and recipient_id='c0000000-0000-4000-8000-000000000001') then raise exception 'The commenter emailed themselves'; end if;
 if (select count(*) from public.task_email_outbox where task_id=task and event_kind='reopened' and recipient_id='c0000000-0000-4000-8000-000000000001')<>1 then raise exception 'The creator must hear about a reopen'; end if;
 if exists(select 1 from public.task_email_outbox where task_id=task and event_kind='reopened' and recipient_id='c0000000-0000-4000-8000-000000000003') then raise exception 'The person reopening emailed themselves'; end if;
end $$;
set local role service_role;
set local test.uid='';
do $$declare kinds text[]; begin
 select array_agg(event_kind order by event_kind) into kinds from public.claim_task_emails('sender@test.invalid','http://127.0.0.1:8100') where task_id='f8000000-0000-4000-8000-000000000004';
 -- The task is open again, so its completion notice is stale and is not sent.
 if kinds is distinct from array['assigned','comment','reopened','updated'] then raise exception 'Unexpected task emails claimed: %',kinds; end if;
end $$;
reset role;
rollback;
