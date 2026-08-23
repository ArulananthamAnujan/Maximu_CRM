-- A case officer in the same branch who owns neither the client nor the case:
-- the colleague whose access the staff scope is really about.
insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000009','other.officer@maximus.test');
insert into public.profiles (id,organisation_id,branch_id,display_name,email,level) values
  ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Other Officer','other.officer@maximus.test','staff');
