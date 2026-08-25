begin;

-- The document-request checklist (Visa checklist) was a fixed list baked
-- into the code -- lib/visa-document-checklist.ts -- so an agency could not
-- add, reword or retire an item without a code change. Made into ordinary
-- masters data instead, same shape as institutions and courses: any
-- internal user browses it when requesting documents, only the roles that
-- maintain masters data elsewhere can add or change an entry.

create table public.document_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations on delete cascade,
  category text not null,
  title text not null,
  guidance text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, title)
);

alter table public.document_checklist_templates enable row level security;

create policy document_checklist_templates_internal_read on public.document_checklist_templates
for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_internal_user());
create policy document_checklist_templates_admin_write on public.document_checklist_templates
for all to authenticated
using (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'))
with check (organisation_id = public.current_organisation_id() and public.current_user_level()::text in ('platform_owner','super_admin','branch_admin','manager'));

comment on table public.document_checklist_templates is
  'The editable document-request checklist offered when requesting documents from a client. Masters data, same access shape as institutions and courses.';

-- A safe, general-purpose starting list -- the same 35 items that used to be
-- hard-coded -- given to every organisation so editing starts from
-- something usable rather than a blank screen. Not treated as legal advice
-- or as a claim that every item is required for every visa; that framing
-- carries over from the code comment it replaces.
create or replace function public.seed_default_document_checklist_templates(target_organisation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.document_checklist_templates (organisation_id, category, title, guidance)
  values
    (target_organisation, 'Identity', 'Passport bio page', 'Clear colour copy of the current passport photo page.'),
    (target_organisation, 'Identity', 'Passport visa and stamp pages', 'All pages containing visas, entry/exit stamps or endorsements.'),
    (target_organisation, 'Identity', 'Passport photograph', 'Recent photograph meeting the destination country''s specifications.'),
    (target_organisation, 'Identity', 'Birth certificate', 'Full birth certificate and certified translation if not in English.'),
    (target_organisation, 'Identity', 'National identity card', 'Front and back, with translation where applicable.'),
    (target_organisation, 'Identity', 'Name change evidence', 'Marriage certificate, deed poll or other evidence linking different names.'),
    (target_organisation, 'Family and relationships', 'Marriage certificate', 'Official certificate and translation where applicable.'),
    (target_organisation, 'Family and relationships', 'Divorce or separation evidence', 'Final order or other official evidence.'),
    (target_organisation, 'Family and relationships', 'Family composition evidence', 'Details and identity evidence for spouse, children and other dependants.'),
    (target_organisation, 'Family and relationships', 'Relationship evidence', 'Evidence of financial, household, social and committed aspects of the relationship.'),
    (target_organisation, 'Immigration history', 'Current visa evidence', 'Visa grant notice, visa label or current status evidence.'),
    (target_organisation, 'Immigration history', 'Previous visas and applications', 'Grant notices and copies/details of previous visa applications.'),
    (target_organisation, 'Immigration history', 'International travel history', 'Countries visited, dates and purpose for the requested period.'),
    (target_organisation, 'Immigration history', 'Visa refusal or cancellation records', 'Every decision letter and relevant submission or appeal record.'),
    (target_organisation, 'Character and health', 'Police clearance certificates', 'Certificates for each required country, issued within the accepted period.'),
    (target_organisation, 'Character and health', 'Character information / Form 80', 'Completed character and personal particulars form where requested.'),
    (target_organisation, 'Character and health', 'Military service records', 'Service, discharge and rank records where applicable.'),
    (target_organisation, 'Character and health', 'Health examination evidence', 'HAP ID, medical referral or completion evidence.'),
    (target_organisation, 'Character and health', 'Health insurance', 'Policy certificate covering the required dates and applicants.'),
    (target_organisation, 'Financial capacity', 'Bank statements', 'Complete statements for the requested period showing account holder details.'),
    (target_organisation, 'Financial capacity', 'Source of funds evidence', 'Explain and evidence savings, deposits, loans, gifts or asset sales.'),
    (target_organisation, 'Financial capacity', 'Sponsor financial support', 'Sponsor declaration, identity, relationship, income and funds evidence.'),
    (target_organisation, 'Financial capacity', 'Income and tax records', 'Payslips, tax returns/assessments and other requested income evidence.'),
    (target_organisation, 'Employment and skills', 'Employment evidence', 'Contracts, detailed references and recent payslips.'),
    (target_organisation, 'Employment and skills', 'Curriculum vitae / résumé', 'Current, complete employment and education history with no unexplained gaps.'),
    (target_organisation, 'Employment and skills', 'Skills assessment', 'Current outcome letter and documents submitted to the assessing authority.'),
    (target_organisation, 'Employment and skills', 'Professional licence or registration', 'Current licence, registration or membership evidence.'),
    (target_organisation, 'Education and English', 'Education certificates and transcripts', 'Awards and full academic transcripts for relevant qualifications.'),
    (target_organisation, 'Education and English', 'English language test', 'Official result for IELTS, PTE, TOEFL or another accepted test.'),
    (target_organisation, 'Education and English', 'Offer letter / CoE', 'Current offer, enrolment or Confirmation of Enrolment document.'),
    (target_organisation, 'Application support', 'Statement of purpose', 'Personal statement addressing the case officer''s requested criteria.'),
    (target_organisation, 'Application support', 'Invitation, itinerary and accommodation', 'Invitation letter plus travel and accommodation plans where applicable.'),
    (target_organisation, 'Application support', 'Nomination or sponsorship evidence', 'Approval, reference, nomination and sponsor supporting documents.'),
    (target_organisation, 'Application support', 'Business or company documents', 'Registration, ownership, financial and trading records where relevant.'),
    (target_organisation, 'Application support', 'Other case-specific document', 'Use the request note to describe the exact document required.')
  on conflict (organisation_id, title) do nothing;
end;
$$;

create or replace function public.seed_document_checklist_templates_after_organisation_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_document_checklist_templates(new.id);
  return new;
end;
$$;

drop trigger if exists seed_document_checklist_templates_after_organisation_insert on public.organisations;
create trigger seed_document_checklist_templates_after_organisation_insert
after insert on public.organisations
for each row execute function public.seed_document_checklist_templates_after_organisation_insert();

do $$
declare organisation_row record;
begin
  for organisation_row in select id from public.organisations loop
    perform public.seed_default_document_checklist_templates(organisation_row.id);
  end loop;
end $$;

commit;
