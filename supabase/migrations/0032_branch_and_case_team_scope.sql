begin;

alter table public.commission_claims
  add column if not exists branch_id uuid references public.branches(id);
update public.commission_claims cc
set branch_id = c.branch_id
from public.education_applications a
join public.cases c on c.id = a.case_id
where cc.application_id = a.id and cc.branch_id is null;
create index if not exists commission_claims_branch_idx
  on public.commission_claims(organisation_id, branch_id, status);

-- Older imported cases predate the canonical lifecycle progress function and
-- can otherwise show 0% while already at Student, Application or Completed.
-- The lifecycle is authoritative; optional workflow-template stages are not.
update public.cases
set progress = public.lifecycle_progress(lifecycle_stage)
where progress is distinct from public.lifecycle_progress(lifecycle_stage);

-- The legacy-compatible role boundary is deliberately expressed in reusable
-- database functions. The application may hide controls for clarity, but RLS
-- remains the authority even when somebody calls the API directly.
create or replace function public.current_user_branch()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_level()::text in ('platform_owner','super_admin')
      then true
    when public.current_user_level()::text in ('branch_admin','manager','staff','partner')
      then target_branch is not null and target_branch = public.current_user_branch()
    else false
  end
$$;

-- Case visibility is not the same as client visibility. A staff member may
-- work on one case for a returning client without receiving the client's
-- other matters. Branch management sees every case in its own branch.
create or replace function public.can_access_case(target_case uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_level()::text in ('platform_owner','super_admin')
      then exists (
        select 1 from public.cases c
        where c.id = target_case
          and c.organisation_id = public.current_organisation_id()
      )
    when public.current_user_level()::text in ('branch_admin','manager')
      then exists (
        select 1 from public.cases c
        where c.id = target_case
          and c.organisation_id = public.current_organisation_id()
          and c.branch_id = public.current_user_branch()
      )
    when public.current_user_level()::text in ('staff','partner')
      then exists (
        select 1 from public.cases c
        where c.id = target_case
          and c.organisation_id = public.current_organisation_id()
          and c.branch_id = public.current_user_branch()
          and (
            c.owner_id = auth.uid()
            or c.supervisor_id = auth.uid()
            or exists (
              select 1 from public.case_collaborators cc
              where cc.case_id = c.id and cc.profile_id = auth.uid()
            )
          )
      )
    when public.current_user_level()::text = 'student'
      then exists (
        select 1 from public.cases c
        where c.id = target_case
          and c.organisation_id = public.current_organisation_id()
          and c.client_id = public.current_client_id()
      )
    else false
  end
$$;

create or replace function public.can_modify_case(target_case uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_internal_user() and public.can_access_case(target_case)
$$;

-- Client-level records (identity, education, employment and dependants) are
-- shared by the client's permitted cases. Case-specific applications, visas,
-- messages, documents and finance continue to use can_access_case instead.
create or replace function public.can_access_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_level()::text in ('platform_owner','super_admin')
      then exists (
        select 1 from public.clients c
        where c.id = target_client
          and c.organisation_id = public.current_organisation_id()
      )
    when public.current_user_level()::text in ('branch_admin','manager')
      then exists (
        select 1 from public.clients c
        where c.id = target_client
          and c.organisation_id = public.current_organisation_id()
          and c.branch_id = public.current_user_branch()
      )
    when public.current_user_level()::text in ('staff','partner')
      then exists (
        select 1 from public.clients c
        where c.id = target_client
          and c.organisation_id = public.current_organisation_id()
          and c.branch_id = public.current_user_branch()
          and (
            c.owner_id = auth.uid()
            or exists (
              select 1 from public.cases k
              where k.client_id = c.id and public.can_access_case(k.id)
            )
          )
      )
    when public.current_user_level()::text = 'student'
      then target_client = public.current_client_id()
    else false
  end
$$;

create or replace function public.can_modify_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_internal_user() and public.can_access_client(target_client)
$$;

-- Core case and case-team boundaries.
drop policy if exists cases_scoped_select on public.cases;
create policy cases_scoped_select on public.cases
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_access_case(id)
);

drop policy if exists cases_scoped_write on public.cases;
create policy cases_scoped_write on public.cases
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(id)
) with check (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(id)
);

