import assert from "node:assert/strict";
import test from "node:test";

import { performanceSectionForKey } from "../../js/features/marketplace-navigation.js";
import { buildMarketplacePerformanceSnapshot } from "../../js/features/marketplace-performance-model.js";

test("preserva a secao rentabilidade e a navegacao por teclado entre detalhes", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: {}, profitability: { hasCost: false } },
  ]);

  assert.equal(snapshot.defaultSection, "profitability");
  assert.equal(performanceSectionForKey("profitability", "ArrowRight"), "listings");
  assert.equal(performanceSectionForKey("listings", "ArrowLeft"), "profitability");
});

test("preserva semantica indisponivel e parcial para receita executiva", () => {
  const unavailable = buildMarketplacePerformanceSnapshot([], {
    revenue: { value: null, coverage: "unavailable" },
  });
  const partial = buildMarketplacePerformanceSnapshot([], {
    revenue: { value: 125, coverage: "partial" },
  });

  assert.equal(unavailable.indicators.revenue, null);
  assert.equal(unavailable.revenueCoverage, "unavailable");
  assert.equal(partial.indicators.revenue, 125);
  assert.equal(partial.revenueCoverage, "partial");
});

test("mantem os pontos historicos que alimentam a visualizacao executiva", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: { raw_summary: { visits_series: [{ date: "2026-07-01", total: 3 }] } }, profitability: null },
  ]);

  assert.deepEqual(snapshot.visitsSeries, [{ date: "2026-07-01", value: 3 }]);
});
