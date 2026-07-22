import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const state = readFileSync(new URL("../../js/core/state.js", import.meta.url), "utf8");

test("catalogo e anuncios possuem paginadores independentes", () => {
  assert.match(page, /id="storefrontPagination"/);
  assert.match(page, /id="marketplaceListingsPagination"/);
  assert.match(state, /storefrontPage:\s*1/);
  assert.match(state, /marketplaceListingsPage:\s*1/);
});

test("renderizacao pagina as duas colecoes antes de criar as linhas", () => {
  assert.match(marketplace, /paginate\(state\.marketplaceListings/);
  assert.match(marketplace, /paginate\(listings,\s*state\.marketplaceListingsPage/);
  assert.match(marketplace, /paginationMarkup\(storefrontPage,\s*"storefront-page"\)/);
  assert.match(marketplace, /paginationMarkup\(listingsPage,\s*"marketplace-listings-page"\)/);
});

test("selecao geral usa somente anuncios da pagina atual", () => {
  assert.match(marketplace, /currentVisibleMarketplaceListings/);
  assert.match(marketplace, /currentVisibleMarketplaceListings[\s\S]*\.forEach/);
});
