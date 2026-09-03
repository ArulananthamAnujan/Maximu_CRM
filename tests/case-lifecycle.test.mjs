import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "staff@maximus.test",
};
const PROFILE = {
  id: USER.id,
  organisation_id: "22222222-2222-4222-8222-222222222222",
  branch_id: "33333333-3333-4333-8333-333333333333",
  display_name: "Case Officer",
  email: USER.email,
  level: "staff",
  department: "Operations",
  active: true,
};
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_ID = "66666666-6666-4666-8666-666666666666";
const TARGET_STAFF = {
  id: "55555555-5555-4555-8555-555555555555",
  display_name: "Ravi Kumar",
  level: "staff",
  active: true,
  branch_id: PROFILE.branch_id,
};

/**
 * Supabase stand-in that records every write, so a test can assert on what the
 * route actually sent. `rpcFailure` makes move_case_lifecycle raise the way
 * PostgREST reports a raised exception.
 */
async function startStub({
  rpcFailure = null,
  level = "staff",
  targetOverride = null,
  lifecycleMigrationApplied = true,
  patchBlocked = false,
} = {}) {
  const target = targetOverride ?? TARGET_STAFF;
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method,
        path: url.pathname,
        body: raw ? JSON.parse(raw) : null,
      });
      const send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === "/auth/v1/user") return send(200, USER);
      if (url.pathname === "/rest/v1/profiles") {
        // The route looks the assignment target up by id; the session lookup
        // asks for the signed-in user.
        const filter = url.searchParams.get("id") ?? "";
        if (filter.includes(target.id)) return send(200, [target]);
        return send(200, [{ ...PROFILE, level }]);
      }
      // A database still on migration 0007 has neither the column nor the
      // function; PostgREST reports both as a schema-cache miss.
      if (
        !lifecycleMigrationApplied &&
        url.searchParams.get("select") === "lifecycle_stage"
      )
        return send(400, {
          code: "42703",
          message: "column cases.lifecycle_stage does not exist",
        });
      if (url.pathname === "/rest/v1/rpc/move_case_lifecycle") {
        if (!lifecycleMigrationApplied)
          return send(404, {
            code: "PGRST202",
            message:
              "Could not find the function public.move_case_lifecycle in the schema cache",
          });
        if (rpcFailure)
          return send(400, { code: "22023", message: rpcFailure, hint: null });
        return send(200, [{ id: CASE_ID, lifecycle_stage: "visa" }]);
      }
      if (url.pathname === "/rest/v1/cases" && req.method === "GET" && url.searchParams.has("owner_id"))
        return send(200, [{ id: CASE_ID, owner_id: USER.id, branch_id: PROFILE.branch_id }]);
      if (url.pathname === "/rest/v1/cases" && req.method === "GET")
        return send(200, [{ id: CASE_ID, client_id: CASE_ID, owner_id: USER.id, branch_id: PROFILE.branch_id }]);
      if (url.pathname === "/rest/v1/clients" && req.method === "GET")
        return send(200, [{ id: CASE_ID, email: "client@example.test", first_name: "Priya", last_name: "Sharma" }]);
      // PostgREST returns the rows an update actually touched when the caller
      // asks for a representation, and an empty array when row-level security
      // hid every one of them. The route relies on that to tell a refused
      // write from a successful one, so the stand-in has to answer the same
      // way. `patchBlocked` is how a test asks for the refusal.
      if (req.method === "PATCH")
        return send(200, patchBlocked ? [] : [{ id: url.searchParams.get("id")?.replace("eq.", "") ?? CASE_ID }]);
      return send(200, []);
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

