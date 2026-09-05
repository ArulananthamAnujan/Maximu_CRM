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
    "app/api/crm/enquiries/route.ts",
    "app/api/crm/workspace/route.ts",
  ]) assert.match(await read(route), /liveSession\(request\)/, route);
});

test("large enquiry directories load independently and never fail as an empty list", async () => {
  const page = await read("app/page.tsx");
  const route = await read("app/api/crm/enquiries/route.ts");
  assert.match(route, /lifecycle_stage=eq\.enquiry/);
  assert.match(route, /const PAGE_SIZE = 500/);
  assert.match(route, /for \(let offset = 0/);
  assert.match(page, /fetch\("\/api\/crm\/enquiries"/);
  assert.match(page, /Enquiries could not be loaded/);
  assert.match(page, /onRetry/);
});

test("bulk actions are server-authorised and bounded", async () => {
  const page = await read("app/page.tsx");
  const workspace = await read("app/api/crm/workspace/route.ts");
  const admin = await read("app/api/crm/admin/route.ts");
  const checklists = await read("app/api/crm/document-checklist-templates/route.ts");
  for (const source of [workspace, admin, checklists]) {
    assert.match(source, /Bulk actions are limited to 100/);
  }
  assert.match(workspace, /action === "bulk_mutate"/);
  assert.match(workspace, /action === "bulk_lifecycle"/);
  assert.match(workspace, /requireManager\(session\.identity\.role/);
  assert.match(admin, /action === "bulk_update_profiles"/);
  assert.match(checklists, /action === "bulk_update"/);
  for (const label of [
    "Export selected",
    "Mark complete",
    "Archive selected",
    "Void selected",
    "Deactivate selected",
  ]) assert.match(page, new RegExp(label));
});

test("every portal list provides client-safe bulk tools", async () => {
  const page = await read("app/page.tsx");
  for (const contract of [
    "Select all my documents",
    "Download files",
    "Select all my appointments",
    "Add to calendar",
    "Select all my messages",
    "Copy messages",
    "Select all my invoices",
    "Download invoice PDFs",
    "Confirm received",
  ]) assert.match(page, new RegExp(contract));
});

test("course finder is student-readable, filterable and source-aware", async () => {
  const page = await read("app/page.tsx");
  const route = await read("app/api/crm/course-finder/route.ts");
  const migration = await read("supabase/migrations/0030_course_catalog_live_sync.sql");
  for (const label of [
    "Field of study",
    "Maximum annual tuition",
    "Maximum duration",
    "Source checked in the last 6 months",
    "courseCardGrid",
    "CourseApplicationFields",
  ]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(route.split("export async function POST")[0], /Course Finder is available to staff only/);
  assert.match(route, /search_course_catalog_v2/);
  assert.match(migration, /courses_portal_read/);
  assert.match(migration, /course_catalog_sync_runs/);
  assert.match(migration, /stale_count/);
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
  assert.match(workspace, /Your staff account needs a branch/);
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

test("the deferral stage is split so PostgreSQL will accept it", async () => {
  const enumFile = await read("supabase/migrations/0013_defer_stage_enum.sql");
  const rest = await read("supabase/migrations/0014_defer_stage.sql");
  // ALTER TYPE ... ADD VALUE cannot be used by other statements in the same
  // transaction, so the value must arrive on its own and without a BEGIN.
  assert.match(enumFile, /add value if not exists 'deferred'/i);
  assert.doesNotMatch(enumFile, /^\s*begin;/im);
  assert.doesNotMatch(enumFile, /create (or replace )?function/i);
  assert.match(rest, /^begin;/im);
  assert.match(rest, /move_case_lifecycle/);
  // Deferral parks a case; it does not throw away the work already recorded.
  assert.match(rest, /when deferring then current_case\.progress/);
  // And a deferred case is still finished from the visa stage, not directly.
  assert.match(
    rest,
    /target_stage = 'completed' and current_case\.lifecycle_stage <> 'visa'/,
  );
  const readme = await read("README.md");
  assert.match(readme, /on its own, before `0014`/i);
});

test("the duplicate search runs as the caller, not above them", async () => {
  const sql = await read("supabase/migrations/0015_duplicate_clients.sql");
  assert.match(sql, /create or replace function public\.find_duplicate_clients/i);
  // SECURITY DEFINER here would let a branch officer discover clients in
  // another branch, which is exactly what row-level security is stopping.
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  // Matching has to survive the ways a number and an address get written.
  assert.match(sql, /normalise_contact_number/);
  assert.match(sql, /lower\(c\.email\) = lower\(trim\(p_email\)\)/);
  // The passport is encrypted, so the mask is what is compared.
  assert.match(sql, /passport_masked = trim\(p_passport_masked\)/);
});

test("a message has a date to show before it is ever sent", async () => {
  const sql = await read("supabase/migrations/0016_message_created_at.sql");
  assert.match(sql, /alter table public\.email_messages/i);
  assert.match(sql, /add column if not exists created_at/i);
  const route = await read("app/api/crm/workspace/route.ts");
  // Both are carried so a draft can say it is a draft rather than render an
  // unparseable date.
  assert.match(route, /createdAt: row\.created_at \?\? null/);
  assert.match(route, /sentAt: row\.sent_at \?\? null/);
  const page = await read("app/page.tsx");
  assert.match(page, /function messageWhen/);
  assert.match(page, /return "Not sent"/);
});

test("an invited person can actually become a staff account", async () => {
  const sql = await read("supabase/migrations/0017_staff_onboarding.sql");
  // The invitation used to be written and read by nothing at all.
  assert.match(sql, /create or replace function public\.claim_staff_invitation/i);
  assert.match(sql, /security definer/i);
  // Bounded: the email comes from auth.users for auth.uid(), never from an
  // argument, so nobody can claim an invitation addressed to someone else.
  assert.match(sql, /select email into caller_email from auth\.users where id = caller/);
  assert.doesNotMatch(sql, /claim_staff_invitation\(\s*\w+\s+text/i);
  assert.match(sql, /status = 'pending'/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.match(sql, /grant execute on function public\.claim_staff_invitation\(\) to authenticated/i);

  // Both the sign-in route and every authenticated request go through the same
  // lookup, so it does not matter which one an invited person reaches first.
  const session = await read("server/supabase-session.ts");
  assert.match(session, /export async function profileForUser/);
  assert.match(session, /rpc\/claim_staff_invitation/);
  const login = await read("app/api/auth/login/route.ts");
  assert.match(login, /profileForUser\(session\.access_token, session\.user\.id\)/);
});

test("the service-role key is used only for bounded staff-auth operations and never as a filter", async () => {
  const supabase = await read("server/supabase.ts");
  assert.match(supabase, /export async function supabaseAdminRequest/);
  const admin = await read("app/api/crm/admin/route.ts");
  // Admin calls create/undo/find a login and can retire a removed staff login
  // so its real email is available for a future account.
  const uses = admin.match(/supabaseAdminRequest/g) ?? [];
  assert.equal(uses.length, 6, "unexpected service-role calls");
  assert.match(admin, /supabaseAdminRequest<\{ id\?: string \}>\("\/auth\/v1\/admin\/users"/);
  assert.match(admin, /supabaseAdminRequest<\{ users\?:/);
  // Only a Super Admin makes another administrator.
  assert.match(admin, /Only a Super Admin can create an administrator account/);
  const readme = await read("README.md");
  assert.match(readme, /Adding a member of staff/i);
  assert.match(readme, /SUPABASE_SERVICE_ROLE_KEY/);
  const example = await read(".env.example");
  assert.match(example, /SUPABASE_SERVICE_ROLE_KEY=/);
});

test("branch staff share their branch workspace and every material change is attributed", async () => {
  const sql = await read("supabase/migrations/0035_branch_workspace_and_audit.sql");
  assert.match(sql, /c\.branch_id=public\.current_user_branch\(\)/);
  assert.match(sql, /create or replace function public\.can_modify_case/);
  assert.doesNotMatch(sql.split("create or replace function public.can_modify_case")[1].split("$$;")[0], /owner_id|case_collaborators/);
  assert.match(sql, /create or replace function public\.audit_branch_workspace_change/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /'changed_fields'/);
  assert.match(sql, /education_applications/);
  assert.match(sql, /email_messages/);
});

test("case work is branch-wide while the interface attributes every action", async () => {
  const page = await read("app/page.tsx");
  const caseFile = await read("app/api/crm/casefile/route.ts");
  const drawer = page.split("function CaseDrawer(")[1].split("type CaseTab")[0] +
    page.split("function CaseDrawerBody(")[1].split("function HistorySection")[0];
  const caseList = page.split("function CaseWorkspace(")[1].split("const overdue")[0];
  assert.doesNotMatch(drawer, /CASE OWNER|Reassign this case|Add a colleague|Accountable owner/);
  assert.doesNotMatch(caseList, /Assign selected cases|All owners|ownerFilter/);
  assert.match(page, /shared with all staff in/);
  assert.match(page, /Every action records the staff member/);
  assert.match(page, /View complete audit trail/);
  assert.match(caseFile, /profiles\?select=id,display_name,email/);
  assert.match(caseFile, /actorName/);
});

test("staff onboarding emails a secure setup link and every user can change password", async () => {
  const admin = await read("app/api/crm/admin/route.ts");
  assert.match(admin, /type: "recovery"/);
  assert.match(admin, /Set up your Maximus CRM account/);
  assert.doesNotMatch(admin, /temporaryPassword,\s*message:/);
  const password = await read("app/api/auth/password/route.ts");
  assert.match(password, /\/auth\/v1\/user/);
  assert.match(password, /password\.length < 12/);
});

test("a connected Gmail account exposes a searchable personal inbox", async () => {
  const gmail = await read("server/gmail.ts");
  assert.match(gmail, /gmail\.readonly/);
  const mailbox = await read("app/api/crm/mailbox/route.ts");
  assert.match(mailbox, /searchParams\.get\("view"\) === "inbox"/);
  assert.match(mailbox, /gmailSearchMessages/);
  assert.match(mailbox, /gmailGetMessage/);
  const page = await read("app/page.tsx");
  assert.match(page, /Gmail inbox/);
  assert.match(page, /Search Gmail exactly as you would in Gmail/);
});

test("a case officer writes only to the cases assigned to them", async () => {
  const sql = await read("supabase/migrations/0018_staff_scope.sql");
  assert.match(sql, /create or replace function public\.can_modify_client/i);
  // Managers keep their branch; staff and partners are narrowed to ownership.
  assert.match(sql, /c\.owner_id = auth\.uid\(\)/);
  assert.match(sql, /k\.client_id = c\.id and k\.owner_id = auth\.uid\(\)/);
  // Reads are deliberately left alone, so a colleague's case is read-only
  // rather than invisible.
  assert.doesNotMatch(sql, /cases_scoped_select/);
  // The stage machine asks the same question.
  assert.match(sql, /if not public\.can_modify_client\(current_case\.client_id\)/);
  // Archiving is a management decision with a request path for everyone else.
  assert.match(sql, /create or replace function public\.request_case_archive/i);
  assert.match(sql, /kind = 'archive_request'|'archive_request'/);
});

test("a write that row-level security refused is reported as refused", async () => {
  const route = await read("app/api/crm/workspace/route.ts");
  // PostgREST answers 204 when the filter matched nothing it was allowed to
  // see, which used to come back to the person as a successful save.
  assert.match(route, /Prefer: "return=representation"/);
  assert.match(route, /updated\.length === 0/);
  assert.match(route, /not yours to change/i);
});

test("the client portal is titled from its own words", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /const clientMeta/);
  // The staff labels name commissions and partner claims; the portal's do not.
  const portalBlock = page.slice(
    page.indexOf("const clientMeta"),
    page.indexOf("const meta: Record<ModuleKey"),
  );
  assert.doesNotMatch(portalBlock, /commission|partner claim|draft/i);
  assert.match(page, /const CLIENT_INVOICE_TYPES/);
  assert.match(page, /CLIENT_INVOICE_TYPES\.includes\(x\.type\)/);
  // And no developer language where a client can read it.
  assert.doesNotMatch(page, /client_user_links\s*$/m);
});

test("portal appointments and messages are restricted to the client's case", async () => {
  const page = await read("app/page.tsx");
  const route = await read("app/api/crm/workspace/route.ts");
  assert.match(page, /Send appointment request/);
  assert.match(page, /Message your case team/);
  assert.match(route, /You can only request an appointment on your own case/);
  assert.match(route, /You can only message the team working on your own case/);
  assert.match(route, /direction = "inbound"/);
  assert.match(route, /deliveryState = "received"/);
});

test("case email is resolved from the profile both when composing and when sending", async () => {
  const workspace = await read("app/api/crm/workspace/route.ts");
  const mailbox = await read("app/api/crm/mailbox/route.ts");
  const page = await read("app/page.tsx");
  assert.match(workspace, /recipientSource: "case_profile"/);
  assert.match(workspace, /clients\?select=id,email/);
  assert.match(mailbox, /Resolve the address again at the moment of dispatch/);
  assert.match(mailbox, /clients\?select=email/);
  assert.doesNotMatch(page, /name="to"/);
});

test("invoice PDFs use the protected Drive document pipeline", async () => {
  const workspace = await read("app/api/crm/workspace/route.ts");
  const documents = await read("app/api/crm/documents/route.ts");
  const page = await read("app/page.tsx");
  assert.match(workspace, /source: "invoice_pdf"/);
  assert.match(workspace, /10 Accounts and Receipts/);
  assert.match(documents, /\.\.\.\(\(document\.metadata/);
  assert.match(page, /name="invoicePdf"/);
  assert.match(page, /invoice_pdf_prepare/);
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
  // And is honest about what is built and what remains configuration work.
  assert.match(readme, /What is and is not built/i);
  assert.match(readme, /WhatsApp \| Built/i);
  assert.match(readme, /Campaigns \| Built/i);
});
