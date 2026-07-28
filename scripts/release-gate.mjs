import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseEvidenceSteps, runReleaseGate } from "./release-gate-core.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const evidenceSteps = createReleaseEvidenceSteps({ nodeCommand: process.execPath, npmCommand });
const evidenceDirectory = join(tmpdir(), `flowops-release-evidence-${process.pid}`);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const passed = runReleaseGate({
    environment: process.env,
    evidenceSteps,
    execute: (step) => {
      const evidenceEnvironment = { ...process.env };
      delete evidenceEnvironment.FLOWOPS_REMOTE_E2E_URL;
      delete evidenceEnvironment.FLOWOPS_CAPTURE_VISUALS;
      evidenceEnvironment.FLOWOPS_RELEASE_EVIDENCE_DIR = evidenceDirectory;
      evidenceEnvironment.FLOWOPS_PLAYWRIGHT_OUTPUT_DIR = join(evidenceDirectory, "playwright-results");
      evidenceEnvironment.FLOWOPS_HEALTH_REPORT = join(evidenceDirectory, "operational-health.json");
      const result = spawnSync(step.command, step.args, {
        cwd: workspaceRoot,
        env: evidenceEnvironment,
        stdio: "inherit",
      });
      return !result.error && result.status === 0;
    },
    write: (message) => console.log(message),
  });
  process.exitCode = passed ? 0 : 1;
}
