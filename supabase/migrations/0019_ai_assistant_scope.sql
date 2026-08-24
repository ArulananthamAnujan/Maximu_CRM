begin;

-- ai_interactions was readable by any internal user across the whole
-- organisation: 0009 scoped its own write to the author, but left read at
-- organisation-wide. Every other conversation in this CRM that touches a
-- specific case is scoped to who may access that case; a summary or a
-- drafted message about a client is no different, and a case officer reading
-- a colleague's AI conversations about a client neither of them owns is
-- exactly what the rest of this schema prevents everywhere else.
--
-- An interaction not tied to any case (case_id null) is read by its own
-- author or by a manager, the same shape as everything else with no case to
-- scope by.
drop policy if exists ai_interactions_internal on public.ai_interactions;
drop policy if exists ai_interactions_read on public.ai_interactions;
create policy ai_interactions_read on public.ai_interactions
for select to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and (
    profile_id = auth.uid()
    or public.current_user_level()::text in
       ('platform_owner','super_admin','branch_admin','manager')
    or (case_id is not null and exists (
      select 1 from public.cases c
      where c.id = ai_interactions.case_id
        and public.can_access_client(c.client_id)
    ))
  )
);
drop policy if exists ai_interactions_write on public.ai_interactions;
create policy ai_interactions_write on public.ai_interactions
for insert to authenticated
with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and profile_id = auth.uid()
  and (
    case_id is null
    or exists (
      select 1 from public.cases c
      where c.id = ai_interactions.case_id
        and public.can_access_client(c.client_id)
    )
  )
);

create index if not exists ai_interactions_case_idx
  on public.ai_interactions(case_id, created_at desc);

comment on table public.ai_interactions is
  'A drafting or summarising exchange with the assistant, scoped to whoever may access the case it concerns. Stores redacted prompt and response text only; the assistant never acts on its own.';

commit;
