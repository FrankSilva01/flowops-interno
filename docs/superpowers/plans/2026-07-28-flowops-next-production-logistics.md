# FlowOps Next Production and Logistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Production and Logistics with the FlowOps Next interface while preserving production transitions, marketplace shipment synchronization, public tracking, realtime updates and tenant isolation.

**Architecture:** Keep existing state, persistence and router handlers as the application boundary. Add pure presentation helpers, then migrate the two renderers and scoped CSS without changing database or Edge Function contracts. Extend authenticated release evidence so visual changes cannot ship unless production, logistics, tracking and realtime contracts pass.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, Supabase JS, Node test runner and Playwright.

## Global Constraints

- Production data continues to come from `state.data.orders` and `productionStage`.
- Logistics data continues to come from `state.orderLogistics` and `state.logisticsEvents`.
- Do not add a database migration or change Edge Function contracts.
- Preserve IDs, form names, `data-action` values and marketplace external identifiers.
- Do not add demo or fallback records to authenticated screens.
- Page-level horizontal overflow is forbidden at desktop, tablet and 390 px mobile widths.
- Marketplace shipment sync, automatic logistics updates, public tracking, realtime and tenant isolation remain mandatory release gates.

---

### Task 1: Pure Production and Logistics Presentation Models

**Files:**
- Create: `js/features/production-presentation.js`
- Create: `js/features/logistics-presentation.js`
- Test: `tests/unit/production-presentation.test.js`
- Test: `tests/unit/logistics-presentation.test.js`

**Interfaces:**
- Consumes: real order objects, logistics rows, events and the current date.
- Produces: `buildProductionPresentation(orders, options)` and `buildLogisticsPresentation(orders, logisticsRows, options)`.

- [ ] **Step 1: Write failing production presentation tests**

Test that the helper groups eligible orders by normalized stage, derives queued/producing/review/ready/late counts, preserves order identity and never mutates the input.

```js
const model = buildProductionPresentation(orders, { stages, now: new Date("2026-07-28T12:00:00Z") });
assert.equal(model.summary.late, 1);
assert.equal(model.columns[0].orders[0].id, "PED-1");
assert.deepEqual(orders, original);
```

- [ ] **Step 2: Write failing logistics presentation tests**

Test waiting/moving/late/problem/delivered counts, missing tracking, next-action priority, explicit empty labels and input immutability.

```js
const model = buildLogisticsPresentation(orders, rows, { now: new Date("2026-07-28T12:00:00Z") });
assert.equal(model.summary.late, 1);
assert.equal(model.items.find((item) => item.orderId === "PED-2").trackingLabel, "Sem codigo");
```

- [ ] **Step 3: Run tests and confirm missing-module failures**

Run: `node --test tests/unit/production-presentation.test.js tests/unit/logistics-presentation.test.js`

Expected: FAIL because both modules do not exist.

- [ ] **Step 4: Implement the minimal pure helpers**

Use safe display values only. Return summary objects, ordered columns/items and explicit labels. Do not import `state`, access the DOM or perform remote operations.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/unit/production-presentation.test.js tests/unit/logistics-presentation.test.js`

Expected: PASS.

```bash
git add js/features/production-presentation.js js/features/logistics-presentation.js tests/unit/production-presentation.test.js tests/unit/logistics-presentation.test.js
git commit -m "feat: add production and logistics presentation models"
```

---

### Task 2: FlowOps Next Production Experience

**Files:**
- Modify: `index.html` (`#productionView` and production drawer structure)
- Modify: `js/features/production.js`
- Modify: `css/source/flowops-next.css`
- Test: `tests/unit/production-next.test.js`
- Test: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: `buildProductionPresentation`, current `filterProductionOrders`, `updateOrderInline`, `open-order-drawer` and existing filter state.
- Produces: full-width `.production-next-board`, compact summary and responsive cards while retaining current mutation handlers.

- [ ] **Step 1: Write failing structural and contract tests**

Assert that Production contains a compact summary, a board-scoped scroll container and stable `kanbanFilters`/`kanbanBoard` IDs. Assert card actions remain `open-order-drawer`, `edit-order-modal`, `copy-marketplace-code` and inline update controls.

- [ ] **Step 2: Add authenticated Playwright expectations**

Add `@release:production-next` for summary visibility, card identity, drawer opening, contained kanban overflow and no page overflow at 390 px.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test tests/unit/production-next.test.js`

Expected: FAIL because the new structure/classes are absent.

- [ ] **Step 4: Migrate production markup and renderer**

Render summary and columns from the pure presentation model. Preserve the current filtering and drag/drop path. Cards display safe image fallback, code, client, description, delivery, priority, progress and responsible data when available.

- [ ] **Step 5: Add scoped responsive CSS**

Keep page width stable, place horizontal scrolling only on `.production-next-board-scroll`, use stable column dimensions and keep drawer controls reachable at 390 px.

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/unit/production-presentation.test.js tests/unit/production-next.test.js tests/unit/ui-contracts.test.js`

Expected: PASS.

```bash
git add index.html js/features/production.js css/source/flowops-next.css tests/unit/production-next.test.js tests/e2e/authenticated-smoke.spec.js
git commit -m "feat: migrate production to FlowOps Next"
```

---

### Task 3: FlowOps Next Logistics Experience

