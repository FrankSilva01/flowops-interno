# Task 2 Report: FlowOps Next Shell

## Scope

Implemented Task 2 in the isolated `flowops-next-phase1` worktree.

## Changes

- Added FlowOps Next shell hooks to the existing application shell, sidebar, navigation, workspace, and topbar.
- Preserved all existing element IDs, `data-view` values, topbar controls, and router code.
- Added `css/20-flowops-next-shell.css` as the final shared shell layer with the required `--next-*` tokens.
- Appended the new CSS source verbatim to `css/flowops.css` under the `20-flowops-next-shell.css` source header.
- Added source-level contracts for stable navigation attributes, FlowOps Next hooks, and shared tokens.
- Extended public browser coverage for a compact-to-expanded desktop sidebar at `1440x900` and bottom navigation at `390x844` without page-level horizontal overflow.

## TDD Evidence

The initial focused unit run was executed before the implementation:

```text
node --test tests/unit/ui-contracts.test.js
```

It failed as expected because `flowops-next-shell` was not present in `index.html`.

After implementing the markup hooks and final CSS layer, the same unit contract passed. The browser assertions use an in-test local HTTP origin backed by the worktree files so that the real ES-module router binds without relying on a deployed site or an unrelated local server.

## Verification

- `npm run check`: passed, 61 JavaScript files validated.
- `node --test tests/unit/ui-contracts.test.js`: passed, 2/2.
- `npx playwright test tests/e2e/public-smoke.spec.js`: passed, 23/23 with 1 expected desktop-only skip.
- `git diff --check`: passed with no whitespace errors.
- Consolidated CSS verification: the final source after `/* ===== SOURCE: 20-flowops-next-shell.css ===== */` matches `css/20-flowops-next-shell.css` verbatim.

## Self-review

- `index.html` changes are class additions only in the requested shell range.
- No IDs or `data-view` attributes changed.
- `js/core/router.js`, marketplace files, logistics files, backend files, and contracts were not modified.
- The desktop toggle continues to use the existing `#sidebarToggle` handler and `sidebar-collapsed` state.

## Concerns

None.
