#!/usr/bin/env bash
# End-to-end tests in a real browser.
#
# Starts the whole stack the way verify-features.sh does -- a throwaway
# PostgreSQL database with every migration, the PostgREST stand-in and the Drive
# stub -- and additionally puts the built Worker on a port, so Playwright can
# click through the CRM the way a person does.
#
#   scripts/verify-ui.sh                  # throwaway local cluster
#   PGHOST=localhost PGPASSWORD=... \
#     scripts/verify-ui.sh                # existing server (CI)
#
# Requires node, openssl and a built Worker (npm run build).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${UI_DIR:-/var/lib/postgresql/crm-ui}"
[[ -n "${PGHOST:-}" ]] && work="${UI_DIR:-${root}/.crm-ui}"
port="${UI_PG_PORT:-5441}"
shim_port="${UI_SHIM_PORT:-8095}"
drive_port="${UI_DRIVE_PORT:-8094}"
worker_port="${UI_WORKER_PORT:-8100}"

# shellcheck source=scripts/lib/pg-env.sh
source "${root}/scripts/lib/pg-env.sh"

command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 69; }
[[ -f "${root}/dist/server/index.js" ]] || { echo "Run 'npm run build' first." >&2; exit 69; }

shim_pid=""; drive_pid=""; worker_pid=""
cleanup() {
  for pid in "${worker_pid}" "${drive_pid}" "${shim_pid}"; do
    [[ -n "${pid}" ]] && kill "${pid}" 2>/dev/null || true
  done
  pg_stop "${work}"
}
trap cleanup EXIT

pg_setup "${work}" "${port}"
mkdir -p "${work}/keys"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "${work}/keys/service.pem" 2>/dev/null
openssl pkey -in "${work}/keys/service.pem" -pubout -out "${work}/keys/service.pub" 2>/dev/null
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

SHIM_DEBUG="${SHIM_DEBUG:-}" SHIM_PORT="${shim_port}" node "${root}/scripts/audit/postgrest-shim.mjs" \
  >"${work}/shim.log" 2>&1 &
shim_pid=$!
DRIVE_STUB_PORT="${drive_port}" \
  DRIVE_STUB_PUBLIC_KEY="${work}/keys/service.pub" \
  DRIVE_STUB_SHARED_DRIVE_ID="shared-drive-root" \
  node "${root}/scripts/audit/google-drive-stub.mjs" >"${work}/drive.log" 2>&1 &
drive_pid=$!
sleep 2

SUPABASE_URL="http://127.0.0.1:${shim_port}" \
  GOOGLE_API_BASE="http://127.0.0.1:${drive_port}" \
  GOOGLE_TOKEN_BASE="http://127.0.0.1:${drive_port}" \
  GOOGLE_SERVICE_ACCOUNT_EMAIL="crm@maximus-test.iam.gserviceaccount.com" \
  GOOGLE_SHARED_DRIVE_ID="shared-drive-root" \
  GOOGLE_PRIVATE_KEY_FILE="${work}/keys/service.pem" \
  FIELD_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | base64)" \
  WORKER_PORT="${worker_port}" \
  node "${root}/scripts/audit/worker-server.mjs" >"${work}/worker.log" 2>&1 &
worker_pid=$!

# Wait for the application to answer before handing over to the browser.
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${worker_port}/" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.5
done
[[ "${ready:-}" == "1" ]] || {
  echo "The Worker did not start:"; cat "${work}/worker.log"; exit 70;
}

# Use a browser already on the machine when Playwright's own build is absent.
if [[ -z "${PLAYWRIGHT_CHROMIUM:-}" ]] && [[ -x /opt/pw-browsers/chromium ]]; then
  export PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium
fi

echo
E2E_BASE_URL="http://127.0.0.1:${worker_port}" npx playwright test "$@"
