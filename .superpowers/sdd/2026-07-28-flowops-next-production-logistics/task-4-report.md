# Task 4 Report: Integration and Realtime Release Evidence

## Status

Implementation complete; release evidence remains incomplete until the credentialed local-candidate gate runs with zero required skips. The machine-readable gate requires production transition, production Next, and logistics Next evidence while retaining marketplace synchronization, logistics automation, public tracking, and two-session realtime evidence.

## RED commands

1. `node --test tests/unit/release-evidence.test.js`
   - RED: 5 passed, 2 failed.
   - Expected failures: `production-transition` was absent from the required manifest and integration spec.
2. `node --test tests/unit/release-evidence.test.js`
   - RED after adding the seeded-screen contract: 5 passed, 3 failed.
   - Expected failures: missing production transition manifest/spec evidence and missing seeded production/logistics selectors.
3. `node --test tests/unit/release-evidence.test.js`
   - Cleanup RED: 7 passed, 1 failed.
   - Expected failure: restoration was keyed to a post-update flag instead of successful capture of the original row.

## GREEN commands

1. `node --test tests/unit/release-evidence.test.js`
   - GREEN: 8 passed, 0 failed, 0 skipped.
2. `node --test tests/unit/release-evidence.test.js tests/unit/release-gate.test.js`
   - GREEN: 16 passed, 0 failed, 0 skipped.
3. `npm run check`
   - GREEN: 68 JavaScript files validated.
4. `npm run test:unit`
   - GREEN: 199 passed, 0 failed, 0 skipped.
5. `npx playwright test tests/e2e/authenticated-smoke.spec.js tests/e2e/release-integrations.spec.js --list`
   - GREEN: 36 tests discovered across desktop and mobile projects.
6. `git diff --check`
   - GREEN: no whitespace errors.
7. `npm test`
   - GREEN exit status: 68 JavaScript files validated, 199 unit tests passed, and 29 public E2E tests passed.
   - 37 credential-dependent or project-inapplicable E2E cases skipped. These skips are not release evidence; `playwright-release-evidence.mjs` rejects required skips.

## Changed files

- `scripts/playwright-release-evidence-core.mjs`
- `tests/unit/release-evidence.test.js`
- `tests/e2e/release-integrations.spec.js`
- `tests/e2e/authenticated-smoke.spec.js`
- `docs/SAAS_RELEASE_READINESS.md`
- `.superpowers/sdd/2026-07-28-flowops-next-production-logistics/task-4-report.md`

## Self-review

- `production-next` and `logistics-next` are mandatory in desktop and mobile authenticated evidence.
- `production-transition` is mandatory in desktop integration evidence; skipped, missing, or failed scenarios still block release.
- The seeded production row is organization-scoped, its `notes` metadata and `updated_at` are captured before mutation, the changed stage is observed in a second authenticated browser context, and cleanup restores the original row whenever capture succeeded, including assertion or transition failures.
- Logistics and event queries retain the active-organization filter and now assert every returned row belongs to that organization.
- Public tracking uses a Playwright API request with only the anonymous key and public token, without an authenticated session header.
- The existing realtime cleanup no longer swallows restoration errors.
- The authenticated production/logistics UI evidence targets the configured seeded order IDs instead of arbitrary first rows.
- No production code, database migration, or Edge Function changed.

## Concerns

- Live authenticated integration execution was not possible because all seven `FLOWOPS_E2E_*` release fixture variables are absent from this session. Playwright discovery and all local unit/gate checks passed, but the production Supabase transition, realtime delivery, logistics rows, marketplace synchronization, and public token response still require the credentialed release environment.

## Fix Round 1

### Status

The three code and test-quality findings from `task-4-review.md` are fixed. The credentialed local-candidate execution remains an external blocker and no runtime evidence was fabricated.

### RED commands

1. `node --test tests/unit/release-evidence.test.js`
   - RED: 8 passed, 2 failed.
   - Expected failures: a later duplicate pass overwrote an earlier failed or skipped execution for the same scenario and project.
2. `node --test tests/unit/release-evidence.test.js`
   - RED: 10 passed, 2 failed.
   - Expected failures: the reversible evidence cleanup API with behavioral failure injection and an independent timeout budget did not exist.
