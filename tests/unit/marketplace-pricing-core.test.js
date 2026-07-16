import test from "node:test";
import assert from "node:assert/strict";
import {
  marketplaceDisplayName,
  normalizeMarketplaceChannel,
} from "../../js/features/marketplace-channel.js";
import {
  calculatePriceSuggestion,
  classifyProfitability,
  computeMarginBreakdown,
} from "../../js/features/pricing-math.js";

const thresholds = { critical: 0, attention: 10, healthy: 20, excellent: 35 };

test("marketplace aliases resolve to stable channel identifiers", () => {
  assert.equal(normalizeMarketplaceChannel("Mercado Livre"), "mercado-livre");
  assert.equal(normalizeMarketplaceChannel("ML"), "mercado-livre");
  assert.equal(normalizeMarketplaceChannel("TikTok Shop"), "tiktok-shop");
  assert.equal(marketplaceDisplayName("meli"), "Mercado Livre");
});

test("margin calculation preserves unknown shipping and subtracts fixed fees", () => {
  const result = computeMarginBreakdown({
    cost: 50,
    revenue: 100,
    feePct: 10,
    taxPct: 5,
    shipping: null,
    packaging: 2,
    fixedFee: 3,
  }, thresholds);
  assert.equal(result.shipping, null);
  assert.equal(result.netProfit, 30);
  assert.equal(result.marginPct, 30);
  assert.equal(result.level.key, "healthy");
});

test("price suggestion applies low-value fixed fee and rejects impossible margins", () => {
  assert.equal(calculatePriceSuggestion({
    cost: 20,
    feePct: 10,
    taxPct: 5,
    fixedFee: 5,
    fixedFeeThreshold: 79,
    targetMarginPct: 20,
  }), 38.46);
  assert.equal(calculatePriceSuggestion({ cost: 20, feePct: 60, targetMarginPct: 40 }), null);
});

test("profitability thresholds classify boundary values consistently", () => {
  assert.equal(classifyProfitability(-1, thresholds).key, "loss");
  assert.equal(classifyProfitability(0, thresholds).key, "critical");
  assert.equal(classifyProfitability(20, thresholds).key, "healthy");
  assert.equal(classifyProfitability(35, thresholds).key, "excellent");
});