**Files:**
- Modify: `index.html` (`#logisticsView` and `#logisticsDialog`)
- Modify: `js/features/logistics.js`
- Modify: `css/source/flowops-next.css`
- Test: `tests/unit/logistics-next.test.js`
- Test: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: `buildLogisticsPresentation`, existing search/status state, `open-logistics`, `sync-all-ml-shipments`, `sync-ml-shipment`, `copy-public-tracking`, forms and timeline renderer.
- Produces: responsive logistics summary, attention board, table/list and drawer without changing remote mutation functions.

- [ ] **Step 1: Write failing logistics structure tests**

Assert stable IDs and actions, new responsive list semantics, explicit synchronization status and preserved form field names `orderId`, `carrier`, `trackingCode`, `status`, `estimatedDeliveryDate`, `eventStatus` and `eventMessage`.

- [ ] **Step 2: Add authenticated Playwright expectations**

Add `@release:logistics-next` for real persisted status, drawer opening, public link control, timeline visibility and no page overflow at 390 px.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `node --test tests/unit/logistics-next.test.js`

Expected: FAIL because the new structure/classes are absent.

- [ ] **Step 4: Migrate logistics markup and renderer**

Use the pure presentation model for summary and items. Keep `maybeAutoSyncMarketplaceLogistics`, `applyLogisticsSync`, save/event functions and remote table names unchanged. Render desktop table semantics and mobile stacked content from the same real model.

- [ ] **Step 5: Reorganize the existing drawer**

Group overview, synchronization, public link, event form and timeline visually. Do not add fields or persistence. Disable mutation controls when `state.canEdit` is false.

- [ ] **Step 6: Add scoped responsive CSS and commit**

Run: `node --test tests/unit/logistics-presentation.test.js tests/unit/logistics-next.test.js tests/unit/ui-contracts.test.js`

Expected: PASS.

```bash
git add index.html js/features/logistics.js css/source/flowops-next.css tests/unit/logistics-next.test.js tests/e2e/authenticated-smoke.spec.js
git commit -m "feat: migrate logistics to FlowOps Next"
```

---

### Task 4: Integration and Realtime Release Evidence

**Files:**
- Modify: `tests/e2e/release-integrations.spec.js`
- Modify: `tests/e2e/authenticated-smoke.spec.js`
- Modify: `scripts/playwright-release-evidence-core.mjs`
- Modify: `tests/unit/release-evidence.test.js`
- Modify: `docs/SAAS_RELEASE_READINESS.md`

**Interfaces:**
- Consumes: existing release fixtures and current release gate.
- Produces: mandatory machine-readable evidence for production transition, logistics persistence, marketplace synchronization, public tracking and two-session realtime.

- [ ] **Step 1: Extend failing evidence tests**

Require scenario IDs `production-transition`, `logistics-automation`, `public-tracking`, `realtime-two-session`, `production-next` and `logistics-next` in the expected desktop/mobile projects.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/unit/release-evidence.test.js`

Expected: FAIL because production transition and redesigned screen evidence are not yet required.

- [ ] **Step 3: Implement authenticated evidence**

Use a seeded order fixture. Persist a production stage update, observe it in a second browser session, restore its original stage in cleanup, verify logistics/events remain scoped to the active organization, then verify the public token response without login.

- [ ] **Step 4: Make skipped or failed required scenarios block release**

Update the evidence manifest without allowing public-only Playwright success to satisfy the gate.

- [ ] **Step 5: Update operational documentation and commit**

Run: `node --test tests/unit/release-evidence.test.js tests/unit/release-gate.test.js`

Expected: PASS.

```bash
git add tests/e2e/release-integrations.spec.js tests/e2e/authenticated-smoke.spec.js scripts/playwright-release-evidence-core.mjs tests/unit/release-evidence.test.js docs/SAAS_RELEASE_READINESS.md
git commit -m "test: gate production and logistics release evidence"
```

---

### Task 5: Full Regression and Release Preparation

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `sw.js` only after all release evidence is available and approved
- Test: existing unit, E2E, health, RLS and staging suites

**Interfaces:**
- Consumes: completed Phase 2 implementation and private release credentials.
- Produces: reviewed release candidate; no deployment is performed by this task.

- [ ] **Step 1: Run static and unit verification**

Run: `npm run check && npm run test:unit && npm audit`

Expected: all tests pass and audit reports zero production vulnerabilities.

- [ ] **Step 2: Run public E2E repeatedly**

Run: `npm run test:e2e`

Expected without private credentials: public scenarios pass and private scenarios skip; this is development evidence only, not release approval.

- [ ] **Step 3: Run the fail-closed release gate with private credentials**

Run: `npm run release:gate`

Expected: authenticated desktop/mobile, integration, realtime, private health, RLS and staging restore evidence all pass with zero required skips.

- [ ] **Step 4: Perform visual verification**

Capture desktop and 390 px screenshots for Production, production drawer, Logistics and logistics drawer. Confirm page width, contained kanban scrolling, visible actions and readable empty/error states.

- [ ] **Step 5: Advance cache only for an approved candidate**

If and only if Step 3 passes, bump `CACHE_NAME` in `sw.js`, update its exact unit expectation and document the new version in `CHANGELOG.md`. If private evidence is unavailable, leave the cache version unchanged and record the release blocker.

- [ ] **Step 6: Final review and commit**

Run: `git diff --check && npm run release:readiness`

Expected: PASS and clean worktree after commit.

```bash
git add CHANGELOG.md sw.js tests docs scripts js css index.html
git commit -m "chore: prepare production and logistics release"
```
