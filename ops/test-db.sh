#!/usr/bin/env bash
# Base local para pruebas de integración (NF-07): postgres:16 en 127.0.0.1:5544, base planner_test.
set -euo pipefail
name=planner-test-db
if ! docker ps --format '{{.Names}}' | grep -qx "$name"; then
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -p 127.0.0.1:5544:5432 \
    -e POSTGRES_USER=planner -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=planner_test \
    --tmpfs /var/lib/postgresql/data postgres:16 >/dev/null
fi
for _ in $(seq 1 30); do
  docker exec "$name" pg_isready -U planner -d planner_test >/dev/null 2>&1 && { echo "planner_test lista en 127.0.0.1:5544"; exit 0; }
  sleep 1
done
echo "La base de pruebas no respondió" >&2
exit 1
