import assert from "node:assert/strict";
import test from "node:test";

const recovery = await import("../../supabase/functions/_shared/mercado-pago-plan-recovery.mjs").catch(() => ({}));

test("identifica plano recorrente removido no Mercado Pago", () => {
  assert.equal(typeof recovery.isMissingMercadoPagoPlan, "function");
  assert.equal(recovery.isMissingMercadoPagoPlan({ status: 400, message: "The template with id abc does not exist" }), true);
  assert.equal(recovery.isMissingMercadoPagoPlan({ status: 404, message: "Preapproval plan not found" }), true);
  assert.equal(recovery.isMissingMercadoPagoPlan({ status: 401, message: "Unauthorized" }), false);
});
