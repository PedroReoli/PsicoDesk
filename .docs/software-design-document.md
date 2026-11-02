SICODESK  /  ENGINEERING SPECIFICATION

PsicoDesk

SOFTWARE DESIGN DOCUMENT  •  v1.0  •  02/11/2026

Sistema desktop offline-first para gestão de clínicas de psicologia

Status: especificação proposta — sujeita a validação clínica, jurídica e de produto.

1. Visão, objetivos e fronteiras

Aplicação Windows desktop para clínicas com múltiplos profissionais, recepção e administração. Dados clínicos permanecem locais por padrão. A API é opcional e limitada ao intercâmbio explícito de cargas, sem operações remotas de CRUD em tempo real.

Objetivos: cadastro de pacientes, agenda, registros clínicos, financeiro, documentos, relatórios e auditoria.

Não objetivos do MVP: teleconsulta, faturamento de convênios, emissão fiscal integrada, chat, IA clínica e sincronização contínua.

Multiusuário no mesmo computador: sessões e perfis separados. Multi-PC: exige definição de instância proprietária e mecanismo de intercâmbio, sem prometer colaboração simultânea.

Registros clínicos não devem ser visíveis para recepção ou perfis financeiros; consentimento não substitui base legal apropriada.

2. Stack e decisões arquiteturais

Shell: Tauri 2 (Rust) com WebView do sistema; builds assinados e updater com validação de assinatura.

UI: React + TypeScript strict + Vite + React Router; Tailwind CSS v4 com tokens CSS; CSS Modules para estilos locais complexos.

Estado: TanStack Query para operações assíncronas locais; Zustand apenas para estado de UI; React Hook Form + Zod para formulários e validação.

Persistência: SQLite com migrações versionadas; SQLCipher ou criptografia equivalente validada em Rust para dados em repouso; chaves protegidas por DPAPI/Windows Credential Manager quando aplicável.

Backend local: comandos Tauri em Rust, serviços de domínio e repositórios; frontend jamais executa SQL arbitrário nem acessa filesystem irrestrito.

Qualidade: Vitest, Testing Library, Playwright para UI, testes Rust, ESLint, Prettier, cargo fmt/clippy, auditoria de dependências e CI.

Logs: tracing em Rust com redação de dados sensíveis, correlação por operação e retenção configurável.

3. Regras Reoli — obrigatórias

Proibido arquivo .tsx que concentre apresentação, regras, persistência e CSS.

Por feature: types/, styles/, services/, hooks/, components/, pages/. A divisão original de cinco responsabilidades é preservada, com services/ explicitado como sexta pasta operacional.

pages/ somente compõe layouts, hooks e componentes: alvo 150–250 linhas; teto absoluto 750 linhas, sem usar o teto como meta.

Toda interface de props compartilhadas fica em types.ts dedicado. Extensões são opcionais, com defaults neutros; mudanças incompatíveis exigem novo componente/versão e plano de migração.

Proibidos modais, dialogs, alert dialogs e overlays de formulário. Interações contextuais usam RightPanel; confirmações destrutivas usam painel lateral com texto explícito e ação de confirmação.

Nenhum botão ad hoc: todos usam Button do Design System e variantes declaradas. Ícones, espaçamentos, foco, disabled e loading seguem contratos únicos.

Dependências unidirecionais: pages → hooks/components → services/contracts; domínio Rust não importa UI; components/shared não importam features.

Componentes hierárquicos: primitives → composites → feature components → page composition; evitar componentes genéricos com dezenas de flags.

4. Estrutura de repositório

psicodesk/

  apps/desktop/

    src/

      app/                # providers, router, boot

      design-system/

        tokens/           # variables.ts, colors.css, fonts.css, spacing.css

        primitives/       # Button, Input, Select, Badge, Icon

        composites/       # DataTable, FormField, RightPanel, PageHeader

        layouts/          # AppShell, Sidebar, ContentArea

      features/

        patients/{types,styles,services,hooks,components,pages}/

        scheduling/{types,styles,services,hooks,components,pages}/

        clinical-records/{types,styles,services,hooks,components,pages}/

        finance/{types,styles,services,hooks,components,pages}/

        documents/{types,styles,services,hooks,components,pages}/

        reports/{types,styles,services,hooks,components,pages}/

        settings/{types,styles,services,hooks,components,pages}/

      shared/{types,utils,security,constants}/

    src-tauri/

      src/{commands,application,domain,infrastructure,security,sync}/

      migrations/

  packages/contracts/      # schemas de carga, versões, DTOs

  docs/{adr,security,ux,api,tests}/

  .github/workflows/

