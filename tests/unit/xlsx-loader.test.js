import assert from "node:assert/strict";
import test from "node:test";

test("carrega XLSX localmente e compartilha chamadas simultaneas", async () => {
  const appended = [];
  globalThis.window = { location: { hash: "" } };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.SUPABASE_CONFIG = {};
  globalThis.document = {
    createElement: () => ({}),
    head: { appendChild: (node) => appended.push(node) },
  };

  const { loadXlsx } = await import(`../../js/core/importer.js?test=${Date.now()}`);
  const first = loadXlsx();
  const second = loadXlsx();

  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, "./assets/vendor/xlsx.full.min.js");
  window.XLSX = { version: "0.18.5" };
  appended[0].onload();
  await Promise.all([first, second]);
  assert.equal(window.XLSX.version, "0.18.5");
});
