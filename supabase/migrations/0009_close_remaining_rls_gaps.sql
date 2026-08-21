begin;

-- Migration 0001 gave every table one blanket policy: `for all` to any
-- authenticated member of the organisation. Migrations 0003, 0005 and 0007
-- replaced that with scoped policies on the tables they covered, but thirteen
-- tables were never revisited and still carry the original policy. Because it
-- is `for all` rather than `for select`, any signed-in account in the
-- organisation -- including a student with a client portal login -- can read
-- and write every row in them: other clients' dependants and passport
-- references, internal case notes, finance records, and the stored mailbox
-- token references. This migration finishes that pass.

-- Client-scoped records: visible to whoever may see the client, writable by
-- internal staff only.
do $$
declare t text;
begin
  foreach t in array array['dependants','enquiries','client_consents'] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('drop policy if exists "organisation isolation" on public.%I', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (organisation_id = public.current_organisation_id()
             and public.can_access_client(client_id))
    $f$, t || '_read', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
      using (organisation_id = public.current_organisation_id()
             and public.is_internal_user()
             and public.can_access_client(client_id))
      with check (organisation_id = public.current_organisation_id()
                  and public.is_internal_user()
                  and public.can_access_client(client_id))
    $f$, t || '_write', t);
  end loop;
end $$;

-- Case-scoped records, reached through the case's client.
do $$
declare t text;
begin
  foreach t in array array['case_stage_history','education_applications','visa_matters'] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy %I on public.%I for select to authenticated
      using (organisation_id = public.current_organisation_id()
             and exists (select 1 from public.cases c
                         where c.id = %I.case_id
                           and public.can_access_client(c.client_id)))
    $f$, t || '_read', t, t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
      using (organisation_id = public.current_organisation_id()
             and public.is_internal_user()
             and exists (select 1 from public.cases c
                         where c.id = %I.case_id
                           and public.can_access_client(c.client_id)))
      with check (organisation_id = public.current_organisation_id()
                  and public.is_internal_user()
                  and exists (select 1 from public.cases c
                              where c.id = %I.case_id
                                and public.can_access_client(c.client_id)))
    $f$, t || '_write', t, t, t);
  end loop;
end $$;

-- Case notes are internal working notes. They are never visible to a portal
-- account, and a private note stays with its author and management.
drop policy if exists tenant_isolation on public.case_notes;
create policy case_notes_internal_read on public.case_notes
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (select 1 from public.cases c
              where c.id = case_notes.case_id
                and public.can_access_client(c.client_id))
  and (
    visibility <> 'private'
    or author_id = auth.uid()
    or public.current_user_level()::text in
       ('platform_owner','super_admin','branch_admin','manager')
  )
);
create policy case_notes_author_write on public.case_notes
for insert to authenticated with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and author_id = auth.uid()
  and exists (select 1 from public.cases c
              where c.id = case_notes.case_id
                and public.can_access_client(c.client_id))
);
create policy case_notes_author_update on public.case_notes
for update to authenticated
using (organisation_id = public.current_organisation_id() and author_id = auth.uid())
with check (organisation_id = public.current_organisation_id() and author_id = auth.uid());

-- Finance records follow the invoice and the commission agreement, and stay
-- with the roles that own them.
drop policy if exists tenant_isolation on public.payments;
create policy payments_scoped_read on public.payments
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and exists (select 1 from public.invoices i where i.id = payments.invoice_id)
);
create policy payments_finance_write on public.payments
for all to authenticated
using (organisation_id = public.current_organisation_id()
       and public.current_user_level()::text in
           ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id()
            and public.current_user_level()::text in
                ('platform_owner','super_admin','branch_admin','manager'));

drop policy if exists tenant_isolation on public.commission_claims;
create policy commission_claims_internal on public.commission_claims
for all to authenticated
using (organisation_id = public.current_organisation_id()
       and public.current_user_level()::text in
           ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id()
            and public.current_user_level()::text in
                ('platform_owner','super_admin','branch_admin','manager'));

-- Background Drive work is machine state, not client-facing data.
drop policy if exists tenant_isolation on public.drive_jobs;
create policy drive_jobs_internal on public.drive_jobs
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user())
with check (organisation_id = public.current_organisation_id() and public.is_internal_user());

-- A mailbox connection holds the reference used to reach someone's mail. It
-- belongs to its owner and to administrators, and to nobody else.
drop policy if exists tenant_isolation on public.mailbox_connections;
create policy mailbox_connections_owner_read on public.mailbox_connections
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (profile_id = auth.uid()
       or public.current_user_level()::text in
          ('platform_owner','super_admin','branch_admin'))
);
create policy mailbox_connections_owner_write on public.mailbox_connections
for all to authenticated
using (organisation_id = public.current_organisation_id()
       and (profile_id = auth.uid()
            or public.current_user_level()::text in
               ('platform_owner','super_admin')))
with check (organisation_id = public.current_organisation_id()
            and (profile_id = auth.uid()
                 or public.current_user_level()::text in
                    ('platform_owner','super_admin')));

-- AI records describe internal reasoning and proposed actions.
drop policy if exists "organisation isolation" on public.ai_interactions;
create policy ai_interactions_internal on public.ai_interactions
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user())
with check (organisation_id = public.current_organisation_id()
            and public.is_internal_user()
            and profile_id = auth.uid());

drop policy if exists "organisation isolation" on public.ai_action_proposals;
create policy ai_action_proposals_internal_read on public.ai_action_proposals
for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy ai_action_proposals_internal_write on public.ai_action_proposals
for all to authenticated
using (organisation_id = public.current_organisation_id()
       and public.current_user_level()::text in
           ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id()
            and public.current_user_level()::text in
                ('platform_owner','super_admin','branch_admin','manager'));

commit;
