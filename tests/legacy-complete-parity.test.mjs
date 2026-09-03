import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy exports keep stable relationships across every supported module", async () => {
  const route = await read("app/api/crm/import/route.ts");
  const migration = await read("supabase/migrations/0033_legacy_communication_and_import_parity.sql");
  const page = await read("app/page.tsx");
  for (const entity of ["study_records","direct_visa_records","clients","cases","applications","visa_matters","notes","tasks","appointments","communications","documents","invoices","payments","commission_claims","commission_payments"])
    assert.match(route, new RegExp(`["]${entity}["]`));
  assert.match(route, /legacy_external_keys/);
  assert.match(route, /lifecycleProgress\(lifecycle\)/, "legacy cases should inherit canonical progress when an export has no explicit percentage");
  assert.match(route, /visa_expiry_on:dayValue/, "legacy visa expiry should populate the case-stage expiry field");
  assert.match(route, /legacy_data/);
  assert.match(route, /Import the parent export first/);
  assert.match(migration, /unique \(organisation_id, source_system, entity_type, source_key\)/);
  assert.match(page, /Import legacy Excel or CSV exports/);
  assert.match(page, /readLegacyWorkbook/);
  assert.match(route, /importLegacyCombined/);
  assert.match(route, /Legacy follow-up/);
  assert.match(route, /Legacy appointment/);
  assert.match(route, /email_messages/);
  assert.match(route, /whatsapp_messages/);
  assert.match(route, /staffByLabel/);
  assert.match(route, /client_education_history/);
  assert.match(route, /client_employment_history/);
  assert.match(route, /study_preferences/);
  assert.match(page, /Legacy CRM imported fields/);
  assert.match(page, /name="studyChoicesJson"/);
  assert.match(page, /name="educationRowsJson"/);
  assert.match(page, /name="employmentRowsJson"/);
  assert.match(page, /Detailed status/);
  assert.match(page, /Visa type/);
});

test("legacy staging protects passport data before it reaches the database", async () => {
  const route = await read("app/api/crm/import/route.ts");
  assert.match(route, /redactLegacyData/);
  assert.match(route, /passport_number_encrypted=await protect\(passport\)/);
  assert.match(route, /passport_masked=mask\(passport\)/);
  assert.doesNotMatch(route, /passport_number:data\.passport_number/);
});

