# FlowOps Next Finance, Materials and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar Financeiro, Materiais/Estoque e Relatorios para o FlowOps Next sem alterar persistencia, permissoes, integracoes ou calculos existentes.

**Architecture:** Helpers puros geram modelos de apresentacao a partir do estado real. As features existentes continuam responsaveis por persistencia e eventos; o HTML recebe a nova composicao e um CSS escopado e concatenado no bundle principal. Relatorios mantem as definicoes atuais e adiciona uma camada de agrupamento de navegacao.

**Tech Stack:** JavaScript ES modules, HTML, CSS, Node test runner, Playwright, Supabase existente.

## Global Constraints

- Nao criar calculo de preco real, custo real ou margem presumida.
- Nao criar dados demonstrativos ou novas tabelas Supabase.
- Preservar IDs, `data-action`, permissoes, filtros, exportacoes e compra -> caixa.
- Nenhum overflow horizontal no `body`; tabelas densas rolam em container proprio.
- O service worker nao autoriza deploy sem gate credenciado a zero skips.

---

### Task 1: Presentation models

**Files:**
- Create: `js/features/finance-presentation.js`
- Create: `js/features/materials-presentation.js`
- Test: `tests/unit/finance-presentation.test.js`
- Test: `tests/unit/materials-presentation.test.js`

**Interfaces:**
- Produces: `buildFinanceModel({ cash, orders })`.
- Produces: `buildMaterialsModel({ purchases, inventory })`.

- [ ] **Step 1: Write failing finance model tests**

Test income, expense, balance, receivable rows and missing order values without mutation.

- [ ] **Step 2: Run the finance test and verify RED**

Run: `node --test tests/unit/finance-presentation.test.js`
Expected: FAIL because `finance-presentation.js` does not exist.

- [ ] **Step 3: Implement the finance model**

Return stable KPIs, chronological cash rows, compact daily series and pending receivables derived from `charged - received`.

- [ ] **Step 4: Write and run failing materials model tests**

Run: `node --test tests/unit/materials-presentation.test.js`
Expected: FAIL because `materials-presentation.js` does not exist.

- [ ] **Step 5: Implement the materials model**

Return purchase totals, supplier aggregation, inventory health and estimated stock value without fabricating reservations.

- [ ] **Step 6: Verify both suites and commit**

Run: `node --test tests/unit/finance-presentation.test.js tests/unit/materials-presentation.test.js`
Expected: PASS.

Commit: `feat: add finance and materials presentation models`

### Task 2: Financeiro FlowOps Next

**Files:**
- Modify: `index.html`
- Modify: `js/features/cash.js`
- Modify: `js/core/router.js`
- Create: `css/25-flowops-next-finance.css`
- Modify: `css/flowops.css`
- Create: `tests/unit/finance-next.test.js`

**Interfaces:**
- Consumes: `buildFinanceModel({ cash, orders })`.
- Preserves: `cashForm`, `cashTypeFilter`, `cashTable`, `edit-cash`, `delete-cash`.

- [ ] **Step 1: Write failing UI contract tests**

Assert FlowOps Next scope, three finance tabs, stable forms/table IDs, internal table scrolling and absence of page-level horizontal overflow.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/unit/finance-next.test.js`
Expected: FAIL because the new structure and CSS source do not exist.

- [ ] **Step 3: Implement the finance structure and render model**

Add overview, ledger and receivables panes. Reuse the existing form and actions; do not create installment/fiscal persistence.

- [ ] **Step 4: Add scoped responsive CSS and concatenate it**

Use `css/25-flowops-next-finance.css` as the source and append it once to `css/flowops.css` with a source marker.

- [ ] **Step 5: Run focused and full unit tests, review and commit**

Run: `node --test tests/unit/finance-next.test.js tests/unit/finance-presentation.test.js`
Run: `npm run test:unit`
Expected: PASS.

Commit: `feat: migrate finance to FlowOps Next`

### Task 3: Materiais and Estoque FlowOps Next

**Files:**
- Modify: `index.html`
- Modify: `js/features/materials.js`
- Modify: `js/core/router.js`
- Create: `css/26-flowops-next-materials.css`
- Modify: `css/flowops.css`
- Create: `tests/unit/materials-next.test.js`

**Interfaces:**
- Consumes: `buildMaterialsModel({ purchases, inventory })`.
- Preserves: `materialForm`, `inventoryForm`, filters, edit/delete actions and notification refresh.

- [ ] **Step 1: Write failing UI contract tests**

Assert Estoque, Compras and Fornecedores navigation, real forms, low-stock state, internal table scrolling and responsive structure.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/unit/materials-next.test.js`
Expected: FAIL because the FlowOps Next structure is absent.

