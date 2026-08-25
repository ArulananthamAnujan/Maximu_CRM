// Drives the built Worker against a real PostgreSQL database (through the
// PostgREST shim) as each role, exercising every feature the CRM offers.
const SHIM = process.env.SHIM_URL ?? "http://127.0.0.1:8099";
const workerUrl = new URL(process.env.WORKER_ENTRY ?? "../../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("audit", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const { readFileSync } = await import("node:fs");
const env = {
  SUPABASE_URL: SHIM,
  SUPABASE_PUBLISHABLE_KEY: "audit-key",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY_FILE
    ? readFileSync(process.env.GOOGLE_PRIVATE_KEY_FILE, "utf8")
    : undefined,
  GOOGLE_SHARED_DRIVE_ID: process.env.GOOGLE_SHARED_DRIVE_ID,
  FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY,
  // Present so the service-role path of staff creation is exercised. The shim
  // requires it on the admin endpoints exactly as Supabase does.
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ASSETS: { fetch: async () => new Response("", { status: 404 }) },
};
const DRIVE_STUB = process.env.DRIVE_STUB_URL;
const RESEND_STUB = process.env.RESEND_STUB_URL;
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
expect("a case officer can raise an invoice for their own case",
  invStaff.status === 200, `${invStaff.status} ${JSON.stringify(invStaff.json)}`);
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
const refundByStaff = await mutate("invoice", "refund", invoice?.id, { amount: 1500 });
expect("a case officer cannot refund an invoice", refundByStaff.status === 403,
  `${refundByStaff.status} ${JSON.stringify(refundByStaff.json)}`);
expect("a manager can refund a paid invoice",
  (await mutate("invoice", "refund", invoice?.id, { amount: 1500 }, owner.cookie)).status === 200);
const ws6b = await call("/api/crm/workspace", { cookie: owner.cookie });
const refunded = (ws6b.json?.invoices ?? []).find((row) => row.id === invoice?.id);
expect("the refunded invoice shows as refunded, not unpaid",
  refunded?.status === "Refunded", JSON.stringify(refunded));
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
// Staff & Masters must see the same branches the rest of the CRM already
// works with -- the seeded branch is used by cases and by reporting, and has
// to appear here too rather than showing "No branches yet".
const workspaceForBranches = await call("/api/crm/workspace", { cookie: owner.cookie });
expect("Staff & Masters lists the branch the rest of the CRM already uses",
  (admin.json?.branches ?? []).length > 0 &&
    (admin.json?.branches ?? []).some((b) =>
      (workspaceForBranches.json?.branches ?? []).some((wb) => wb.id === b.id)),
  JSON.stringify({ admin: admin.json?.branches, workspace: workspaceForBranches.json?.branches })?.slice(0, 300));
const adminStaff = await call("/api/crm/admin", { cookie: officer.cookie });
expect("a case officer cannot open administration", adminStaff.status === 403);
const roleId = admin.json?.roles?.[0]?.id;
expect("a branch can be created", (await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_branch", name: "Sydney", code: "SYD", countryCode: "AU" } })).status === 200);
// Opening a new branch is an organisation-structural decision; a branch
// manager runs their own branch, not the organisation's shape.
const managerBranch = await call("/api/crm/admin", { method: "POST", cookie: manager.cookie,
  body: { action: "create_branch", name: "Rogue Branch", code: "RGE", countryCode: "AU" } });
expect("a branch manager cannot add a branch", managerBranch.status === 403,
  JSON.stringify(managerBranch.json));
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
const claimByStaff = await opsPost({ action: "create_commission_claim",
  partnerName: "Rogue Partner", expectedAmount: 500 });
expect("a case officer cannot raise a commission claim", claimByStaff.status === 403,
  `${claimByStaff.status} ${JSON.stringify(claimByStaff.json)}`);
const claim = await opsPost({ action: "create_commission_claim",
  partnerName: "Study Partners Pty Ltd", institution: "Monash University", expectedAmount: 2200 }, owner.cookie);
expect("a manager can raise a commission claim", claim.status === 200, JSON.stringify(claim.json));
const wsClaims = await call("/api/crm/workspace", { cookie: owner.cookie });
const raisedClaim = (wsClaims.json?.commissionClaims ?? [])
  .find((row) => row.partnerName === "Study Partners Pty Ltd");
expect("the raised claim is on the workspace", Boolean(raisedClaim), JSON.stringify(wsClaims.json?.commissionClaims)?.slice(0, 200));
expect("a case officer cannot see commission claims",
  (await call("/api/crm/workspace", { cookie: officer.cookie })).json?.commissionClaims?.length === 0);
const receiveByStaff = await opsPost({ action: "record_commission_received", claimId: raisedClaim?.id, receivedAmount: 2200 });
expect("a case officer cannot record a commission receipt", receiveByStaff.status === 403);
const received = await opsPost({ action: "record_commission_received",
  claimId: raisedClaim?.id, receivedAmount: 2200 }, owner.cookie);
expect("a manager can record a commission receipt", received.status === 200, JSON.stringify(received.json));
const queue = await opsPost({ action: "queue_integration", provider: "google_drive",
  operation: "create_folder", caseId: newCaseId, idempotencyKey: `audit-${Date.now()}` }, owner.cookie);
expect("an integration job can be queued", queue.status === 200, JSON.stringify(queue.json));

section("Course Finder");
const cfByStaff = await call("/api/crm/course-finder", { cookie: officer.cookie });
expect("staff can browse Course Finder", cfByStaff.status === 200, JSON.stringify(cfByStaff.json)?.slice(0, 200));
const cfByClient = await call("/api/crm/course-finder", { cookie: student.cookie });
expect("a client cannot reach Course Finder", cfByClient.status === 403);
const cfCreateByStaff = await call("/api/crm/course-finder", { method: "POST", cookie: officer.cookie,
  body: { action: "create_institution", name: "Rogue University", country: "AU" } });
expect("staff cannot add an institution", cfCreateByStaff.status === 403,
  `${cfCreateByStaff.status} ${JSON.stringify(cfCreateByStaff.json)}`);

const institution = await call("/api/crm/course-finder", { method: "POST", cookie: owner.cookie,
  body: { action: "create_institution", name: "Monash University", country: "Australia", city: "Melbourne" } });
expect("a manager can add an institution", institution.status === 200, JSON.stringify(institution.json));
const cfAfter = await call("/api/crm/course-finder", { cookie: officer.cookie });
const addedInstitution = (cfAfter.json?.institutions ?? []).find((row) => row.name === "Monash University");
expect("the institution is visible to staff", Boolean(addedInstitution), JSON.stringify(cfAfter.json?.institutions)?.slice(0, 200));
const course = await call("/api/crm/course-finder", { method: "POST", cookie: owner.cookie,
  body: { action: "create_course", institutionId: addedInstitution?.id,
    name: "Master of Information Technology", level: "Master's", tuitionFee: 42000 } });
expect("a manager can add a course", course.status === 200, JSON.stringify(course.json));
const cfWithCourse = await call("/api/crm/course-finder", { cookie: officer.cookie });
expect("the course is on the list",
  (cfWithCourse.json?.courses ?? []).some((row) => row.name === "Master of Information Technology"),
  JSON.stringify(cfWithCourse.json?.courses)?.slice(0, 200));

const notesView = await call(`/api/crm/operations?view=notes&caseId=${newCaseId}`, { cookie: officer.cookie });
expect("case notes can be read back",
  notesView.status === 200 && (notesView.json?.data?.length ?? 0) > 0,
  JSON.stringify(notesView.json)?.slice(0, 200));
const portalNotes = await call(`/api/crm/operations?view=notes&caseId=${newCaseId}`, { cookie: student.cookie });
expect("the client portal cannot read case notes", portalNotes.status === 403,
  `${portalNotes.status} ${JSON.stringify(portalNotes.json)}`);

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

section("Case file");
const fileNow = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
expect("the case file loads", fileNow.status === 200, JSON.stringify(fileNow.json)?.slice(0, 200));
expect("the case file carries the client and intake",
  fileNow.json?.client?.first_name === "Arun" &&
    Array.isArray(fileNow.json?.intake?.education),
  JSON.stringify(fileNow.json?.client)?.slice(0, 160));
expect("the timeline merges notes, stage changes and audited actions",
  (fileNow.json?.timeline ?? []).some((e) => e.kind === "stage") &&
    (fileNow.json?.timeline ?? []).some((e) => e.kind === "note"),
  JSON.stringify((fileNow.json?.timeline ?? []).map((e) => e.kind).slice(0, 8)));

const casefile = (body, cookie = officer.cookie) =>
  call("/api/crm/casefile", { method: "POST", cookie, body });

section("Applications module");
for (const institution of ["Monash University", "RMIT University", "Deakin University"]) {
  const r = await casefile({ action: "application_create", caseId: newCaseId,
    institution, course: "Master of IT", intake: "February 2027", status: "draft" });
  expect(`an application to ${institution} can be added`, r.status === 200, JSON.stringify(r.json));
}
const withApps = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
expect("a student can hold several applications at once",
  (withApps.json?.applications ?? []).length === 3,
  `${(withApps.json?.applications ?? []).length} applications`);
const firstApp = withApps.json?.applications?.[0];
const advanced = await casefile({ action: "application_update", id: firstApp?.id, status: "offer_received" });
expect("an application status can be advanced", advanced.status === 200, JSON.stringify(advanced.json));
const afterAdvance = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const advancedRow = afterAdvance.json?.applications?.find((a) => a.id === firstApp?.id);
expect("advancing to offer received stamps the offer date",
  advancedRow?.status === "offer_received" && Boolean(advancedRow?.offer_received_at),
  JSON.stringify(advancedRow)?.slice(0, 180));
const badStatus = await casefile({ action: "application_update", id: firstApp?.id, status: "invented" });
expect("an unknown application status is refused", badStatus.status === 400);
expect("an application is withdrawn with a reason, not deleted",
  (await casefile({ action: "application_archive", id: firstApp?.id,
    outcome: "withdrawn", reason: "Offer declined" })).status === 200);

section("Deferral");
// A student defers to a later intake. That is an application status with a new
// intake, not a phrase typed into a free-text box.
const deferTarget = withApps.json?.applications?.find(
  (a) => a.institution === "RMIT University");
const deferred = await casefile({ action: "application_update", id: deferTarget?.id,
  status: "deferred", intake: "July 2027" });
expect("an application can be deferred to a later intake", deferred.status === 200,
  JSON.stringify(deferred.json));
const deferFile = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const deferredRow = deferFile.json?.applications?.find((a) => a.id === deferTarget?.id);
expect("the deferral keeps the application on the file with its new intake",
  deferredRow?.status === "deferred" && deferredRow?.intake === "July 2027" &&
    !deferredRow?.archived_at,
  JSON.stringify(deferredRow)?.slice(0, 220));
const deferWs = await call("/api/crm/workspace", { cookie: officer.cookie });
const deferCase = deferWs.json?.cases?.find((c) => c.dbId === newCaseId);
expect("the case is reported as deferred without matching text",
  deferCase?.deferredApplications === 1,
  `deferredApplications=${deferCase?.deferredApplications}`);
const deferReport = await call("/api/crm/reports", { cookie: owner.cookie });
expect("deferrals are counted in reporting",
  deferReport.json?.report?.conversion?.deferred >= 1,
  JSON.stringify(deferReport.json?.report?.conversion));
const deferTimeline = (deferFile.json?.timeline ?? []).find(
  (e) => e.kind === "application.status_changed" && /deferred/i.test(e.title ?? ""));
expect("the deferral is recorded on the timeline", Boolean(deferTimeline),
  JSON.stringify(deferFile.json?.timeline?.slice(0, 3)));
// The student later resumes.
const resumed = await casefile({ action: "application_update", id: deferTarget?.id,
  status: "submitted" });
expect("a deferred application can be resumed", resumed.status === 200, JSON.stringify(resumed.json));
const resumedWs = await call("/api/crm/workspace", { cookie: officer.cookie });
expect("the case leaves the deferred list once resumed",
  resumedWs.json?.cases?.find((c) => c.dbId === newCaseId)?.deferredApplications === 0,
  JSON.stringify(resumedWs.json?.cases?.find((c) => c.dbId === newCaseId))?.slice(0, 200));

section("Visa matter workspace");
const visaSave = await casefile({ action: "visa_matter_save", caseId: newCaseId,
  destinationCountry: "AU", subclass: "482", stream: "Core Skills", status: "lodged",
  marn: "1234567", lodgementReference: "LOD-99", trn: "EGO123456789",
  bridgingVisa: "BVA", currentVisaExpiry: "2027-09-30",
  healthExamination: "completed", biometrics: "requested",
  policeClearance: "in_progress", skillsAssessment: "completed",
  lodgedAt: "2026-08-01", informationRequestedAt: "2026-09-01",
  informationDueAt: "2026-09-28", conditions: ["8105", "8501"] });
expect("a visa matter can be recorded", visaSave.status === 200, JSON.stringify(visaSave.json));
const withVisa = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const matter = withVisa.json?.visaMatter;
expect("the visa matter keeps subclass, MARN, TRN and the s56 deadline",
  matter?.visa_subclass === "482" && matter?.responsible_agent_marn === "1234567" &&
    matter?.trn === "EGO123456789" && Boolean(matter?.information_due_at),
  JSON.stringify(matter)?.slice(0, 240));
expect("visa conditions are stored as a list",
  Array.isArray(matter?.visa_conditions) && matter.visa_conditions.includes("8105"),
  JSON.stringify(matter?.visa_conditions));
const visaAgain = await casefile({ action: "visa_matter_save", caseId: newCaseId,
  destinationCountry: "AU", subclass: "482", status: "decision", outcome: "granted" });
expect("saving again updates rather than duplicating", visaAgain.status === 200);
const afterPartial = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const partial = afterPartial.json?.visaMatter;
expect("a partial save leaves untouched fields alone",
  partial?.lodged_at && partial?.trn === "EGO123456789" &&
    partial?.responsible_agent_marn === "1234567",
  JSON.stringify(partial)?.slice(0, 240));
const afterVisa = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
expect("there is still exactly one visa matter",
  afterVisa.json?.visaMatter?.outcome === "granted",
  JSON.stringify(afterVisa.json?.visaMatter)?.slice(0, 160));
const badCheck = await casefile({ action: "visa_matter_save", caseId: newCaseId,
  destinationCountry: "AU", healthExamination: "maybe" });
expect("an unknown check status is refused", badCheck.status === 400);

section("Family and dependants");
for (const [relationship, name] of [["spouse", "Meera Kumar"], ["child", "Aarav Kumar"],
                                    ["child", "Anika Kumar"], ["parent", "Suresh Kumar"]]) {
  const r = await casefile({ action: "dependant_create", clientId: created.json?.clientId,
    relationship, fullName: name, dateOfBirth: "1995-05-05", passportNumber: "P123", included: true });
  expect(`a ${relationship} can be added as a dependant`, r.status === 200, JSON.stringify(r.json));
}
const withFamily = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
expect("a family is not limited to one spouse and one child",
  (withFamily.json?.dependants ?? []).length === 4,
  `${(withFamily.json?.dependants ?? []).length} dependants`);
const badRelationship = await casefile({ action: "dependant_create",
  clientId: created.json?.clientId, relationship: "cousin-in-law", fullName: "X" });
expect("an unknown relationship is refused", badRelationship.status === 400);
expect("a dependant is archived with a reason, not deleted",
  (await casefile({ action: "dependant_archive", id: withFamily.json?.dependants?.[0]?.id,
    reason: "Added in error" })).status === 200);

section("Service stream and matter type");
const streamCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Sunil Rathnayake", phone: "+61400000004",
          email: "sunil@example.test", visaExpiry: "2027-05-31",
          workspace: "Direct Visa", matterType: "Partner visa 820/801" } });
expect("a migration case can be created", streamCase.status === 200, JSON.stringify(streamCase.json));
const streamWs = await call("/api/crm/workspace", { cookie: officer.cookie });
const sunil = streamWs.json?.cases?.find((c) => c.name === "Sunil Rathnayake");
expect("the matter type survives and is shown, not the stream",
  sunil?.matterType === "Partner visa 820/801" && sunil?.type === "Partner visa 820/801",
  JSON.stringify(sunil)?.slice(0, 200));
expect("the service stream is recorded separately",
  sunil?.serviceType === "direct_visa", `serviceType=${sunil?.serviceType}`);
const reEdit = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "update_case", caseId: sunil?.dbId, clientId: sunil?.clientId,
          name: "Sunil Rathnayake", email: "sunil@example.test", phone: "+61400000004",
          visaExpiry: "2027-05-31", workspace: "Direct Visa",
          matterType: "Partner visa 820/801" } });
expect("editing does not reclassify the case", reEdit.status === 200, JSON.stringify(reEdit.json));
const afterEdit = await call("/api/crm/workspace", { cookie: officer.cookie });
const sunilAfter = afterEdit.json?.cases?.find((c) => c.name === "Sunil Rathnayake");
expect("the matter type and stream are unchanged by an edit",
  sunilAfter?.matterType === "Partner visa 820/801" &&
    sunilAfter?.serviceType === "direct_visa",
  JSON.stringify(sunilAfter)?.slice(0, 200));

// A "Student visa" matter is study abroad, not migration. Classifying by the
// matter label put such a case in the wrong list.
const studyVisa = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Tashi Dorji", phone: "+61400000005",
          email: "tashi@example.test", visaExpiry: "2027-07-31",
          workspace: "Study Abroad", matterType: "Student visa" } });
expect("a student visa case can be created in the study stream", studyVisa.status === 200,
  JSON.stringify(studyVisa.json));
const streamCheck = await call("/api/crm/workspace", { cookie: officer.cookie });
const tashi = streamCheck.json?.cases?.find((c) => c.name === "Tashi Dorji");
expect("a Student visa matter stays in the study abroad stream",
  tashi?.serviceType === "study_abroad" && tashi?.matterType === "Student visa",
  JSON.stringify(tashi)?.slice(0, 200));

section("Retention defaults");
const retention = await call("/api/crm/operations?view=report", { cookie: owner.cookie });
expect("the operations report still loads with the new schema", retention.status === 200);
const health2 = await call("/api/crm/health", { cookie: owner.cookie });
expect("seven-year retention rules are configured",
  Number(health2.json?.readiness?.retention_rules ?? 0) >= 4,
  JSON.stringify(health2.json?.readiness));

section("Document storage");
const storageWs = await call("/api/crm/workspace", { cookie: officer.cookie });
expect("the CRM reports the Shared Drive as connected",
  storageWs.json?.capabilities?.documentStorage === true,
  JSON.stringify(storageWs.json?.capabilities));

const docRequest = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "document", title: "Passport bio page", clientId: created.json?.clientId,
          caseId: newCaseId, folder: "01 Personal and Identity" } });
expect("a document can be requested", docRequest.status === 200, JSON.stringify(docRequest.json));
const fileAfterRequest = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const passport = (fileAfterRequest.json?.documents ?? []).find(
  (d) => d.display_name === "Passport bio page");
expect("a requested document starts with no stored file",
  passport && passport.state === "requested" && !passport.drive_file_id,
  JSON.stringify(passport)?.slice(0, 200));

// Upload goes through the Worker exactly as the browser sends it.
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xc2, 0xa5, 0x0a]);
async function upload(documentId, bytes, name, mime, cookie = officer.cookie) {
  const body = new FormData();
  body.append("documentId", documentId ?? "");
  body.append("file", new File([bytes], name, { type: mime }));
  const response = await worker.fetch(
    new Request("https://crm.test/api/crm/documents", {
      method: "POST", headers: { cookie }, body }), env, ctx);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, json, text };
}

const stored = await upload(passport?.id, PDF_BYTES, "passport.pdf", "application/pdf");
expect("a file can be stored in the Shared Drive", stored.status === 200,
  JSON.stringify(stored.json ?? stored.text)?.slice(0, 240));

const driveState = await (await fetch(`${DRIVE_STUB}/__state`)).json();
expect("the client's folder was created and the document filed under the plan",
  driveState.folders.some((f) => f.name.includes("Arun Kumar")) &&
    driveState.folders.some((f) => f.name === "01 Personal and Identity"),
  JSON.stringify(driveState.folders.map((f) => f.name)).slice(0, 240));
expect("only the folders actually used are created",
  driveState.folders.length <= 3,
  `${driveState.folders.length} folders: ${JSON.stringify(driveState.folders.map((f) => f.name))}`);
expect("the file reached the drive with its bytes intact",
  driveState.files.length === 1 && driveState.files[0].size === PDF_BYTES.length,
  JSON.stringify(driveState.files));

const fileAfterUpload = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const uploaded = (fileAfterUpload.json?.documents ?? []).find((d) => d.id === passport?.id);
expect("the document records the drive file, size and checksum",
  uploaded?.state === "uploaded" && Boolean(uploaded?.drive_file_id) &&
    Number(uploaded?.size_bytes) === PDF_BYTES.length &&
    typeof uploaded?.checksum === "string" && uploaded.checksum.length === 64,
  JSON.stringify(uploaded)?.slice(0, 260));

// Download must return exactly what went in.
const downloaded = await worker.fetch(
  new Request(`https://crm.test/api/crm/documents?documentId=${passport?.id}`, {
    headers: { cookie: officer.cookie } }), env, ctx);
const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer());
expect("the stored file can be downloaded byte for byte",
  downloaded.status === 200 &&
    downloadedBytes.length === PDF_BYTES.length &&
    downloadedBytes.every((byte, index) => byte === PDF_BYTES[index]),
  `status ${downloaded.status}, ${downloadedBytes.length} bytes`);

// Replacing supersedes rather than orphaning.
const REPLACEMENT = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x41, 0x42]);
const replaced = await upload(passport?.id, REPLACEMENT, "passport-v2.pdf", "application/pdf");
expect("a stored file can be replaced", replaced.status === 200, JSON.stringify(replaced.json));
const afterReplace = await (await fetch(`${DRIVE_STUB}/__state`)).json();
expect("the superseded file is binned, not orphaned",
  afterReplace.files.filter((f) => f.trashed).length === 1 &&
    afterReplace.files.filter((f) => !f.trashed).length === 1,
  JSON.stringify(afterReplace.files.map((f) => ({ n: f.name, t: f.trashed }))));

// MAX_UPLOAD_MB is lowered to 0.5MB for this run so the same guard runs on a
// small file. An in-process Request with a chunked FormData body of 1MB or more
// stalls in Node -- a limitation of driving the Worker directly, not of the
// Worker: raw bytes and JSON of the same size are served normally, and a real
// upload arrives with a length or as a runtime-managed stream.
const tooBig = await upload(passport?.id, new Uint8Array(700 * 1024), "big.pdf", "application/pdf");
expect("an oversized file is refused with the limit named",
  tooBig.status === 400 && /512KB/.test(tooBig.json?.error ?? ""),
  `${tooBig.status} ${JSON.stringify(tooBig.json)}`);
const wrongType = await upload(passport?.id, PDF_BYTES, "payload.exe", "application/x-msdownload");
expect("an unaccepted file type is refused", wrongType.status === 400,
  `${wrongType.status} ${JSON.stringify(wrongType.json)}`);
const portalUpload = await upload(passport?.id, PDF_BYTES, "p.pdf", "application/pdf", student.cookie);
expect("a portal account cannot store files", portalUpload.status === 403,
  `${portalUpload.status} ${JSON.stringify(portalUpload.json)}`);
// The negative case below proves isolation. This proves the feature actually
// works: a client supplies a document that was requested of them, and staff
// then see it stored.
const ownCases = await call("/api/crm/workspace", { cookie: student.cookie });
const ownCase = ownCases.json?.cases?.[0];
const askedOfClient = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "document", title: "Your passport bio page",
          clientId: ownCase?.clientId, caseId: ownCase?.dbId, folder: "01 Personal and Identity" } });
expect("staff can request a document from a client", askedOfClient.status === 200,
  JSON.stringify(askedOfClient.json));
const ownFile = await call(`/api/crm/casefile?caseId=${ownCase?.dbId}`, { cookie: officer.cookie });
const askedDoc = (ownFile.json?.documents ?? []).find(
  (d) => d.display_name === "Your passport bio page");
const clientUpload = await upload(askedDoc?.id, PDF_BYTES, "my-passport.pdf",
  "application/pdf", student.cookie);
expect("a client can supply a document requested of them",
  clientUpload.status === 200, `${clientUpload.status} ${JSON.stringify(clientUpload.json ?? clientUpload.text)?.slice(0, 220)}`);
const afterClientUpload = await call(`/api/crm/casefile?caseId=${ownCase?.dbId}`, { cookie: officer.cookie });
const suppliedDoc = (afterClientUpload.json?.documents ?? []).find((d) => d.id === askedDoc?.id);
const clientTimeline = (afterClientUpload.json?.timeline ?? []).map((e) => e.kind);
expect("the client's upload is recorded on the case timeline",
  clientTimeline.includes("document.uploaded"),
  JSON.stringify([...new Set(clientTimeline)]).slice(0, 200));
expect("staff see the client's document as stored",
  suppliedDoc?.state === "uploaded" && Boolean(suppliedDoc?.drive_file_id) &&
    Number(suppliedDoc?.size_bytes) === PDF_BYTES.length,
  JSON.stringify(suppliedDoc)?.slice(0, 240));
const clientDownload = await worker.fetch(
  new Request(`https://crm.test/api/crm/documents?documentId=${askedDoc?.id}`, {
    headers: { cookie: student.cookie } }), env, ctx);
expect("the client can download back what they supplied", clientDownload.status === 200,
  `status ${clientDownload.status}`);
const reUpload = await upload(askedDoc?.id, PDF_BYTES, "again.pdf", "application/pdf", student.cookie);
expect("a client cannot replace a document already provided", reUpload.status === 403,
  `${reUpload.status} ${JSON.stringify(reUpload.json)}`);

const crossBranchDownload = await worker.fetch(
  new Request(`https://crm.test/api/crm/documents?documentId=${passport?.id}`, {
    headers: { cookie: (await login("colombo@maximus.test")).cookie } }), env, ctx);
expect("another branch cannot download the file", crossBranchDownload.status === 403,
  `status ${crossBranchDownload.status}`);

section("Protected passport numbers");
const depWithPassport = await casefile({ action: "dependant_create",
  clientId: created.json?.clientId, relationship: "spouse",
  fullName: "Lakshmi Kumar", dateOfBirth: "1995-05-05",
  passportNumber: "N1234567", nationality: "Indian", included: true });
expect("a dependant passport can be recorded", depWithPassport.status === 200,
  JSON.stringify(depWithPassport.json));
const familyFile = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const meera = (familyFile.json?.dependants ?? []).find((d) => d.full_name === "Lakshmi Kumar");
expect("only a masked passport reaches the browser",
  meera?.passport_masked === "N12••••7" &&
    !("passport_number_encrypted" in (meera ?? {})),
  JSON.stringify(meera)?.slice(0, 220));
expect("the plain passport number is never returned",
  !JSON.stringify(familyFile.json).includes("N1234567"),
  "the raw number appeared in the case file response");
const revealByStaff = await casefile({ action: "reveal_passport", subject: "dependant", id: meera?.id });
expect("a case officer cannot reveal a passport number", revealByStaff.status === 403,
  `${revealByStaff.status} ${JSON.stringify(revealByStaff.json)}`);
const revealByOwner = await casefile(
  { action: "reveal_passport", subject: "dependant", id: meera?.id }, owner.cookie);
expect("a manager can reveal it, and gets the real number back",
  revealByOwner.status === 200 && revealByOwner.json?.passportNumber === "N1234567",
  `${revealByOwner.status} ${JSON.stringify(revealByOwner.json)?.slice(0, 120)}`);

section("Archive rather than delete");
const appsNow = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const liveApp = appsNow.json?.applications?.[0];
const noReason = await casefile({ action: "application_archive", id: liveApp?.id });
expect("withdrawing without a reason is refused", noReason.status === 400,
  JSON.stringify(noReason.json));
const withdrawn = await casefile({ action: "application_archive", id: liveApp?.id,
  outcome: "withdrawn", reason: "Student chose another institution" });
expect("an application can be withdrawn with a reason", withdrawn.status === 200,
  JSON.stringify(withdrawn.json));
const afterWithdraw = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const archivedApp = afterWithdraw.json?.applications?.find((a) => a.id === liveApp?.id);
expect("the withdrawn application stays on the file with who, when and why",
  archivedApp && archivedApp.status === "withdrawn" && archivedApp.archived_at &&
    archivedApp.archived_by && /another institution/.test(archivedApp.archive_reason ?? ""),
  JSON.stringify(archivedApp)?.slice(0, 240));
const depArchived = await casefile({ action: "dependant_archive", id: meera?.id,
  reason: "Not included in this application" });
expect("a dependant is archived rather than deleted", depArchived.status === 200,
  JSON.stringify(depArchived.json));

section("Case file audit trail");
const timelineFile = await call(`/api/crm/casefile?caseId=${newCaseId}`, { cookie: officer.cookie });
const kinds = (timelineFile.json?.timeline ?? []).map((entry) => entry.kind);
for (const kind of [
  "application.created",
  "application.status_changed",
  "application.archived",
  "visa.outcome_changed",
  "dependant.added",
  "dependant.archived",
  "passport.revealed",
]) expect(`the timeline records ${kind}`, kinds.includes(kind),
  JSON.stringify([...new Set(kinds)]).slice(0, 300));
const outcomeEntry = (timelineFile.json?.timeline ?? []).find(
  (entry) => entry.kind === "visa.outcome_changed");
expect("a visa outcome change names the outcome", /granted/i.test(outcomeEntry?.title ?? ""),
  JSON.stringify(outcomeEntry));

section("Client portal actions");
const portalCases = await call("/api/crm/workspace", { cookie: student.cookie });
const portalCase = portalCases.json?.cases?.[0];
const requested = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "appointment_request", caseId: portalCase?.dbId,
          title: "Question about my visa", date: "2027-01-15", time: "10:00" } });
expect("a client can request an appointment", requested.status === 200,
  JSON.stringify(requested.json));
// The point of a request is that someone is told about it.
const ownerAlerts = await call("/api/crm/operations?view=notifications", { cookie: officer.cookie });
expect("the case owner is notified of a client's appointment request",
  (ownerAlerts.json?.data ?? []).some((n) => n.kind === "appointment_requested"),
  JSON.stringify((ownerAlerts.json?.data ?? []).map((n) => n.kind)).slice(0, 200));
const pastRequest = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "appointment_request", caseId: portalCase?.dbId, title: "x", date: "2020-01-01" } });
expect("a request in the past is refused", pastRequest.status === 400,
  JSON.stringify(pastRequest.json));
const otherCaseRequest = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "appointment_request", caseId: newCaseId, title: "x", date: "2027-01-15" } });
expect("a client cannot request against another client's case",
  otherCaseRequest.status === 403, JSON.stringify(otherCaseRequest.json));
const stillBlocked = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "task", title: "nope" } });
expect("the portal still cannot create staff records", stillBlocked.status === 403);

section("Assignment at intake");
const assignedCase = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Hasini Silva", phone: "+61400000006",
          email: "hasini@example.test", visaExpiry: "2027-04-30",
          workspace: "Study Abroad", matterType: "Student admission",
          ownerId: "c0000000-0000-4000-8000-000000000003" } });
expect("a case can be assigned at intake", assignedCase.status === 200,
  JSON.stringify(assignedCase.json));
const assignedWs = await call("/api/crm/workspace", { cookie: owner.cookie });
const hasini = assignedWs.json?.cases?.find((c) => c.name === "Hasini Silva");
expect("the chosen staff member actually owns the case",
  hasini?.ownerId === "c0000000-0000-4000-8000-000000000003" &&
    hasini?.owner === "Olivia Officer",
  JSON.stringify(hasini)?.slice(0, 200));
const badOwner = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Bad Owner", phone: "1", email: "b@x.test",
          visaExpiry: "2027-01-01", ownerId: "c0000000-0000-4000-8000-000000000004" } });
expect("a case cannot be assigned to a portal account at intake",
  badOwner.status === 400, JSON.stringify(badOwner.json));

section("Agency reporting");
const reports = await call("/api/crm/reports", { cookie: owner.cookie });
expect("the report builds", reports.status === 200, JSON.stringify(reports.json)?.slice(0, 200));
const report = reports.json?.report;
expect("the pipeline is broken down by stage, stream and matter",
  report?.pipeline?.byStage && report?.pipeline?.byStream && report?.pipeline?.byMatter,
  JSON.stringify(report?.pipeline)?.slice(0, 240));
expect("enquiry conversion is measured",
  typeof report?.conversion?.conversionRate === "number" &&
    report.conversion.enquiries > 0,
  JSON.stringify(report?.conversion));
expect("applications submitted, offers and CoEs are counted",
  typeof report?.conversion?.applicationsSubmitted === "number" &&
    typeof report?.conversion?.offerRate === "number" &&
    typeof report?.conversion?.coeRate === "number",
  JSON.stringify(report?.conversion));
expect("visa lodgement and outcomes are counted",
  report?.visas?.lodged >= 1 && typeof report?.visas?.grantRate === "number",
  JSON.stringify(report?.visas));
expect("the s56 response deadline is surfaced",
  Array.isArray(report?.deadlines?.informationRequests),
  JSON.stringify(report?.deadlines?.informationRequests)?.slice(0, 200));
expect("visa expiries are bucketed at 30, 60 and 90 days",
  report?.deadlines?.visaExpiry &&
    ["in30", "in60", "in90", "expired"].every(
      (key) => typeof report.deadlines.visaExpiry[key] === "number"),
  JSON.stringify(report?.deadlines?.visaExpiry));
expect("outstanding documents and overdue tasks are counted",
  typeof report?.deadlines?.documentsOutstanding === "number" &&
    typeof report?.deadlines?.overdueTasks === "number",
  JSON.stringify(report?.deadlines));
expect("staff workload is reported per person",
  Array.isArray(report?.workload) &&
    report.workload.some((row) => row.name === "Olivia Officer"),
  JSON.stringify(report?.workload)?.slice(0, 240));
expect("branch performance is reported",
  Array.isArray(report?.branches) && report.branches.length >= 2,
  JSON.stringify(report?.branches)?.slice(0, 200));
expect("outstanding fees are reported",
  typeof report?.finance?.outstanding === "number" &&
    typeof report?.finance?.overdueInvoices === "number",
  JSON.stringify(report?.finance));

// The report is built from what the reader may see, so a branch manager's
// figures cover their branch rather than the organisation.
const colomboOfficer = await login("colombo@maximus.test");
const colomboReport = await call("/api/crm/reports", { cookie: colomboOfficer.cookie });
expect("a report is scoped to what the reader may see",
  colomboReport.status === 200 &&
    colomboReport.json?.report?.pipeline?.total < report?.pipeline?.total,
  `colombo ${colomboReport.json?.report?.pipeline?.total} vs owner ${report?.pipeline?.total}`);
const portalReport = await call("/api/crm/reports", { cookie: student.cookie });
expect("the client portal cannot open reporting", portalReport.status === 403);

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

// ---------------------------------------------------------------------------
section("Deferral as a pipeline stage");
const deferMove = await move("deferred", officer.cookie, newCaseId, "Student deferred to July");
expect("a case can be deferred from the stage it is worked at",
  deferMove.status === 200, JSON.stringify(deferMove.json)?.slice(0, 240));
const wsDefer = await call("/api/crm/workspace", { cookie: officer.cookie });
const parked = wsDefer.json?.cases?.find((c) => c.dbId === newCaseId);
expect("a deferred case reports the deferred stage",
  parked?.lifecycleStage === "deferred", `stage=${parked?.lifecycleStage}`);
expect("deferring keeps the progress already recorded",
  Number(parked?.progress) > 0, `progress=${parked?.progress}`);
const deferComplete = await move("completed", officer.cookie, newCaseId);
expect("a deferred case cannot be completed without being resumed",
  deferComplete.status === 400, JSON.stringify(deferComplete.json)?.slice(0, 240));
expect("a deferred case resumes into an active stage",
  (await move("visa", officer.cookie, newCaseId, "Enrolled for July")).status === 200);
const wsResumed = await call("/api/crm/workspace", { cookie: officer.cookie });
expect("a resumed case is no longer deferred",
  wsResumed.json?.cases?.find((c) => c.dbId === newCaseId)?.lifecycleStage === "visa");

// ---------------------------------------------------------------------------
section("Visa expiry beside the action that needs it");
const expiryCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Expiry Needed", phone: "+61400000777",
          email: "expiry.needed@example.test", visaExpiry: "2028-01-31",
          type: "Student visa" } });
const expiryCaseId = expiryCase.json?.caseId;
const clearExpiry = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "set_visa_expiry", caseId: expiryCaseId, visaExpiry: "2029-06-30" } });
expect("the visa expiry can be recorded on its own",
  clearExpiry.status === 200, JSON.stringify(clearExpiry.json)?.slice(0, 240));
