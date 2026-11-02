# Decisões em aberto

Este documento reúne decisões que precisam de validação antes de transformar o SDD em implementação. Nenhum item abaixo deve ser tratado como decidido por inferência.

## Decisões confirmadas em 02/11/2026

- Nome canônico: `PsicoDesk`.
- A referência visual será seguida em aproximadamente 80%, com melhorias justificadas de UX, acessibilidade e segurança.
- O objetivo é um produto final, não apenas um protótipo.
- O produto será open source.
- A primeira arquitetura operacional suporta apenas um PC, com múltiplos usuários locais.
- A proibição de modais também inclui seletores nativos do sistema; fluxos equivalentes devem ocorrer no `RightPanel` ou em páginas dedicadas.
- O intercâmbio por API e a sincronização multi-PC ficam fora da arquitetura ativa enquanto o produto for single-PC.

## Produto e identidade

1. Quais elementos dos 20% de liberdade visual devem ser avaliados com usuários no piloto?

## Descoberta e operação clínica

4. As entrevistas com psicólogos, recepção e administração da Fase 0 já ocorreram? Se sim, onde estão as evidências e decisões resultantes?
5. Qual é a matriz inicial de papéis e permissões, inclusive para proprietário da clínica, administrador, recepção, psicólogo e financeiro?
6. Quais campos, documentos, assinaturas, adendos e fluxos são obrigatórios na prática clínica escolhida para o piloto?
7. Quais regras de retenção, correção, exportação e eliminação foram validadas com assessoria jurídica e normas profissionais vigentes?

## Segurança e continuidade

8. Qual estratégia será adotada para criptografia e recuperação: SQLCipher, criptografia por campo/anexo ou modelo híbrido?
9. Como ocorrerão criação, proteção, rotação, recuperação e perda das chaves em um computador offline?
10. Qual é a política de sessão local, recuperação de acesso e bloqueio por tentativas em computadores compartilhados?
11. Onde os backups serão armazenados e quais são os objetivos de recuperação e perda aceitável de dados?

## Arquitetura e distribuição

12. A instalação por usuário, sem privilégios administrativos por padrão, atende ao ambiente do piloto?

## Repositório remoto

13. Em qual conta ou organização do GitHub o repositório público será publicado?
