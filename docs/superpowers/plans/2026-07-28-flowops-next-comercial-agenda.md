# FlowOps Next — Comercial e Agenda (Plano de Implementação)

> Implementar task-a-task em TDD (RED → GREEN → commit). Preservar `state`,
> `js/data/remote.js`, tabelas Supabase, realtime e handlers `data-action` como fronteira.
> Camada visual nova em fontes CSS próprios anexados a `css/flowops.css`. Sem dado
> demonstrativo em produção. Spec: `docs/superpowers/specs/2026-07-28-flowops-next-comercial-agenda-design.md`.

## Restrições globais

- Sem migration de banco nesta fase (aditivo/visual apenas).
- `crm_leads`, `lead_files`, `calendar_events`, `state.data.orders[].quoteStage` e o contrato
  público de `tracking.html` não mudam.
- IDs e `data-action` existentes estáveis, salvo com handler + teste atualizados juntos.
- `data-view` novos (`quotes`, `conversas`, `portal`) são aditivos ao roteador.
- Desktop/tablet/390 px sem overflow horizontal de página.
- `sw.js` `CACHE_NAME` e `release-version.test.js` só sobem no release aprovado.

---

### Task 1 — Helpers de apresentação (puros)

**Files:**
- Create: `js/features/commercial-presentation.js`
- Create: `js/features/calendar-presentation.js`
- Test: `tests/unit/commercial-presentation.test.js`
- Test: `tests/unit/calendar-presentation.test.js`

**Interfaces:**
- Consome: `state.leads`, `state.data.orders` (campos `quoteStage`, `client`, `orderCode`,
  `total`, datas), `calendar_events` (via array de eventos), `safeUrl`.
- Produz (puros, sem mutar entrada):
  - `buildCustomersModel(leads, orders, filters)` → `{ summary, list, selected }`.
  - `buildLeadsPipeline(leads, { now })` → `{ columns:[{stage,count,cards[]}], summary }`.
  - `buildQuotesModel(orders, filters)` → `{ summary, rows }`.
  - `buildConversationsModel(source)` → `{ inbox, active }` (vazio se sem dados).
  - `buildPortalPreview(order)` → `{ etapaAtual, pagamento, progresso, link }`.
  - `buildCalendarModel(events, { year, month, now })` → `{ weeks, upcoming, summary }`.

- [ ] Step 1: Testes RED — derivação de dados reais, contagens de summary, imutabilidade
  (`structuredClone` da entrada) e `TypeError` quando `now` inválido em `buildLeadsPipeline`/
  `buildCalendarModel`. Casos de vazio (sem leads/sem eventos → colunas/summary zerados, sem
  itens inventados). Confirmar os valores reais de `status`/`quoteStage` lendo
  `js/features/customers.js` e `index.html` (select `quoteStage`) ao escrever os fixtures.
- [ ] Step 2: Rodar `node --test tests/unit/commercial-presentation.test.js tests/unit/calendar-presentation.test.js` → FAIL (módulos ausentes).
- [ ] Step 3: Implementar os helpers puros (fallbacks explícitos `Sem responsável`/`Sem previsão`).
- [ ] Step 4: Rodar os testes → PASS.
- [ ] Step 5: Commit `feat: add commercial and calendar presentation models`.

---

### Task 2 — Clientes + Leads (reskin `leads` + pipeline)

**Files:**
- Modify: `index.html` (seção `#leadsView`, ~637-672; `#leadDialog` ~2361-2383)
- Modify: `js/features/customers.js`
- Create: `css/23-flowops-next-commercial.css`
- Modify: `css/flowops.css` (anexar SOURCE 23 verbatim)
- Test: `tests/unit/commercial-next.test.js`
- Test: `tests/e2e/authenticated-smoke.spec.js` (grep "leads")

**Interfaces:** consome `renderLeadsTab/renderLeads`, `state.leads`, filtros, `data-action`
`select-lead|edit-lead|open-lead-order`, `#leadsList`, `#leadDialog`, `#leadForm`. Produz
resumo horizontal + lista/detalhe (Contatos) e board pipeline (Leads) + abas Lista/Follow-ups.

- [ ] Step 1: RED — contrato de IDs/classes novos (`#leadsView.flowops-next-commercial`,
  `.leads-next-pipeline`, colunas por status) e preservação de `data-action`/`#leadForm`.
- [ ] Step 2: Rodar unit + e2e "leads" → FAIL.
- [ ] Step 3: Implementar composição consumindo `buildCustomersModel`/`buildLeadsPipeline`;
  manter handlers/permissões (`#newLeadBtn`, `leadForm`). CSS `23` escopado + concat.
- [ ] Step 4: `npm run check && node --test tests/unit/commercial-next.test.js && npx playwright test tests/e2e/authenticated-smoke.spec.js --grep leads` → PASS (desktop+390px, sem overflow).
- [ ] Step 5: Commit `feat: migrate customers and leads to FlowOps Next`.

---

