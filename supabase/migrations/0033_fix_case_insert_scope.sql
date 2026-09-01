begin;

-- 0032's cases_scoped_write policy checked WITH CHECK using only
-- can_modify_case(id), which re-queries public.cases by id. That works for
-- UPDATE, where the row already exists before the statement runs, but for
-- INSERT the row being checked is not yet visible to that subquery -- so
-- every new case, from any account, was rejected outright the moment this
-- policy took effect: "new row violates row-level security policy for
-- table \"cases\"" on every enquiry created.
--
-- clients_scoped_write (0018) already avoids exactly this trap by checking
-- the row's own owner_id column directly before ever falling back to a
-- self-referencing function call. This gives cases_scoped_write the same
-- shape: organisation, branch and role gate every write as before, and an
-- owner, supervisor or (for an existing row) collaborator may write to it,
-- checked against the row's own columns rather than by re-querying cases.
drop policy if exists cases_scoped_write on public.cases;
create policy cases_scoped_write on public.cases
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(id)
) with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = any(array['platform_owner','super_admin','branch_admin','manager','staff','partner'])
  and public.can_access_branch(branch_id)
  and (
    public.current_user_level()::text = any(array['platform_owner','super_admin','branch_admin','manager'])
    or owner_id = auth.uid()
    or supervisor_id = auth.uid()
    -- Existing row (an update, not the initial insert): a case-team
    -- collaborator may also write, the same as before this fix.
    or public.can_modify_case(id)
  )
);

comment on policy cases_scoped_write on public.cases is
  'Organisation, branch and role scoped. INSERT and UPDATE checked against the row''s own owner/supervisor/branch columns so a brand new case is not rejected by a self-referencing lookup; an existing case''s collaborator is still covered by can_modify_case.';

commit;
