\pset format unaligned
\pset tuples_only on
set role authenticated;
set test.uid = '00000000-0000-4000-8000-000000000003';  -- the student portal account
select 'dependants           ' || count(*) from public.dependants;
select 'enquiries            ' || count(*) from public.enquiries;
select 'client_consents      ' || count(*) from public.client_consents;
select 'education_applications ' || count(*) from public.education_applications;
select 'visa_matters         ' || count(*) from public.visa_matters;
select 'case_notes           ' || count(*) from public.case_notes;
select 'payments             ' || count(*) from public.payments;
select 'commission_claims    ' || count(*) from public.commission_claims;
select 'mailbox_connections  ' || count(*) from public.mailbox_connections;
select 'drive_jobs           ' || count(*) from public.drive_jobs;
select 'ai_interactions      ' || count(*) from public.ai_interactions;
select 'ai_action_proposals  ' || count(*) from public.ai_action_proposals;
select 'case_stage_history   ' || count(*) from public.case_stage_history;
