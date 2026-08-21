#!/usr/bin/env bash
# End-to-end functional audit: drives the built Worker through every CRM
# feature against a real PostgreSQL database with row-level security live.
#
# Supabase is not available locally, so scripts/audit/postgrest-shim.mjs speaks
# the slice of PostgREST this application uses, running every request as the
# `authenticated` role with auth.uid() set. That means the policies in
# supabase/migrations are genuinely exercised, not mocked.
#
# Usage: scripts/verify-features.sh     (needs postgresql-16, a `postgres` user, node)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${AUDIT_DIR:-/var/lib/postgresql/crm-audit}"
port="${AUDIT_PG_PORT:-5440}"
shim_port="${AUDIT_SHIM_PORT:-8099}"
pgbin="${AUDIT_PGBIN:-/usr/lib/postgresql/16/bin}"
export PATH="${pgbin}:${PATH}"

command -v initdb >/dev/null || { echo "postgresql-16 is required." >&2; exit 69; }
id postgres >/dev/null 2>&1 || { echo "a 'postgres' system user is required." >&2; exit 69; }
[[ -f "${root}/dist/server/index.js" ]] || { echo "Run 'npm run build' first." >&2; exit 69; }

as_postgres() { su postgres -c "PATH=${pgbin}:\$PATH $1"; }
shim_pid=""
cleanup() {
  [[ -n "${shim_pid}" ]] && kill "${shim_pid}" 2>/dev/null || true
  as_postgres "pg_ctl -D ${work}/data -m immediate stop" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "${work}"
mkdir -p "${work}/data" "${work}/run" "${work}/sql"
cp "${root}"/supabase/migrations/*.sql "${work}/sql/"
cp "${root}"/scripts/rls/00_supabase_shim.sql "${root}"/scripts/audit/seed.sql "${work}/sql/"
chown -R postgres:postgres "${work}"

as_postgres "initdb -D ${work}/data -U postgres --auth=trust" >/dev/null
as_postgres "pg_ctl -D ${work}/data -o '-k ${work}/run -p ${port} -c listen_addresses=' -l ${work}/pg.log -w start" >/dev/null

run() { as_postgres "psql -h ${work}/run -p ${port} -U postgres -q -v ON_ERROR_STOP=1 -f ${work}/sql/$1" >/dev/null; }
echo "Applying migrations..."
run 00_supabase_shim.sql
for migration in "${root}"/supabase/migrations/*.sql; do run "$(basename "${migration}")"; done
echo "Seeding a two-branch agency..."
run seed.sql

PGSOCK="${work}/run" PGPORT="${port}" SHIM_PORT="${shim_port}" \
  node "${root}/scripts/audit/postgrest-shim.mjs" >"${work}/shim.log" 2>&1 &
shim_pid=$!
sleep 2
kill -0 "${shim_pid}" 2>/dev/null || { echo "The PostgREST shim failed to start:"; cat "${work}/shim.log"; exit 70; }

echo
SHIM_URL="http://127.0.0.1:${shim_port}" node "${root}/scripts/audit/feature-audit.mjs"
