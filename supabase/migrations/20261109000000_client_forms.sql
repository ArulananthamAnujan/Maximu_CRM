begin;
set local lock_timeout='2s';

-- Client forms: the questionnaires a migration agency sends a client before
-- lodging a visa (the questions the department will ask, gathered in advance).
-- Until now Maximus collected these through Google Forms outside the CRM, so
-- the answers sat in a spreadsheet nobody could find from the case file.
--
-- A form template is masters data (a manager edits it under Templates). A
-- case form is a copy of a template attached to one case: the officer can
-- change its wording, add questions and prefill answers before sending it,
-- the client fills it in through the portal, and the answers stay on the
-- case as their own tab. The officer can still correct an answer or add a
-- question afterwards; every change is audited.
--
-- Fields are JSON so a manager can add a question without a migration:
--   [{ "key": "full_name", "label": "Your full name", "type": "text",
--      "required": true, "help": "...", "section": "About you",
--      "options": ["Married", "Never married"],          -- select only
--      "columns": [{ "key": "country", "label": "Country", "type": "text" }] }]  -- table only
-- types: text, textarea, date, number, select, yesno, table
-- Answers are JSON keyed by field key; a table answer is an array of rows.

create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  title text not null,
  visa_subclass text,
  description text,
  fields jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, title)
);
alter table public.form_templates enable row level security;
create policy form_templates_internal_read on public.form_templates
for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy form_templates_admin_write on public.form_templates
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));
comment on table public.form_templates is
  'Questionnaires sent to clients before a visa application (Student 500, Temporary Graduate 485, Visitor 600 and any the agency adds). Masters data, same access shape as the document checklist.';

