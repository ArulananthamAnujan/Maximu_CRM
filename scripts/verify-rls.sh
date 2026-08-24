#!/usr/bin/env bash
# Applies every migration to a PostgreSQL database and checks that row-level
# security actually denies what it is supposed to deny.
#
# Supabase supplies auth.uid() from the request JWT. Locally that is stubbed by
# scripts/rls/00_supabase_shim.sql, which reads the impersonated user from a
# session setting, so each probe runs as a specific account.
#
#   scripts/verify-rls.sh                       # throwaway local cluster
#   PGHOST=localhost PGPASSWORD=... \
#     scripts/verify-rls.sh                     # existing server (CI)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${RLS_VERIFY_DIR:-/var/lib/postgresql/rls-verify}"
[[ -n "${PGHOST:-}" ]] && work="${RLS_VERIFY_DIR:-${root}/.rls-verify}"
port="${RLS_VERIFY_PORT:-5433}"

# shellcheck source=scripts/lib/pg-env.sh
source "${root}/scripts/lib/pg-env.sh"

trap 'pg_stop "${work}"' EXIT
pg_setup "${work}" "${port}"
pg_stage_sql "${work}" "${root}"/supabase/migrations/*.sql "${root}"/scripts/rls/*.sql

pg_reset_schemas
echo "Applying migrations..."
pg_run "${work}/sql/00_supabase_shim.sql"
for migration in "${root}"/supabase/migrations/*.sql; do
  name="$(basename "${migration}")"
  pg_run "${work}/sql/${name}"
  echo "  applied ${name}"
done

echo "Seeding an organisation, a linked student and an unrelated client..."
pg_run "${work}/sql/01_seed.sql"
pg_run "${work}/sql/02_seed_other_client.sql"

probe() { pg_psql -U app_user -d postgres -f "${work}/sql/$1"; }

failures=0
fail() { echo "  FAIL  $1"; failures=$((failures + 1)); }

echo
echo "== A portal (student) account must not read another client's records =="
reads="$(probe 03_probe_student_reads.sql 2>&1 | grep -v '^SET$\|Output format')"
echo "${reads}"
# Each line is "<table> <count>"; every count must be zero.
while read -r line; do
  [[ -z "${line}" ]] && continue
  count="${line##* }"
  [[ "${count}" == "0" ]] || fail "a portal account can read ${line% *} (${count} rows)"
done <<< "${reads}"

echo
echo "== A portal account must not write internal records =="
writes="$(probe 04_probe_student_writes.sql 2>&1 | grep -i notice)"
echo "${writes}"
while read -r line; do
  [[ -z "${line}" ]] && continue
  count="${line##* }"
  [[ "${count}" == "0" ]] || fail "a portal account wrote internal data: ${line}"
done <<< "${writes}"

echo
echo "== Case lifecycle transition rules =="
lifecycle="$(probe 05_lifecycle_rules.sql 2>&1)"
echo "${lifecycle}"
expect_in() { grep -qF "$2" <<< "${lifecycle}" || fail "$1"; }
expect_in "enquiry does not advance to student" "stage=student progress=35"
expect_in "the visa stage is entered without a visa expiry date" "Record the visa expiry date"
expect_in "a case completes from outside the visa stage" "A case can only be completed from the visa stage"
expect_in "a visa case does not complete" "stage=completed progress=100 closed=true"
expect_in "a completed case does not reopen" "closed=false reopened=true"
expect_in "a portal account can move a case" "You do not have access to this case"
expect_in "deferring a case throws away its progress" "stage=deferred progress=60 health=attention"
expect_in "a deferred case completes without being resumed" "A case can only be completed from the visa stage"
expect_in "a deferral is not recorded in the history" "application => deferred :: Student deferred to July intake"
expect_in "resuming from a deferral is not recorded" "deferred => application :: Enrolled for July"

echo
echo "== A case officer may work only the cases assigned to them =="
pg_run "${work}/sql/09_seed_third_staff.sql"
scope="$(probe 10_probe_staff_scope.sql 2>&1 | grep -v '^SET$\|Output format\|^UPDATE\|^INSERT')"
echo "${scope}"
expect_scope() { grep -qF "$2" <<< "${scope}" || fail "$1"; }
expect_scope "a colleague's case is hidden instead of read-only" "visible=1"
expect_scope "a case officer can edit a case that is not theirs" "edited=0"
expect_scope "a case officer can move a case that is not theirs" "This case is assigned to somebody else"
expect_scope "a case officer can edit another officer's client" "client_edited=0"
expect_scope "a case officer can add an application to another officer's case" "application_added=0"
expect_scope "reassignment does not grant access" "after_reassignment=1"
expect_scope "an administrator lost access" "admin_edited=1"
expect_scope "an archive request is not recorded" "archive_requests=1"
expect_scope "managers are not told about an archive request" "managers_notified=1"
expect_scope "the case owner cannot read the assistant's own interaction" "owner_reads=1"
expect_scope "a case that changed owner does not carry its history with it" "new_owner_reads=1"
expect_scope "a portal account can read an internal AI interaction" "portal_reads=0"
expect_scope "a portal account wrote an AI interaction against a case it cannot access" "portal_writes=0"
expect_scope "a colleague who does not yet own the case can see what its client has been billed" "invoice_visible_before_reassignment=0"
expect_scope "the case owner cannot see what their own client has been billed" "invoice_visible_to_owner=1"

echo
echo "== Duplicate clients are found before a second record is made =="
duplicates="$(probe 08_probe_duplicates.sql 2>&1 | grep -v '^SET$\|Output format\|^UPDATE')"
echo "${duplicates}"
expect_dup() { grep -qF "$2" <<< "${duplicates}" || fail "$1"; }
expect_dup "an existing client is not found by email" "email:MAX-2026-0001:email"
expect_dup "an existing client is not found by mobile" "mobile:MAX-2026-0001:mobile"
expect_dup "an existing client is not found by passport" "passport:MAX-2026-0001:passport"
expect_dup "an existing client is not found by name" "name:MAX-2026-0001:name:cases=1"
expect_dup "a genuinely new person is reported as a duplicate" "new:0"
expect_dup "a portal account is shown another client through the duplicate check" "portal:0"

echo
echo "== Case reassignment and owner notification =="
pg_run "${work}/sql/06_seed_second_staff.sql"
assignment="$(probe 07_probe_assignment.sql 2>&1 | grep -v '^SET$\|Output format\|^INSERT\|^UPDATE')"
echo "${assignment}"
grep -qF "owner now = Ravi Kumar" <<< "${assignment}" || fail "the case was not reassigned"
grep -qF "ravi sees = 1" <<< "${assignment}" || fail "the new owner was not notified"
grep -qF "previous owner sees = 0" <<< "${assignment}" || fail "the previous owner can see the notification"
grep -qF "student sees = 0" <<< "${assignment}" || fail "a portal account can see the notification"

echo
if (( failures )); then
  echo "${failures} row-level security check(s) FAILED."
  exit 1
fi
echo "All row-level security checks passed."
