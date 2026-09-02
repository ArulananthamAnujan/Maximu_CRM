import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const sql = await read(
  "supabase/migrations/0032_branch_and_case_team_scope.sql",
);
const branchWorkspace = await read(
  "supabase/migrations/0035_branch_workspace_and_audit.sql",
);
const branchMasters = await read(
  "supabase/migrations/0036_super_admin_branch_management.sql",
);
const page = await read("app/page.tsx");
const workspace = await read("app/api/crm/workspace/route.ts");
const admin = await read("app/api/crm/admin/route.ts");
const operations = await read("app/api/crm/operations/route.ts");

test("every internal user works across their branch without assignment", () => {
  assert.match(branchWorkspace, /create or replace function public\.can_access_case/);
  assert.match(
    branchWorkspace,
    /public\.is_internal_user\(\) and c\.branch_id=public\.current_user_branch\(\)/,
  );
  assert.doesNotMatch(
    branchWorkspace.split("create or replace function public.can_access_case")[1]
      .split("create or replace function public.can_modify_case")[0],
    /owner_id|case_collaborators|supervisor_id/,
  );
  assert.match(branchWorkspace, /Assignment is accountability metadata, not a visibility boundary/);
});

test("all case-specific records use the exact case boundary", () => {
  for (const table of [
    "cases",
    "case_collaborators",
    "case_stage_history",
    "education_applications",
    "visa_matters",
    "case_lifecycle_events",
    "case_notes",
    "tasks",
    "appointments",
    "documents",
    "email_threads",
    "invoices",
    "payments",
    "credit_notes",
    "invoice_reminders",
    "payment_receipts",
  ]) assert.match(sql, new RegExp(table), `${table} is not covered`);
  assert.match(sql, /public\.can_access_case\(case_id\)/);
  assert.match(sql, /public\.can_modify_case\(case_id\)/);
});

test("branch administration cannot cross branch boundaries", () => {
  assert.match(sql, /branch_id = public\.current_user_branch\(\)/);
  assert.match(admin, /assertManagedBranch/);
  assert.match(admin, /A Branch Admin can only/);
  assert.match(workspace, /Cases can only be assigned to staff in the same branch/);
  assert.match(workspace, /Case collaborators must belong to the same branch/);
  assert.match(branchMasters, /\('platform_owner', 'super_admin'\)/);
  assert.doesNotMatch(branchMasters, /branch_admin|manager/);
  assert.match(admin, /Only a Super Admin can change branches/);
});

test("staff receive complete operational tools for every case in their branch", () => {
  const staffModules = page
    .split("staff: {")[1]
    .split("client: {")[0];
  for (const moduleName of [
    '"ai"',
    '"applications"',
    '"visas"',
    '"documents"',
    '"communications"',
    '"finance"',
    '"reports"',
    '"compliance"',
  ]) assert.match(staffModules, new RegExp(moduleName));
  assert.doesNotMatch(staffModules, /"administration"/);
  assert.match(page, /scope: "Every operational record in their branch"/);
  assert.doesNotMatch(page, /CASE OWNER|People working together|Add case collaborator/);
  assert.doesNotMatch(operations, /Only administrators can record payments/);
  assert.doesNotMatch(operations, /Only administrators can record refunds/);
  assert.doesNotMatch(operations, /Only administrators can send payment reminders/);
});

test("student and client directories keep converted people visible throughout the case", () => {
  assert.match(
    page,
    /active === "students"[\s\S]*?cases\.filter\([\s\S]*?c\.lifecycleStage !== "enquiry"/,
  );
  assert.match(
    page,
    /active === "direct_visas"[\s\S]*?cases\.filter\([\s\S]*?c\.lifecycleStage !== "enquiry"/,
  );
  assert.match(page, /active === "direct_visas"[\s\S]*?"Client directory"/);
  assert.match(page, /active === "students"[\s\S]*?"Student directory"/);
  assert.match(
    workspace,
    /row\.lifecycle_stage === "deferred" \|\| row\.health === "attention"/,
  );
});

test("record boards appear only on their operational pages", () => {
  assert.match(page, /active === "applications" \? \([\s\S]*?<ApplicationsBoard/);
  assert.match(page, /\) : active === "visas" \? \([\s\S]*?<VisaMattersBoard/);
  assert.doesNotMatch(page, /active === "visas" \|\| active === "direct_visas"/);
});

test("migration can be safely reapplied after an interrupted release", () => {
  const policies = [...sql.matchAll(/create policy\s+(\w+)\s+on\s+public\.(\w+)/g)];
  assert.ok(policies.length > 20, "expected the migration policy set");
  for (const [, policy, table] of policies) {
    assert.match(
      sql,
      new RegExp(`drop policy if exists ${policy} on public\\.${table}`),
      `${policy} must be dropped before it is recreated`,
    );
  }
});

test("case lists use the authoritative lifecycle and canonical progress", () => {
  assert.match(workspace, /stage: lifecycleLabel\(row\.lifecycle_stage\)/);
  assert.doesNotMatch(
    workspace,
    /stage: stage\.name \?\? client\.current_lifecycle/,
  );
  assert.match(
    sql,
    /set progress = public\.lifecycle_progress\(lifecycle_stage\)/,
  );
});
