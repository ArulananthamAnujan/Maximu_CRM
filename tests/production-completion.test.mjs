import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/0031_production_completion.sql");
const workspace = read("app/api/crm/workspace/route.ts");
const operations = read("app/api/crm/operations/route.ts");
const admin = read("app/api/crm/admin/route.ts");
const page = read("app/page.tsx");
const protection = read("netlify/functions/production-operations-background.mjs");
const protectionTrigger = read("netlify/functions/production-operations-trigger.mjs");
const integrations = read("app/api/crm/integrations/route.ts");

test("client appointment requests have a staff response lifecycle", () => {
  assert.match(migration, /respond_to_appointment/);
  assert.match(migration, /appointment_response/);
  assert.match(workspace, /requested_by: actor/);
  assert.match(operations, /action === "appointment_response"/);
  assert.match(page, />Confirm</);
  assert.match(page, />Decline</);
});

test("finance supports allocated payments, receipts, refunds and reconciliation", () => {
  for (const table of ["payment_receipts", "invoice_reminders", "reconciliation_runs"])
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(operations, /Payment exceeds the outstanding balance/);
  assert.match(operations, /receiptNumber/);
  assert.match(operations, /action === "record_refund"/);
  assert.match(operations, /action === "reconcile_payments"/);
  assert.match(page, /Send reminder/);
});

test("staff removal transfers live ownership and preserves historical profile attribution", () => {
  assert.match(migration, /transfer_staff_ownership/);
  assert.match(migration, /Historical foreign keys continue pointing at the retired/);
  assert.match(admin, /replacementProfileId/);
  assert.match(admin, /staff\.removed/);
  assert.match(page, /Transfer and remove/);
});

test("master configuration is a working owner-managed screen", () => {
  assert.match(migration, /organisation_settings/);
  assert.match(admin, /action === "update_settings"/);
  assert.match(page, /Save master configuration/);
  assert.doesNotMatch(page, /Next working screen/);
});

test("operations protection creates backups and verifies restorability and headers", () => {
  assert.match(migration, /backup_runs/);
  assert.match(migration, /restore_drills/);
  assert.match(migration, /operational_checks/);
  assert.match(protection, /maximus-crm-backup-v1/);
  assert.match(protection, /foreignKeys/);
  assert.match(protection, /Security headers missing/);
  assert.match(protection, /integration_jobs/);
  assert.match(protectionTrigger, /schedule: "23 2 \* \* \*"/);
  assert.match(integrations, /Database backup and restore drill/);
  assert.match(integrations, /Monitoring and incident alerts/);
});

test("Next responses apply the full production security-header set", () => {
  const config = read("next.config.ts");
  for (const header of [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) assert.match(config, new RegExp(header));
  assert.match(config, /source: "\/:path\*"/);
});

test("course sources distinguish official coverage from stale legacy data", () => {
  for (const source of ["au_cricos", "us_college_scorecard", "uk_discover_uni", "ca_ircc_dli", "nz_nzqa", "ae_caa"])
    assert.match(migration, new RegExp(source));
  assert.match(migration, /cannot[\s\S]{0,12}be presented as current/);
  assert.match(migration, /last_verified_at=null/);
});
