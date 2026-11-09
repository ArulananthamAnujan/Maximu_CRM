import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Client forms: the visa questionnaires an officer sends from a case and the
 * client answers in the portal. The behaviour is exercised end to end by
 * scripts/audit/feature-audit.mjs against a real database; these keep the
 * pieces that must agree with each other from drifting apart.
 */
const migration = await readFile(new URL("../supabase/migrations/20261109000000_client_forms.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../app/case-forms-panel.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/crm/forms/route.ts", import.meta.url), "utf8");
const checklist = await readFile(new URL("../lib/visa-document-checklist.ts", import.meta.url), "utf8");

test("the three questionnaires Maximus already uses are seeded for every organisation", () => {
  for (const title of ["Student visa (subclass 500) details", "Temporary Graduate visa (subclass 485) details", "Visitor visa (subclass 600) details"])
    assert.ok(migration.includes(title), `${title} is seeded`);
  assert.match(migration, /create trigger seed_form_templates_after_organisation_insert/);
  // Questions carried over from the Google Forms, by key.
  for (const key of ["circumstances", "course_reasons", "study_record", "oshc", "countries_visited", "afp_reference", "score_overall", "funds", "org_address", "overstay_refusal"])
    assert.ok(migration.includes(`'key','${key}'`), `question ${key} is present`);
});

test("every question type the editor offers is one the database accepts", () => {
  const dbTypes = /not in \('text','textarea','date','number','select','yesno','table'\)/.test(migration);
  assert.ok(dbTypes, "the database lists the field types");
  for (const type of ["text", "textarea", "date", "number", "select", "yesno", "table"])
    assert.match(panel, new RegExp(`\\b${type}: "`), `the editor labels the ${type} type`);
});

test("a form request travels through the client notice outbox with its own wording", () => {
  assert.match(migration, /'form_request'\)\);/, "the outbox accepts the form_request kind");
  assert.match(migration, /kind='form_request' and not exists\(select 1 from public\.case_forms where id=n\.form_id and status='sent'\)/, "a withdrawn form is not emailed");
  assert.match(migration, /'\/\?portal='\|\|case when n\.kind='document_request' then 'documents' when n\.kind='form_request' then 'forms'/, "the email links to the portal's Forms screen");
  assert.match(migration, /\(target_organisation, 'form_request',/, "an editable email template exists for it");
  assert.match(migration, /values\(n\.organisation_id,n\.client_id,n\.case_id,n\.kind,n\.document_id,n\.agreement_id,n\.form_id\)/, "a retried notice keeps its form");
});

test("a client can only answer, and only while the form is with them", () => {
  assert.match(migration, /revoke insert, update, delete on public\.case_forms from authenticated, anon/);
  assert.match(migration, /case_forms_hide_drafts .* restrictive for select/);
  assert.match(migration, /if staff or not linked then raise exception 'Only the linked client can answer this form\.'/);
  assert.match(migration, /if f\.status<>'sent' then raise exception 'This form is no longer open for answers/);
  assert.match(migration, /raise exception 'Please answer: %', array_to_string\(missing, '; '\)/, "a submit names the unanswered required questions");
});

test("the officer can change the questions and the answers before and after sending", () => {
  assert.match(migration, /if not staff or f\.status='withdrawn' then raise exception 'Only staff can change a form/);
  assert.match(migration, /answers=case when p_answers is null then answers else answers \|\| p_answers end/);
  assert.match(route, /CASE_ACTIONS = \["create", "update", "send", "view", "save", "submit", "review", "withdraw"\]/);
  assert.match(route, /if \(action === "send"\) await drainClientNotices/, "sending emails the client straight away");
});

test("forms are a tab on the case, a screen in the portal and a section under Templates", () => {
  assert.match(page, /\["forms", "Forms"\],/, "case tab");
  assert.match(page, /tabs: \["forms", "finance", "agreements", "timeline"\]/, "the tab sits with the case records");
  assert.match(page, /\["forms", "Forms", FileCheck2\]/, "portal navigation");
  assert.match(page, /if \(module === "forms"\) return <CaseFormsPanel student \/>;/);
  assert.match(page, /portalScreen === "documents" \|\| portalScreen === "forms"/, "the email's portal link opens the Forms screen");
  assert.match(page, /\{section === "forms" && <FormTemplatesPanel canManage=\{canManage\} \/>\}/);
});

test("the document checklist carries the migration-specific items in both the seed and the code list", () => {
  for (const title of [
    "Appointment of registered migration agent (Form 956)",
    "Genuine Student statement",
    "Australian Federal Police check",
    "Overseas Student Health Cover (OSHC)",
    "Australian study completion evidence",
    "Employment contract and position description",
    "Certified translations (NAATI)",
  ]) {
    assert.ok(migration.includes(`'${title}'`), `${title} is seeded`);
    assert.ok(checklist.includes(`"${title}"`), `${title} is in the code list`);
  }
});
