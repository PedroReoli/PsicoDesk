# PsicoDesk Mobile

Companion mobile offline-first do PsicoDesk, construído com Expo 58, Expo Router e React Native.

## Execução

1. Copie `.env.example` para `.env.local` e informe a URL HTTPS da API autorizada.
2. Execute `npm ci --ignore-scripts` na raiz do monorepo.
3. Use `npm run dev:mobile` e valide em dispositivo físico com Expo Development Build.

## Segurança e dados

- Tokens são armazenados no `expo-secure-store` e removidos no logout.
- O SQLite contém cache e fila de mutações; logout limpa os dados protegidos.
- O backup automático Android fica desabilitado para não copiar dados clínicos locais; o cache e os payloads da fila também são cifrados individualmente.
- A autorização visual segue os papéis do desktop, mas a API continua sendo a fronteira real de segurança.
- WebSocket usa ticket efêmero, evitando token de acesso na URL.
- Mutações recebem chave de idempotência e permanecem na fila durante indisponibilidade.
- Operações rejeitadas de forma permanente deixam de repetir após um limite e aparecem como pendência que requer atenção, sem salvar a mensagem externa no banco.
- A interface filtra campos por papel, mas a API continua responsável pela autorização e pela projeção mínima de cada resposta.

## Contrato esperado da API

O cliente espera os recursos clínicos versionados e os endpoints de autenticação, sincronização, upload e eventos em `apps/api`. A presença do código no monorepo não equivale a deploy: a API precisa ser configurada, publicada e homologada antes da sincronização real.

## Validação pendente

Tipagem e testes unitários fazem parte dos gates do monorepo. Build nativo distribuível, testes no runtime nativo, biometria, notificações e validação em aparelho físico permanecem pendentes.
