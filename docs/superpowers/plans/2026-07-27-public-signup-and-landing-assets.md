# Public Signup and Landing Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the three FlowOps screenshots on the public landing page and allow anonymous visitors to list plans and create an account in free or paid-trial plans without a card.

**Architecture:** Version the standalone landing page under `landing/` and preserve its existing public URLs. Keep account creation in the existing `public-onboarding` Edge Function, but disable gateway JWT verification only for that function; server-side validation, rate limits, duplicate checks, and service-role isolation remain in the function.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, Supabase Edge Functions/Deno, Netlify, Playwright.

## Global Constraints

- Free plans activate immediately.
- Paid plans create a trial without requiring a card.
- Enterprise continues to route to sales instead of automatic registration.
- No service-role key or other privileged credential may be present in landing assets.
- Existing image URLs remain `assets/flowops-dashboard.png`, `assets/flowops-producao.png`, and `assets/flowops-encomendas.png`.
- Public access is limited to `public-onboarding`; functions marked private remain JWT-protected.

---

### Task 1: Version the deployed landing page and enforce its asset contract

**Files:**
- Create: `landing/index.html`
- Create: `landing/styles.css`
- Create: `landing/app.js`
- Create: `landing/config.js`
- Create: `landing/assets/flowops-dashboard.png`
- Create: `landing/assets/flowops-producao.png`
- Create: `landing/assets/flowops-encomendas.png`
- Create: `tests/unit/landing-assets.test.js`

**Interfaces:**
- Consumes: the currently deployed landing page at `lively-figolla-c41308.netlify.app`.
- Produces: a self-contained `landing/` deploy directory with stable image paths.

- [ ] **Step 1: Write the failing asset-contract test**

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const landingUrl = new URL("../../landing/", import.meta.url);
const html = existsSync(new URL("index.html", landingUrl))
  ? readFileSync(new URL("index.html", landingUrl), "utf8")
  : "";

