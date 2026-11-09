-- Restore only blank destinations where the saved label agrees with the original selected IDs.
-- Keep the original import snapshot unchanged and record the prior value on each case.
begin;
set local lock_timeout = '2s';
with raw as materialized (
select id,case_number,target,custom_fields,custom_fields->'legacy_data'->>'interested_country' source_target,
case when pg_input_is_valid(custom_fields->'legacy_data'->>'legacy_dynamic_json','jsonb') then (custom_fields->'legacy_data'->>'legacy_dynamic_json')::jsonb->'profile' end profile
from public.cases where target is null and length(custom_fields->'legacy_data'->>'interested_country') between 1 and 120),
selected as materialized (select *, (select string_agg(m[2], ' | ' order by ord) from regexp_matches(profile->>'interestedCountry','<option[^>]*value="([^"]+)"[^>]*>([^<]+)</option>','g') with ordinality as r(m,ord) where m[1]=any(string_to_array(profile->>'interestedCountryID',','))) verified_target from raw)
, repaired as (
update public.cases c set target=s.verified_target,
custom_fields=c.custom_fields || jsonb_build_object('destination_import_repair',jsonb_build_object('previous_target',c.target,'restored_target',s.verified_target,'source','legacy_dynamic_json.profile.interestedCountryID','repaired_at',now()))
from selected s where c.id=s.id and c.target is null and s.verified_target=s.source_target and s.verified_target is not null
returning c.id)
select count(*) as repaired_cases from repaired;
commit;

