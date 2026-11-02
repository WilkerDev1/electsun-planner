#!/usr/bin/env bash
# Demo local completa en http://localhost:8091 con datos ficticios.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  umask 077
  cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
HTTP_PORT=${HTTP_PORT:-8091}
APP_ORIGIN=http://localhost:${HTTP_PORT:-8091}
COOKIE_SECURE=false
BOOTSTRAP_EMAIL=admin@example.test
BOOTSTRAP_NAME="Administrador demo"
BOOTSTRAP_PASSWORD=$(openssl rand -base64 18 | tr -d '\n')
SEED_DEMO=true
SEED_OFFICE_EMAIL=oficina@example.test
SEED_OFFICE_PASSWORD=$(openssl rand -base64 18 | tr -d '\n')
PLANNER_TODAY=
ENV
fi
docker compose -f compose.yaml -f compose.local.yaml up -d --build --wait
port=$(grep -E '^HTTP_PORT=' .env | cut -d= -f2)
printf 'Electsun Planner: http://localhost:%s\nCuentas y contraseñas iniciales: consulta .env (archivo privado).\n' "${port:-8091}"
