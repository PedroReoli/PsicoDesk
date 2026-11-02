#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "uso: $0 registry.example/api@sha256:digest-anterior" >&2
  exit 2
fi

TARGET_IMAGE=$1
case "$TARGET_IMAGE" in
  *:latest|*:edge) echo "rollback exige tag ou digest imutável" >&2; exit 2 ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OPS_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$OPS_DIR/compose.vps.yaml}
ENV_FILE=${ENV_FILE:-$OPS_DIR/.env.production}

[ -f "$COMPOSE_FILE" ] || { echo "compose ausente: $COMPOSE_FILE" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ambiente ausente: $ENV_FILE" >&2; exit 1; }

export PSICODESK_API_IMAGE=$TARGET_IMAGE
export PSICODESK_ENV_FILE=$ENV_FILE
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull api
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --no-deps --wait api

echo "imagem anterior restaurada: $TARGET_IMAGE"
echo "nenhuma migration foi revertida; confirme compatibilidade expand/contract e execute smoke tests"