const wsExpiry = await call("/api/crm/workspace", { cookie: officer.cookie });
expect("the recorded expiry is what the case reports",
  wsExpiry.json?.cases?.find((c) => c.dbId === expiryCaseId)?.visaExpiry === "2029-06-30");
const badExpiryWrite = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "set_visa_expiry", caseId: expiryCaseId } });
expect("recording no date at all is refused", badExpiryWrite.status === 400);
const portalExpiry = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "set_visa_expiry", caseId: expiryCaseId, visaExpiry: "2030-01-01" } });
expect("a portal account cannot record a visa expiry", portalExpiry.status === 403);

// ---------------------------------------------------------------------------
section("Applications and visa matters as records");
const wsBoards = await call("/api/crm/workspace", { cookie: officer.cookie });
const appRows = wsBoards.json?.applications ?? [];
expect("the workspace lists applications as records of their own",
  Array.isArray(appRows) && appRows.length > 0, `applications=${appRows.length}`);
const anyApp = appRows[0];
expect("an application row carries the institution, course and its case",
  Boolean(anyApp?.institution && anyApp?.course && anyApp?.caseId),
  JSON.stringify(anyApp)?.slice(0, 240));
const visaRows = wsBoards.json?.visaMatters ?? [];
expect("the workspace lists visa matters as records of their own",
  Array.isArray(visaRows) && visaRows.length > 0, `visaMatters=${visaRows.length}`);
const anyVisa = visaRows[0];
expect("a visa matter row carries the columns an agent works from",
  anyVisa !== undefined &&
    ["subclass", "destination", "currentVisa", "trn", "marn", "informationDueOn", "outcome"]
      .every((key) => key in anyVisa),
  JSON.stringify(anyVisa)?.slice(0, 300));
const portalBoards = await call("/api/crm/workspace", { cookie: student.cookie });
expect("a portal account sees only its own applications",
  (portalBoards.json?.applications ?? []).every((row) => row.client === "Priya Sharma"),
  JSON.stringify((portalBoards.json?.applications ?? []).map((r) => r.client)));

// ---------------------------------------------------------------------------
section("Duplicate clients");
const dupCheck = (body, cookie = officer.cookie) =>
  call("/api/crm/duplicates", { method: "POST", cookie, body });
const dupSeed = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Nadia Fernando", phone: "+61 400 555 123",
          email: "nadia@example.test", visaExpiry: "2028-05-31", type: "Student visa" } });
expect("a first record is created normally", dupSeed.status === 200);
const byEmail = await dupCheck({ name: "Different Name", email: "NADIA@example.test" });
expect("the same email address is reported as a duplicate",
  byEmail.status === 200 && (byEmail.json?.matches ?? []).some((m) => m.reasons.includes("email")),
  JSON.stringify(byEmail.json)?.slice(0, 300));
const byMobile = await dupCheck({ name: "Different Name", phone: "0400555123" });
expect("the same mobile written differently is reported as a duplicate",
  (byMobile.json?.matches ?? []).some((m) => m.reasons.includes("mobile")),
  JSON.stringify(byMobile.json)?.slice(0, 300));
const byName = await dupCheck({ name: "  nadia   FERNANDO " });
expect("the same name is reported as a duplicate",
  (byName.json?.matches ?? []).some((m) => m.reasons.includes("name")),
  JSON.stringify(byName.json)?.slice(0, 300));
const notADuplicate = await dupCheck({ name: "Someone Else Entirely",
  email: "nobody-at-all@example.test", phone: "+61 499 111 222" });
expect("somebody genuinely new is not reported as a duplicate",
  (notADuplicate.json?.matches ?? []).length === 0,
  JSON.stringify(notADuplicate.json)?.slice(0, 300));
const dupPortal = await dupCheck({ email: "nadia@example.test" }, student.cookie);
expect("a portal account cannot run the duplicate check", dupPortal.status === 403);
const dupMatch = (byEmail.json?.matches ?? [])[0];
expect("the duplicate names how many cases that client already has",
  Number(dupMatch?.caseCount) >= 1, JSON.stringify(dupMatch)?.slice(0, 240));
const secondCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Nadia Fernando", phone: "+61 400 555 123",
          email: "nadia@example.test", visaExpiry: "2029-05-31", type: "485 Visa",
          existingClientId: dupMatch?.id } });
expect("a second case can be added to the existing client",
  secondCase.status === 200 && secondCase.json?.clientId === dupMatch?.id,
  JSON.stringify(secondCase.json)?.slice(0, 240));
const afterSecond = await dupCheck({ email: "nadia@example.test" });
expect("the second case joins the same client rather than making another",
  (afterSecond.json?.matches ?? []).length === 1 &&
    Number((afterSecond.json?.matches ?? [])[0]?.caseCount) === 2,
  JSON.stringify(afterSecond.json)?.slice(0, 300));
const bogusAttach = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Ghost Client", phone: "+61400111000",
          email: "ghost@example.test", visaExpiry: "2029-01-31",
          existingClientId: "00000000-0000-4000-8000-0000000000ff" } });
expect("a case cannot be attached to a client that is not yours",
  bogusAttach.status === 400, JSON.stringify(bogusAttach.json)?.slice(0, 240));

// ---------------------------------------------------------------------------
section("Integration status");
const integrations = await call("/api/crm/integrations", { cookie: owner.cookie });
expect("an owner can read the integration status", integrations.status === 200,
  JSON.stringify(integrations.json)?.slice(0, 240));
const byKey = Object.fromEntries(
  (integrations.json?.integrations ?? []).map((row) => [row.key, row]));
expect("the Shared Drive is probed rather than assumed",
  byKey.drive?.state === "connected" && /Maximus Client Files/.test(byKey.drive?.detail ?? ""),
  JSON.stringify(byKey.drive)?.slice(0, 300));
expect("passport encryption reports as configured",
  byKey.field_encryption?.state === "connected", JSON.stringify(byKey.field_encryption));
expect("what is not built says so rather than saying not configured",
  byKey.whatsapp?.state === "not_built", JSON.stringify(byKey.whatsapp));
expect("Gmail sending reports connected once the OAuth client is configured",
  byKey.gmail?.state === "connected", JSON.stringify(byKey.gmail));
expect("Calendar sync reports connected once the OAuth client is configured",
  byKey.calendar?.state === "connected", JSON.stringify(byKey.calendar));
expect("Google sign-in is read from Supabase's own settings, not assumed",
  byKey.google_signin?.state === "connected", JSON.stringify(byKey.google_signin));
const officerIntegrations = await call("/api/crm/integrations", { cookie: officer.cookie });
expect("a case officer cannot read the integration status",
  officerIntegrations.status === 403);

// ---------------------------------------------------------------------------
section("Archived and discarded records stay identifiable");
const wsHidden = await call("/api/crm/workspace", { cookie: officer.cookie });
const discardable = wsHidden.json?.messages?.[0];
expect("a message carries a date the interface can render",
  discardable !== undefined &&
    "createdAt" in discardable && "sentAt" in discardable &&
    (discardable.createdAt === null || !Number.isNaN(Date.parse(discardable.createdAt))),
  JSON.stringify(discardable)?.slice(0, 240));
if (discardable) {
  await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
    body: { action: "mutate", resource: "message", operation: "delete", id: discardable.id } });
  const afterDiscard = await call("/api/crm/workspace", { cookie: officer.cookie });
  const found = afterDiscard.json?.messages?.find((m) => m.id === discardable.id);
  expect("a discarded draft is marked discarded rather than deleted",
    found?.status === "discarded", JSON.stringify(found)?.slice(0, 240));
}

// ---------------------------------------------------------------------------
section("Adding a member of staff");
const adminPost = (body, cookie = owner.cookie) =>
  call("/api/crm/admin", { method: "POST", cookie, body });
const newStaff = await adminPost({
  action: "create_staff", displayName: "Sanjay Officer",
  email: "sanjay@maximus.test", level: "staff", department: "Admissions" });
expect("an owner can create a staff account",
  newStaff.status === 200 && newStaff.json?.created === "account",
  JSON.stringify(newStaff.json)?.slice(0, 300));
expect("a one-time password is handed back to give to them",
  typeof newStaff.json?.temporaryPassword === "string" &&
    newStaff.json.temporaryPassword.length >= 16);
const adminAfter = await call("/api/crm/admin", { cookie: owner.cookie });
expect("the new person is on the team",
  (adminAfter.json?.profiles ?? []).some((p) => p.email === "sanjay@maximus.test"),
  JSON.stringify((adminAfter.json?.profiles ?? []).map((p) => p.email)));

// The account they were given actually works, which is the whole point.
const sanjay = await login("sanjay@maximus.test");
expect("the new member of staff can sign in", sanjay.ok, JSON.stringify(sanjay.body));
const sanjayWorkspace = await call("/api/crm/workspace", { cookie: sanjay.cookie });
expect("the new member of staff reaches the workspace as staff",
  sanjayWorkspace.status === 200 && sanjayWorkspace.json?.identity?.role === "staff",
  JSON.stringify(sanjayWorkspace.json?.identity));
expect("the new member of staff cannot open administration",
  (await call("/api/crm/admin", { cookie: sanjay.cookie })).status === 403);

const duplicateStaff = await adminPost({
  action: "create_staff", displayName: "Sanjay Again",
  email: "sanjay@maximus.test", level: "staff" });
expect("the same person cannot be added twice", duplicateStaff.status === 400,
  JSON.stringify(duplicateStaff.json)?.slice(0, 240));

const managerMakesStaff = await adminPost({
  action: "create_staff", displayName: "Rhea Officer",
  email: "rhea@maximus.test", level: "staff" }, manager.cookie);
expect("a branch manager can build their own team",
  managerMakesStaff.status === 200, JSON.stringify(managerMakesStaff.json)?.slice(0, 240));
const managerMakesAdmin = await adminPost({
  action: "create_staff", displayName: "Rogue Admin",
  email: "rogue@maximus.test", level: "super_admin" }, manager.cookie);
expect("a branch manager cannot create an administrator",
  managerMakesAdmin.status === 403, JSON.stringify(managerMakesAdmin.json)?.slice(0, 240));
const officerMakesStaff = await adminPost({
  action: "create_staff", displayName: "Nope", email: "nope@maximus.test" },
  officer.cookie);
expect("a case officer cannot create staff at all", officerMakesStaff.status === 403);

// Deactivating stops the sign-in without deleting the history.
expect("a staff account can be deactivated",
  (await adminPost({ action: "update_profile",
    profileId: (adminAfter.json?.profiles ?? []).find((p) => p.email === "sanjay@maximus.test")?.id,
    active: false })).status === 200);
const afterDeactivation = await call("/api/crm/workspace", { cookie: sanjay.cookie });
expect("a deactivated account cannot use the CRM", afterDeactivation.status === 403,
  JSON.stringify(afterDeactivation.json)?.slice(0, 240));

// ---------------------------------------------------------------------------
section("Inviting somebody who already has a login");
const invited = await adminPost({ action: "create_invitation",
  email: "invited@maximus.test",
  roleId: (adminAfter.json?.roles ?? []).find((r) => r.level === "staff")?.id });
expect("an invitation can be recorded", invited.status === 200,
  JSON.stringify(invited.json)?.slice(0, 240));
// The invitation is claimed the first time that person signs in, which is what
// used to be missing: the row was written and nothing ever read it.
const invitedLogin = await login("invited@maximus.test");
expect("an invited person signs in", invitedLogin.ok, JSON.stringify(invitedLogin.body));
const invitedWorkspace = await call("/api/crm/workspace", { cookie: invitedLogin.cookie });
expect("signing in creates the invited person's profile",
  invitedWorkspace.status === 200 && invitedWorkspace.json?.identity?.role === "staff",
  JSON.stringify(invitedWorkspace.json?.identity ?? invitedWorkspace.json)?.slice(0, 300));
const adminFinal = await call("/api/crm/admin", { cookie: owner.cookie });
expect("the claimed invitation is marked accepted",
  (adminFinal.json?.invitations ?? []).some(
    (row) => row.email === "invited@maximus.test" && row.status === "accepted"),
  JSON.stringify((adminFinal.json?.invitations ?? []).map((r) => `${r.email}=${r.status}`)));
// Somebody with a login but no invitation is told so plainly.
const stranger = await login("stranger@maximus.test");
expect("a login with no invitation gets no profile",
  !stranger.ok || (await call("/api/crm/workspace", { cookie: stranger.cookie })).status === 403);

