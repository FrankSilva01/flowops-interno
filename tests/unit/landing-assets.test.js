import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const landingUrl = new URL("../../landing/", import.meta.url);
const html = existsSync(new URL("index.html", landingUrl))
  ? readFileSync(new URL("index.html", landingUrl), "utf8")
  : "";

for (const path of [
  "assets/flowops-dashboard.png",
  "assets/flowops-producao.png",
  "assets/flowops-encomendas.png",
]) {
  test(`landing publica ${path}`, () => {
    assert.match(html, new RegExp(path.replaceAll("/", "\\/")));
    const file = new URL(path, landingUrl);
    assert.equal(existsSync(file), true);
    assert.ok(statSync(file).size > 10_000);
    assert.deepEqual([...readFileSync(file).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });
}
