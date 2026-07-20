import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const marketplace = fs.readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const router = fs.readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");

test("exportacao Shopee nao exige upload de modelo", () => {
  const dialog = html.match(/<dialog id="shopeeTemplateExportDialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.ok(dialog);
  assert.doesNotMatch(dialog, /type="file"|name="template"/);
  assert.match(dialog, /name="brand"/);
  assert.match(dialog, /Gerar planilha Shopee/);
});

test("fluxo usa o gerador interno e nao registra preview de arquivo", () => {
  assert.match(marketplace, /buildShopeeWorkbook\(/);
  assert.match(marketplace, /validateShopeeExport\(/);
  assert.doesNotMatch(router, /previewShopeeTemplate/);
  assert.doesNotMatch(router, /elements\.template/);
});
