// Drives the built Worker against a real PostgreSQL database (through the
// PostgREST shim) as each role, exercising every feature the CRM offers.
const SHIM = process.env.SHIM_URL ?? "http://127.0.0.1:8099";
const workerUrl = new URL(process.env.WORKER_ENTRY ?? "../../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("audit", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = {
  SUPABASE_URL: SHIM,
  SUPABASE_PUBLISHABLE_KEY: "audit-key",
  ASSETS: { fetch: async () => new Response("", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

const results = [];
let group = "";
const section = (name) => { group = name; };
function record(name, ok, detail) {
  results.push({ group, name, ok, detail });
  const mark = ok ? "  ok  " : "  FAIL";
  console.log(`${mark}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const response = await worker.fetch(
    new Request(`https://crm.test${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }), env, ctx);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: response.status, json, text, headers: response.headers };
}

async function login(email) {
  const response = await call("/api/auth/login", {
    method: "POST", body: { email, password: "irrelevant" },
  });
  const cookies = response.headers.getSetCookie();
  return {
    ok: response.status === 200,
    cookie: cookies.map((c) => c.split(";")[0]).join("; "),
    body: response.json,
  };
}

// Assert helpers -------------------------------------------------------------
const expect = (name, condition, detail) => record(name, Boolean(condition), detail);

// ---------------------------------------------------------------------------
section("Sign in");
const owner = await login("owner@maximus.test");
expect("owner signs in", owner.ok, JSON.stringify(owner.body));
const manager = await login("manager@maximus.test");
expect("branch manager signs in", manager.ok, JSON.stringify(manager.body));
const officer = await login("officer@maximus.test");
expect("case officer signs in", officer.ok, JSON.stringify(officer.body));
const student = await login("student@maximus.test");
expect("client portal account signs in", student.ok, JSON.stringify(student.body));
const nobody = await login("ghost@maximus.test");
expect("unknown email is refused", !nobody.ok);

section("Session");
const sess = await call("/api/auth/session", { cookie: owner.cookie });
expect("session returns the signed-in identity", sess.json?.identity?.role === "super_admin",
  JSON.stringify(sess.json)?.slice(0, 200));
const anonSess = await call("/api/auth/session");
expect("session is refused without a cookie", anonSess.status === 401);

section("Workspace load");
for (const [label, who, role] of [
  ["owner", owner, "super_admin"], ["manager", manager, "admin"],
  ["officer", officer, "staff"], ["portal", student, "client"],
]) {
  const ws = await call("/api/crm/workspace", { cookie: who.cookie });
  expect(`workspace loads for ${label}`,
    ws.status === 200 && ws.json?.identity?.role === role,
    `status ${ws.status} role ${ws.json?.identity?.role} err ${ws.json?.error}`);
  if (label === "owner") {
    expect("workspace reports no degraded datasets",
      Array.isArray(ws.json?.degraded) && ws.json.degraded.length === 0,
      JSON.stringify(ws.json?.degraded));
    expect("workspace reports the lifecycle migration as applied",
      ws.json?.capabilities?.lifecycle === true, JSON.stringify(ws.json?.capabilities));
  }
}

section("Enquiry intake");
const badEmail = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "No Email", phone: "+61400000009", visaExpiry: "2027-01-01" } });
expect("a case without an email is refused", badEmail.status === 400, JSON.stringify(badEmail.json));
const badExpiry = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "No Expiry", phone: "+61400000009", email: "x@example.test" } });
expect("a case without a visa expiry is refused", badExpiry.status === 400, JSON.stringify(badExpiry.json));
const created = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Arun Kumar", phone: "+61400000002", email: "arun@example.test",
          visaExpiry: "2027-09-30", type: "Student visa", target: "Bachelor of Nursing",
          stage: "New Inquiry", due: "2026-10-01" } });
expect("a new enquiry is created", created.status === 200, JSON.stringify(created.json));
const newCaseId = created.json?.caseId;

section("Case pipeline");
const ws2 = await call("/api/crm/workspace", { cookie: officer.cookie });
const arun = ws2.json?.cases?.find((c) => c.name === "Arun Kumar");
expect("the new enquiry starts at the enquiry stage", arun?.lifecycleStage === "enquiry",
  `stage=${arun?.lifecycleStage}`);
