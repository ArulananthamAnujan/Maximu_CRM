insert into public.organisations (id, name) values
  ('00000000-0000-4000-8000-00000000aaaa','Maximus Education');
insert into public.branches (id, organisation_id, name, code, country_code) values
  ('00000000-0000-4000-8000-00000000bbbb','00000000-0000-4000-8000-00000000aaaa','Melbourne','MEL','AU');
insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000001','admin@maximus.test'),
  ('00000000-0000-4000-8000-000000000002','staff@maximus.test'),
  ('00000000-0000-4000-8000-000000000003','student@maximus.test');
insert into public.profiles (id,organisation_id,branch_id,display_name,email,level) values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Ops Admin','admin@maximus.test','super_admin'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Case Officer','staff@maximus.test','staff'),
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Priya Student','student@maximus.test','student');
insert into public.clients (id,organisation_id,branch_id,crm_id,first_name,last_name,email,owner_id) values
  ('00000000-0000-4000-8000-00000000cccc','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','MAX-2026-0001','Priya','Sharma','priya@example.test','00000000-0000-4000-8000-000000000002');
insert into public.client_user_links (profile_id, client_id) values
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-00000000cccc');
insert into public.cases (id,organisation_id,client_id,branch_id,case_number,service_type,owner_id) values
  ('00000000-0000-4000-8000-00000000dddd','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000cccc','00000000-0000-4000-8000-00000000bbbb','CASE-2026-0001','study_abroad','00000000-0000-4000-8000-000000000002');
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
