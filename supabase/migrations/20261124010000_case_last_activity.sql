-- "Latest on top": every case list is ordered by when the case was last worked
-- on. Until now the lists were ordered by the day the case was opened, so an
-- old case that was reopened, noted on, sent a document or given a task stayed
-- at the bottom.
--
-- The time is kept beside the case rather than on it: writing to public.cases
-- runs the permission guards for editing a case, and somebody who may only
-- add a note or finish a task must still be able to move the case up.
begin;

create table public.case_activity (
  case_id uuid primary key references public.cases on delete cascade,
  organisation_id uuid not null references public.organisations on delete cascade,
  last_activity_at timestamptz not null default clock_timestamp()
);
create index case_activity_recent_idx on public.case_activity(organisation_id,last_activity_at desc);
alter table public.case_activity enable row level security;
revoke all on public.case_activity from public,anon,authenticated;
grant select on public.case_activity to authenticated;
-- Only a time is held here, and it is only ever read joined to a case the
-- person can already see, so the staff of the organisation may read it.
create policy case_activity_read on public.case_activity for select to authenticated
  using (organisation_id=public.current_organisation_id() and public.is_internal_user());

insert into public.case_activity(case_id,organisation_id,last_activity_at)
select c.id,c.organisation_id,
  greatest(c.opened_at,c.stage_entered_at,
    coalesce((select max(n.created_at) from public.case_notes n where n.case_id=c.id),c.opened_at))
from public.cases c
on conflict (case_id) do nothing;

create function private.touch_case(p_case uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.case_activity(case_id,organisation_id,last_activity_at)
  select id,organisation_id,clock_timestamp() from public.cases where id=p_case
  on conflict (case_id) do update set last_activity_at=excluded.last_activity_at
$$;
revoke all on function private.touch_case(uuid) from public,anon,authenticated;

-- Anything written against a case counts as work on it.
create function private.touch_case_from_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  target=(case when tg_table_name='cases' then to_jsonb(new)->>'id' else to_jsonb(new)->>'case_id' end)::uuid;
  if target is not null then perform private.touch_case(target); end if;
  return null;
end $$;
revoke all on function private.touch_case_from_row() from public,anon,authenticated;

-- A change to the client's own details is work on each of their cases.
create function private.touch_client_cases() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.case_activity(case_id,organisation_id,last_activity_at)
  select id,organisation_id,clock_timestamp() from public.cases where client_id=new.id
  on conflict (case_id) do update set last_activity_at=excluded.last_activity_at;
  return null;
end $$;
revoke all on function private.touch_client_cases() from public,anon,authenticated;

create trigger touch_case_activity after insert or update on public.cases
  for each row execute function private.touch_case_from_row();
create trigger touch_case_activity after update on public.clients
  for each row execute function private.touch_client_cases();
-- Every table that hangs off a case: notes, tasks, documents, applications,
-- visa matters, appointments, invoices, messages and so on. Queues, audit
-- trails and imported history are bookkeeping, not work on the case.
do $$
declare item record;
begin
  for item in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public' and c.column_name='case_id' and t.table_type='BASE TABLE'
      and c.table_name not in ('case_activity','audit_events','notifications')
      and c.table_name not like '%outbox%' and c.table_name not like 'legacy_%'
  loop
    execute format('create trigger touch_case_activity after insert or update on public.%I for each row execute function private.touch_case_from_row()', item.table_name);
  end loop;
end $$;

-- The lists read cases through this, so they can be ordered and paged by the
-- time of the last activity. It runs with the reader's own access. It lists
-- the case columns as they are today: a later migration that adds a case
-- column a list needs must recreate it.
create view public.cases_by_activity with (security_invoker=true) as
  select c.*,coalesce(a.last_activity_at,greatest(c.opened_at,c.stage_entered_at)) as last_activity_at
  from public.cases c left join public.case_activity a on a.case_id=c.id;
revoke all on public.cases_by_activity from public,anon;
grant select on public.cases_by_activity to authenticated;

create or replace function public.schema_version()
returns text language sql stable security definer set search_path=public as $$
  select '20261124010000'
$$;

commit;
