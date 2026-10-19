import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const id = "11111111-1111-4111-8111-111111111111";
test("saved filters use the caller's identity and upsert by personal view name", async () => {
  const writes = [];
  const server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://stub");
    let result = [];
    if (url.pathname === "/auth/v1/user") result = { id };
    else if (url.pathname === "/rest/v1/profiles") result = [{ id, organisation_id: id, branch_id: id, display_name: "Staff", active: true, level: "staff" }];
    else if (url.pathname === "/rest/v1/saved_views" && req.method === "POST") {
      writes.push({ body: JSON.parse(raw), conflict: url.searchParams.get("on_conflict"), auth: req.headers.authorization, prefer: req.headers.prefer });
    }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    const worker = (await import("../dist/server/index.js")).default;
    const run = (body, cookie = "maximus_access=staff-test") => worker.fetch(new Request("https://crm.example/api/crm/saved-views", {
      method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { SUPABASE_URL: "http://127.0.0.1:" + server.address().port, SUPABASE_PUBLISHABLE_KEY: "test", ASSETS: { fetch: async () => new Response("", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    const body = { action: "create", module: "students", name: "My Australia list", profile_id: "attacker-selected-owner", filters: { values: { destination: "Australia" }, visible: ["destination"], query: "" } };
    assert.equal((await run(body)).status, 200);
    assert.equal((await run(body)).status, 200);
    assert.equal(writes.length, 2);
    for (const write of writes) {
      assert.equal(write.body.profile_id, id);
      assert.equal(write.body.organisation_id, id);
      assert.equal(write.body.id, undefined);
      assert.equal(write.conflict, "profile_id,module,name");
      assert.equal(write.auth, "Bearer staff-test");
      assert.match(write.prefer, /resolution=merge-duplicates/);
      assert.deepEqual(write.body.filters, body.filters);
    }
    assert.equal((await run({ ...body, name: "x".repeat(81) })).status, 400);
    assert.equal((await run(body, "")).status, 401);
    assert.equal(writes.length, 2);
  } finally { server.close(); }
});