// A client demo account is exactly this shape: a Supabase login that exists
// with no CRM profile at all. Adding them as staff (or, as here, as a portal
// account) must connect it immediately -- an invitation, waiting on that same
// login to sign itself in, is a dead end when nobody holds its password,
// which is exactly the case for a demo account created outside this app.
const connectExisting = await adminPost({
  action: "create_staff", displayName: "Stranger Connected",
  email: "stranger@maximus.test", level: "student" });
expect("adding an existing login connects it immediately instead of failing",
  connectExisting.status === 200 && connectExisting.json?.created === "connected",
  JSON.stringify(connectExisting.json)?.slice(0, 240));
const strangerAgain = await login("stranger@maximus.test");
const strangerWorkspace = await call("/api/crm/workspace", { cookie: strangerAgain.cookie });
expect("their existing login now reaches the connected profile",
  strangerWorkspace.status === 200 && strangerWorkspace.json?.identity?.role === "client",
  JSON.stringify(strangerWorkspace.json?.identity ?? strangerWorkspace.json)?.slice(0, 240));

// ---------------------------------------------------------------------------
section("A case officer works only their own cases");
const colleague = await login("second.officer@maximus.test");
expect("a second officer in the same branch signs in", colleague.ok,
  JSON.stringify(colleague.body));
const colleagueWorkspace = await call("/api/crm/workspace", { cookie: colleague.cookie });
const priya = (colleagueWorkspace.json?.cases ?? []).find((c) => c.name === "Priya Sharma");
expect("a colleague's case is still visible, for cover and handover",
  priya !== undefined, JSON.stringify((colleagueWorkspace.json?.cases ?? []).map((c) => c.name)));
const colleagueEdit = await call("/api/crm/workspace", { method: "POST", cookie: colleague.cookie,
  body: { action: "update_case", caseId: priya?.dbId, clientId: priya?.clientId,
          name: "Hijacked Name", email: "hijack@example.test", visaExpiry: "2030-01-01" } });
expect("but a colleague cannot edit it",
  colleagueEdit.status >= 400, `${colleagueEdit.status} ${JSON.stringify(colleagueEdit.json)?.slice(0, 200)}`);
const colleagueMove = await call("/api/crm/workspace", { method: "POST", cookie: colleague.cookie,
  body: { action: "lifecycle", caseId: priya?.dbId, stage: "student" } });
expect("nor move it through the pipeline",
  colleagueMove.status >= 400 &&
    /assigned to somebody else/i.test(JSON.stringify(colleagueMove.json ?? "")),
  `${colleagueMove.status} ${JSON.stringify(colleagueMove.json)?.slice(0, 240)}`);
const colleagueApp = await call("/api/crm/casefile", { method: "POST", cookie: colleague.cookie,
  body: { action: "application_create", caseId: priya?.dbId,
          institution: "Sneaky University", course: "Sneaky Course" } });
expect("nor add anything to its case file", colleagueApp.status >= 400,
  `${colleagueApp.status} ${JSON.stringify(colleagueApp.json)?.slice(0, 200)}`);
const stillIntact = await call(`/api/crm/casefile?caseId=${priya?.dbId}`, { cookie: officer.cookie });
expect("and the case is untouched",
  !(stillIntact.json?.applications ?? []).some((a) => a.institution === "Sneaky University"));
const colleagueInvoice = await call("/api/crm/workspace", { method: "POST", cookie: colleague.cookie,
  body: { action: "invoice", clientId: priya?.clientId, caseId: priya?.dbId, amount: "999" } });
expect("nor raise an invoice against it", colleagueInvoice.status >= 400,
  `${colleagueInvoice.status} ${JSON.stringify(colleagueInvoice.json)?.slice(0, 200)}`);

// Reassignment is what grants access, and it works.
expect("an administrator reassigns the case to the colleague",
  (await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
    body: { action: "assign", caseId: priya?.dbId,
            ownerId: "c0000000-0000-4000-8000-000000000008" } })).status === 200);
const afterAssign = await call("/api/crm/workspace", { method: "POST", cookie: colleague.cookie,
  body: { action: "set_visa_expiry", caseId: priya?.dbId, visaExpiry: "2029-12-31" } });
expect("once it is theirs they can work it", afterAssign.status === 200,
  JSON.stringify(afterAssign.json)?.slice(0, 240));

// ---------------------------------------------------------------------------
section("Archiving is a management decision");
const officerArchive = await call("/api/crm/workspace", { method: "POST", cookie: colleague.cookie,
  body: { action: "mutate", resource: "case", operation: "archive", id: priya?.dbId,
          reason: "Client stopped responding" } });
expect("a case officer's archive is taken as a request",
  officerArchive.status === 200 && officerArchive.json?.requested === true,
  JSON.stringify(officerArchive.json)?.slice(0, 240));
const notStillOpen = await call("/api/crm/workspace", { cookie: officer.cookie });
expect("the case is not archived by the request",
  notStillOpen.json?.cases?.find((c) => c.dbId === priya?.dbId)?.status !== "completed");
const managerAlerts = await call("/api/crm/operations?view=notifications", { cookie: owner.cookie });
expect("a manager is told about the request",
  (managerAlerts.json?.data ?? []).some((n) => n.title?.includes("Archive requested")),
  JSON.stringify((managerAlerts.json?.data ?? []).map((n) => n.title))?.slice(0, 240));
const managerArchive = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "mutate", resource: "case", operation: "archive", id: priya?.dbId } });
expect("a manager can archive it", managerArchive.status === 200 && !managerArchive.json?.requested,
  JSON.stringify(managerArchive.json)?.slice(0, 240));

// ---------------------------------------------------------------------------
section("Exports are recorded");
const exportCall = await call("/api/crm/operations", { method: "POST", cookie: officer.cookie,
  body: { action: "record_export", scope: "own cases", count: 3 } });
expect("an export writes an audit entry", exportCall.status === 200,
  JSON.stringify(exportCall.json)?.slice(0, 240));
const exportAudit = await call("/api/crm/workspace", { cookie: owner.cookie });
expect("the export is on the audit trail",
  (exportAudit.json?.audits ?? []).some((a) => /Exported \d+ case records/.test(a.text ?? "")),
  JSON.stringify((exportAudit.json?.audits ?? []).slice(0, 4).map((a) => a.text)));
const portalExport = await call("/api/crm/operations", { method: "POST", cookie: student.cookie,
  body: { action: "record_export", scope: "own cases", count: 1 } });
expect("a portal account cannot record an export", portalExport.status === 403);

// ---------------------------------------------------------------------------
section("The client portal shows a client only their own money");
const portalMoney = await call("/api/crm/workspace", { cookie: student.cookie });
const portalInvoices = portalMoney.json?.invoices ?? [];
expect("the portal payload carries what a client is billed",
  portalInvoices.some((i) => i.type === "professional_fee"),
  JSON.stringify(portalInvoices.map((i) => `${i.type}=${i.amount}`)));
expect("an invoice carries what has been paid and what is left",
  portalInvoices.every((i) => "paid" in i && "balance" in i),
  JSON.stringify(portalInvoices[0]));
// The commission claim is agency income from a partner. Whether or not the
// portal renders it, it must not be described to a client as theirs.
const page = await call("/", { cookie: student.cookie });
expect("no client-facing screen names commissions or partner claims",
  !/partner claims|institution commission/i.test(page.text ?? ""),
  (page.text ?? "").slice(0, 120));

// ---------------------------------------------------------------------------
section("The case-file assistant");
const aiCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Assistant Test Client", phone: "+61400000444",
          email: "assistant.test@example.test", visaExpiry: "2028-11-30",
          type: "Student visa", target: "Diploma of Business" } });
const aiCaseId = aiCase.json?.caseId;
expect("a case exists for the assistant to work from", aiCase.status === 200);

const askAI = (body, cookie = officer.cookie) =>
  call("/api/crm/ai", { method: "POST", cookie, body: { caseId: aiCaseId, ...body } });

const noCase = await askAI({ caseId: undefined, instruction: "Summarise this case." });
expect("the assistant refuses without a case", noCase.status === 400);

const firstAsk = await askAI({ instruction: "Summarise where this case is up to." });
expect("the assistant answers from the case context", firstAsk.status === 200,
  JSON.stringify(firstAsk.json)?.slice(0, 240));
expect("the reply is built from the case, not invented",
  typeof firstAsk.json?.response === "string" &&
    firstAsk.json.response.includes("Diploma of Business"),
  firstAsk.json?.response?.slice(0, 200));

const history = await call(`/api/crm/ai?caseId=${aiCaseId}`, { cookie: officer.cookie });
expect("the exchange is on the case's history", history.status === 200 &&
  (history.json?.interactions ?? []).length === 1,
  JSON.stringify(history.json)?.slice(0, 240));

const upstreamFailure = await askAI({ instruction: "TRIGGER_UPSTREAM_ERROR please" });
expect("an upstream failure is reported, not swallowed",
  upstreamFailure.status >= 500, `${upstreamFailure.status}`);

const portalAsk = await askAI({ instruction: "Summarise this." }, student.cookie);
expect("a portal account cannot use the assistant", portalAsk.status === 403);

// Access follows the case, not the organisation: a colleague who cannot
// modify the case can still see its history if they can read the case, but
// someone who cannot access it at all gets nothing.
const outsiderCaseId = "00000000-0000-4000-8000-00000000ffff";
const outsiderAsk = await call("/api/crm/ai", { method: "POST", cookie: officer.cookie,
  body: { caseId: outsiderCaseId, instruction: "Summarise this." } });
expect("the assistant is scoped like everything else -- no case, no answer",
  outsiderAsk.status === 400 || outsiderAsk.status === 403,
  `${outsiderAsk.status} ${JSON.stringify(outsiderAsk.json)?.slice(0, 200)}`);

const aiIntegration = (await call("/api/crm/integrations", { cookie: owner.cookie }))
  .json?.integrations?.find((row) => row.key === "ai");
expect("Integrations reports the assistant as connected when configured",
  aiIntegration?.state === "connected", JSON.stringify(aiIntegration));

// ---------------------------------------------------------------------------
section("Connecting and sending through a personal Gmail account");
const gmailCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Gmail Test Client", phone: "+61400000555",
          email: "gmail.test@example.test", visaExpiry: "2028-06-30",
          type: "Student visa", target: "Diploma of IT" } });
expect("a case exists for the message to be linked to", gmailCase.status === 200);

const draft = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "message", caseId: gmailCase.json?.caseId, to: "client@example.test",
          subject: "Your visa application", body: "Checking in on your documents." } });
expect("a draft message is recorded against the case", draft.status === 200, JSON.stringify(draft.json));
const draftedWorkspace = await call("/api/crm/workspace", { cookie: officer.cookie });
const draftedMessage = (draftedWorkspace.json?.messages ?? [])
  .find((m) => m.subject === "Your visa application");
expect("the draft is there to send", draftedMessage !== undefined,
  JSON.stringify((draftedWorkspace.json?.messages ?? []).slice(0, 3)));

const beforeConnect = await call("/api/crm/mailbox", { cookie: officer.cookie });
expect("nobody starts with a Gmail account connected",
  beforeConnect.status === 200 && beforeConnect.json?.connected === false &&
    beforeConnect.json?.oauthConfigured === true,
  JSON.stringify(beforeConnect.json));

const portalMailbox = await call("/api/crm/mailbox", { cookie: student.cookie });
expect("a portal account has no mailbox to connect", portalMailbox.status === 403);
const portalStart = await call("/api/auth/gmail/start", { cookie: student.cookie });
expect("a portal account cannot start a Gmail connection",
  portalStart.status === 302 && !(portalStart.headers.get("location") ?? "").includes("accounts.google.com"),
  portalStart.headers.get("location"));

const start = await call("/api/auth/gmail/start", { cookie: officer.cookie });
expect("connecting Gmail redirects to Google",
  start.status === 302 && (start.headers.get("location") ?? "").includes("accounts.google.com"),
  start.headers.get("location"));
const stateCookie = (start.headers.getSetCookie?.() ?? [])
  .find((c) => c.startsWith("maximus_gmail_state="))?.split(";")[0];
expect("a CSRF state cookie is set for the round trip", Boolean(stateCookie));
const state = new URL(start.headers.get("location")).searchParams.get("state");

const wrongState = await call(
  "/api/auth/gmail/callback?code=officer-gmail-test&state=not-the-real-state",
  { cookie: `${officer.cookie}; ${stateCookie}` });
