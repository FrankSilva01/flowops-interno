import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseEvidenceSteps, runReleaseGate } from "./release-gate-core.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const evidenceSteps = createReleaseEvidenceSteps({ nodeCommand: process.execPath, npmCommand, playwrightCli });

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const passed = runReleaseGate({
    environment: process.env,
    evidenceSteps,
    execute: (step) => {
      const evidenceEnvironment = { ...process.env };
      delete evidenceEnvironment.FLOWOPS_REMOTE_E2E_URL;
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
