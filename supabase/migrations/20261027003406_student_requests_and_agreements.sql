begin;
alter table public.service_agreements add column if not exists viewed_at timestamptz;
alter table public.service_agreements add column if not exists signed_by uuid references public.profiles(id);
alter table public.service_agreements add column if not exists signed_name text;
alter table public.service_agreements add column if not exists terms_hash text;
alter table public.service_agreements add column if not exists response_note text;
-- All agreement writes go through a locked transition with an authenticated actor.
revoke insert, update, delete on public.service_agreements from authenticated, anon;
create policy agreement_hide_drafts on public.service_agreements as restrictive for select to authenticated
using (public.is_internal_user() or status <> 'draft');

create table public.client_notice_outbox (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations,
 client_id uuid not null references public.clients, case_id uuid references public.cases,
 agreement_id uuid references public.service_agreements, document_id uuid references public.documents,
 kind text not null check (kind in ('document_request','agreement_sent','agreement_accepted','agreement_declined')),
 status text not null default 'queued' check (status in ('queued','sending','sent','failed','blocked','cancelled')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lock_token uuid, locked_until timestamptz, payload jsonb, first_attempt_at timestamptz,
 provider_message_id text, last_error text, created_at timestamptz not null default now(), sent_at timestamptz
);
alter table public.client_notice_outbox enable row level security;
revoke all on public.client_notice_outbox from anon, authenticated;
grant select on public.client_notice_outbox to authenticated;
grant all on public.client_notice_outbox to service_role;
create policy client_notice_read on public.client_notice_outbox for select to authenticated using (
 organisation_id=public.current_organisation_id() and public.is_internal_user()
 and public.can_access_client(client_id)
 and (case_id is null or public.can_access_case(case_id))
 and private.any_function_allowed(array['documents','students','applications','visas','direct_visas'])
);
create index client_notice_pending on public.client_notice_outbox(next_attempt_at) where status in ('queued','sending');
create index client_notice_case on public.client_notice_outbox(case_id,created_at desc);

create function public.queue_client_notice(p_client uuid,p_case uuid,p_kind text,p_document uuid default null,p_agreement uuid default null)
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
 where l.client_id=p_client and p.active and p.organisation_id=org;
end $$;
revoke all on function public.queue_client_notice(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;

create function public.document_request_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state::text='requested' and new.client_id is not null
 and coalesce(new.metadata->>'client_visible','true')<>'false'
 and coalesce(new.metadata->>'notify_client','true')<>'false'
 and coalesce(new.metadata->>'source','')<>'invoice_pdf' then
   if tg_op='INSERT' then
     perform public.queue_client_notice(new.client_id,new.case_id,'document_request',new.id,null);
   elsif old.state is distinct from new.state or old.metadata->>'client_visible'='false' then
     perform public.queue_client_notice(new.client_id,new.case_id,'document_request',new.id,null);
   end if;
 end if;
 return new;
end $$;
revoke all on function public.document_request_notice() from public,anon,authenticated;
create trigger document_request_notice after insert or update of state,metadata on public.documents for each row execute function public.document_request_notice();

create function public.agreement_action(p_action text,p_case uuid default null,p_id uuid default null,p_title text default null,p_terms text default null,p_version text default null,p_name text default null,p_consent boolean default false,p_hash text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.service_agreements; c public.cases; staff boolean; linked boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Sign in is required.' using errcode='42501'; end if;
 staff:=public.is_internal_user();
 if staff and not private.any_function_allowed(array['students','applications','visas','direct_visas','enquiries']) then raise exception 'Agreement access is disabled.' using errcode='42501'; end if;
 if p_action='create' then
   select * into c from public.cases where id=p_case;
   if not staff or c.id is null or c.organisation_id<>public.current_organisation_id() or not public.can_modify_case(c.id) then raise exception 'Case access denied.' using errcode='42501'; end if;
   if length(trim(coalesce(p_title,''))) not between 1 and 200 or length(trim(coalesce(p_terms,''))) not between 20 and 100000 or length(trim(coalesce(p_version,''))) not between 1 and 40 then raise exception 'Enter a title, version and complete agreement terms.' using errcode='22023'; end if;
   insert into public.service_agreements(organisation_id,client_id,case_id,agreement_type,version,terms_snapshot,created_by)
   values(c.organisation_id,c.client_id,c.id,trim(p_title),trim(p_version),jsonb_build_object('text',trim(p_terms)),auth.uid()) returning * into a;
 else
   select * into a from public.service_agreements where id=p_id for update;
   if a.id is null or a.organisation_id<>public.current_organisation_id() then raise exception 'Agreement not available.' using errcode='42501'; end if;
   linked:=exists(select 1 from public.client_user_links where client_id=a.client_id and profile_id=auth.uid());
   if staff then
     if not public.can_access_client(a.client_id) or (a.case_id is not null and not public.can_modify_case(a.case_id)) then raise exception 'Agreement access denied.' using errcode='42501'; end if;
   elsif not linked then raise exception 'Agreement access denied.' using errcode='42501'; end if;
   if p_action='send' then
     if not staff or a.status<>'draft' then raise exception 'Only a draft can be sent by staff.' using errcode='22023'; end if;
     if length(coalesce(a.terms_snapshot->>'text',''))<20 then raise exception 'Complete agreement terms are required.' using errcode='22023'; end if;
     update public.service_agreements set status='sent',sent_at=now(),terms_hash=encode(sha256(convert_to(terms_snapshot::text,'UTF8')),'hex') where id=a.id returning * into a;
     perform public.queue_client_notice(a.client_id,a.case_id,'agreement_sent',null,a.id);
   elsif p_action='view' then
     if staff or not linked or a.status<>'sent' then return to_jsonb(a); end if;
     update public.service_agreements set viewed_at=coalesce(viewed_at,now()) where id=a.id returning * into a;
   elsif p_action in ('accept','decline') then
     if staff or not linked then raise exception 'Only the linked student can respond.' using errcode='42501'; end if;
     if a.status=(case when p_action='accept' then 'accepted' else 'declined' end) and a.signed_by=auth.uid() then return to_jsonb(a); end if;
     if a.status<>'sent' or p_hash is distinct from a.terms_hash then raise exception 'This agreement changed or is no longer awaiting a response. Open it again.' using errcode='22023'; end if;
     if p_action='accept' and (not p_consent or length(trim(coalesce(p_name,''))) not between 2 and 200) then raise exception 'Your full name and explicit signing consent are required.' using errcode='22023'; end if;
     update public.service_agreements set status=case when p_action='accept' then 'accepted' else 'declined' end,
       viewed_at=coalesce(viewed_at,now()),accepted_at=case when p_action='accept' then now() else null end,
       signed_by=auth.uid(),signed_name=case when p_action='accept' then trim(p_name) else null end,response_note=left(p_note,2000)
     where id=a.id returning * into a;
     perform public.queue_client_notice(a.client_id,a.case_id,case when p_action='accept' then 'agreement_accepted' else 'agreement_declined' end,null,a.id);
     insert into public.notifications(organisation_id,recipient_id,case_id,kind,title,body,action_url)
       select a.organisation_id,p.id,a.case_id,'agreement_response','Student responded to an agreement',a.agreement_type||': '||a.status,'/?case='||a.case_id
       from public.profiles p where p.id=a.created_by and p.active and p.organisation_id=a.organisation_id;
   elsif p_action='withdraw' then
     if not staff or a.status not in ('draft','sent') then raise exception 'Only a pending agreement can be withdrawn.' using errcode='22023'; end if;
     update public.service_agreements set status='terminated' where id=a.id returning * into a;
     update public.client_notice_outbox set status='cancelled',last_error='Agreement withdrawn.' where agreement_id=a.id and status in ('queued','blocked','failed');
   else raise exception 'Unknown agreement action.' using errcode='22023'; end if;
 end if;
 insert into public.audit_events(organisation_id,actor_id,case_id,action,resource_type,resource_id,summary,after_data)
 values(a.organisation_id,auth.uid(),a.case_id,'agreement.'||p_action,'service_agreement',a.id::text,'Agreement '||p_action,jsonb_build_object('version',a.version,'terms_hash',a.terms_hash,'status',a.status));
 return to_jsonb(a);
end $$;
revoke all on function public.agreement_action(text,uuid,uuid,text,text,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.agreement_action(text,uuid,uuid,text,text,text,text,boolean,text,text) to authenticated;

create function public.claim_client_notices(p_from text,p_origin text) returns setof public.client_notice_outbox
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
   if not exists(select 1 from public.client_user_links l join public.profiles p on p.id=l.profile_id where l.client_id=n.client_id and p.active and p.organisation_id=n.organisation_id) then
     update public.client_notice_outbox set status='blocked',last_error='Link an active student portal account before sending this notice.' where id=n.id; continue;
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

create function public.finish_client_notice(p_id uuid,p_token uuid,p_status text,p_provider_id text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('sent','failed','queued') then raise exception 'Invalid result.'; end if;
 update public.client_notice_outbox set status=p_status,provider_message_id=p_provider_id,last_error=left(p_error,500),
 sent_at=case when p_status='sent' then now() else sent_at end,next_attempt_at=now()+interval '5 minutes',locked_until=null,lock_token=null
 where id=p_id and lock_token=p_token and status='sending';
end $$;
revoke all on function public.finish_client_notice(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_client_notice(uuid,uuid,text,text,text) to service_role;

create function public.retry_client_notice(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare n public.client_notice_outbox;
begin
 select * into n from public.client_notice_outbox where id=p_id for update;
 if auth.uid() is null or not public.is_internal_user() or n.organisation_id is distinct from public.current_organisation_id() or not public.can_access_client(n.client_id) or (n.case_id is not null and not public.can_modify_case(n.case_id)) or not private.any_function_allowed(array['documents','students','applications','visas','direct_visas']) then raise exception 'Notice access denied.' using errcode='42501'; end if;
 if n.status not in ('blocked','failed') or (n.status='failed' and coalesce(n.last_error,'') not like 'Email provider returned HTTP 4%') then raise exception 'This notice cannot be retried. Check its delivery outcome first.' using errcode='22023'; end if;
 update public.client_notice_outbox set status='queued',last_error=null,attempts=0,next_attempt_at=now(),first_attempt_at=null where id=n.id;
end $$;
revoke all on function public.retry_client_notice(uuid) from public,anon,authenticated;
grant execute on function public.retry_client_notice(uuid) to authenticated;
commit;
