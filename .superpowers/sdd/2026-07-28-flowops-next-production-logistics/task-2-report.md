# Task 2 Report: FlowOps Next Production Experience

## Scope

Implemented the FlowOps Next production board without changing permissions,
remote/database behavior, stable production filter IDs, existing action names,
or the drag-and-drop update path.

The renderer now supplies a caller-local `new Date()` to
`buildProductionPresentation(orders, { stages, now })`, renders the compact
summary and board columns from that model, and retains the existing card
actions and inline controls.

## RED Evidence

Command:

```powershell
node --test tests/unit/production-next.test.js
```

Result before implementation: `4` tests run, `1` passed, `3` failed.

Expected missing-feature failures:

- FlowOps Next production structure and stable contracts were absent.
- `production.js` did not import or call `buildProductionPresentation` with
  an explicit local operational date.
- The board-scoped scroll wrapper and CSS rule were absent.

The already-existing card action contract passed, confirming the test was
checking preservation rather than asking for a new mutation interface.

## GREEN Evidence

Commands:

```powershell
node --test tests/unit/production-next.test.js
node --test tests/unit/production-presentation.test.js tests/unit/production-next.test.js tests/unit/ui-contracts.test.js
npm run check
npx playwright test tests/e2e/authenticated-smoke.spec.js --grep @release:production-next
```

Results:

- New production unit contract: `4` passed, `0` failed.
- Required focused unit suite: `10` passed, `0` failed.
- JavaScript checker: `68` files validated.
- Authenticated release E2E was discovered for desktop and mobile, then both
  were skipped because `FLOWOPS_E2E_EMAIL` and `FLOWOPS_E2E_PASSWORD` are not
  configured in this worktree.

## Changed Files

- `index.html`: Stable production summary and board containers, plus a scoped
  production drawer class.
- `js/features/production.js`: Presentation-model rendering, explicit local
  operational date, card image fallback, progress display, and preserved
  existing interactions.
- `css/flowops.css`: Scoped FlowOps Next production layout, responsive
  summary/cards, and contained horizontal board scroll.
- `tests/unit/production-next.test.js`: Structural, model-call, action, and
  scroll-ownership contracts.
- `tests/e2e/authenticated-smoke.spec.js`: `@release:production-next` mobile
  check for summary, contained overflow, card identity, and drawer opening.

## Self-Review

- `kanbanFilters` and `kanbanBoard` IDs are unchanged.
- `filterProductionOrders` remains the source of production filter behavior.
- Drag/drop still calls `updateOrderInline(orderId, "productionStage", stage)`.
- Existing `open-order-drawer`, `edit-order-modal`, and
  `copy-marketplace-code` actions and inline status/priority/responsible
  selects remain in each card.
- Image URLs pass through the existing `safeUrl` utility; absent images render
  an icon fallback.
- No remote, database, or permissions code was changed.

## Concerns

- The brief named `css/source/flowops-next.css`, but this checkout has no
  `css/source` directory or CSS build script. `index.html` directly links the
  consolidated `css/flowops.css`, so the scoped styles were correctly applied
  there instead.
- The authenticated Playwright assertion could not run against real order data
  without the configured E2E credentials. It is present and selected by the
  release tag, but needs a credentialed CI/local run for live drawer and
  viewport evidence.

## Fix Round 1

### P1 Resolution

The production renderer previously retained a local eligibility predicate that
accepted both `Aprovado` and `Convertido em encomenda`, while the pure
presentation model accepted only converted quotes. This left approved quotes
outside both the kanban model and the pending quote summary.

`isProductionEligible` is now exported by `production-presentation.js` and
imported plus re-exported by `production.js`. The one shared rule preserves the
Task 1 domain behavior: orders with no quote stage or with
`Convertido em encomenda` enter production; `Aprovado` remains a pending quote.

Added a render-path regression with one approved and one converted quote. It
verifies that the approved quote appears in `productionQuoteSummary`, does not
appear in the kanban or production total, and that the converted quote appears
in the kanban while the summary total is one.

### Fix Round 1 Evidence

RED command:

```powershell
node --test tests/unit/production-next.test.js
```

Result before the shared-rule change: `5` tests run, `4` passed, `1` failed.
The new render-path test failed because `productionQuoteSummary` was empty for
the approved quote.

GREEN commands:

```powershell
node --test tests/unit/production-next.test.js tests/unit/production-presentation.test.js
npm run test:unit
npm run check
npx playwright test tests/e2e/authenticated-smoke.spec.js --grep @release:production-next
```

Results:

- Focused production suite: `9` passed, `0` failed.
- Full unit suite: `191` passed, `0` failed.
- JavaScript checker: `68` files validated.
- Authenticated production release test remains mandatory and was discovered
  for desktop and mobile, but both executions were skipped without E2E
  credentials. This is not accepted as passing release evidence; the existing
  release gate continues to block shipment until credentialed 390px execution
  passes.
