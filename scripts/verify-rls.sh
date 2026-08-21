#!/usr/bin/env bash
# Applies every migration to a throwaway PostgreSQL cluster and checks that
# row-level security actually denies what it is supposed to deny.
#
# Supabase supplies `auth.uid()` from the request JWT. Locally that is stubbed
# by scripts/rls/00_supabase_shim.sql, which reads the impersonated user from a
# session setting, so each probe can run as a specific account.
#
# Usage: scripts/verify-rls.sh          (needs postgresql-16 and a `postgres` user)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${RLS_VERIFY_DIR:-/var/lib/postgresql/rls-verify}"
port="${RLS_VERIFY_PORT:-5433}"
pgbin="${RLS_VERIFY_PGBIN:-/usr/lib/postgresql/16/bin}"
export PATH="${pgbin}:${PATH}"
# `su` resets PATH, so every command run as postgres carries it explicitly.
as_postgres() { su postgres -c "PATH=${pgbin}:\$PATH $1"; }

command -v initdb >/dev/null || { echo "postgresql-16 is required." >&2; exit 69; }
id postgres >/dev/null 2>&1 || { echo "a 'postgres' system user is required." >&2; exit 69; }

cleanup() {
  as_postgres "pg_ctl -D ${work}/data -m immediate stop" >/dev/null 2>&1 || true
}
trap cleanup EXIT

rm -rf "${work}"
mkdir -p "${work}/data" "${work}/run" "${work}/sql"
cp "${root}"/supabase/migrations/*.sql "${work}/sql/"
cp "${root}"/scripts/rls/*.sql "${work}/sql/"
chown -R postgres:postgres "${work}"

as_postgres "initdb -D ${work}/data -U postgres --auth=trust" >/dev/null
as_postgres "pg_ctl -D ${work}/data -o '-k ${work}/run -p ${port} -c listen_addresses=' -l ${work}/pg.log -w start" >/dev/null

psql_as() { as_postgres "psql -h ${work}/run -p ${port} -U $1 -d postgres ${*:2}"; }
run() { psql_as postgres "-q -v ON_ERROR_STOP=1 -f ${work}/sql/$1" >/dev/null; }

echo "Applying migrations..."
run 00_supabase_shim.sql
for migration in "${root}"/supabase/migrations/*.sql; do
  name="$(basename "${migration}")"
  run "${name}"
  echo "  applied ${name}"
done

echo "Seeding an organisation, a linked student and an unrelated client..."
run 01_seed.sql
run 02_seed_other_client.sql

echo
echo "== A portal (student) account must not read another client's records =="
psql_as app_user "-f ${work}/sql/03_probe_student_reads.sql" 2>&1 |
  grep -v '^SET$\|Output format'

echo
echo "== A portal account must not write internal records =="
psql_as app_user "-f ${work}/sql/04_probe_student_writes.sql" 2>&1 | grep -i notice

echo
echo "== Case lifecycle transition rules =="
psql_as app_user "-f ${work}/sql/05_lifecycle_rules.sql" 2>&1

echo
echo "== Case reassignment and owner notification =="
run 06_seed_second_staff.sql
psql_as app_user "-f ${work}/sql/07_probe_assignment.sql" 2>&1 |
  grep -v '^SET$\|Output format\|^INSERT\|^UPDATE'

echo
echo "Every count in the portal probes must be 0, and every portal write must"
echo "report 0 rows. The reassignment probe must show the new owner and a"
echo "notification visible only to them."
