#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
API_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-$API_DIR/.env.compose}
COMPOSE_FILE=${COMPOSE_FILE:-$API_DIR/compose.dev.yaml}
BACKUP_DIR=${BACKUP_DIR:-$API_DIR/.runtime/backups}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE=$BACKUP_DIR/psicodesk-$STAMP.dump

[ -f "$ENV_FILE" ] || { echo "arquivo de ambiente ausente: $ENV_FILE" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
umask 077

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -ec 'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$BACKUP_FILE"

[ -s "$BACKUP_FILE" ] || { echo "backup vazio; removendo artefato inválido" >&2; rm -f "$BACKUP_FILE"; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
fi

echo "backup PostgreSQL criado em $BACKUP_FILE"
echo "restauração deve ser ensaiada em banco descartável antes de produção"
