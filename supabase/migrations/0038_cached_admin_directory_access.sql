begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- The administrator's organisation/role is constant for a statement. Calling
-- the same security-definer row lookup for every candidate made a 5,656-client
-- name search take 4.4 seconds, before the other parallel search queries.
-- Keep every existing non-admin expression and every WITH CHECK unchanged.
-- This is only the existing organisation-wide administrator read/write scope;
-- it does not grant a role, change assignment, or disable row-level security.
do $$
declare
  p record;
  admin_scope text;
begin
  for p in
    select tablename, policyname, qual from pg_policies
    where schemaname = 'public' and (tablename, policyname) in (
      ('clients','clients_scoped_select'), ('clients','clients_scoped_write'),
      ('cases','cases_scoped_select'), ('cases','cases_scoped_write'),
      ('enquiries','enquiries_read'), ('enquiries','enquiries_write')
    )
  loop
    -- Enquiries must still point to an accessible parent in the same
    -- organisation. Checking enquiry.organisation_id alone is insufficient.
    admin_scope := case when p.tablename = 'enquiries' then
      '((case_id is not null and case_id in
          (select k.id from public.cases k where k.organisation_id = (select public.current_organisation_id())))
        or (case_id is null and client_id in
          (select c.id from public.clients c where c.organisation_id = (select public.current_organisation_id()))))'
      else 'true' end;
    execute format(
      'alter policy %I on public.%I using (
        organisation_id = (select public.current_organisation_id()) and
        case when (select public.current_user_level())::text in (''platform_owner'',''super_admin'')
          then %s else (%s) end)',
      p.policyname, p.tablename, admin_scope, p.qual);
  end loop;
end $$;

commit;
