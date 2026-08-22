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

test("record creation preserves branch security and exposes form failures", async () => {
  const page = await read("app/page.tsx");
  const workspace = await read("app/api/crm/workspace/route.ts");
  assert.match(workspace, /sourceLevel !== "super_admin"/);
  assert.match(workspace, /return null;/);
  assert.match(workspace, /date_of_birth: nullableDay\(body\.dob\)/);
  assert.match(workspace, /custom_fields: intakeFields/);
  assert.match(page, /setFormError\(message\)/);
  assert.match(page, /disabled=\{saving\}/);
});

test("Supabase minimal writes are accepted as successful form submissions", async () => {
  const client = await read("server/supabase.ts");
  const workspace = await read("app/api/crm/workspace/route.ts");
  assert.match(client, /const body = await response\.text\(\)/);
  assert.match(client, /if \(!body\.trim\(\)\) return undefined as T/);
  assert.doesNotMatch(workspace, /email_messages\?select=\*&order=created_at/);
});

test("every table left on the blanket tenant policy is now scoped", async () => {
  const sql = await read("supabase/migrations/0009_close_remaining_rls_gaps.sql");
  // Migration 0001 gave these a `for all` policy keyed on the organisation
  // alone, which let any signed-in account read and write every row.
  for (const table of [
    "dependants",
    "enquiries",
    "client_consents",
    "case_stage_history",
    "education_applications",
    "visa_matters",
    "case_notes",
    "payments",
    "commission_claims",
    "drive_jobs",
    "mailbox_connections",
    "ai_interactions",
    "ai_action_proposals",
  ])
    assert.match(sql, new RegExp(table), `${table} is still unscoped`);
  assert.match(sql, /can_access_client/);
  assert.match(sql, /is_internal_user/);
});

test("the case lifecycle is enforced in the database, not only the interface", async () => {
  const sql = await read("supabase/migrations/0008_case_lifecycle.sql");
  assert.match(sql, /create type public\.case_lifecycle_stage as enum/);
  assert.match(sql, /A case can only be completed from the visa stage/);
  assert.match(sql, /Record the visa expiry date before moving this case/);
  assert.match(sql, /case_lifecycle_events/);
  // Reopening must clear the closed state rather than leave a completed case
  // sitting in an active stage.
  assert.match(sql, /reopened_at/);
});

test("both deployment targets send the same security headers", async () => {
  const worker = await read("worker/index.ts");
  const netlify = await read("netlify.toml");
  // worker/index.ts only runs on Cloudflare, so anything set there alone would
  // silently not apply to the Netlify deployment.
  for (const header of [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Cross-Origin-Opener-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.match(worker, new RegExp(header), `worker is missing ${header}`);
    assert.match(netlify, new RegExp(header), `netlify.toml is missing ${header}`);
  }
});

test("the migration printer emits SQL, never its own source", async () => {
  // A previous instruction led to the bash script being pasted into the SQL
  // editor, which fails with: syntax error at or near "#!/".
  const { execFileSync } = await import("node:child_process");
  const root = new URL("..", import.meta.url).pathname;
  const printed = execFileSync("bash", [`${root}scripts/print-migrations.sh`, "0010"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.doesNotMatch(printed, /^#!/, "the script printed its own shebang");
  assert.doesNotMatch(printed, /set -euo pipefail/, "the script printed its own source");
  assert.match(printed.split("\n")[0], /^--/, "output should open as a SQL comment");
  assert.match(printed, /0010_case_file\.sql/);
  assert.match(printed, /begin;/);
});

test("the README tells people to copy the SQL file, not run a script", async () => {
  // The README is hard-wrapped, so collapse whitespace before matching.
  const readme = (await read("README.md")).replace(/\s+/g, " ");
  assert.match(readme, /are plain SQL/);
  assert.match(readme, /Copy the SQL file itself, not any script/i);
});

test("the schema checker covers every migration that adds objects", async () => {
  const checker = await read("scripts/checks/verify-schema.sql");
  // A checker that has not kept up with the migrations quietly reports OK for
  // things it never looks at.
  for (const expected of [
    "cases.lifecycle_stage",
    "move_case_lifecycle",
    "cases.matter_type",
    "visa_matters.information_due_at",
    "clients.passport_masked",
    "education_applications.archived_at",
    "documents_client_attach",
    "audit_case_read",
  ])
    assert.match(checker, new RegExp(expected.replace(".", "\\.")));
  // It must stay read-only: it is meant to be pasted into a live database.
  assert.doesNotMatch(checker, /\b(insert|update|delete|drop|alter|create)\s/i);
});

test("the browser suite is wired into CI and needs no committed key", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const harness = await read("scripts/verify-features.sh");
  const ui = await read("scripts/verify-ui.sh");
  // The audit previously needed a private key that .gitignore excluded, so the
  // job failed on every clean checkout.
  for (const script of [harness, ui]) {
    assert.match(script, /openssl genpkey/, "the harness must make its own key");
    assert.doesNotMatch(script, /scripts\/audit\/keys/, "no committed key path");
  }
  assert.match(workflow, /Browser end-to-end/);
  assert.match(workflow, /playwright install/);
});

test("the README says how to make CI an actual merge gate", async () => {
  const readme = (await read("README.md")).replace(/\s+/g, " ");
  assert.match(readme, /Require status checks to pass/i);
  assert.match(readme, /Browser end-to-end/);
  // And is honest about what is not built.
  assert.match(readme, /What is and is not built/i);
  assert.match(readme, /No mail provider is connected/i);
});
