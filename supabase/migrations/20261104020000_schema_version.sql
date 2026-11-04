begin;
set local lock_timeout='2s';

-- The database tells the CRM which migration it is at. Every migration from
-- here on ends by setting this to its own file prefix, and the deployed code
-- carries the version it expects (lib/schema-version.ts), so the Integrations
-- screen, /api/crm/health and the sign-in banner can name the migration that
-- still has to be applied instead of failing on a missing column somewhere.
create or replace function public.schema_version()
returns text language sql stable security definer set search_path=public as $$
  select '20261104020000'
$$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon, authenticated, service_role;
comment on function public.schema_version() is 'The prefix of the newest migration applied; compared with lib/schema-version.ts by the CRM.';

commit;
