\set ON_ERROR_STOP off
\set QUIET on
\pset format unaligned
\pset tuples_only on

-- Give the seeded client the contact details a second intake would collide
-- with, then look for that person the way the intake form does.
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000002';   -- staff (owns both clients)
update public.clients
  set mobile = '+61 400 000 111', passport_masked = 'N12' || repeat('•',4) || '7',
      date_of_birth = '1999-04-02'
  where id = '00000000-0000-4000-8000-00000000cccc';

\echo '--- email, written differently ---'
select 'email:' || crm_id || ':' || array_to_string(match_reasons, '+')
  from public.find_duplicate_clients(p_email => '  PRIYA@Example.Test ');

\echo '--- the same mobile in another format ---'
select 'mobile:' || crm_id || ':' || array_to_string(match_reasons, '+')
  from public.find_duplicate_clients(p_mobile => '0400000111');

\echo '--- the same passport ---'
select 'passport:' || crm_id || ':' || array_to_string(match_reasons, '+')
  from public.find_duplicate_clients(p_passport_masked => 'N12' || repeat('•',4) || '7');

\echo '--- the same name, and how many cases that person already has ---'
select 'name:' || crm_id || ':' || array_to_string(match_reasons, '+') || ':cases=' || case_count
  from public.find_duplicate_clients(p_first_name => ' priya ', p_last_name => 'SHARMA');

\echo '--- somebody genuinely new matches nothing ---'
select 'new:' || count(*) from public.find_duplicate_clients(
  p_email => 'nobody@example.test', p_mobile => '+61 499 999 999',
  p_first_name => 'Nobody', p_last_name => 'Atall');

\echo '--- a portal account is told nothing about other clients ---'
set test.uid = '00000000-0000-4000-8000-000000000003';   -- the linked student
select 'portal:' || count(*) from public.find_duplicate_clients(p_email => 'other@example.test');
