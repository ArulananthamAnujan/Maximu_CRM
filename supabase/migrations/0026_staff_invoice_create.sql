begin;

-- Raising an invoice was manager and above only (invoices_finance_write).
-- A case officer now may also create one, for a case they can already work
-- on -- can_modify_client is the exact boundary staff already write every
-- other case record through. Changing or voiding an invoice once raised
-- stays manager and above: this policy is insert-only.
create policy invoices_staff_create on public.invoices
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in ('staff','partner')
  and public.can_modify_client(client_id)
);

comment on policy invoices_staff_create on public.invoices is
  'A case officer or partner may raise an invoice for a client they can already modify. Changing one afterward stays manager and above (invoices_finance_write).';

commit;
