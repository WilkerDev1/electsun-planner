#!/usr/bin/env bash
# Copia consistente de la base (NF-06). Conserva 7 días.
set -euo pipefail
cd "$(dirname "$0")/.."
backup_root=${BACKUP_DIR:-/var/backups/electsun/planner}
umask 077
mkdir -p "$backup_root"
target="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$target"
compose=(docker compose -f compose.yaml)
"${compose[@]}" exec -T db pg_dump -U planner -d planner -Fc > "$target/planner.dump"
# .env no se copia: los secretos se guardan aparte y cifrados, no junto al dump.
cp compose.yaml Caddyfile "$target/"
sha256sum "$target/planner.dump" > "$target/SHA256SUMS"
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime +6 -exec rm -rf -- {} +
printf 'Backup: %s\n' "$target"
