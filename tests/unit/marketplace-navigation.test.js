import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_AREAS,
  PERFORMANCE_SECTIONS,
  defaultMarketplaceViewForArea,
  marketplaceAreaForKey,
  operationalMarketplaceListings,
  marketplaceAreaForView,
  marketplaceViewForKey,
  performanceSectionForKey,
  productListingLinks,
} from "../../js/features/marketplace-navigation.js";

test("agrupa todas as visoes do Marketplace em quatro areas", () => {
  assert.deepEqual(Object.keys(MARKETPLACE_AREAS), ["products", "orders", "channels", "performance"]);
  assert.equal(marketplaceAreaForView("storefront"), "products");
  assert.equal(marketplaceAreaForView("listings"), "products");
  assert.equal(marketplaceAreaForView("ml-questions"), "products");
  assert.equal(marketplaceAreaForView("sales"), "orders");
  assert.equal(marketplaceAreaForView("integrations"), "channels");
  assert.equal(marketplaceAreaForView("api-logs"), "channels");
  assert.equal(marketplaceAreaForView("backup"), "channels");
  assert.equal(marketplaceAreaForView("intelligence"), "performance");
});

test("cada area possui uma visao inicial estavel", () => {
  assert.equal(defaultMarketplaceViewForArea("products"), "storefront");
  assert.equal(defaultMarketplaceViewForArea("orders"), "sales");
  assert.equal(defaultMarketplaceViewForArea("channels"), "integrations");
  assert.equal(defaultMarketplaceViewForArea("performance"), "intelligence");
});

test("navega areas e visoes com as teclas padrao", () => {
  assert.equal(marketplaceAreaForKey("products", "ArrowRight"), "orders");
  assert.equal(marketplaceAreaForKey("products", "ArrowLeft"), "performance");
  assert.equal(marketplaceAreaForKey("channels", "Home"), "products");
  assert.equal(marketplaceAreaForKey("orders", "End"), "performance");
  assert.equal(marketplaceAreaForKey("orders", "Enter"), null);
  assert.equal(marketplaceViewForKey("storefront", "ArrowRight"), "listings");
  assert.equal(marketplaceViewForKey("storefront", "ArrowLeft"), "ml-questions");
  assert.equal(marketplaceViewForKey("api-logs", "Home"), "integrations");
  assert.equal(marketplaceViewForKey("integrations", "End"), "backup");
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

test("separa publicacoes da vitrine dos anuncios operacionais", () => {
  const rows = [
    { marketplace: "Vitrine", external_id: "V1" },
    { marketplace: "Mercado Livre", external_id: "ML1" },
    { marketplace: "Shopee", external_id: "SH1" },
  ];

  assert.deepEqual(operationalMarketplaceListings(rows), [rows[1], rows[2]]);
});

test("resolve os anuncios vinculados a um produto mestre", () => {
  const product = { id: "p1" };
  const links = [
    { product_id: "p1", marketplace: "Mercado Livre", external_id: "ML1" },
    { product_id: "p2", marketplace: "Shopee", external_id: "SH1" },
  ];
  const listings = [
    { marketplace: "Mercado Livre", external_id: "ML1", title: "Produto" },
  ];

  assert.deepEqual(productListingLinks(product, links, listings), [
    { link: links[0], listing: listings[0] },
  ]);
});
