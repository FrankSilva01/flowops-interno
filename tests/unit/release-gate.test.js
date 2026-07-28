import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import playwrightConfig from "../../playwright.config.js";
import { createStaticServer } from "../../server.js";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

function runReleaseGate(environment) {
  return spawnSync(process.execPath, ["scripts/release-gate.mjs"], {
    cwd: workspaceRoot,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8",
  });
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
    for (const path of ["/.env", "/.git/config", "/%2eenv", "/..%2f.env"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get("access-control-allow-origin"), null, path);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("release gate rejects missing authenticated tenant and isolation evidence variables", () => {
  const result = runReleaseGate({
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
});

test("release gate fails when supplied credentials cannot produce authenticated, health, and RLS evidence", () => {
  const result = runReleaseGate({
    FLOWOPS_E2E_EMAIL: "qa@example.test",
    FLOWOPS_E2E_PASSWORD: "test-password",
    FLOWOPS_E2E_TENANT_NAME: "Test tenant",
    FLOWOPS_E2E_FORBIDDEN_TEXT: "Other tenant",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    FLOWOPS_SUPABASE_ANON_KEY: "test-anon-key",
    FLOWOPS_RLS_USER_1_EMAIL: "tenant-a@example.test",
    FLOWOPS_RLS_USER_1_PASSWORD: "test-password-a",
    FLOWOPS_RLS_USER_2_EMAIL: "tenant-b@example.test",
    FLOWOPS_RLS_USER_2_PASSWORD: "test-password-b",
    FLOWOPS_APP_URL: "http://127.0.0.1:1",
    FLOWOPS_REMOTE_E2E_URL: "http://127.0.0.1:1",
    FLOWOPS_SUPABASE_URL: "http://127.0.0.1:1",
  });

  assert.notEqual(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(`${result.stdout}${result.stderr}`, /Authenticated desktop and mobile E2E/);
  assert.match(`${result.stdout}${result.stderr}`, /Private production health/);
  assert.match(`${result.stdout}${result.stderr}`, /RLS tenant isolation audit/);
});

test("Netlify publication invokes the fail-closed release gate", async () => {
  const netlifyConfig = await readFile(new URL("../../netlify.toml", import.meta.url), "utf8");

  assert.match(netlifyConfig, /^\[build\][\s\S]*^\s*command\s*=\s*"npm run release:gate"\s*$/m);
});
