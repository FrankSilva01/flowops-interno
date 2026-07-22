# Marketplace Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long Marketplace Performance page with an executive first viewport and four organized detail sections while preserving all current analytics and financial behavior.

**Architecture:** Add a pure presentation-model module that converts existing listings, analytics, profitability, and sales data into executive indicators and prioritized actions. Existing pricing and marketplace analytics modules remain the calculation source; the Performance renderer consumes a single derived snapshot and the existing detail renderers continue to populate their tables and charts.

**Tech Stack:** Vanilla JavaScript ES modules, semantic HTML, existing FlowOps CSS system, Node test runner, Playwright.

## Global Constraints

- Do not change Supabase schemas, RLS policies, Edge Function contracts, or Mercado Livre synchronization endpoints.
- Preserve existing profitability, health, intent, ranking, filtering, sorting, subscription, and listing-drawer behavior.
- Missing values must render as unavailable, never as a misleading zero.
- The page must not create horizontal scrolling at desktop, tablet, or mobile widths.
- Use the existing design tokens, buttons, badges, chart utilities, and Tabler icons.
- Do not add runtime dependencies.

---

## File Structure

- Create `js/features/marketplace-performance-model.js`: pure derivation of executive indicators, priority cards, and default detail section.
- Create `tests/unit/marketplace-performance-model.test.js`: focused behavior tests for the presentation model.
- Modify `index.html`: replace the intelligence header and long detail sequence with executive containers and four section tabs while retaining existing element IDs needed by renderers.
- Modify `js/features/marketplace-analytics.js`: render the executive snapshot, priorities, detail-section state, and synchronization status.
- Modify `js/features/pricing.js`: remove the duplicate decision-board rendering and keep financial detail renderers operating inside the new structure.
- Modify `js/core/router.js`: bind section tabs and overflow actions using delegated events.
- Modify `js/core/state.js`: store the active Performance detail section for the browser session.
- Modify `css/flowops.css`: add desktop, tablet, and mobile layout rules for the executive dashboard and contained detail sections.
- Modify `tests/e2e/authenticated-smoke.spec.js`: verify navigation, section switching, recommendations, and horizontal containment with an authenticated session.

---

### Task 1: Pure Performance Presentation Model

**Files:**
- Create: `js/features/marketplace-performance-model.js`
- Create: `tests/unit/marketplace-performance-model.test.js`

**Interfaces:**
- Consumes: normalized listing entries with `{ listing, analytics, profitability, salesRevenue }`.
- Produces: `buildMarketplacePerformanceSnapshot(entries, options)` returning `{ indicators, totals, priorities, defaultSection }`.
- Produces: `selectPerformancePriorities(entries, limit)` returning at most `limit` stable, ordered actions.

- [ ] **Step 1: Write failing tests for indicators and unavailable values**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketplacePerformanceSnapshot,
  selectPerformancePriorities,
} from "../../js/features/marketplace-performance-model.js";

test("deriva indicadores sem transformar dados ausentes em zero", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    {
      listing: { marketplace: "mercado-livre", external_id: "MLB1", title: "Produto A" },
      analytics: { visits_30d: 100, questions_30d: 5, sales_30d: 4, conversion_rate: 4, health_score: 80 },
      profitability: { marginPct: 30, netProfit: 20 },
      salesRevenue: 200,
    },
    {
      listing: { marketplace: "mercado-livre", external_id: "MLB2", title: "Produto B" },
      analytics: null,
      profitability: null,
      salesRevenue: 0,
    },
  ]);

  assert.deepEqual(snapshot.indicators, {
    revenue: 200,
    conversion: 4,
    averageMargin: 30,
    health: 80,
  });
  assert.equal(snapshot.totals.visits, 100);
  assert.equal(snapshot.totals.questions, 5);
  assert.equal(snapshot.totals.sales, 4);
});

test("mantem indicador indisponivel quando nenhuma linha possui o dado", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([], {});
  assert.equal(snapshot.indicators.conversion, null);
  assert.equal(snapshot.indicators.averageMargin, null);
  assert.equal(snapshot.indicators.health, null);
});
```

- [ ] **Step 2: Run the new unit test and verify failure**

Run: `node --test tests/unit/marketplace-performance-model.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `marketplace-performance-model.js`.

- [ ] **Step 3: Implement weighted indicators and totals**

