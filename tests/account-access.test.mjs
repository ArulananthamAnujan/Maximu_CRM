import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const actorId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const orgId = "33333333-3333-4333-8333-333333333333";
const branchId = "44444444-4444-4444-8444-444444444444";
const clientId = "55555555-5555-4555-8555-555555555555";
const email = "recipient@maximus.test";

async function exercise({ action = "create_staff", role = "super_admin", rejected = false, resend = false, portal = false, permitted = true, mismatch = false, otherBranch = false, resendProvider = false } = {}) {
  const requests = [];
  const profiles = new Map([[actorId, { id: actorId, organisation_id: orgId, branch_id: branchId, level: role, email: "actor@maximus.test", display_name: "Actor", active: true }]]);
  if (resend || portal) profiles.set(accountId, { id: accountId, organisation_id: orgId, branch_id: otherBranch ? clientId : branchId, level: portal ? "student" : "staff", email: mismatch ? "different@maximus.test" : email, display_name: "Recipient", active: true });
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const url = new URL(req.url, "http://stub");
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: req.method, body });
    const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/auth/v1/user") return send(200, { id: actorId, email: "actor@maximus.test" });
    if (url.pathname === "/rest/v1/profiles") {
      if (req.method === "POST") { profiles.set(body.id, body); return send(201, {}); }
      const id = url.searchParams.get("id")?.replace("eq.", "");
      if (id) return send(200, profiles.has(id) ? [profiles.get(id)] : []);
      const address = url.searchParams.get("email")?.replace("eq.", "");
      return send(200, [...profiles.values()].filter(p => !address || p.email === address));
    }
    if (url.pathname === "/rest/v1/branches") return send(200, [{ id: branchId }]);
    if (url.pathname === "/rest/v1/roles") return send(200, []);
    if (url.pathname === "/rest/v1/rpc/can_modify_client") return send(200, permitted);
    if (url.pathname === "/rest/v1/clients") return send(200, [{ id: clientId, branch_id: branchId, email, first_name: "Recipient", last_name: "Client" }]);
    if (url.pathname === "/rest/v1/client_user_links") return send(200, [{ profile_id: accountId }]);
    if (url.pathname === "/auth/v1/admin/users") return send(200, { id: accountId });
    if (url.pathname === "/auth/v1/admin/generate_link") return send(200, { action_link: "https://auth.maximus.test/verify?token=private-token" });
    if (["/auth/v1/recover", "/auth/v1/otp", "/emails"].includes(url.pathname)) return send(rejected ? 429 : 200, rejected ? { error: "Mail service rejected request" } : { id: "email-accepted" });
    return send(200, []);
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const worker = (await import(`../dist/server/index.js?account-access=${Date.now()}-${Math.random()}`)).default;
    const origin = `http://127.0.0.1:${server.address().port}`;
    const env = { SUPABASE_URL: origin, SUPABASE_PUBLISHABLE_KEY: "test-public", SUPABASE_SERVICE_ROLE_KEY: "test-service", ASSETS: { fetch: async () => new Response("", { status: 404 }) }, ...(resendProvider ? { RESEND_API_KEY: "test-email", RESEND_API_BASE: origin, RESEND_FROM_EMAIL: "Maximus <sender@maximus.test>" } : {}) };
    const response = await worker.fetch(new Request(`https://crm.maximus.test/api/crm/${portal ? "workspace" : "admin"}`, { method: "POST", headers: { cookie: "maximus_access=test-actor-session", "Content-Type": "application/json" }, body: JSON.stringify({ action: portal ? "send_portal_access" : action, email, displayName: "Recipient <Name>", branchId, level: "staff", profileId: accountId, clientId }) }), env, { waitUntil() {}, passThroughOnException() {} });
    return { status: response.status, result: await response.json(), requests, profiles };
  } finally { server.close(); }
}

test("new staff accounts send setup through the configured Auth mail service", async () => {
  const { status, result, requests } = await exercise();
  assert.equal(status, 200); assert.equal(result.emailSent, true);
  const mail = requests.find(r => r.path === "/auth/v1/recover");
  assert.equal(mail.body.email, email);
  assert.equal(mail.query.redirect_to, "https://crm.maximus.test/auth/google-callback?setup=1");
  assert.equal(result.setupLink, undefined); assert.equal(result.temporaryPassword, undefined);
});

test("email rejection preserves the new account and reports a retryable failure", async () => {
  const { result, requests, profiles } = await exercise({ rejected: true });
  assert.equal(result.ok, true); assert.equal(result.emailSent, false); assert.equal(result.deliveryStatus, "failed");
  assert.ok(profiles.has(accountId)); assert.match(result.message, /email was not sent/i);
  assert.ok(requests.some(r => r.path === "/rest/v1/audit_events" && r.body.action === "account.setup_email_failed"));
});

test("resending an account email sends again without creating another login", async () => {
  const { status, result, requests } = await exercise({ action: "resend_account_email", resend: true });
  assert.equal(status, 200); assert.equal(result.emailSent, true);
  assert.equal(requests.filter(r => r.path === "/auth/v1/admin/users").length, 0);
  assert.equal(requests.filter(r => r.path === "/auth/v1/recover").length, 1);
});

test("branch staff can trigger a permitted client's portal email", async () => {
  const { status, result, requests } = await exercise({ portal: true, role: "staff" });
  assert.equal(status, 200); assert.equal(result.emailSent, true);
  assert.equal(requests.find(r => r.path === "/auth/v1/recover").body.email, email);
});

test("cross-branch portal invitations are rejected before any privileged account call", async () => {
  const { status, requests } = await exercise({ portal: true, role: "staff", permitted: false });
  assert.equal(status, 403); assert.equal(requests.filter(r => r.path.startsWith("/auth/v1/admin") || r.path === "/auth/v1/recover").length, 0);
});

test("portal links with a mismatched email never send access to the wrong account", async () => {
  const { status, requests } = await exercise({ portal: true, role: "staff", mismatch: true });
  assert.equal(status, 400); assert.equal(requests.filter(r => r.path === "/auth/v1/recover").length, 0);
});

test("branch admins cannot resend another branch's account email", async () => {
  const { status, requests } = await exercise({ action: "resend_account_email", role: "branch_admin", resend: true, otherBranch: true });
  assert.equal(status, 403); assert.equal(requests.filter(r => r.path === "/auth/v1/recover").length, 0);
});

test("the transactional email path sends the private link only to the recipient", async () => {
  const { result, requests } = await exercise({ resendProvider: true });
  assert.equal(result.emailSent, true); assert.equal(result.setupLink, undefined);
  const generated = requests.find(r => r.path === "/auth/v1/admin/generate_link");
  assert.equal(generated.body.redirect_to, "https://crm.maximus.test/auth/google-callback?setup=1");
  const mail = requests.find(r => r.path === "/emails").body;
  assert.deepEqual(mail.to, [email]); assert.match(mail.html, /Recipient &lt;Name&gt;/); assert.match(mail.text, /private-token/);
});
