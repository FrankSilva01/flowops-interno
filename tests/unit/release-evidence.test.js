import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as releaseEvidenceCore from "../../scripts/playwright-release-evidence-core.mjs";
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

function completeSpecs() {
  return REQUIRED_RELEASE_SCENARIOS.flatMap(({ id, projects }) =>
    projects.map((project) => result({ id, project })),
  );
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

test("a later duplicate pass cannot overwrite an earlier failure", () => {
  const evidence = validatePlaywrightReleaseReport(report([
    result({ id: "production-transition", status: "failed" }),
    ...completeSpecs(),
  ]));

  assert.equal(evidence.ok, false);
  assert.deepEqual(evidence.failed, ["production-transition:desktop"]);
});

test("a later duplicate pass cannot overwrite an earlier skip", () => {
  const evidence = validatePlaywrightReleaseReport(report([
    result({ id: "logistics-automation", status: "skipped", expectedStatus: "skipped" }),
    ...completeSpecs(),
  ]));

  assert.equal(evidence.ok, false);
  assert.deepEqual(evidence.skipped, ["logistics-automation:desktop"]);
});

test("reversible evidence restores and verifies after a post-mutation assertion failure", async () => {
  const runReversibleEvidence = releaseEvidenceCore.runReversibleEvidence;
  assert.equal(typeof runReversibleEvidence, "function");
  const calls = [];
  const assertionFailure = new Error("second session did not receive the mutation");

  await assert.rejects(runReversibleEvidence({
    cleanupTimeoutMs: 100,
    capture: async () => {
      calls.push("capture");
      return { stage: "Em fila" };
    },
    verifyBaseline: async () => calls.push("baseline"),
    mutate: async () => {
      calls.push("mutate");
      return { stage: "Imprimindo" };
    },
    verifyMutation: async () => {
      calls.push("verify-mutation");
      throw assertionFailure;
    },
    onCleanupStart: () => calls.push("cleanup-budget"),
    restore: async (snapshot) => {
      calls.push("restore");
      return { stage: snapshot.stage };
    },
    verifyRestoration: async (snapshot, restored) => {
      calls.push("verify-restoration");
      assert.equal(restored.stage, snapshot.stage);
    },
  }), (error) => error === assertionFailure);

  assert.deepEqual(calls, [
    "capture",
    "baseline",
    "mutate",
    "verify-mutation",
    "cleanup-budget",
    "restore",
    "verify-restoration",
  ]);
});

test("reversible evidence gives cleanup an independent timeout and reports restoration failure", async () => {
  const runReversibleEvidence = releaseEvidenceCore.runReversibleEvidence;
  assert.equal(typeof runReversibleEvidence, "function");
  const assertionFailure = new Error("mutation assertion failed");

  await assert.rejects(runReversibleEvidence({
    cleanupTimeoutMs: 10,
    capture: async () => ({ stage: "Em fila" }),
    mutate: async () => ({ stage: "Imprimindo" }),
    verifyMutation: async () => { throw assertionFailure; },
    restore: async () => new Promise(() => {}),
    verifyRestoration: async () => {},
  }), (error) => {
    assert.equal(error instanceof AggregateError, true);
    assert.match(error.message, /restoration failed/i);
    assert.equal(error.errors[0], assertionFailure);
    assert.match(error.errors[1].message, /timed out after 10ms/i);
    return true;
  });
});

test("cleanup refuses marker-bearing notes when the mutation timestamp changed concurrently", async () => {
  const restoreOwnedMutation = releaseEvidenceCore.restoreOwnedMutation;
  assert.equal(typeof restoreOwnedMutation, "function");
  const mutation = { notes: "marker-bearing-notes", updatedAt: "mutation-version" };
  let writes = 0;

  await assert.rejects(restoreOwnedMutation({
    current: { ...mutation, updatedAt: "concurrent-version" },
    mutation,
    snapshot: { notes: "original-notes", updatedAt: "original-version" },
    restore: async () => { writes += 1; },
  }), /restoration conflict/i);

  assert.equal(writes, 0);
});

test("cleanup restores an exactly owned mutation and accepts the exact original row", async () => {
  const restoreOwnedMutation = releaseEvidenceCore.restoreOwnedMutation;
  assert.equal(typeof restoreOwnedMutation, "function");
  const snapshot = { notes: "original-notes", updatedAt: "original-version" };
  const mutation = { notes: "marker-bearing-notes", updatedAt: "mutation-version" };
  const restored = [];
  const restore = async (current) => {
    restored.push(current);
    return snapshot;
  };

  assert.equal(await restoreOwnedMutation({ current: mutation, mutation, snapshot, restore }), snapshot);
  assert.equal(await restoreOwnedMutation({ current: snapshot, mutation, snapshot, restore }), snapshot);
  assert.deepEqual(restored, [mutation, snapshot]);
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
  assert.match(source, /randomUUID\(\)/);
  assert.match(source, /runReversibleEvidence/);
  assert.match(source, /\.select\("id,notes,updated_at"\)[\s\S]*\.single\(\)/);
  assert.match(source, /verifyPersistedRestoration/);
  const restoreHelper = source.slice(
    source.indexOf("async function restorePersistedOrder"),
    source.indexOf("async function verifyPersistedRestoration"),
  );
  assert.match(restoreHelper, /restoreOwnedMutation/);
  assert.match(restoreHelper, /updatePersistedOrder/);
  assert.match(source, /marketplace-sync[^\n]*action=sync/);
  assert.match(source, /order_logistics/);
  assert.match(source, /logistics_events/);
  assert.match(source, /public-tracking/);
  assert.match(source, /browser\.newContext/);
  assert.match(source, /updated_at/);

  const productionSection = source.slice(
    source.indexOf("@release:production-transition"),
    source.indexOf("@release:marketplace-sync"),
  );
  assert.match(productionSection, /verifyBaseline:\s*async/);
  assert.match(productionSection, /internalNotes:[^\n]*runMarker/);
  assert.match(productionSection, /item\.productionStage === mutation\.stage/);
  assert.match(productionSection, /item\.updatedAt === mutation\.updatedAt/);
  assert.match(productionSection, /item\.internalNotes\.includes\(runMarker\)/);
  assert.match(productionSection, /testInfo\.setTimeout\(testInfo\.timeout \+ cleanupTimeoutMs\)/);
  assert.match(productionSection, /restore:\s*async \(snapshot, mutation\)/);

  const realtimeSection = source.slice(source.indexOf("@release:realtime-two-session"));
  assert.match(realtimeSection, /verifyBaseline:\s*async/);
  assert.match(realtimeSection, /internalNotes:[^\n]*runMarker/);
  assert.match(realtimeSection, /item\.updatedAt === mutation\.updatedAt/);
  assert.match(realtimeSection, /item\.internalNotes\.includes\(runMarker\)/);
  assert.match(realtimeSection, /verifyPersistedRestoration/);
  assert.match(realtimeSection, /restore:\s*async \(snapshot, mutation\)/);
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
