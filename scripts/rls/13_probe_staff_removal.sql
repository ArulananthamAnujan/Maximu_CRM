\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-00000000e301','removal@maximus.test');
insert into public.profiles(id,organisation_id,branch_id,display_name,email,level,active)
values('00000000-0000-4000-8000-00000000e301','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Historical Staff Author','removal@maximus.test','staff',false);
insert into public.case_notes(id,organisation_id,case_id,author_id,body)
values('00000000-0000-4000-8000-00000000e302','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000dddd','00000000-0000-4000-8000-00000000e301','Keep this exact note and original author');
insert into public.documents(id,organisation_id,client_id,case_id,document_type,display_name,uploaded_by,drive_file_id)
values('00000000-0000-4000-8000-00000000e303','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000cccc','00000000-0000-4000-8000-00000000dddd','passport','Preserved file','00000000-0000-4000-8000-00000000e301','same-drive-file');
set role authenticated;
set test.uid='00000000-0000-4000-8000-000000000002';
do $$ begin
  begin
    perform public.retire_staff_profile('00000000-0000-4000-8000-00000000e301');
    raise exception 'Staff retired an account';
  exception when insufficient_privilege then null; end;
end $$;
set test.uid='00000000-0000-4000-8000-000000000001';
do $$ begin
  begin
    perform public.retire_staff_profile('00000000-0000-4000-8000-00000000e301');
    raise exception 'A usable Auth login was retired';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.retire_staff_profile('00000000-0000-4000-8000-000000000001');
    raise exception 'Self-deletion allowed';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
update auth.users set email='deleted+removal@auth.invalid',deleted_at=now() where id='00000000-0000-4000-8000-00000000e301';
set role authenticated;
select public.retire_staff_profile('00000000-0000-4000-8000-00000000e301');
select public.retire_staff_profile('00000000-0000-4000-8000-00000000e301');
do $$ begin
  if exists(select 1 from public.profiles where email='removal@maximus.test') then raise exception 'Email was not released'; end if;
  if not exists(select 1 from public.case_notes n join public.profiles p on p.id=n.author_id where n.id='00000000-0000-4000-8000-00000000e302' and n.body='Keep this exact note and original author' and p.display_name='Historical Staff Author') then raise exception 'Note or author changed'; end if;
  if not exists(select 1 from public.documents where id='00000000-0000-4000-8000-00000000e303' and uploaded_by='00000000-0000-4000-8000-00000000e301' and drive_file_id='same-drive-file') then raise exception 'Document history changed'; end if;
  if (select count(*) from public.audit_events where action='staff.removed' and resource_id='00000000-0000-4000-8000-00000000e301')<>1 then raise exception 'Deletion audit missing or duplicated'; end if;
  begin
    update public.profiles set active=true where id='00000000-0000-4000-8000-00000000e301';
    raise exception 'Deleted account reactivated';
  exception when invalid_parameter_value then null; end;
end $$;
set test.uid='00000000-0000-4000-8000-00000000e301';
do $$ begin
  if public.current_organisation_id() is not null then raise exception 'Deleted staff retained organisation access'; end if;
  if exists(select 1 from public.cases) then raise exception 'Deleted staff retained case access'; end if;
end $$;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-00000000e304','removal@maximus.test');
set role authenticated;
set test.uid='00000000-0000-4000-8000-000000000001';
insert into public.profiles(id,organisation_id,branch_id,display_name,email,level)
values('00000000-0000-4000-8000-00000000e304','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Recreated Staff','removal@maximus.test','staff');
do $$ begin
  if not exists(select 1 from public.profiles where email='removal@maximus.test' and active and id='00000000-0000-4000-8000-00000000e304') then raise exception 'Email could not be reused'; end if;
  if not exists(select 1 from public.case_notes where id='00000000-0000-4000-8000-00000000e302' and author_id='00000000-0000-4000-8000-00000000e301') then raise exception 'New account took over historical authorship'; end if;
end $$;
rollback;
\echo Staff deletion, email reuse, history preservation and access checks passed.
