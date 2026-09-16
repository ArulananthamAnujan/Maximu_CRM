-- Note attribution is part of the readable case history. Import administration
-- remains separately gated for writes and for every other import record.
begin;
drop policy function_access on public.legacy_external_keys;
create policy function_access_read on public.legacy_external_keys
as restrictive for select to authenticated using (
  private.function_allowed('administration')
  or (organisation_id=public.current_organisation_id()
    and entity_type='notes' and target_table='case_notes'
    and exists(select 1 from public.case_notes n where n.id=target_id))
);
create policy function_access_insert on public.legacy_external_keys
as restrictive for insert to authenticated
with check (private.function_allowed('administration'));
create policy function_access_update on public.legacy_external_keys
as restrictive for update to authenticated
using (private.function_allowed('administration'))
with check (private.function_allowed('administration'));
create policy function_access_delete on public.legacy_external_keys
as restrictive for delete to authenticated
using (private.function_allowed('administration'));
commit;
