begin;

-- A case may have one accountable owner and several colleagues working on it.
-- Ownership drives queues and handover; membership grants the same working
-- access without hiding the file from either person when ownership changes.
create table if not exists public.case_collaborators (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  added_by uuid references public.profiles(id),
  added_at timestamptz not null default now(),
  primary key (case_id, profile_id)
);

alter table public.case_collaborators enable row level security;

drop policy if exists case_collaborators_read on public.case_collaborators;
create policy case_collaborators_read on public.case_collaborators
for select to authenticated using (
  organisation_id = public.current_organisation_id()
  and public.is_internal_user()
);

drop policy if exists case_collaborators_manage on public.case_collaborators;
create policy case_collaborators_manage on public.case_collaborators
for all to authenticated using (
  organisation_id = public.current_organisation_id()
  and exists (
    select 1 from public.cases c
    where c.id = case_id
      and (
        public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')
        or c.owner_id = auth.uid()
      )
  )
) with check (
  organisation_id = public.current_organisation_id()
  and added_by = auth.uid()
  and exists (
    select 1 from public.cases c
    where c.id = case_id
      and (
        public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager')
        or c.owner_id = auth.uid()
      )
  )
);

create index if not exists case_collaborators_profile_idx
  on public.case_collaborators (profile_id, case_id);

-- Extend existing write scope: an explicit case-team member may work on the
-- client file just like its owner. Historical rows remain readable after a
-- handover because membership is not removed automatically.
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

comment on table public.case_collaborators is
  'Additional staff working on a case. The owner remains accountable; collaborators retain shared file, communication and invoice visibility.';

commit;
