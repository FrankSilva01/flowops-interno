import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const requiredCredentials = [
  "FLOWOPS_E2E_EMAIL",
  "FLOWOPS_E2E_PASSWORD",
  "FLOWOPS_E2E_TENANT_NAME",
  "FLOWOPS_E2E_FORBIDDEN_TEXT",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FLOWOPS_SUPABASE_ANON_KEY",
  "FLOWOPS_RLS_USER_1_EMAIL",
  "FLOWOPS_RLS_USER_1_PASSWORD",
  "FLOWOPS_RLS_USER_2_EMAIL",
  "FLOWOPS_RLS_USER_2_PASSWORD",
];

const evidenceSteps = [
  { name: "Release readiness", args: ["scripts/release-readiness.mjs"] },
  {
    name: "Authenticated desktop and mobile E2E",
    args: [playwrightCli, "test", "tests/e2e/authenticated-smoke.spec.js", "--project=desktop", "--project=mobile"],
  },
  { name: "Private production health", args: ["scripts/operational-health.mjs"] },
  { name: "RLS tenant isolation audit", args: ["scripts/rls-isolation-audit.mjs"] },
];

const missingCredentials = requiredCredentials.filter((name) => !process.env[name]?.trim());
if (missingCredentials.length) {
  console.error(`Release blocked: missing required credentials: ${missingCredentials.join(", ")}.`);
  process.exit(1);
}

let hasFailedEvidence = false;
for (const step of evidenceSteps) {
  console.log(`Running release evidence: ${step.name}.`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) hasFailedEvidence = true;
}

if (hasFailedEvidence) {
  console.error("Release blocked: required evidence failed.");
  process.exit(1);
}

console.log("Release evidence passed.");