expect("a mismatched state is refused",
  wrongState.status === 302 && (wrongState.headers.get("location") ?? "").includes("gmail=error"),
  wrongState.headers.get("location"));
const stillDisconnected = await call("/api/crm/mailbox", { cookie: officer.cookie });
expect("the mismatched attempt connected nothing", stillDisconnected.json?.connected === false);

const callback = await call(
  `/api/auth/gmail/callback?code=officer-gmail-test&state=${state}`,
  { cookie: `${officer.cookie}; ${stateCookie}` });
expect("the callback completes the connection",
  callback.status === 302 && (callback.headers.get("location") ?? "").includes("gmail=connected"),
  callback.headers.get("location"));

const afterConnect = await call("/api/crm/mailbox", { cookie: officer.cookie });
expect("the officer's own Gmail account now shows connected",
  afterConnect.json?.connected === true &&
    afterConnect.json?.email === "officer-gmail-test@gmail.stub.test",
  JSON.stringify(afterConnect.json));

const managerSend = await call("/api/crm/mailbox", { method: "POST", cookie: manager.cookie,
  body: { action: "send_message", messageId: draftedMessage?.id } });
expect("someone without a Gmail connection of their own cannot send",
  managerSend.status === 400, JSON.stringify(managerSend.json));

const portalSend = await call("/api/crm/mailbox", { method: "POST", cookie: student.cookie,
  body: { action: "send_message", messageId: draftedMessage?.id } });
expect("a portal account cannot send mail as the agency", portalSend.status === 403);

const send = await call("/api/crm/mailbox", { method: "POST", cookie: officer.cookie,
  body: { action: "send_message", messageId: draftedMessage?.id } });
expect("the connected officer sends the draft", send.status === 200, JSON.stringify(send.json));

const sentWorkspace = await call("/api/crm/workspace", { cookie: officer.cookie });
const sentMessage = (sentWorkspace.json?.messages ?? []).find((m) => m.id === draftedMessage?.id);
expect("the sent message is marked sent with a timestamp",
  sentMessage?.status === "sent" && Boolean(sentMessage?.sentAt), JSON.stringify(sentMessage));

const gmailStubState = await (await fetch(`${DRIVE_STUB}/__state`)).json();
const lastSent = (gmailStubState.sentMessages ?? []).at(-1);
const decodedRaw = lastSent
  ? Buffer.from(lastSent.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  : "";
expect("the message actually sent through Gmail carries the drafted subject",
  decodedRaw.includes("Your visa application") && decodedRaw.includes("client@example.test"),
  decodedRaw.slice(0, 200));

const disconnect = await call("/api/crm/mailbox", { method: "POST", cookie: officer.cookie,
  body: { action: "disconnect" } });
expect("disconnecting a Gmail account succeeds", disconnect.status === 200);
const afterDisconnect = await call("/api/crm/mailbox", { cookie: officer.cookie });
expect("the connection no longer shows as connected", afterDisconnect.json?.connected === false);

const sendAfterDisconnect = await call("/api/crm/mailbox", { method: "POST", cookie: officer.cookie,
  body: { action: "send_message", messageId: draftedMessage?.id } });
expect("sending after disconnecting is refused",
  sendAfterDisconnect.status === 400, JSON.stringify(sendAfterDisconnect.json));

// ---------------------------------------------------------------------------
section("Pushing appointments to a personal Google Calendar");
const beforeCalendarConnect = await call("/api/crm/calendar-connection", { cookie: officer.cookie });
expect("nobody starts with a calendar connected",
  beforeCalendarConnect.status === 200 && beforeCalendarConnect.json?.connected === false &&
    beforeCalendarConnect.json?.oauthConfigured === true,
  JSON.stringify(beforeCalendarConnect.json));

const unsyncedAppointment = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "appointment", title: "Before calendar is connected", date: "2027-03-01", time: "10:00" } });
expect("an appointment can be created before any calendar is connected",
  unsyncedAppointment.status === 200, JSON.stringify(unsyncedAppointment.json));
const beforeConnectState = await (await fetch(`${DRIVE_STUB}/__state`)).json();
const eventsBeforeConnect = (beforeConnectState.calendarEvents ?? []).length;

const portalCalendarConnection = await call("/api/crm/calendar-connection", { cookie: student.cookie });
expect("a portal account has no calendar to connect", portalCalendarConnection.status === 403);

const calendarStart = await call("/api/auth/calendar/start", { cookie: officer.cookie });
expect("connecting Calendar redirects to Google",
  calendarStart.status === 302 && (calendarStart.headers.get("location") ?? "").includes("accounts.google.com"),
  calendarStart.headers.get("location"));
const calendarStateCookie = (calendarStart.headers.getSetCookie?.() ?? [])
  .find((c) => c.startsWith("maximus_calendar_state="))?.split(";")[0];
const calendarState = new URL(calendarStart.headers.get("location")).searchParams.get("state");
const calendarCallback = await call(
  `/api/auth/calendar/callback?code=officer-calendar-test&state=${calendarState}`,
  { cookie: `${officer.cookie}; ${calendarStateCookie}` });
expect("the calendar callback completes the connection",
  calendarCallback.status === 302 && (calendarCallback.headers.get("location") ?? "").includes("calendar=connected"),
  calendarCallback.headers.get("location"));

const afterCalendarConnect = await call("/api/crm/calendar-connection", { cookie: officer.cookie });
expect("the officer's own calendar now shows connected",
  afterCalendarConnect.json?.connected === true &&
    afterCalendarConnect.json?.email === "officer-calendar-test@gmail.stub.test",
  JSON.stringify(afterCalendarConnect.json));

const syncedAppointment = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "appointment", title: "After calendar is connected", date: "2027-03-02", time: "11:00" } });
expect("an appointment can be created once a calendar is connected",
  syncedAppointment.status === 200, JSON.stringify(syncedAppointment.json));

const afterCreateState = await (await fetch(`${DRIVE_STUB}/__state`)).json();
expect("the appointment was pushed onto the connected calendar",
  (afterCreateState.calendarEvents ?? []).length === eventsBeforeConnect + 1 &&
    (afterCreateState.calendarEvents ?? []).at(-1)?.summary === "After calendar is connected",
  JSON.stringify(afterCreateState.calendarEvents?.at(-1)));

const calendarWorkspace = await call("/api/crm/workspace", { cookie: officer.cookie });
const syncedRecord = (calendarWorkspace.json?.appointments ?? [])
  .find((a) => a.title === "After calendar is connected");
expect("the synced appointment is visible to cancel", syncedRecord !== undefined);

const cancelAppointment = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "mutate", resource: "appointment", operation: "delete", id: syncedRecord?.id } });
expect("cancelling the appointment succeeds", cancelAppointment.status === 200,
  JSON.stringify(cancelAppointment.json));

const afterCancelState = await (await fetch(`${DRIVE_STUB}/__state`)).json();
expect("cancelling the appointment removes it from the calendar",
  (afterCancelState.calendarEvents ?? []).length === eventsBeforeConnect,
  JSON.stringify(afterCancelState.calendarEvents));

const disconnectCalendar = await call("/api/crm/calendar-connection", { method: "POST", cookie: officer.cookie,
  body: { action: "disconnect" } });
expect("disconnecting a calendar succeeds", disconnectCalendar.status === 200);
const afterCalendarDisconnect = await call("/api/crm/calendar-connection", { cookie: officer.cookie });
expect("the calendar connection no longer shows as connected",
  afterCalendarDisconnect.json?.connected === false);

// ---------------------------------------------------------------------------
section("The organisation's last Super Admin cannot be removed");
const backupAdminEmail = `backup.admin.${Date.now()}@maximus.test`;
const createBackupAdmin = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_staff", displayName: "Backup Admin", email: backupAdminEmail, level: "super_admin" } });
expect("a second Super Admin can be created", createBackupAdmin.status === 200,
  JSON.stringify(createBackupAdmin.json));
const adminList = await call("/api/crm/admin", { cookie: owner.cookie });
const backupAdminId = (adminList.json?.profiles ?? [])
  .find((p) => p.email === backupAdminEmail)?.id;
const ownerId = (adminList.json?.profiles ?? [])
  .find((p) => p.email === "owner@maximus.test")?.id;
expect("the new Super Admin is on the profile list", Boolean(backupAdminId),
  JSON.stringify(adminList.json?.profiles?.slice(-3)));
expect("the owner's own profile id is known", Boolean(ownerId));

const deactivateBackup = await call("/api/crm/admin", { method: "POST", cookie: manager.cookie,
  body: { action: "update_profile", profileId: backupAdminId, active: false } });
expect("a Super Admin can be deactivated while another remains",
  deactivateBackup.status === 200, JSON.stringify(deactivateBackup.json));

const deactivateLastAdmin = await call("/api/crm/admin", { method: "POST", cookie: manager.cookie,
  body: { action: "update_profile", profileId: ownerId, active: false } });
expect("the organisation's last active Super Admin cannot be deactivated",
  deactivateLastAdmin.status === 400, JSON.stringify(deactivateLastAdmin.json));

const demoteLastAdmin = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "update_profile", profileId: ownerId, level: "admin" } });
expect("the last active Super Admin cannot be demoted either",
  demoteLastAdmin.status === 400, JSON.stringify(demoteLastAdmin.json));

const reactivateBackup = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "update_profile", profileId: backupAdminId, active: true } });
expect("the second Super Admin can be reactivated", reactivateBackup.status === 200,
  JSON.stringify(reactivateBackup.json));
const demoteBackup = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "update_profile", profileId: backupAdminId, level: "staff" } });
expect("a Super Admin can be demoted while another remains",
  demoteBackup.status === 200, JSON.stringify(demoteBackup.json));

