# Decisões em aberto

Este documento reúne decisões que precisam de validação antes de transformar o SDD em implementação. Nenhum item abaixo deve ser tratado como decidido por inferência.

## Decisões confirmadas em 02/11/2026

- Nome canônico: `PsicoDesk`.
- A referência visual será seguida em aproximadamente 80%, com melhorias justificadas de UX, acessibilidade e segurança.
- O objetivo é um produto final, não apenas um protótipo.
- O produto será open source.
- A primeira arquitetura operacional suporta apenas um PC, com múltiplos usuários locais.
- A proibição de modais também inclui seletores nativos do sistema; fluxos equivalentes devem ocorrer no `RightPanel` ou em páginas dedicadas.
- O desktop permanece local-first e funcional sem servidor; API, sincronização e mobile são componentes futuros, opcionais e opt-in, conforme ADR-004.

## Produto e identidade

1. Quais elementos dos 20% de liberdade visual devem ser avaliados com usuários no piloto?

## Descoberta e operação clínica

2. As entrevistas com psicólogos, recepção e administração da Fase 0 já ocorreram? Se sim, onde estão as evidências e decisões resultantes?
3. A matriz implementada de papéis e permissões atende ao proprietário, administrador, recepção, psicólogo e financeiro no piloto?
4. Quais campos, documentos, assinaturas, adendos e fluxos são obrigatórios na prática clínica escolhida para o piloto?
5. Quais regras de retenção, correção, exportação e eliminação foram validadas com assessoria jurídica e normas profissionais vigentes?

## Segurança e continuidade

6. Qual procedimento operacional será aprovado para recuperação e perda das chaves protegidas por DPAPI?
7. Qual política de recuperação de acesso e bloqueio por tentativas será adotada em computadores compartilhados?
8. Onde os backups serão armazenados e quais são os objetivos de recuperação e perda aceitável de dados?

## Arquitetura e distribuição

9. A instalação por usuário, sem privilégios administrativos por padrão, atende ao ambiente do piloto?
10. Qual provedor de VPS, região, domínio e política de observabilidade serão homologados para a sincronização opcional?

## Repositório remoto

11. Em qual conta ou organização do GitHub o repositório público será publicado?
