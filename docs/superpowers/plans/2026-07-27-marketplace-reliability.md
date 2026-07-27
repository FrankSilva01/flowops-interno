# Marketplace Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save products reliably before attempting marketplace publication, repair the audited security and operations failures, and prove the release through automated and live checks.

**Architecture:** Keep the catalog database write as the primary transaction and calculate marketplace publication readiness separately. Add focused pure helpers for readiness and queue behavior so failure paths can be unit-tested without a browser. Preserve server-side authorization at every service-role boundary and use Supabase Vault for scheduled maintenance credentials.

**Tech Stack:** Browser-native ES modules, Node.js test runner, Playwright, Supabase Edge Functions/Deno, PostgreSQL migrations, GitHub Actions, Netlify.

## Global Constraints

- Do not delete existing catalog, listing, queue, audit, or backup data.
- Never embed a service-role key or marketplace token in source, migrations, logs, or client storage.
- Catalog persistence failure keeps the product drawer open.
- Marketplace validation cannot block an otherwise valid catalog save.
- Production completion requires fresh automated and operational evidence.

---

### Task 1: Catalog-first product registration

**Files:**
- Create: `js/features/product-publication-readiness.js`
- Modify: `js/features/pricing.js`
- Modify: `index.html`
- Modify: `tests/unit/product-marketplace-validation.test.js`
- Create: `tests/unit/product-publication-readiness.test.js`

**Interfaces:**
- Consumes: product name, selected channels, account connection, category, image count, and existing listing link.
- Produces: `getProductPublicationReadiness(input)` returning `{ channel, status, blockers }` and user-facing catalog/publication receipts.

- [ ] **Step 1: Write failing readiness and integration tests**

Add assertions that a short name produces a Mercado Livre blocker but does not prevent the catalog upsert, and that disconnected account, missing category, and insufficient images become pending reasons.

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run: `node --test tests/unit/product-publication-readiness.test.js tests/unit/product-marketplace-validation.test.js`
Expected: FAIL because the readiness helper and catalog-first flow do not exist.

- [ ] **Step 3: Implement the minimal catalog-first flow**

Persist `products` before publication validation, compute readiness after the saved product is returned, skip remote publication when blockers exist, and display `Produto salvo no catálogo. Publicação no Mercado Livre pendente: <motivos>.` Keep the drawer open only when the catalog upsert fails and guard the submit button with a `finally` reset.

- [ ] **Step 4: Run focused and full unit checks**

Run: `node --test tests/unit/product-publication-readiness.test.js tests/unit/product-marketplace-validation.test.js && npm run check && npm run test:unit`
Expected: all selected and full unit tests pass.

- [ ] **Step 5: Commit the product fix**

Run: `git add js/features/product-publication-readiness.js js/features/pricing.js index.html tests/unit/product-publication-readiness.test.js tests/unit/product-marketplace-validation.test.js && git commit -m "fix: save catalog products before marketplace publication"`

### Task 2: Authenticated catalog regression flow

**Files:**
- Modify: `tests/e2e/authenticated-smoke.spec.js`

**Interfaces:**
- Consumes: existing authenticated Playwright session and marketplace area tabs.
- Produces: a stable helper that opens `Marketplace > Catálogo` before interacting with `#openCatalogProductDialogBtn`.

- [ ] **Step 1: Update the smoke scenario to reproduce the hidden-button failure**

Make the test explicitly assert that the catalog button is hidden before area selection, select `[data-marketplace-area="catalog"]`, then expect the registration button to be visible.

- [ ] **Step 2: Run the authenticated test against the current code**

Run: `npx playwright test tests/e2e/authenticated-smoke.spec.js --grep "produto"`
Expected before navigation correction: timeout while clicking the hidden registration button.

- [ ] **Step 3: Reuse the corrected navigation for desktop and mobile**

Extract a local `openMarketplaceCatalog(page)` helper and use it in the product scenario so both configured projects follow the same visible path.

- [ ] **Step 4: Run public E2E locally and authenticated E2E when credentials are available**

Run: `npx playwright test tests/e2e/public-smoke.spec.js` and then the authenticated grep command with QA environment variables.
Expected: public tests pass; authenticated product tests pass rather than timing out.

- [ ] **Step 5: Commit the E2E correction**

Run: `git add tests/e2e/authenticated-smoke.spec.js && git commit -m "test: navigate to marketplace catalog before product creation"`

### Task 3: Tenant-safe AI web search

**Files:**
- Create: `supabase-functions/ai-web-search/src/authorization.ts`
- Modify: `supabase-functions/ai-web-search/src/index.ts`
- Create: `tests/unit/ai-web-search-security.test.js`

**Interfaces:**
- Consumes: `Authorization: Bearer <jwt>`, requested `organization_id`, Supabase URL, anon key, and server-side service-role client.
- Produces: `authorizeOrganizationRequest(req, organizationId)` returning the authenticated user ID or an HTTP error; marketplace queries use `connection_status` only after authorization.

