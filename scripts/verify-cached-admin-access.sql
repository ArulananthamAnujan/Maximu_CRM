-- Run against the existing schema as its database administrator. This probe
-- makes no customer-data changes; all policy changes are rolled back.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create temporary table access_probe_users on commit drop as
  select id from public.profiles union all select null::uuid;
create temporary table access_probe_samples (
  sample_id bigint generated always as identity,
  table_name text, row_data jsonb
) on commit drop;
create temporary table access_probe_policies on commit drop as
  select tablename, policyname, qual, with_check, roles, cmd
  from pg_policies where schemaname='public' and (tablename,policyname) in (
    ('clients','clients_scoped_select'),('clients','clients_scoped_write'),
    ('cases','cases_scoped_select'),('cases','cases_scoped_write'),
    ('enquiries','enquiries_read'),('enquiries','enquiries_write'));
do $$
declare t text;
begin
  if (select count(*) from access_probe_policies) <> 6 then
    raise exception 'Expected six existing access policies';
  end if;
  foreach t in array array['clients','cases','enquiries'] loop
    execute format('insert into access_probe_samples(table_name,row_data)
      select %L,to_jsonb(r) from (select distinct on (branch_id) *
        from public.%I order by branch_id,id) r',t,t);
    execute format('insert into access_probe_samples(table_name,row_data)
      select %L,to_jsonb(r) from (select * from public.%I order by id limit 12) r',t,t);
  end loop;
end $$;
-- Synthetic values exist only in the temporary probe, never business tables.
insert into access_probe_samples(table_name,row_data)
select table_name,jsonb_set(row_data,'{organisation_id}',
  '"ffffffff-ffff-4fff-8fff-ffffffffffff"') from access_probe_samples;
insert into access_probe_samples(table_name,row_data)
select table_name,jsonb_set(row_data,'{case_id}',
  '"ffffffff-ffff-4fff-8fff-ffffffffffff"') from access_probe_samples
where table_name='enquiries';
create function pg_temp.capture_directory_access()
returns table(profile_id text,table_name text,policy_name text,decisions jsonb)
language plpgsql as $$
declare u record; p record;
begin
  for u in select id from access_probe_users loop
    perform set_config('request.jwt.claim.sub',coalesce(u.id::text,''),true);
    for p in select v.* from pg_policies v join access_probe_policies old
      using(tablename,policyname) where v.schemaname='public' loop
      profile_id := coalesce(u.id::text,'unauthenticated');
      table_name := p.tablename; policy_name := p.policyname;
      execute format('select jsonb_agg(coalesce((%s),false) order by s.sample_id)
        from access_probe_samples s cross join lateral
        jsonb_populate_record(null::public.%I,s.row_data) r
        where s.table_name=%L',p.qual,p.tablename,p.tablename) into decisions;
      return next;
    end loop;
  end loop;
end $$;
create temporary table access_probe_before on commit drop as
  select * from pg_temp.capture_directory_access();

-- Insert the BODY of migration 0038 here (without its BEGIN/COMMIT) when
-- running this in the dashboard. psql users can assemble the same script.
-- MIGRATION_BODY

create temporary table access_probe_after on commit drop as
  select * from pg_temp.capture_directory_access();
do $$
begin
  if exists (
    (select * from access_probe_before except select * from access_probe_after)
    union all
    (select * from access_probe_after except select * from access_probe_before)
  ) then raise exception 'Access decisions changed; roll back'; end if;
  if exists(select 1 from pg_policies p join access_probe_policies old
    using(tablename,policyname) where p.schemaname='public' and
    (p.with_check is distinct from old.with_check or p.roles is distinct from old.roles or p.cmd is distinct from old.cmd))
  then raise exception 'Write validation, roles or commands changed'; end if;
end $$;
select 'Access decisions and write validation unchanged' as result,
  (select count(*) from access_probe_users) as identities,
  (select count(*) from access_probe_samples) as sample_rows,
  (select count(*) from access_probe_before) as policy_identity_comparisons;
rollback;
