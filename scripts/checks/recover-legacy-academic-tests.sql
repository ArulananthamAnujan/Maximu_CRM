-- Recover structured academic/test rows retained in the original client export.
-- Idempotent: insert missing external keys only; never overwrite staff-entered rows.
-- Keep source cells and date precision; a year alone is NOT January 1.
begin;
set local lock_timeout='2s';
with source as materialized (
 select c.id client_id,c.organisation_id,k.source_system,k.source_key,k.imported_by,
 c.custom_fields->'legacy_data' d
 from public.clients c join public.legacy_external_keys k
 on k.target_id=c.id and k.organisation_id=c.organisation_id and k.entity_type='clients'
),
rows as materialized (
 select s.*,j.item,j.ord,s.source_key||':education:'||j.ord source_child_key,
 md5('legacy-education-recovery-v1:'||s.organisation_id||':'||s.client_id||':'||j.ord)::uuid child_id
 from source s cross join lateral jsonb_array_elements(
 case when pg_input_is_valid(d->>'education_rows_json','jsonb') then (d->>'education_rows_json')::jsonb else '[]'::jsonb end
 ) with ordinality j(item,ord)
),
eligible as materialized (
 select * from rows r where nullif(item->>'qualification','') is not null
 and not exists(select 1 from public.legacy_external_keys k where k.organisation_id=r.organisation_id and k.source_system=r.source_system and k.entity_type='education_history' and k.source_key=r.source_child_key)
 and not exists(select 1 from public.client_education_history h where h.client_id=r.client_id)
),
inserted as (
 insert into public.client_education_history(id,organisation_id,client_id,institution,qualification,field_of_study,result,completed_on,details)
 select child_id,organisation_id,client_id,coalesce(nullif(item->>'institution',''),'Not supplied'),item->>'qualification',nullif(item->>'field_of_study',''),nullif(item->>'result',''),
 case when item->'legacy_cells'->>7 ~ '^\d{4}$' then null
 when item->>'completed_on' ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(item->>'completed_on','date') then (item->>'completed_on')::date else null end,
 jsonb_build_object('legacy_data',item,'legacy_source_key',source_child_key,'recovery','saved_client_export_20261109','backlogs',item->>'backlogs','yearOfPassing',case when item->'legacy_cells'->>7 ~ '^\d{4}$' then item->'legacy_cells'->>7 end)
 from eligible returning id
),
keys as (
 insert into public.legacy_external_keys(organisation_id,source_system,entity_type,source_key,target_table,target_id,imported_by,metadata)
 select e.organisation_id,e.source_system,'education_history',e.source_child_key,'client_education_history',e.child_id,e.imported_by,jsonb_build_object('legacy_data',e.item,'recovery','saved_client_export_20261109')
 from eligible e join inserted i on i.id=e.child_id returning id
) select count(*) recovered_academic_rows from keys;

with source as materialized (
 select c.id client_id,c.organisation_id,k.source_system,k.source_key,k.imported_by,c.custom_fields->'legacy_data' d
 from public.clients c join public.legacy_external_keys k on k.target_id=c.id and k.organisation_id=c.organisation_id and k.entity_type='clients'
),
rows as materialized (
 select s.*,j.item,j.ord,s.source_key||':test:'||j.ord source_child_key,
 md5('legacy-test-recovery-v1:'||s.organisation_id||':'||s.client_id||':'||j.ord)::uuid child_id
 from source s cross join lateral jsonb_array_elements(case when pg_input_is_valid(d->>'test_rows_json','jsonb') then (d->>'test_rows_json')::jsonb else '[]'::jsonb end) with ordinality j(item,ord)
),
eligible as materialized (
 select * from rows r where nullif(item->>'test_type','') is not null
 and not exists(select 1 from public.legacy_external_keys k where k.organisation_id=r.organisation_id and k.source_system=r.source_system and k.entity_type='test_results' and k.source_key=r.source_child_key)
 and not exists(select 1 from public.english_tests t where t.client_id=r.client_id)
),
inserted as (
 insert into public.english_tests(id,organisation_id,client_id,test_type,overall,listening,reading,writing,speaking,details)
 select child_id,organisation_id,client_id,item->>'test_type',
 case when item->>'overall' ~ '^\d+(\.\d+)?$' then (item->>'overall')::numeric end,
 case when item->>'listening' ~ '^\d+(\.\d+)?$' then (item->>'listening')::numeric end,
 case when item->>'reading' ~ '^\d+(\.\d+)?$' then (item->>'reading')::numeric end,
 case when item->>'writing' ~ '^\d+(\.\d+)?$' then (item->>'writing')::numeric end,
 case when item->>'speaking' ~ '^\d+(\.\d+)?$' then (item->>'speaking')::numeric end,
 jsonb_build_object('legacy_data',item,'legacy_source_key',source_child_key,'recovery','saved_client_export_20261109')
 from eligible returning id
),
keys as (
 insert into public.legacy_external_keys(organisation_id,source_system,entity_type,source_key,target_table,target_id,imported_by,metadata)
 select e.organisation_id,e.source_system,'test_results',e.source_child_key,'english_tests',e.child_id,e.imported_by,jsonb_build_object('legacy_data',e.item,'recovery','saved_client_export_20261109')
 from eligible e join inserted i on i.id=e.child_id returning id
) select count(*) recovered_test_rows from keys;
commit;
