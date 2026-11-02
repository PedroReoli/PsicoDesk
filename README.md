# PsicoDesk

Suíte open source para gestão de clínicas de psicologia. O desktop Windows funciona localmente e sem internet; a API de sincronização e o aplicativo móvel são componentes opcionais e já compartilham um protocolo de batches cifrados de ponta a ponta.

## Componentes

- `apps/desktop`: Tauri 2, Rust, React e TypeScript. Inclui pacientes, agenda, prontuário com adendos imutáveis, financeiro, documentos cifrados, relatórios, usuários, auditoria e backup.
- `apps/api`: Fastify e PostgreSQL para pareamento, diretório de dispositivos, transporte de batches cifrados, ACK idempotente e tickets WebSocket efêmeros.
- `apps/mobile`: Expo 58 e React Native, com chaves no SecureStore, projeção SQLite cifrada, fila offline, controle por papel e aplicação atômica dos batches.
- `packages/contracts`: contratos tipados entre a interface e os comandos Tauri.
- `packages/sync-protocol`: schemas compartilhados do protocolo de sincronização.

## Segurança e privacidade

O desktop usa SQLCipher, protege a chave local com DPAPI no Windows, deriva senhas com Argon2 e aplica autorização no backend Rust. Prontuários não são sobrescritos: correções são adendos auditáveis. Backups portáteis usam uma senha independente do perfil Windows. A sincronização é desabilitada por padrão e o aplicativo continua funcional sem API.

A API isola recursos por clínica e dispositivo, usa tokens curtos, idempotência, rate limit e tickets WebSocket de uso único. Ela recebe somente envelopes já cifrados e assinados pelos clientes; não recebe a chave de sincronização, a chave privada ou o conteúdo clínico em texto legível. PostgreSQL/S3 reais e a revisão jurídica ainda exigem homologação antes do uso com dados clínicos reais.

## Requisitos de desenvolvimento

- Node.js 24 ou superior e npm 11 ou superior.
- Rust estável e toolchain C++ do Visual Studio para o desktop Windows.
- Strawberry Perl no `PATH` para compilar OpenSSL/SQLCipher no Windows.
- PostgreSQL 16+ e armazenamento S3 compatível apenas para executar a API real.

## Desenvolvimento

```powershell
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build

npm run dev:desktop
npm run dev:api
npm run dev:mobile
```

Para gerar os instaladores locais do desktop:

```powershell
npm run tauri -- build
```

Variáveis de ambiente partem dos arquivos `.env.example`; nunca versione valores reais. A operação Docker/VPS está documentada em [`apps/api/README.md`](apps/api/README.md).

## Estado de validação

Os gates automatizados cobrem tipagem, lint, testes, build web, protocolo, API e backend Rust. Há testes HTTP reais entre o mobile e um servidor Fastify efêmero, além de testes do protocolo compartilhado e do cliente desktop. Permanecem como validações externas: aparelho móvel físico/iOS, Docker/PostgreSQL/S3 reais, assinatura Authenticode, deploy em VPS e revisão clínica/jurídica. Consulte o [relatório de prontidão](.docs/production-readiness.md) para a separação entre evidência local e dependências externas.

## Documentação

- [Software Design Document](.docs/software-design-document.md)
- [Decisões em aberto](.docs/open-decisions.md)
- [ADRs](.docs/decisions/)
- [Referência visual](.docs/reference/psicodesk-sdd.png)
- [Ícone mestre](.docs/brand/app-icon-master.png)

## Licença

AGPL-3.0-or-later. Consulte [LICENSE](LICENSE).
