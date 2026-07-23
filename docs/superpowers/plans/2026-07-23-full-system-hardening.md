# FlowOps Full-System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FlowOps reproducibly tenant-safe, internally consistent, integration-resilient, accessible, and responsive while preserving the current architecture and visual language.

**Architecture:** Additive Supabase migrations establish database invariants and transactional RPCs. Focused JavaScript helpers consume those contracts so dashboards, reports, marketplace, finance, fiscal, users, and navigation share one source of truth.

**Tech Stack:** Vanilla ES modules, Supabase PostgreSQL/RLS/Storage/Edge Functions, Node test runner, Playwright, Netlify.

## Global Constraints

- Preserve existing user data and current URLs.
- Never expose service-role credentials or add a production authentication bypass.
- Every privileged or multi-table write must be transactional and fail closed.
- Global backups remain platform-only.
- Historical financial evidence must be reversed or linked, not silently erased.
- UI changes must remain usable at 360 px, 720 px, 1280 px, and 1920 px without incoherent overlap.
- Each task follows test-first implementation and receives an independent review.

---

### Task 1: Versioned Tenant And Billing Hardening

**Files:**
- Create: `supabase/migrations/20260723100000_security_hardening.sql`
- Modify: `scripts/rls-isolation-audit.mjs`
- Test: `tests/unit/rls-hardening-contract.test.js`

**Interfaces:**
- Produces RPCs `admin_update_organization_member`, `admin_remove_organization_member`, and a constrained plan-change request contract.
- Produces tenant-scoped lead-file storage paths and browser-read-only billing records.

- [ ] Write contract tests that fail while unsafe policies or missing RPC signatures remain.
- [ ] Add an idempotent migration that drops legacy policies, installs least-privilege policies, validates path ownership, and grants only required RPC execution.
- [ ] Extend the RLS audit with two-tenant Storage and forbidden-mutation probes.
- [ ] Run `node --test tests/unit/rls-hardening-contract.test.js` and `npm run audit:rls`; verify all available probes pass or clearly report missing credentials.
- [ ] Commit the migration and tests.

### Task 2: Client Authorization, Cache, And User Administration

**Files:**
- Modify: `js/core/state.js`, `js/core/session.js`, `js/core/importer.js`, `js/core/router.js`
- Modify: `js/features/reports.js`, `js/features/users.js`
- Create: `js/core/capabilities.js`, `js/core/tenant-cache.js`, `js/core/spreadsheet-safety.js`
- Test: `tests/unit/security-client-hardening.test.js`

**Interfaces:**
- Consumes Task 1 membership RPCs.
- Produces `requireCapability(name)`, tenant cache helpers, and spreadsheet-cell neutralization.

- [ ] Add failing tests for unauthorized exports, formula injection, authoritative member merging, transactional RPC usage, scoped cache keys, and forced-session cleanup.
- [ ] Implement shared capability guards across JSON/CSV/XLSX/PDF exports and hide forbidden controls.
- [ ] Merge member data authoritatively and replace sequential role/removal writes with RPC calls.
- [ ] Namespace and clear operational caches on every logout/access-loss path.
- [ ] Run the focused unit tests and `npm run check`.
- [ ] Commit the client hardening.

### Task 3: Marketplace Contracts And Idempotency

**Files:**
- Modify: `js/features/marketplace.js`, `js/features/logistics.js`
- Modify: `supabase-functions/marketplace-sync/src/index.ts`
- Modify: `supabase/functions/marketplace-webhook/index.ts`
- Create: `supabase/migrations/20260723110000_marketplace_idempotency.sql`
- Test: `tests/unit/marketplace-reliability.test.js`

**Interfaces:**
- Produces `sync-shipment` response `{ status, carrier, tracking_code, shipped_at, delivered_at }`.
- Produces stable publication operations and paginated sync responses `{ processed, total, has_more, coverage, cursor }`.

- [ ] Add failing tests for shipment contract preservation, publication retry, pagination, draft uniqueness, and webhook rejection.
- [ ] Implement shipment synchronization and reject malformed client responses without overwriting existing logistics fields.
- [ ] Persist publication operations before external creation and reconcile retries by operation key.
- [ ] Paginate listings/orders with checkpoints and partial-coverage UI copy.
- [ ] Enforce database uniqueness for migration drafts.
- [ ] Add provider authenticity and replay checks based on the official webhook contract.
- [ ] Run focused tests, JS checks, and Edge Function type checks available in the repository.
- [ ] Commit marketplace reliability changes.

### Task 4: Canonical Order, Logistics, Cash, And Fiscal Lifecycle

