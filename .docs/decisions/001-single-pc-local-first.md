# ADR-001 — Arquitetura local-first em um único PC

- Status: aceito
- Data: 02/11/2026
- Responsável: mantenedores do PsicoDesk

## Contexto

O PsicoDesk manipula dados clínicos sensíveis e precisa operar sem internet. O usuário confirmou que a versão final será utilizada em apenas um PC, embora possa possuir múltiplos perfis locais.

## Decisão

A base operacional, autenticação, autorização, auditoria, anexos e backups permanecem locais. O frontend acessa dados exclusivamente por comandos Tauri validados no Rust. Não haverá API operacional, sincronização contínua nem intercâmbio multi-PC nesta arquitetura.

## Alternativa descartada

Uma API central com colaboração entre PCs foi descartada porque adicionaria superfície de ataque, dependência de rede e resolução de conflitos sem necessidade atual confirmada.

## Consequências

- O aplicativo abre e executa os fluxos essenciais offline.
- Perfis distintos compartilham a mesma instalação, com sessões e permissões separadas.
- Backup e restauração são requisitos críticos para continuidade.
- Uma futura versão multi-PC exigirá nova ADR, modelo de propriedade e migração explícita.

## Gatilho de revisão

Revisar se uma clínica piloto exigir uso simultâneo em mais de um computador.
