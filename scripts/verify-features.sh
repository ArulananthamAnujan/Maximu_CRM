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
drive_port="${AUDIT_DRIVE_PORT:-8098}"
ai_port="${AUDIT_AI_PORT:-8097}"

# shellcheck source=scripts/lib/pg-env.sh
source "${root}/scripts/lib/pg-env.sh"

[[ -f "${root}/dist/server/index.js" ]] || { echo "Run 'npm run build' first." >&2; exit 69; }

shim_pid=""
drive_pid=""
ai_pid=""
cleanup() {
  [[ -n "${shim_pid}" ]] && kill "${shim_pid}" 2>/dev/null || true
  [[ -n "${drive_pid}" ]] && kill "${drive_pid}" 2>/dev/null || true
  [[ -n "${ai_pid}" ]] && kill "${ai_pid}" 2>/dev/null || true
  pg_stop "${work}"
}
trap cleanup EXIT

command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 69; }

pg_setup "${work}" "${port}"

# The Drive stub verifies the RS256 assertion the application signs, so it needs
# a keypair. Generate a throwaway one per run rather than committing a private
# key: it exists only inside the run directory and grants access to nothing.
mkdir -p "${work}/keys"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "${work}/keys/service.pem" 2>/dev/null
openssl pkey -in "${work}/keys/service.pem" -pubout \
  -out "${work}/keys/service.pub" 2>/dev/null
chmod 600 "${work}/keys/service.pem"
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

# The shim requires this on the Supabase admin endpoints exactly as Supabase
# does, so the service-role path of staff creation is genuinely exercised.
service_role_key="audit-service-role-$(head -c 12 /dev/urandom | base64 | tr -d '/+=')"
SHIM_DEBUG="${SHIM_DEBUG:-}" SHIM_PORT="${shim_port}" \
  SHIM_SERVICE_ROLE_KEY="${service_role_key}" \
  node "${root}/scripts/audit/postgrest-shim.mjs" >"${work}/shim.log" 2>&1 &
shim_pid=$!
sleep 2
kill -0 "${shim_pid}" 2>/dev/null || { echo "The PostgREST shim failed to start:"; cat "${work}/shim.log"; exit 70; }

DRIVE_STUB_PORT="${drive_port}" \
  DRIVE_STUB_PUBLIC_KEY="${work}/keys/service.pub" \
  DRIVE_STUB_SHARED_DRIVE_ID="shared-drive-root" \
  node "${root}/scripts/audit/google-drive-stub.mjs" >"${work}/drive.log" 2>&1 &
drive_pid=$!
sleep 1
kill -0 "${drive_pid}" 2>/dev/null || { echo "The Drive stub failed to start:"; cat "${work}/drive.log"; exit 70; }

ai_key="audit-anthropic-$(head -c 12 /dev/urandom | base64 | tr -d '/+=')"
ANTHROPIC_STUB_PORT="${ai_port}" ANTHROPIC_STUB_KEY="${ai_key}" \
  node "${root}/scripts/audit/anthropic-stub.mjs" >"${work}/ai.log" 2>&1 &
ai_pid=$!
sleep 1
kill -0 "${ai_pid}" 2>/dev/null || { echo "The Anthropic stub failed to start:"; cat "${work}/ai.log"; exit 70; }

echo
SHIM_URL="http://127.0.0.1:${shim_port}" \
  GOOGLE_API_BASE="http://127.0.0.1:${drive_port}" \
  GOOGLE_TOKEN_BASE="http://127.0.0.1:${drive_port}" \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="crm@maximus-test.iam.gserviceaccount.com" \
  GOOGLE_SHARED_DRIVE_ID="shared-drive-root" \
  GOOGLE_PRIVATE_KEY_FILE="${work}/keys/service.pem" \
  DRIVE_STUB_URL="http://127.0.0.1:${drive_port}" \
  MAX_UPLOAD_MB="0.5" \
  FIELD_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | base64)" \
  SUPABASE_SERVICE_ROLE_KEY="${service_role_key}" \
  ANTHROPIC_API_KEY="${ai_key}" \
  ANTHROPIC_API_BASE="http://127.0.0.1:${ai_port}" \
  node "${root}/scripts/audit/feature-audit.mjs"
