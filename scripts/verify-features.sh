#!/usr/bin/env bash
# End-to-end functional audit: drives the built Worker through every CRM
# feature against a real PostgreSQL database with row-level security live.
#
# Supabase is not available here, so scripts/audit/postgrest-shim.mjs speaks the
# slice of PostgREST this application uses and runs every request as the
# `authenticated` role with auth.uid() set, so the policies in
# supabase/migrations are genuinely exercised rather than mocked.
#
#   scripts/verify-features.sh            # creates a throwaway local cluster
#   PGHOST=localhost PGPASSWORD=... \
#     scripts/verify-features.sh          # uses an existing server (CI)
#
# Requires node and a built Worker (npm run build).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${AUDIT_DIR:-/var/lib/postgresql/crm-audit}"
[[ -n "${PGHOST:-}" ]] && work="${AUDIT_DIR:-${root}/.crm-audit}"
port="${AUDIT_PG_PORT:-5440}"
shim_port="${AUDIT_SHIM_PORT:-8099}"

# shellcheck source=scripts/lib/pg-env.sh
source "${root}/scripts/lib/pg-env.sh"

[[ -f "${root}/dist/server/index.js" ]] || { echo "Run 'npm run build' first." >&2; exit 69; }

shim_pid=""
cleanup() {
  [[ -n "${shim_pid}" ]] && kill "${shim_pid}" 2>/dev/null || true
  pg_stop "${work}"
}
trap cleanup EXIT

pg_setup "${work}" "${port}"
pg_stage_sql "${work}" "${root}"/supabase/migrations/*.sql \
  "${root}/scripts/rls/00_supabase_shim.sql" "${root}/scripts/audit/seed.sql"

pg_reset_schemas
echo "Applying migrations..."
pg_run "${work}/sql/00_supabase_shim.sql"
for migration in "${root}"/supabase/migrations/*.sql; do
  pg_run "${work}/sql/$(basename "${migration}")"
done
echo "Seeding a two-branch agency..."
pg_run "${work}/sql/seed.sql"

SHIM_DEBUG="${SHIM_DEBUG:-}" SHIM_PORT="${shim_port}" node "${root}/scripts/audit/postgrest-shim.mjs" >"${work}/shim.log" 2>&1 &
shim_pid=$!
sleep 2
kill -0 "${shim_pid}" 2>/dev/null || { echo "The PostgREST shim failed to start:"; cat "${work}/shim.log"; exit 70; }

echo
SHIM_URL="http://127.0.0.1:${shim_port}" node "${root}/scripts/audit/feature-audit.mjs"