- [ ] **Step 1: Write failing source-contract security tests**

Assert that the handler requires a bearer token, resolves the user with a user-scoped client, checks `organization_members`, and queries `marketplace_accounts.connection_status` rather than `status`.

- [ ] **Step 2: Run the security test and confirm failure**

Run: `node --test tests/unit/ai-web-search-security.test.js`
Expected: FAIL because membership authorization and the live schema field are absent.

- [ ] **Step 3: Implement authorization before service-role reads**

Validate the JWT with the Supabase auth API, query membership for the authenticated identity and requested organization, return `401` for invalid identity and `403` for missing membership, then execute marketplace searches with `connection_status = connected`.

- [ ] **Step 4: Run security, syntax, and unit checks**

Run: `node --test tests/unit/ai-web-search-security.test.js && npm run check && npm run test:unit`
Expected: all commands pass.

- [ ] **Step 5: Commit the security fix**

Run: `git add supabase-functions/ai-web-search/src/authorization.ts supabase-functions/ai-web-search/src/index.ts tests/unit/ai-web-search-security.test.js && git commit -m "fix: enforce tenant authorization in AI marketplace search"`

### Task 4: Honest and non-blocking offline queue

**Files:**
- Modify: `js/core/offline-queue.js`
- Modify: `js/data/remote.js`
- Modify: `js/core/session.js`
- Create: `tests/unit/offline-queue.test.js`

**Interfaces:**
- Consumes: organization-scoped pending write entries and remote persistence results.
- Produces: explicit queue-write results, independent flush outcomes `{ flushed, pending, failed }`, dead-letter records, and `clearOfflineData(orgId)` for logout.

- [ ] **Step 1: Write failing queue tests with injected storage**

Cover quota failure, a permanent first-item failure followed by a successful second item, transient retry retention, and removal of pending/dead-letter keys on logout.

- [ ] **Step 2: Run the focused queue tests and confirm failure**

Run: `node --test tests/unit/offline-queue.test.js`
Expected: FAIL because storage errors are swallowed, flushing stops at the first item, and cleanup is absent.

- [ ] **Step 3: Implement explicit outcomes, dead letters, and cleanup**

Return `{ stored, error }` from queue writes, continue flushing after permanent failures, retain transient failures, expose queue counts, and clear both organization keys during logout. Update callers so they never display queued/synchronized success when storage failed.

- [ ] **Step 4: Run queue and complete unit suites**

Run: `node --test tests/unit/offline-queue.test.js && npm run check && npm run test:unit`
Expected: all commands pass.

- [ ] **Step 5: Commit the queue fix**

Run: `git add js/core/offline-queue.js js/data/remote.js js/core/session.js tests/unit/offline-queue.test.js && git commit -m "fix: report and recover offline queue failures"`

### Task 5: Authenticated scheduled backup and release verification

**Files:**
- Create: `supabase/migrations/20260727090000_secure_system_maintenance_cron.sql`
- Modify: `docs/OPERATIONS_RUNBOOK.md`
- Create: `tests/unit/system-maintenance-cron.test.js`

**Interfaces:**
- Consumes: a Vault secret named `flowops_system_maintenance_token` and the existing `system-maintenance` Edge Function.
- Produces: an authenticated pg_cron request whose token is resolved at execution time and never committed.

- [ ] **Step 1: Write a failing migration contract test**

Assert that the new migration reads the named Vault secret, builds an authorization header, and does not contain a literal JWT or service-role value.

- [ ] **Step 2: Run the migration test and confirm failure**

Run: `node --test tests/unit/system-maintenance-cron.test.js`
Expected: FAIL because the secure replacement migration does not exist.

- [ ] **Step 3: Add the secure cron replacement and runbook procedure**

Unschedule the existing named job, create the authenticated schedule using Vault lookup, and document secret provisioning, manual backup invocation, `backup_runs` verification, and staging restore validation.

- [ ] **Step 4: Run all local release checks**

Run: `npm run check && npm run test:unit && npm audit --audit-level=high && npx playwright test tests/e2e/public-smoke.spec.js`
Expected: every command exits zero.

- [ ] **Step 5: Deploy and verify private controls**

Apply the production migration, deploy changed Edge Functions, provision/rotate the Vault secret without printing it, invoke a manual backup, verify a fresh successful `backup_runs` record, push the branch, and monitor `Quality`, `Authenticated quality`, `Production health`, `RLS tenant isolation`, and `Staging restore drill` to completion.

- [ ] **Step 6: Commit deployment artifacts and publish**

Run: `git add supabase/migrations/20260727090000_secure_system_maintenance_cron.sql docs/OPERATIONS_RUNBOOK.md tests/unit/system-maintenance-cron.test.js && git commit -m "fix: authenticate scheduled maintenance backup"`, then push only after the fresh verification gate passes.
