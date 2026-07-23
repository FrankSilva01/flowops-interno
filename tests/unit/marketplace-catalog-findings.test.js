import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  marketplaceChannelFiltersVisible,
  openResolvedLinkedMarketplaceListing,
  renderCatalogLinkedListing,
  resolveLinkedMarketplaceListing,
  routeSelectedMarketplaceListingEdit,
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

test("edita o anuncio selecionado no drawer sem depender de um botao no grid", async () => {
  const listing = { marketplace: "Mercado Livre", external_id: "ML-101", title: "Anuncio fora da pagina" };
  const calls = [];

  const edited = await routeSelectedMarketplaceListingEdit(listing, {
    ensureCanManage: () => true,
    closeDrawer: () => calls.push("close"),
    openMarketplaceEdit: async (externalId, marketplace) => calls.push([externalId, marketplace]),
  });

  assert.equal(edited, true);
  assert.deepEqual(calls, ["close", ["ML-101", "Mercado Livre"]]);

  const denied = await routeSelectedMarketplaceListingEdit(listing, {
    ensureCanManage: () => false,
    closeDrawer: () => calls.push("denied-close"),
    openMarketplaceEdit: async () => calls.push("denied-edit"),
  });
  assert.equal(denied, false);
  assert.deepEqual(calls, ["close", ["ML-101", "Mercado Livre"]]);
});

test("mantem o vinculo pendente e informa quando a busca direcionada nao encontra anuncio", async () => {
  const link = { marketplace: "Mercado Livre", external_id: "ML-ORFAO" };
  const calls = [];

  const result = await openResolvedLinkedMarketplaceListing(link, [], async () => null, {
    openDrawer: (listing) => calls.push(["drawer", listing]),
    showFeedback: (feedback) => calls.push(["feedback", feedback]),
  });

  assert.equal(result.listing, null);
  assert.equal(result.status, "not-found");
  assert.match(result.feedback.message, /continua pendente de associa/);
  assert.deepEqual(calls, [["feedback", result.feedback]]);
  assert.match(renderCatalogLinkedListing(link), /Pendente de associa/);
});

test("mantem o vinculo pendente e informa quando a busca direcionada falha", async () => {
  const link = { marketplace: "Mercado Livre", external_id: "ML-ERRO" };
  const failure = new Error("consulta indisponivel");
  const calls = [];

  const result = await openResolvedLinkedMarketplaceListing(link, [], async () => { throw failure; }, {
    openDrawer: (listing) => calls.push(["drawer", listing]),
    showFeedback: (feedback) => calls.push(["feedback", feedback]),
  });

  assert.equal(result.listing, null);
  assert.equal(result.status, "error");
  assert.match(result.feedback.title, /Não foi possível consultar/);
  assert.deepEqual(calls, [["feedback", result.feedback]]);
  assert.match(renderCatalogLinkedListing(link), /Pendente de associa/);
});

test("filtros de canal pertencem apenas a Operacao e nao alteram o Catalogo", () => {
  assert.equal(marketplaceChannelFiltersVisible("operation"), true);
  assert.equal(marketplaceChannelFiltersVisible("catalog"), false);
  assert.equal(marketplaceChannelFiltersVisible("performance"), false);
  assert.equal(marketplaceChannelFiltersVisible("settings"), false);
  assert.match(marketplace, /marketplaceChannelFilters\.hidden\s*=\s*!marketplaceChannelFiltersVisible\(area\)/);
  assert.match(router, /if \(marketplaceAreaForView\(state\.marketplaceView\) !== "operation"\) return;/);
});
