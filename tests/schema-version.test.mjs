import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { EXPECTED_SCHEMA_VERSION, schemaStatus, schemaVersionFromRpc } from "../lib/schema-version.ts";

const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
const newest = migrations[migrations.length - 1];
const prefix = newest.split("_")[0];

test("the expected schema version is the newest migration's prefix", () => {
  assert.equal(EXPECTED_SCHEMA_VERSION, prefix, `Bump EXPECTED_SCHEMA_VERSION in lib/schema-version.ts to ${prefix} (newest migration ${newest}).`);
});

test("the newest migration sets public.schema_version() to its own prefix", () => {
  const sql = readFileSync(`supabase/migrations/${newest}`, "utf8");
  assert.match(sql, /create or replace function public\.schema_version\(\)/, `${newest} must end by redefining public.schema_version().`);
  assert.ok(sql.includes(`select '${prefix}'`), `${newest} must select '${prefix}' in public.schema_version().`);
});

test("a database that is behind is told which migrations to apply", () => {
  assert.equal(schemaStatus(EXPECTED_SCHEMA_VERSION).upToDate, true);
  assert.equal(schemaStatus("99991231000000").upToDate, true, "a database ahead of the build is not an error");
  const missing = schemaStatus(null);
  assert.equal(missing.upToDate, false);
  assert.match(missing.hint, /print-migrations\.sh 20261103/);
  const behind = schemaStatus("20261104000000");
  assert.equal(behind.upToDate, false);
  assert.match(behind.hint, /print-migrations\.sh 20261104000000/);
  assert.match(behind.hint, new RegExp(EXPECTED_SCHEMA_VERSION));
});

test("the RPC result is read whether PostgREST returns a string or a row", () => {
  assert.equal(schemaVersionFromRpc("20261104020000"), "20261104020000");
  assert.equal(schemaVersionFromRpc({ schema_version: "20261104020000" }), "20261104020000");
  assert.equal(schemaVersionFromRpc("not a version"), null);
  assert.equal(schemaVersionFromRpc(null), null);
});
