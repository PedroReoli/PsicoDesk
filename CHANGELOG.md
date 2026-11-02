# Changelog

As mudanças relevantes deste projeto são registradas aqui. A versão 1.0.0 do desktop foi construída localmente em 2 de novembro de 2026, mas não foi publicada, enviada ou assinada digitalmente.

## Desktop 1.0.0 — build local

### Para usuários

- Gestão local de pacientes, agenda, prontuários e adendos, financeiro, documentos, relatórios e usuários.
- Edição de pacientes, remarcação e atualização de atendimentos e exportação controlada de documentos.
- Backup portátil cifrado para outro computador ou perfil Windows, com cópia de segurança antes da restauração.
- Recuperação offline do proprietário por código descartável exibido uma única vez.
- Sincronização opcional e desabilitada por padrão; o desktop continua funcionando sem API e sem internet.

### Técnico

- SQLCipher com chave local protegida por DPAPI e autorização aplicada nos comandos Rust.
- Batches AES-256-GCM assinados com Ed25519, `keyId` explícito, outbox persistente, cursor e ACK idempotente.
- API com pareamento de dispositivos, tokens curtos, transporte opaco e tickets WebSocket de uso único.
- Mobile com SecureStore, projeção SQLite cifrada, inbox atômico e E2E HTTP contra Fastify real.
- Correções de autorização horizontal em agenda, prontuário e documentos.

### Evidência do build local

- MSI: `PsicoDesk_1.0.0_x64_en-US.msi` — SHA-256 `5BC1B70EF497B70C4EB5DCE207FF1A0B4847969B3A7F4F5EBAC333A08D2D3F0C`.
- NSIS: `PsicoDesk_1.0.0_x64-setup.exe` — SHA-256 `BD58697CE2C7439919BBB802E67AE2B949055DBF69499DE2024B4BF3CB87691A`.
- Os artefatos estão sem Authenticode e podem acionar o SmartScreen.
- PostgreSQL/S3 reais, aparelho físico/iOS, publicação e homologações clínica/jurídica permanecem fora desta validação local.