const move = (stage, cookie = officer.cookie, id = newCaseId, reason) =>
  call("/api/crm/workspace", { method: "POST", cookie,
    body: { action: "lifecycle", caseId: id, stage, reason } });
expect("enquiry -> student", (await move("student")).status === 200);
expect("student -> application", (await move("application")).status === 200);
expect("application -> visa", (await move("visa")).status === 200);
expect("visa -> application (backward)", (await move("application")).status === 200);
const badComplete = await move("completed");
expect("cannot complete from the application stage", badComplete.status === 400,
  JSON.stringify(badComplete.json));
await move("visa");
expect("visa -> completed", (await move("completed", officer.cookie, newCaseId, "Visa approved")).status === 200);
const ws3 = await call("/api/crm/workspace", { cookie: officer.cookie });
const done = ws3.json?.cases?.find((c) => c.name === "Arun Kumar");
expect("a completed case reports as completed",
  done?.lifecycleStage === "completed" && done?.status === "completed", JSON.stringify(done));
expect("a completed case can be reopened",
  (await move("application", officer.cookie, newCaseId, "Course change")).status === 200);
const ws4 = await call("/api/crm/workspace", { cookie: officer.cookie });
const reopened = ws4.json?.cases?.find((c) => c.name === "Arun Kumar");
expect("a reopened case returns to an active stage",
  reopened?.lifecycleStage === "application" && reopened?.status !== "completed",
  JSON.stringify(reopened));
const portalMove = await move("visa", student.cookie);
expect("a portal account cannot move a case", portalMove.status === 403, JSON.stringify(portalMove.json));

section("Case editing");
const edit = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "update_case", caseId: newCaseId, clientId: created.json?.clientId,
          name: "Arun Kumar", email: "arun.kumar@example.test", phone: "+61400000003",
          visaExpiry: "2028-01-31", target: "Bachelor of Nursing", stage: "Follow Up",
          health: "attention" } });
expect("a case can be edited", edit.status === 200, JSON.stringify(edit.json));
const ws5 = await call("/api/crm/workspace", { cookie: officer.cookie });
const edited = ws5.json?.cases?.find((c) => c.dbId === newCaseId);
expect("the edit did not reset pipeline progress", (edited?.progress ?? 0) > 0,
  `progress=${edited?.progress}`);
expect("the edit kept the pipeline stage", edited?.lifecycleStage === "application",
  `stage=${edited?.lifecycleStage}`);

section("Case assignment");
const assignByOwner = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "assign", caseId: newCaseId, ownerId: "c0000000-0000-4000-8000-000000000002" } });
expect("an owner can reassign a case", assignByOwner.status === 200, JSON.stringify(assignByOwner.json));
const assignByStaff = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "assign", caseId: newCaseId, ownerId: "c0000000-0000-4000-8000-000000000003" } });
expect("a case officer cannot reassign", assignByStaff.status === 403, JSON.stringify(assignByStaff.json));

section("Day-to-day records");
const mk = (body, cookie = officer.cookie) =>
  call("/api/crm/workspace", { method: "POST", cookie, body });
expect("a task can be created",
  (await mk({ action: "task", title: "Collect passport copy", caseId: newCaseId, priority: "high", due: "2026-09-15" })).status === 200);
expect("an appointment can be created",
  (await mk({ action: "appointment", title: "Visa consultation", caseId: newCaseId, date: "2026-09-20", time: "10:30", appointmentType: "Consultation" })).status === 200);
expect("a document can be requested",
  (await mk({ action: "document", title: "Passport bio page", clientId: created.json?.clientId, caseId: newCaseId, folder: "Identity" })).status === 200);
const msg = await mk({ action: "message", subject: "Your offer letter", to: "arun@example.test", body: "Please review the attached offer.", caseId: newCaseId, clientId: created.json?.clientId });
expect("a message draft can be saved", msg.status === 200, JSON.stringify(msg.json));
const inv = await mk({ action: "invoice", clientId: created.json?.clientId, caseId: newCaseId, amount: "1500", due: "2026-10-31" }, owner.cookie);
expect("a manager can raise an invoice", inv.status === 200, JSON.stringify(inv.json));
const invStaff = await mk({ action: "invoice", clientId: created.json?.clientId, caseId: newCaseId, amount: "10" });
expect("a case officer is told plainly they cannot raise an invoice",
  invStaff.status === 403 && /manager or administrator/i.test(invStaff.json?.error ?? ""),
  `${invStaff.status} ${JSON.stringify(invStaff.json)}`);
