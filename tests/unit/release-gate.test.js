import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import playwrightConfig from "../../playwright.config.js";
import { createStaticServer } from "../../server.js";
import { createReleaseEvidenceSteps, requiredReleaseVariables, runReleaseGate } from "../../scripts/release-gate-core.mjs";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

function runReleaseGateProcess(environment) {
  return spawnSync(process.execPath, ["scripts/release-gate.mjs"], {
    cwd: workspaceRoot,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8",
  });
}

function completeReleaseEnvironment(overrides = {}) {
  return Object.fromEntries(requiredReleaseVariables.map((name) => [name, `test-${name.toLowerCase()}`]).concat(Object.entries(overrides)));
}

function runReleaseGateInMemory(environment, evidenceSteps) {
  const output = [];
  const executed = [];
  const passed = runReleaseGate({
    environment,
    evidenceSteps,
    execute: (step) => {
      executed.push(step.name);
      return false;
    },
    write: (message) => output.push(message),
  });
  return { executed, output: output.join("\n"), passed };
}

test("local Playwright tests start the current worktree server", () => {
  assert.equal(playwrightConfig.use.baseURL, "http://127.0.0.1:4317");
  assert.equal(playwrightConfig.webServer?.command, "node server.js");
  assert.equal(playwrightConfig.webServer?.reuseExistingServer, false);
});

test("local server serves the worktree root, legal page and JavaScript module", async () => {
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    for (const path of ["/", "/termos.html", "/js/core/dom.js"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("access-control-allow-origin"), null, path);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("local server denies dotfiles and encoded traversal without wildcard CORS", async () => {
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    for (const path of ["/.env", "/.git/config", "/%2eenv", "/..%2f.env", "/%5c.git", "/%5c.env", "/%5c..%5cpackage.json"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get("access-control-allow-origin"), null, path);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("release gate rejects every missing authenticated, isolation, and staging variable", () => {
  const result = runReleaseGateProcess({
    FLOWOPS_E2E_EMAIL: "qa@example.test",
    FLOWOPS_E2E_PASSWORD: "test-password",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_TENANT_NAME/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_FORBIDDEN_TEXT/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_SUPABASE_ANON_KEY/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_RLS_USER_1_EMAIL/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_RLS_USER_2_PASSWORD/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_STAGING_URL/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_STAGING_ANON_KEY/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_STAGING_ADMIN_EMAIL/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_STAGING_ADMIN_PASSWORD/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_MARKETPLACE_ITEM_ID/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_MARKETPLACE_ORDER_ID/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_LOGISTICS_ORDER_ID/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_TRACKING_TOKEN/);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_REALTIME_ORDER_ID/);
});

test("release gate rejects remote E2E targeting before it can be used as release evidence", () => {
  const result = runReleaseGateProcess(completeReleaseEnvironment({ FLOWOPS_REMOTE_E2E_URL: "https://old-deployment.example.test" }));

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_REMOTE_E2E_URL/);
});

test("release gate executes the full local candidate, authenticated, private, RLS, and staging evidence and fails on evidence failure", () => {
  const evidenceSteps = createReleaseEvidenceSteps({
    nodeCommand: "node",
    npmCommand: "npm",
    playwrightCli: "playwright",
  });
  const gate = runReleaseGateInMemory(completeReleaseEnvironment(), evidenceSteps);

  assert.equal(gate.passed, false);
  assert.deepEqual(gate.executed, evidenceSteps.map((step) => step.name));
  assert.equal(evidenceSteps[1].command, "npm");
  assert.deepEqual(evidenceSteps[1].args, ["test"]);
  assert.match(gate.output, /Full candidate regression suite/);
  assert.match(gate.output, /Authenticated desktop and mobile E2E/);
  assert.match(gate.output, /Marketplace, logistics, tracking and realtime/);
  assert.match(gate.output, /Private production health/);
  assert.match(gate.output, /RLS tenant isolation audit/);
  assert.match(gate.output, /Staging restore drill/);
  assert.match(gate.output, /required evidence failed/);
});

test("Netlify publication invokes the fail-closed release gate", async () => {
  const netlifyConfig = await readFile(new URL("../../netlify.toml", import.meta.url), "utf8");

  assert.match(netlifyConfig, /^\[build\][\s\S]*^\s*command\s*=\s*"npm run release:gate"\s*$/m);
});

test("release evidence is written outside the Netlify publish root", async () => {
  const health = await readFile(new URL("../../scripts/operational-health.mjs", import.meta.url), "utf8");
  const gate = await readFile(new URL("../../scripts/release-gate.mjs", import.meta.url), "utf8");
  const playwright = await readFile(new URL("../../playwright.config.js", import.meta.url), "utf8");

  assert.doesNotMatch(health, /["']output\/operational-health\.json["']/);
  assert.match(health, /tmpdir\(\)/);
  assert.match(gate, /FLOWOPS_RELEASE_EVIDENCE_DIR/);
  assert.match(gate, /delete evidenceEnvironment\.FLOWOPS_CAPTURE_VISUALS/);
  assert.match(playwright, /FLOWOPS_PLAYWRIGHT_OUTPUT_DIR/);
});
