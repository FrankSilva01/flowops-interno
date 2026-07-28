# FlowOps Next Shell, Orders and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the global shell and Orders experience to the approved FlowOps Next design, adding a read-only reference Library derived from existing real order data without changing marketplace or logistics contracts.

**Architecture:** Keep `state`, `js/data/remote.js`, Supabase tables, realtime subscriptions and existing `data-action` handlers as the application boundary. Add focused view-model helpers for presentation, add semantic HTML containers to `index.html`, and place the new visual layer in a final CSS source file so it can be reviewed and reverted independently.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, Supabase JS, Node test runner, Playwright.

## Global Constraints

- No prototype demo records may appear in the production application.
- Orders must continue to come from `state.data.orders`, originally loaded from `public.orders`.
- Existing marketplace listings, external IDs and account connections must remain unchanged.
- `order_logistics`, `logistics_events`, public tracking and realtime subscriptions must not be modified in this phase.
- Existing element IDs and `data-action` contracts remain stable unless their handlers and regression tests change together.
- No database migration is required in this phase.
- Desktop and mobile layouts must not introduce horizontal page overflow.

---

### Task 1: Presentation contracts for Orders and Library

**Files:**
- Create: `js/features/reference-library.js`
- Modify: `js/features/orders.js`
- Test: `tests/unit/reference-library.test.js`
- Test: `tests/unit/orders-presentation.test.js`

**Interfaces:**
- Consumes: `state.data.orders`, `safeUrl(value)` and existing order fields `referenceImageUrl`, `stlLink`, `orderCode`, `client`, `description`, `productId`.
- Produces: `buildReferenceLibrary(orders): ReferenceAsset[]` and `buildOrderPresentation(order): OrderPresentation`.

- [ ] **Step 1: Write failing tests for real-data derivation**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildReferenceLibrary } from "../../js/features/reference-library.js";

test("derives image and STL assets from existing orders", () => {
  const assets = buildReferenceLibrary([{
    id: "PED-1", orderCode: "PED-0001", client: "Cliente real",
    description: "Produto real", referenceImageUrl: "https://cdn.test/ref.jpg",
    stlLink: "https://drive.test/model.stl"
  }]);
  assert.deepEqual(assets.map(({ type, orderCode }) => ({ type, orderCode })), [
    { type: "image", orderCode: "PED-0001" },
    { type: "model", orderCode: "PED-0001" }
  ]);
});

test("does not create sample assets when orders have no references", () => {
  assert.deepEqual(buildReferenceLibrary([{ id: "PED-2", orderCode: "PED-0002" }]), []);
});
```

- [ ] **Step 2: Run tests and confirm the missing-module failure**

Run: `node --test tests/unit/reference-library.test.js tests/unit/orders-presentation.test.js`

Expected: FAIL because `reference-library.js` and `buildOrderPresentation` do not exist.

- [ ] **Step 3: Implement pure presentation helpers**

```js
export function buildReferenceLibrary(orders = []) {
  return orders.flatMap((order) => {
    const common = {
      orderId: order.id,
      orderCode: order.orderCode || order.id,
      client: order.client || "Cliente não informado",
      title: order.description || "Encomenda sem descrição"
    };
    return [
      order.referenceImageUrl && { ...common, id: `${order.id}:image`, type: "image", url: order.referenceImageUrl },
      order.stlLink && { ...common, id: `${order.id}:model`, type: "model", url: order.stlLink }
    ].filter(Boolean);
  });
}
```

`buildOrderPresentation` must return safe display fallbacks and the original `order` object, without mutating it.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/unit/reference-library.test.js tests/unit/orders-presentation.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the presentation contracts**

```bash
git add js/features/reference-library.js js/features/orders.js tests/unit/reference-library.test.js tests/unit/orders-presentation.test.js
git commit -m "feat: add order and reference presentation models"
```

---

### Task 2: FlowOps Next shell without routing regressions

**Files:**
- Modify: `index.html:28-150`
- Create: `css/20-flowops-next-shell.css`
- Modify: `css/flowops.css`
- Test: `tests/e2e/public-smoke.spec.js`
- Test: `tests/unit/ui-contracts.test.js`

**Interfaces:**
- Consumes: existing `.app-shell`, `.sidebar`, `.tab`, `#sidebarToggle`, `data-view`, topbar buttons and router behavior.
- Produces: the approved compact/expanded sidebar, responsive topbar and shared tokens without changing `data-view` values.

- [ ] **Step 1: Add failing shell contract assertions**

```js
test("shell keeps stable navigation contracts", async () => {
  const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  for (const view of ["dashboard", "orders", "production", "logistics", "marketplace"]) {
    assert.match(html, new RegExp(`data-view=["']${view}["']`));
  }
  assert.match(html, /id=["']sidebarToggle["']/);
});
```

Extend Playwright coverage to assert the sidebar opens from compact mode at 1440x900 and becomes bottom navigation at 390x844.

- [ ] **Step 2: Run the focused shell tests**

Run: `node --test tests/unit/ui-contracts.test.js && npx playwright test tests/e2e/public-smoke.spec.js`

Expected: FAIL on the new FlowOps Next structural class assertions.

- [ ] **Step 3: Implement shell markup and final CSS layer**

Add only semantic wrappers and classes. Preserve IDs and `data-view` attributes. Define tokens such as `--next-bg`, `--next-surface`, `--next-line`, `--next-text`, `--next-muted`, `--next-accent` in `20-flowops-next-shell.css`, then append that source verbatim to the consolidated `css/flowops.css` with a source header. Do not add decorative gradients or duplicate controls.

- [ ] **Step 4: Rebuild CSS and run shell tests**

Run: `npm run check && node --test tests/unit/ui-contracts.test.js && npx playwright test tests/e2e/public-smoke.spec.js`

Expected: PASS with no JavaScript errors and no horizontal page overflow.

- [ ] **Step 5: Commit the shell migration**

```bash
git add index.html css/20-flowops-next-shell.css css/flowops.css tests/e2e/public-smoke.spec.js tests/unit/ui-contracts.test.js
git commit -m "feat: migrate application shell to FlowOps Next"
```

---

### Task 3: Orders list and detail experience

**Files:**
- Modify: `index.html:394-581`
- Modify: `js/features/orders.js`
- Create: `css/21-flowops-next-orders.css`
- Modify: `css/flowops.css`
- Test: `tests/unit/orders-presentation.test.js`
- Test: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: `renderOrders()`, existing filter state, bulk selection, `data-action` handlers, `#ordersCardList`, `#ordersTable`, `#orderCreateDialog`, `#orderEditDialog`.
- Produces: responsive Order cards/table and detail drawer showing real reference, financial and logistics fields.

