# PsicoDesk

Suíte open source para gestão de clínicas de psicologia. O desktop Windows funciona localmente e sem internet; a API de sincronização e o aplicativo móvel são componentes opcionais para uma evolução futura.

## Componentes

- `apps/desktop`: Tauri 2, Rust, React e TypeScript. Inclui pacientes, agenda, prontuário com adendos imutáveis, financeiro, documentos cifrados, relatórios, usuários, auditoria e backup.
- `apps/api`: Fastify e PostgreSQL para sincronização futura de cargas cifradas, uploads S3 privados e eventos WebSocket.
- `apps/mobile`: Expo 58 e React Native, com cache cifrado, fila offline, controle visual por papel e sincronização resiliente.
- `packages/contracts`: contratos tipados entre a interface e os comandos Tauri.
- `packages/sync-protocol`: schemas compartilhados do protocolo de sincronização.

## Segurança e privacidade

O desktop usa SQLCipher, protege a chave local com DPAPI no Windows, deriva senhas com Argon2 e aplica autorização no backend Rust. Prontuários não são sobrescritos: correções são adendos auditáveis. A sincronização é desabilitada por padrão e o aplicativo continua funcional sem API.

A API isola recursos por clínica e dispositivo, usa tokens curtos, idempotência, revisões otimistas, rate limit e URLs de upload privadas e temporárias. Ela transporta cargas já cifradas pelo cliente; ainda exige homologação com PostgreSQL/S3 reais e revisão jurídica antes de dados clínicos reais.

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

Os gates automatizados cobrem tipagem, lint, testes, build web, protocolo, API e backend Rust. A interface desktop foi inspecionada em navegador nas resoluções de referência. Permanecem como validações externas: aparelho móvel físico, Docker/PostgreSQL/S3 reais, assinatura Authenticode, deploy em VPS, restauração ensaiada e revisão clínica/jurídica.

## Documentação

- [Software Design Document](.docs/software-design-document.md)
- [Decisões em aberto](.docs/open-decisions.md)
- [ADRs](.docs/decisions/)
- [Referência visual](.docs/reference/psicodesk-sdd.png)
- [Ícone mestre](.docs/brand/app-icon-master.png)

## Licença

AGPL-3.0-or-later. Consulte [LICENSE](LICENSE).
