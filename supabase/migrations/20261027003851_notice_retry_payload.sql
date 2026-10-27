begin;
create or replace function public.retry_client_notice(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare n public.client_notice_outbox;
begin
 select * into n from public.client_notice_outbox where id=p_id for update;
 if auth.uid() is null or not public.is_internal_user() or n.organisation_id is distinct from public.current_organisation_id() or not public.can_access_client(n.client_id) or (n.case_id is not null and not public.can_modify_case(n.case_id)) or not private.any_function_allowed(array['documents','students','applications','visas','direct_visas']) then raise exception 'Notice access denied.' using errcode='42501'; end if;
 if n.status not in ('blocked','failed') or (n.status='failed' and coalesce(n.last_error,'') not like 'Email provider returned HTTP 4%') then raise exception 'This notice cannot be retried. Check its delivery outcome first.' using errcode='22023'; end if;
 -- Only a definite rejection or unsent blocked request can get a fresh payload.
 -- An uncertain provider outcome must retain its original idempotency key.
 insert into public.client_notice_outbox(organisation_id,client_id,case_id,kind,document_id,agreement_id)
 values(n.organisation_id,n.client_id,n.case_id,n.kind,n.document_id,n.agreement_id);
 update public.client_notice_outbox set status='cancelled',last_error='A new notification attempt was queued by the case team.' where id=n.id;
end $$;
revoke all on function public.retry_client_notice(uuid) from public,anon,authenticated;
grant execute on function public.retry_client_notice(uuid) to authenticated;
commit;