drop policy if exists case_collaborators_read on public.case_collaborators;
create policy case_collaborators_read on public.case_collaborators
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_access_case(case_id)
);

drop policy if exists case_collaborators_manage on public.case_collaborators;
create policy case_collaborators_manage on public.case_collaborators
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_modify_case(case_id)
) with check (
  organisation_id = public.current_organisation_id()
  and added_by = auth.uid()
  and public.can_modify_case(case_id)
);

-- Tables that belong to one exact case must never widen through another case
-- belonging to the same client.
drop policy if exists case_lifecycle_events_insert on public.case_lifecycle_events;
do $$
declare spec record;
begin
  for spec in select * from (values
    ('case_stage_history',       'case_stage_history_read',       'case_stage_history_write'),
    ('education_applications',   'education_applications_read',   'education_applications_write'),
    ('visa_matters',             'visa_matters_read',             'visa_matters_write'),
    ('case_lifecycle_events',    'case_lifecycle_events_read',    'case_lifecycle_events_write')
  ) as t(table_name, read_policy, write_policy)
  loop
    execute format('drop policy if exists %I on public.%I', spec.read_policy, spec.table_name);
    execute format('drop policy if exists %I on public.%I', spec.write_policy, spec.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      || 'organisation_id = public.current_organisation_id() and public.can_access_case(case_id))',
      spec.read_policy, spec.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ('
      || 'organisation_id = public.current_organisation_id() and public.can_modify_case(case_id)) with check ('
      || 'organisation_id = public.current_organisation_id() and public.can_modify_case(case_id))',
      spec.write_policy, spec.table_name);
  end loop;
end $$;

drop policy if exists case_notes_internal_read on public.case_notes;
create policy case_notes_internal_read on public.case_notes
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and public.can_access_case(case_id)
  and (
    visibility <> 'private'
    or author_id = auth.uid()
    or public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')
  )
);
drop policy if exists case_notes_author_write on public.case_notes;
create policy case_notes_author_write on public.case_notes
for insert to authenticated with check (
  organisation_id = public.current_organisation_id()
  and author_id = auth.uid()
  and public.can_modify_case(case_id)
);
drop policy if exists case_notes_author_update on public.case_notes;
create policy case_notes_author_update on public.case_notes
for update to authenticated using (
  organisation_id = public.current_organisation_id()
  and author_id = auth.uid()
  and public.can_modify_case(case_id)
) with check (
  organisation_id = public.current_organisation_id()
  and author_id = auth.uid()
  and public.can_modify_case(case_id)
);

-- Tasks and appointments are visible through an accessible case. A personal
-- record without a case remains visible only to its assignee/owner, or to the
-- manager of that person's branch.
drop policy if exists tasks_scoped_select on public.tasks;
create policy tasks_scoped_select on public.tasks
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    (case_id is not null and public.can_access_case(case_id))
    or (case_id is null and assigned_to = auth.uid())
    or (
      case_id is null
      and public.current_user_level()::text in ('platform_owner','super_admin')
    )
    or (
      case_id is null
      and public.current_user_level()::text in ('branch_admin','manager')
      and exists (
        select 1 from public.profiles p
        where p.id = tasks.assigned_to and p.branch_id = public.current_user_branch()
      )
    )
  )
);
drop policy if exists tasks_internal_write on public.tasks;
create policy tasks_internal_write on public.tasks
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and ((case_id is not null and public.can_modify_case(case_id)) or assigned_to = auth.uid())
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and ((case_id is not null and public.can_modify_case(case_id)) or assigned_to = auth.uid())
);

drop policy if exists appointments_scoped_select on public.appointments;
create policy appointments_scoped_select on public.appointments
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    (case_id is not null and public.can_access_case(case_id))
    or (case_id is null and owner_id = auth.uid())
  )
);
drop policy if exists appointments_internal_write on public.appointments;
create policy appointments_internal_write on public.appointments
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and ((case_id is not null and public.can_modify_case(case_id)) or owner_id = auth.uid())
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and ((case_id is not null and public.can_modify_case(case_id)) or owner_id = auth.uid())
);

