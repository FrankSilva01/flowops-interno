import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pricing = readFileSync(new URL("../../js/features/pricing.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("exibe orientacao de titulo junto ao nome sem bloquear o catalogo", () => {
  assert.match(page, /id="productNameMarketplaceHint"/);
  assert.doesNotMatch(page, /<select name="mlCategoryId" required>/);
  assert.match(pricing, /updateMlProductTitleHint/);
  assert.match(pricing, /form\.elements\.publish_ml\.checked/);
});

test("valida titulo e categoria somente quando Mercado Livre esta selecionado", () => {
  assert.match(pricing, /selectedChannels\.includes\("mercado-livre"\)/);
  assert.match(pricing, /linkedMarketplace === "mercado-livre"/);
  assert.match(pricing, /form\.elements\.publish_ml\.checked && !form\.elements\.mlCategoryId/);
});
