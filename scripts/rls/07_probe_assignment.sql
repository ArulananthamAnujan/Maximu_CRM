\pset format unaligned
\pset tuples_only on
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000001';   -- super admin
\echo '--- admin reassigns the case to Ravi ---'
update public.cases set owner_id = '00000000-0000-4000-8000-000000000004'
  where id = '00000000-0000-4000-8000-00000000dddd';
select 'owner now = ' || coalesce(p.display_name,'(none)')
  from public.cases c left join public.profiles p on p.id = c.owner_id
  where c.id = '00000000-0000-4000-8000-00000000dddd';
\echo '--- admin notifies the new owner ---'
insert into public.notifications (organisation_id,recipient_id,case_id,kind,title)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000000004',
          '00000000-0000-4000-8000-00000000dddd','case_assigned','A case was assigned to you');
\echo '--- the new owner sees their notification ---'
set test.uid = '00000000-0000-4000-8000-000000000004';
select 'ravi sees = ' || count(*) from public.notifications;
\echo '--- the previous owner does not see it ---'
set test.uid = '00000000-0000-4000-8000-000000000002';
select 'previous owner sees = ' || count(*) from public.notifications;
\echo '--- an unrelated portal account sees none of it ---'
set test.uid = '00000000-0000-4000-8000-000000000003';
select 'student sees = ' || count(*) from public.notifications;