-- Documents, conversations and invoices stay with their exact case. Legacy
-- client-level rows without a case retain the narrower client boundary.
drop policy if exists documents_scoped_select on public.documents;
create policy documents_scoped_select on public.documents
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (case_id is not null and public.can_access_case(case_id)
       or case_id is null and public.can_access_client(client_id))
);
drop policy if exists documents_staff_write on public.documents;
create policy documents_staff_write on public.documents
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (case_id is not null and public.can_modify_case(case_id)
       or case_id is null and public.can_modify_client(client_id))
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (case_id is not null and public.can_modify_case(case_id)
       or case_id is null and public.can_modify_client(client_id))
);

drop policy if exists email_threads_scoped_select on public.email_threads;
create policy email_threads_scoped_select on public.email_threads
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    client_id = public.current_client_id()
    or (public.is_internal_user() and (
      case_id is not null and public.can_access_case(case_id)
      or case_id is null and client_id is not null and public.can_access_client(client_id)
    ))
  )
);
drop policy if exists email_threads_scoped_insert on public.email_threads;
create policy email_threads_scoped_insert on public.email_threads
for insert to authenticated with check (
  organisation_id = public.current_organisation_id()
  and (
    (public.current_user_level()::text = 'student' and client_id = public.current_client_id())
    or (public.is_internal_user() and (
      case_id is not null and public.can_modify_case(case_id)
      or case_id is null and client_id is not null and public.can_modify_client(client_id)
    ))
  )
);
drop policy if exists email_threads_internal_update on public.email_threads;
create policy email_threads_internal_update on public.email_threads
for update to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (case_id is not null and public.can_modify_case(case_id)
       or case_id is null and client_id is not null and public.can_modify_client(client_id))
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (case_id is not null and public.can_modify_case(case_id)
       or case_id is null and client_id is not null and public.can_modify_client(client_id))
);

drop policy if exists invoices_scoped_select on public.invoices;
create policy invoices_scoped_select on public.invoices
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    client_id = public.current_client_id()
    or (public.is_internal_user() and (
      case_id is not null and public.can_access_case(case_id)
      or case_id is null and public.can_access_client(client_id)
    ))
  )
);
drop policy if exists invoices_finance_write on public.invoices;
drop policy if exists invoices_staff_create on public.invoices;
drop policy if exists invoices_case_team_write on public.invoices;
create policy invoices_case_team_write on public.invoices
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (case_id is not null and public.can_modify_case(case_id)
       or case_id is null and public.can_modify_client(client_id))
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (case_id is not null and public.can_modify_case(case_id)
       or case_id is null and public.can_modify_client(client_id))
);

drop policy if exists payments_finance_write on public.payments;
drop policy if exists payments_case_team_write on public.payments;
create policy payments_case_team_write on public.payments
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.invoices i
    where i.id = payments.invoice_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.invoices i
    where i.id = payments.invoice_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
);

drop policy if exists credit_notes_admin on public.credit_notes;
drop policy if exists credit_notes_internal on public.credit_notes;
drop policy if exists credit_notes_case_team_write on public.credit_notes;
create policy credit_notes_case_team_write on public.credit_notes
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.invoices i
    where i.id = credit_notes.invoice_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.invoices i
    where i.id = credit_notes.invoice_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
);

drop policy if exists invoice_reminders_admin on public.invoice_reminders;
drop policy if exists invoice_reminders_case_team on public.invoice_reminders;
create policy invoice_reminders_case_team on public.invoice_reminders
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_reminders.invoice_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_reminders.invoice_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
);

drop policy if exists payment_receipts_admin on public.payment_receipts;
drop policy if exists payment_receipts_case_team on public.payment_receipts;
create policy payment_receipts_case_team on public.payment_receipts
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p.id = payment_receipts.payment_id
      and (i.case_id is not null and public.can_access_case(i.case_id)
           or i.case_id is null and public.can_access_client(i.client_id))
  )
) with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and exists (
    select 1 from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where p.id = payment_receipts.payment_id
      and (i.case_id is not null and public.can_modify_case(i.case_id)
           or i.case_id is null and public.can_modify_client(i.client_id))
  )
);

