begin;
create or replace function public.queue_client_notice(p_client uuid,p_case uuid,p_kind text,p_document uuid default null,p_agreement uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid; title text;
begin
 select organisation_id into org from public.clients where id=p_client;
 title := case p_kind when 'document_request' then 'Please upload your requested document'
 when 'agreement_sent' then 'An agreement is ready for your review'
 when 'agreement_accepted' then 'Your signed agreement is complete' else 'Agreement declined' end;
 insert into public.client_notice_outbox(organisation_id,client_id,case_id,kind,document_id,agreement_id)
 values(org,p_client,p_case,p_kind,p_document,p_agreement);
 insert into public.notifications(organisation_id,recipient_id,case_id,kind,title,body,action_url)
 select org,l.profile_id,p_case,p_kind,title,'Sign in to your secure portal to view the details.','/'
 from public.client_user_links l join public.profiles p on p.id=l.profile_id
 where l.client_id=p_client and p.active and p.level::text='student' and p.organisation_id=org;
end $$;
revoke all on function public.queue_client_notice(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;

create or replace function public.claim_client_notices(p_from text,p_origin text) returns setof public.client_notice_outbox
language plpgsql security definer set search_path='' as $$
declare n public.client_notice_outbox; recipient text; subject text; link text;
begin
 if p_origin !~ '^https://[^/]+$' then raise exception 'A production HTTPS origin is required.'; end if;
 for n in select * from public.client_notice_outbox where (status='queued' and next_attempt_at<=now()) or (status='sending' and locked_until<now()) order by created_at limit 5 for update skip locked loop
   if n.attempts>=5 or n.first_attempt_at<now()-interval '23 hours' then
     update public.client_notice_outbox set status='failed',last_error='Automatic retry window ended. Check provider delivery before issuing another notice.' where id=n.id; continue;
   end if;
   if n.document_id is not null and not exists(select 1 from public.documents where id=n.document_id and state::text='requested' and coalesce(metadata->>'client_visible','true')<>'false') then
     update public.client_notice_outbox set status='cancelled',last_error='Document is no longer requested.' where id=n.id; continue;
   end if;
   if n.kind='agreement_sent' and not exists(select 1 from public.service_agreements where id=n.agreement_id and status='sent') then
     update public.client_notice_outbox set status='cancelled',last_error='Agreement is no longer awaiting review.' where id=n.id; continue;
   end if;
   select email into recipient from public.clients where id=n.client_id and organisation_id=n.organisation_id;
   if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or recipient ~* '\.(invalid|test)$' then
     update public.client_notice_outbox set status='blocked',last_error='A deliverable student email address is required.' where id=n.id; continue;
   end if;
   if not exists(select 1 from public.client_user_links l join public.profiles p on p.id=l.profile_id where l.client_id=n.client_id and p.active and p.level::text='student' and p.organisation_id=n.organisation_id) then
     update public.client_notice_outbox set status='blocked',last_error='Link an active student portal account before sending this notice.' where id=n.id; continue;
   end if;
   if n.payload is not null and n.payload->'to'->>0 is distinct from recipient then
     update public.client_notice_outbox set status='cancelled',last_error='Student address changed. Issue a new request after checking the address.' where id=n.id; continue;
   end if;
   subject:=case n.kind when 'document_request' then 'Maximus: please upload your requested document' when 'agreement_sent' then 'Maximus: agreement ready for review' when 'agreement_accepted' then 'Maximus: signed agreement completed' else 'Maximus: agreement response recorded' end;
   link:=p_origin||'/?portal='||case when n.kind='document_request' then 'documents' else 'agreements' end;
   update public.client_notice_outbox set status='sending',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()),
   payload=coalesce(payload,jsonb_build_object('from',p_from,'to',jsonb_build_array(recipient),'subject',subject,'text',subject||E'\n\nSign in to your secure student portal to view the details and take the next step:\n'||link||E'\n\nMaximus Education and Migration'))
   where id=n.id returning * into n;
   return next n;
 end loop;
end $$;
revoke all on function public.claim_client_notices(text,text) from public,anon,authenticated;
grant execute on function public.claim_client_notices(text,text) to service_role;

commit;