**Files:**
- Create: `supabase/migrations/20260723120000_order_finance_fiscal_consistency.sql`
- Create: `js/domain/order-lifecycle.js`, `js/domain/revenue.js`
- Modify: `js/features/orders.js`, `js/features/logistics.js`, `js/features/cash.js`
- Modify: `js/features/dashboard.js`, `js/features/reports.js`
- Modify: `js/features/fiscal.js`, `js/features/fiscal-persistence.js`, `js/core/router.js`
- Test: `tests/unit/order-finance-fiscal-consistency.test.js`

**Interfaces:**
- Produces transactional order lifecycle/reversal RPCs and canonical `calculateRevenueSnapshot`.
- Adds source linkage to generated cash entries and `sales_invoices.order_id` uniqueness.

- [ ] Add failing tests for fiscal import idempotency, purchase-invoice deletion, order deletion/reversal, reopening, logistics delivery, generated cash locks, and dashboard/report agreement.
- [ ] Add additive columns, indexes, backfill, and transactional RPCs.
- [ ] Route order/logistics/delete/reopen flows through the lifecycle contract.
- [ ] Use the same revenue helper in Dashboard and Reports and protect generated rows from ordinary editing.
- [ ] Persist fiscal `order_id`; count imports only after successful persistence; fix purchase deletion local state.
- [ ] Run focused tests and `npm run check`.
- [ ] Commit lifecycle consistency changes.

### Task 5: Real Pagination And Safe Auth Loading

**Files:**
- Modify: `js/data/remote.js`, `js/core/session.js`, `js/features/logs.js`, `js/features/support.js`
- Modify: billing/notification render modules discovered by `rg "subscriptionPayments|notifications" js`
- Test: `tests/unit/pagination-and-loading.test.js`

**Interfaces:**
- Produces cursor/page fetchers that include active filters and report `hasMore`.
- Produces loading, retry, and loaded application shell states.

- [ ] Add failing tests proving data beyond old limits is retrievable and demo data is never visible during authenticated loading/failure.
- [ ] Implement server-side filtered pagination for audit, notifications, billing, and support.
- [ ] Add accessible loading/retry states and clear stale DOM before exposing the app.
- [ ] Run focused tests and `npm run check`.
- [ ] Commit pagination and loading changes.

### Task 6: Accessible Tabs, Dialogs, Popups, And Mobile Navigation

**Files:**
- Modify: `index.html`, `js/core/router.js`, `css/19-estilo5.css`
- Create: `js/ui/accessible-tabs.js`, `js/ui/popup-controller.js`, `js/ui/mobile-navigation.js`
- Test: `tests/e2e/accessibility-navigation.spec.js`

**Interfaces:**
- Produces reusable tablist initialization, popup dismissal, and a five-item mobile navigation with `Mais` drawer.

- [ ] Add failing Playwright tests for dialog naming, Arrow/Home/End tabs, Escape focus restoration, active-route visibility, and 360/720 px overflow.
- [ ] Add stable dialog labels/descriptions and complete tab/panel ARIA relationships.
- [ ] Centralize popup close behavior.
- [ ] Implement Dashboard, Encomendas, Produção, Marketplace, and Mais as mobile primary destinations; place remaining labeled routes in an accessible drawer.
- [ ] Run the E2E file at mobile and desktop viewports and inspect screenshots.
- [ ] Commit accessibility and mobile navigation changes.

### Task 7: Reproducible Local E2E And Function Sources

**Files:**
- Modify: `server.js`, `playwright.config.js`, `package.json`, `supabase/config.toml`
- Create or relocate canonical function sources under `supabase/functions/` for every client-called function found by static scan.
- Modify: `scripts/release-readiness.mjs`
- Test: `tests/unit/deployment-contract.test.js`, authenticated Playwright fixtures

**Interfaces:**
- Produces a local ESM server and deploy-manifest validation; no production auth bypass.

- [ ] Add failing tests for CommonJS startup, missing function sources, and unversioned client function calls.
- [ ] Convert the local server to ESM and configure Playwright `webServer`/baseURL for local execution.
- [ ] Version or explicitly gate every client-called Edge Function and verify config/source parity.
- [ ] Add deterministic authenticated test fixtures using test-only API mocking, never production code paths.
- [ ] Run deployment contract tests and authenticated smoke tests locally.
- [ ] Commit reproducibility changes.

### Task 8: Full Review, Remote Application, And Release

**Files:**
- Update: `CHANGELOG.md`, `SECURITY.md`, `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes every prior task and produces the deployable release.

- [ ] Generate a whole-branch review package and resolve every Critical or Important finding.
- [ ] Run `npm test`, `npm run health`, `npm run release:readiness`, and `npm run audit:rls`.
- [ ] Run `npx supabase db push --dry-run`; inspect every SQL statement, then apply with `npx supabase db push` only if compatible.
- [ ] Deploy changed Edge Functions and execute smoke tests against Supabase.
- [ ] Capture responsive screenshots and verify no overlap or horizontal page overflow.
- [ ] Update release/security documentation, commit, push to `origin/master`, and verify the Netlify deployment.
