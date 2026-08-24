-- A case officer in the same branch who owns neither the client nor the case:
-- the colleague whose access the staff scope is really about.
insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000009','other.officer@maximus.test');
insert into public.profiles (id,organisation_id,branch_id,display_name,email,level) values
  ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','Other Officer','other.officer@maximus.test','staff');

-- An AI assistant exchange on the seeded case, authored by the original case
-- officer. Read via pg_run so it exists before the probe runs -- the probe
-- connects as app_user under row-level security and could not write this
-- itself without impersonating the officer who wrote it.
insert into public.ai_interactions
  (organisation_id, profile_id, case_id, purpose, prompt_redacted, response_redacted, status)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-00000000dddd','case_draft','draft this','a drafted reply','completed');