### Task 3 — Orçamentos (view `quotes`, derivada de orders)

**Files:**
- Modify: `index.html` (nova `<section id="quotesView">` + item de menu), `js/core/router.js`
  (allowlist + título + `case "quotes"`), `js/features/orders.js` ou novo `js/features/quotes.js`
- Modify: `css/23-...` (prefixo `quotes-next-*`) + `css/flowops.css`
- Test: `tests/unit/commercial-presentation.test.js` (quotes), `tests/e2e/authenticated-smoke.spec.js` (grep "quotes")

**Interfaces:** consome `buildQuotesModel(state.data.orders, filters)`; abrir item reusa
`open-order-drawer`/edição. Produz resumo + tabela (orçamento, cliente, versão, validade, valor, status).

- [ ] Step 1: RED — rota `data-view="quotes"`, tabela com colunas reais, deriva só orders com `quoteStage`.
- [ ] Step 2: Rodar → FAIL.
- [ ] Step 3: Implementar view + renderer + roteador (aditivo). Sem tabela nova.
- [ ] Step 4: Rodar → PASS.
- [ ] Step 5: Commit `feat: add FlowOps Next quotes view`.

---

### Task 4 — Conversas (view `conversas`, shell + estados vazios)

**Files:** `index.html` (section + menu), `js/core/router.js`, `js/features/customers.js`
(reaproveitar `renderWhatsappInLeads`) ou novo `js/features/conversations.js`; `css/23-...`.
Test: `commercial-presentation.test.js` (conversations), e2e "conversas".

- [ ] Step 1: RED — inbox + thread, **estado vazio** quando sem dados; nada fabricado.
- [ ] Step 2: FAIL. [ ] Step 3: implementar shell consumindo `buildConversationsModel`.
- [ ] Step 4: PASS. [ ] Step 5: Commit `feat: add FlowOps Next conversations view`.

---

### Task 5 — Portal do cliente (view `portal`, config + preview)

**Files:** `index.html` (section + menu), `js/core/router.js`, novo `js/features/client-portal.js`;
`css/23-...`. Test: `commercial-presentation.test.js` (portal), e2e "portal".

**Interfaces:** consome `buildPortalPreview(order)`; "Copiar link" usa o token/contrato de
`tracking.html`. Config: permitir aprovação/pagamento/exibir produção + validade do link.

- [ ] Step 1: RED — seleção de cliente/pedido, preview (etapa/pagamento/progresso), copiar link.
- [ ] Step 2: FAIL. [ ] Step 3: implementar (não altera contrato público).
- [ ] Step 4: PASS. [ ] Step 5: Commit `feat: add FlowOps Next client portal view`.

---

### Task 6 — Agenda (reskin `calendar` para tokens)

**Files:** `index.html` (seção `#calendarView` ~807-853, remover estilos inline),
`js/features/calendar-navigation.js` (consumir `buildCalendarModel`), `js/core/router.js`
(`case "calendar"` se necessário), `css/24-flowops-next-calendar.css` + `css/flowops.css`.
Test: `calendar-presentation.test.js`, `tests/unit/calendar-next.test.js`, e2e "calendar".

- [ ] Step 1: RED — `#calendarView.flowops-next-calendar`, tokens `--next-*` (sem inline),
  Mês/Semana/Lista, painel do dia, resumos reais; preserva `calendar_events`/realtime/init no boot.
- [ ] Step 2: FAIL. [ ] Step 3: implementar reskin + CSS `24` concat.
- [ ] Step 4: PASS (desktop+390px, sem overflow). [ ] Step 5: Commit `feat: migrate agenda to FlowOps Next`.

---

### Task 7 — Regressão e segurança de release

**Files:** `sw.js`, `CHANGELOG.md`, `docs/SAAS_REGRESSION_CHECKLIST.md`,
`tests/unit/release-version.test.js`, `.superpowers/sdd/2026-07-28-flowops-next-comercial-agenda/`.

- [ ] Step 1: Atualizar expectativa de cache (`flowops-v68`) no teste; `/css/flowops.css` 1x em
  STATIC_ASSETS; fontes `23/24` NÃO listados.
- [ ] Step 2: FAIL (cache antigo). [ ] Step 3: bump `sw.js`, changelog, checklist de regressão
  (leads/realtime, quoteStage, rastreio público, RLS, offline).
- [ ] Step 4: `npm test && npm run health && npm run release:readiness`. Se pré-requisitos de
  E2E autenticado ausentes, **registrar os skips exatos e NÃO deployar** (gate fail-closed).
- [ ] Step 5: Commit `chore: prepare FlowOps Next comercial and agenda release`.

## Evidência

Registrar reports por task em `.superpowers/sdd/2026-07-28-flowops-next-comercial-agenda/`
(mesmo formato das fases anteriores: Scope, RED Evidence, GREEN Evidence, Changed Files,
Self-Review, Concerns). Deploy/cache-bump só no ambiente credenciado com o gate a zero skips.