test("WhatsApp is a case-scoped conversation with signed inbound webhooks", async () => {
  const migration = await read("supabase/migrations/0033_legacy_communication_and_import_parity.sql");
  const transport = await read("server/whatsapp.ts");
  const webhook = await read("app/api/integrations/whatsapp/webhook/route.ts");
  const route = await read("app/api/crm/whatsapp/route.ts");
  const casefile = await read("app/api/crm/casefile/route.ts");
  assert.match(migration, /create table if not exists public\.whatsapp_messages/);
  assert.match(migration, /public\.can_access_case\(case_id\)/);
  assert.match(transport, /WHATSAPP_GRAPH_API_VERSION/);
  assert.match(webhook, /x-hub-signature-256/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(route, /sendWhatsappText/);
  assert.match(casefile, /whatsappCommunications/);
});

test("campaigns use explicit accessible cases and retain delivery evidence", async () => {
  const route = await read("app/api/crm/campaigns/route.ts");
  const migration = await read("supabase/migrations/0033_legacy_communication_and_import_parity.sql");
  const page = await read("app/page.tsx");
  assert.match(route, /Select between 1 and 200 accessible cases/);
  assert.match(route, /campaign_recipients/);
  assert.match(route, /campaign\.launched/);
  assert.match(migration, /communication_campaigns/);
  assert.match(migration, /campaign_recipients_case_scope/);
  assert.match(page, /Email, SMS and WhatsApp campaigns/);
  assert.match(page, /Review & send/);
  assert.match(page, /Email, SMS and WhatsApp campaigns/);
});

test("legacy SMS and generated enquiry links are first-class secure workflows", async () => {
  const migration = await read("supabase/migrations/0033_legacy_communication_and_import_parity.sql");
  const sms = await read("server/sms.ts");
  const publicRoute = await read("app/api/public/intake/[token]/route.ts");
  const page = await read("app/page.tsx");
  assert.match(migration, /create table if not exists public\.sms_messages/);
  assert.match(migration, /claim_public_intake_link/);
  assert.match(migration, /revoke all on function public\.claim_public_intake_link/);
  assert.match(sms, /api\.twilio\.com\/2010-04-01\/Accounts/);
  assert.match(sms, /international E\.164 format/);
  assert.match(publicRoute, /submission_ip_hash/);
  assert.match(publicRoute, /privacy_consent_at/);
  assert.match(page, /Generate enquiry link/);
  assert.match(page, /option value="sms"/);
});

test("legacy enquiry scoring, follow-up, loss and performance summaries are operational", async () => {
  const workspace = await read("app/api/crm/workspace/route.ts");
  const reports = await read("app/api/crm/reports/route.ts");
  const page = await read("app/page.tsx");
  assert.match(workspace, /leadScore\(body\)/);
  assert.match(workspace, /next_follow_up_at/);
  assert.match(workspace, /lost_reason/);
  assert.match(reports, /missedFollowUps/);
  assert.match(reports, /campaignPerformance/);
  assert.match(page, /Lost \/ cancelled reason/);
  assert.match(page, /CAMPAIGN PERFORMANCE/);
  assert.match(page, /First appointment date/);
  assert.match(page, /Follow-up remarks/);
  assert.match(workspace, /Initial consultation with/);
  assert.match(workspace, /Follow up with/);
});

test("guided intake covers spouse marriage, suggested course and aptitude details", async () => {
  const page = await read("app/page.tsx");
  const workspace = await read("app/api/crm/workspace/route.ts");
  for (const label of ["Passport issue date","Marriage type","Marriage registration","Proposed course start","Backlogs / failed subjects","Quantitative","Analytical","Verbal"])
    assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workspace, /marriage_registered/);
  assert.match(workspace, /category: "aptitude"/);
  assert.match(workspace, /proposedCourseStart/);
});

test("enquiries and lead reports are scoped to the actual service case", async () => {
  const migration = await read("supabase/migrations/0033_legacy_communication_and_import_parity.sql");
  const workspace = await read("app/api/crm/workspace/route.ts");
  const reports = await read("app/api/crm/reports/route.ts");
  assert.match(migration, /alter table public\.enquiries add column if not exists case_id/);
  assert.match(workspace, /case_id: caseId/);
  assert.match(workspace, /enquiryByCase/);
  assert.match(reports, /scopedEnquiries/);
  assert.match(reports, /caseIds\.has\(String\(row\.case_id\)\)/);
});

test("partner and university accounts preserve invoice, payment and receipt parity", async () => {
  const migration = await read("supabase/migrations/0033_legacy_communication_and_import_parity.sql");
  const operations = await read("app/api/crm/operations/route.ts");
  const workspace = await read("app/api/crm/workspace/route.ts");
  const page = await read("app/page.tsx");
  const backup = await read("netlify/functions/production-operations-background.mjs");
  assert.match(migration, /counterparty_type text not null default 'partner'/);
  assert.match(migration, /create table if not exists public\.commission_payments/);
  assert.match(migration, /create table if not exists public\.commission_receipts/);
  assert.match(migration, /commission_payments_scoped/);
  assert.match(operations, /commission\.invoice_created/);
  assert.match(operations, /Payment exceeds the pending commission/);
  assert.match(operations, /send_commission_invoice/);
  assert.match(operations, /send_commission_receipt/);
  assert.match(workspace, /pendingAmount/);
  assert.match(page, /Partner invoice/);
  assert.match(page, /University invoice/);
  assert.match(page, /Send invoice/);
  assert.match(page, /Send receipt/);
  assert.match(backup, /commission_payments/);
  assert.match(backup, /commission_receipts/);
});
