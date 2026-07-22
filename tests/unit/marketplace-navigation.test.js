import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_AREAS,
  PERFORMANCE_SECTIONS,
  defaultMarketplaceViewForArea,
  marketplaceAreaForView,
  performanceSectionForKey,
} from "../../js/features/marketplace-navigation.js";

test("agrupa todas as visoes do Marketplace em quatro areas", () => {
  assert.deepEqual(Object.keys(MARKETPLACE_AREAS), ["operation", "catalog", "performance", "settings"]);
  assert.equal(marketplaceAreaForView("listings"), "operation");
  assert.equal(marketplaceAreaForView("sales"), "operation");
  assert.equal(marketplaceAreaForView("ml-questions"), "operation");
  assert.equal(marketplaceAreaForView("storefront"), "catalog");
  assert.equal(marketplaceAreaForView("intelligence"), "performance");
  assert.equal(marketplaceAreaForView("integrations"), "settings");
  assert.equal(marketplaceAreaForView("api-logs"), "settings");
  assert.equal(marketplaceAreaForView("backup"), "settings");
});

test("cada area possui uma visao inicial estavel", () => {
  assert.equal(defaultMarketplaceViewForArea("operation"), "listings");
  assert.equal(defaultMarketplaceViewForArea("catalog"), "storefront");
  assert.equal(defaultMarketplaceViewForArea("performance"), "intelligence");
  assert.equal(defaultMarketplaceViewForArea("settings"), "integrations");
});

test("define secoes estaveis para os detalhes de performance", () => {
  assert.deepEqual(PERFORMANCE_SECTIONS, ["profitability", "listings", "investment", "reputation"]);
});

test("navega as abas de performance com as teclas padrao", () => {
  assert.equal(performanceSectionForKey("profitability", "ArrowRight"), "listings");
  assert.equal(performanceSectionForKey("profitability", "ArrowLeft"), "reputation");
  assert.equal(performanceSectionForKey("investment", "Home"), "profitability");
  assert.equal(performanceSectionForKey("investment", "End"), "reputation");
  assert.equal(performanceSectionForKey("investment", "Enter"), null);
});