5. Design System: tokens e contratos

variables.ts contém valores semânticos tipados e mapeamento para configurações JS quando necessário; colors.css contém paleta e tokens CSS para temas; fonts.css declara famílias e pesos; spacing.css organiza escala de espaço, raios, sombras e z-index. Evitar duas fontes de verdade: CSS custom properties são fonte de verdade visual; variables.ts expõe referências/nomes e valores não-CSS.

/* colors.css */

:root { --color-brand-600:#087F70; --color-surface:#FFFFFF;

  --color-text:#142C2B; --color-danger:#B42318;

  --color-border:#DCE7E4; --color-focus:#0A8F7E; }

/* fonts.css */

:root { --font-sans: 'Inter', system-ui, sans-serif; }

/* variables.ts */

export const tokens = { color: { primary: 'var(--color-brand-600)' },

  radius: { md: 'var(--radius-md)' } } as const;

/* Button.types.ts */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {

  variant?: 'primary'|'secondary'|'ghost'|'danger';

  size?: 'sm'|'md'|'lg'; loading?: boolean; fullWidth?: boolean;

}

Componente Button não recebe lógica de negócio; onClick é injetado pelo consumidor. RightPanel possui título, conteúdo, ações, largura e estados de abertura; Escape fecha apenas quando não houver risco de perda de edição. Navegação por teclado, contraste e estados de foco são requisitos.

6. UX e telas obrigatórias

Dashboard

KPIs agregados e agenda do dia; sem exposição desnecessária de nomes e conteúdo clínico.

Agenda

Visões dia/semana/mês, recorrência, conflitos, faltas e painel direito para agendar/remarcar.

Pacientes

Busca, filtros, ficha, responsáveis, contatos e painel direito de cadastro/edição.

Prontuário

Linha do tempo restrita, autoria, data/hora, anexos e adendos; painel direito para registro; impedir alteração silenciosa de histórico.

Financeiro

Recebimentos, repasses, inadimplência e caixa; recepção sem acesso a notas clínicas.

Documentos

Templates versionados, geração e exportação com trilha de auditoria.

Relatórios

Indicadores clínico-operacionais agregados e financeiros, com escopo por perfil.

Configurações

Usuários, perfis, backup, chaves, importação/exportação, logs e política de retenção.

Padrão global: AppShell com sidebar esquerda, header, conteúdo central e RightPanel à direita (larguras responsivas 420/560/720 px). Nenhuma ação abre modal; painel pode ocupar toda a largura em viewport estreito.

7. Modelo de domínio e persistência

User(id, status, credential_ref), Role(id, permissions), UserRole(user_id, role_id).

Patient(id, identifiers, contact, guardian, status, created_at), PatientProfessional(patient_id, professional_id, scope).

Appointment(id, patient_id, professional_id, starts_at, ends_at, status, recurrence_id, version).

ClinicalRecord(id, patient_id, author_id, appointment_id, body_ciphertext, created_at, amendment_of, hash).

Invoice/Charge(id, patient_id, amount_minor, due_date, status), Payment(id, charge_id, amount_minor, paid_at).

Document(id, patient_id, template_version, encrypted_path, checksum), AuditEvent(id, actor_id, action, entity_ref, timestamp, result).

TransferBatch(id, schema_version, origin_id, target_id, created_at, checksum, signature, status) e TransferItem(id, batch_id, entity_type, entity_id, revision).

Usar UUIDs, timestamps UTC, valores monetários em centavos inteiros, índices por consulta e foreign keys ativas. Nunca armazenar senhas em texto; credenciais locais com hash resistente a brute force e proteção contra tentativas repetidas.

8. Segurança e privacidade

Dados de saúde são sensíveis sob LGPD; realizar avaliação de riscos, mapeamento de finalidade, base legal, papéis e medidas técnicas/administrativas antes da operação.

RBAC no Rust em cada comando; UI oculta ações sem permissão, mas não é fronteira de segurança.

Criptografia do banco e anexos; chaves fora do banco; backup criptografado com processo testado de recuperação e rotação.

Auditoria de leitura/exportação/alteração clínica, evitando incluir conteúdo sensível em logs.

Proteção contra injeção SQL por consultas parametrizadas, validação de caminhos, permissões mínimas do Tauri, CSP e dependências verificadas.

Registros clínicos: política de guarda, acesso, correção e eliminação deve ser validada com normas vigentes do CFP e assessoria jurídica; não presumir prazo único para todos os documentos.

Bloqueio por inatividade, sessão individual, revisão de permissões, exportação autorizada e política para perda/roubo do computador.

9. API opcional de cargas — contrato e fluxo

A API não hospeda a base operacional, não executa queries de tela e não é necessária para abrir o aplicativo. Um operador autorizado seleciona escopo e destinatário; o cliente gera pacote cifrado, assinado, versionado e auditável. A API recebe, armazena temporariamente e entrega o pacote; destino valida, descriptografa e aplica em transação.

POST /v1/batches         -> envia pacote cifrado + metadados mínimos

GET  /v1/batches/{id}    -> consulta status/metadados

GET  /v1/batches/{id}/payload -> recebe pacote autorizado

POST /v1/batches/{id}/ack -> confirma importação

DELETE /v1/batches/{id}  -> solicita remoção conforme política

BatchEnvelope { schemaVersion, batchId, originId, targetId,

  createdAt, expiresAt, contentHash, signature, encryption, payload }

Autenticação mútua ou tokens de curta duração, autorização por destinatário, TLS, criptografia ponta a ponta e prevenção de replay.

Idempotência por batchId; importação em staging, validação de schema e assinatura, dry-run e aplicação atômica.

Conflitos: não usar last-write-wins em registros clínicos; gerar fila de revisão e preservar versões e autoria.

Transferência incremental opcional com revisions/tombstones; exclusões seguem política específica e trilha de auditoria.

Retenção curta de pacotes na API, limpeza automática, quotas, limites de tamanho e nenhuma indexação de conteúdo sensível.

Para múltiplos PCs ativos, o intercâmbio de cargas não garante consistência instantânea: definir política de propriedade do registro e resolução de conflitos.

10. Fluxos críticos e critérios de aceite

Agendamento

Criar sessão valida profissional, paciente e sobreposição.

Persistência local concluída antes de indicar sucesso; atualização da agenda sem recarregar.

Remarcar/cancelar por RightPanel com registro de autor e motivo.

Prontuário

Acesso apenas a profissional autorizado; recepção recebe acesso negado inclusive no comando Rust.

Registro assinado logicamente com autoria/data; alterações posteriores são adendos rastreáveis.

Falha ao salvar preserva rascunho local protegido e não apresenta sucesso falso.

Transferência

Exportação exige permissão e confirmação de escopo.

Importação rejeita assinatura inválida, versão incompatível e batch duplicado.

Interrupção não produz dados parcialmente aplicados; reconciliação e auditoria disponíveis.

Backup e recuperação

Backup criptografado executável offline; teste de restauração automatizado em ambiente isolado.

Aplicação avisa quando não há backup recente e valida integridade antes de restaurar.

11. Testes, CI e definição de pronto

Unitários: regras de agendamento, dinheiro, permissões, schemas e conflitos.

Integração: comandos Tauri → serviços → SQLite real de teste; migração up e rollback quando suportado.

E2E: fluxos de paciente, agenda, prontuário, painel lateral, teclado, backup e carga.

Segurança: teste de acesso horizontal/vertical, SQLi, caminhos, exportação indevida, logs e manipulação de pacote.

CI bloqueia merge com lint, typecheck, testes e falha de contratos; builds assinados e SBOM quando disponível.

Definition of Done: contrato tipado, testes, autorização no Rust, acessibilidade, logs sem PHI, documentação e sem modais.

12. Roadmap de execução

Fase 0 — descoberta: entrevistas com psicólogos/recepção, regras documentais e matriz de permissões; protótipo validado.

Fase 1 — fundação: Tauri, shell, tokens, primitives, RightPanel, auth local, SQLite e migrações.

Fase 2 — MVP: pacientes, agenda, financeiro básico, prontuário restrito, backup e auditoria.

Fase 3 — maturidade: documentos, relatórios, instalador assinado, atualização e restauração testada.

Fase 4 — intercâmbio: schemas versionados, exportação/importação local e API de pacotes opcional.

Fase 5 — comercial: licenciamento, onboarding, suporte, telemetria opt-in sem dados clínicos e piloto controlado.

13. Decisões em aberto (ADRs)

ADR-001: SQLCipher vs criptografia de campos e anexos; definir distribuição e recuperação de chaves.

ADR-002: instalação por usuário ou por máquina, atualizações e privilégios no Windows.

ADR-003: política multi-PC, propriedade de dados e granularidade das cargas.

ADR-004: modelo de licenciamento offline e período de tolerância.

ADR-005: retenção documental e controles exigidos para diferentes categorias de registro psicológico.

Regra final: qualquer nova feature deve respeitar separação de camadas, design tokens, RightPanel, contratos retrocompatíveis, controle de acesso no backend local e testes automatizados. Exceções exigem ADR explícita.

PsicoDesk • Documento técnico de arquitetura • Uso interno