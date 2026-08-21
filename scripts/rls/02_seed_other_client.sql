-- A second client, belonging to nobody the student is linked to.
insert into public.clients (id,organisation_id,branch_id,crm_id,first_name,last_name,email,owner_id) values
  ('00000000-0000-4000-8000-00000000eeee','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000bbbb','MAX-2026-0002','Other','Client','other@example.test','00000000-0000-4000-8000-000000000002');
insert into public.cases (id,organisation_id,client_id,branch_id,case_number,service_type,owner_id) values
  ('00000000-0000-4000-8000-00000000ffff','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000eeee','00000000-0000-4000-8000-00000000bbbb','CASE-2026-0002','study_abroad','00000000-0000-4000-8000-000000000002');

insert into public.dependants (organisation_id,client_id,relationship,full_name,passport_number_encrypted)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000eeee','spouse','Other Spouse','ENCRYPTED-PASSPORT');
insert into public.enquiries (organisation_id,client_id,branch_id,source)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000eeee','00000000-0000-4000-8000-00000000bbbb','walk-in');
insert into public.client_consents (organisation_id,client_id,consent_type,granted_at)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000eeee','privacy',now());
insert into public.education_applications (organisation_id,case_id,institution,course)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000ffff','Other University','Other Course');
insert into public.visa_matters (organisation_id,case_id,destination_country)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000ffff','AU');
insert into public.case_notes (organisation_id,case_id,author_id,body,visibility)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000ffff','00000000-0000-4000-8000-000000000002','Internal only: client credibility concerns','case_team');
insert into public.invoices (id,organisation_id,client_id,invoice_number,invoice_type,total)
  values ('00000000-0000-4000-8000-000000009999','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000eeee','INV-2026-0002','professional_fee',4200);
insert into public.payments (organisation_id,invoice_id,amount,currency)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000009999',4200,'AUD');
insert into public.commission_claims (organisation_id,partner_name,expected_amount)
  values ('00000000-0000-4000-8000-00000000aaaa','Partner University',9000);
insert into public.mailbox_connections (organisation_id,profile_id,email,token_reference)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000000002','staff@maximus.test','SECRET-TOKEN-REF');
insert into public.drive_jobs (organisation_id,client_id,operation)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000eeee','create_folder');
insert into public.ai_interactions (id,organisation_id,profile_id,case_id,purpose,prompt_redacted,response_redacted)
  values ('00000000-0000-4000-8000-000000008888','00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-00000000ffff','summary','internal prompt','internal response');
insert into public.ai_action_proposals (organisation_id,interaction_id,case_id,action_type)
  values ('00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-000000008888','00000000-0000-4000-8000-00000000ffff','send_email');
insert into public.case_stage_history (organisation_id,case_id,to_stage_id)
  select '00000000-0000-4000-8000-00000000aaaa','00000000-0000-4000-8000-00000000ffff', id
  from public.workflow_stages limit 1;