// ---------------------------------------------------------------------------
section("Sign-in is rate limited");
// The threshold and window live in the database function itself
// (record_login_attempt), so this exercises that function directly rather
// than driving the real endpoint eight times -- which would also count
// against the shared "unknown IP" bucket every other login in this file
// shares, and could lock later, unrelated sign-ins out.
const rpcCall = async (name, args) => {
  const response = await fetch(`${SHIM}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};
const probeId = `test-rate-limit-${Date.now()}`;
let sixth;
for (let i = 0; i < 6; i += 1)
  sixth = await rpcCall("record_login_attempt", { p_identifier: probeId, p_success: false });
expect("six failures do not lock the identifier yet", sixth.json?.[0]?.locked === false,
  JSON.stringify(sixth.json));
const seventh = await rpcCall("record_login_attempt", { p_identifier: probeId, p_success: false });
const eighth = await rpcCall("record_login_attempt", { p_identifier: probeId, p_success: false });
expect("enough recent failures locks the identifier", eighth.json?.[0]?.locked === true,
  JSON.stringify([seventh.json, eighth.json]));
const status = await rpcCall("login_lock_status", { p_identifier: probeId });
expect("the lock is visible to a read-only status check", status.json?.[0]?.locked === true,
  JSON.stringify(status.json));
const otherProbeId = `test-rate-limit-other-${Date.now()}`;
const otherStatus = await rpcCall("login_lock_status", { p_identifier: otherProbeId });
expect("a different identifier is unaffected", otherStatus.json?.[0]?.locked === false,
  JSON.stringify(otherStatus.json));
const cleared = await rpcCall("record_login_attempt", { p_identifier: probeId, p_success: true });
expect("a recorded success clears the lock", cleared.json?.[0]?.locked === false,
  JSON.stringify(cleared.json));

const sanityCheck = await call("/api/auth/login", { method: "POST",
  body: { email: `rate-limit-sanity-${Date.now()}@maximus.test`, password: "whatever" } });
expect("a single failed sign-in through the real endpoint still behaves normally",
  sanityCheck.status === 401, JSON.stringify(sanityCheck.json));

// ---------------------------------------------------------------------------
section("Connecting and disconnecting a client's portal login");
const linkCase = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Link Test Client", phone: "+61400000777",
          email: "link.test@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of Business" } });
expect("a client exists for the link/unlink round trip", linkCase.status === 200);
const linkClientId = linkCase.json?.clientId;

const linkStamp = Date.now();
const linkLoginEmail = `link.test.${linkStamp}@maximus.test`;
const createdLinkLogin = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_staff", displayName: "Link Test Login", email: linkLoginEmail, level: "student" } });
expect("a portal login can be created for the link test", createdLinkLogin.status === 200,
  JSON.stringify(createdLinkLogin.json));
const linkAdminList = await call("/api/crm/admin", { cookie: owner.cookie });
const linkProfileId = (linkAdminList.json?.profiles ?? [])
  .find((p) => p.email === linkLoginEmail)?.id;
expect("the new portal login is on the profile list", Boolean(linkProfileId));

const linkAccount = await call("/api/crm/operations", { method: "POST", cookie: owner.cookie,
  body: { action: "link_client_account", profileId: linkProfileId, clientId: linkClientId } });
expect("an administrator can actually link a portal account -- the write policy exists now",
  linkAccount.status === 200, JSON.stringify(linkAccount.json));
const afterLink = await call("/api/crm/admin", { cookie: owner.cookie });
expect("the link is visible on the admin screen",
  (afterLink.json?.clientLinks ?? []).some(
    (l) => l.profile_id === linkProfileId && l.client_id === linkClientId),
  JSON.stringify(afterLink.json?.clientLinks));

const staffUnlink = await call("/api/crm/operations", { method: "POST", cookie: officer.cookie,
  body: { action: "unlink_client_account", profileId: linkProfileId } });
expect("a case officer cannot disconnect a portal login", staffUnlink.status === 403);

const unlinkAccount = await call("/api/crm/operations", { method: "POST", cookie: owner.cookie,
  body: { action: "unlink_client_account", profileId: linkProfileId } });
expect("an administrator can disconnect a portal login", unlinkAccount.status === 200,
  JSON.stringify(unlinkAccount.json));
const afterUnlink = await call("/api/crm/admin", { cookie: owner.cookie });
expect("the link no longer appears once disconnected",
  !(afterUnlink.json?.clientLinks ?? []).some((l) => l.profile_id === linkProfileId),
  JSON.stringify(afterUnlink.json?.clientLinks));

const invitationEmail = `resend.test.${linkStamp}@maximus.test`;
const staffRoleId = (await call("/api/crm/admin", { cookie: owner.cookie }))
  .json?.roles?.find((r) => r.level === "staff")?.id;
const createInvitation = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_invitation", email: invitationEmail, roleId: staffRoleId } });
expect("an invitation can be created directly", createInvitation.status === 200,
  JSON.stringify(createInvitation.json));
const invitationsAfterCreate = await call("/api/crm/admin", { cookie: owner.cookie });
const invitationRow = (invitationsAfterCreate.json?.invitations ?? [])
  .find((i) => i.email === invitationEmail);
expect("the invitation is on the list, pending", invitationRow?.status === "pending",
  JSON.stringify(invitationRow));

const revoked = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "revoke_invitation", invitationId: invitationRow?.id } });
expect("the invitation can be revoked", revoked.status === 200);
const resend = await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "resend_invitation", invitationId: invitationRow?.id } });
expect("a revoked invitation can be resent", resend.status === 200, JSON.stringify(resend.json));
const invitationsAfterResend = await call("/api/crm/admin", { cookie: owner.cookie });
const resentRow = (invitationsAfterResend.json?.invitations ?? [])
  .find((i) => i.id === invitationRow?.id);
expect("resending puts it back to pending with a fresh expiry",
  resentRow?.status === "pending" && resentRow?.expires_at > (invitationRow?.expires_at ?? ""),
  JSON.stringify(resentRow));

// ---------------------------------------------------------------------------
section("Merging duplicate client records");
const keepCase = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Merge Keep", phone: "+61400000778",
          email: "merge.keep@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of IT" } });
const awayCase = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Merge Away", phone: "+61400000779",
          email: "merge.away@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of IT" } });
expect("both records exist for the merge", keepCase.status === 200 && awayCase.status === 200);
const keepClientId = keepCase.json?.clientId;
const awayClientId = awayCase.json?.clientId;
const awayCaseId = awayCase.json?.caseId;

const mergeSelf = await call("/api/crm/duplicates", { method: "POST", cookie: owner.cookie,
  body: { action: "merge", keepClientId, mergeClientId: keepClientId } });
expect("a client record cannot be merged into itself", mergeSelf.status === 400,
  JSON.stringify(mergeSelf.json));

const staffMerge = await call("/api/crm/duplicates", { method: "POST", cookie: officer.cookie,
  body: { action: "merge", keepClientId, mergeClientId: awayClientId } });
expect("a case officer cannot merge duplicate clients", staffMerge.status === 403);

const merge = await call("/api/crm/duplicates", { method: "POST", cookie: owner.cookie,
  body: { action: "merge", keepClientId, mergeClientId: awayClientId } });
expect("an administrator can merge two duplicate client records",
  merge.status === 200, JSON.stringify(merge.json));

const mergedWorkspace = await call("/api/crm/workspace", { cookie: owner.cookie });
const mergedCase = (mergedWorkspace.json?.cases ?? []).find((row) => row.dbId === awayCaseId);
expect("the merged-away case now belongs to the surviving client",
  mergedCase?.name === "Merge Keep", JSON.stringify(mergedCase));

// ---------------------------------------------------------------------------
section("Credit notes reduce a balance without a refund");
const creditCase = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Credit Note Client", phone: "+61400000780",
          email: "credit.note@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of IT" } });
const creditCaseId = creditCase.json?.caseId;
const creditClientId = creditCase.json?.clientId;
const creditInvoice = await mk({ action: "invoice", clientId: creditClientId, caseId: creditCaseId,
  amount: "1000", due: "2026-11-30" }, owner.cookie);
expect("an invoice exists for the credit note", creditInvoice.status === 200,
  JSON.stringify(creditInvoice.json));
const beforeCreditWorkspace = await call("/api/crm/workspace", { cookie: owner.cookie });
const creditInvoiceRow = (beforeCreditWorkspace.json?.invoices ?? [])
  .find((row) => row.client === "Credit Note Client");
expect("the invoice's balance starts at the full amount",
  creditInvoiceRow?.balance === 1000, JSON.stringify(creditInvoiceRow));

const staffCredit = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "mutate", resource: "invoice", operation: "credit", id: creditInvoiceRow?.id,
          amount: 200, reason: "Goodwill" } });
expect("a case officer cannot issue a credit note", staffCredit.status === 403);

const credit = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "mutate", resource: "invoice", operation: "credit", id: creditInvoiceRow?.id,
          amount: 200, reason: "Goodwill" } });
expect("a manager can issue a credit note", credit.status === 200, JSON.stringify(credit.json));

const afterCreditWorkspace = await call("/api/crm/workspace", { cookie: owner.cookie });
const afterCreditRow = (afterCreditWorkspace.json?.invoices ?? [])
  .find((row) => row.id === creditInvoiceRow?.id);
expect("the credited amount reduces the balance without counting as paid",
  afterCreditRow?.credited === 200 && afterCreditRow?.paid === 0 && afterCreditRow?.balance === 800,
  JSON.stringify(afterCreditRow));

// ---------------------------------------------------------------------------
section("Bulk-reassigning cases");
const bulkCaseA = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Bulk Assign A", phone: "+61400000781",
          email: "bulk.a@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of IT" } });
const bulkCaseB = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Bulk Assign B", phone: "+61400000782",
          email: "bulk.b@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of IT" } });
const bulkCaseIds = [bulkCaseA.json?.caseId, bulkCaseB.json?.caseId];
expect("both cases exist for the bulk assignment", Boolean(bulkCaseIds[0]) && Boolean(bulkCaseIds[1]));

const staffBulkAssign = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "bulk_assign", caseIds: bulkCaseIds, ownerId: officer.profileId } });
expect("a case officer cannot bulk-reassign cases", staffBulkAssign.status === 403);

const secondOfficerId = (await call("/api/crm/admin", { cookie: owner.cookie })).json?.profiles
  ?.find((p) => p.email === "second.officer@maximus.test")?.id;
const bulkAssign = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "bulk_assign", caseIds: bulkCaseIds, ownerId: secondOfficerId } });
expect("an administrator can bulk-reassign cases", bulkAssign.status === 200 && bulkAssign.json?.succeeded === 2,
  JSON.stringify(bulkAssign.json));
const afterBulkWorkspace = await call("/api/crm/workspace", { cookie: owner.cookie });
const bulkOwners = bulkCaseIds.map(
  (id) => (afterBulkWorkspace.json?.cases ?? []).find((row) => row.dbId === id)?.owner);
expect("both cases now show the new owner",
  bulkOwners.every((name) => name === "Nuwan Officer"), JSON.stringify(bulkOwners));

// ---------------------------------------------------------------------------
section("Saved views");
const savedViewsBefore = await call("/api/crm/saved-views?module=enquiries", { cookie: officer.cookie });
expect("saved views start empty for a fresh module",
  savedViewsBefore.status === 200 && (savedViewsBefore.json?.views ?? []).length === 0,
  JSON.stringify(savedViewsBefore.json));
const createView = await call("/api/crm/saved-views", { method: "POST", cookie: officer.cookie,
  body: { action: "create", module: "enquiries", name: "My waiting cases", filters: { filter: "waiting" } } });
expect("a saved view can be created", createView.status === 200 &&
  (createView.json?.views ?? []).some((v) => v.name === "My waiting cases"),
  JSON.stringify(createView.json));
const otherOfficerViews = await call("/api/crm/saved-views?module=enquiries", { cookie: manager.cookie });
expect("a saved view is private to whoever saved it",
  !(otherOfficerViews.json?.views ?? []).some((v) => v.name === "My waiting cases"),
  JSON.stringify(otherOfficerViews.json));
const savedViewId = (createView.json?.views ?? []).find((v) => v.name === "My waiting cases")?.id;
const deleteViewResult = await call("/api/crm/saved-views", { method: "POST", cookie: officer.cookie,
  body: { action: "delete", id: savedViewId, module: "enquiries" } });
expect("a saved view can be deleted",
  deleteViewResult.status === 200 &&
    !(deleteViewResult.json?.views ?? []).some((v) => v.id === savedViewId),
  JSON.stringify(deleteViewResult.json));

// ---------------------------------------------------------------------------
section("Client self-service: contact details and consent");
const selfServiceCase = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "case", name: "Portal Self Service", phone: "+61400000783",
          email: "portal.selfservice@example.test", visaExpiry: "2028-05-31",
          type: "Student visa", target: "Diploma of IT" } });
const portalClientId = selfServiceCase.json?.clientId;
const selfServiceEmail = `selfservice.${linkStamp}@maximus.test`;
await call("/api/crm/admin", { method: "POST", cookie: owner.cookie,
  body: { action: "create_staff", displayName: "Portal Self Service", email: selfServiceEmail, level: "student" } });
const selfServiceProfileId = (await call("/api/crm/admin", { cookie: owner.cookie }))
  .json?.profiles?.find((p) => p.email === selfServiceEmail)?.id;
await call("/api/crm/operations", { method: "POST", cookie: owner.cookie,
  body: { action: "link_client_account", profileId: selfServiceProfileId, clientId: portalClientId } });
const selfServiceLogin = await login(selfServiceEmail);
expect("the portal self-service account signs in", selfServiceLogin.ok, JSON.stringify(selfServiceLogin.body));

const updateContact = await call("/api/crm/workspace", { method: "POST", cookie: selfServiceLogin.cookie,
  body: { action: "update_own_contact", email: "updated.contact@example.test", mobile: "+61400099999" } });
expect("a client can update their own contact details", updateContact.status === 200,
  JSON.stringify(updateContact.json));
const afterContactUpdate = await call("/api/crm/workspace", { cookie: owner.cookie });
const updatedClientCase = (afterContactUpdate.json?.cases ?? []).find(
  (row) => row.clientId === portalClientId);
expect("the updated contact details are reflected on the case",
  updatedClientCase?.email === "updated.contact@example.test", JSON.stringify(updatedClientCase));

const staffContactUpdate = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "update_own_contact", email: "not.allowed@example.test" } });
// A staff account has no client_user_links row of its own, so the RPC
// refuses for want of a linked client -- a plain 400, not a role check.
expect("staff cannot use the client's own-contact action",
  staffContactUpdate.status === 400, JSON.stringify(staffContactUpdate.json));

const acknowledge = await call("/api/crm/workspace", { method: "POST", cookie: selfServiceLogin.cookie,
  body: { action: "acknowledge_consent", declarationType: "privacy_policy", response: true } });
expect("a client can acknowledge a consent declaration", acknowledge.status === 200,
  JSON.stringify(acknowledge.json));
const afterConsentWorkspace = await call("/api/crm/workspace", { cookie: selfServiceLogin.cookie });
const ownDeclaration = (afterConsentWorkspace.json?.declarations ?? []).find(
  (row) => row.clientId === portalClientId && row.type === "privacy_policy");
expect("the acknowledgement is recorded and visible to the client",
  ownDeclaration?.response === true, JSON.stringify(ownDeclaration));

section("The document-request checklist is editable masters data");
const checklistRead = await call("/api/crm/document-checklist-templates", { cookie: officer.cookie });
expect("staff can read the document checklist",
  checklistRead.status === 200, JSON.stringify(checklistRead.json));
expect("every organisation starts with the same 35 default items",
  (checklistRead.json?.templates ?? []).length === 35,
  `${(checklistRead.json?.templates ?? []).length} templates`);
for (const category of ["Identity", "Family and relationships", "Immigration history",
  "Character and health", "Financial capacity", "Employment and skills",
  "Education and English", "Application support"])
  expect(`the default list covers ${category}`,
    (checklistRead.json?.templates ?? []).some((t) => t.category === category));
const checklistReadAsClient = await call("/api/crm/document-checklist-templates", { cookie: student.cookie });
expect("a client cannot read the document checklist", checklistReadAsClient.status === 403);

const checklistCreateAsStaff = await call("/api/crm/document-checklist-templates", { method: "POST", cookie: officer.cookie,
  body: { action: "create", category: "Identity", title: "A staff-added item" } });
expect("a case officer cannot change the document checklist", checklistCreateAsStaff.status === 403);

const checklistCreate = await call("/api/crm/document-checklist-templates", { method: "POST", cookie: manager.cookie,
  body: { action: "create", category: "Identity", title: "Utility bill",
          guidance: "A recent bill showing the current address." } });
expect("a manager can add a document checklist item", checklistCreate.status === 200, JSON.stringify(checklistCreate.json));
const afterChecklistCreate = await call("/api/crm/document-checklist-templates", { cookie: officer.cookie });
const utilityBill = (afterChecklistCreate.json?.templates ?? []).find((t) => t.title === "Utility bill");
expect("the new item is on the list", Boolean(utilityBill), JSON.stringify(afterChecklistCreate.json).slice(0, 200));

const checklistDeactivate = await call("/api/crm/document-checklist-templates", { method: "POST", cookie: manager.cookie,
  body: { action: "update", templateId: utilityBill?.id, active: false } });
expect("a manager can deactivate a document checklist item", checklistDeactivate.status === 200);
const afterDeactivate = await call("/api/crm/document-checklist-templates", { cookie: officer.cookie });
expect("the deactivated item is marked inactive, not removed",
  (afterDeactivate.json?.templates ?? []).find((t) => t.id === utilityBill?.id)?.active === false);

section("Requesting documents from a database-backed checklist");
const checklistCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Nadia Checklist Case", phone: "+61400000099",
          email: "nadia.checklist@example.test", visaExpiry: "2028-01-31",
          workspace: "Direct Visa", matterType: "Partner visa 820/801" } });
expect("a visa case exists for the checklist request", checklistCase.status === 200, JSON.stringify(checklistCase.json));
const checklistCaseWs = await call("/api/crm/workspace", { cookie: officer.cookie });
const checklistApplicant = checklistCaseWs.json?.cases?.find((c) => c.name === "Nadia Checklist Case");
const passportItem = (checklistRead.json?.templates ?? []).find((t) => t.title === "Passport bio page");
const requestChecklist = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "visaChecklist", caseId: checklistApplicant?.dbId, [`visaDoc_${passportItem?.id}`]: "on" } });
expect("a document can be requested from the live checklist",
  requestChecklist.status === 200 && requestChecklist.json?.requested === 1,
  JSON.stringify(requestChecklist.json));
const afterChecklistRequest = await call("/api/crm/workspace", { cookie: officer.cookie });
const requestedDoc = (afterChecklistRequest.json?.documents ?? []).find(
  (d) => d.caseId === checklistApplicant?.dbId && d.checklistKey === passportItem?.id);
expect("the requested document is recorded against the case and client-visible",
  Boolean(requestedDoc) && requestedDoc?.clientVisible !== false,
  JSON.stringify(requestedDoc));

// ---------------------------------------------------------------------------
section("Email templates are editable masters data");
const emailTemplatesRead = await call("/api/crm/email-templates", { cookie: officer.cookie });
expect("staff can read the email templates", emailTemplatesRead.status === 200, JSON.stringify(emailTemplatesRead.json));
const templateKinds = (emailTemplatesRead.json?.templates ?? []).map((t) => t.kind).sort();
expect("every organisation starts with the three system email templates",
  JSON.stringify(templateKinds) === JSON.stringify(["document_request", "invoice_request", "portal_welcome"]),
  JSON.stringify(templateKinds));

const emailTemplatesAsClient = await call("/api/crm/email-templates", { cookie: student.cookie });
expect("a client cannot read the email templates", emailTemplatesAsClient.status === 403);

const documentTemplate = (emailTemplatesRead.json?.templates ?? []).find((t) => t.kind === "document_request");
const emailTemplateUpdateAsStaff = await call("/api/crm/email-templates", { method: "POST", cookie: officer.cookie,
  body: { action: "update", templateId: documentTemplate?.id, subject: "Hijacked wording" } });
expect("a case officer cannot change email wording", emailTemplateUpdateAsStaff.status === 403);

const emailTemplateUpdate = await call("/api/crm/email-templates", { method: "POST", cookie: manager.cookie,
  body: { action: "update", templateId: documentTemplate?.id, subject: "We need a document from you, {{client_name}}" } });
expect("a manager can edit an email template", emailTemplateUpdate.status === 200, JSON.stringify(emailTemplateUpdate.json));

// ---------------------------------------------------------------------------
section("Requesting a document or raising an invoice emails the client");
const sentBeforeRequests = await (await fetch(`${RESEND_STUB}/__sent`)).json();
const emailCase = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "case", name: "Email Notice Case", phone: "+61400000098",
          email: "email.notice@example.test", visaExpiry: "2028-06-30",
          workspace: "Direct Visa", matterType: "Partner visa 820/801" } });
expect("a case exists to raise document and invoice requests against",
  emailCase.status === 200, JSON.stringify(emailCase.json));
const requestedDocument = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "document", clientId: emailCase.json?.clientId, caseId: emailCase.json?.caseId,
          title: "Certified passport copy", folder: "Identity" } });
expect("the document request itself succeeds", requestedDocument.status === 200, JSON.stringify(requestedDocument.json));
const raisedInvoice = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "invoice", clientId: emailCase.json?.clientId, caseId: emailCase.json?.caseId, amount: "450" } });
expect("the invoice itself is raised", raisedInvoice.status === 200, JSON.stringify(raisedInvoice.json));

const sentAfterRequests = await (await fetch(`${RESEND_STUB}/__sent`)).json();
const newlySent = sentAfterRequests.slice(sentBeforeRequests.length);
expect("both the document request and the invoice emailed the client",
  newlySent.filter((m) => (m.to ?? []).includes("email.notice@example.test")).length === 2,
  JSON.stringify(newlySent.map((m) => ({ to: m.to, subject: m.subject }))));
expect("the document request email uses the edited wording, tokens filled in",
  newlySent.some((m) => m.subject === "We need a document from you, Email Notice Case"),
  JSON.stringify(newlySent.map((m) => m.subject)));
expect("the invoice email uses the default wording",
  newlySent.some((m) => m.subject === "An invoice has been raised for your file"),
  JSON.stringify(newlySent.map((m) => m.subject)));

// ---------------------------------------------------------------------------
section("Sending a client their portal access");
const portalAccessDenied = await call("/api/crm/workspace", { method: "POST", cookie: colleague.cookie,
  body: { action: "send_portal_access", clientId: emailCase.json?.clientId } });
expect("a colleague cannot send portal access for a client that is not theirs",
  portalAccessDenied.status >= 400, `${portalAccessDenied.status} ${JSON.stringify(portalAccessDenied.json)?.slice(0, 200)}`);

const portalAccessAsClient = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "send_portal_access", clientId: emailCase.json?.clientId } });
expect("a client cannot send themselves portal access", portalAccessAsClient.status === 403);

const sentBeforePortal = await (await fetch(`${RESEND_STUB}/__sent`)).json();
const portalAccess = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "send_portal_access", clientId: emailCase.json?.clientId } });
expect("the case officer sends portal access to their own client",
  portalAccess.status === 200, JSON.stringify(portalAccess.json));
expect("portal access was actually emailed, not just created",
  portalAccess.json?.emailSent === true, JSON.stringify(portalAccess.json));

const sentAfterPortal = await (await fetch(`${RESEND_STUB}/__sent`)).json();
const portalEmail = sentAfterPortal[sentAfterPortal.length - 1];
expect("the portal welcome email went to the client, not a password in plain text",
  sentAfterPortal.length === sentBeforePortal.length + 1 &&
    (portalEmail?.to ?? []).includes("email.notice@example.test") &&
    /http/.test(portalEmail?.text ?? "") &&
    !/temporaryPassword|password:\s*\S/i.test(portalEmail?.text ?? ""),
  JSON.stringify(portalEmail));

const portalLogin = await login("email.notice@example.test");
expect("the client can sign in through the login portal access just created",
  portalLogin.ok, JSON.stringify(portalLogin.body));
const portalLoginWorkspace = await call("/api/crm/workspace", { cookie: portalLogin.cookie });
expect("and lands in the client portal, not a staff view",
  portalLoginWorkspace.json?.identity?.role === "client",
  JSON.stringify(portalLoginWorkspace.json?.identity));

const resendPortalAccess = await call("/api/crm/workspace", { method: "POST", cookie: officer.cookie,
  body: { action: "send_portal_access", clientId: emailCase.json?.clientId } });
expect("sending it again reuses the existing login rather than creating a duplicate",
  resendPortalAccess.status === 200, JSON.stringify(resendPortalAccess.json));

// ---------------------------------------------------------------------------
section("A client can confirm a document or invoice request reached them");
const portalDocRequest = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "document", clientId: portalClientId, caseId: selfServiceCase.json?.caseId,
          title: "Proof of enrolment", folder: "Education" } });
expect("a document is requested on the client's own case",
  portalDocRequest.status === 200, JSON.stringify(portalDocRequest.json));
const portalInvoiceRequest = await call("/api/crm/workspace", { method: "POST", cookie: owner.cookie,
  body: { action: "invoice", clientId: portalClientId, caseId: selfServiceCase.json?.caseId, amount: "250" } });
expect("an invoice is raised on the client's own case",
  portalInvoiceRequest.status === 200, JSON.stringify(portalInvoiceRequest.json));

const portalWorkspace = await call("/api/crm/workspace", { cookie: selfServiceLogin.cookie });
const ownDocument = (portalWorkspace.json?.documents ?? []).find((d) => d.title === "Proof of enrolment");
const ownInvoice = (portalWorkspace.json?.invoices ?? []).find((i) => i.amount === 250);
expect("the client can see the document requested of them",
  Boolean(ownDocument), JSON.stringify(portalWorkspace.json?.documents)?.slice(0, 200));
expect("the client can see the invoice raised on their file",
  Boolean(ownInvoice), JSON.stringify(portalWorkspace.json?.invoices)?.slice(0, 200));

const confirmDoc = await call("/api/crm/workspace", { method: "POST", cookie: selfServiceLogin.cookie,
  body: { action: "confirm_document", id: ownDocument?.id } });
expect("the client can confirm the document request reached them",
  confirmDoc.status === 200, JSON.stringify(confirmDoc.json));
const confirmInvoice = await call("/api/crm/workspace", { method: "POST", cookie: selfServiceLogin.cookie,
  body: { action: "confirm_invoice", id: ownInvoice?.id } });
expect("and confirm the invoice too",
  confirmInvoice.status === 200, JSON.stringify(confirmInvoice.json));

const strangerConfirm = await call("/api/crm/workspace", { method: "POST", cookie: student.cookie,
  body: { action: "confirm_document", id: ownDocument?.id } });
expect("a different client cannot confirm somebody else's document",
  strangerConfirm.status >= 400, `${strangerConfirm.status} ${JSON.stringify(strangerConfirm.json)?.slice(0, 200)}`);

const confirmationAlerts = await call("/api/crm/operations?view=notifications", { cookie: owner.cookie });
expect("the case owner is told the client confirmed",
  (confirmationAlerts.json?.data ?? []).some((n) => /confirmed/i.test(n.title ?? "")),
  JSON.stringify((confirmationAlerts.json?.data ?? []).map((n) => n.title))?.slice(0, 240));

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
