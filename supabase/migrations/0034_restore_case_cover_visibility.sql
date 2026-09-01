begin;

-- 0032 replaced the case-visibility boundary (previously
-- can_access_client(client_id), branch-wide read for staff since 0003) with
-- can_access_case, whose staff/partner branch only matches the case's own
-- owner, supervisor or an explicit collaborator. That is the right, tighter
-- boundary for a case's working detail (documents, notes, finance -- 0032's
-- own comment is explicit about that), but cases_scoped_select is the case
-- board itself, and losing branch-wide read there silently dropped a
-- pre-existing, deliberately built and tested feature: a same-branch
-- colleague could always see that a case exists, who owns it and its
-- status, for cover and handover, well before they are ever assigned to it.
--
-- can_modify_case (write) is untouched and stays exactly as narrow as 0032
-- made it -- only this one read boundary is restored.
create or replace function public.can_view_case(target_case uuid)
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
    when public.current_user_level()::text in ('branch_admin','manager','staff','partner')
      then exists (
        select 1 from public.cases c
        where c.id = target_case
          and c.organisation_id = public.current_organisation_id()
          and c.branch_id = public.current_user_branch()
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

drop policy if exists cases_scoped_select on public.cases;
create policy cases_scoped_select on public.cases
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.can_view_case(id)
);

comment on function public.can_view_case is
  'The case board: any branch colleague sees a case exists (cover, handover, load), not only the owner. Working detail elsewhere stays scoped to can_access_case.';

-- can_access_client suffered the same accidental narrowing, and here it is
-- not a new function 0032 introduced but the very one 0018 built and
-- documented for exactly this purpose: "Visibility is left as it was -- a
-- case officer can still see their branch, which is what makes cover and
-- handover possible -- and writing is narrowed to the cases that are
-- actually theirs." 0032 rewrote its body to require ownership or an
-- accessible case, collapsing that read boundary down to the write boundary
-- can_modify_client already covers on its own (it does not call this
-- function for staff/partner, so restoring this is write-safe).
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
    when public.current_user_level()::text in ('branch_admin','manager','staff','partner')
      then exists (
        select 1 from public.clients c
        where c.id = target_client
          and c.organisation_id = public.current_organisation_id()
          and c.branch_id = public.current_user_branch()
      )
    when public.current_user_level()::text = 'student'
      then target_client = public.current_client_id()
    else false
  end
$$;

comment on function public.can_access_client is
  'Read boundary: branch-wide for internal roles, restored to the shape 0018 built for cover and handover. can_modify_client is the separate, narrower write boundary.';

-- 0032 also collapsed can_modify_client down to "is_internal_user() and
-- can_access_client(...)" -- the same function as the read boundary above,
-- rather than a narrower one. That erases 0018's whole point (a case
-- officer writes only where they are accountable) the moment
-- can_access_client is branch-wide again, as it now is. Restored to 0028's
-- shape: owner of the client record, or owner/collaborator of one of its
-- cases.
create or replace function public.can_modify_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_level()::text in
         ('platform_owner','super_admin','branch_admin','manager')
      then public.can_access_client(target_client)
    when public.current_user_level()::text in ('staff','partner') then exists (
      select 1 from public.clients c
      where c.id = target_client
        and c.organisation_id = public.current_organisation_id()
        and (
          c.owner_id = auth.uid()
          or exists (
            select 1 from public.cases k
            where k.client_id = c.id
              and (
                k.owner_id = auth.uid()
                or exists (
                  select 1 from public.case_collaborators cc
                  where cc.case_id = k.id and cc.profile_id = auth.uid()
                )
              )
          )
        )
    )
    else false
  end
$$;

comment on function public.can_modify_client is
  'Write boundary, deliberately narrower than can_access_client: the client record''s own owner, or the owner/collaborator of one of its cases.';

-- Four read policies for client-level (no case_id) financial and document
-- detail used can_access_client for their fallback branch. 0032's own
-- comment above documents_scoped_select says this fallback should "retain
-- the narrower client boundary" -- the sibling write policy right below it
-- already does, using can_modify_client. Only the read side used
-- can_access_client, which was narrow by accident (0032's mistaken rewrite)
-- and became a real leak the moment it was restored to branch-wide above: a
-- colleague who can see a case for cover would also see what its client had
-- been billed, before ever owning it.
drop policy if exists documents_scoped_select on public.documents;
create policy documents_scoped_select on public.documents
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (case_id is not null and public.can_access_case(case_id)
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
      or case_id is null and client_id is not null and public.can_modify_client(client_id)
    ))
  )
);

drop policy if exists invoices_scoped_select on public.invoices;
create policy invoices_scoped_select on public.invoices
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and (
    client_id = public.current_client_id()
    or (public.is_internal_user() and (
      case_id is not null and public.can_access_case(case_id)
      or case_id is null and public.can_modify_client(client_id)
    ))
  )
);

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
           or i.case_id is null and public.can_modify_client(i.client_id))
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

commit;