-- A Branch Admin may manage staff and invitations only in their own branch.
-- Super Admin remains the only organisation-wide administrator.
drop policy if exists profiles_visible_to_self_or_internal on public.profiles;
create policy profiles_visible_to_self_or_internal on public.profiles
for select to authenticated using (
  id = auth.uid()
  or (
    organisation_id = public.current_organisation_id()
    and public.current_user_level()::text in ('platform_owner','super_admin')
  )
  or (
    organisation_id = public.current_organisation_id()
    and public.current_user_level()::text in ('branch_admin','manager','staff','partner')
    and branch_id = public.current_user_branch()
  )
);

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (
      public.current_user_level()::text in ('branch_admin','manager')
      and branch_id = public.current_user_branch()
      and level::text not in ('platform_owner','super_admin')
    )
  )
) with check (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (
      public.current_user_level()::text in ('branch_admin','manager')
      and branch_id = public.current_user_branch()
      and level::text in ('staff','partner','student')
    )
  )
);

drop policy if exists staff_invitations_admin on public.staff_invitations;
create policy staff_invitations_admin on public.staff_invitations
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (public.current_user_level()::text in ('branch_admin','manager')
        and branch_id = public.current_user_branch())
  )
) with check (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (public.current_user_level()::text in ('branch_admin','manager')
        and branch_id = public.current_user_branch())
  )
);

drop policy if exists branches_admin_write on public.branches;
drop policy if exists branches_internal_read on public.branches;
create policy branches_internal_read on public.branches
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (
      public.current_user_level()::text in ('branch_admin','manager','staff','partner')
      and id = public.current_user_branch()
    )
  )
);
create policy branches_admin_write on public.branches
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (public.current_user_level()::text in ('branch_admin','manager')
        and id = public.current_user_branch())
  )
) with check (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (public.current_user_level()::text in ('branch_admin','manager')
        and id = public.current_user_branch())
  )
);

drop policy if exists login_activity_visibility on public.login_activity;
create policy login_activity_visibility on public.login_activity
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    profile_id = auth.uid()
    or public.current_user_level()::text in ('platform_owner','super_admin')
    or (
      public.current_user_level()::text in ('branch_admin','manager')
      and exists (
        select 1 from public.profiles p
        where p.id = login_activity.profile_id
          and p.branch_id = public.current_user_branch()
      )
    )
  )
);

drop policy if exists audit_admin_read on public.audit_events;
drop policy if exists audit_case_read on public.audit_events;
drop policy if exists audit_internal_scoped_read on public.audit_events;
create policy audit_internal_scoped_read on public.audit_events
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (case_id is not null and public.can_access_case(case_id))
    or actor_id = auth.uid()
    or (
      public.current_user_level()::text in ('branch_admin','manager')
      and (
        after_data->>'branch_id' = public.current_user_branch()::text
        or exists (
          select 1 from public.profiles p
          where p.id = audit_events.actor_id
            and p.branch_id = public.current_user_branch()
        )
      )
    )
  )
);

drop policy if exists commission_claims_internal on public.commission_claims;
drop policy if exists commission_claims_scoped on public.commission_claims;
create policy commission_claims_scoped on public.commission_claims
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (
      public.current_user_level()::text in ('branch_admin','manager')
      and branch_id = public.current_user_branch()
    )
  )
) with check (
  organisation_id = public.current_organisation_id()
  and (
    public.current_user_level()::text in ('platform_owner','super_admin')
    or (
      public.current_user_level()::text in ('branch_admin','manager')
      and branch_id = public.current_user_branch()
    )
  )
);

drop policy if exists client_links_access on public.client_user_links;
create policy client_links_access on public.client_user_links
for select to authenticated using (
  profile_id = auth.uid()
  or public.current_user_level()::text in ('platform_owner','super_admin')
  or (
    public.current_user_level()::text in ('branch_admin','manager')
    and exists (
      select 1 from public.profiles p
      join public.clients c on c.id = client_user_links.client_id
      where p.id = client_user_links.profile_id
        and p.branch_id = public.current_user_branch()
        and c.branch_id = public.current_user_branch()
        and p.organisation_id = public.current_organisation_id()
        and c.organisation_id = public.current_organisation_id()
    )
  )
);

