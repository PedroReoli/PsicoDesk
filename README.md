# PsicoDesk

Sistema desktop offline-first para gestão de clínicas de psicologia, com foco em privacidade, separação de perfis e operação local no Windows.

## Estado atual

O projeto está em fase de especificação. Ainda não há implementação do produto versionada neste repositório.

## Direção técnica proposta

- Tauri 2 e Rust como shell e fronteira confiável de autorização, persistência e acesso ao sistema.
- React e TypeScript strict para a interface.
- SQLite criptografado, migrações versionadas e chaves protegidas fora do banco.
- Operação offline por padrão e intercâmbio opcional por pacotes cifrados, assinados e auditáveis.
- Separação entre recepção, profissionais clínicos e financeiro, com autorização aplicada no backend local.
- Design System centralizado e `RightPanel` para fluxos contextuais, sem modais de formulário.

## Documentação

- [Software Design Document](.docs/software-design-document.md)
- [Decisões em aberto](.docs/open-decisions.md)
- [Referência visual](.docs/reference/psicodesk-sdd.png)

## Limites do MVP

Teleconsulta, faturamento de convênios, emissão fiscal integrada, chat, IA clínica e sincronização contínua não fazem parte do MVP proposto.

## Observação importante

Dados de saúde exigem validação clínica, jurídica e de privacidade antes de uso real. A especificação atual é uma proposta técnica, não uma homologação regulatória nem operacional.