```js
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function buildMarketplacePerformanceSnapshot(entries = [], options = {}) {
  const analytics = entries.map((entry) => entry.analytics).filter(Boolean);
  const profitability = entries.map((entry) => entry.profitability).filter(Boolean);
  const totals = analytics.reduce((result, item) => ({
    visits: result.visits + (finite(item.visits_30d) ?? 0),
    questions: result.questions + (finite(item.questions_30d) ?? 0),
    sales: result.sales + (finite(item.sales_30d) ?? 0),
  }), { visits: 0, questions: 0, sales: 0 });
  const conversion = totals.visits > 0 ? (totals.sales / totals.visits) * 100 : null;
  const margins = profitability.map((item) => finite(item.marginPct)).filter((value) => value != null);
  const healthScores = analytics.map((item) => finite(item.health_score ?? item.healthScore)).filter((value) => value != null);

  return {
    indicators: {
      revenue: entries.reduce((sum, entry) => sum + (finite(entry.salesRevenue) ?? 0), 0),
      conversion,
      averageMargin: average(margins),
      health: average(healthScores),
    },
    totals,
    priorities: selectPerformancePriorities(entries, options.priorityLimit ?? 4),
    defaultSection: profitability.length ? "profitability" : "listings",
  };
}
```

- [ ] **Step 4: Write failing tests for priority order and limit**

```js
test("prioriza intencao sem venda, baixa conversao, risco e oportunidade", () => {
  const entries = [
    makeEntry("intent", { visits_7d: 80, questions_30d: 5, sales_30d: 0, conversion_rate: 0, intent_score: 90 }),
    makeEntry("conversion", { visits_30d: 200, sales_30d: 1, conversion_rate: 0.5 }),
    makeEntry("risk", { health_score: 20, visits_30d: 10, sales_30d: 0 }),
    makeEntry("opportunity", { health_score: 90, visits_30d: 120, sales_30d: 10, conversion_rate: 8.3 }),
    makeEntry("cost", { visits_30d: 5 }, null),
  ];

  const priorities = selectPerformancePriorities(entries, 4);
  assert.deepEqual(priorities.map((item) => item.kind), ["intent", "conversion", "risk", "opportunity"]);
  assert.equal(priorities.length, 4);
});
```

- [ ] **Step 5: Implement stable priority selection**

```js
export function selectPerformancePriorities(entries = [], limit = 4) {
  return entries.flatMap((entry) => classifyEntryPriorities(entry))
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.title.localeCompare(b.title, "pt-BR"))
    .slice(0, Math.max(0, limit));
}
```

`classifyEntryPriorities` must return objects with `{ kind, rank, score, severity, title, reason, actionLabel, marketplace, externalId }`. Use ranks `1` through `5` in the acceptance-order defined by the design spec and only emit cost coverage when `profitability == null`.

- [ ] **Step 6: Run all unit tests**

Run: `npm run test:unit`

Expected: all tests PASS.

- [ ] **Step 7: Commit the model**

```bash
git add js/features/marketplace-performance-model.js tests/unit/marketplace-performance-model.test.js
git commit -m "feat: derive marketplace performance summary"
```

---

### Task 2: Executive Performance Markup and Detail Navigation

**Files:**
- Modify: `index.html:1304-1500`
- Modify: `js/core/state.js:205-232`
- Modify: `js/core/router.js:130-190,560-590`
- Test: `tests/unit/marketplace-navigation.test.js`

**Interfaces:**
- Consumes: section keys `profitability`, `listings`, `investment`, and `reputation`.
- Produces: containers `marketplacePerformanceIndicators`, `marketplacePerformanceFlow`, `marketplacePerformancePriorities`, and `[data-performance-section-panel]`.
- Produces: `setMarketplacePerformanceSection(section)` exported by `marketplace-analytics.js` in Task 3.

- [ ] **Step 1: Extend the navigation unit test with stable Performance sections**

Add a pure `PERFORMANCE_SECTIONS` export to `marketplace-navigation.js` and assert:

```js
assert.deepEqual(PERFORMANCE_SECTIONS, ["profitability", "listings", "investment", "reputation"]);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/unit/marketplace-navigation.test.js`

Expected: FAIL because `PERFORMANCE_SECTIONS` is not exported.

- [ ] **Step 3: Add the stable section constant and state**

```js
export const PERFORMANCE_SECTIONS = ["profitability", "listings", "investment", "reputation"];
```

Add to shared state:

```js
marketplacePerformanceSection: "profitability",
```

- [ ] **Step 4: Replace the Performance top-level markup**

Use one executive header, one indicator grid, one two-column overview, and a tablist:

