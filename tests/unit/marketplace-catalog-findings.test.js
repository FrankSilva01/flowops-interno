import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  marketplaceChannelFiltersVisible,
  renderCatalogLinkedListing,
  resolveLinkedMarketplaceListing,
} from "../../js/features/marketplace-navigation.js";

const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");

test("escapa metadados externos hostis nos vinculos do Catalogo", () => {
  const markup = renderCatalogLinkedListing({
    marketplace: '<img src=x onerror="globalThis.xss=1">',
    external_id: '<script>globalThis.xss=1</script>',
  });

  assert.match(markup, /&lt;img src=x onerror=&quot;globalThis\.xss=1&quot;&gt;/);
  assert.match(markup, /&lt;script&gt;globalThis\.xss=1&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<img src=x|<script>/);
  assert.match(marketplace, /html\(marketplaceDisplayName\(link\.marketplace\)\).*html\(link\.external_id\)/);
});

test("identifica vinculo legado sem anuncio carregado como pendente de associacao", () => {
  const markup = renderCatalogLinkedListing({ marketplace: "Mercado Livre", external_id: "ML-LEGADO" });

  assert.match(markup, /Pendente de associa/);
  assert.match(markup, /data-action="open-linked-listing"/);
  assert.match(markup, /data-marketplace="Mercado Livre"/);
  assert.match(markup, /data-external-id="ML-LEGADO"/);
});

test("resolve um vinculo fora da colecao inicial sem ampliar o limite de anuncios", async () => {
  const initialListings = Array.from({ length: 100 }, (_, index) => ({
    marketplace: "Mercado Livre",
    external_id: `ML-${index + 1}`,
  }));
  const link = { marketplace: "Mercado Livre", external_id: "ML-101" };
  const fetched = { ...link, title: "Anuncio fora da primeira pagina" };
  let requested;

  const listing = await resolveLinkedMarketplaceListing(link, initialListings, async (request) => {
    requested = request;
    return fetched;
  });

  assert.deepEqual(requested, link);
  assert.deepEqual(listing, fetched);
  assert.equal(initialListings.length, 100);
});

test("filtros de canal pertencem apenas a Operacao e nao alteram o Catalogo", () => {
  assert.equal(marketplaceChannelFiltersVisible("operation"), true);
  assert.equal(marketplaceChannelFiltersVisible("catalog"), false);
  assert.equal(marketplaceChannelFiltersVisible("performance"), false);
  assert.equal(marketplaceChannelFiltersVisible("settings"), false);
  assert.match(marketplace, /marketplaceChannelFilters\.hidden\s*=\s*!marketplaceChannelFiltersVisible\(area\)/);
  assert.match(router, /if \(marketplaceAreaForView\(state\.marketplaceView\) !== "operation"\) return;/);
});
