import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  SUBSCRIPTION_AREAS,
  FISCAL_AREAS,
  areaForKey,
  friendlyPaymentDetail,
} from "../../js/features/subscription-fiscal-navigation.js";

const index = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("subscription exposes three dense FlowOps Next areas", () => {
  assert.deepEqual(SUBSCRIPTION_AREAS, ["plan", "billing", "governance"]);
  for (const area of SUBSCRIPTION_AREAS) {
    assert.match(index, new RegExp(`data-subscription-area="${area}"`));
    assert.match(index, new RegExp(`id="subscriptionPanel-${area}"`));
  }
});

test("fiscal preserves all operational areas", () => {
  assert.deepEqual(FISCAL_AREAS, ["documentos", "compra", "venda", "das"]);
  for (const area of FISCAL_AREAS) assert.match(index, new RegExp(`data-fiscal-tab="${area}"`));
});

test("area keyboard navigation supports arrows, Home and End", () => {
  assert.equal(areaForKey(SUBSCRIPTION_AREAS, "billing", "ArrowRight"), "governance");
  assert.equal(areaForKey(SUBSCRIPTION_AREAS, "plan", "ArrowLeft"), "governance");
  assert.equal(areaForKey(FISCAL_AREAS, "venda", "Home"), "documentos");
  assert.equal(areaForKey(FISCAL_AREAS, "compra", "End"), "das");
  assert.equal(areaForKey(FISCAL_AREAS, "compra", "Enter"), null);
});

test("subscription and fiscal are constrained on mobile", () => {
  assert.match(css, /#subscriptionView\.flowops-next-subscription/);
  assert.match(css, /#fiscalView\.flowops-next-fiscal/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*subscription-next-tabs/);
});

test("billing returns provider failures in friendly language", () => {
  assert.equal(friendlyPaymentDetail("cc_rejected_high_risk"), "Pagamento recusado por segurança. Tente outro cartão ou confirme os dados com o banco.");
  assert.equal(friendlyPaymentDetail("cc_rejected_insufficient_amount"), "Saldo ou limite insuficiente. Use outro cartão ou ajuste o limite.");
  assert.equal(friendlyPaymentDetail("custom provider note"), "custom provider note");
  assert.equal(friendlyPaymentDetail(null), "-");
});
