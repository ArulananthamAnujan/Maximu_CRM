#!/usr/bin/env bash
# PRINTS migration SQL to stdout. This file is a bash program, not SQL: run it,
# and paste its OUTPUT into the Supabase SQL editor. Pasting this file itself
# fails with: syntax error at or near "#!/".
#
# You do not need this to apply a migration. The files in supabase/migrations/
# are plain SQL and can be copied straight into the editor, in number order.
# This only exists to join several of them into one script.
#
# 0008 onwards are written to be safe to run more than once. 0001 to 0007 are
# first-run only and will report that objects already exist if repeated, so pass
# a starting migration rather than printing the whole set onto a live database.
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
