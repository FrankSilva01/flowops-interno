# Catalog Findings Fix Report

Base reviewed: `origin/master` at `b2f37b9`.

## Red

- Added `tests/unit/marketplace-catalog-findings.test.js` before production changes.
- Ran `node --test tests/unit/marketplace-catalog-findings.test.js`.
- Result: failed because `marketplaceChannelFiltersVisible` and the related catalog helpers were not exported. This established the requested behavior was absent before the implementation.

## Green

- Escaped marketplace display names and external IDs in the catalog summary, link metadata, and action attributes before `innerHTML` receives them.
- Legacy or unloaded links now render `Pendente de associação` and retain stable `data-marketplace` and `data-external-id` values.
- A linked listing absent from the initial 100-row collection is resolved by a scoped exact query on `organization_id`, `marketplace`, and `external_id`; the original listing pagination cap remains unchanged.
- Channel filters are hidden and disabled outside Operation. The selected channel is retained and restored on return to Operation; routed filter actions are ignored outside Operation.
- `node --test tests/unit/marketplace-catalog-findings.test.js`: 4 passed.
- `npm run check`: 60 JavaScript files validated.
- `npm run test:unit`: 120 passed, 0 failed.
- `npm run test:e2e`: 21 passed, 19 skipped, 0 failed. The public desktop/mobile suite passed.
- `git diff --check`: passed.

## Residual Risks

- The new authenticated Marketplace E2E was skipped because `FLOWOPS_E2E_EMAIL` and `FLOWOPS_E2E_PASSWORD` were not configured. It should be rerun with test credentials against a deployment containing this commit.
- If a persisted `product_listings.marketplace` value differs from its corresponding `marketplace_listings.marketplace` value by a legacy alias rather than exact text, the targeted lookup will not match. Existing link creation stores the same marketplace value, so this is limited to inconsistent historical data.
