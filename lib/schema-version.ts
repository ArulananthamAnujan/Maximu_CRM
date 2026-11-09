/**
 * The database schema version this build expects: the file prefix of the
 * newest migration in supabase/migrations. Every migration bumps
 * public.schema_version() to its own prefix, and tests/schema-version.test.mjs
 * fails the build when this constant or that function falls behind, so a
 * deployment can always say exactly which migration a database is missing.
 */
export const EXPECTED_SCHEMA_VERSION = "20261109000000";

/** The first migration that records a version. A database without schema_version() is older than it. */
export const FIRST_VERSIONED_MIGRATION = "20261104020000_schema_version.sql";

/** The migrations a database that predates versioning may still be missing. */
const UNVERSIONED_TAIL_FROM = "20261103";

export type SchemaStatus = {
  expected: string;
  found: string | null;
  upToDate: boolean;
  hint: string | null;
};

export function schemaStatus(found: string | null): SchemaStatus {
  const expected = EXPECTED_SCHEMA_VERSION;
  if (found && found >= expected) return { expected, found, upToDate: true, hint: null };
  const from = found ?? UNVERSIONED_TAIL_FROM;
  const hint = found
    ? `This CRM needs a database update: the database is at migration ${found} and this build expects ${expected}. Apply the migrations after ${found} in supabase/migrations (scripts/print-migrations.sh ${found} prints them as one script), then reload.`
    : `This CRM needs a database update: apply the migrations from ${UNVERSIONED_TAIL_FROM} onwards in supabase/migrations (scripts/print-migrations.sh ${from} prints them as one script), then reload.`;
  return { expected, found, upToDate: false, hint };
}

/** PostgREST returns a text function's result as a JSON string; older code paths may wrap it. */
export function schemaVersionFromRpc(value: unknown): string | null {
  if (typeof value === "string" && /^\d{14}$/.test(value)) return value;
  if (value && typeof value === "object" && typeof (value as { schema_version?: unknown }).schema_version === "string") {
    return schemaVersionFromRpc((value as { schema_version: string }).schema_version);
  }
  return null;
}
