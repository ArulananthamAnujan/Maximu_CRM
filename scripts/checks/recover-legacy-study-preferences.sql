begin;
set local lock_timeout='2s';
with source as materialized (
 select c.id client_id,c.organisation_id,k.id case_id,k.target,e.source_system,e.source_key,e.imported_by,
 (c.custom_fields->'legacy_data'->>'legacy_dynamic_json')::jsonb->'profile' profile
 from public.clients c join public.cases k on k.client_id=c.id and k.organisation_id=c.organisation_id
 join public.legacy_external_keys e on e.target_id=c.id and e.entity_type='clients' and e.organisation_id=c.organisation_id
 where pg_input_is_valid(c.custom_fields->'legacy_data'->>'legacy_dynamic_json','jsonb')
 and k.service_type='study_abroad' and k.target is not null
 and not exists(select 1 from public.study_preferences p where p.client_id=c.id)
 and not exists(select 1 from public.legacy_external_keys t where t.organisation_id=e.organisation_id and t.source_system=e.source_system and t.entity_type='study_preferences' and t.source_key=e.source_key||':preferences')
),
eligible as materialized (
 select *,md5('legacy-preferences-recovery-v1:'||organisation_id||':'||client_id)::uuid child_id
 from source s where target=(select string_agg(m[2],' | ' order by ord)
 from regexp_matches(profile->>'interestedCountry','<option[^>]*value="([^"]+)"[^>]*>([^<]+)</option>','g') with ordinality as r(m,ord)
 where m[1]=any(string_to_array(profile->>'interestedCountryID',',')))
),
inserted as (
 insert into public.study_preferences(id,organisation_id,client_id,destination_countries,fields_of_study)
 select child_id,organisation_id,client_id,regexp_split_to_array(target,'\s*\|\s*'),
 case when nullif(btrim(profile->>'InterestedCourse'),'') is not null then array[btrim(profile->>'InterestedCourse')] else '{}'::text[] end
 from eligible returning id
),
keys as (
 insert into public.legacy_external_keys(organisation_id,source_system,entity_type,source_key,target_table,target_id,imported_by,metadata)
 select s.organisation_id,s.source_system,'study_preferences',s.source_key||':preferences','study_preferences',s.child_id,s.imported_by,
 jsonb_build_object('recovery','saved_client_export_20261109','selected_country_ids',s.profile->>'interestedCountryID','destination_countries',s.target,'interested_course',s.profile->>'InterestedCourse')
 from eligible s join inserted i on i.id=s.child_id returning id
) select count(*) recovered_preferences from keys;
commit;
