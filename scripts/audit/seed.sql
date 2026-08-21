-- A small migration agency: two branches, an owner, two case officers, a client login.
insert into public.organisations (id,name) values ('a0000000-0000-4000-8000-000000000001','Maximus Education & Migration');
insert into public.branches (id,organisation_id,name,code,country_code) values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Melbourne','MEL','AU'),
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','Colombo','CMB','LK');
insert into auth.users (id,email) values
  ('c0000000-0000-4000-8000-000000000001','owner@maximus.test'),
  ('c0000000-0000-4000-8000-000000000002','manager@maximus.test'),
  ('c0000000-0000-4000-8000-000000000003','officer@maximus.test'),
  ('c0000000-0000-4000-8000-000000000004','student@maximus.test');
insert into public.profiles (id,organisation_id,branch_id,display_name,email,level,department) values
  ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Nadia Owner','owner@maximus.test','super_admin','Management'),
  ('c0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Mark Manager','manager@maximus.test','branch_admin','Operations'),
  ('c0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Olivia Officer','officer@maximus.test','staff','Admissions'),
  ('c0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Priya Student','student@maximus.test','student',null);
insert into public.clients (id,organisation_id,branch_id,crm_id,first_name,last_name,email,mobile,owner_id) values
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','MAX-2026-0001','Priya','Sharma','priya@example.test','+61400000001','c0000000-0000-4000-8000-000000000003');
insert into public.client_user_links (profile_id,client_id) values
  ('c0000000-0000-4000-8000-000000000004','d0000000-0000-4000-8000-000000000001');
insert into public.cases (id,organisation_id,client_id,branch_id,case_number,service_type,owner_id,target,visa_expiry_on) values
  ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','CASE-2026-0001','study_abroad','c0000000-0000-4000-8000-000000000003','Master of IT','2027-06-30');
-- A second branch with its own officer and client, to prove branch isolation.
insert into auth.users (id,email) values ('c0000000-0000-4000-8000-000000000005','colombo@maximus.test');
insert into public.profiles (id,organisation_id,branch_id,display_name,email,level,department) values
  ('c0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','Dilan Perera','colombo@maximus.test','staff','Admissions');
insert into public.clients (id,organisation_id,branch_id,crm_id,first_name,last_name,email,owner_id) values
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','MAX-2026-0002','Chamara','Silva','chamara@example.test','c0000000-0000-4000-8000-000000000005');
insert into public.cases (id,organisation_id,client_id,branch_id,case_number,service_type,owner_id,target,visa_expiry_on) values
  ('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','CASE-2026-0002','direct_visa','c0000000-0000-4000-8000-000000000005','Subclass 190','2027-12-31');

grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
