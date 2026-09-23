\set ON_ERROR_STOP on
begin;
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000001';
update public.profiles set function_access='{"action_transfer_branch":true}' where id in
 ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000011');
set test.uid = '00000000-0000-4000-8000-000000000011';
do $$ begin
 begin
  update public.profiles set function_access='{"action_transfer_branch":true}' where id='00000000-0000-4000-8000-000000000002';
  raise exception 'Admin granted transfer access';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.branch_transfer_destinations())<2 then raise exception 'Destination list missing'; end if;
 if exists(select 1 from public.cases where branch_id<>public.current_user_branch()) then raise exception 'Destination list widened case access'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000009';
do $$ begin
 begin
  update public.clients set branch_id='00000000-0000-4000-8000-00000000bbb2' where id='00000000-0000-4000-8000-00000000f100';
  raise exception 'Delegated staff bypassed transfer action';
 exception when insufficient_privilege then null; end;
end $$;
select public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbb2','00000000-0000-4000-8000-00000000bbbb','Delegated staff test');
do $$ begin
 if exists(select 1 from public.cases where id='00000000-0000-4000-8000-00000000f101') then raise exception 'Previous staff retains case'; end if;
 begin
  perform public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbbb','00000000-0000-4000-8000-00000000bbb2','Steal another branch case');
  raise exception 'Delegated staff moved another branch case';
 exception when insufficient_privilege then null; end;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000010';
do $$ begin
 if not exists(select 1 from public.case_notes where id='00000000-0000-4000-8000-00000000f103') then raise exception 'Destination missing history'; end if;
 if not exists(select 1 from public.education_applications where id='00000000-0000-4000-8000-00000000f102') then raise exception 'Destination missing application'; end if;
 if not exists(select 1 from public.audit_events where case_id='00000000-0000-4000-8000-00000000f101' and action='case.branch_transferred' and actor_id='00000000-0000-4000-8000-000000000009') then raise exception 'Delegate audit missing'; end if;
end $$;
set test.uid = '00000000-0000-4000-8000-000000000001';
select public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbbb','00000000-0000-4000-8000-00000000bbb2','Return for Admin test');
set test.uid = '00000000-0000-4000-8000-000000000011';
select public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbb2','00000000-0000-4000-8000-00000000bbbb','Delegated Admin test');
set test.uid = '00000000-0000-4000-8000-000000000001';
update public.profiles set function_access='{"action_transfer_branch":false}' where id='00000000-0000-4000-8000-000000000009';
set test.uid = '00000000-0000-4000-8000-000000000009';
do $$ begin
 if exists(select 1 from public.branch_transfer_destinations()) then raise exception 'Revoked delegate still lists destinations'; end if;
 begin
  perform public.transfer_case_branch('00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000bbbb','00000000-0000-4000-8000-00000000bbb2','Revoked');
  raise exception 'Revoked delegate transferred';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
\echo 'Delegated transfer, revocation, branch isolation and history checks passed.'
