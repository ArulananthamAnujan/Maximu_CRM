import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { deliverClientNotices } from "../netlify/lib/client-notice-delivery.mjs";

/**
 * Case email goes from the staff member's own connected Gmail, with the
 * system sender (Resend) only as the fallback. These drive the built Worker
 * the way a browser does, against a stand-in for Supabase, Google and Resend.
 */

const actorId = "11111111-1111-4111-8111-111111111111";
const orgId = "33333333-3333-4333-8333-333333333333";
const branchId = "44444444-4444-4444-8444-444444444444";
const claimId = "66666666-6666-4666-8666-666666666666";
const connectionId = "77777777-7777-4777-8777-777777777777";
const fieldKey = Buffer.alloc(32, 7).toString("base64");

/** The same "v1.<iv>.<ciphertext>" form server/protected-fields.ts writes, so the Worker can read the stored refresh token. */
async function protect(value) {
  const key = await crypto.subtle.importKey("raw", Buffer.from(fieldKey, "base64"), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1.${Buffer.from(iv).toString("base64")}.${Buffer.from(new Uint8Array(ciphertext)).toString("base64")}`;
}

async function exercise({ gmailConnected = true, resendProvider = false, gmailRefuses = false, rotate = false } = {}) {
  const requests = [];
  const tokenReference = await protect("refresh-token-secret");
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://stub");
    const type = req.headers["content-type"] || "";
    const json = raw && type.includes("json") ? JSON.parse(raw) : raw && type.includes("form") ? Object.fromEntries(new URLSearchParams(raw)) : raw;
    requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: req.method, body: json, headers: req.headers });
    const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (url.pathname === "/auth/v1/user") return send(200, { id: actorId, email: "olivia@maximus.test" });
    if (url.pathname === "/rest/v1/profiles") return send(200, [{ id: actorId, organisation_id: orgId, branch_id: branchId, level: "super_admin", email: "olivia@maximus.test", display_name: "Olivia Officer", active: true }]);
    if (url.pathname === "/rest/v1/commission_claims") return send(200, [{ id: claimId, invoice_number: "CI-2026-0001", expected_amount: 1200, received_amount: 0, net_amount: 1090.91, tax_rate: 10, tax_amount: 109.09, currency: "AUD", partner_name: "Example University", counterparty_email: "accounts@university.example" }]);
    if (url.pathname === "/rest/v1/mailbox_connections") {
      if (req.method === "PATCH") return send(204, {});
      return send(200, gmailConnected ? [{ id: connectionId, email: "olivia@maximus.test", token_reference: tokenReference, active: true }] : []);
    }
    if (url.pathname === "/token") return send(200, { access_token: "fresh-access", expires_in: 3600, ...(rotate ? { refresh_token: "rotated-refresh" } : {}) });
    if (url.pathname === "/gmail/v1/users/me/messages/send") return gmailRefuses ? send(403, { error: "insufficient scope" }) : send(200, { id: "gmail-message-1", threadId: "gmail-thread-1" });
    if (url.pathname === "/emails") return send(200, { id: "resend-receipt" });
    if (url.pathname === "/rest/v1/audit_events") return send(201, {});
    return send(200, []);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const previous = { GOOGLE_TOKEN_BASE: process.env.GOOGLE_TOKEN_BASE, GOOGLE_API_BASE: process.env.GOOGLE_API_BASE };
  process.env.GOOGLE_TOKEN_BASE = origin;
  process.env.GOOGLE_API_BASE = origin;
  try {
    const worker = (await import(`../dist/server/index.js?staff-mail=${Date.now()}-${Math.random()}`)).default;
    const env = {
      SUPABASE_URL: origin, SUPABASE_PUBLISHABLE_KEY: "test-public", SUPABASE_SERVICE_ROLE_KEY: "test-service",
      FIELD_ENCRYPTION_KEY: fieldKey, GOOGLE_OAUTH_CLIENT_ID: "client-id", GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      ASSETS: { fetch: async () => new Response("", { status: 404 }) },
      ...(resendProvider ? { RESEND_API_KEY: "test-email", RESEND_API_BASE: origin, RESEND_FROM_EMAIL: "Maximus <sender@maximus.test>" } : {}),
    };
    const response = await worker.fetch(new Request("https://crm.maximus.test/api/crm/operations", {
      method: "POST", headers: { cookie: "maximus_access=test-actor-session", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_commission_invoice", claimId }),
    }), env, { waitUntil() {}, passThroughOnException() {} });
    return { status: response.status, result: await response.json(), requests };
  } finally {
    server.close();
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
}

function decodeRaw(raw) {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

test("a commission invoice is sent from the officer's own Gmail, not the system sender", async () => {
  const { status, result, requests } = await exercise();
  assert.equal(status, 200, JSON.stringify(result));
  assert.equal(result.via, "gmail");
  assert.equal(result.from, "olivia@maximus.test");
  const refresh = requests.find((r) => r.path === "/token");
  assert.equal(refresh.body.grant_type, "refresh_token");
  assert.equal(refresh.body.refresh_token, "refresh-token-secret");
  const sent = requests.find((r) => r.path === "/gmail/v1/users/me/messages/send");
  assert.equal(sent.headers.authorization, "Bearer fresh-access");
  const message = decodeRaw(sent.body.raw);
  assert.match(message, /^From: Olivia Officer <olivia@maximus\.test>/m);
  assert.match(message, /^To: accounts@university\.example/m);
  assert.match(message, /CI-2026-0001/);
  assert.equal(requests.some((r) => r.path === "/emails"), false, "the system sender was not used");
  const audit = requests.find((r) => r.path === "/rest/v1/audit_events");
  assert.equal(audit.body.after_data.via, "gmail");
});

test("a rotated refresh token is kept, encrypted, against the connection", async () => {
  const { status, requests } = await exercise({ rotate: true });
  assert.equal(status, 200);
  const update = requests.find((r) => r.path === "/rest/v1/mailbox_connections" && r.method === "PATCH");
  assert.equal(update.query.id, `eq.${connectionId}`);
  assert.match(update.body.token_reference, /^v1\./);
  assert.notEqual(update.body.token_reference, "rotated-refresh");
});

test("without a connected Gmail and without a system sender the person is told to connect Gmail", async () => {
  const { status, result, requests } = await exercise({ gmailConnected: false });
  assert.equal(status, 503);
  assert.match(result.error, /Connect your Gmail account/);
  assert.equal(requests.some((r) => r.path === "/gmail/v1/users/me/messages/send"), false);
});

test("the system sender is only the fallback for someone without Gmail connected", async () => {
  const { status, result, requests } = await exercise({ gmailConnected: false, resendProvider: true });
  assert.equal(status, 200, JSON.stringify(result));
  assert.equal(result.via, "system");
  const provider = requests.find((r) => r.path === "/emails");
  assert.equal(provider.body.to[0], "accounts@university.example");
  assert.equal(requests.some((r) => r.path === "/gmail/v1/users/me/messages/send"), false);
});

test("when Gmail refuses, the system sender takes over and the Google response body is not repeated", async () => {
  const withFallback = await exercise({ gmailRefuses: true, resendProvider: true });
  assert.equal(withFallback.status, 200);
  assert.equal(withFallback.result.via, "system");
  const alone = await exercise({ gmailRefuses: true });
  assert.equal(alone.status, 503);
  assert.match(alone.result.error, /Gmail refused for olivia@maximus\.test \(HTTP 403\)/);
  assert.doesNotMatch(alone.result.error, /insufficient scope/);
});

test("a queued client notice is delivered by the injected sender without any system sender configured", async () => {
  const values = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "test-service", PRODUCTION_URL: "https://crm.example.test" };
  const row = { id: "notice-9", lock_token: "claim-9", case_id: "case-9", organisation_id: orgId, payload: { to: ["student@example.com"], subject: "Please upload your requested document", text: "Body" } };
  const calls = [];
  const delivered = [];
  const result = await deliverClientNotices({
    env: (k) => values[k] || "",
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); if (url.endsWith("claim_client_notices")) return Response.json([row]); return new Response(""); },
    send: async (claimed) => { delivered.push(claimed); return { id: "gmail-message-9" }; },
  });
  assert.equal(result.configured, true);
  assert.equal(result.sent, 1);
  assert.equal(delivered[0].id, "notice-9");
  const finish = JSON.parse(calls.at(-1).body);
  assert.equal(finish.p_status, "sent");
  assert.equal(finish.p_provider_id, "gmail-message-9");
  assert.equal(calls.some((c) => c.url.includes("api.resend.com")), false);
});

test("a notice the sender cannot deliver yet stays queued for the next attempt with a short reason", async () => {
  const values = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "test-service", PRODUCTION_URL: "https://crm.example.test" };
  const row = { id: "notice-10", lock_token: "claim-10", payload: { to: ["student@example.com"], subject: "S", text: "B" } };
  const calls = [];
  await deliverClientNotices({
    env: (k) => values[k] || "",
    fetchImpl: async (url, options) => { calls.push({ url, ...options }); if (url.endsWith("claim_client_notices")) return Response.json([row]); return new Response(""); },
    send: async () => { throw new Error("Connect your Gmail account under Integrations to send email from the CRM."); },
  });
  const finish = JSON.parse(calls.at(-1).body);
  assert.equal(finish.p_status, "queued");
  assert.match(finish.p_error, /Connect your Gmail account/);
});

test("without an injected sender the outbox still requires the system sender, as the scheduled function does", async () => {
  const values = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "test-service", PRODUCTION_URL: "https://crm.example.test" };
  let claimed = false;
  const result = await deliverClientNotices({ env: (k) => values[k] || "", fetchImpl: async (url) => { if (url.endsWith("claim_client_notices")) claimed = true; return Response.json([]); } });
  assert.equal(result.configured, false);
  assert.equal(claimed, false);
});
