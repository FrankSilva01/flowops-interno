import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("prioriza cadastro e agrupa acoes raras do Marketplace", () => {
  assert.match(page, /id="marketplaceMoreActions"/);
  assert.match(page, /id="openProductDialogBtn" class="primary-btn"/);
  assert.match(page, /id="syncMercadoLivreBtn" class="secondary-btn"/);
  assert.match(page, /id="openMarketplaceFileImportBtn"[^>]*data-marketplace-overflow-action/);
  assert.match(page, /id="exportListingsBtn"[^>]*data-marketplace-overflow-action/);
});

test("catalogo usa produtos mestres e uma unica entrada de cadastro", () => {
  assert.match(page, /id="openCatalogProductDialogBtn"[^>]*data-action="open-product-dialog"/);
  assert.match(marketplace, /state\.products/);
  assert.match(marketplace, /productListingLinks/);
  assert.match(page, /Produtos cadastrados/);
});

test("barra de lote depende da selecao de anuncios", () => {
  assert.match(page, /id="marketplaceBulkActions"[^>]*hidden/);
  assert.match(marketplace, /marketplaceBulkActions/);
  assert.match(marketplace, /selectedMarketplaceMigrations\.size/);
});

test("navegacao das areas usa evento delegado e funciona apos renderizacoes", () => {
  assert.match(router, /event\.target\.closest\("\[data-marketplace-area\]"\)/);
  assert.match(router, /setMarketplaceArea\(marketplaceAreaButton\.dataset\.marketplaceArea\)/);
  assert.match(router, /event\.target\.closest\("\[data-marketplace-view\]"\)/);
});

test("botao de mais acoes acompanha a altura dos demais controles", () => {
  assert.match(styles, /\.marketplace-more-actions\s*>\s*summary\s*\{[^}]*min-height:\s*40px;/s);
  assert.match(styles, /\.marketplace-more-actions\s*>\s*summary\s*\{[^}]*box-sizing:\s*border-box;/s);
});