```html
<div class="marketplace-performance-head">
  <div><h3>Performance</h3><small id="analyticsSyncedAtLabel">Ainda não sincronizado</small></div>
  <div class="inline-actions">
    <button id="syncAnalyticsBtn" class="primary-btn" type="button" data-action="sync-analytics-full">Atualizar métricas</button>
    <button class="icon-btn" type="button" data-action="toggle-performance-actions" aria-label="Mais ações" aria-expanded="false"><i class="ti ti-dots"></i></button>
    <div id="performanceActionsMenu" class="action-menu" hidden>...</div>
  </div>
</div>
<div id="marketplacePerformanceIndicators" class="marketplace-performance-indicators"></div>
<div class="marketplace-performance-overview">
  <section class="panel"><div id="marketplacePerformanceFlow"></div></section>
  <section class="panel"><div id="marketplacePerformancePriorities"></div></section>
</div>
<div class="marketplace-performance-detail-tabs" role="tablist" aria-label="Detalhes da performance">...</div>
```

Move existing financial, listing, investment, and reputation elements into the matching `[data-performance-section-panel]` containers. Preserve every existing element ID used by JavaScript.

- [ ] **Step 5: Bind delegated tab and overflow-menu actions**

In the router action delegation:

```js
if (action === "set-performance-section") {
  setMarketplacePerformanceSection(trigger.dataset.section);
  return;
}
if (action === "toggle-performance-actions") {
  const menu = byId("performanceActionsMenu");
  menu.hidden = !menu.hidden;
  trigger.setAttribute("aria-expanded", String(!menu.hidden));
  return;
}
```

- [ ] **Step 6: Run syntax and navigation tests**

Run: `npm run check && node --test tests/unit/marketplace-navigation.test.js`

Expected: PASS.

- [ ] **Step 7: Commit markup and navigation**

```bash
git add index.html js/core/state.js js/core/router.js js/features/marketplace-navigation.js tests/unit/marketplace-navigation.test.js
git commit -m "refactor: organize marketplace performance details"
```

---

### Task 3: Executive Renderer and Preserved Detailed Renderers

**Files:**
- Modify: `js/features/marketplace-analytics.js:1-15,750-785`
- Modify: `js/features/pricing.js:1678-1710`
- Test: `tests/unit/marketplace-performance-model.test.js`

**Interfaces:**
- Consumes: `buildMarketplacePerformanceSnapshot(entries, options)` from Task 1.
- Produces: `renderMarketplacePerformanceExecutive()` and `setMarketplacePerformanceSection(section)`.
- Preserves: `renderPerformanceTable`, `renderInvestmentRanking`, `renderIntentScoreRanking`, `renderCategoryTrendsPanel`, and `renderSellerReputationPanel`.

- [ ] **Step 1: Add a failing model test for stable fallback section**

```js
test("usa anuncios como secao inicial sem cobertura financeira", () => {
  assert.equal(buildMarketplacePerformanceSnapshot([{ listing: {}, analytics: {}, profitability: null }]).defaultSection, "listings");
});
```

- [ ] **Step 2: Run the focused test and verify failure if fallback is incorrect**

Run: `node --test tests/unit/marketplace-performance-model.test.js`

Expected: FAIL before the fallback behavior is complete, then PASS after correction.

- [ ] **Step 3: Build normalized entries from existing state**

Inside `marketplace-analytics.js`, map each synchronized listing to:

```js
const entries = state.marketplaceListings.map((listing) => ({
  listing,
  analytics: getListingAnalytics(listing.marketplace, listing.external_id),
  profitability: getListingProfitability(listing),
  salesRevenue: state.marketplaceSales
    .filter((sale) => sale.marketplace === listing.marketplace && sale.listing_external_id === listing.external_id)
    .reduce((sum, sale) => sum + Number(sale.raw_payload?.total_amount || sale.total_amount || 0), 0),
}));
```

Adapt the sale-listing key to the existing normalized sales payload found in `state.marketplaceSales`; do not add a new backend field.

- [ ] **Step 4: Render the four executive indicators**

Implement `renderMarketplacePerformanceExecutive(snapshot)` using `money`, `percent`, `html`, and status text. Render `Não disponível` for `null` conversion, margin, or health.

- [ ] **Step 5: Render flow and priorities**

The flow shows totals for visits, questions, and sales as three stable columns connected with arrows. Each priority action uses `data-action="open-listing-drawer"`, `data-marketplace`, and `data-external-id` when it targets a listing; cost coverage uses `data-action="open-bulk-cost-dialog"`.

- [ ] **Step 6: Implement section state and ARIA synchronization**

```js
export function setMarketplacePerformanceSection(section) {
  const allowed = PERFORMANCE_SECTIONS.includes(section) ? section : "listings";
  state.marketplacePerformanceSection = allowed;
  document.querySelectorAll("[data-performance-section]").forEach((button) => {
    const active = button.dataset.performanceSection === allowed;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-performance-section-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.performanceSectionPanel !== allowed;
  });
}
```

- [ ] **Step 7: Remove duplicate top-level decision rendering**

Stop calling `renderIntelligenceDecisionBoard()` from `renderCommercialIntelligence()`. Keep current financial detail render calls and their IDs intact inside the `profitability` section.

