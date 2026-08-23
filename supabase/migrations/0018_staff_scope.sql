begin;

-- Staff could write to every case in their branch, not only the ones assigned
-- to them: can_access_client answered true for a staff member on any client in
-- a branch they can reach, and that one predicate guarded reads *and* writes.
-- For a multi-country agency that means any case officer could edit, move,
-- defer or archive a colleague's file.
--
-- Visibility is left as it was -- a case officer can still see their branch,
-- which is what makes cover and handover possible -- and writing is narrowed
-- to the cases that are actually theirs.

-- Who may change a client's records, as opposed to read them.
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
    -- A case officer or partner writes only where they are accountable: they
    -- own the client record, or they own one of its cases. Reassignment
    -- therefore grants access, and taking a case away removes it.
    when public.current_user_level()::text in ('staff','partner') then exists (
      select 1 from public.clients c
      where c.id = target_client
        and c.organisation_id = public.current_organisation_id()
        and (
          c.owner_id = auth.uid()
          or exists (
            select 1 from public.cases k
            where k.client_id = c.id and k.owner_id = auth.uid()
          )
        )
    )
    else false
  end
$$;

comment on function public.can_modify_client is
  'Write access to a client and everything hanging off it. Managers keep their branch; a case officer is limited to the cases assigned to them.';

