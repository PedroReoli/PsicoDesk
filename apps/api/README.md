# PsicoDesk Sync API

Serviço futuro para intercâmbio de cargas **já cifradas pelo cliente**. A API não recebe prontuários em texto claro e isola todos os dados por clínica e dispositivo.

## Execução local

Requer Node.js 24+, PostgreSQL 16+ e um bucket S3 privado. Copie `.env.example`, preencha segredos próprios e então execute, a partir da raiz do monorepo:

```powershell
npm run migrate --workspace @psicodesk/api
npm run dev --workspace @psicodesk/api
```

As migrations usam advisory lock, checksum e transação. Não altere uma migration já aplicada; crie a próxima versão.

### Ambiente Docker local

O Compose de desenvolvimento inicia PostgreSQL, armazenamento compatível com MinIO/S3 e a API sem publicar os serviços para a rede externa:

```sh
cp apps/api/.env.compose.example apps/api/.env.compose
# substitua todos os placeholders por valores locais únicos
apps/api/ops/scripts/start-local.sh
```

O serviço `minio` usa o fork SILO mantido pela comunidade, pois as imagens oficiais do MinIO deixaram de ser distribuídas. O contrato S3, as variáveis `MINIO_*`, o formato em disco e as rotas operacionais são preservados. A imagem está fixada em uma release; antes de qualquer promoção, revise a release e fixe também o digest da arquitetura alvo.

Comandos operacionais:

```sh
# aplicar somente migrations pendentes
apps/api/ops/scripts/migrate.sh

# criar pg_dump customizado com permissão restrita
apps/api/ops/scripts/backup-postgres.sh

# desligar sem apagar volumes
docker compose --env-file apps/api/.env.compose -f apps/api/compose.dev.yaml down
```

Nunca use `down -v` quando os volumes contiverem dados necessários. O backup do PostgreSQL não cobre os objetos S3: em produção, habilite versionamento e replicação do bucket para outro destino e ensaie restauração dos dois conjuntos.

## Superfícies

- `GET /health` e `GET /ready`: liveness e dependência PostgreSQL.
- `POST /v1/auth/token`: troca credencial de dispositivo por JWT de 15 minutos.
- `/v1/batches`: envio idempotente, status, payload restrito ao destinatário, confirmação e remoção lógica.
- `/v1/sync/push` e `/v1/sync/pull`: alterações cifradas, cursor monotônico e conflitos por revisão.
- `POST /v1/uploads/presign`: upload privado com MIME, extensão, nome e tamanho validados.
- `GET /v1/realtime`: WebSocket autenticado com eventos mínimos, sem PHI.
- `/documentation`: interface OpenAPI gerada das rotas registradas.

## Segurança operacional

Os dispositivos são provisionados diretamente no PostgreSQL nesta fase; não há endpoint público de cadastro. Armazene `secret_hash` como HMAC-SHA-256 com `DEVICE_SECRET_PEPPER`, mantenha o pepper e o segredo JWT fora do banco e rotacione ambos por procedimento controlado. O proxy reverso deve terminar TLS, limitar o corpo e preservar o IP real apenas de proxies confiáveis. Logs redigem autorização, cookies, segredos e payloads cifrados.

O adaptador S3 gera URLs de cinco minutos, exige criptografia SSE-S3 e nunca torna objetos públicos. A API ainda precisa de homologação com PostgreSQL/S3 reais, política de retenção operacional, rotação de chaves e observabilidade da infraestrutura antes de uso em produção.

## Preparação para VPS

Os arquivos em `ops/` são templates, não evidência de deploy:

1. publique a imagem construída de um commit aprovado em registro privado e use referência por digest;
2. copie `ops/compose.vps.example.yaml` para `ops/compose.vps.yaml` e `ops/Caddyfile.example` para `ops/Caddyfile`;
3. injete `.env.production` a partir do gerenciador de segredos, com permissão `0600` e sem versioná-lo;
4. mantenha PostgreSQL e S3 em rede privada, com usuários de menor privilégio, backup externo e alertas;
5. aponte `API_DOMAIN` para a VPS, libere somente TCP 80/443 e UDP 443 e valide a emissão TLS pelo Caddy;
6. execute `node dist/migrate.js` como job único antes de trocar o tráfego e somente após backup verificável;
7. confirme `/health`, `/ready`, autenticação sintética e um fluxo cifrado sem dados reais.

O Caddy termina TLS e encaminha WebSocket automaticamente. A aplicação permanece sem porta pública; não exponha PostgreSQL, S3 ou o console administrativo na VPS.

### Rollback

O rollback troca apenas a imagem por uma referência anterior imutável:

```sh
ENV_FILE=/srv/psicodesk-api/ops/.env.production \
  COMPOSE_FILE=/srv/psicodesk-api/ops/compose.vps.yaml \
  /srv/psicodesk-api/ops/scripts/rollback.sh \
  registry.example.invalid/psicodesk/api@sha256:digest-anterior
```

O script deliberadamente não desfaz migrations. Toda alteração de banco deve seguir expansão/contração e permanecer compatível com a versão anterior durante a janela de rollback. Se isso não for possível, interrompa a publicação e restaure em ambiente isolado a partir do backup em vez de executar SQL reverso improvisado.