const tpl = await mk({ action: "template", name: "Offer acceptance", templateType: "Email", content: "Dear {{name}}" }, owner.cookie);
expect("a manager can create a template", tpl.status === 200, JSON.stringify(tpl.json));
const tplStaff = await mk({ action: "template", name: "Nope", templateType: "Email", content: "x" });
expect("a case officer is told plainly they cannot create a template",
  tplStaff.status === 403 && /manager or administrator/i.test(tplStaff.json?.error ?? ""),
  `${tplStaff.status} ${JSON.stringify(tplStaff.json)}`);
const wf = await mk({ action: "workflow", name: "Student visa 500", serviceType: "study_abroad", stages: "Enquiry,Documents,Lodged" }, owner.cookie);
expect("an owner can create a workflow", wf.status === 200, JSON.stringify(wf.json));
const wfStaff = await mk({ action: "workflow", name: "Nope", stages: "A" });
expect("a case officer cannot create a workflow", wfStaff.status === 403);
const role = await mk({ action: "role", name: "Senior Officer", scope: "assigned_cases" }, owner.cookie);
expect("an owner can create a staff role", role.status === 200, JSON.stringify(role.json));

section("Record updates and removal");
const ws6 = await call("/api/crm/workspace", { cookie: officer.cookie });
const task = ws6.json?.tasks?.[0];
const appointment = ws6.json?.appointments?.[0];
const document = ws6.json?.documents?.[0];
const message = ws6.json?.messages?.[0];
const invoice = ws6.json?.invoices?.[0];
const template = ws6.json?.templates?.[0];
const mutate = (resource, operation, id, extra = {}, cookie = officer.cookie) =>
  call("/api/crm/workspace", { method: "POST", cookie,
    body: { action: "mutate", resource, operation, id, ...extra } });
expect("a task can be completed", (await mutate("task", "toggle", task?.id, { completed: true })).status === 200);
expect("a manager can mark an invoice paid",
  (await mutate("invoice", "toggle", invoice?.id, { completed: true, amount: 1500 }, owner.cookie)).status === 200);
const invoiceByStaff = await mutate("invoice", "toggle", invoice?.id, { completed: true });
expect("a case officer cannot change an invoice", invoiceByStaff.status === 403,
  `${invoiceByStaff.status} ${JSON.stringify(invoiceByStaff.json)}`);
expect("a message draft can be marked ready", (await mutate("message", "toggle", message?.id, { completed: true })).status === 200);
expect("a document can be archived", (await mutate("document", "delete", document?.id)).status === 200);
expect("an appointment can be deleted", (await mutate("appointment", "delete", appointment?.id)).status === 200);
expect("a manager can void an invoice", (await mutate("invoice", "delete", invoice?.id, {}, owner.cookie)).status === 200);
expect("a manager can delete a template", (await mutate("template", "delete", template?.id, {}, owner.cookie)).status === 200);
expect("a task can be deleted", (await mutate("task", "delete", task?.id)).status === 200);
expect("a case can be archived", (await mutate("case", "archive", newCaseId)).status === 200);

section("Search");
const search = await call("/api/crm/search?q=Arun", { cookie: officer.cookie });
expect("search finds a client by name",
  search.status === 200 && (search.json?.results?.length ?? 0) > 0,
  `status ${search.status} ${JSON.stringify(search.json)?.slice(0, 200)}`);
const shortSearch = await call("/api/crm/search?q=a", { cookie: officer.cookie });
expect("a one-character search returns nothing", shortSearch.json?.results?.length === 0);

section("Administration");
const admin = await call("/api/crm/admin", { cookie: owner.cookie });
expect("administration data loads for the owner", admin.status === 200, JSON.stringify(admin.json)?.slice(0, 200));
const adminStaff = await call("/api/crm/admin", { cookie: officer.cookie });
expect("a case officer cannot open administration", adminStaff.status === 403);
const roleId = admin.json?.roles?.[0]?.id;
expect("a branch can be created", (await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_branch", name: "Sydney", code: "SYD", countryCode: "AU" } })).status === 200);
const invitation = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_invitation", email: "newstaff@maximus.test", roleId } });
expect("a staff invitation can be created", invitation.status === 200, JSON.stringify(invitation.json));
const profileUpdate = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "update_profile", profileId: "c0000000-0000-4000-8000-000000000003", department: "Visas" } });
expect("a staff profile can be updated", profileUpdate.status === 200, JSON.stringify(profileUpdate.json));
const selfDeactivate = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "update_profile", profileId: "c0000000-0000-4000-8000-000000000001", active: false } });
expect("an owner cannot deactivate their own account", selfDeactivate.status === 400);

section("Operations");
for (const view of ["notifications", "integrations", "report"]) {
  const r = await call(`/api/crm/operations?view=${view}`, { cookie: owner.cookie });
  expect(`operations view '${view}' loads`, r.status === 200, JSON.stringify(r.json)?.slice(0, 200));
}
const checklist = await call("/api/crm/operations", { method: "POST", cookie: officer.cookie,
  body: { action: "checklist_item", caseId: newCaseId, title: "Certified passport copy" } });
expect("a checklist item can be added", checklist.status === 200, JSON.stringify(checklist.json));
const checklistView = await call(`/api/crm/operations?view=checklist&caseId=${newCaseId}`, { cookie: officer.cookie });
expect("the checklist can be read back",
  checklistView.status === 200 && (checklistView.json?.data?.length ?? 0) > 0,
  JSON.stringify(checklistView.json)?.slice(0, 200));

const opsPost = (body, cookie = officer.cookie) =>
  call("/api/crm/operations", { method: "POST", cookie, body });
const noteAdd = await opsPost({ action: "case_note", caseId: newCaseId, body: "Client called about CoE." });
expect("a case note can be added", noteAdd.status === 200, JSON.stringify(noteAdd.json));
const notify = await opsPost({ action: "notify", recipientId: "c0000000-0000-4000-8000-000000000003",
  caseId: newCaseId, title: "Please review", kind: "general" });
expect("a colleague can be notified", notify.status === 200, JSON.stringify(notify.json));
const notes = await call("/api/crm/operations?view=notifications", { cookie: officer.cookie });
const firstNotification = notes.json?.data?.[0];
expect("a notification can be marked read",
  firstNotification
    ? (await opsPost({ action: "read_notification", id: firstNotification.id })).status === 200
    : false,
  `notifications=${notes.json?.data?.length}`);
const paidInvoice = ws6.json?.invoices?.[0];
const payment = paidInvoice
  ? await opsPost({ action: "record_payment", invoiceId: paidInvoice.id, amount: 500, method: "bank_transfer" }, owner.cookie)
  : { status: 0, json: { error: "no invoice to pay" } };
expect("a payment can be recorded", payment.status === 200, JSON.stringify(payment.json));
const queue = await opsPost({ action: "queue_integration", provider: "google_drive",
  operation: "create_folder", caseId: newCaseId, idempotencyKey: `audit-${Date.now()}` }, owner.cookie);
expect("an integration job can be queued", queue.status === 200, JSON.stringify(queue.json));

section("Client intake");
const intake = await call(`/api/crm/intake?clientId=${created.json?.clientId}`, { cookie: officer.cookie });
expect("the intake record loads", intake.status === 200, JSON.stringify(intake.json)?.slice(0, 200));
const intakeWrite = await call("/api/crm/intake", { method: "POST", cookie: officer.cookie,
  body: { action: "education", clientId: created.json?.clientId, institution: "Colombo University",
          qualification: "BSc", startedOn: "2018-02-01", completedOn: "2021-11-30" } });
expect("education history can be added", intakeWrite.status === 200, JSON.stringify(intakeWrite.json));

section("Imports and health");
const imports = await call("/api/crm/import", { cookie: owner.cookie });
expect("import batches load", imports.status === 200, JSON.stringify(imports.json)?.slice(0, 200));
const health = await call("/api/crm/health", { cookie: owner.cookie });
expect("the health check reports readiness", health.status === 200, JSON.stringify(health.json)?.slice(0, 200));
const healthStaff = await call("/api/crm/health", { cookie: officer.cookie });
expect("a case officer cannot read the health check", healthStaff.status === 403);

