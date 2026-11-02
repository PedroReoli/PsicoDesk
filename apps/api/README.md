# PsicoDesk Sync API

Serviço futuro para intercâmbio de cargas **já cifradas pelo cliente**. A API não recebe prontuários em texto claro e isola todos os dados por clínica e dispositivo.

## Execução local

Requer Node.js 24+, PostgreSQL 16+ e um bucket S3 privado. Copie `.env.example`, preencha segredos próprios e então execute, a partir da raiz do monorepo:

```powershell
npm run migrate --workspace @psicodesk/api
npm run dev --workspace @psicodesk/api
```

As migrations usam advisory lock, checksum e transação. Não altere uma migration já aplicada; crie a próxima versão.

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
