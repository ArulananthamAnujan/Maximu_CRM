begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Every active internal colleague works the whole branch, including client
-- details and portal invitations. Assignment never widens another branch.
create or replace function public.can_modify_client(target_client uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_internal_user() and exists (
    select 1 from public.clients c
    where c.id=target_client and c.organisation_id=public.current_organisation_id()
      and (public.current_user_level()::text in ('platform_owner','super_admin')
        or c.branch_id=public.current_user_branch())
  );
$$;

-- Check a new row's branch directly; re-reading its ID cannot work on INSERT.
drop policy if exists clients_scoped_write on public.clients;
create policy clients_scoped_write on public.clients for all to authenticated
using (
  organisation_id=(select public.current_organisation_id())
  and case when (select public.current_user_level())::text in ('platform_owner','super_admin')
    then true else public.can_modify_client(id) end
) with check (
  organisation_id=(select public.current_organisation_id())
  and public.is_internal_user() and public.can_access_branch(branch_id)
);

drop policy if exists cases_scoped_write on public.cases;
create policy cases_scoped_write on public.cases for all to authenticated
using (
  organisation_id=(select public.current_organisation_id())
  and case when (select public.current_user_level())::text in ('platform_owner','super_admin')
    then true else public.can_modify_case(id) end
) with check (
  organisation_id=(select public.current_organisation_id())
  and public.is_internal_user() and public.can_access_branch(branch_id)
);

-- Case children often have no branch_id of their own. Attribute the event to
-- the record's branch, including changes made there by a Super Admin.
create or replace function public.audit_branch_workspace_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  row_data jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_data jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  org_id uuid := nullif(row_data->>'organisation_id','')::uuid;
  branch_value uuid := nullif(row_data->>'branch_id','')::uuid;
  case_value uuid := nullif(row_data->>'case_id','')::uuid;
  client_value uuid := nullif(row_data->>'client_id','')::uuid;
  changed text[];
begin
  if auth.uid() is null or org_id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='cases' then case_value := (row_data->>'id')::uuid; end if;
  if tg_table_name='email_messages' then
    select t.case_id,t.client_id into case_value,client_value
      from public.email_threads t where t.id=(row_data->>'thread_id')::uuid and t.organisation_id=org_id;
  elsif tg_table_name='payments' then
    select i.case_id,i.client_id into case_value,client_value
      from public.invoices i where i.id=(row_data->>'invoice_id')::uuid and i.organisation_id=org_id;
  end if;
  if branch_value is null and case_value is not null then
    select c.branch_id into branch_value from public.cases c where c.id=case_value and c.organisation_id=org_id;
  end if;
  if branch_value is null and client_value is not null then
    select c.branch_id into branch_value from public.clients c where c.id=client_value and c.organisation_id=org_id;
  end if;
  if tg_op='UPDATE' then
    select coalesce(array_agg(k order by k),'{}') into changed
      from jsonb_object_keys(row_data) k where row_data->k is distinct from previous_data->k;
  else changed := array(select jsonb_object_keys(row_data) order by 1);
  end if;
  -- A deleted case cannot remain an FK target in its audit event.
  if case_value is not null and not exists (select 1 from public.cases c where c.id=case_value) then case_value := null; end if;
  insert into public.audit_events
    (organisation_id,actor_id,action,resource_type,resource_id,case_id,summary,after_data)
  values (org_id,auth.uid(),lower(tg_table_name)||'.'||lower(tg_op),tg_table_name,
    coalesce(row_data->>'id','unknown'),case_value,
    initcap(lower(tg_op))||' on '||replace(tg_table_name,'_',' '),
    jsonb_build_object('branch_id',branch_value,'changed_fields',changed));
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

comment on function public.can_modify_client(uuid) is 'All active internal colleagues may edit client records in their branch; owners retain organisation-wide access.';
commit;