section("Client portal");
const portal = await call("/api/crm/workspace", { cookie: student.cookie });
expect("the portal loads for the client", portal.status === 200);
expect("the portal shows only the linked client's cases",
  (portal.json?.cases ?? []).every((c) => c.name === "Priya Sharma"),
  JSON.stringify(portal.json?.cases?.map((c) => c.name)));
const portalCreate = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "case", name: "Sneaky", email: "s@x.test", phone: "1", visaExpiry: "2027-01-01" } });
expect("the portal cannot create cases", portalCreate.status === 403);
const portalAdmin = await call("/api/crm/admin", { cookie: student.cookie });
expect("the portal cannot open administration", portalAdmin.status === 403);

section("Workflows");
const wsWorkflows = await call("/api/crm/workspace", { cookie: owner.cookie });
const workflow = wsWorkflows.json?.workflows?.find((w) => w.name === "Student visa 500");
expect("a created workflow comes back with its stages",
  workflow && Array.isArray(workflow.stages) && workflow.stages.length === 3,
  JSON.stringify(wsWorkflows.json?.workflows));
expect("a manager can deactivate a workflow",
  (await mutate("workflow", "toggle", workflow?.id, { active: false }, owner.cookie)).status === 200);
const wfStaffToggle = await mutate("workflow", "toggle", workflow?.id, { active: true });
expect("a case officer cannot change a workflow", wfStaffToggle.status === 403);
const wsAfter = await call("/api/crm/workspace", { cookie: owner.cookie });
expect("the deactivation was saved",
  wsAfter.json?.workflows?.find((w) => w.id === workflow?.id)?.active === false,
  JSON.stringify(wsAfter.json?.workflows));

section("Branch isolation");
const colombo = await login("colombo@maximus.test");
expect("the Colombo officer signs in", colombo.ok);
const colomboWs = await call("/api/crm/workspace", { cookie: colombo.cookie });
const colomboCases = (colomboWs.json?.cases ?? []).map((c) => c.name);
expect("the Colombo officer does not see Melbourne clients",
  !colomboCases.includes("Priya Sharma") && !colomboCases.includes("Arun Kumar"),
  JSON.stringify(colomboCases));
expect("the Colombo officer sees their own client", colomboCases.includes("Chamara Silva"),
  JSON.stringify(colomboCases));
const crossMove = await call("/api/crm/workspace", { method: "POST", cookie: colombo.cookie,
  body: { action: "lifecycle", caseId: newCaseId, stage: "visa" } });
expect("the Colombo officer cannot move a Melbourne case", crossMove.status >= 400,
  `${crossMove.status} ${JSON.stringify(crossMove.json)}`);
const crossSearch = await call("/api/crm/search?q=Priya", { cookie: colombo.cookie });
expect("search does not leak across branches",
  (crossSearch.json?.results ?? []).length === 0, JSON.stringify(crossSearch.json));

section("Remaining operations");
const checklistList = await call(`/api/crm/operations?view=checklist&caseId=${newCaseId}`, { cookie: officer.cookie });
const checklistItem = checklistList.json?.data?.[0];
expect("a checklist item can be completed",
  checklistItem
    ? (await opsPost({ action: "complete_checklist_item", id: checklistItem.id })).status === 200
    : false, JSON.stringify(checklistList.json)?.slice(0, 160));
const linkByStaff = await opsPost({ action: "link_client_account",
  profileId: "c0000000-0000-4000-8000-000000000004", clientId: created.json?.clientId });
expect("a case officer cannot link a portal account", linkByStaff.status === 403);
const badProvider = await opsPost({ action: "queue_integration", provider: "dropbox",
  operation: "sync", idempotencyKey: "x" }, owner.cookie);
expect("an unknown integration provider is refused", badProvider.status === 400);
const opsReport = await call("/api/crm/operations?view=report", { cookie: owner.cookie });
expect("the operations report totals finance",
  typeof opsReport.json?.data?.finance?.total === "number",
  JSON.stringify(opsReport.json?.data?.finance));