create table public.case_forms (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  client_id uuid not null references public.clients on delete cascade,
  case_id uuid not null references public.cases on delete cascade,
  template_id uuid references public.form_templates on delete set null,
  title text not null,
  visa_subclass text,
  description text,
  fields jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','sent','submitted','reviewed','withdrawn')),
  created_by uuid references public.profiles(id),
  sent_by uuid references public.profiles(id),
  sent_at timestamptz,
  viewed_at timestamptz,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  client_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_forms_case on public.case_forms(case_id, created_at desc);
create index case_forms_client on public.case_forms(client_id, created_at desc);
alter table public.case_forms enable row level security;
-- Staff who may see the client see the form; a portal account sees its own
-- once sent. Every write goes through case_form_action.
create policy case_forms_read on public.case_forms for select to authenticated
using (organisation_id = public.current_organisation_id() and public.can_access_client(client_id));
create policy case_forms_hide_drafts on public.case_forms as restrictive for select to authenticated
using (public.is_internal_user() or status <> 'draft');
revoke insert, update, delete on public.case_forms from authenticated, anon;
grant select on public.case_forms to authenticated;
grant all on public.case_forms to service_role;
comment on table public.case_forms is
  'A questionnaire sent to a client on one case: the questions as the officer set them, the client''s answers, and the send/submit/review trail.';

-- The outbox and its notices learn about forms.
alter table public.client_notice_outbox add column if not exists form_id uuid references public.case_forms on delete cascade;
alter table public.client_notice_outbox drop constraint if exists client_notice_outbox_kind_check;
alter table public.client_notice_outbox add constraint client_notice_outbox_kind_check
  check (kind in ('document_request','agreement_sent','agreement_accepted','agreement_declined','form_request'));
create index if not exists client_notice_form on public.client_notice_outbox(form_id) where form_id is not null;

alter table public.email_templates drop constraint if exists email_templates_kind_check;
alter table public.email_templates add constraint email_templates_kind_check
  check (kind in ('document_request','invoice_request','portal_welcome','form_request'));

create or replace function public.seed_default_email_templates(target_organisation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_templates (organisation_id, kind, subject, body)
  values
    (target_organisation, 'document_request',
     'A document has been requested from you',
     E'Hi {{client_name}},\n\nWe need the following from you: {{document_title}}\n\n{{note}}\n\nYou can send it through your Maximus portal: {{portal_link}}\n\nThanks,\n{{sender_name}}'),
    (target_organisation, 'invoice_request',
     'An invoice has been raised for your file',
     E'Hi {{client_name}},\n\nAn invoice for {{amount}} has been raised on your file{{due_clause}}.\n\nYou can view it in your Maximus portal: {{portal_link}}\n\nThanks,\n{{sender_name}}'),
    (target_organisation, 'portal_welcome',
     'Your Maximus portal access is ready',
     E'Hi {{client_name}},\n\nYour case team has set up your Maximus client portal. Sign in with:\n\nUsername: {{email}}\n\nSet your password here: {{setup_link}}\n\nOnce signed in you can see your case progress, documents and invoices.\n\nThanks,\n{{sender_name}}'),
    (target_organisation, 'form_request',
     'Please complete your {{form_title}}',
     E'Hi {{client_name}},\n\nTo prepare your application we need you to complete the form "{{form_title}}".\n\n{{note}}\n\nSign in to your Maximus portal, open Forms and answer each question. You can save as you go and send it back to us when it is complete: {{portal_link}}\n\nThanks,\n{{sender_name}}')
  on conflict (organisation_id, kind) do nothing;
end;
$$;
do $$
declare organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.seed_default_email_templates(organisation_row.id);
  end loop;
end $$;

-- Form field validation shared by the action function: a bounded list of
-- objects with a safe key, a label, a known type, and for a table, columns of
-- the same shape (one level only).
create or replace function private.valid_form_fields(p_fields jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare f jsonb; c jsonb; keys text[] := '{}'; k text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 150 then return false; end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    k := f->>'key';
    if k is null or k !~ '^[a-z0-9_]{1,60}$' or k = any(keys) then return false; end if;
    keys := keys || k;
    if length(coalesce(f->>'label','')) not between 1 and 300 then return false; end if;
    if coalesce(f->>'type','') not in ('text','textarea','date','number','select','yesno','table') then return false; end if;
    if f->>'type' = 'select' and (jsonb_typeof(f->'options') <> 'array' or jsonb_array_length(f->'options') not between 1 and 60) then return false; end if;
    if f->>'type' = 'table' then
      if jsonb_typeof(f->'columns') <> 'array' or jsonb_array_length(f->'columns') not between 1 and 20 then return false; end if;
      for c in select * from jsonb_array_elements(f->'columns') loop
        if jsonb_typeof(c) <> 'object' or coalesce(c->>'key','') !~ '^[a-z0-9_]{1,60}$' or length(coalesce(c->>'label','')) not between 1 and 300
           or coalesce(c->>'type','') not in ('text','date','number','select','yesno') then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end $$;
revoke all on function private.valid_form_fields(jsonb) from public,anon,authenticated;

-- Which required questions are still unanswered. Empty when the form is complete.
create or replace function private.missing_form_answers(p_fields jsonb, p_answers jsonb) returns text[]
language sql immutable set search_path='' as $$
  select coalesce(array_agg(f->>'label' order by ord), '{}')
  from jsonb_array_elements(p_fields) with ordinality as t(f, ord)
  where coalesce((f->>'required')::boolean, false)
    and (
      p_answers -> (f->>'key') is null
      or (f->>'type' = 'table' and (jsonb_typeof(p_answers -> (f->>'key')) <> 'array' or jsonb_array_length(p_answers -> (f->>'key')) = 0))
      or (f->>'type' <> 'table' and length(trim(coalesce(p_answers ->> (f->>'key'), ''))) = 0)
    );
$$;
revoke all on function private.missing_form_answers(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.case_form_action(
  p_action text, p_case uuid default null, p_id uuid default null, p_template uuid default null,
  p_title text default null, p_description text default null, p_subclass text default null,
  p_fields jsonb default null, p_answers jsonb default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.case_forms; c public.cases; t public.form_templates; staff boolean; linked boolean; missing text[]; org uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Sign in is required.' using errcode='42501'; end if;
  staff := public.is_internal_user();
  org := public.current_organisation_id();
  if staff and not private.any_function_allowed(array['students','applications','visas','direct_visas','enquiries','documents']) then raise exception 'Form access is disabled.' using errcode='42501'; end if;
  if p_answers is not null and (jsonb_typeof(p_answers) <> 'object' or length(p_answers::text) > 400000) then raise exception 'Answers must be an object.' using errcode='22023'; end if;
  if p_action = 'create' then
    select * into c from public.cases where id=p_case;
    if not staff or c.id is null or c.organisation_id<>org or not public.can_modify_case(c.id) then raise exception 'Case access denied.' using errcode='42501'; end if;
    if p_template is not null then
      select * into t from public.form_templates where id=p_template and organisation_id=org;
      if t.id is null then raise exception 'That form template is not available.' using errcode='22023'; end if;
    end if;
    if coalesce(p_fields, t.fields) is null or not private.valid_form_fields(coalesce(p_fields, t.fields)) then raise exception 'The form needs at least one valid question.' using errcode='22023'; end if;
    if length(trim(coalesce(p_title, t.title, ''))) not between 1 and 200 then raise exception 'Give the form a title.' using errcode='22023'; end if;
    insert into public.case_forms(organisation_id,client_id,case_id,template_id,title,visa_subclass,description,fields,answers,created_by)
    values(c.organisation_id,c.client_id,c.id,t.id,trim(coalesce(p_title,t.title)),nullif(trim(coalesce(p_subclass,t.visa_subclass,'')),''),nullif(trim(coalesce(p_description,t.description,'')),''),coalesce(p_fields,t.fields),coalesce(p_answers,'{}'::jsonb),auth.uid())
    returning * into f;
  else
    select * into f from public.case_forms where id=p_id for update;
    if f.id is null or f.organisation_id<>org then raise exception 'Form not available.' using errcode='42501'; end if;
    linked := exists(select 1 from public.client_user_links where client_id=f.client_id and profile_id=auth.uid());
    if staff then
      if not public.can_access_client(f.client_id) or not public.can_modify_case(f.case_id) then raise exception 'Form access denied.' using errcode='42501'; end if;
    elsif not linked or f.status='draft' then raise exception 'Form access denied.' using errcode='42501'; end if;
    if p_action = 'update' then
      -- The officer changes the wording, adds a question or corrects an answer, at any point before withdrawal.
      if not staff or f.status='withdrawn' then raise exception 'Only staff can change a form, and not after it is withdrawn.' using errcode='22023'; end if;
      if p_fields is not null and not private.valid_form_fields(p_fields) then raise exception 'Every question needs a key, a label and a known type.' using errcode='22023'; end if;
      if p_title is not null and length(trim(p_title)) not between 1 and 200 then raise exception 'Give the form a title.' using errcode='22023'; end if;
      update public.case_forms set
        title=coalesce(nullif(trim(p_title),''),title),
        description=case when p_description is null then description else nullif(trim(p_description),'') end,
        visa_subclass=case when p_subclass is null then visa_subclass else nullif(trim(p_subclass),'') end,
        fields=coalesce(p_fields,fields),
        answers=case when p_answers is null then answers else answers || p_answers end,
        updated_at=now()
      where id=f.id returning * into f;
    elsif p_action = 'send' then
      -- From a draft this is the first send; from a sent form it is a reminder; from a submitted or reviewed form it reopens the questions.
      if not staff or f.status='withdrawn' then raise exception 'A withdrawn form cannot be sent. Prepare a new one.' using errcode='22023'; end if;
      if jsonb_array_length(f.fields)=0 then raise exception 'Add at least one question before sending.' using errcode='22023'; end if;
      update public.case_forms set status='sent',sent_by=auth.uid(),sent_at=now(),submitted_at=null,reviewed_at=null,reviewed_by=null,updated_at=now() where id=f.id returning * into f;
      insert into public.client_notice_outbox(organisation_id,client_id,case_id,kind,form_id) values(f.organisation_id,f.client_id,f.case_id,'form_request',f.id);
      insert into public.notifications(organisation_id,recipient_id,case_id,kind,title,body,action_url)
      select f.organisation_id,l.profile_id,f.case_id,'form_request','Please complete a form: '||f.title,'Sign in to your secure portal, open Forms and answer each question.','/?portal=forms'
      from public.client_user_links l join public.profiles p on p.id=l.profile_id
      where l.client_id=f.client_id and p.active and p.organisation_id=f.organisation_id;
    elsif p_action = 'view' then
      if staff or f.status<>'sent' then return to_jsonb(f); end if;
      update public.case_forms set viewed_at=coalesce(viewed_at,now()) where id=f.id returning * into f;
    elsif p_action in ('save','submit') then
      if staff or not linked then raise exception 'Only the linked client can answer this form.' using errcode='42501'; end if;
      if f.status<>'sent' then raise exception 'This form is no longer open for answers. Ask your case team to send it again.' using errcode='22023'; end if;
      update public.case_forms set answers=answers || coalesce(p_answers,'{}'::jsonb),client_note=coalesce(left(p_note,2000),client_note),viewed_at=coalesce(viewed_at,now()),updated_at=now() where id=f.id returning * into f;
      if p_action='submit' then
        missing := private.missing_form_answers(f.fields,f.answers);
        if coalesce(array_length(missing,1),0)>0 then raise exception 'Please answer: %', array_to_string(missing, '; ') using errcode='22023'; end if;
        update public.case_forms set status='submitted',submitted_at=now(),updated_at=now() where id=f.id returning * into f;
        insert into public.notifications(organisation_id,recipient_id,case_id,kind,title,body,action_url)
        select f.organisation_id,p.id,f.case_id,'form_submitted','Form completed: '||f.title,'The client has sent back their answers. Open the case to review them.','/?case='||f.case_id
        from public.profiles p where p.id in (f.sent_by,(select owner_id from public.cases where id=f.case_id)) and p.active and p.organisation_id=f.organisation_id;
      end if;
    elsif p_action = 'review' then
      if not staff or f.status<>'submitted' then raise exception 'Only a submitted form can be marked as reviewed.' using errcode='22023'; end if;
      update public.case_forms set status='reviewed',reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=f.id returning * into f;
    elsif p_action = 'withdraw' then
      if not staff or f.status='withdrawn' then raise exception 'This form is already withdrawn.' using errcode='22023'; end if;
      update public.case_forms set status='withdrawn',updated_at=now() where id=f.id returning * into f;
      update public.client_notice_outbox set status='cancelled',last_error='Form withdrawn.' where form_id=f.id and status in ('queued','blocked','failed');
    else raise exception 'Unknown form action.' using errcode='22023'; end if;
  end if;
  insert into public.audit_events(organisation_id,actor_id,case_id,action,resource_type,resource_id,summary,after_data)
  values(f.organisation_id,auth.uid(),f.case_id,'form.'||p_action,'case_form',f.id::text,'Form '||p_action||': '||f.title,jsonb_build_object('status',f.status,'questions',jsonb_array_length(f.fields),'answered',(select count(*) from jsonb_object_keys(f.answers))));
  return to_jsonb(f);
end $$;
revoke all on function public.case_form_action(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.case_form_action(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) to authenticated;

-- The outbox delivers a form request the same way as a document request,
-- with the organisation's own wording and a link straight to the portal's
-- Forms screen. A form the officer withdrew before delivery is not sent.
create or replace function public.claim_client_notices(p_from text,p_origin text) returns setof public.client_notice_outbox
language plpgsql security definer set search_path='' as $$
declare n public.client_notice_outbox; recipient text; subject text; body text; link text;
        tpl record; doc record; frm record; cli record; sender text; values jsonb;
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
   if n.kind='form_request' and not exists(select 1 from public.case_forms where id=n.form_id and status='sent') then
     update public.client_notice_outbox set status='cancelled',last_error='Form is no longer awaiting the client.' where id=n.id; continue;
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
   link:=p_origin||'/?portal='||case when n.kind='document_request' then 'documents' when n.kind='form_request' then 'forms' else 'agreements' end;
   subject:=case n.kind when 'document_request' then 'Maximus: please upload your requested document' when 'form_request' then 'Maximus: please complete your form' when 'agreement_sent' then 'Maximus: agreement ready for review' when 'agreement_accepted' then 'Maximus: signed agreement completed' else 'Maximus: agreement response recorded' end;
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
   elsif n.kind='form_request' then
     select t.subject, t.body into tpl from public.email_templates t where t.organisation_id=n.organisation_id and t.kind='form_request';
     select cf.title, cf.description, cf.sent_by into frm from public.case_forms cf where cf.id=n.form_id;
     select display_name into sender from public.profiles where id=frm.sent_by;
     if tpl.subject is not null then
       values:=jsonb_build_object(
         'client_name', trim(concat_ws(' ', cli.first_name, cli.last_name)),
         'form_title', coalesce(frm.title,'your form'),
         'note', coalesce(frm.description,''),
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

create or replace function public.retry_client_notice(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare n public.client_notice_outbox;
begin
 select * into n from public.client_notice_outbox where id=p_id for update;
 if auth.uid() is null or not public.is_internal_user() or n.organisation_id is distinct from public.current_organisation_id() or not public.can_access_client(n.client_id) or (n.case_id is not null and not public.can_modify_case(n.case_id)) or not private.any_function_allowed(array['documents','students','applications','visas','direct_visas']) then raise exception 'Notice access denied.' using errcode='42501'; end if;
 if n.status not in ('blocked','failed') or (n.status='failed' and coalesce(n.last_error,'') not like 'Email provider returned HTTP 4%') then raise exception 'This notice cannot be retried. Check its delivery outcome first.' using errcode='22023'; end if;
 insert into public.client_notice_outbox(organisation_id,client_id,case_id,kind,document_id,agreement_id,form_id)
 values(n.organisation_id,n.client_id,n.case_id,n.kind,n.document_id,n.agreement_id,n.form_id);
 update public.client_notice_outbox set status='cancelled',last_error='A new notification attempt was queued by the case team.' where id=n.id;
end $$;
revoke all on function public.retry_client_notice(uuid) from public,anon,authenticated;
grant execute on function public.retry_client_notice(uuid) to authenticated;

-- The three questionnaires Maximus already uses, carried over from its Google
-- Forms so the agency starts with them in place. A manager edits them under
-- Templates; an officer can change any copy sent on a case.
create or replace function public.seed_default_form_templates(target_organisation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare person_columns jsonb := '[{"key":"relationship","label":"Relationship to the applicant","type":"text"},{"key":"family_name","label":"Family name","type":"text"},{"key":"given_names","label":"Given names","type":"text"},{"key":"sex","label":"Sex","type":"select","options":["Female","Male","Other"]},{"key":"date_of_birth","label":"Date of birth","type":"date"}]'::jsonb;
        travel_columns jsonb := '[{"key":"country","label":"Country","type":"text"},{"key":"purpose","label":"Reason for the visit","type":"select","options":["Study","Work","Holiday","Business","Military deployment","Visiting home","Other"]},{"key":"date_from","label":"Date from","type":"date"},{"key":"date_to","label":"Date to","type":"date"}]'::jsonb;
begin
  insert into public.form_templates (organisation_id, title, visa_subclass, description, fields)
  values
  (target_organisation, 'Student visa (subclass 500) details', '500',
   'The information we need to prepare your student visa application or extension. Answer every question as fully as you can; the department reads these answers closely.',
   jsonb_build_array(
     jsonb_build_object('key','family_unit','label','Do you have family unit members (partner or dependent children)?','type','yesno','required',true,'section','Your family'),
     jsonb_build_object('key','family_members','label','Family member details','type','table','help','One row per partner or child, whether or not they are included in this application.','section','Your family','columns', person_columns || '[{"key":"included","label":"Included in this application?","type":"yesno"}]'::jsonb),
     jsonb_build_object('key','circumstances','label','Your current circumstances','type','textarea','required',true,'help','Family, community, employment and economic ties in your home country and in Australia.','section','Genuine student'),
     jsonb_build_object('key','course_reasons','label','Why you chose this course, this provider, and studying and living in Australia','type','textarea','required',true,'section','Genuine student'),
     jsonb_build_object('key','course_benefit','label','How completing this course will benefit you','type','textarea','required',true,'section','Genuine student'),
     jsonb_build_object('key','other_information','label','Any other information you want considered','type','textarea','section','Genuine student'),
     jsonb_build_object('key','study_record','label','Your detailed study record in Australia since you first arrived','type','textarea','required',true,'help','Every course, provider, start and end date, and the outcome, including any course you did not finish.','section','Study history'),
     jsonb_build_object('key','studies','label','Past and current secondary and higher studies','type','table','required',true,'section','Study history','columns','[{"key":"qualification","label":"Qualification","type":"text"},{"key":"category","label":"Category of study","type":"select","options":["Secondary","Certificate","Diploma","Advanced Diploma","Bachelor","Graduate Certificate or Diploma","Masters","Doctorate","Other"]},{"key":"field","label":"Field of study","type":"text"},{"key":"course","label":"Course name","type":"text"},{"key":"institution","label":"Institution","type":"text"},{"key":"country","label":"Country of institution","type":"text"},{"key":"date_from","label":"Date from","type":"date"},{"key":"date_to","label":"Date to","type":"date"}]'::jsonb),
     jsonb_build_object('key','oshc','label','Overseas Student Health Cover (OSHC) for every applicant','type','table','required',true,'section','Health cover','columns','[{"key":"applicant","label":"Applicant","type":"text"},{"key":"insurer","label":"Insurer","type":"text"},{"key":"policy","label":"Policy or member number","type":"text"},{"key":"cover_from","label":"Cover from","type":"date"},{"key":"cover_to","label":"Cover to","type":"date"}]'::jsonb),
     jsonb_build_object('key','countries_visited','label','Countries visited in the past 10 years','type','table','required',true,'help','Work or study abroad, holidays, business, military deployment, and visits home if you live abroad.','section','Travel','columns', travel_columns),
     jsonb_build_object('key','tuberculosis','label','Have you or any applicant ever had tuberculosis, been in close contact with a family member with active tuberculosis, or had a chest x-ray showing an abnormality?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','tuberculosis_details','label','If yes, give details','type','textarea','section','Health and character'),
     jsonb_build_object('key','convictions','label','Have you or any applicant ever been convicted of an offence in any country, including a conviction now removed from official records?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','conviction_details','label','If yes, give details','type','textarea','section','Health and character'),
     jsonb_build_object('key','refusals','label','Have you or any applicant ever been refused a visa, or removed, deported or excluded from any country, including Australia?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','refusal_details','label','If yes, give details','type','textarea','section','Health and character'))),
  (target_organisation, 'Temporary Graduate visa (subclass 485) details', '485',
   'The information we need to prepare your Temporary Graduate visa application. Cover the last 10 years since you turned 16 wherever a question asks for history.',
   jsonb_build_array(
     jsonb_build_object('key','full_name','label','Your full name as it appears in your passport','type','text','required',true,'section','About you'),
     jsonb_build_object('key','marital_status','label','Marital status','type','select','required',true,'options','["Never married","Married","De facto","Separated","Divorced","Widowed"]'::jsonb,'section','About you'),
     jsonb_build_object('key','addresses','label','Residential addresses for the past 10 years','type','table','required',true,'help','Every address you and each applicant have lived at since turning 16, most recent first.','section','Addresses','columns','[{"key":"address","label":"Address","type":"text"},{"key":"suburb","label":"Suburb or town","type":"text"},{"key":"state","label":"State or province","type":"text"},{"key":"postcode","label":"Postal code","type":"text"},{"key":"country","label":"Country","type":"text"},{"key":"date_from","label":"Date from","type":"date"},{"key":"date_to","label":"Date to","type":"date"},{"key":"current","label":"Current address?","type":"yesno"}]'::jsonb),
     jsonb_build_object('key','employment','label','Current employment','type','table','required',true,'section','Employment','columns','[{"key":"employer","label":"Employer","type":"text"},{"key":"position","label":"Position","type":"text"},{"key":"country","label":"Country","type":"text"},{"key":"date_from","label":"Start date","type":"date"},{"key":"date_to","label":"End date (blank if current)","type":"date"}]'::jsonb),
     jsonb_build_object('key','travel','label','Overseas travel in the last 10 years','type','table','required',true,'help','Every country visited outside your usual country of residence since turning 16.','section','Travel','columns', travel_columns),
     jsonb_build_object('key','afp_name','label','Australian Federal Police check: name on the request','type','text','required',true,'section','Police check'),
     jsonb_build_object('key','afp_date','label','Date the AFP check was requested','type','date','required',true,'section','Police check'),
     jsonb_build_object('key','afp_reference','label','AFP reference number','type','text','required',true,'section','Police check'),
     jsonb_build_object('key','insurer','label','Health insurer','type','text','required',true,'section','Health insurance'),
     jsonb_build_object('key','cover_type','label','Type of cover','type','select','required',true,'options','["Overseas Visitors Health Cover","Overseas Student Health Cover","Medicare","Other"]'::jsonb,'section','Health insurance'),
     jsonb_build_object('key','policy_number','label','Policy or member number','type','text','section','Health insurance'),
     jsonb_build_object('key','cover_from','label','Cover from','type','date','required',true,'section','Health insurance'),
     jsonb_build_object('key','cover_to','label','Cover to','type','date','required',true,'section','Health insurance'),
     jsonb_build_object('key','test_name','label','Most recent English test','type','select','required',true,'options','["IELTS","PTE Academic","TOEFL iBT","OET","Cambridge C1 Advanced","Other"]'::jsonb,'section','English test'),
     jsonb_build_object('key','test_date','label','Date of test','type','date','required',true,'section','English test'),
     jsonb_build_object('key','test_reference','label','Test reference number','type','text','required',true,'section','English test'),
     jsonb_build_object('key','test_country','label','Country where the test was taken','type','text','required',true,'section','English test'),
     jsonb_build_object('key','score_listening','label','Listening','type','text','required',true,'section','English test'),
     jsonb_build_object('key','score_reading','label','Reading','type','text','required',true,'section','English test'),
     jsonb_build_object('key','score_writing','label','Writing','type','text','required',true,'section','English test'),
     jsonb_build_object('key','score_speaking','label','Speaking','type','text','required',true,'section','English test'),
     jsonb_build_object('key','score_overall','label','Overall band score','type','text','required',true,'section','English test'),
     jsonb_build_object('key','medical_care','label','Does any applicant need ongoing medical care, special equipment or assistance?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','medical_care_details','label','If yes, give details','type','textarea','section','Health and character'),
     jsonb_build_object('key','convictions','label','Has any applicant ever been convicted of an offence in any country, including a conviction now removed from official records?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','conviction_details','label','If yes, give details','type','textarea','section','Health and character'),
     jsonb_build_object('key','refusals','label','Has any applicant ever been refused a visa, or removed, deported or excluded from any country?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','refusal_details','label','If yes, give details','type','textarea','section','Health and character'))),
  (target_organisation, 'Visitor visa (subclass 600) details', '600',
   'The information we need to prepare your visitor visa application: who is travelling, your employment at home, and how the visit is funded.',
   jsonb_build_array(
     jsonb_build_object('key','companions_travelling','label','Is anyone else travelling with you to Australia?','type','yesno','required',true,'section','Travelling party'),
     jsonb_build_object('key','companions','label','People travelling with you','type','table','section','Travelling party','columns', person_columns),
     jsonb_build_object('key','family_not_travelling','label','Do you have family unit members not travelling who are not Australian citizens or permanent residents?','type','yesno','required',true,'section','Travelling party'),
     jsonb_build_object('key','family_abroad','label','Family unit members not travelling','type','table','section','Travelling party','columns', person_columns || '[{"key":"country_of_birth","label":"Country of birth","type":"text"}]'::jsonb),
     jsonb_build_object('key','employment_status','label','Employment status','type','select','required',true,'options','["Employed","Self-employed","Student","Retired","Home duties","Unemployed","Other"]'::jsonb,'section','Current overseas employment'),
     jsonb_build_object('key','occupation_group','label','Occupation grouping','type','text','section','Current overseas employment'),
     jsonb_build_object('key','occupation','label','Occupation','type','text','section','Current overseas employment'),
     jsonb_build_object('key','organisation','label','Organisation','type','text','section','Current overseas employment'),
     jsonb_build_object('key','employment_start','label','Start date with your current employer','type','date','section','Current overseas employment'),
     jsonb_build_object('key','org_country','label','Organisation country','type','text','section','Organisation address','help','A street address is required; a post office box is not accepted.'),
     jsonb_build_object('key','org_address','label','Street address','type','text','section','Organisation address'),
     jsonb_build_object('key','org_suburb','label','Suburb or town','type','text','section','Organisation address'),
     jsonb_build_object('key','org_state','label','State or province','type','text','section','Organisation address'),
     jsonb_build_object('key','org_postcode','label','Postal code','type','text','section','Organisation address'),
     jsonb_build_object('key','contact_family_name','label','Contact person family name','type','text','section','Contact person at the organisation'),
     jsonb_build_object('key','contact_given_names','label','Contact person given names','type','text','section','Contact person at the organisation'),
     jsonb_build_object('key','contact_position','label','Position','type','text','section','Contact person at the organisation'),
     jsonb_build_object('key','contact_business_phone','label','Business phone, with country and area codes','type','text','section','Contact person at the organisation'),
     jsonb_build_object('key','contact_mobile','label','Mobile phone','type','text','section','Contact person at the organisation'),
     jsonb_build_object('key','contact_email','label','Email address','type','text','section','Contact person at the organisation'),
     jsonb_build_object('key','funds','label','What funds will you have available to support your stay in Australia?','type','textarea','required',true,'help','Savings, income, a sponsor or family support, and the evidence you can provide for each.','section','Funding'),
     jsonb_build_object('key','tuberculosis','label','Has any applicant ever had tuberculosis, been in close contact with a family member with active tuberculosis, or had a chest x-ray showing an abnormality?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','tuberculosis_details','label','If yes, give details','type','textarea','section','Health and character'),
     jsonb_build_object('key','convictions','label','Has any applicant ever been convicted of an offence in any country, including a conviction now removed from official records?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','conviction_details','label','If yes, give details','type','textarea','section','Health and character'),
     jsonb_build_object('key','overstay_refusal','label','Has any applicant ever overstayed a visa in any country, or been refused a visa in Australia or any other country?','type','yesno','required',true,'section','Health and character'),
     jsonb_build_object('key','overstay_details','label','If yes, give details','type','textarea','section','Health and character')))
  on conflict (organisation_id, title) do nothing;
end;
$$;

create or replace function public.seed_form_templates_after_organisation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_form_templates(new.id);
  return new;
end;
$$;
drop trigger if exists seed_form_templates_after_organisation_insert on public.organisations;
create trigger seed_form_templates_after_organisation_insert
after insert on public.organisations
for each row execute function public.seed_form_templates_after_organisation_insert();

-- The document checklist gains the items a migration practice asks for that
-- a generic list leaves out: the agent appointment forms, the Genuine
-- Student statement, the AFP check, health cover by type, translations and
-- the employer-sponsored paperwork. Existing items are kept as they are.
create or replace function public.seed_migration_document_checklist_items(target_organisation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_checklist_templates (organisation_id, category, title, guidance)
  values
    (target_organisation, 'Application support', 'Appointment of registered migration agent (Form 956)', 'Signed by the client and the agent before any contact with the department on their behalf.'),
    (target_organisation, 'Application support', 'Authorised recipient (Form 956A)', 'Where someone other than the agent is to receive the department''s correspondence.'),
    (target_organisation, 'Application support', 'Genuine Student statement', 'Written answers to the Genuine Student questions with the evidence that supports them (subclass 500).'),
    (target_organisation, 'Application support', 'Additional personal particulars (Form 1221)', 'Completed where the department or the agent requires it for character assessment.'),
    (target_organisation, 'Application support', 'Statutory declaration', 'Witnessed declaration addressing the matter the case officer has raised.'),
    (target_organisation, 'Application support', 'Certified translations (NAATI)', 'Every non-English document with a translation by a NAATI-accredited translator.'),
    (target_organisation, 'Application support', 'Consent for a child to travel or migrate (Form 1229)', 'Where a parent or guardian with responsibility for a child under 18 is not included in the application.'),
    (target_organisation, 'Character and health', 'Australian Federal Police check', 'National Police Certificate issued within the last 12 months (required for subclass 485 and most onshore applications).'),
    (target_organisation, 'Character and health', 'Overseas Student Health Cover (OSHC)', 'Policy certificate covering every applicant for the full visa period (subclass 500).'),
    (target_organisation, 'Character and health', 'Overseas Visitors Health Cover (OVHC)', 'Adequate health insurance for the visa period (subclass 485, 482 and visitor visas where required).'),
    (target_organisation, 'Education and English', 'Australian study completion evidence', 'Completion letter and full academic transcript for the Australian qualification (subclass 485).'),
    (target_organisation, 'Education and English', 'Tuition fee receipt', 'Receipt for the tuition deposit or fees paid to the provider.'),
    (target_organisation, 'Employment and skills', 'Employment contract and position description', 'Signed contract and position description for the nominated role (subclass 482, 186, 494).'),
    (target_organisation, 'Employment and skills', 'Employer sponsorship and nomination approval', 'Standard business sponsorship approval and the nomination transaction reference.'),
    (target_organisation, 'Financial capacity', 'Evidence of funds for living costs', 'Statements or a financial declaration showing the living, tuition and travel costs the department expects (subclass 500).')
  on conflict (organisation_id, title) do nothing;
end;
$$;
create or replace function public.seed_default_document_checklist_templates_with_migration_items()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_migration_document_checklist_items(new.id);
  return new;
end;
$$;
drop trigger if exists seed_migration_checklist_items_after_organisation_insert on public.organisations;
create trigger seed_migration_checklist_items_after_organisation_insert
after insert on public.organisations
for each row execute function public.seed_default_document_checklist_templates_with_migration_items();

do $$
declare organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.seed_default_form_templates(organisation_row.id);
    perform public.seed_migration_document_checklist_items(organisation_row.id);
  end loop;
end $$;

create or replace function public.schema_version()
returns text language sql stable security definer set search_path=public as $$
  select '20261109000000'
$$;

commit;
