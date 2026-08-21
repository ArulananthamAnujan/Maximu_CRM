begin;

-- The case lifecycle is the pipeline an agency actually works: an enquiry
-- becomes a student, a student gets applications, an application leads to a
-- visa, and an approved visa completes the case. It is deliberately separate
-- from the optional `workflow_templates` machinery, which only applies to
-- cases that were created from a template.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'case_lifecycle_stage') then
    create type public.case_lifecycle_stage as enum (
      'enquiry',
      'student',
      'application',
      'visa',
      'completed'
    );
  end if;
end $$;

alter table public.cases
  add column if not exists lifecycle_stage public.case_lifecycle_stage
    not null default 'enquiry',
  add column if not exists visa_expiry_on date,
  add column if not exists lifecycle_changed_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists reopened_at timestamptz;

create index if not exists cases_lifecycle_idx
  on public.cases(organisation_id, lifecycle_stage, due_at);

create table if not exists public.case_lifecycle_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  from_stage public.case_lifecycle_stage,
  to_stage public.case_lifecycle_stage not null,
  changed_by uuid references public.profiles(id),
  reason text,
  occurred_at timestamptz not null default now()
);
create index if not exists case_lifecycle_events_case_idx
  on public.case_lifecycle_events(case_id, occurred_at desc);

-- Place existing cases on the pipeline from the signals already recorded. This
-- runs only on first application: once any transition has been recorded, or a
-- case has been moved off the default stage, the stored stage is authoritative
-- and must not be recomputed.
do $$
begin
  if not exists (select 1 from public.case_lifecycle_events) then
    update public.cases set lifecycle_stage = case
      when closed_at is not null or health = 'closed' then 'completed'
      when service_type = 'direct_visa' then 'visa'
      else 'enquiry'
    end::public.case_lifecycle_stage
    where lifecycle_stage = 'enquiry';

    update public.cases set completed_at = closed_at
      where lifecycle_stage = 'completed' and completed_at is null;
  end if;
end $$;


-- Canonical progress for each pipeline position. Reopening a completed case
-- returns its progress to the stage it reopens into rather than leaving it
-- stranded at 100%.
create or replace function public.lifecycle_progress(stage public.case_lifecycle_stage)
returns smallint language sql immutable as $$
  select case stage
    when 'enquiry' then 10
    when 'student' then 35
    when 'application' then 60
    when 'visa' then 85
    else 100
  end::smallint
$$;

-- Every stage change goes through here so the rules, the history and the
-- audit trail cannot drift apart.
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
begin
  -- Check visibility before locking. `for update` is filtered by the write
  -- policy, so locking first would report a permission problem as a missing
  -- case for anyone without write access (a portal account, for example).
  select * into current_case from public.cases where id = target_case;
  if current_case.id is null then
    raise exception 'Case not found' using errcode = 'P0002';
  end if;
  if not public.is_internal_user()
     or not public.can_access_client(current_case.client_id) then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;
  select * into current_case from public.cases where id = target_case for update;
  if current_case.id is null then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;
  if current_case.lifecycle_stage = target_stage then
    raise exception 'This case is already at the % stage', target_stage
      using errcode = '22023';
  end if;

  -- A case is only "done" once it has reached a visa decision.
  if target_stage = 'completed' and current_case.lifecycle_stage <> 'visa' then
    raise exception 'A case can only be completed from the visa stage'
      using errcode = '22023';
  end if;

  -- The visa stage is meaningless without the expiry date it is worked
  -- against, so it is enforced here as well as on the intake form.
  if target_stage in ('visa', 'completed') and current_case.visa_expiry_on is null then
    raise exception 'Record the visa expiry date before moving this case to the visa stage'
      using errcode = '22023';
  end if;

  reopening := current_case.lifecycle_stage = 'completed';

  insert into public.case_lifecycle_events
    (organisation_id, case_id, from_stage, to_stage, changed_by, reason)
  values
    (current_case.organisation_id, target_case, current_case.lifecycle_stage,
     target_stage, auth.uid(), transition_reason);

  update public.cases set
    lifecycle_stage = target_stage,
    lifecycle_changed_at = now(),
    stage_entered_at = now(),
    progress = public.lifecycle_progress(target_stage),
    closed_at = case when target_stage = 'completed' then now() else null end,
    completed_at = case when target_stage = 'completed' then now() else completed_at end,
    reopened_at = case when reopening then now() else reopened_at end,
    outcome = case
      when target_stage = 'completed' then coalesce(transition_reason, 'Visa approved')
      else null
    end,
    health = case
      when target_stage = 'completed' then 'closed'::public.case_health
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
     case when reopening then 'case.reopened' else 'case.lifecycle_moved' end,
     'case', target_case::text, target_case,
     case
       when reopening then 'Reopened case into ' || target_stage::text
       when target_stage = 'completed' then 'Completed case'
       else 'Moved case to ' || target_stage::text
     end,
     jsonb_build_object('lifecycle_stage', current_case.lifecycle_stage),
     jsonb_build_object('lifecycle_stage', target_stage, 'reason', transition_reason));

  return result;
end;
$$;

alter table public.case_lifecycle_events enable row level security;

drop policy if exists case_lifecycle_events_read on public.case_lifecycle_events;
create policy case_lifecycle_events_read on public.case_lifecycle_events
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and exists (
    select 1 from public.cases c
    where c.id = case_lifecycle_events.case_id
      and public.can_access_client(c.client_id)
  )
);
drop policy if exists case_lifecycle_events_insert on public.case_lifecycle_events;
create policy case_lifecycle_events_insert on public.case_lifecycle_events
for insert to authenticated with check (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
  and changed_by = auth.uid()
  and exists (
    select 1 from public.cases c
    where c.id = case_lifecycle_events.case_id
      and public.can_access_client(c.client_id)
  )
);

comment on column public.cases.lifecycle_stage is
  'Pipeline position: enquiry, student, application, visa or completed.';
comment on column public.cases.visa_expiry_on is
  'Current visa expiry. Required before a case may enter the visa stage.';
comment on function public.move_case_lifecycle is
  'Single entry point for lifecycle changes: validates the transition, records history and writes the audit event.';

commit;
