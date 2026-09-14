import test from "node:test";
import assert from "node:assert/strict";

test("mobile OAuth configuration exposes only the public Supabase client values", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("https://crm.test/api/mobile/config"), {
    SUPABASE_URL: "https://mobile-example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key",
    SUPABASE_SERVICE_ROLE_KEY: "must-never-leave-server", ASSETS: { fetch: () => new Response("", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: "https://mobile-example.supabase.co", publishableKey: "public-key" });
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("mobile OAuth config rejects insecure and non-Supabase hosts", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  for (const url of ["http://mobile-example.supabase.co", "https://mobile-example.supabase.co.attacker.test"]) {
    const response = await worker.fetch(new Request("https://crm.test/api/mobile/config"), {
      SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: "public-key", ASSETS: { fetch: () => new Response("", { status: 404 }) },
    }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 503);
  }
});
