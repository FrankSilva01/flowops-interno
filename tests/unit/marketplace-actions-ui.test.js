import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");

test("prioriza cadastro e agrupa acoes raras do Marketplace", () => {
  assert.match(page, /id="marketplaceMoreActions"/);
  assert.match(page, /id="openProductDialogBtn" class="primary-btn"/);
  assert.match(page, /id="syncMercadoLivreBtn" class="secondary-btn"/);
  assert.match(page, /id="openMarketplaceFileImportBtn"[^>]*data-marketplace-overflow-action/);
  assert.match(page, /id="exportListingsBtn"[^>]*data-marketplace-overflow-action/);
});

test("barra de lote depende da selecao de anuncios", () => {
  assert.match(page, /id="marketplaceBulkActions"[^>]*hidden/);
  assert.match(marketplace, /marketplaceBulkActions/);
  assert.match(marketplace, /selectedMarketplaceMigrations\.size/);
});
