import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("student, application, visa and defer lists expose legacy operational context without wide tables", async () => {
  const page = await read("app/page.tsx");
  const workspace = await read("app/api/crm/workspace/route.ts");
  for (const label of [
    "Contact not recorded",
    "Branch &amp; passport",
    "Documents",
    "Latest case note",
    "New intake",
  ]) assert.match(page, new RegExp(label));
  for (const field of [
    "passportMasked",
    "documentSummary",
    "deferReason",
    "latestNoteBy",
  ]) assert.match(workspace, new RegExp(field));
  assert.doesNotMatch(page, /<th>Assigned To<\/th>/i);
});

test("task register records the work, responsible staff and actual completer", async () => {
  const migration = await read("supabase/migrations/0036_remaining_legacy_workflow_parity.sql");
  const workspace = await read("app/api/crm/workspace/route.ts");
  const page = await read("app/page.tsx");
  assert.match(migration, /completed_by uuid references public\.profiles/);
  assert.match(migration, /task_type text/);
  assert.match(workspace, /completed_by: completed \? actor : null/);
  assert.match(workspace, /description: nullable\(body\.description\)/);
  for (const field of ["description", "taskType", "assignedTo"])
    assert.match(page, new RegExp(`name=["']${field}["']`));
  assert.match(page, /The whole branch can still see case-linked work/);
});

test("student invoice parity keeps invoice date, discount, payment and description", async () => {
  const migration = await read("supabase/migrations/0036_remaining_legacy_workflow_parity.sql");
  const workspace = await read("app/api/crm/workspace/route.ts");
  const importer = await read("app/api/crm/import/route.ts");
  const page = await read("app/page.tsx");
  for (const field of ["discount", "payment_method", "description"])
    assert.match(migration, new RegExp(field));
  assert.match(workspace, /Discount cannot exceed the invoice subtotal/);
  assert.match(workspace, /Paid amount cannot exceed the invoice total/);
  assert.match(workspace, /payment_receipts/);
  assert.match(importer, /data\.payment_mode/);
  for (const field of ["issuedOn", "discount", "initialPaid", "paymentMethod", "paymentReference", "description"])
    assert.match(page, new RegExp(`name=["']${field}["']`));
  assert.match(page, /Grand total/);
  assert.match(page, /Paid \/ credited/);
  assert.match(page, /Balance/);
});

test("document and appointment registers retain notes and dates in their list views", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /No document instructions/);
  assert.match(page, /Recorded \$\{orgDateTime\(d\.createdAt\)\}/);
  assert.match(page, /a\.responseNote \? <small>/);
});

test("the audited legacy replacement keeps every non-zero register and enquiry filter visible", async () => {
  const page = await read("app/page.tsx");
  const route = await read("app/api/crm/enquiries/route.ts");
  const audit = await read("LEGACY_CRM_PARITY.md");
  for (const count of ["5,292", "320", "54", "91", "24", "56"])
    assert.match(audit, new RegExp(count.replace(",", ",")));
  for (const label of [
    "More legacy filters",
    "Assigned staff",
    "Enquiry status",
    "Source / reference",
    "Highest qualification",
    "English test",
    "Spouse / dependant",
    "Created from",
    "Updated to",
  ]) assert.match(page, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const parameter of [
    "ownerId",
    "statusFilter",
    "sourceFilter",
    "intake",
    "qualification",
    "testGiven",
    "spouse",
    "createdFrom",
    "updatedTo",
  ]) assert.match(route, new RegExp(parameter));
  assert.match(audit, /do not manufacture placeholder clients/i);
});