-- The write policies on everything that makes up a case file. Selects are left
-- alone, so a colleague's case stays visible and becomes read-only.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('cases',                  'cases_scoped_write',            'client_id'),
      ('documents',              'documents_staff_write',         'client_id'),
      ('dependants',             'dependants_write',              'client_id')
    ) as t(table_name, policy_name, client_column)
  loop
    execute format('drop policy if exists %I on public.%I', spec.policy_name, spec.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ('
      || 'organisation_id = public.current_organisation_id()'
      || ' and public.current_user_level()::text in (''platform_owner'',''super_admin'',''branch_admin'',''manager'',''staff'',''partner'')'
      || ' and public.can_modify_client(%I)) with check ('
      || 'organisation_id = public.current_organisation_id()'
      || ' and public.current_user_level()::text in (''platform_owner'',''super_admin'',''branch_admin'',''manager'',''staff'',''partner'')'
      || ' and public.can_modify_client(%I))',
      spec.policy_name, spec.table_name, spec.client_column, spec.client_column);
  end loop;
end $$;

-- Clients need their own rule. can_modify_client asks who owns the row, which
-- nothing does at the moment a client is first created, so creating one is
-- governed by the branch as before and only changing an existing one is
-- narrowed to its owner.
drop policy if exists clients_scoped_write on public.clients;
create policy clients_scoped_write on public.clients for all to authenticated
using (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in
      ('platform_owner','super_admin','branch_admin','manager','staff','partner')
  and public.can_modify_client(id)
)
with check (
  organisation_id = public.current_organisation_id()
  and public.current_user_level()::text in
      ('platform_owner','super_admin','branch_admin','manager','staff','partner')
  and public.can_access_branch(branch_id)
  and (
    public.current_user_level()::text in
        ('platform_owner','super_admin','branch_admin','manager')
    or owner_id = auth.uid()
    or public.can_modify_client(id)
  )
);

-- The same, for the tables that reach their client through a case.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('education_applications', 'education_applications_write'),
      ('visa_matters',           'visa_matters_write')
    ) as t(table_name, policy_name)
  loop
    execute format('drop policy if exists %I on public.%I', spec.policy_name, spec.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ('
      || 'organisation_id = public.current_organisation_id() and exists ('
      || ' select 1 from public.cases c where c.id = %I.case_id'
      || ' and public.can_modify_client(c.client_id))) with check ('
      || 'organisation_id = public.current_organisation_id() and exists ('
      || ' select 1 from public.cases c where c.id = %I.case_id'
      || ' and public.can_modify_client(c.client_id)))',
      spec.policy_name, spec.table_name, spec.table_name, spec.table_name);
  end loop;
end $$;

-- Every stage change goes through this function, so the same rule applies to
-- moving a case forward, back, into deferral and to completion.
create or replace function public.move_case_lifecycle(
  target_case uuid,
  target_stage public.case_lifecycle_stage,
  transition_reason text default null
) returns public.cases
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_case public.cases;
  result public.cases;
  reopening boolean;
  deferring boolean;
  resuming boolean;
begin
  select * into current_case from public.cases where id = target_case;
  if current_case.id is null then
    raise exception 'Case not found' using errcode = 'P0002';
  end if;
  if not public.is_internal_user() then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;
  -- Seeing a colleague's case is not the same as being able to move it.
  if not public.can_modify_client(current_case.client_id) then
    raise exception 'This case is assigned to somebody else. Ask a manager to reassign it to you.'
      using errcode = '42501';
  end if;
  select * into current_case from public.cases where id = target_case for update;
  if current_case.id is null then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;
  if current_case.lifecycle_stage = target_stage then
    raise exception 'This case is already at the % stage', target_stage
      using errcode = '22023';
  end if;

  if target_stage = 'completed' and current_case.lifecycle_stage <> 'visa' then
    raise exception 'A case can only be completed from the visa stage'
      using errcode = '22023';
  end if;

  if target_stage in ('visa', 'completed') and current_case.visa_expiry_on is null then
    raise exception 'Record the visa expiry date before moving this case to the visa stage'
      using errcode = '22023';
  end if;

  reopening := current_case.lifecycle_stage = 'completed';
  deferring := target_stage = 'deferred';
  resuming := current_case.lifecycle_stage = 'deferred';

  insert into public.case_lifecycle_events
    (organisation_id, case_id, from_stage, to_stage, changed_by, reason)
  values
    (current_case.organisation_id, target_case, current_case.lifecycle_stage,
     target_stage, auth.uid(), transition_reason);

  update public.cases set
    lifecycle_stage = target_stage,
    lifecycle_changed_at = now(),
    stage_entered_at = now(),
    progress = case
      when deferring then current_case.progress
      else public.lifecycle_progress(target_stage)
    end,
    closed_at = case when target_stage = 'completed' then now() else null end,
    completed_at = case when target_stage = 'completed' then now() else completed_at end,
    reopened_at = case when reopening then now() else reopened_at end,
    outcome = case
      when target_stage = 'completed' then coalesce(transition_reason, 'Visa approved')
      else null
    end,
    health = case
      when target_stage = 'completed' then 'closed'::public.case_health
      when deferring then 'attention'::public.case_health
      when current_case.health = 'closed' then 'healthy'::public.case_health
      else current_case.health
    end
  where id = target_case
  returning * into result;

  update public.clients
    set current_lifecycle = target_stage::text, updated_at = now()
    where id = current_case.client_id;

  insert into public.audit_events
    (organisation_id, actor_id, action, resource_type, resource_id, case_id,
     summary, before_data, after_data)
  values
    (current_case.organisation_id, auth.uid(),
     case
       when reopening then 'case.reopened'
       when deferring then 'case.deferred'
       when resuming then 'case.resumed'
       else 'case.lifecycle_moved'
     end,
     'case', target_case::text, target_case,
     case
       when reopening then 'Reopened case into ' || target_stage::text
       when deferring then 'Deferred case'
       when target_stage = 'completed' then 'Completed case'
       when resuming then 'Resumed case from deferral into ' || target_stage::text
       else 'Moved case to ' || target_stage::text
     end,
     jsonb_build_object('lifecycle_stage', current_case.lifecycle_stage),
     jsonb_build_object('lifecycle_stage', target_stage, 'reason', transition_reason));

  return result;
end;
$$;

-- Archiving a case ends the work on it, so it is a management decision. A case
-- officer asks for it and the managers who can act are told.
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
  select * into subject from public.cases where id = target_case;
  if subject.id is null or not public.can_access_client(subject.client_id) then
    raise exception 'Case not found' using errcode = 'P0002';
  end if;
  if not public.is_internal_user() then
    raise exception 'You do not have access to this case' using errcode = '42501';
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

revoke all on function public.request_case_archive(uuid, text) from public;
grant execute on function public.request_case_archive(uuid, text) to authenticated;

comment on function public.request_case_archive is
  'A case officer asks for a case to be archived; the managers who can approve it are notified. Archiving itself stays a management action.';

commit;
