-- Minimal Supabase-compatible surface so the real migrations can run locally.
create schema if not exists auth;
-- Real Supabase provisions this schema by default, to hold extensions
-- (pg_trgm and the like) away from public. A plain local Postgres cluster
-- does not, so a migration that installs one into it fails here otherwise.
create schema if not exists extensions;
create table if not exists auth.users (
  id uuid primary key,
  email text
);
-- auth.uid() reads the impersonated user from a session GUC.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='app_user') then create role app_user login; end if;
end $$;
grant authenticated to app_user;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to authenticated;
