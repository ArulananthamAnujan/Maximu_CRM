begin;

create table if not exists public.case_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  stage_id uuid references public.workflow_stages(id) on delete cascade,
  title text not null,
  item_type text not null default 'task',
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','waived')),
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  evidence_document_id uuid references public.documents(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id, created_at desc) where read_at is null;

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  provider text not null,
  connection_scope text not null default 'user',
  external_account text,
  secret_reference text,
  status text not null default 'pending' check (status in ('pending','active','error','revoked')),
  scopes text[] not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id, provider, profile_id)
);

create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  connection_id uuid references public.integration_connections(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  provider text not null,
  operation text not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(organisation_id, idempotency_key)
);
create index if not exists integration_jobs_queue_idx
  on public.integration_jobs(provider, status, available_at);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  signature_verified boolean not null default false,
  payload_hash text not null,
  status text not null default 'received',
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now(),
  unique(provider, external_event_id)
);

create table if not exists public.data_retention_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  resource_type text not null,
  retain_days integer not null check (retain_days >= 0),
  action text not null default 'review' check (action in ('review','archive','anonymise','delete')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organisation_id, resource_type)
);

alter table public.case_checklist_items enable row level security;
alter table public.notifications enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_jobs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.data_retention_rules enable row level security;

create policy checklist_scoped_access on public.case_checklist_items for all to authenticated
using (organisation_id = public.current_organisation_id() and exists (
  select 1 from public.cases c where c.id = case_checklist_items.case_id and public.can_access_client(c.client_id)
))
with check (organisation_id = public.current_organisation_id() and public.is_internal_user() and exists (
  select 1 from public.cases c where c.id = case_checklist_items.case_id and public.can_access_client(c.client_id)
));

create policy notifications_own_read on public.notifications for select to authenticated
using (organisation_id = public.current_organisation_id() and recipient_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
using (organisation_id = public.current_organisation_id() and recipient_id = auth.uid())
with check (organisation_id = public.current_organisation_id() and recipient_id = auth.uid());
create policy notifications_internal_insert on public.notifications for insert to authenticated
with check (organisation_id = public.current_organisation_id() and public.is_internal_user());

create policy connections_owner_or_admin on public.integration_connections for select to authenticated
using (organisation_id = public.current_organisation_id() and (profile_id = auth.uid() or public.current_user_level()::text in ('platform_owner','super_admin','branch_admin')));
create policy connections_admin_write on public.integration_connections for all to authenticated
using (organisation_id = public.current_organisation_id() and (profile_id = auth.uid() or public.current_user_level()::text in ('platform_owner','super_admin')))
with check (organisation_id = public.current_organisation_id() and (profile_id = auth.uid() or public.current_user_level()::text in ('platform_owner','super_admin')));

create policy integration_jobs_internal on public.integration_jobs for all to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user())
with check (organisation_id = public.current_organisation_id() and public.is_internal_user());

create policy webhook_admin_read on public.webhook_events for select to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'));
create policy retention_admin_manage on public.data_retention_rules for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin'));

create or replace function public.transition_case_stage(
  target_case uuid,
  target_stage uuid,
  transition_reason text default null
) returns public.cases
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_case public.cases;
  destination public.workflow_stages;
  blocker_count integer;
  result public.cases;
begin
  select * into current_case from public.cases where id = target_case for update;
  if current_case.id is null then raise exception 'Case not found'; end if;
  if not public.is_internal_user() or not public.can_access_client(current_case.client_id) then
    raise exception 'Access denied';
  end if;
  select * into destination from public.workflow_stages where id = target_stage;
  if destination.id is null or destination.template_id is distinct from current_case.workflow_template_id then
    raise exception 'Stage does not belong to the case workflow';
  end if;
  select count(*) into blocker_count from public.case_checklist_items
    where case_id = target_case and stage_id = current_case.current_stage_id
      and required = true and status not in ('completed','waived');
  if blocker_count > 0 then raise exception 'Required checklist items must be completed'; end if;

  update public.case_stage_history set exited_at = now()
    where case_id = target_case and exited_at is null;
  insert into public.case_stage_history
    (organisation_id, case_id, from_stage_id, to_stage_id, changed_by, reason)
  values
    (current_case.organisation_id, target_case, current_case.current_stage_id, target_stage, auth.uid(), transition_reason);
  update public.cases set current_stage_id = target_stage, stage_entered_at = now(),
    progress = least(100, greatest(progress, destination.position * 10))
    where id = target_case returning * into result;
  insert into public.audit_events
    (organisation_id, actor_id, action, resource_type, resource_id, case_id, summary, after_data)
  values
    (current_case.organisation_id, auth.uid(), 'case.stage_transitioned', 'case', target_case::text,
     target_case, 'Case moved to ' || destination.name,
     jsonb_build_object('from_stage_id', current_case.current_stage_id, 'to_stage_id', target_stage));
  return result;
end;
$$;

commit;
