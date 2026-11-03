begin;

-- Client notices sent from the outbox now use the organisation's own
-- editable wording. Until this migration the document-request notice ignored
-- the "document_request" email template a manager edits under Templates and
-- always sent a fixed subject, so editing the wording changed nothing. The
-- template's tokens are filled in from the document itself: the client's
-- name, the document requested, the note left with the request, the portal
-- link and the member of staff who asked for it.
--
-- A document request is also no longer held back until the client has a
-- portal login. The client needs to be told what is wanted either way; the
-- portal link in the email leads them to request access if they have none.
-- Agreement notices still require a portal account, because the only way to
-- act on one is to sign in and respond.
--
-- The origin check accepts a plain http://localhost or http://127.0.0.1
-- origin so a verification run on a developer machine can exercise delivery
-- end to end; every other origin must still be HTTPS.

create or replace function public.render_client_notice_template(p_template text, p_values jsonb)
returns text language sql immutable set search_path='' as $$
  select coalesce(
    (select string_agg(
       case when m.token is null then m.literal
            else coalesce(p_values->>m.token, '{{'||m.token||'}}') end,
       '' order by m.ordinality)
     from (
       select ordinality,
              substring(part from '^\{\{(\w+)\}\}$') as token,
              part as literal
       from regexp_split_to_table(
              regexp_replace(p_template, '(\{\{\w+\}\})', E'\x01\\1\x01', 'g'),
              E'\x01') with ordinality as t(part, ordinality)
     ) m),
    '');
$$;
revoke all on function public.render_client_notice_template(text,jsonb) from public,anon,authenticated;

create or replace function public.claim_client_notices(p_from text,p_origin text) returns setof public.client_notice_outbox
language plpgsql security definer set search_path='' as $$
declare n public.client_notice_outbox; recipient text; subject text; body text; link text;
        tpl record; doc record; cli record; sender text; values jsonb;
begin
 if p_origin !~ '^https://[^/]+$' and p_origin !~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$' then
   raise exception 'A production HTTPS origin is required.';
 end if;
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
   select email, first_name, last_name into cli from public.clients where id=n.client_id and organisation_id=n.organisation_id;
   recipient := cli.email;
   if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or recipient ~* '\.(invalid|test)$' then
     update public.client_notice_outbox set status='blocked',last_error='A deliverable student email address is required.' where id=n.id; continue;
   end if;
   if n.kind<>'document_request' and not exists(select 1 from public.client_user_links l join public.profiles p on p.id=l.profile_id where l.client_id=n.client_id and p.active and p.level::text='student' and p.organisation_id=n.organisation_id) then
     update public.client_notice_outbox set status='blocked',last_error='Link an active student portal account before sending this notice.' where id=n.id; continue;
   end if;
   if n.payload is not null and n.payload->'to'->>0 is distinct from recipient then
     update public.client_notice_outbox set status='cancelled',last_error='Student address changed. Issue a new request after checking the address.' where id=n.id; continue;
   end if;
   link:=p_origin||'/?portal='||case when n.kind='document_request' then 'documents' else 'agreements' end;
   subject:=case n.kind when 'document_request' then 'Maximus: please upload your requested document' when 'agreement_sent' then 'Maximus: agreement ready for review' when 'agreement_accepted' then 'Maximus: signed agreement completed' else 'Maximus: agreement response recorded' end;
   body:=subject||E'\n\nSign in to your secure student portal to view the details and take the next step:\n'||link||E'\n\nMaximus Education and Migration';
   if n.kind='document_request' then
     select t.subject, t.body into tpl from public.email_templates t where t.organisation_id=n.organisation_id and t.kind='document_request';
     select d.display_name, d.metadata->>'note' as note, d.requested_by into doc from public.documents d where d.id=n.document_id;
     select display_name into sender from public.profiles where id=doc.requested_by;
     if tpl.subject is not null then
       values:=jsonb_build_object(
         'client_name', trim(concat_ws(' ', cli.first_name, cli.last_name)),
         'document_title', coalesce(doc.display_name,'the requested document'),
         'note', coalesce(doc.note,''),
         'portal_link', link,
         'sender_name', coalesce(sender,'Your case team'));
       subject:=public.render_client_notice_template(tpl.subject, values);
       body:=public.render_client_notice_template(tpl.body, values);
     end if;
   end if;
   update public.client_notice_outbox set status='sending',attempts=attempts+1,lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()),
   payload=coalesce(payload,jsonb_build_object('from',p_from,'to',jsonb_build_array(recipient),'subject',subject,'text',body,'html',replace(body,E'\n','<br>')))
   where id=n.id returning * into n;
   return next n;
 end loop;
end $$;
revoke all on function public.claim_client_notices(text,text) from public,anon,authenticated;
grant execute on function public.claim_client_notices(text,text) to service_role;

commit;
