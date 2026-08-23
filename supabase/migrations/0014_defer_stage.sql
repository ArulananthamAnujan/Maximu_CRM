-- The rest of the deferral change. Apply 0013_defer_stage_enum.sql first: this
-- file uses the enum value that one adds, and PostgreSQL will not accept both
-- in a single transaction.
begin;

-- Deferral parks a case rather than undoing the work already done, so the
-- stored progress is kept as it is when a case is deferred (see
-- move_case_lifecycle below). This function still needs a value for the stage
-- so that any other caller gets a sensible answer.
create or replace function public.lifecycle_progress(stage public.case_lifecycle_stage)
returns smallint language sql immutable as $$
  select case stage
    when 'enquiry' then 10
    when 'student' then 35
    when 'application' then 60
    when 'visa' then 85
    when 'deferred' then 50
    else 100
  end::smallint
$$;

-- Same single entry point as before, now with deferral in the pipeline:
--
--   * a case may be deferred from any stage it is actively being worked at,
--     because a student can defer before or after an application is lodged;
--   * a deferred case resumes into whichever stage the work restarts at;
--   * a case is still only completed from the visa stage, so a deferred case
--     has to be resumed before it can be finished.
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

  -- A case is only "done" once it has reached a visa decision. A deferred case
  -- is resumed first, which is why this message names the visa stage.
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
    -- Parking a case does not undo the work already recorded against it.
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
      -- A deferred case is waiting on the student, not progressing.
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

comment on column public.cases.lifecycle_stage is
  'Pipeline position: enquiry, student, application, visa, deferred or completed.';

commit;