- [ ] **Step 3: Implement the three panes**

Keep purchase and inventory persistence unchanged. Build supplier aggregation from purchases and add explicit empty states.

- [ ] **Step 4: Add scoped CSS and concatenate it**

Append source 26 once to `css/flowops.css`; keep tables and filters responsive.

- [ ] **Step 5: Verify purchase -> cash regression, review and commit**

Run: `node --test tests/unit/materials-next.test.js tests/unit/materials-presentation.test.js`
Run: `npm run test:unit`
Expected: PASS.

Commit: `feat: migrate materials and inventory to FlowOps Next`

### Task 4: Relatorios grouped navigation

**Files:**
- Modify: `index.html`
- Modify: `js/features/reports.js`
- Modify: `js/core/router.js`
- Create: `js/features/reports-navigation.js`
- Create: `css/27-flowops-next-reports.css`
- Modify: `css/flowops.css`
- Create: `tests/unit/reports-navigation.test.js`
- Create: `tests/unit/reports-next.test.js`

**Interfaces:**
- Produces: `REPORT_GROUPS`, `groupForReport(tab)`, `reportsForGroup(group)`.
- Preserves: every existing report key, filter, table pagination and export function.

- [ ] **Step 1: Write failing grouping tests**

Assert all existing report keys appear exactly once across the five approved groups and no report is lost.

- [ ] **Step 2: Run grouping tests and verify RED**

Run: `node --test tests/unit/reports-navigation.test.js`
Expected: FAIL because the navigation module does not exist.

- [ ] **Step 3: Implement pure grouping and router bindings**

Primary group changes update the secondary selector; selecting a report updates `state.reportTab` and resets table pagination.

- [ ] **Step 4: Write failing visual contract tests**

Assert five primary groups, secondary selector, preserved filters/export controls and scoped responsive CSS.

- [ ] **Step 5: Implement markup, rendering and CSS**

Keep current report definitions and data calculations. Change only discovery, hierarchy and responsive presentation.

- [ ] **Step 6: Verify report suites, review and commit**

Run: `node --test tests/unit/reports-navigation.test.js tests/unit/reports-next.test.js tests/unit/reports-marketplaces.test.js`
Run: `npm run test:unit`
Expected: PASS.

Commit: `feat: simplify FlowOps Next reports navigation`

### Task 5: Regression and release candidate evidence

**Files:**
- Modify: `tests/e2e/authenticated-smoke.spec.js`
- Modify: `docs/SAAS_REGRESSION_CHECKLIST.md`
- Modify: `.superpowers/sdd/2026-07-29-flowops-next-finance-materials-reports/progress.md`
- Modify only after all gates: `sw.js`, `tests/unit/release-version.test.js`, `CHANGELOG.md`

**Interfaces:**
- Verifies: desktop/mobile layout, preserved forms, report navigation, purchase -> cash, permissions and no page overflow.

- [ ] **Step 1: Add failing E2E contracts for the three redesigned modules**

Scenarios must assert the real selectors and responsive containment, not screenshots alone.

- [ ] **Step 2: Run public E2E and verify the new scenarios fail before final wiring**

Run: `npx playwright test tests/e2e/authenticated-smoke.spec.js --reporter=line`
Expected: new scenarios fail before the final selectors/behavior are present.

- [ ] **Step 3: Complete wiring and make focused E2E green**

Run the same command and require PASS for public scenarios; authenticated release scenarios may only count with real credentials.

- [ ] **Step 4: Run full verification**

Run: `npm run check`
Run: `npm run test:unit`
Run: `npx playwright test --reporter=line`
Run: `npm audit --audit-level=high`
Run: `npm run release:readiness`

- [ ] **Step 5: Record exact evidence and release status**

If private credentials are absent, record the exact skips and do not push/deploy. Only then decide whether this branch should advance the cache candidate.

- [ ] **Step 6: Commit release preparation**

Commit: `chore: prepare FlowOps Next finance materials and reports release`
