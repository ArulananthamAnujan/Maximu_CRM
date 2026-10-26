-- Restrict internal role provisioning to trusted server operations.
revoke execute on function public.seed_maximus_system_roles(uuid) from public, anon, authenticated;
revoke execute on function public.seed_roles_after_organisation_insert() from public, anon, authenticated;
grant execute on function public.seed_maximus_system_roles(uuid) to service_role;

-- Keep visa editor and pipeline expiry in the same transaction and RLS scope.
create or replace function public.sync_visa_matter_case_expiry()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and new.current_visa_expiry is not distinct from old.current_visa_expiry then
    return new;
  end if;
  if new.current_visa_expiry is null then return new; end if;
  update public.cases set visa_expiry_on = new.current_visa_expiry
  where id = new.case_id and organisation_id = new.organisation_id
    and visa_expiry_on is distinct from new.current_visa_expiry;
  return new;
end;
$$;
revoke all on function public.sync_visa_matter_case_expiry() from public, anon, authenticated;
create trigger sync_visa_matter_case_expiry
after insert or update of current_visa_expiry on public.visa_matters
for each row execute function public.sync_visa_matter_case_expiry();

-- Repair only unambiguous missing expiries; preserve existing case values.
update public.cases c set visa_expiry_on = v.expiry
from (select case_id, organisation_id, min(current_visa_expiry) expiry
      from public.visa_matters where current_visa_expiry is not null
      group by case_id, organisation_id
      having min(current_visa_expiry) = max(current_visa_expiry)) v
where c.id=v.case_id and c.organisation_id=v.organisation_id and c.visa_expiry_on is null;