async function post(body, options = {}) {
  const stub = await startStub(options);
  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("lifecycle", `${process.pid}-${Date.now()}`);
    const { default: worker } = await import(workerUrl.href);
    const response = await worker.fetch(
      new Request("https://crm.example/api/crm/workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: "maximus_access=token",
        },
        body: JSON.stringify(body),
      }),
      {
        SUPABASE_URL: stub.url,
        SUPABASE_PUBLISHABLE_KEY: "stub-key",
        ASSETS: { fetch: async () => new Response("", { status: 404 }) },
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    return {
      status: response.status,
      body: await response.json(),
      requests: stub.requests,
    };
  } finally {
    stub.server.close();
  }
}

const NEW_CASE = {
  action: "case",
  name: "Priya Sharma",
  phone: "+61412345678",
  email: "priya@example.test",
  visaExpiry: "2027-03-31",
};

test("a new case is rejected without an email address", async () => {
  const { action, ...rest } = NEW_CASE;
  const result = await post({ action, ...rest, email: "" });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /email/i);
});

test("a new case is rejected when the email address is malformed", async () => {
  const result = await post({ ...NEW_CASE, email: "priya-at-example" });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /valid email/i);
});

test("a new enquiry can be captured before its visa expiry is known", async () => {
  const result = await post({ ...NEW_CASE, visaExpiry: "" });
  assert.equal(result.status, 200);
  const caseWrite = result.requests.find(
    (r) => r.path === "/rest/v1/cases" && r.method === "POST",
  );
  assert.equal(caseWrite.body.visa_expiry_on, null);
});

test("a valid case records the email and visa expiry it was given", async () => {
  const result = await post(NEW_CASE);
  assert.equal(result.status, 200);
  const caseWrite = result.requests.find(
    (r) => r.path === "/rest/v1/cases" && r.method === "POST",
  );
  const clientWrite = result.requests.find(
    (r) => r.path === "/rest/v1/clients" && r.method === "POST",
  );
  assert.equal(clientWrite.body.email, "priya@example.test");
  assert.equal(caseWrite.body.visa_expiry_on, "2027-03-31");
  assert.equal(caseWrite.body.case_number.startsWith("CASE-"), true);
});

test("moving a case calls the lifecycle function with the requested stage", async () => {
  const result = await post({
    action: "lifecycle",
    caseId: CASE_ID,
    stage: "visa",
    reason: "Documents verified",
  });
  assert.equal(result.status, 200);
  const rpc = result.requests.find(
    (r) => r.path === "/rest/v1/rpc/move_case_lifecycle",
  );
  assert.deepEqual(rpc.body, {
    target_case: CASE_ID,
    target_stage: "visa",
    transition_reason: "Documents verified",
  });
});

test("an unknown stage never reaches the database", async () => {
  const result = await post({
    action: "lifecycle",
    caseId: CASE_ID,
    stage: "archived",
  });
  assert.equal(result.status, 400);
  assert.equal(
    result.requests.some((r) => r.path.includes("move_case_lifecycle")),
    false,
  );
});

test("a rejected transition reports the database's own explanation", async () => {
  const message =
    "Record the visa expiry date before moving this case to the visa stage";
  const result = await post(
    { action: "lifecycle", caseId: CASE_ID, stage: "visa" },
    { rpcFailure: message },
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error, message);
});

test("a portal account cannot move a case through the pipeline", async () => {
  const result = await post(
    { action: "lifecycle", caseId: CASE_ID, stage: "visa" },
    { level: "student" },
  );
  assert.equal(result.status, 403);
  assert.equal(
    result.requests.some((r) => r.path.includes("move_case_lifecycle")),
    false,
  );
});


test("an administrator can reassign a case to another staff member", async () => {
  const result = await post(
    { action: "assign", caseId: CASE_ID, ownerId: TARGET_STAFF.id },
    { level: "branch_admin" },
  );
  assert.equal(result.status, 200);
  const patch = result.requests.find(
    (r) => r.method === "PATCH" && r.path === "/rest/v1/cases",
  );
  assert.equal(patch.body.owner_id, TARGET_STAFF.id);
});

