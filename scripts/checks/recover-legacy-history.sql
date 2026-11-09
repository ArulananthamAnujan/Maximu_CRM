begin;
set local lock_timeout='2s';
with source as materialized (
 select c.id client_id,c.organisation_id,k.id case_id,e.source_system,e.source_key,e.imported_by,
 (c.custom_fields->'legacy_data'->>'legacy_dynamic_json')::jsonb d
 from public.clients c join public.cases k on k.client_id=c.id and k.organisation_id=c.organisation_id
 join public.legacy_external_keys e on e.target_id=c.id and e.entity_type='clients' and e.organisation_id=c.organisation_id
 where pg_input_is_valid(c.custom_fields->'legacy_data'->>'legacy_dynamic_json','jsonb')
),
rows as materialized (
 select s.*,v.kind,j.item,j.ord,
 btrim(regexp_replace(regexp_replace(replace(j.item->>'comment','&nbsp;',' '),'<[^>]*>',' ','g'),'\s+',' ','g')) body,
 btrim(regexp_replace(regexp_replace(j.item->>'createdBy','<[^>]*>',' ','g'),'\s+',' ','g')) actor_label,
 btrim(regexp_replace(regexp_replace(j.item->>'createdDate','<[^>]*>',' ','g'),'\s+',' ','g')) source_date,
 s.source_key||':recovered-'||v.kind||':'||j.ord child_key
 from source s cross join (values ('followups'),('meetings')) v(kind)
 cross join lateral jsonb_array_elements(coalesce(d->v.kind->'rows','[]'::jsonb)) with ordinality j(item,ord)
),
eligible as materialized (
 select *,md5('legacy-history-recovery-v1:'||organisation_id||':'||child_key)::uuid child_id from rows r
 where nullif(body,'') is not null
 and not exists(select 1 from public.case_notes n where n.case_id=r.case_id and btrim(regexp_replace(n.body,'\s+',' ','g'))=r.body)
 and not exists(select 1 from public.legacy_activity_events a where a.case_id=r.case_id and (a.source_key=r.child_key or btrim(regexp_replace(a.body,'\s+',' ','g'))=r.body))
),
inserted as (
 insert into public.legacy_activity_events(id,organisation_id,case_id,source_entity_type,source_key,event_type,subject,body,actor_label,occurred_at,metadata)
 select child_id,organisation_id,case_id,'activity_events',child_key,
 case when kind='followups' then 'legacy_followup' else 'legacy_appointment' end,
 case when kind='followups' then 'Legacy follow-up' else 'Legacy appointment' end,body,actor_label,null,
 jsonb_build_object('recovery','saved_client_export_20261109','source_created_at',source_date,'source_timezone_status','unverified; original wall-clock label preserved','legacy_data',item)
 from eligible returning id
),
keys as (
 insert into public.legacy_external_keys(organisation_id,source_system,entity_type,source_key,target_table,target_id,imported_by,metadata)
 select e.organisation_id,e.source_system,'activity_events',e.child_key,'legacy_activity_events',e.child_id,e.imported_by,
 jsonb_build_object('recovery','saved_client_export_20261109','legacy_data',e.item)
 from eligible e join inserted i on i.id=e.child_id
 returning source_key
) select count(*) as recovered_history_rows,count(*) filter(where source_key like '%:recovered-followups:%') as followups,count(*) filter(where source_key like '%:recovered-meetings:%') as meetings from keys;
commit;
