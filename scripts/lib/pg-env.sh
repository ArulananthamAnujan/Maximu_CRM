# Shared PostgreSQL setup for the verification scripts.
#
# Two modes:
#   external  PGHOST is already set (a CI service container). Used as-is.
#   local     no PGHOST: a throwaway cluster is created, owned by the
#             `postgres` system user and reached over a unix socket.
# shellcheck shell=bash

pg_setup() {
  local work="$1" port="$2"
  pgbin="${AUDIT_PGBIN:-/usr/lib/postgresql/16/bin}"
  export PATH="${pgbin}:${PATH}"

  if [[ -n "${PGHOST:-}" ]]; then
    PG_MODE="external"
    export PGPORT="${PGPORT:-5432}"
    export PGUSER="${PGUSER:-postgres}"
    export PG_SU=0
    command -v psql >/dev/null || { echo "psql is required." >&2; exit 69; }
    mkdir -p "${work}/sql"
    return
  fi

  PG_MODE="local"
  command -v initdb >/dev/null || { echo "postgresql-16 is required (or set PGHOST)." >&2; exit 69; }
  id postgres >/dev/null 2>&1 || { echo "a 'postgres' system user is required (or set PGHOST)." >&2; exit 69; }
  rm -rf "${work}"
  mkdir -p "${work}/data" "${work}/run" "${work}/sql"
  chown -R postgres:postgres "${work}"
  su postgres -c "PATH=${pgbin}:\$PATH initdb -D ${work}/data -U postgres --auth=trust" >/dev/null
  su postgres -c "PATH=${pgbin}:\$PATH pg_ctl -D ${work}/data -o '-k ${work}/run -p ${port} -c listen_addresses=' -l ${work}/pg.log -w start" >/dev/null
  export PGHOST="${work}/run" PGPORT="${port}" PGUSER="postgres" PG_SU=1
}

pg_stop() {
  local work="$1"
  [[ "${PG_MODE:-}" == "local" ]] || return 0
  su postgres -c "PATH=${pgbin}:\$PATH pg_ctl -D ${work}/data -m immediate stop" >/dev/null 2>&1 || true
}

# Runs psql with the given arguments. When the cluster is locally owned the
# call is wrapped in `su postgres`, which needs one shell string, so the
# arguments are quoted back together for that path only.
pg_psql() {
  if [[ "${PG_SU}" == "1" ]]; then
    local quoted=""
    local arg
    for arg in "$@"; do quoted+=" $(printf '%q' "${arg}")"; done
    su postgres -c "PATH=${pgbin}:\$PATH PGHOST=$(printf '%q' "${PGHOST}") PGPORT=$(printf '%q' "${PGPORT}") psql${quoted}"
  else
    psql "$@"
  fi
}

pg_run() {
  pg_psql -U "${PGUSER}" -d postgres -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null
}

# Both verification scripts rebuild everything from the migrations, and in CI
# they share one server, so start each run from empty schemas.
pg_reset_schemas() {
  pg_psql -U "${PGUSER}" -d postgres -q -c \
    'drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;' \
    >/dev/null 2>&1
}

pg_stage_sql() {
  local work="$1"; shift
  mkdir -p "${work}/sql"
  cp "$@" "${work}/sql/"
  if [[ "${PG_SU}" == "1" ]]; then chown -R postgres:postgres "${work}/sql"; fi
}
