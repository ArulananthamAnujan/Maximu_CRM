import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy migration is chunked, resumable and reconciled", async () => {
  const route = await read("app/api/crm/import/route.ts");
  const page = await read("app/page.tsx");
  assert.match(route, /rows\.length>500/);
  assert.doesNotMatch(route, /slice\(0,5000\)/);
  assert.match(route, /getAll\(/);
  assert.match(route, /sourceChecksum/);
  assert.match(route, /saveSnapshot/);
  assert.match(route, /reconcileBatch/);
  assert.match(route, /if\(remaining\).*imported_rows/);
  assert.match(page, /offset\+=500/);
  assert.match(page, /do\{const response=.*action:"commit"/s);
  assert.match(page, /while\(result\.remaining\)/);
});

test("every audited legacy export has a structured import target", async () => {
  const route = await read("app/api/crm/import/route.ts");
  const page = await read("app/page.tsx");
  for (const entity of ["dependants","education_history","employment_history","test_results","study_preferences","visa_history","lifecycle_events","application_comments","visa_comments","task_comments","payment_receipts","finance_line_items","campaigns","campaign_recipients","email_templates","standard_documents","staff_history","login_activity","activity_events","master_records","file_manifest"]) {
    assert.match(route, new RegExp(`"${entity}"`));
    assert.match(page, new RegExp(`"${entity}"`));
  }
  assert.match(route, /rowList\(data/);
  assert.match(route, /dependantrowsprotected/);
  assert.match(route, /legacy_staff_directory/);
});

test("sensitive source rows and physical files remain provable", async () => {
  const migration = await read("supabase/migrations/0037_lossless_legacy_migration.sql");
  const route = await read("app/api/crm/import/route.ts");
  const backup = await read("netlify/functions/production-operations-background.mjs");
  for (const table of ["legacy_record_snapshots","legacy_activity_events","legacy_file_manifests","legacy_finance_line_items","legacy_staff_directory","legacy_master_records"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(backup, new RegExp(`"${table}"`));
  }
  assert.match(route, /extractSensitiveData/);
  assert.match(route, /protected_data/);
  assert.match(route, /row\.status!=="verified"/);
  assert.match(route, /unverified files/);
});

test("case files include imported historical activity and source timezone", async () => {
  const route = await read("app/api/crm/import/route.ts");
  const casefile = await read("app/api/crm/casefile/route.ts");
  const page = await read("app/page.tsx");
  assert.match(route, /Intl\.DateTimeFormat/);
  assert.match(route, /__source_timezone/);
  assert.match(page, /Old CRM timezone/);
  assert.match(casefile, /legacy_activity_events/);
  assert.match(casefile, /Legacy staff member/);
});
