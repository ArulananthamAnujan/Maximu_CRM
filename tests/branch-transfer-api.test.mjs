import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

async function transfer({ level = "super_admin", failure, reason = "Requested handover" } = {}) {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const path = new URL(req.url, "http://stub").pathname;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ path, body, authorization: req.headers.authorization });
    const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (path === "/auth/v1/user") return send(200, { id: "actor", email: "actor@maximus.test" });
    if (path === "/rest/v1/profiles") return send(200, [{ id: "actor", organisation_id: "org", branch_id: "source", display_name: "Actor", email: "actor@maximus.test", active: true, level }]);
    if (path === "/rest/v1/rpc/transfer_case_branch") return failure ? send(400, failure) : send(200, { caseId: "case", branchId: "destination", branch: "Colombo" });
    return send(200, []);
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const worker = (await import(`../dist/server/index.js?transfer=${Math.random()}`)).default;
    const response = await worker.fetch(new Request("https://crm.maximus.test/api/crm/workspace", {
      method: "POST", headers: { cookie: "maximus_access=actor-session", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transfer_branch", caseId: "case", expectedBranchId: "source", destinationBranchId: "destination", reason }),
    }), { SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: "test-public", ASSETS: { fetch: async () => new Response("", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    return { status: response.status, result: await response.json(), calls };
  } finally { server.close(); }
}

test("Super Admin transfers through one atomic RPC with their own identity", async () => {
  const { status, result, calls } = await transfer();
  assert.equal(status, 200); assert.equal(result.transfer.branch, "Colombo");
  const mutations = calls.filter(call => call.body);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].authorization, "Bearer actor-session");
  assert.deepEqual(mutations[0].body, { p_case_id: "case", p_destination_branch_id: "destination", p_expected_branch_id: "source", p_reason: "Requested handover" });
});

test("Admin, Staff and clients cannot call the branch transfer RPC", async () => {
  for (const level of ["branch_admin", "staff", "student"]) {
    const { status, calls } = await transfer({ level });
    assert.equal(status, 403, level);
    assert.equal(calls.filter(call => call.path.endsWith("transfer_case_branch")).length, 0);
  }
});

test("stale branch selections return a readable conflict without partial writes", async () => {
  const { status, result, calls } = await transfer({ failure: { code: "40001", message: "The case branch changed. Refresh before transferring it." } });
  assert.equal(status, 409); assert.match(result.error, /Refresh before transferring/);
  assert.equal(calls.filter(call => call.body).length, 1);
});

test("blank transfer reasons are rejected before a database mutation", async () => {
  const { status, calls } = await transfer({ reason: "   " });
  assert.equal(status, 400); assert.equal(calls.filter(call => call.body).length, 0);
});
