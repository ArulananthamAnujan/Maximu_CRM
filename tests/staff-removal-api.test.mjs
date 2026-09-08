import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-000000000002";
const ORG = "00000000-0000-4000-8000-00000000aaaa";
const BRANCH = "00000000-0000-4000-8000-00000000bbbb";

async function admin({ action = "remove_staff", level = "super_admin", removed = false, missing = false, assigned = false, failAuth = false, failRetire = false, get = false, body: extra = {} } = {}) {
  const calls = [];
  const actor = { id: ACTOR, organisation_id: ORG, branch_id: BRANCH, display_name: "Owner", email: "owner@maximus.test", active: true, level };
  const person = { id: TARGET, organisation_id: ORG, branch_id: BRANCH, display_name: "Past Author", email: removed ? `removed+${TARGET}@accounts.invalid` : "staff@maximus.test", active: false, level: "staff" };
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://stub");
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ path: url.pathname, method: req.method, body, token: req.headers.authorization });
    const send = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname === "/auth/v1/user") return send(200, { id: ACTOR, email: actor.email });
    if (url.pathname === "/rest/v1/profiles") {
      if (req.method === "PATCH") return send(200, [{ id: TARGET }]);
      if (url.searchParams.get("id") === `eq.${ACTOR}`) return send(200, [actor]);
      if (url.searchParams.has("id") || url.searchParams.has("email")) return send(200, missing ? [] : [person]);
      return send(200, [actor, person]);
    }
    if (url.pathname === "/rest/v1/branches") return send(200, [{ id: BRANCH }]);
    if (url.pathname === "/rest/v1/cases") return send(200, assigned ? [{ id: "case" }] : []);
    if (url.pathname === `/auth/v1/admin/users/${TARGET}`) return send(failAuth ? 503 : 200, {});
    if (url.pathname === "/rest/v1/rpc/retire_staff_profile") return send(failRetire ? 503 : 200, { removed: true });
    return send(200, []);
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const worker = (await import(`../dist/server/index.js?staff=${Math.random()}`)).default;
    const response = await worker.fetch(new Request("https://crm.maximus.test/api/crm/admin", {
      method: get ? "GET" : "POST", headers: { cookie: "maximus_access=actor-session", "Content-Type": "application/json" },
      ...(get ? {} : { body: JSON.stringify({ action, profileId: TARGET, ...extra }) }),
    }), { SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: "test-public", SUPABASE_SERVICE_ROLE_KEY: "test-service", ASSETS: { fetch: async () => new Response("", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    return { status: response.status, result: await response.json(), calls };
  } finally { server.close(); }
}

test("staff deletion revokes Auth before atomically retiring the historical profile", async () => {
  const { status, result, calls } = await admin();
  assert.equal(status, 200); assert.equal(result.removedProfileId, TARGET);
  const writes = calls.filter(call => call.method !== "GET");
  assert.deepEqual(writes.map(call => call.path), ["/rest/v1/profiles", `/auth/v1/admin/users/${TARGET}`, "/rest/v1/rpc/retire_staff_profile"]);
  assert.deepEqual(writes[1].body, { should_soft_delete: true });
  assert.equal(writes[1].token, "Bearer test-service");
  assert.equal(writes[2].token, "Bearer actor-session");
  assert.match(result.message, /fresh account with staff@maximus.test/);
});

test("an unavailable target or open case prevents any destructive Auth call", async () => {
  for (const options of [{ missing: true }, { assigned: true }, { body: { profileId: ACTOR } }]) {
    const { status, calls } = await admin(options);
    assert.equal(status, 400); assert.equal(calls.filter(call => call.method !== "GET").length, 0);
  }
});

test("only Super Admin can delete staff accounts", async () => {
  for (const level of ["branch_admin", "staff", "student"]) {
    const { status, calls } = await admin({ level });
    assert.equal(status, 403); assert.equal(calls.filter(call => call.method !== "GET").length, 0);
  }
});

test("failed Auth or profile cleanup leaves an explicit retryable deletion error", async () => {
  for (const options of [{ failAuth: true }, { failRetire: true }]) {
    const { status, result, calls } = await admin(options);
    assert.equal(status, 400); assert.match(result.error, /permanent deletion did not finish.*Retry Delete account/);
    assert.deepEqual(calls.find(call => call.method === "PATCH").body, { active: false });
    if (options.failAuth) assert.equal(calls.filter(call => call.path.endsWith("retire_staff_profile")).length, 0);
  }
});

test("deleted staff disappear from team results while inactive staff remain discoverable", async () => {
  assert.equal((await admin({ get: true })).result.profiles.length, 2);
  const { result } = await admin({ get: true, removed: true });
  assert.deepEqual(result.profiles.map(row => row.id), [ACTOR]);
  const repeated = await admin({ removed: true });
  assert.equal(repeated.status, 200); assert.equal(repeated.calls.filter(call => call.method !== "GET").length, 0);
});

test("deleted profiles cannot be reactivated and duplicate inactive email points to the existing account", async () => {
  const denied = await admin({ action: "update_profile", removed: true, body: { active: true } });
  assert.equal(denied.status, 400); assert.equal(denied.calls.filter(call => call.method !== "GET").length, 0);
  const duplicate = await admin({ action: "create_staff", body: { displayName: "New Staff", email: "staff@maximus.test", branchId: BRANCH, level: "staff", roleId: BRANCH } });
  assert.equal(duplicate.status, 409); assert.equal(duplicate.result.existingAccount.profileId, TARGET);
  assert.match(duplicate.result.error, /deactivated account/);
});
