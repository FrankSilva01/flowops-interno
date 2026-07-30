import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const serviceWorkerPath = fileURLToPath(new URL("../../sw.js", import.meta.url));

test("ships the current cache with the consolidated FlowOps stylesheet once", async () => {
  const serviceWorker = await readFile(serviceWorkerPath, "utf8");
  const cacheName = serviceWorker.match(/const CACHE_NAME = "([^"]+)";/)?.[1];
  const staticAssets = [...serviceWorker.matchAll(/^\s*"([^"]+)",$/gm)].map(([, asset]) => asset);

  assert.equal(cacheName, "flowops-v68");
  assert.equal(staticAssets.filter((asset) => asset === "/css/flowops.css").length, 1);
  assert.equal(staticAssets.includes("/css/21-flowops-next-orders.css"), false);
  assert.equal(staticAssets.includes("/css/22-flowops-next-library.css"), false);
  assert.equal(staticAssets.includes("/css/23-flowops-next-commercial.css"), false);
  assert.equal(staticAssets.includes("/css/24-flowops-next-calendar.css"), false);
});
