import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMarketplaceMigrationDefaults,
  buildMarketplaceMigration,
  buildMarketplaceMigrationBatch,
  migrationTargetFor,
} from "../../js/features/marketplace-migration.js";

const mlListing = {
  marketplace: "Mercado Livre",
  title: "Miniatura em resina",
  price: 129.9,
  stock: 4,
  sku: "MINI-001",
  thumbnail_url: "http://images.example/main.jpg",
  raw_payload: {
    category_id: "MLB123",
    description: "Produto pronto para pintura.",
    pictures: [
      { secure_url: "https://images.example/1.jpg" },
      { secure_url: "https://images.example/2.jpg" },
      { secure_url: "https://images.example/3.jpg" },
    ],
  },
};

test("sugere Shopee como destino para anuncio do Mercado Livre", () => {
  assert.equal(migrationTargetFor("Mercado Livre"), "shopee");
});

test("preserva dados comuns e exige campos especificos da Shopee", () => {
  const migration = buildMarketplaceMigration(mlListing, "shopee");
  assert.equal(migration.title, mlListing.title);
  assert.equal(migration.sku, "MINI-001");
  assert.equal(migration.images.length, 4);
  assert.deepEqual(migration.missing, ["Categoria Shopee", "Peso"]);
});

test("exige categoria ML ao replicar um anuncio Shopee", () => {
  const migration = buildMarketplaceMigration({
    marketplace: "Shopee",
    title: "Produto Shopee",
    price: 80,
    sku: "SHP-1",
    raw_payload: { images: ["https://i/1", "https://i/2", "https://i/3"] },
  }, "mercado-livre");
  assert.deepEqual(migration.missing, ["Categoria Mercado Livre"]);
});

test("rejeita origem e destino iguais", () => {
  assert.throws(() => buildMarketplaceMigration(mlListing, "mercado-livre"), /canais diferentes/);
});

test("aplica categoria e peso comuns em um lote para Shopee", () => {
  const migrations = buildMarketplaceMigrationBatch([mlListing], "shopee", {
    shopeeCategoryId: "SHP-123",
    shopeeWeight: 0.35,
  });
  assert.equal(migrations[0].ready, true);
  assert.equal(migrations[0].shopee.categoryId, "SHP-123");
  assert.equal(migrations[0].shopee.weight, 0.35);
});

test("rejeita lote com origens misturadas", () => {
  const shopeeListing = { ...mlListing, marketplace: "Shopee" };
  assert.throws(
    () => buildMarketplaceMigrationBatch([mlListing, shopeeListing], "shopee"),
    /apenas um marketplace/,
  );
});

test("mantem pendencias que nao podem ser preenchidas pelos valores comuns", () => {
  const migration = buildMarketplaceMigration({ ...mlListing, sku: "", raw_payload: {} }, "shopee");
  const updated = applyMarketplaceMigrationDefaults(migration, { shopeeCategoryId: "SHP-1", shopeeWeight: 1 });
  assert.deepEqual(updated.missing, ["SKU", "Imagens (1/3)"]);
});