test("reassignment notifies the new owner", async () => {
  const result = await post(
    { action: "assign", caseId: CASE_ID, ownerId: TARGET_STAFF.id },
    { level: "branch_admin" },
  );
  const notification = result.requests.find(
    (r) => r.path === "/rest/v1/notifications",
  );
  assert.equal(notification.body.recipient_id, TARGET_STAFF.id);
  assert.equal(notification.body.kind, "case_assigned");
  assert.equal(notification.body.case_id, CASE_ID);
});

test("reassignment is recorded in the audit trail", async () => {
  const result = await post(
    { action: "assign", caseId: CASE_ID, ownerId: TARGET_STAFF.id },
    { level: "branch_admin" },
  );
  const audit = result.requests.find((r) => r.path === "/rest/v1/audit_events");
  assert.equal(audit.body.action, "case.reassigned");
  assert.match(String(audit.body.summary), /Ravi Kumar/);
});

test("a write row-level security refused is reported, not reported as saved", async () => {
  // PostgREST answers 204/[] when the filter matched nothing the caller was
  // allowed to see. That used to come back to the person as a saved record.
  const result = await post(
    {
      action: "update_case",
      caseId: CASE_ID,
      clientId: "66666666-6666-4666-8666-666666666666",
      name: "Someone Else's Client",
      email: "someone@example.test",
      visaExpiry: "2030-01-01",
    },
    { level: "staff", patchBlocked: true },
  );
  assert.equal(result.status, 403);
  assert.match(result.body.error, /not yours to change/i);
});

test("a staff account can transfer a case they own", async () => {
  const result = await post(
    { action: "assign", caseId: CASE_ID, ownerId: TARGET_STAFF.id },
    { level: "staff" },
  );
  assert.equal(result.status, 200);
  assert.equal(
    result.requests.some((r) => r.method === "PATCH"),
    true,
  );
});

test("a case cannot be assigned to a portal account", async () => {
  const stubTarget = { ...TARGET_STAFF, level: "student" };
  const result = await post(
    { action: "assign", caseId: CASE_ID, ownerId: stubTarget.id },
    { level: "branch_admin", targetOverride: stubTarget },
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /portal account/i);
});

test("a case cannot be assigned to a deactivated account", async () => {
  const result = await post(
    { action: "assign", caseId: CASE_ID, ownerId: TARGET_STAFF.id },
    { level: "branch_admin", targetOverride: { ...TARGET_STAFF, active: false } },
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /deactivated/i);
});


// A deployment can be ahead of the Supabase schema, because migrations are
// applied separately. The CRM must stay usable and say what is needed.
test("a case can still be created against a database without the lifecycle migration", async () => {
  const result = await post(NEW_CASE, { lifecycleMigrationApplied: false });
  assert.equal(result.status, 200);
  const caseWrite = result.requests.find(
    (r) => r.path === "/rest/v1/cases" && r.method === "POST",
  );
  assert.equal(
    "visa_expiry_on" in caseWrite.body,
    false,
    "must not write a column the database does not have",
  );
});

test("moving a case without the migration explains what to apply", async () => {
  const result = await post(
    { action: "lifecycle", caseId: CASE_ID, stage: "visa" },
    { lifecycleMigrationApplied: false },
  );
  assert.equal(result.status, 400);
  assert.match(result.body.error, /0008_case_lifecycle\.sql/);
  assert.doesNotMatch(result.body.error, /schema cache/);
});

// Content and workflow masters stay writable only by management. Case finance
// follows the exact case-team boundary from migration 0032.
test("a case officer's invoice request reaches the database rather than being refused up front", async () => {
  const result = await post(
    { action: "invoice", caseId: CASE_ID, subtotal: "100", tax: "10" },
    { level: "staff" },
  );
  assert.equal(result.status, 200);
  assert.equal(
    result.requests.some((r) => r.path === "/rest/v1/invoices" && r.method === "POST"),
    true,
    "the route must let row-level security decide, not refuse it itself",
  );
});

