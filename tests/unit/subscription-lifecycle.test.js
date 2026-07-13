import test from "node:test";
import assert from "node:assert/strict";

import {
  derivePaymentTransition,
  normalizePaymentStatus,
  normalizeProviderSubscriptionStatus,
} from "../../supabase/functions/_shared/subscription-lifecycle.mjs";

const attemptedAt = "2026-07-13T12:00:00.000Z";

test("ativa a assinatura quando a cobranca e aprovada", () => {
  assert.deepEqual(derivePaymentTransition({
    currentStatus: "pending",
    paymentStatus: "approved",
    attemptedAt,
    nextPaymentAt: "2026-08-13T12:00:00.000Z",
  }), {
    paymentStatus: "approved",
    subscriptionStatus: "active",
    organizationStatus: "active",
    paidAt: attemptedAt,
    graceEndsAt: null,
    nextPaymentAt: "2026-08-13T12:00:00.000Z",
  });
});

test("preserva assinatura ativa enquanto o pagamento esta em processamento", () => {
  const result = derivePaymentTransition({ currentStatus: "active", paymentStatus: "in_process", attemptedAt });
  assert.equal(result.paymentStatus, "pending");
  assert.equal(result.subscriptionStatus, "active");
  assert.equal(result.organizationStatus, "active");
});

test("coloca cobranca recusada em carencia de cinco dias", () => {
  const result = derivePaymentTransition({ currentStatus: "active", paymentStatus: "rejected", attemptedAt });
  assert.equal(result.subscriptionStatus, "past_due");
  assert.equal(result.organizationStatus, "pending");
  assert.equal(result.graceEndsAt, "2026-07-18T12:00:00.000Z");
});

test("reembolso e chargeback seguem o fluxo de inadimplencia", () => {
  assert.equal(normalizePaymentStatus("refunded"), "rejected");
  assert.equal(normalizePaymentStatus("charged_back"), "rejected");
});

test("na repeticao do evento preserva a carencia existente", () => {
  const graceEndsAt = "2026-07-18T12:00:00.000Z";
  const first = derivePaymentTransition({ currentStatus: "active", paymentStatus: "rejected", attemptedAt, currentGraceEndsAt: graceEndsAt });
  const duplicate = derivePaymentTransition({ currentStatus: first.subscriptionStatus, paymentStatus: "rejected", attemptedAt, currentGraceEndsAt: first.graceEndsAt });
  assert.equal(duplicate.graceEndsAt, graceEndsAt);
  assert.equal(duplicate.subscriptionStatus, first.subscriptionStatus);
});

test("normaliza o ciclo da assinatura informado pelo provedor", () => {
  assert.equal(normalizeProviderSubscriptionStatus("authorized"), "active");
  assert.equal(normalizeProviderSubscriptionStatus("paused"), "paused");
  assert.equal(normalizeProviderSubscriptionStatus("canceled"), "cancelled");
  assert.equal(normalizeProviderSubscriptionStatus("unknown"), "pending");
});
