# Marketplace Compact Catalog and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline Marketplace catalog form with a four-step dialog and paginate Catalog products and Operation listings so neither section grows indefinitely.

**Architecture:** Add a dependency-free pagination helper, keep independent page state for listings and catalog products, and slice filtered collections only at render time. Preserve the existing storefront form and submission payload, but group its fields into four visual steps controlled by a focused catalog-wizard module.

**Tech Stack:** Static HTML, CSS, native ES modules, Node test runner, existing Supabase-backed Marketplace services.

## Global Constraints

- Keep existing Marketplace API calls, payloads, permissions, synchronization, and editing behavior unchanged.
- Show 10 items per page normally and 5 when the viewport height is small.
- Preserve bulk selections across listing pages; select-all affects only the current page.
- Keep pagination outside horizontally scrollable table containers.
- Use the existing form as the single source of submitted storefront data.

---

### Task 1: Shared pagination helper

**Files:**
- Create: `js/core/pagination.js`
- Create: `tests/unit/pagination.test.js`

**Interfaces:**
- Produces: `paginate(items, requestedPage, pageSize)` returning `{ items, page, pageSize, pageCount, total, start, end }`.
- Produces: `responsivePageSize(viewportHeight, normalSize = 10, compactSize = 5, compactBreakpoint = 820)`.

- [ ] Write failing tests for empty collections, page clamping, intervals, and the 820 px compact breakpoint.
- [ ] Run `node --test tests/unit/pagination.test.js` and verify module-not-found failure.
- [ ] Implement the two pure functions with integer normalization and no browser dependencies.
- [ ] Run the focused test and verify all cases pass.
- [ ] Commit with `feat: adiciona paginacao responsiva compartilhada`.

### Task 2: Catalog four-step dialog

**Files:**
- Create: `js/features/storefront-wizard.js`
- Create: `tests/unit/storefront-wizard.test.js`
- Modify: `index.html`
- Modify: `js/core/router.js`
- Modify: `js/features/marketplace.js`
- Modify: `css/flowops.css`

**Interfaces:**
- Produces: `openStorefrontProductDialog({ editing = false })`, `closeStorefrontProductDialog()`, `goToStorefrontStep(step)`, and `resetStorefrontWizard()`.
- Consumes: existing `#storefrontProductForm`, `saveStorefrontProduct`, `populateStorefrontForm`, and marketplace target-field visibility.

- [ ] Write failing structural and pure-state tests requiring four steps, previous/next controls, final-only submit, and `aria-current="step"`.
- [ ] Run focused tests and verify failure because the dialog and module do not exist.
- [ ] Move the existing form into `#storefrontProductDialog`, preserving every field name and ID.
- [ ] Group fields into four `.storefront-form-step` containers: basics/images, commercial/technical data, channels/channel fields, review.
- [ ] Implement step validation using `checkValidity()` only for enabled controls in the active step.
- [ ] Bind new-catalog, close, previous, next, and step-indicator interactions through the router.
- [ ] Open editing in the same dialog after `populateStorefrontForm` fills the existing form.
- [ ] Keep save errors visible and keep the dialog open; close and reset only after successful save.
- [ ] Add responsive dialog sizing and a sticky action footer.
- [ ] Run focused tests and `npm run check`.
- [ ] Commit with `feat: restaura cadastro de catalogo por etapas`.

### Task 3: Catalog products pagination

**Files:**
- Modify: `js/core/state.js`
- Modify: `js/features/marketplace.js`
- Modify: `js/core/router.js`
- Modify: `index.html`
- Modify: `css/flowops.css`
- Create: `tests/unit/storefront-pagination-ui.test.js`

**Interfaces:**
- Consumes: `paginate` and `responsivePageSize` from `js/core/pagination.js`.
- Produces: `state.storefrontPage`, `#storefrontPagination`, and delegated `data-action="storefront-page"` controls.

- [ ] Write failing tests requiring independent state, paginated render slice, interval text, and accessible page controls.
- [ ] Run tests and verify expected failure.
- [ ] Render at most the responsive page size in `renderStorefrontAdmin` and clamp `state.storefrontPage`.
- [ ] Add pagination below `#storefrontProductList`, outside any list scroll container.
- [ ] Reset to page 1 when catalog data is refreshed or changed.
- [ ] Bind previous, numbered, and next page actions using delegated routing.
- [ ] Run focused tests and the unit suite.
- [ ] Commit with `feat: pagina produtos publicados no catalogo`.

### Task 4: Operation listings pagination

**Files:**
- Modify: `js/core/state.js`
- Modify: `js/features/marketplace.js`
- Modify: `js/core/router.js`
- Modify: `index.html`
- Modify: `css/flowops.css`
- Create: `tests/unit/marketplace-listings-pagination-ui.test.js`

**Interfaces:**
- Consumes: `paginate`, `responsivePageSize`, filtered listings, and `selectedMarketplaceMigrations`.
- Produces: `state.marketplaceListingsPage`, `#marketplaceListingsPagination`, and delegated `data-action="marketplace-listings-page"` controls.

- [ ] Write failing tests requiring filtering-before-pagination, current-page detail, persistent selection, and current-page select-all.
- [ ] Run tests and verify expected failure.
- [ ] Paginate filtered listings while retaining KPI calculations over the complete filtered collection.
- [ ] Render rows and the detail card from the current page only.
- [ ] Add pagination below the listings grid and reset page on search, channel, or quick-filter change.
- [ ] Change select-all to use only current-page listing keys while preserving selections from other pages.
- [ ] Bind pagination actions through delegated routing.
- [ ] Run focused tests and the full unit suite.
- [ ] Commit with `feat: pagina anuncios do Marketplace`.

### Task 5: Responsive validation, cache, and release

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Test: `tests/unit/*.test.js`

**Interfaces:**
- Consumes: completed wizard and both paginators.
- Produces: deployable cache-busted static application.

- [ ] Verify desktop and mobile markup for no unbounded catalog/listing sections and no horizontal overflow introduced by paginators.
- [ ] Update CSS/app query versions and the service-worker cache name.
- [ ] Run `npm run check`, `npm run test:unit`, `npm run release:readiness`, and `git diff --check`.
- [ ] Run operational health when private environment variables are available; otherwise record the missing-variable limitation separately.
- [ ] Commit with `chore: prepara Marketplace compacto para deploy`.
- [ ] Push the verified `HEAD` to `origin/master` and confirm the remote SHA.
