export const requiredReleaseVariables = [
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
  "FLOWOPS_STAGING_URL",
  "FLOWOPS_STAGING_ANON_KEY",
  "FLOWOPS_STAGING_ADMIN_EMAIL",
  "FLOWOPS_STAGING_ADMIN_PASSWORD",
  "FLOWOPS_E2E_MARKETPLACE_ITEM_ID",
  "FLOWOPS_E2E_MARKETPLACE_ORDER_ID",
  "FLOWOPS_E2E_LOGISTICS_ORDER_ID",
  "FLOWOPS_E2E_TRACKING_TOKEN",
  "FLOWOPS_E2E_REALTIME_ORDER_ID",
];

export function createReleaseEvidenceSteps({ nodeCommand, npmCommand }) {
  return [
    { name: "Release readiness", command: nodeCommand, args: ["scripts/release-readiness.mjs"] },
    { name: "Full candidate regression suite", command: npmCommand, args: ["test"] },
    {
      name: "Authenticated desktop and mobile E2E",
      command: nodeCommand,
      args: ["scripts/playwright-release-evidence.mjs", "--scope=authenticated"],
    },
    {
      name: "Marketplace, logistics, tracking and realtime",
      command: nodeCommand,
      args: ["scripts/playwright-release-evidence.mjs", "--scope=integrations"],
    },
    { name: "Private production health", command: nodeCommand, args: ["scripts/operational-health.mjs"] },
    { name: "RLS tenant isolation audit", command: nodeCommand, args: ["scripts/rls-isolation-audit.mjs"] },
    { name: "Staging restore drill", command: nodeCommand, args: ["scripts/staging-restore-drill.mjs"] },
  ];
}

export function runReleaseGate({ environment, evidenceSteps, execute, write = console.error }) {
  const missingVariables = requiredReleaseVariables.filter((name) => !environment[name]?.trim());
  if (missingVariables.length) {
    write(`Release blocked: missing required credentials: ${missingVariables.join(", ")}.`);
    return false;
  }

  if (environment.FLOWOPS_REMOTE_E2E_URL?.trim()) {
    write("Release blocked: FLOWOPS_REMOTE_E2E_URL is not allowed for release evidence; Playwright must test the local candidate.");
    return false;
  }

  let hasFailedEvidence = false;
  for (const step of evidenceSteps) {
    write(`Running release evidence: ${step.name}.`);
    try {
      if (!execute(step)) hasFailedEvidence = true;
    } catch {
      hasFailedEvidence = true;
    }
  }

  if (hasFailedEvidence) {
    write("Release blocked: required evidence failed.");
    return false;
  }

  write("Release evidence passed.");
  return true;
}
