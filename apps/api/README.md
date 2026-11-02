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
- `POST /v1/devices/register`: consome enrollment token de uso único e registra a chave pública Ed25519 do dispositivo.
- `GET /v1/devices/peers`: lista somente peers ativos da mesma clínica para confirmação explícita de fingerprint.
- `POST /v1/auth/token`: troca credencial de dispositivo por JWT de 15 minutos.
- `/v1/batches`: protocolo canônico de envio idempotente, listagem por cursor, payload restrito ao destinatário, ACK e remoção lógica.
- `/v1/sync/push` e `/v1/sync/pull`: contrato legado/deprecated; clientes novos usam batches.
- `POST /v1/uploads/presign`: upload privado com MIME, extensão, nome e tamanho validados.
- `POST /v1/realtime/ticket` e `GET /v1/realtime?ticket=...`: WebSocket com ticket de 60 segundos e uso único.
- `/documentation`: interface OpenAPI gerada das rotas registradas.

## Segurança operacional

O primeiro dispositivo e um enrollment token são criados pelo bootstrap operacional; novos dispositivos usam o endpoint de registro. Armazene `secret_hash` como HMAC-SHA-256 com `DEVICE_SECRET_PEPPER`, mantenha o pepper e o segredo JWT fora do banco e rotacione ambos por procedimento controlado. O proxy reverso deve terminar TLS, limitar o corpo e preservar o IP real apenas de proxies confiáveis. Logs redigem autorização, cookies, segredos e payloads cifrados.

O adaptador S3 gera URLs de cinco minutos, exige criptografia SSE-S3 e nunca torna objetos públicos. A API ainda precisa de homologação com PostgreSQL/S3 reais, política de retenção operacional, rotação de chaves e observabilidade da infraestrutura antes de uso em produção.

### Bootstrap e pairing

Após as migrations, injete as variáveis abaixo por um gerenciador de segredos e execute `npm run bootstrap:clinic --workspace @psicodesk/api`. O comando é idempotente apenas quando as credenciais existentes coincidem; ele recusa sobrescrever identidade divergente e nunca imprime secrets ou enrollment token.

```text
BOOTSTRAP_CLINIC_ID=<uuid>
BOOTSTRAP_CLINIC_NAME=<nome>
BOOTSTRAP_DEVICE_ID=<uuid do desktop inicial>
BOOTSTRAP_DEVICE_NAME=<nome>
BOOTSTRAP_DEVICE_SECRET=<segredo aleatório com 32+ caracteres>
BOOTSTRAP_SIGNING_PUBLIC_KEY=<chave Ed25519 raw de 32 bytes em base64>
BOOTSTRAP_ENROLLMENT_TOKEN=<token aleatório com 32+ caracteres>
BOOTSTRAP_ENROLLMENT_TTL_HOURS=24
```

O bundle entregue por canal separado contém `clinicId`, enrollment token, `syncKey` AES-256, `keyId`, identidade esperada do peer e fingerprint Ed25519. A API recebe apenas clinic/device IDs, enrollment token e chaves públicas; nunca recebe `syncKey`, chave privada nem plaintext clínico. Depois do registro, o usuário confirma o fingerprint retornado por `/v1/devices/peers` contra o bundle antes de confiar no peer.

### Assinatura canônica do batch

`batchSigningPayload()` do pacote `@psicodesk/sync-protocol` gera UTF-8 com estes campos separados por `\n`, sem newline final:

```text
psicodesk-batch-v1
schemaVersion
batchId
originDeviceId
targetDeviceId
createdAt
expiresAt
contentHash em minúsculas
aes-256-gcm
keyId
nonce base64
payloadBase64
```

O remetente assina esses bytes com Ed25519. O receptor valida `signerPublicKey` pelo fingerprint previamente pareado, verifica assinatura e hash, e somente então decifra AES-256-GCM. A API valida a associação entre token, clínica, origem, chave pública registrada e destino, mas não decifra nem assina o payload.

Para E2E sem PostgreSQL/S3, `buildDeterministicTestApp()` e `startDeterministicTestServer()` estão exportados por `src/testing/test-app.ts`; `npm run test:server --workspace @psicodesk/api` inicia a fixture em porta efêmera.

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
