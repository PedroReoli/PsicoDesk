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

- MSI: `PsicoDesk_1.0.0_x64_en-US.msi` — SHA-256 `F6058C71D481A6E9AA5CCD7C24118ABD967F0711F4155F268C254ABEE275E1A2`.
- NSIS: `PsicoDesk_1.0.0_x64-setup.exe` — SHA-256 `18C18039FF54459E59993F4DAD3789F1FCBD469D4E6B265AC5791A3519CA5062`.
- Os artefatos estão sem Authenticode e podem acionar o SmartScreen.
- PostgreSQL/S3 reais, aparelho físico/iOS, publicação e homologações clínica/jurídica permanecem fora desta validação local.
