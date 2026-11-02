# ADR-002 — Licença AGPL-3.0-or-later

- Status: aceito
- Data: 02/11/2026
- Responsável: mantenedores do PsicoDesk

## Contexto

O usuário definiu o PsicoDesk como software open source e delegou a escolha da licença. O projeto pode ganhar componentes de rede no futuro, mesmo que a arquitetura atual seja exclusivamente local.

## Decisão

Adotar `AGPL-3.0-or-later`. Modificações distribuídas e versões oferecidas como serviço devem preservar as liberdades e disponibilizar o código-fonte correspondente conforme os termos da licença.

## Alternativa descartada

Licenças permissivas como MIT ou Apache-2.0 facilitariam incorporação proprietária sem obrigação equivalente de compartilhar melhorias. Essa consequência não protege o objetivo de manter a evolução do produto aberta.

## Consequências

- Dependências e contribuições precisam ser compatíveis com AGPL-3.0-or-later.
- Distribuições devem incluir licença e avisos aplicáveis.
- Esta decisão não substitui revisão jurídica antes de distribuição comercial ou integração com componentes de licença incompatível.

## Gatilho de revisão

Revisar antes da primeira distribuição pública caso o modelo de contribuição ou dependências essenciais exija outra licença compatível com o objetivo open source.
