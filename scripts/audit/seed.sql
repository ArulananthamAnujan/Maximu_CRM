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

-- The records the Applications and Visa screens are lists of. Without these
-- the screens have nothing to show and nothing to check.
insert into public.education_applications
  (id,organisation_id,case_id,institution,course,campus,intake,application_reference,status,submitted_at,offer_received_at,deadline_at) values
  ('f0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','Monash University','Master of Information Technology','Clayton','February 2027','MON-88213','offer_received','2026-07-14T02:00:00Z','2026-08-02T02:00:00Z','2026-11-30T13:00:00Z'),
  ('f0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','RMIT University','Master of Data Science','City','July 2027','RMIT-40021','submitted','2026-07-20T02:00:00Z',null,'2026-12-15T13:00:00Z');

insert into public.visa_matters
  (id,organisation_id,case_id,destination_country,visa_subclass,visa_stream,lodgement_reference,status,agent_id,lodged_at,trn,responsible_agent_marn,current_visa_expiry,information_due_at) values
  ('f1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','AU','500','Higher education','LODGE-2026-771','lodged','c0000000-0000-4000-8000-000000000003','2026-08-11T04:00:00Z','EGO9K2LM01','1798765','2027-06-30','2026-09-30T13:00:00Z'),
  ('f1000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','AU','190','Skilled nominated','LODGE-2026-772','assessment','c0000000-0000-4000-8000-000000000005',null,null,'1798765','2027-12-31',null);

-- The visa each client currently holds, which is not the one being applied for.
insert into public.visa_history
  (organisation_id,client_id,country_code,visa_type,status,granted_on,expires_on) values
  ('a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','AU','485','granted','2024-07-01','2027-06-30'),
  ('a0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','AU','482','granted','2023-03-15','2027-12-31');

grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
