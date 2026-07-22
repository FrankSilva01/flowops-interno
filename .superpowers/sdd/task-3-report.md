# Task 3 Report: Executive Renderer and Detail Sections

## Delivered

- Added `renderMarketplacePerformanceExecutive(snapshot)` to render the four executive indicators, the visits-to-questions-to-sales flow, and up to four prioritized actions from the existing pure performance snapshot.
- Built snapshot entries only from synchronized shared state. Every entry includes `intent: computeIntentScore(analytics)` and reuses the existing profitability resolver.
- Added `setMarketplacePerformanceSection(section)` with allowed-section fallback, tab active state, `aria-selected`, roving tab index, and panel visibility synchronization.
- Bound `set-performance-section` in the central router.
- Preserved the existing performance table, investment ranking, intent ranking and insights, category trends, seller reputation, and financial detail renderers.
- Removed only the call that rendered the duplicate top-level intelligence decision board.

## Revenue Attribution

Marketplace order payloads carry the listing key at `raw_payload.order_items[].item.id`. The marketplace sync also uses that key to find the order for an item, so revenue is allocated to each listing from matching line items as `unit_price * quantity`. Multi-item orders are handled line by line. Records without a matching order-item listing key are excluded rather than attributed heuristically.

## State Handling

- Disconnected and unavailable-access states clear the executive content and retain the existing connection or upsell states.
- No analytics and no positive revenue render explanatory empty states instead of zero-valued indicator cards.
- Partial snapshots keep unavailable conversion, margin, and health values as `Não disponível`.
- When the initial profitability tab has no financial coverage, the section falls back to `listings`; a user-selected valid non-financial section remains selected.

## Tests

- `node --test tests/unit/marketplace-performance-model.test.js`: 11 passed.
- `npm run check`: 60 JavaScript files validated.
- `npm run test:unit`: 98 passed, 0 failed.

## Concerns

- Revenue is based on the sales records currently loaded into `state.marketplaceSales`. It is not date-filtered to the analytics 30-day window, so the revenue indicator represents synchronized sale lines rather than an explicitly aligned period total.
- The marketplace loader limits linked sale records, so a separate aggregate revenue source would be required for a complete historical-revenue indicator at larger volumes.
- The current unit suite verifies the pure model fallback. UI section switching and executive DOM states still need browser-level coverage when Task 5 adds the planned end-to-end checks.

## Review Follow-up Evidence

1. Missing-cost coverage below 50% now keeps `intelligenceAnalysisSection` visible, hides only `marketplacePerformanceProfitabilityPanel`, and sets `marketplacePerformanceSection` to `listings`. Listings, Investment, and Reputation remain available through the existing tabs.
2. Revenue coverage is now established only by a valid `raw_payload.order_items[]` line whose marketplace and item ID match a synchronized listing and whose price and quantity are finite. Before such a line exists, every normalized entry carries `salesRevenue: null`; once coverage exists, matching line totals are aggregated and unmatched current listings remain zero.
3. Disconnected and unavailable-access paths now clear the three executive targets and hide the performance header, indicators, overview, tablist, and shared detail shell. The existing connection empty state or subscription upsell remains visible, and authorized connected renders restore those surfaces.
4. `saveBulkCosts()` now rerenders commercial intelligence and dynamically obtains `renderMarketplaceAnalyticsPanel()` after the successful local state update. This avoids a new top-level import cycle and makes executive margin and priority values refresh without a backend call.

### Verification Run

- `node --test tests/unit/marketplace-performance-model.test.js` exited 0: 12 passed, 0 failed. Added `mantem receita indisponivel sem cobertura de vendas utilizaveis` to lock the null-revenue contract.
- `npm run check` exited 0: `60 arquivos JavaScript validados.`
- `npm run test:unit` exited 0: 99 passed, 0 failed.
- `git diff --check` exited 0 with no whitespace errors.
