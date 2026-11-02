#!/usr/bin/env bash
# Restaura un backup en una base aislada y cuenta filas (NF-06).
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir=${1:?indica la carpeta del backup}
compose=(docker compose -f compose.yaml)
"${compose[@]}" exec -T db createdb -U planner planner_restore_check
trap '"${compose[@]}" exec -T db dropdb -U planner --if-exists planner_restore_check >/dev/null' EXIT
"${compose[@]}" exec -T db pg_restore --exit-on-error -U planner -d planner_restore_check < "$backup_dir/planner.dump"
"${compose[@]}" exec -T db psql -U planner -d planner_restore_check -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS users FROM users; SELECT count(*) AS projects FROM projects; SELECT count(*) AS employees FROM employees;'
printf 'Restauración aislada verificada.\n'