test("a case officer is refused template creation with a clear reason", async () => {
  const result = await post(
    { action: "template", name: "T", templateType: "Email", content: "x" },
    { level: "staff" },
  );
  assert.equal(result.status, 403);
  assert.match(result.body.error, /manager or administrator/i);
});

test("a case officer can change permitted case invoices but not configuration", async () => {
  const invoice = await post(
    { action: "mutate", resource: "invoice", operation: "delete", id: CASE_ID },
    { level: "staff" },
  );
  assert.equal(invoice.status, 200);
  for (const resource of ["template", "workflow"]) {
    const result = await post(
      { action: "mutate", resource, operation: "delete", id: CASE_ID },
      { level: "staff" },
    );
    assert.equal(result.status, 403, `${resource} should be refused`);
  }
});

test("bulk task completion updates every selected record in one request", async () => {
  const result = await post({
    action: "bulk_mutate",
    resource: "task",
    operation: "toggle",
    ids: [CASE_ID, SECOND_ID],
    completed: true,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.succeeded, 2);
  assert.equal(result.body.failed, 0);
  const writes = result.requests.filter(
    (request) => request.path === "/rest/v1/tasks" && request.method === "PATCH",
  );
  assert.equal(writes.length, 2);
  assert.ok(writes.every((request) => request.body.status === "completed"));
});

test("bulk case finance is available while configuration keeps manager permissions", async () => {
  const invoice = await post(
    {
      action: "bulk_mutate",
      resource: "invoice",
      operation: "delete",
      ids: [CASE_ID, SECOND_ID],
    },
    { level: "staff" },
  );
  assert.equal(invoice.status, 200);
  for (const resource of ["template", "workflow"]) {
    const result = await post(
      {
        action: "bulk_mutate",
        resource,
        operation: resource === "workflow" ? "toggle" : "delete",
        ids: [CASE_ID, SECOND_ID],
        active: false,
      },
      { level: "staff" },
    );
    assert.equal(result.status, 403, `${resource} bulk change should be refused`);
  }
});

test("bulk lifecycle movement applies to every selected case", async () => {
  const result = await post({
    action: "bulk_lifecycle",
    caseIds: [CASE_ID, SECOND_ID],
    stage: "visa",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.succeeded, 2);
  const moves = result.requests.filter(
    (request) => request.path === "/rest/v1/rpc/move_case_lifecycle",
  );
  assert.equal(moves.length, 2);
  assert.ok(moves.every((request) => request.body.target_stage === "visa"));
});

test("a manager may create an invoice", async () => {
  const result = await post(
    { action: "invoice", caseId: CASE_ID, subtotal: "100", tax: "10", due: "2026-12-01" },
    { level: "branch_admin" },
  );
  assert.equal(result.status, 200);
  const write = result.requests.find((r) => r.path === "/rest/v1/invoices");
  assert.equal(write.body.subtotal, 100);
  assert.equal(write.body.tax, 10);
  assert.equal(write.body.total, 110);
  const pdfSlot = result.requests.find(
    (r) => r.path === "/rest/v1/documents" && r.method === "POST",
  );
  assert.equal(pdfSlot.body.metadata.source, "invoice_pdf");
  assert.equal(pdfSlot.body.document_type, "10 Accounts and Receipts");
});

test("case communication resolves the recipient from the current client profile", async () => {
  const result = await post({
    action: "message",
    caseId: CASE_ID,
    to: "wrong-person@example.test",
    subject: "Document update",
    body: "We have received your passport.",
  });
  assert.equal(result.status, 200);
  const message = result.requests.find(
    (r) => r.path === "/rest/v1/email_messages" && r.method === "POST",
  );
  assert.deepEqual(message.body.recipients, ["client@example.test"]);
  assert.equal(result.body.recipientSource, "case_profile");
});
