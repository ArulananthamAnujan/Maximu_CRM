-- Supply maximus.qa_student, maximus.qa_staff and maximus.qa_case as session settings.
-- Use dedicated test records; no production identifiers belong in this file.
-- Production-safe verification: all synthetic writes are rolled back.
begin;
insert into public.client_user_links(profile_id,client_id)
select current_setting('maximus.qa_student')::uuid,client_id from public.cases where id=current_setting('maximus.qa_case')::uuid on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('maximus.qa_staff'),true);
do $$
declare a jsonb; aid uuid; doc uuid:=gen_random_uuid(); c public.cases; caught boolean;
begin
 select * into c from public.cases where id=current_setting('maximus.qa_case')::uuid;
 a:=public.agreement_action('create',c.id,null,'QA TEST ONLY agreement','Synthetic test terms only. No legal obligation or real services are created.','1');aid:=(a->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',current_setting('maximus.qa_student'),true);
 if exists(select 1 from public.service_agreements where id=aid) then raise exception 'Draft leaked to student'; end if;
 caught:=false;begin perform public.agreement_action('accept',p_id=>aid,p_name=>'QA Student',p_consent=>true,p_hash=>'bad');exception when sqlstate '22023' then caught:=true;end;
 if not caught then raise exception 'Draft signing allowed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('maximus.qa_staff'),true);
 a:=public.agreement_action('send',p_id=>aid);
 caught:=false;begin perform public.agreement_action('accept',p_id=>aid,p_name=>'Staff',p_consent=>true,p_hash=>a->>'terms_hash');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'Staff signed for student'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('maximus.qa_student'),true);
 a:=public.agreement_action('view',p_id=>aid);
 if a->>'viewed_at' is null then raise exception 'View was not recorded'; end if;
 caught:=false;begin perform public.agreement_action('accept',p_id=>aid,p_name=>'QA Student',p_consent=>false,p_hash=>a->>'terms_hash');exception when sqlstate '22023' then caught:=true;end;
 if not caught then raise exception 'Consent was not required'; end if;
 caught:=false;begin perform public.agreement_action('accept',p_id=>aid,p_name=>'QA Student',p_consent=>true,p_hash=>'wrong-version');exception when sqlstate '22023' then caught:=true;end;
 if not caught then raise exception 'Stale terms were accepted'; end if;
 a:=public.agreement_action('accept',p_id=>aid,p_name=>'QA Student',p_consent=>true,p_hash=>a->>'terms_hash');
 if a->>'status'<>'accepted' or a->>'signed_name'<>'QA Student' or a->>'accepted_at' is null then raise exception 'Signature missing'; end if;
 perform public.agreement_action('accept',p_id=>aid,p_name=>'QA Student',p_consent=>true,p_hash=>a->>'terms_hash');
 caught:=false;begin update public.service_agreements set terms_snapshot='{}' where id=aid;exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'Signed terms were mutable'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('maximus.qa_staff'),true);
 if (select count(*) from public.client_notice_outbox where agreement_id=aid)<>2 then raise exception 'Duplicate or missing agreement notices'; end if;
 insert into public.documents(id,organisation_id,client_id,case_id,document_type,display_name,state,requested_by,metadata) values(doc,c.organisation_id,c.client_id,c.id,'General','QA TEST ONLY requested document','requested',auth.uid(),'{}');
 if (select count(*) from public.client_notice_outbox where document_id=doc)<>1 then raise exception 'Document notice missing'; end if;
 update public.documents set metadata='{"note":"updated instructions"}' where id=doc;
 if (select count(*) from public.client_notice_outbox where document_id=doc)<>1 then raise exception 'Duplicate document notice'; end if;
end $$;
select 'Agreement lifecycle, consent, version lock, staff signing denial, immutable signatures, draft isolation and document queue tests passed' as result;
rollback;
