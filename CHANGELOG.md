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

- MSI: `PsicoDesk_1.0.0_x64_en-US.msi` — SHA-256 `F4AF6A65F0910BA350F3E1FCD0A35D4ED01CA7F339699D0B6C0E6B976DE4880B`.
- NSIS: `PsicoDesk_1.0.0_x64-setup.exe` — SHA-256 `155C9ECA7A917CF34C8C56625CA549B8EE065019566AB248653330AE869B1905`.
- Os artefatos estão sem Authenticode e podem acionar o SmartScreen.
- PostgreSQL/S3 reais, aparelho físico/iOS, publicação e homologações clínica/jurídica permanecem fora desta validação local.