- [ ] **Step 1: Add failing regression tests**

Add unit assertions that the renderer includes the original order ID, client, description and real `referenceImageUrl`. Add authenticated Playwright assertions that search, status filters, card/table toggle, edit, bulk selection and new-order dialog remain actionable.

- [ ] **Step 2: Run focused tests and record failures**

Run: `node --test tests/unit/orders-presentation.test.js && npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "orders"`

Expected: FAIL on new FlowOps Next card/drawer structure.

- [ ] **Step 3: Implement the Orders composition**

Render the KPI strip from filtered `state.data.orders`. Render image thumbnails only from `referenceImageUrl` or existing product assets, otherwise use an icon placeholder. Keep the existing action buttons and handler attributes. Reorganize the create form into visual sections without changing field names used by submission code.

- [ ] **Step 4: Verify Orders behavior and responsiveness**

Run: `npm run check && node --test tests/unit/orders-presentation.test.js && npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "orders"`

Expected: PASS at desktop and mobile widths; all values come from test fixtures or authenticated backend state.

- [ ] **Step 5: Commit Orders migration**

```bash
git add index.html js/features/orders.js css/21-flowops-next-orders.css css/flowops.css tests/unit/orders-presentation.test.js tests/e2e/authenticated-smoke.spec.js
git commit -m "feat: migrate orders to FlowOps Next"
```

---

### Task 4: Read-only reference Library from existing orders

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `js/core/router.js`
- Modify: `js/features/reference-library.js`
- Create: `css/22-flowops-next-library.css`
- Modify: `css/flowops.css`
- Test: `tests/unit/reference-library.test.js`
- Test: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: `buildReferenceLibrary(state.data.orders)` and existing router `data-view` conventions.
- Produces: `renderReferenceLibrary(): void` and the `library` route, with filters for type, order and client.

- [ ] **Step 1: Add failing Library route and empty-state tests**

```js
test("library groups only persisted order references", () => {
  const assets = buildReferenceLibrary(realOrderFixture);
  assert.equal(assets.some((asset) => asset.orderId === "sample"), false);
  assert.equal(assets.every((asset) => asset.orderCode), true);
});
```

Add Playwright coverage that opens `data-view="library"`, verifies cards from seeded order references and verifies the empty state after filtering to a missing type.

- [ ] **Step 2: Run focused Library tests**

Run: `node --test tests/unit/reference-library.test.js && npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "library"`

Expected: FAIL because the route and renderer are absent.

- [ ] **Step 3: Implement route, renderer and responsive grid**

Add a sidebar item under Operação. Render cards with safe image previews, file-type icons, order/client association and links that open using the existing safe URL helper. Keep the view read-only in this phase.

- [ ] **Step 4: Verify Library and related Orders state**

Run: `npm run check && node --test tests/unit/reference-library.test.js && npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "library|orders"`

Expected: PASS with no sample records and no overflow at 390px.

- [ ] **Step 5: Commit the Library module**

```bash
git add index.html js/app.js js/core/router.js js/features/reference-library.js css/22-flowops-next-library.css css/flowops.css tests/unit/reference-library.test.js tests/e2e/authenticated-smoke.spec.js
git commit -m "feat: add order reference library"
```

---

### Task 5: Full regression and release safety

**Files:**
- Modify: `sw.js`
- Modify: `CHANGELOG.md`
- Modify: `docs/SAAS_REGRESSION_CHECKLIST.md`
- Test: `tests/unit/release-version.test.js`

**Interfaces:**
- Consumes: completed shell, Orders and Library modules.
- Produces: versioned cache and release evidence showing marketplace and logistics were not regressed.

- [ ] **Step 1: Add failing cache-version expectation**

Update `tests/unit/release-version.test.js` to expect cache name `flowops-v63`. The new CSS remains bundled in `/css/flowops.css`, so `STATIC_ASSETS` must continue to contain that consolidated path exactly once and must not add the source CSS files.

- [ ] **Step 2: Run release test and confirm failure**

Run: `node --test tests/unit/release-version.test.js`

Expected: FAIL with the previous cache version.

- [ ] **Step 3: Bump cache and document the release**

Update `sw.js`, add a changelog entry, and record explicit regression checks for existing marketplace listings, imported orders, logistics sync, public tracking and realtime refresh.

- [ ] **Step 4: Run complete verification**

Run: `npm test && npm run health && npm run release:readiness`

Expected: all checks PASS. If authenticated E2E prerequisites are unavailable, record the exact skipped prerequisites and do not deploy.

- [ ] **Step 5: Review the final diff and commit release safety**

```bash
git diff --check
git status --short
git add sw.js CHANGELOG.md docs/SAAS_REGRESSION_CHECKLIST.md tests/unit/release-version.test.js
git commit -m "chore: prepare FlowOps Next phase one release"
```
