import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("expoe quatro areas primarias e preserva as oito views existentes", () => {
  for (const area of ["products", "orders", "channels", "performance"]) {
    assert.match(page, new RegExp(`data-marketplace-area="${area}"`));
  }
  for (const view of ["storefront", "listings", "ml-questions", "sales", "integrations", "api-logs", "backup", "intelligence"]) {
    assert.match(page, new RegExp(`data-marketplace-view="${view}"`));
  }
});

test("associa tabs e paineis do Marketplace para leitores de tela", () => {
  assert.match(page, /id="marketplaceAreaTabProducts"[^>]*role="tab"[^>]*aria-controls="marketplaceAreaViewsProducts"/);
  assert.match(page, /id="marketplaceViewTabListings"[^>]*role="tab"[^>]*aria-controls="marketplaceListingsView"/);
  assert.match(page, /id="marketplaceListingsView"[^>]*role="tabpanel"[^>]*aria-labelledby="marketplaceViewTabListings"/);
  assert.match(marketplace, /button\.setAttribute\("tabindex", active \? "0" : "-1"\)/);
  assert.match(router, /marketplaceAreaForKey/);
  assert.match(router, /marketplaceViewForKey/);
});

test("mantem busca e canal visiveis e recolhe filtros avancados", () => {
  assert.match(page, /id="marketplaceListingSearchInput"/);
  assert.match(page, /id="marketplaceChannelFilters"/);
  assert.match(page, /id="marketplaceAdvancedFilters"[^>]*class="marketplace-advanced-filters"/);
  assert.match(page, /<summary[^>]*>\s*<i[^>]*><\/i>\s*Filtros avançados/);
  assert.match(page, /data-listing-filter="noSales"/);
  assert.match(page, /data-listing-filter="intentVeryHigh"/);
});

test("limita overflow ao conteudo interno em telas de 390px", () => {
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*#marketplaceView\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*clip;/);
  assert.match(styles, /#marketplaceView \.table-wrap[^}]*overflow-x:\s*auto;/);
});
