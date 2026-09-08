begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- A returning client can have separate cases in different branches. Share
-- their common profile with those branches, while each case and its children
-- continue to use can_access_case/can_modify_case.
create or replace function public.can_access_client(target_client uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.clients c
    where c.id=target_client and c.organisation_id=public.current_organisation_id()
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (public.is_internal_user() and (
          c.branch_id=public.current_user_branch()
          or exists(select 1 from public.cases k where k.client_id=c.id
            and k.organisation_id=c.organisation_id and k.branch_id=public.current_user_branch())
        ))
        or exists(select 1 from public.client_user_links l where l.profile_id=auth.uid() and l.client_id=c.id)
      )
  );
$$;
create or replace function public.can_modify_client(target_client uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_internal_user() and public.can_access_client(target_client);
$$;

drop policy if exists clients_scoped_write on public.clients;
create policy clients_scoped_write on public.clients for all to authenticated
using (organisation_id=public.current_organisation_id() and public.can_modify_client(id))
with check (
  organisation_id=public.current_organisation_id() and public.is_internal_user()
  and (public.can_access_branch(branch_id) or exists (
    select 1 from public.cases k where k.client_id=clients.id and public.can_modify_case(k.id)
  ))
);

-- Shared profile editing must never become authority to change branches.
create or replace function public.guard_branch_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.branch_id is distinct from old.branch_id and auth.uid() is not null
    and coalesce(public.current_user_level()::text,'') not in ('platform_owner','super_admin') then
    raise exception 'Only Super Admin can transfer records between branches.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger clients_guard_branch_change before update of branch_id on public.clients
for each row execute function public.guard_branch_change();
create trigger cases_guard_branch_change before update of branch_id on public.cases
for each row execute function public.guard_branch_change();
create trigger enquiries_guard_branch_change before update of branch_id on public.enquiries
for each row execute function public.guard_branch_change();

-- A former assignee must not retain access through an ALL policy after the
-- case moves. Personal tasks/appointments without a case keep their scope.
drop policy if exists tasks_internal_write on public.tasks;
create policy tasks_internal_write on public.tasks for all to authenticated
using (organisation_id=public.current_organisation_id() and public.is_internal_user()
  and (case when case_id is not null then public.can_modify_case(case_id) else assigned_to=auth.uid() end))
with check (organisation_id=public.current_organisation_id() and public.is_internal_user()
  and (case when case_id is not null then public.can_modify_case(case_id) else assigned_to=auth.uid() end));
drop policy if exists appointments_internal_write on public.appointments;
create policy appointments_internal_write on public.appointments for all to authenticated
using (organisation_id=public.current_organisation_id() and public.is_internal_user()
  and (case when case_id is not null then public.can_modify_case(case_id) else owner_id=auth.uid() end))
with check (organisation_id=public.current_organisation_id() and public.is_internal_user()
  and (case when case_id is not null then public.can_modify_case(case_id) else owner_id=auth.uid() end));

create or replace function public.transfer_case_branch(
  p_case_id uuid, p_destination_branch_id uuid, p_expected_branch_id uuid, p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  subject public.cases;
  client_record public.clients;
  destination public.branches;
  source_name text;
  actor uuid := auth.uid();
  org uuid := public.current_organisation_id();
  move_client_branch boolean;
begin
  if actor is null or not public.is_internal_user()
    or coalesce(public.current_user_level()::text,'') not in ('platform_owner','super_admin') then
    raise exception 'Only Super Admin can transfer cases between branches.' using errcode='42501';
  end if;
  if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'Enter a transfer reason of up to 2,000 characters.' using errcode='22023';
  end if;
  select * into destination from public.branches
    where id=p_destination_branch_id and organisation_id=org and active=true for share;
  if not found then raise exception 'Choose an active branch in this organisation.' using errcode='22023'; end if;

  -- Lock the shared client first, then its case: simultaneous transfers of
  -- sibling cases cannot leave the home branch pointing at an empty branch.
  select * into subject from public.cases where id=p_case_id and organisation_id=org;
  if not found then raise exception 'That case is not available.' using errcode='42501'; end if;
  select * into client_record from public.clients where id=subject.client_id and organisation_id=org for update;
  if not found then raise exception 'The client profile is not available.' using errcode='42501'; end if;
  select * into subject from public.cases where id=p_case_id and organisation_id=org for update;
  if not found or subject.client_id<>client_record.id then
    raise exception 'The case changed. Refresh and try again.' using errcode='40001';
  end if;
  if subject.branch_id is distinct from p_expected_branch_id then
    raise exception 'The case branch changed. Refresh before transferring it.' using errcode='40001';
  end if;
  if subject.branch_id=p_destination_branch_id then
    raise exception 'Choose a different destination branch.' using errcode='22023';
  end if;
  select name into source_name from public.branches where id=subject.branch_id and organisation_id=org;
  move_client_branch := client_record.branch_id is not distinct from subject.branch_id
    and not exists(select 1 from public.cases k where k.client_id=subject.client_id
      and k.id<>subject.id and k.branch_id is not distinct from subject.branch_id);

  update public.cases set branch_id=destination.id,
    owner_id=case when exists(select 1 from public.profiles p where p.id=subject.owner_id and p.branch_id=destination.id and p.active) then subject.owner_id else null end,
    supervisor_id=case when exists(select 1 from public.profiles p where p.id=subject.supervisor_id and p.branch_id=destination.id and p.active) then subject.supervisor_id else null end
    where id=subject.id;
  update public.enquiries set branch_id=destination.id, assigned_to=null where case_id=subject.id;
  update public.commission_claims cc set branch_id=destination.id
    from public.education_applications a where cc.application_id=a.id and a.case_id=subject.id;
  if move_client_branch then
    update public.clients set branch_id=destination.id, updated_at=now() where id=subject.client_id;
    update public.enquiries set branch_id=destination.id, assigned_to=null
      where client_id=subject.client_id and case_id is null and branch_id is not distinct from subject.branch_id;
  end if;

  -- IDs, original authors, history, Drive locations and all child records
  -- stay unchanged. Their existing case-scoped permissions follow the case.
  insert into public.audit_events
    (organisation_id,actor_id,action,resource_type,resource_id,case_id,summary,before_data,after_data)
  values (org,actor,'case.branch_transferred','case',subject.id::text,subject.id,
    'Transferred from '||coalesce(source_name,'Unassigned')||' to '||destination.name||': '||btrim(p_reason),
    jsonb_build_object('branch_id',subject.branch_id,'owner_id',subject.owner_id,'supervisor_id',subject.supervisor_id),
    jsonb_build_object('branch_id',destination.id,'previous_branch_id',subject.branch_id,
      'reason',btrim(p_reason),'client_home_branch_moved',move_client_branch));
  return jsonb_build_object('caseId',subject.id,'branchId',destination.id,'branch',destination.name,
    'previousBranchId',subject.branch_id,'clientHomeBranchMoved',move_client_branch);
end;
$$;
revoke all on function public.transfer_case_branch(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.transfer_case_branch(uuid,uuid,uuid,text) to authenticated;

commit;
