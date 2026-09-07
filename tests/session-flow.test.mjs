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
  branch_id: null,
  display_name: "Test Staff",
  email: USER.email,
  level: "staff",
  department: "Operations",
  active: true,
};

/** Minimal Supabase stand-in: auth succeeds, every table reads empty. */
async function startStubSupabase({ failTable = "", referencedEnquiry = false, portal = false } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    requests.push(url.pathname + url.search);
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/auth/v1/token")
      return send(200, {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: USER,
      });
    if (url.pathname === "/auth/v1/user") return send(200, USER);
    if (url.pathname === "/rest/v1/profiles") return send(200, [{ ...PROFILE, level: portal ? "student" : PROFILE.level }]);
    const table = url.pathname.replace("/rest/v1/", "");
    if (referencedEnquiry) {
      const clientId = "33333333-3333-4333-8333-333333333333";
      const caseId = "44444444-4444-4444-8444-444444444444";
      if (table === "clients") return send(200,
        url.searchParams.has("current_lifecycle") ? [] : [{ id: clientId, first_name: "Nadia", last_name: "Rahman", email: "nadia@example.test", current_lifecycle: "enquiry" }]);
      if (table === "cases") return send(200,
        url.searchParams.has("lifecycle_stage") ? [] : [{ id: caseId, client_id: clientId, case_number: "CASE-TEST-1", service_type: "study_abroad", lifecycle_stage: "enquiry", opened_at: "2026-09-01T00:00:00Z" }]);
      if (table === "invoices") return send(200, [{ id: "55555555-5555-4555-8555-555555555555", client_id: clientId, case_id: caseId, invoice_number: "INV-TEST", invoice_type: "tuition", total: 100, currency: "AUD" }]);
    }
    if (failTable && table === failTable)
      return send(404, { message: `relation "public.${table}" does not exist` });
    return send(200, []);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("session-flow", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

async function signInAndLoadWorkspace(origin, options = {}) {
  const stub = await startStubSupabase(options);
  try {
    const worker = await loadWorker();
    const env = {
      SUPABASE_URL: stub.url,
      SUPABASE_PUBLISHABLE_KEY: "stub-publishable-key",
      ASSETS: { fetch: async () => new Response("", { status: 404 }) },
    };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const call = (path, init) =>
      worker.fetch(new Request(`${origin}${path}`, init), env, ctx);

    const login = await call("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER.email, password: "password" }),
    });
    const cookies = login.headers.getSetCookie();
    const workspace = await call("/api/crm/workspace", {
      headers: { cookie: cookies.map((c) => c.split(";")[0]).join("; ") },
    });
    return {
      requests: stub.requests,
      loginStatus: login.status,
      cookies,
      workspaceStatus: workspace.status,
      workspaceBody: await workspace.json(),
    };
  } finally {
    stub.server.close();
  }
}

test("https sign-in issues Secure session cookies", async () => {
  const result = await signInAndLoadWorkspace("https://crm.example");
  assert.equal(result.loginStatus, 200);
  assert.ok(result.cookies.length > 0, "sign-in must set session cookies");
  for (const value of result.cookies)
    assert.match(value, /;\s*Secure/, `expected Secure on: ${value}`);
});

test("insecure-origin sign-in omits Secure so the browser keeps the session", async () => {
  // A Secure cookie is discarded on http://, which used to make sign-in
  // return 200 while the workspace stayed unauthenticated.
  const result = await signInAndLoadWorkspace("http://terminal.local:5173");
  assert.equal(result.loginStatus, 200);
  assert.ok(result.cookies.length > 0, "sign-in must set session cookies");
  for (const value of result.cookies) {
    assert.doesNotMatch(value, /;\s*Secure/, `unexpected Secure on: ${value}`);
    assert.match(value, /HttpOnly/);
  }
});

test("a signed-in session reaches the workspace", async () => {
  const result = await signInAndLoadWorkspace("https://crm.example");
  assert.equal(result.workspaceStatus, 200);
  assert.equal(result.workspaceBody.identity.role, "staff");
  assert.deepEqual(result.workspaceBody.degraded, []);
});

test("one unavailable table degrades the workspace instead of signing the user out", async () => {
  const result = await signInAndLoadWorkspace("https://crm.example", {
    failTable: "appointments",
  });
  assert.equal(result.workspaceStatus, 200);
  assert.equal(result.workspaceBody.identity.role, "staff");
  assert.deepEqual(result.workspaceBody.degraded, ["appointments"]);
});

test("an unauthenticated workspace request is rejected", async () => {
  const stub = await startStubSupabase();
  try {
    const worker = await loadWorker();
    const response = await worker.fetch(
      new Request("https://crm.example/api/crm/workspace"),
      {
        SUPABASE_URL: stub.url,
        SUPABASE_PUBLISHABLE_KEY: "stub-publishable-key",
        ASSETS: { fetch: async () => new Response("", { status: 404 }) },
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 401);
  } finally {
    stub.server.close();
  }
});


test("an invoice retains its enquiry-stage client without loading the whole directory", async () => {
  const result = await signInAndLoadWorkspace("https://crm.example", { referencedEnquiry: true });
  assert.equal(result.workspaceStatus, 200);
  assert.equal(result.workspaceBody.invoices[0].client, "Nadia Rahman");
  assert.equal(result.workspaceBody.cases[0].name, "Nadia Rahman");
  const caseReads = result.requests.filter(path => path.startsWith("/rest/v1/cases?"));
  assert.ok(caseReads.some(path => path.includes("id=in.") || new URL(path, "http://stub").searchParams.get("limit") === "1"));
  assert.ok(caseReads.every(path => path.includes("lifecycle_stage=neq.enquiry") || path.includes("id=in.") || new URL(path, "http://stub").searchParams.get("limit") === "1"));
});

test("a client portal can display its own enquiry-stage journey", async () => {
  const result = await signInAndLoadWorkspace("https://crm.example", { referencedEnquiry: true, portal: true });
  assert.equal(result.workspaceBody.identity.role, "client");
  assert.equal(result.workspaceBody.cases[0].lifecycleStage, "enquiry");
  assert.equal(result.workspaceBody.cases[0].name, "Nadia Rahman");
});
