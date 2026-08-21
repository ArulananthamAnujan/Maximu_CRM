#!/usr/bin/env bash
# Prints migrations to stdout as one script, ready to paste into the Supabase
# SQL editor (Dashboard -> SQL Editor -> New query).
#
# Every migration is written to be safe to run more than once, so applying the
# whole set against a database that already has some of it is not harmful.
#
#   scripts/print-migrations.sh             # every migration
#   scripts/print-migrations.sh 0008        # 0008 and everything after it
#   scripts/print-migrations.sh > apply.sql
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
from="${1:-}"

shopt -s nullglob
migrations=("${root}"/supabase/migrations/*.sql)
(( ${#migrations[@]} )) || { echo "No migrations found." >&2; exit 66; }

printed=0
for migration in "${migrations[@]}"; do
  name="$(basename "${migration}")"
  [[ -z "${from}" || "${name}" > "${from}" || "${name}" == "${from}"* ]] || continue
  printf -- '-- ===================================================================\n'
  printf -- '-- %s\n' "${name}"
  printf -- '-- ===================================================================\n'
  cat "${migration}"
  printf '\n\n'
  printed=$((printed + 1))
done

(( printed )) || { echo "No migrations matched '${from}'." >&2; exit 66; }
