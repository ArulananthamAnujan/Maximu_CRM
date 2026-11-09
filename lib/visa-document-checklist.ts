export type VisaDocumentTemplate = {
  key: string;
  category: string;
  title: string;
  guidance: string;
};

// Safe, general-purpose starting list. Agents select only what is relevant to
// the particular visa matter; the list is deliberately not treated as legal
// advice or as a claim that every item is required for every visa.
export const VISA_DOCUMENT_TEMPLATES: VisaDocumentTemplate[] = [
  { key: "passport_bio", category: "Identity", title: "Passport bio page", guidance: "Clear colour copy of the current passport photo page." },
  { key: "passport_pages", category: "Identity", title: "Passport visa and stamp pages", guidance: "All pages containing visas, entry/exit stamps or endorsements." },
  { key: "photo", category: "Identity", title: "Passport photograph", guidance: "Recent photograph meeting the destination country's specifications." },
  { key: "birth_certificate", category: "Identity", title: "Birth certificate", guidance: "Full birth certificate and certified translation if not in English." },
  { key: "national_id", category: "Identity", title: "National identity card", guidance: "Front and back, with translation where applicable." },
  { key: "name_change", category: "Identity", title: "Name change evidence", guidance: "Marriage certificate, deed poll or other evidence linking different names." },
  { key: "marriage_certificate", category: "Family and relationships", title: "Marriage certificate", guidance: "Official certificate and translation where applicable." },
  { key: "divorce_separation", category: "Family and relationships", title: "Divorce or separation evidence", guidance: "Final order or other official evidence." },
  { key: "family_composition", category: "Family and relationships", title: "Family composition evidence", guidance: "Details and identity evidence for spouse, children and other dependants." },
  { key: "relationship_evidence", category: "Family and relationships", title: "Relationship evidence", guidance: "Evidence of financial, household, social and committed aspects of the relationship." },
  { key: "current_visa", category: "Immigration history", title: "Current visa evidence", guidance: "Visa grant notice, visa label or current status evidence." },
  { key: "previous_visas", category: "Immigration history", title: "Previous visas and applications", guidance: "Grant notices and copies/details of previous visa applications." },
  { key: "travel_history", category: "Immigration history", title: "International travel history", guidance: "Countries visited, dates and purpose for the requested period." },
  { key: "refusal_cancellation", category: "Immigration history", title: "Visa refusal or cancellation records", guidance: "Every decision letter and relevant submission or appeal record." },
  { key: "police_clearance", category: "Character and health", title: "Police clearance certificates", guidance: "Certificates for each required country, issued within the accepted period." },
  { key: "character_form", category: "Character and health", title: "Character information / Form 80", guidance: "Completed character and personal particulars form where requested." },
  { key: "military_records", category: "Character and health", title: "Military service records", guidance: "Service, discharge and rank records where applicable." },
  { key: "health_examination", category: "Character and health", title: "Health examination evidence", guidance: "HAP ID, medical referral or completion evidence." },
  { key: "health_insurance", category: "Character and health", title: "Health insurance", guidance: "Policy certificate covering the required dates and applicants." },
  { key: "bank_statements", category: "Financial capacity", title: "Bank statements", guidance: "Complete statements for the requested period showing account holder details." },
  { key: "source_of_funds", category: "Financial capacity", title: "Source of funds evidence", guidance: "Explain and evidence savings, deposits, loans, gifts or asset sales." },
  { key: "sponsor_finance", category: "Financial capacity", title: "Sponsor financial support", guidance: "Sponsor declaration, identity, relationship, income and funds evidence." },
  { key: "income_tax", category: "Financial capacity", title: "Income and tax records", guidance: "Payslips, tax returns/assessments and other requested income evidence." },
  { key: "employment_evidence", category: "Employment and skills", title: "Employment evidence", guidance: "Contracts, detailed references and recent payslips." },
  { key: "cv", category: "Employment and skills", title: "Curriculum vitae / résumé", guidance: "Current, complete employment and education history with no unexplained gaps." },
  { key: "skills_assessment", category: "Employment and skills", title: "Skills assessment", guidance: "Current outcome letter and documents submitted to the assessing authority." },
  { key: "licence_registration", category: "Employment and skills", title: "Professional licence or registration", guidance: "Current licence, registration or membership evidence." },
  { key: "education_records", category: "Education and English", title: "Education certificates and transcripts", guidance: "Awards and full academic transcripts for relevant qualifications." },
  { key: "english_test", category: "Education and English", title: "English language test", guidance: "Official result for IELTS, PTE, TOEFL or another accepted test." },
  { key: "offer_coe", category: "Education and English", title: "Offer letter / CoE", guidance: "Current offer, enrolment or Confirmation of Enrolment document." },
  { key: "statement_purpose", category: "Application support", title: "Statement of purpose", guidance: "Personal statement addressing the case officer's requested criteria." },
  { key: "invitation_itinerary", category: "Application support", title: "Invitation, itinerary and accommodation", guidance: "Invitation letter plus travel and accommodation plans where applicable." },
  { key: "nomination_sponsorship", category: "Application support", title: "Nomination or sponsorship evidence", guidance: "Approval, reference, nomination and sponsor supporting documents." },
  { key: "business_documents", category: "Application support", title: "Business or company documents", guidance: "Registration, ownership, financial and trading records where relevant." },
  { key: "other_requested", category: "Application support", title: "Other case-specific document", guidance: "Use the request note to describe the exact document required." },
  // What a migration practice asks for beyond the generic list (seeded by 20261109000000_client_forms.sql).
  { key: "form_956", category: "Application support", title: "Appointment of registered migration agent (Form 956)", guidance: "Signed by the client and the agent before any contact with the department on their behalf." },
  { key: "form_956a", category: "Application support", title: "Authorised recipient (Form 956A)", guidance: "Where someone other than the agent is to receive the department's correspondence." },
  { key: "genuine_student", category: "Application support", title: "Genuine Student statement", guidance: "Written answers to the Genuine Student questions with the evidence that supports them (subclass 500)." },
  { key: "form_1221", category: "Application support", title: "Additional personal particulars (Form 1221)", guidance: "Completed where the department or the agent requires it for character assessment." },
  { key: "statutory_declaration", category: "Application support", title: "Statutory declaration", guidance: "Witnessed declaration addressing the matter the case officer has raised." },
  { key: "translations", category: "Application support", title: "Certified translations (NAATI)", guidance: "Every non-English document with a translation by a NAATI-accredited translator." },
  { key: "form_1229", category: "Application support", title: "Consent for a child to travel or migrate (Form 1229)", guidance: "Where a parent or guardian with responsibility for a child under 18 is not included in the application." },
  { key: "afp_check", category: "Character and health", title: "Australian Federal Police check", guidance: "National Police Certificate issued within the last 12 months (required for subclass 485 and most onshore applications)." },
  { key: "oshc", category: "Character and health", title: "Overseas Student Health Cover (OSHC)", guidance: "Policy certificate covering every applicant for the full visa period (subclass 500)." },
  { key: "ovhc", category: "Character and health", title: "Overseas Visitors Health Cover (OVHC)", guidance: "Adequate health insurance for the visa period (subclass 485, 482 and visitor visas where required)." },
  { key: "australian_study", category: "Education and English", title: "Australian study completion evidence", guidance: "Completion letter and full academic transcript for the Australian qualification (subclass 485)." },
  { key: "tuition_receipt", category: "Education and English", title: "Tuition fee receipt", guidance: "Receipt for the tuition deposit or fees paid to the provider." },
  { key: "employment_contract", category: "Employment and skills", title: "Employment contract and position description", guidance: "Signed contract and position description for the nominated role (subclass 482, 186, 494)." },
  { key: "sponsorship_nomination", category: "Employment and skills", title: "Employer sponsorship and nomination approval", guidance: "Standard business sponsorship approval and the nomination transaction reference." },
  { key: "living_costs", category: "Financial capacity", title: "Evidence of funds for living costs", guidance: "Statements or a financial declaration showing the living, tuition and travel costs the department expects (subclass 500)." },
];
