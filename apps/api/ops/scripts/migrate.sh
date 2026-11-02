#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
API_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-$API_DIR/.env.compose}
COMPOSE_FILE=${COMPOSE_FILE:-$API_DIR/compose.dev.yaml}

[ -f "$ENV_FILE" ] || { echo "arquivo de ambiente ausente: $ENV_FILE" >&2; exit 1; }
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate
