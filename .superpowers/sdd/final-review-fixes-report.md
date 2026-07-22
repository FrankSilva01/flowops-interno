# Final Review Fixes Report

## Addressed Findings

1. Revenue now loads through a dedicated 30-day backend query for confirmed order states. It uses an exact count and labels the revenue as partial when more than 1,000 matching rows are returned, rather than treating the operational latest-100 query as complete.
2. Portfolio conversion now uses only listing rows where both visits and sales are known.
3. Performance tabs support ArrowLeft, ArrowRight, Home, and End. The selected tab receives focus and ARIA selection/tabindex state remains synchronized.
4. The executive flow renders the aggregated `visits_series` with the existing `renderLineChart` utility and shows a clear fallback when no history exists.
5. Any financial coverage keeps `Rentabilidade` as the initial section, including listings that still lack a registered cost.
6. Focused tests cover revenue query semantics, conversion pairing, historical series, tab switching/focus retention, loading/failure preservation, disconnected state, and missing-cost behavior.

## Verification

- `npm run check`: passed (60 JavaScript files).
- `npm run test:unit`: passed (108 tests).
- `npm run test:e2e`: passed (21 tests); 17 authenticated scenarios skipped because `FLOWOPS_E2E_EMAIL` and `FLOWOPS_E2E_PASSWORD` are not configured.
- `git diff --check`: passed.

## Residual Risks

- The 30-day revenue window uses the persisted order-link `created_at`, the existing client-visible timestamp. The schema does not expose a dedicated marketplace sale-date column; a backfilled link can therefore be excluded from this period.
- Revenue is explicitly marked partial above 1,000 confirmed rows. A paginated backend endpoint or a dedicated aggregate would remove that presentation limit.
- Authenticated E2E scenarios, including live Marketplace rendering and keyboard interaction in a logged-in tenant, require configured test credentials to execute.

## Einstein Revenue Follow-up

1. Executive revenue no longer derives from loaded listings, so the operational latest-100 listing view cannot undercount it.
2. Revenue normalization reuses `report-marketplace-data.js` helpers for Mercado Livre, Amazon, and native order payloads. Unsupported payloads, unknown statuses, missing amounts, and missing real timestamps produce partial or unavailable coverage instead of a zero value.
3. The 30-day window now uses marketplace sale/order timestamps (`date_closed` or `date_created` for Mercado Livre, `PurchaseDate` for Amazon, and native order dates). `marketplace_order_links.created_at` is not used as a period fallback.

### Follow-up Verification

- Added behavioral tests for 101 independent sales, Mercado Livre/Amazon/native payloads, actual-sale-date backfills, and missing real timestamps.
- `npm run check`: passed.
- `npm run test:unit`: passed (111 tests).
- Initial parallel `npm run test:e2e` run had one mobile Chromium context shutdown before test setup; the same test passed when rerun serially with one worker.
- Full serial E2E verification initially passed (21 tests; 17 authenticated scenarios skipped because credentials are not configured). A later serial rerun had one pre-setup Chromium context shutdown in the public mobile ARIA test; that exact test passed immediately when rerun in isolation with one worker. This is retained as a runner-environment risk, not a product failure.
- Restored prior UI integration coverage as behavioral tests for retained Rentabilidade selection, keyboard detail navigation, unavailable/partial revenue semantics, and historical visualization inputs.