for (const path of [
  "assets/flowops-dashboard.png",
  "assets/flowops-producao.png",
  "assets/flowops-encomendas.png",
]) {
  test(`landing publica ${path}`, () => {
    assert.match(html, new RegExp(path.replaceAll("/", "\\/")));
    const file = new URL(path, landingUrl);
    assert.equal(existsSync(file), true);
    assert.ok(statSync(file).size > 10_000);
    assert.deepEqual([...readFileSync(file).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/unit/landing-assets.test.js`

Expected: FAIL because `landing/index.html` and the PNG files do not exist.

- [ ] **Step 3: Recover the deployed source into `landing/`**

Download the current `index.html`, `styles.css`, `app.js`, and `config.js` without changing their behavior. Store them in `landing/` and keep all existing public link and asset paths relative to that directory.

- [ ] **Step 4: Capture sanitized real FlowOps screens**

Use the authenticated production application for the `#dashboard`, `#production`, and `#orders` views. Capture a desktop viewport, exclude browser chrome, and ensure customer names, e-mails, phone numbers, addresses, and order identifiers are not readable. Save valid PNG files using the three exact names in `landing/assets/`.

- [ ] **Step 5: Run the asset test and verify GREEN**

Run: `node --test tests/unit/landing-assets.test.js`

Expected: 3 tests pass.

- [ ] **Step 6: Commit the versioned landing source**

```bash
git add landing tests/unit/landing-assets.test.js
git commit -m "fix: version landing page screenshots"
```

### Task 2: Allow anonymous onboarding without exposing private functions

**Files:**
- Modify: `supabase/config.toml`
- Create: `tests/unit/public-onboarding-security.test.js`

**Interfaces:**
- Consumes: Supabase function configuration and existing validation in `supabase/functions/public-onboarding/index.ts`.
- Produces: anonymous gateway access for `public-onboarding` only.

- [ ] **Step 1: Write the failing gateway-security test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
const onboarding = config.match(/\[functions\.public-onboarding\][\s\S]*?(?=\n\[|$)/)?.[0] || "";
const privateFunction = config.match(/\[functions\.user-access\][\s\S]*?(?=\n\[|$)/)?.[0] || "";

test("public-onboarding aceita visitantes anonimos", () => {
  assert.match(onboarding, /verify_jwt\s*=\s*false/);
});

test("funcoes privadas continuam protegidas", () => {
  assert.match(privateFunction, /verify_jwt\s*=\s*true/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/unit/public-onboarding-security.test.js`

Expected: the anonymous onboarding test fails because the current value is `true`.

- [ ] **Step 3: Make the minimal gateway change**

Change only this block in `supabase/config.toml`:

```toml
[functions.public-onboarding]
verify_jwt = false
```

- [ ] **Step 4: Run the security test and verify GREEN**

Run: `node --test tests/unit/public-onboarding-security.test.js`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the gateway fix**

```bash
git add supabase/config.toml tests/unit/public-onboarding-security.test.js
git commit -m "fix: allow secure public onboarding"
```

### Task 3: Make plan loading recoverable on transient failures

**Files:**
- Modify: `landing/app.js`
- Create: `tests/unit/landing-plans.test.js`

**Interfaces:**
- Consumes: `FLOWOPS_CONFIG.ONBOARDING_URL` and the `{ ok, plans }` response contract.
- Produces: `loadPlans()` with an actionable retry control while preserving the existing signup dialog.

- [ ] **Step 1: Write the failing retry-contract test**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../landing/app.js", import.meta.url), "utf8");

test("falha ao carregar planos oferece nova tentativa", () => {
  assert.match(app, /data-retry-plans/);
  assert.match(app, /addEventListener\("click",\s*loadPlans\)/);
});

test("cadastro continua sem exigir cartao", () => {
  assert.doesNotMatch(app, /card_number|credit_card|payment_method_id/);
  assert.match(app, /action:\s*"register"/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/unit/landing-plans.test.js`

Expected: retry test fails because no retry button exists.

- [ ] **Step 3: Add the minimal retry state**

In the `catch` block of `loadPlans`, render:

```js
byId("plansGrid").innerHTML = `
  <div class="loading-state">
    <p>${escapeHtml(error.message)}</p>
    <button class="button secondary" type="button" data-retry-plans>Tentar novamente</button>
  </div>`;
document.querySelector("[data-retry-plans]")?.addEventListener("click", loadPlans);
```

- [ ] **Step 4: Run the landing tests and verify GREEN**

Run: `node --test tests/unit/landing-assets.test.js tests/unit/landing-plans.test.js`

Expected: all landing tests pass.

- [ ] **Step 5: Commit the retry behavior**

```bash
git add landing/app.js tests/unit/landing-plans.test.js
git commit -m "fix: make public plan loading recoverable"
```

### Task 4: Validate and publish Supabase plus Netlify

**Files:**
- Modify: none expected.

**Interfaces:**
- Consumes: committed `landing/` artifact and `supabase/functions/public-onboarding`.
- Produces: live assets and anonymous signup capability in production.

- [ ] **Step 1: Run complete local verification**

Run: `npm test`

Expected: JavaScript validation, all unit tests, and all available Playwright tests pass; authenticated tests may skip only when their documented credentials are absent.

- [ ] **Step 2: Deploy the Edge Function with JWT verification disabled**

Use the linked production project `djvrhvzjvnyensbobtby` and deploy `public-onboarding` with `--no-verify-jwt`. Do not print credentials.

- [ ] **Step 3: Verify anonymous plan listing**

Send an unauthenticated GET with the public anon `apikey` header to the production function.

Expected: HTTP 200 and JSON `{ "ok": true, "plans": [...] }` containing at least the free plan.

- [ ] **Step 4: Publish `landing/` to the existing Netlify site**

Deploy exactly the `landing/` directory to the site whose production URL is `https://lively-figolla-c41308.netlify.app/`. Preserve the existing custom/site URL and do not create a replacement site.

- [ ] **Step 5: Verify production assets and UI**

Check the three image URLs for HTTP 200, `Content-Type: image/png`, and nontrivial size. Open the live page, confirm plans render, click a non-Enterprise plan, and verify the signup dialog opens without creating a test account.

- [ ] **Step 6: Push the committed source**

```bash
git push origin master
```

Expected: remote `master` contains the landing source, tests, and public onboarding configuration.
