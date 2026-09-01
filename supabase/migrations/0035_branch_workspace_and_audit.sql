begin;

-- A branch is one working team. Assignment remains an accountability label,
-- never a visibility boundary: every active internal user can open and work
-- on every record in their own branch.
create or replace function public.can_access_case(target_case uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.cases c
    where c.id=target_case and c.organisation_id=public.current_organisation_id()
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (public.is_internal_user() and c.branch_id=public.current_user_branch())
        or exists (
          select 1 from public.client_user_links cul
          where cul.profile_id=auth.uid() and cul.client_id=c.client_id
        )
      )
  );
$$;

create or replace function public.can_modify_case(target_case uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.cases c
    where c.id=target_case and c.organisation_id=public.current_organisation_id()
      and public.is_internal_user()
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or c.branch_id=public.current_user_branch()
      )
  );
$$;

create or replace function public.can_access_client(target_client uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.clients c
    where c.id=target_client and c.organisation_id=public.current_organisation_id()
      and (
        public.current_user_level()::text in ('platform_owner','super_admin')
        or (public.is_internal_user() and c.branch_id=public.current_user_branch())
        or exists (select 1 from public.client_user_links cul where cul.profile_id=auth.uid() and cul.client_id=c.id)
      )
  );
$$;

-- Database-level audit coverage prevents a new screen or import route from
-- silently bypassing accountability. Sensitive row values are deliberately
-- not copied; the event records the actor, operation, record and changed
-- columns, while each business table remains the authoritative data source.
create or replace function public.audit_branch_workspace_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  row_data jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  before_data jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  org_id uuid := nullif(row_data->>'organisation_id','')::uuid;
  branch_value text := row_data->>'branch_id';
  changed text[];
begin
  if auth.uid() is null or org_id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' then
    select coalesce(array_agg(k order by k),'{}') into changed
    from jsonb_object_keys(row_data) k where row_data->k is distinct from before_data->k;
  else
    changed := array(select jsonb_object_keys(row_data) order by 1);
  end if;
  insert into public.audit_events
    (organisation_id,actor_id,action,resource_type,resource_id,summary,after_data)
  values
    (org_id,auth.uid(),lower(tg_table_name)||'.'||lower(tg_op),tg_table_name,
     coalesce(row_data->>'id','unknown'),
     initcap(lower(tg_op))||' on '||replace(tg_table_name,'_',' '),
     jsonb_build_object('branch_id',branch_value,'changed_fields',changed));
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clients','enquiries','cases','education_applications','visa_matters','tasks','appointments','case_notes','documents','email_threads','email_messages','invoices','payments'] loop
    execute format('drop trigger if exists branch_workspace_audit on public.%I',t);
    execute format('create trigger branch_workspace_audit after insert or update or delete on public.%I for each row execute function public.audit_branch_workspace_change()',t);
  end loop;
end $$;

comment on function public.can_access_case(uuid) is 'Organisation scope for owners, branch scope for all internal branch staff, and own-file scope for clients. Assignment is accountability metadata, not a visibility boundary.';
comment on function public.can_modify_case(uuid) is 'All active internal users may work on cases in their own branch; database audit triggers identify every change.';

commit;
