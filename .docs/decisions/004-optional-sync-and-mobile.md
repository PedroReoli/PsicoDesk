# ADR-004 — Sincronização e cliente móvel opcionais

- Status: aceito
- Data: 02/11/2026
- Responsável: mantenedores do PsicoDesk
- Qualifica: ADR-001

## Contexto

O desktop foi definido como local-first para um único PC. Depois dessa decisão, o usuário solicitou preparar uma API para futura VPS e um aplicativo móvel, sem tornar a rede requisito para o produto atual.

## Decisão

O desktop permanece a fonte operacional local e deve executar seus fluxos essenciais sem internet. A sincronização é opt-in e usa fila durável, lotes idempotentes, cursores, revisões e conflitos explícitos; dados clínicos não adotam resolução automática por “última escrita vence”.

A API recebe somente envelopes cifrados pelo cliente, isola toda operação por clínica e dispositivo e oferece uploads privados e eventos sem conteúdo clínico. O aplicativo móvel é um cliente complementar offline-first e não substitui a fronteira de autorização do servidor.

## Consequências

- Falha ou ausência da API não bloqueia o desktop.
- Ativar sincronização exige provisionamento explícito de clínica, dispositivo e chaves.
- Deploy em VPS, migração de dados e uso real precisam de homologação separada.
- Conflitos clínicos requerem revisão humana e trilha de auditoria.
- Metadados operacionais devem ser minimizados mesmo quando o payload estiver cifrado.

## Gatilho de revisão

Revisar antes de promover a API a serviço de produção, permitir colaboração simultânea ou tratar o mobile como fonte primária de registros clínicos.
