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
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("release gate rejects missing authenticated and private-health credentials", () => {
  const result = runReleaseGate({ FLOWOPS_E2E_EMAIL: "qa@example.test" });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /FLOWOPS_E2E_PASSWORD/);
  assert.match(`${result.stdout}${result.stderr}`, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("release gate allows publication only when all required credentials are present", () => {
  const result = runReleaseGate({
    FLOWOPS_E2E_EMAIL: "qa@example.test",
    FLOWOPS_E2E_PASSWORD: "not-a-real-password",
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-service-key",
  });

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("Netlify publication invokes the fail-closed release gate", async () => {
  const netlifyConfig = await readFile(new URL("../../netlify.toml", import.meta.url), "utf8");

  assert.match(netlifyConfig, /^\[build\][\s\S]*^\s*command\s*=\s*"npm run release:gate"\s*$/m);
});
