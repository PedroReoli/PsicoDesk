# PsicoDesk Mobile

Companion mobile offline-first do PsicoDesk, construído com Expo 58, Expo Router e React Native.

## Execução

1. Copie `.env.example` para `.env.local` e informe a URL HTTPS da API autorizada.
2. Execute `npm install` dentro desta pasta.
3. Use `npm start` e valide em dispositivo físico com Expo Development Build.

## Segurança e dados

- Tokens são armazenados no `expo-secure-store` e removidos no logout.
- O SQLite contém cache e fila de mutações; logout limpa os dados protegidos.
- A autorização visual segue os papéis do desktop, mas a API continua sendo a fronteira real de segurança.
- WebSocket usa ticket efêmero, evitando token de acesso na URL.
- Mutações recebem chave de idempotência e permanecem na fila durante indisponibilidade.

## Contrato esperado da API

O cliente espera `/v1/auth/*`, `/v1/dashboard`, `/v1/appointments`, `/v1/patients`, `/v1/clinical-records`, `/v1/charges`, `/v1/documents` e `/v1/events/ticket`. A implementação dessa API não pertence a esta árvore e precisa ser disponibilizada antes da sincronização real.

## Validação pendente

Dependências não foram instaladas nesta etapa. Build Expo, testes no runtime nativo, biometria, notificações e validação em aparelho físico permanecem pendentes.
