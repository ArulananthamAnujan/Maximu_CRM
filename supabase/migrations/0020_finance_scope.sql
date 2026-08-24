begin;

-- 0018 narrowed writing a case, its documents and its file to the case
-- officer it is actually assigned to, while deliberately leaving reads alone
-- so a colleague could still see a case for cover and handover. Invoices and
-- payments were left out of that change entirely: invoices_scoped_select
-- (0005) still used can_access_client, the same broad, branch-wide predicate
-- that used to guard writing a case too. A case officer could read what a
-- client of a colleague's, or of a manager's, had been billed and paid --
-- financial detail that has no cover-and-handover reason to be visible, and
-- that this agency's roles otherwise keep to whoever owns the case or to
-- management. can_modify_client already draws exactly that line; invoices
-- read access now follows it, and payments follows invoices since its own
-- policy is only ever as wide as the invoice it reads through.
drop policy if exists invoices_scoped_select on public.invoices;
create policy invoices_scoped_select on public.invoices
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and (
    client_id = public.current_client_id()
    or (public.is_internal_user() and (client_id is null or public.can_modify_client(client_id)))
  )
);

commit;
