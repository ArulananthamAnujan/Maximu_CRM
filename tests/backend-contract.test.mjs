import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("production operations migration contains secured workflow services", async () => {
  const sql = await read("supabase/migrations/0006_production_operations.sql");
  for (const contract of [
    "case_checklist_items",
    "notifications",
    "integration_connections",
    "integration_jobs",
    "webhook_events",
    "data_retention_rules",
    "transition_case_stage",
  ]) assert.match(sql, new RegExp(contract));
  assert.match(sql, /enable row level security/g);
  assert.match(sql, /Required checklist items must be completed/);
});

test("all live CRM routes authenticate through Supabase sessions", async () => {
  for (const route of [
    "app/api/crm/admin/route.ts",
    "app/api/crm/operations/route.ts",
    "app/api/crm/search/route.ts",
    "app/api/crm/workspace/route.ts",
  ]) assert.match(await read(route), /liveSession\(request\)/, route);
});

test("worker applies baseline browser and API security headers", async () => {
  const worker = await read("worker/index.ts");
  for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy", "Cache-Control"])
    assert.match(worker, new RegExp(header));
});

test("production readiness migration covers education, migration, import and operations", async () => {
  const sql = await read("supabase/migrations/0007_production_readiness.sql");
  for (const contract of [
    "client_education_history",
    "client_employment_history",
    "english_tests",
    "study_preferences",
    "visa_history",
    "client_declarations",
    "service_agreements",
    "import_batches",
    "operational_incidents",
    "production_readiness",
  ]) assert.match(sql, new RegExp(contract));
});

test("Netlify build uses the supported Next.js runtime", async () => {
  const config = await read("netlify.toml");
  const pkg = JSON.parse(await read("package.json"));
  assert.match(config, /npm run build:netlify/);
  assert.equal(pkg.scripts["build:netlify"], "next build");
});

test("login identity survives an unavailable workspace dataset", async () => {
  const page = await read("app/page.tsx");
  const workspace = await read("app/api/crm/workspace/route.ts");
  assert.match(page, /fetch\("\/api\/auth\/session"/);
  assert.match(page, /if \(!authenticatedIdentity\) setIdentity\(null\)/);
  assert.match(workspace, /async function safeRest/);
  assert.match(workspace, /Workspace dataset unavailable/);
});
