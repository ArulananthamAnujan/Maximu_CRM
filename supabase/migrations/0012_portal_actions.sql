begin;

-- A client portal account may now supply a requested document and ask for an
-- appointment, but it could not write the records those actions produce.
--
-- The audit insert failed, which failed the whole upload: a client could not
-- provide their own passport. The notification insert failed too, so the case
-- owner was never told an appointment had been requested. Both are limited to
-- the client's own case.

drop policy if exists audit_client_insert on public.audit_events;
create policy audit_client_insert on public.audit_events
for insert to authenticated with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = 'student'
  and actor_id = auth.uid()
  and case_id is not null
  and exists (
    select 1 from public.cases c
    where c.id = audit_events.case_id
      and c.client_id = public.current_client_id()
  )
);

-- A client may read the history of their own case, so the portal can show what
-- has happened. Internal notes are a separate table and stay staff-only.
drop policy if exists audit_client_read on public.audit_events;
create policy audit_client_read on public.audit_events
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = 'student'
  and case_id is not null
  and exists (
    select 1 from public.cases c
    where c.id = audit_events.case_id
      and c.client_id = public.current_client_id()
  )
);

drop policy if exists notifications_client_insert on public.notifications;
create policy notifications_client_insert on public.notifications
for insert to authenticated with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text = 'student'
  and case_id is not null
  and exists (
    select 1 from public.cases c
    where c.id = notifications.case_id
      and c.client_id = public.current_client_id()
  )
);

commit;
