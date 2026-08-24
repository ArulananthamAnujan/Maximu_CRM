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
];