- [ ] **Step 8: Run checks and unit tests**

Run: `npm run check && npm run test:unit`

Expected: all checks and unit tests PASS.

- [ ] **Step 9: Commit the renderer**

```bash
git add js/features/marketplace-analytics.js js/features/pricing.js tests/unit/marketplace-performance-model.test.js
git commit -m "feat: render executive marketplace performance"
```

---

### Task 4: Responsive Layout and Visual Hierarchy

**Files:**
- Modify: `css/flowops.css`
- Modify: `index.html` stylesheet cache version
- Test: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: markup classes from Task 2.
- Produces: no page-level horizontal overflow at 1440x900, 1024x768, and 390x844.

- [ ] **Step 1: Add an authenticated overflow assertion**

```js
test("performance do marketplace nao cria overflow horizontal", async ({ page }) => {
  await page.goto("/#marketplace");
  await page.locator('[data-marketplace-area="performance"]').click();
  await expect(page.locator("#marketplaceIntelligenceView")).toHaveClass(/active/);
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});
```

- [ ] **Step 2: Run the authenticated test and verify the current layout fails or records the baseline**

Run: `npx playwright test tests/e2e/authenticated-smoke.spec.js --project=chromium --grep "performance do marketplace"`

Expected with authentication available: the assertion exercises the Performance view; without stored authentication: test SKIP with the suite's existing authentication guard.

- [ ] **Step 3: Add desktop layout rules**

```css
.marketplace-performance-indicators { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.marketplace-performance-overview { display:grid; grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr); gap:12px; }
.marketplace-performance-detail-tabs { display:flex; gap:4px; overflow-x:auto; border-bottom:1px solid var(--border); }
[data-performance-section-panel][hidden] { display:none !important; }
.marketplace-performance-detail-panel .table-wrap { max-width:100%; overflow-x:auto; }
```

Use existing token names confirmed in `css/flowops.css`; do not introduce hard-coded palette colors.

- [ ] **Step 4: Add tablet and mobile behavior**

At `max-width: 1100px`, use two indicator columns and stack the overview. At `max-width: 640px`, keep two compact indicator columns, move secondary actions to the overflow menu, reduce panel padding, and fall back to one indicator column below `360px`.

- [ ] **Step 5: Increment the stylesheet cache version**

Change `css/flowops.css?v=266` to the next unused integer in `index.html` after checking the current value immediately before editing.

- [ ] **Step 6: Run checks and responsive E2E coverage**

Run: `npm run check && npx playwright test tests/e2e/authenticated-smoke.spec.js --project=chromium --grep "Marketplace|performance"`

Expected: PASS when authenticated, otherwise only documented authentication skips.

- [ ] **Step 7: Commit responsive styling**

```bash
git add css/flowops.css index.html tests/e2e/authenticated-smoke.spec.js
git commit -m "style: refine marketplace performance layout"
```

---

### Task 5: Full Verification and Deployment Readiness

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- Verifies all outputs from Tasks 1 through 4.

- [ ] **Step 1: Run static checks and all unit tests**

Run: `npm run check && npm run test:unit`

Expected: PASS with no syntax or unit failures.

- [ ] **Step 2: Run public E2E tests**

Run: `npm run test:e2e`

Expected: all public tests PASS; authenticated tests may SKIP only when no authenticated storage state is configured.

- [ ] **Step 3: Start the local server**

Run: `npx serve . -l 4173`

Expected: the application is available at `http://localhost:4173`.

- [ ] **Step 4: Capture responsive screenshots**

Use Playwright at `1440x900`, `1024x768`, and `390x844`. Verify the executive indicators, flow, priorities, detail tabs, text fitting, and absence of page-level horizontal overflow.

- [ ] **Step 5: Verify interactive behavior**

Confirm Performance area navigation, metric synchronization loading state, all four detail tabs, overflow menu actions, priority listing drawer actions, existing table filters, and disconnected/missing-cost states.

- [ ] **Step 6: Run diff and repository checks**

Run: `git diff --check && git status --short && git log -5 --oneline`

Expected: no whitespace errors, only intended files changed, and incremental commits visible.

- [ ] **Step 7: Commit verification fixes if any**

```bash
git add js/features/marketplace-analytics.js js/features/pricing.js js/features/marketplace-performance-model.js js/core/router.js js/core/state.js js/features/marketplace-navigation.js index.html css/flowops.css tests/unit/marketplace-performance-model.test.js tests/unit/marketplace-navigation.test.js tests/e2e/authenticated-smoke.spec.js
git commit -m "fix: finalize marketplace performance dashboard"
```

Skip this commit when verification requires no code changes.
