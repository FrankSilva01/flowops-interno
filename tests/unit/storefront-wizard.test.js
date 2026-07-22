import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clampStorefrontStep } from "../../js/features/storefront-wizard.js";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const wizard = readFileSync(new URL("../../js/features/storefront-wizard.js", import.meta.url), "utf8");

test("limita o cadastro do catalogo a quatro etapas", () => {
  assert.equal(clampStorefrontStep(-1), 1);
  assert.equal(clampStorefrontStep(3), 3);
  assert.equal(clampStorefrontStep(9), 4);
});

test("catalogo possui dialogo, progresso e controles por etapas", () => {
  assert.match(page, /id="storefrontProductDialog"/);
  assert.match(page, /id="storefrontWizardProgress"/);
  assert.match(page, /id="storefrontPrevBtn"/);
  assert.match(page, /id="storefrontNextBtn"/);
  assert.match(page, /id="storefrontSubmitBtn"/);
});

test("acoes permanecem fora das secoes ocultaveis", () => {
  assert.match(wizard, /filter\(\(node\) => node !== actions\)/);
  assert.match(wizard, /form\.append\(actions\)/);
});