3. `node --test tests/unit/release-evidence.test.js`
   - RED: 11 passed, 1 failed.
   - Expected failure: production and realtime scenarios had no UUID marker, second-session baseline, affected-row result, or persisted restoration readback contract.
4. `node --test tests/unit/release-evidence.test.js`
   - RED: 11 passed, 1 failed.
   - Expected failure: restoration accepted any row retaining the run marker instead of only the exact planned mutation or exact original row.

### GREEN commands

1. `node --test tests/unit/release-evidence.test.js`
   - GREEN after each cycle; final focused file result: 12 passed, 0 failed, 0 skipped.
2. `node --test tests/unit/release-evidence.test.js tests/unit/release-gate.test.js`
   - GREEN: 20 passed, 0 failed, 0 skipped.
3. `npm run test:unit`
   - GREEN: 203 passed, 0 failed, 0 skipped.
4. `npm run check`
   - GREEN: 68 JavaScript files validated.
5. `npx playwright test tests/e2e/authenticated-smoke.spec.js tests/e2e/release-integrations.spec.js --list`
   - GREEN: 36 tests discovered across desktop and mobile projects.
6. `npm test`
   - GREEN exit status: 68 JavaScript files validated, 203 unit tests passed, and 29 public E2E tests passed.
   - 37 credential-dependent or project-inapplicable E2E cases skipped. Required skips remain release-blocking in `playwright-release-evidence.mjs`.

### Changes and self-review

- Duplicate scenario/project executions now retain the worst status with `failed > skipped > passed`, independent of report ordering.
- Reversible evidence cleanup runs from `finally`, receives a separate 30-second budget, restores after injected post-mutation assertion failure, and reports combined evidence/restoration failures.
- Mutation and restoration updates are organization-scoped, optimistic against the expected notes and timestamp, and require an affected row through `select("id,notes,updated_at").single()`.
- Cleanup accepts only the exact UUID-tagged mutation or exact original snapshot, then reads the row again and verifies exact notes, timestamp, stage, and internal notes.
- Both mutable realtime scenarios establish the second-session baseline before mutation and require the database-returned timestamp plus a per-run UUID marker before passing.
- Changed in this round: `scripts/playwright-release-evidence-core.mjs`, `tests/unit/release-evidence.test.js`, `tests/e2e/release-integrations.spec.js`, and this report.

### External blocker

- The seven required `FLOWOPS_E2E_*` variables remain absent. The complete local release gate must still run in the credentialed environment and produce machine-readable authenticated and integration reports with zero missing, skipped, or failed required scenarios before Task 4 can be release-approved.

## Fix Round 2

### Status

The remaining Important finding from `task-4-r1-review.md` is fixed. Cleanup ownership now requires both the unique mutation value and the exact database-returned mutation timestamp/version, preventing a concurrent update from being overwritten.

### RED command

1. `node --test tests/unit/release-evidence.test.js`
   - RED: 11 passed, 3 failed.
   - Expected failures: the ownership helper did not exist, a marker-bearing row with a changed timestamp was not behaviorally rejected, and the production/realtime restore callbacks discarded the mutation result.

### GREEN commands

1. `node --test tests/unit/release-evidence.test.js`
   - GREEN: 14 passed, 0 failed, 0 skipped.
2. `npm run test:unit`
   - GREEN: 205 passed, 0 failed, 0 skipped.
3. `npm run check`
   - GREEN: 68 JavaScript files validated.

### Changes and self-review

- Added a shared behavioral ownership check that accepts only the exact original snapshot or an exact match on both mutation notes and mutation `updated_at`.
- Added a regression proving marker-bearing notes with a concurrently changed timestamp report a restoration conflict and perform zero restore writes.
- Added positive coverage proving an exactly owned mutation and an already-restored exact original row still complete restoration.
- Production transition and two-session realtime cleanup now pass the database-returned mutation object into restoration; the existing organization-scoped optimistic update still verifies both expected notes and expected timestamp before writing.
- No production application code, database migration, or Edge Function changed.

### External blocker

- The seven required `FLOWOPS_E2E_*` variables remain absent. Credentialed local-candidate execution remains required with zero missing, skipped, or failed required scenarios; no live release evidence was fabricated in this round.
