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

test("requisitos do Mercado Livre nao bloqueiam o upsert do catalogo", () => {
  const upsertPosition = pricing.indexOf('.from("products").upsert(payload)');
  const readinessPosition = pricing.indexOf("getProductPublicationReadiness({", upsertPosition);
  const titleBlockPosition = pricing.indexOf("if (mlTitleError)");
  const connectionBlockPosition = pricing.indexOf('selectedChannels.includes("mercado-livre") && !isMarketplaceAccountConnected');
  assert.ok(upsertPosition >= 0, "o cadastro precisa persistir em products");
  assert.ok(readinessPosition > upsertPosition, "a prontidao para publicar deve ser calculada depois do catalogo");
  assert.ok(titleBlockPosition < 0 || titleBlockPosition > upsertPosition, "titulo nao pode bloquear o catalogo");
  assert.ok(connectionBlockPosition < 0 || connectionBlockPosition > upsertPosition, "conexao nao pode bloquear o catalogo");
  assert.doesNotMatch(pricing, /showAppMessage\("Nome incompleto para Mercado Livre"[\s\S]*?return false;/);
});

test("impede envio duplicado e sempre reabilita o botao do produto", () => {
  assert.match(pricing, /if \(submitButton\?\.disabled\) return;/);
  assert.match(pricing, /submitButton\.disabled = true;/);
  assert.match(pricing, /finally \{\s*if \(submitButton\) submitButton\.disabled = false;/);
});
