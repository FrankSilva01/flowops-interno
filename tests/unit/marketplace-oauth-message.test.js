import assert from "node:assert/strict";
import test from "node:test";

const messages = await import("../../js/features/marketplace-oauth-message.js").catch(() => ({}));

test("traduz falhas técnicas do OAuth para orientação amigável", () => {
  assert.equal(typeof messages.mlOAuthErrorMessage, "function");
  assert.match(messages.mlOAuthErrorMessage("state_expirado"), /expirou/i);
  assert.match(messages.mlOAuthErrorMessage("access_denied"), /cancelada/i);
  assert.doesNotMatch(messages.mlOAuthErrorMessage("[object Object]"), /object Object/i);
});

test("conflito de vínculo não confirma dados de outra empresa", () => {
  assert.equal(typeof messages.mlOAuthStatusFeedback, "function");
  const feedback = messages.mlOAuthStatusFeedback("already_linked");
  assert.equal(feedback.tone, "warning");
  assert.doesNotMatch(`${feedback.title} ${feedback.message}`, /outra empresa|já (está )?vinculad|pertence a/i);
});
