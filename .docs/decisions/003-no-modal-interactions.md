# ADR-003 — Interações sem modais, inclusive diálogos nativos

- Status: aceito
- Data: 02/11/2026
- Responsável: mantenedores do PsicoDesk

## Contexto

O SDD proíbe modais de formulário e o usuário confirmou que essa restrição também inclui seletores nativos do sistema.

## Decisão

Edição contextual, confirmação e fluxos destrutivos usarão `RightPanel` ou páginas dedicadas. Arquivos e backups usarão locais administrados pelo aplicativo ou um navegador de arquivos interno restrito a raízes autorizadas pelo backend, sem abrir diálogos nativos.

## Alternativa descartada

Usar `open`, `save` ou `confirm` nativos seria mais simples, mas quebraria o contrato de interação confirmado e criaria comportamento visual inconsistente.

## Consequências

- Confirmações destrutivas exibem impacto e ação explícitos no painel lateral.
- O backend valida caminhos e limita qualquer navegação de arquivos a raízes autorizadas.
- Interações que o sistema operacional obrigar fora do controle da aplicação devem ser documentadas como limitação da plataforma, não simuladas por HTML inseguro.

## Gatilho de revisão

Revisar se uma exigência do Windows, acessibilidade ou segurança tornar indispensável um diálogo do sistema.
