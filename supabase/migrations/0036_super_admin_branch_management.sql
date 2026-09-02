begin;

-- A branch is an organisation-level master record. Branch Admins and Managers
-- work only inside the branch already attached to their profile; they do not
-- create, close, reopen, rename, or otherwise administer branch records.
drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches
for all to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in ('platform_owner', 'super_admin')
)
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in ('platform_owner', 'super_admin')
);

comment on policy branches_admin_write on public.branches is
  'Only organisation-level Super Admin accounts can administer branches. Branch Admins and Managers remain scoped to their existing branch.';

commit;
