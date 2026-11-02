#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
API_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-$API_DIR/.env.compose}
COMPOSE_FILE=${COMPOSE_FILE:-$API_DIR/compose.dev.yaml}

command -v docker >/dev/null 2>&1 || { echo "docker não encontrado" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "crie $ENV_FILE a partir de .env.compose.example" >&2; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose config --quiet
compose up -d --wait postgres minio
compose run --rm minio-init
compose run --rm migrate
compose up -d --wait api

echo "API disponível apenas em http://127.0.0.1:${API_PORT:-8787}"
