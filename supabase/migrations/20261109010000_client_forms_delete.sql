begin;
set local lock_timeout='2s';

-- A form prepared in error can be deleted from the case. A draft, a sent
-- form or a withdrawn one goes with its pending notices; a form the client
-- has already answered is a record, so only an administrator may delete it
-- and anyone else withdraws it instead. Deletion is audited like every
-- other form action.

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
    elsif p_action = 'delete' then
      -- A form the client has already answered is a record; only an administrator removes one of those.
      if not staff then raise exception 'Only staff can delete a form.' using errcode='42501'; end if;
      if f.status in ('submitted','reviewed') and public.current_user_level()::text not in ('platform_owner','super_admin','branch_admin') then
        raise exception 'The client has answered this form. Withdraw it, or ask an administrator to delete it.' using errcode='42501';
      end if;
      delete from public.case_forms where id=f.id;
    else raise exception 'Unknown form action.' using errcode='22023'; end if;
  end if;
  insert into public.audit_events(organisation_id,actor_id,case_id,action,resource_type,resource_id,summary,after_data)
  values(f.organisation_id,auth.uid(),f.case_id,'form.'||p_action,'case_form',f.id::text,'Form '||p_action||': '||f.title,jsonb_build_object('status',f.status,'questions',jsonb_array_length(f.fields),'answered',(select count(*) from jsonb_object_keys(f.answers))));
  return to_jsonb(f);
end $$;
revoke all on function public.case_form_action(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.case_form_action(text,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) to authenticated;

create or replace function public.schema_version()
returns text language sql stable security definer set search_path=public as $$
  select '20261109010000'
$$;

commit;
