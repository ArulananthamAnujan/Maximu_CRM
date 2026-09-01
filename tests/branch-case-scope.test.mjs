import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const sql = await read(
  "supabase/migrations/0032_branch_and_case_team_scope.sql",
);
const page = await read("app/page.tsx");
const workspace = await read("app/api/crm/workspace/route.ts");
const admin = await read("app/api/crm/admin/route.ts");
const operations = await read("app/api/crm/operations/route.ts");

test("branch admins see their branch while staff require a case-team relationship", () => {
  assert.match(sql, /create or replace function public\.can_access_case/);
  assert.match(
    sql,
    /public\.current_user_level\(\)::text in \('branch_admin','manager'\)[\s\S]*?c\.branch_id = public\.current_user_branch\(\)/,
  );
  for (const contract of [
    "c.owner_id = auth.uid()",
    "c.supervisor_id = auth.uid()",
    "cc.profile_id = auth.uid()",
  ]) assert.match(sql, new RegExp(contract.replace(/[().]/g, "\\$&")));
  assert.doesNotMatch(
    sql.split("create or replace function public.can_access_case")[1]
      .split("create or replace function public.can_modify_case")[0],
    /staff[\s\S]*?can_access_branch\(c\.branch_id\)/,
  );
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
});

test("staff receive complete operational tools only for permitted cases", () => {
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
  assert.match(page, /c\.collaboratorIds\?\.includes\(identity\?\.profileId/);
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
