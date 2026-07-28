import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REQUIRED_RELEASE_SCENARIOS,
  validatePlaywrightReleaseReport,
} from "../../scripts/playwright-release-evidence-core.mjs";

function result({ id, project = "desktop", status = "passed", expectedStatus = "passed" }) {
  return {
    title: `@release:${id} validates ${id}`,
    projectName: project,
    results: [{ status, expectedStatus }],
  };
}

function report(specs) {
  return { suites: [{ title: "release", specs }] };
}

test("accepts only when every required release scenario passed in each required project", () => {
  const specs = REQUIRED_RELEASE_SCENARIOS.flatMap(({ id, projects }) =>
    projects.map((project) => result({ id, project })),
  );

  const evidence = validatePlaywrightReleaseReport(report(specs));

  assert.equal(evidence.ok, true);
  assert.deepEqual(evidence.missing, []);
  assert.deepEqual(evidence.skipped, []);
  assert.deepEqual(evidence.failed, []);
});

test("rejects a required scenario reported as skipped even when Playwright exits successfully", () => {
  const specs = REQUIRED_RELEASE_SCENARIOS.flatMap(({ id, projects }) =>
    projects.map((project) => result({
      id,
      project,
      status: id === "orders" && project === "mobile" ? "skipped" : "passed",
      expectedStatus: id === "orders" && project === "mobile" ? "skipped" : "passed",
    })),
  );

  const evidence = validatePlaywrightReleaseReport(report(specs));

  assert.equal(evidence.ok, false);
  assert.deepEqual(evidence.skipped, ["orders:mobile"]);
});

test("rejects missing and failed required scenarios", () => {
  const evidence = validatePlaywrightReleaseReport(report([
    result({ id: "authenticated-shell", status: "failed", expectedStatus: "passed" }),
  ]));

  assert.equal(evidence.ok, false);
  assert.ok(evidence.failed.includes("authenticated-shell:desktop"));
  assert.ok(evidence.missing.includes("marketplace-sync:desktop"));
});

test("requires production transition and redesigned production and logistics evidence", () => {
  const required = Object.fromEntries(REQUIRED_RELEASE_SCENARIOS.map((scenario) => [scenario.id, {
    scope: scenario.scope,
    projects: scenario.projects,
  }]));

  assert.deepEqual(required["production-transition"], { scope: "integrations", projects: ["desktop"] });
  assert.deepEqual(required["logistics-automation"], { scope: "integrations", projects: ["desktop"] });
  assert.deepEqual(required["public-tracking"], { scope: "integrations", projects: ["desktop"] });
  assert.deepEqual(required["realtime-two-session"], { scope: "integrations", projects: ["desktop"] });
  assert.deepEqual(required["production-next"], { scope: "authenticated", projects: ["desktop", "mobile"] });
  assert.deepEqual(required["logistics-next"], { scope: "authenticated", projects: ["desktop", "mobile"] });
});

test("release integration spec covers production transition, marketplace, logistics, tracking and two-session realtime evidence", async () => {
  const source = await readFile(new URL("../e2e/release-integrations.spec.js", import.meta.url), "utf8");

  for (const id of ["production-transition", "marketplace-sync", "logistics-automation", "public-tracking", "realtime-two-session"]) {
    assert.match(source, new RegExp(`@release:${id}\\b`));
  }
  assert.match(source, /productionOrderId:\s*process\.env\.FLOWOPS_E2E_REALTIME_ORDER_ID/);
  assert.match(source, /notes:\s*JSON\.stringify\(\{\s*\.\.\.originalMetadata,\s*productionStage:\s*nextStage\s*\}\)/);
  assert.match(source, /contextB/);
  assert.match(source, /originalCaptured\s*=\s*true/);
  assert.match(source, /finally\s*\{[\s\S]*if\s*\(originalCaptured\)[\s\S]*notes:\s*originalNotes[\s\S]*contextB\.close\(\)/);
  assert.match(source, /marketplace-sync[^\n]*action=sync/);
  assert.match(source, /order_logistics/);
  assert.match(source, /logistics_events/);
  assert.match(source, /public-tracking/);
  assert.match(source, /browser\.newContext/);
  assert.match(source, /updated_at/);
});

test("redesigned production and logistics evidence targets the seeded orders", async () => {
  const source = await readFile(new URL("../e2e/authenticated-smoke.spec.js", import.meta.url), "utf8");

  assert.match(source, /productionOrderId\s*=\s*process\.env\.FLOWOPS_E2E_REALTIME_ORDER_ID/);
  assert.match(source, /logisticsOrderId\s*=\s*process\.env\.FLOWOPS_E2E_LOGISTICS_ORDER_ID/);
  assert.match(source, /\.production-next-card\[data-id="\$\{productionOrderId\}"\]/);
  assert.match(source, /\[data-action="open-logistics"\]\[data-id="\$\{logisticsOrderId\}"\]/);
});

test("Library release scenario asserts direct 390px horizontal overflow", async () => {
  const source = await readFile(new URL("../e2e/authenticated-smoke.spec.js", import.meta.url), "utf8");

  assert.match(source, /@release:library/);
  assert.match(source, /setViewportSize\(\{\s*width:\s*390,\s*height:\s*844\s*\}\)/);
  assert.match(source, /library[^\n]*rolagem horizontal/i);
});

test("scheduled authenticated quality uses the same machine-readable release evidence", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/authenticated-quality.yml", import.meta.url), "utf8");

  for (const name of [
    "FLOWOPS_E2E_MARKETPLACE_ITEM_ID",
    "FLOWOPS_E2E_MARKETPLACE_ORDER_ID",
    "FLOWOPS_E2E_LOGISTICS_ORDER_ID",
    "FLOWOPS_E2E_TRACKING_TOKEN",
    "FLOWOPS_E2E_REALTIME_ORDER_ID",
  ]) {
    assert.match(workflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(workflow, /node scripts\/playwright-release-evidence\.mjs --scope=authenticated/);
  assert.match(workflow, /node scripts\/playwright-release-evidence\.mjs --scope=integrations/);
});
