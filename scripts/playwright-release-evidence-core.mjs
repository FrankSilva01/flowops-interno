const RELEASE_ID_PATTERN = /@release:([a-z0-9-]+)/i;
const STATUS_SEVERITY = { passed: 0, skipped: 1, failed: 2 };

export const REQUIRED_RELEASE_SCENARIOS = [
  { id: "authenticated-shell", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "marketplace-product-drawer", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "order-create-drawer", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "orders", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "library", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "production-next", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "logistics-next", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "marketplace-shopee-export", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "marketplace-performance", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "order-bulk-delete", scope: "authenticated", projects: ["desktop"] },
  { id: "order-delete-cancel", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "marketplace-report", scope: "authenticated", projects: ["desktop", "mobile"] },
  { id: "production-transition", scope: "integrations", projects: ["desktop"] },
  { id: "marketplace-sync", scope: "integrations", projects: ["desktop"] },
  { id: "logistics-automation", scope: "integrations", projects: ["desktop"] },
  { id: "public-tracking", scope: "integrations", projects: ["desktop"] },
  { id: "realtime-two-session", scope: "integrations", projects: ["desktop"] },
];

function collectSpecs(suites = [], collected = []) {
  for (const suite of suites || []) {
    collected.push(...(suite.specs || []));
    collectSpecs(suite.suites || [], collected);
  }
  return collected;
}

function executionsForSpec(spec) {
  if (Array.isArray(spec.tests) && spec.tests.length) {
    return spec.tests.map((test) => ({
      project: test.projectName || spec.projectName || "",
      expectedStatus: test.expectedStatus || spec.expectedStatus || "passed",
      results: test.results || spec.results || [],
    }));
  }
  return [{
    project: spec.projectName || "",
    expectedStatus: spec.expectedStatus || "passed",
    results: spec.results || [],
  }];
}

function executionStatus(execution) {
  const statuses = execution.results.map((result) => result.status).filter(Boolean);
  if (execution.expectedStatus === "skipped" || statuses.includes("skipped")) return "skipped";
  if (statuses.length && statuses.every((status) => status === "passed")) return "passed";
  return "failed";
}

async function withTimeout(operation, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Cleanup timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function restoreOwnedMutation({ current, mutation, snapshot, restore }) {
  const alreadyOriginal = current.notes === snapshot.notes
    && current.updatedAt === snapshot.updatedAt;
  const isOwnMutation = Boolean(mutation)
    && current.notes === mutation.notes
    && current.updatedAt === mutation.updatedAt;

  if (!alreadyOriginal && !isOwnMutation) {
    throw new Error("Release evidence restoration conflict: current row is neither the original snapshot nor the owned mutation.");
  }

  return restore(current, snapshot);
}

export async function runReversibleEvidence({
  capture,
  verifyBaseline = async () => {},
  mutate,
  verifyMutation,
  restore,
  verifyRestoration,
  onCleanupStart = () => {},
  cleanupTimeoutMs = 30_000,
}) {
  let snapshot;
  let mutation;
  let mutationStarted = false;
  let primaryError;

  try {
    snapshot = await capture();
    await verifyBaseline(snapshot);
    mutationStarted = true;
    mutation = await mutate(snapshot);
    await verifyMutation(snapshot, mutation);
  } catch (error) {
    primaryError = error;
  } finally {
    if (mutationStarted) {
      try {
        onCleanupStart(cleanupTimeoutMs);
        await withTimeout(Promise.resolve().then(async () => {
          const restored = await restore(snapshot, mutation);
          await verifyRestoration(snapshot, restored, mutation);
        }), cleanupTimeoutMs);
      } catch (cleanupError) {
        if (primaryError) {
          throw new AggregateError(
            [primaryError, cleanupError],
            `Release evidence failed and restoration failed: ${cleanupError.message}`,
          );
        }
        throw new Error(`Release evidence restoration failed: ${cleanupError.message}`, { cause: cleanupError });
      }
    }
  }

  if (primaryError) throw primaryError;
  return mutation;
}

export function validatePlaywrightReleaseReport(report, { scope } = {}) {
  const required = REQUIRED_RELEASE_SCENARIOS.filter((scenario) => !scope || scenario.scope === scope);
  const observed = new Map();

  for (const spec of collectSpecs(report?.suites)) {
    const id = String(spec.title || "").match(RELEASE_ID_PATTERN)?.[1];
    if (!id) continue;
    for (const execution of executionsForSpec(spec)) {
      if (!execution.project) continue;
      const key = `${id}:${execution.project}`;
      const status = executionStatus(execution);
      const previous = observed.get(key);
      if (!previous || STATUS_SEVERITY[status] > STATUS_SEVERITY[previous]) observed.set(key, status);
    }
  }

  const missing = [];
  const skipped = [];
  const failed = [];
  for (const scenario of required) {
    for (const project of scenario.projects) {
      const key = `${scenario.id}:${project}`;
      const status = observed.get(key);
      if (!status) missing.push(key);
      else if (status === "skipped") skipped.push(key);
      else if (status !== "passed") failed.push(key);
    }
  }

  return {
    ok: missing.length === 0 && skipped.length === 0 && failed.length === 0,
    missing,
    skipped,
    failed,
  };
}
