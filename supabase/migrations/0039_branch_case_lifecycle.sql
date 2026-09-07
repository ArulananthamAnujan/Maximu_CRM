-- Align stage transitions with the branch case policy introduced in 0035.
-- Keep SECURITY INVOKER, lifecycle validation and audit attribution intact.
begin;
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
  -- Use the same case boundary as branch editing and case child records.
  if not public.can_modify_case(target_case) then
    raise exception 'You do not have access to modify this branch case.'
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

commit;
