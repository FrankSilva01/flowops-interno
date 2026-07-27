import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../landing/app.js", import.meta.url), "utf8");

test("falha ao carregar planos oferece nova tentativa", () => {
  assert.match(app, /data-retry-plans/);
  assert.match(app, /addEventListener\("click",\s*loadPlans\)/);
});

test("cadastro continua sem exigir cartao", () => {
  assert.doesNotMatch(app, /card_number|credit_card|payment_method_id/);
  assert.match(app, /action:\s*"register"/);
});