drop policy if exists client_links_write on public.client_user_links;
create policy client_links_write on public.client_user_links
for insert to authenticated with check (
  public.current_user_level()::text in ('platform_owner','super_admin')
  or (
    public.current_user_level()::text in ('branch_admin','manager')
    and exists (
      select 1 from public.profiles p
      join public.clients c on c.id = client_user_links.client_id
      where p.id = client_user_links.profile_id
        and p.branch_id = public.current_user_branch()
        and c.branch_id = public.current_user_branch()
    )
  )
);
drop policy if exists client_links_update on public.client_user_links;
create policy client_links_update on public.client_user_links
for update to authenticated using (
  public.current_user_level()::text in ('platform_owner','super_admin')
  or (
    public.current_user_level()::text in ('branch_admin','manager')
    and exists (
      select 1 from public.profiles p
      join public.clients c on c.id = client_user_links.client_id
      where p.id = client_user_links.profile_id
        and p.branch_id = public.current_user_branch()
        and c.branch_id = public.current_user_branch()
    )
  )
) with check (
  public.current_user_level()::text in ('platform_owner','super_admin')
  or (
    public.current_user_level()::text in ('branch_admin','manager')
    and exists (
      select 1 from public.profiles p
      join public.clients c on c.id = client_user_links.client_id
      where p.id = client_user_links.profile_id
        and p.branch_id = public.current_user_branch()
        and c.branch_id = public.current_user_branch()
    )
  )
);
drop policy if exists client_links_delete on public.client_user_links;
create policy client_links_delete on public.client_user_links
for delete to authenticated using (
  public.current_user_level()::text in ('platform_owner','super_admin')
  or (
    public.current_user_level()::text in ('branch_admin','manager')
    and exists (
      select 1 from public.profiles p
      join public.clients c on c.id = client_user_links.client_id
      where p.id = client_user_links.profile_id
        and p.branch_id = public.current_user_branch()
        and c.branch_id = public.current_user_branch()
    )
  )
);

-- This function is security-definer because it must notify managers. Its
-- access check therefore has to use the exact case boundary explicitly.
create or replace function public.request_case_archive(
  target_case uuid,
  request_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subject public.cases;
  client_name text;
  requester text;
begin
  if not public.is_internal_user() or not public.can_access_case(target_case) then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;
  select * into subject from public.cases where id = target_case;
  if subject.id is null then
    raise exception 'Case not found' using errcode = 'P0002';
  end if;

  select coalesce(display_name, email) into requester
    from public.profiles where id = auth.uid();
  select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    into client_name from public.clients where id = subject.client_id;

  insert into public.notifications
    (organisation_id, recipient_id, case_id, kind, title, body)
  select subject.organisation_id, p.id, target_case, 'archive_request',
         'Archive requested for ' || coalesce(nullif(client_name, ''), subject.case_number),
         coalesce(requester, 'A case officer') || ' asked for this case to be archived'
           || coalesce(': ' || nullif(trim(coalesce(request_reason, '')), ''), '.')
  from public.profiles p
  where p.organisation_id = subject.organisation_id
    and p.active
    and p.level in ('super_admin','branch_admin','manager')
    and (p.level = 'super_admin' or p.branch_id is not distinct from subject.branch_id);

  insert into public.audit_events
    (organisation_id, actor_id, action, resource_type, resource_id, case_id,
     summary, after_data)
  values
    (subject.organisation_id, auth.uid(), 'case.archive_requested', 'case',
     target_case::text, target_case,
     'Requested that this case be archived',
     jsonb_build_object('reason', request_reason));
end;
$$;

comment on function public.can_access_case is
  'Super Admin: organisation. Branch Admin/Manager: own branch. Staff/Partner: owned, supervised or explicitly collaborated cases. Client: own cases.';

commit;