section("Remaining intake");
const clientId = created.json?.clientId;
for (const [label, body] of [
  ["personal details", { action: "personal", clientId, gender: "Male", nationality: "Sri Lankan", dateOfBirth: "1998-04-12", privacyConsent: true }],
  ["employment history", { action: "employment", clientId, employer: "Acme Ltd", jobTitle: "Analyst", startedOn: "2022-01-10" }],
  ["an English test", { action: "english_test", clientId, testType: "IELTS", testDate: "2026-03-01", overall: 7.5 }],
  ["study preferences", { action: "study_preferences", clientId, destinationCountries: ["AU"], studyLevels: ["Masters"], annualBudget: 42000 }],
  ["visa history", { action: "visa_history", clientId, countryCode: "AU", visaType: "500", status: "granted", grantedOn: "2024-02-01" }],
  ["a declaration", { action: "declaration", clientId, declarationType: "character", response: true }],
  ["a service agreement", { action: "agreement", clientId, agreementType: "representation", version: "v1" }],
]) {
  const r = await call("/api/crm/intake", { method: "POST", cookie: officer.cookie, body });
  expect(`intake accepts ${label}`, r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
}
const intakeAfter = await call(`/api/crm/intake?clientId=${clientId}`, { cookie: officer.cookie });
expect("intake completeness is scored",
  typeof intakeAfter.json?.completeness === "number" && intakeAfter.json.completeness > 0,
  `completeness=${intakeAfter.json?.completeness}`);

section("Remaining administration");
const adminNow = await call("/api/crm/admin", { cookie: owner.cookie });
const branchId = adminNow.json?.branches?.[0]?.id;
const anyRole = adminNow.json?.roles?.[0]?.id;
expect("a role can be assigned to a profile",
  (await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
    body: { action: "assign_role", profileId: "c0000000-0000-4000-8000-000000000003", roleId: anyRole, branchId } })).status === 200);
expect("a permission can be set",
  (await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
    body: { action: "set_permission", roleId: anyRole, resource: "cases", permissionAction: "view_assigned" } })).status === 200);
expect("a branch can be renamed",
  (await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
    body: { action: "update_branch", branchId, name: "Melbourne CBD" } })).status === 200);
const managerAssignRole = await call("/api/crm/admin", { method: "POST", cookie: manager.cookie,
  body: { action: "assign_role", profileId: "c0000000-0000-4000-8000-000000000003", roleId: anyRole, branchId } });
expect("a branch manager cannot assign roles", managerAssignRole.status === 403);

section("Legacy import");
const validate = await call("/api/crm/import", { method: "POST", cookie: owner.cookie,
  body: { action: "validate", sourceSystem: "legacy_maximus", fileName: "students.csv",
    rows: [
      { crm_id: "L-1", first_name: "Nimal", last_name: "Fernando", email: "nimal@example.test", mobile: "+94770000001" },
      { crm_id: "L-2", first_name: "", last_name: "", email: "not-an-email", mobile: "" },
    ] } });
expect("a legacy export imports without Supabase branch ids",
  validate.status === 200 && validate.json?.valid === 1 && validate.json?.invalid === 1,
  JSON.stringify(validate.json)?.slice(0, 260));
const byCode = await call("/api/crm/import", { method: "POST", cookie: owner.cookie,
  body: { action: "validate", fileName: "colombo.csv",
    rows: [{ crm_id: "L-3", first_name: "Ayesha", last_name: "Perera",
             email: "ayesha@example.test", branch_code: "CMB" }] } });
expect("a row naming its branch by code is accepted",
  byCode.status === 200 && byCode.json?.valid === 1,
  JSON.stringify(byCode.json)?.slice(0, 240));
const noBranch = await call("/api/crm/import", { method: "POST", cookie: manager.cookie,
  body: { action: "validate", fileName: "x.csv",
    rows: [{ first_name: "A", last_name: "B", branch_code: "NOPE" }] } });
expect("an unknown branch code still falls back to the importer's branch",
  noBranch.status === 200 && noBranch.json?.valid === 1,
  JSON.stringify(noBranch.json)?.slice(0, 240));

section("Sign out");
const out = await call("/api/auth/logout", { method: "POST", cookie: owner.cookie });
expect("sign out succeeds", out.status === 200);

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log(`\n${"=".repeat(64)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`\n${failed.length} FAILING:`);
  for (const f of failed) console.log(`  [${f.group}] ${f.name}\n      ${f.detail ?? ""}`);
}
process.exit(failed.length ? 1 : 0);
