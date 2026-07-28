import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlaywrightReleaseReport } from "./playwright-release-evidence-core.mjs";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const scope = process.argv.includes("--scope=integrations") ? "integrations" : "authenticated";
const spec = scope === "integrations"
  ? "tests/e2e/release-integrations.spec.js"
  : "tests/e2e/authenticated-smoke.spec.js";
const projects = scope === "integrations" ? ["desktop"] : ["desktop", "mobile"];
const evidenceDir = resolve(process.env.FLOWOPS_RELEASE_EVIDENCE_DIR || join(tmpdir(), "flowops-release-evidence"));
mkdirSync(evidenceDir, { recursive: true });

const result = spawnSync(process.execPath, [
  playwrightCli,
  "test",
  spec,
  ...projects.map((project) => `--project=${project}`),
  "--reporter=json",
], {
  cwd: workspaceRoot,
  env: {
    ...process.env,
    FLOWOPS_PLAYWRIGHT_OUTPUT_DIR: join(evidenceDir, `playwright-${scope}`),
  },
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});

if (result.stderr) process.stderr.write(result.stderr);
const reportPath = join(evidenceDir, `playwright-${scope}.json`);
writeFileSync(reportPath, result.stdout || "{}", "utf8");

let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch (error) {
  console.error(`Release blocked: Playwright did not produce valid JSON for ${scope}: ${error.message}`);
  process.exitCode = 1;
  process.exit();
}

const evidence = validatePlaywrightReleaseReport(report, { scope });
if (result.error || result.status !== 0 || !evidence.ok) {
  console.error(`Release blocked: invalid ${scope} Playwright evidence.`);
  if (evidence.missing.length) console.error(`Missing: ${evidence.missing.join(", ")}`);
  if (evidence.skipped.length) console.error(`Skipped: ${evidence.skipped.join(", ")}`);
  if (evidence.failed.length) console.error(`Failed: ${evidence.failed.join(", ")}`);
  console.error(`Machine-readable report: ${reportPath}`);
  process.exitCode = 1;
} else {
  console.log(`Release evidence passed for ${scope}. Report: ${reportPath}`);
}
