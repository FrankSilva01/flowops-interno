import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");
const authenticatedSmoke = readFileSync(new URL("../e2e/authenticated-smoke.spec.js", import.meta.url), "utf8");

test("expoe quatro areas primarias e mantem somente recursos de marketplace", () => {
  for (const area of ["products", "orders", "channels", "performance"]) {
    assert.match(page, new RegExp(`data-marketplace-area="${area}"`));
  }
  for (const view of ["storefront", "listings", "ml-questions", "sales", "integrations", "api-logs", "intelligence"]) {
    assert.match(page, new RegExp(`data-marketplace-view="${view}"`));
  }
  assert.doesNotMatch(page, /data-marketplace-view="backup"/);
  assert.match(page, /id="backupView"[^>]*class="view/);
  assert.match(page, /data-view="backup"[^>]*title="Backup e diagn[^\"]+"/);
});

test("associa tabs e paineis do Marketplace para leitores de tela", () => {
  assert.match(page, /id="marketplaceAreaTabProducts"[^>]*role="tab"[^>]*aria-controls="marketplaceAreaViewsProducts"/);
  assert.match(page, /id="marketplaceAreaViewsProducts"[^>]*role="tabpanel"[^>]*aria-labelledby="marketplaceAreaTabProducts"[^>]*aria-hidden="false"/);
  for (const [area, tab] of [["Orders", "Orders"], ["Channels", "Channels"], ["Performance", "Performance"]]) {
    assert.match(page, new RegExp(`id="marketplaceAreaViews${area}"[^>]*role="tabpanel"[^>]*aria-labelledby="marketplaceAreaTab${tab}"[^>]*aria-hidden="true"[^>]*hidden`));
  }
  assert.match(page, /id="marketplaceViewTabListings"[^>]*role="tab"[^>]*aria-controls="marketplaceListingsView"/);
  assert.match(page, /id="marketplaceListingsView"[^>]*role="tabpanel"[^>]*aria-labelledby="marketplaceViewTabListings"/);
  assert.match(marketplace, /button\.setAttribute\("tabindex", active \? "0" : "-1"\)/);
  assert.match(marketplace, /group\.setAttribute\("aria-hidden", String\(!active\)\)/);
  assert.match(router, /marketplaceAreaForKey/);
  assert.match(router, /marketplaceViewForKey/);
});

test("smoke autenticado usa as quatro areas atuais do Marketplace", () => {
  for (const area of ["products", "orders", "channels", "performance"]) {
    assert.match(authenticatedSmoke, new RegExp(`data-marketplace-area="${area}"`));
  }
  assert.doesNotMatch(authenticatedSmoke, /data-marketplace-area="(?:operation|catalog)"/);
  assert.doesNotMatch(authenticatedSmoke, /data-marketplace-area-views="catalog"/);
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
