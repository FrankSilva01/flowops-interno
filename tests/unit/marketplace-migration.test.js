import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMarketplaceMigrationDefaults,
  buildMarketplaceMigration,
  buildMarketplaceMigrationBatch,
  migrationTargetFor,
} from "../../js/features/marketplace-migration.js";
import { normalizeMarketplaceImportRows } from "../../js/features/marketplace-file-import.js";

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

test("leva medidas, peso e marca do ML para o rascunho Shopee", () => {
  const migration = buildMarketplaceMigration({
    ...mlListing,
    raw_payload: {
      ...mlListing.raw_payload,
      attributes: [
        { id: "SELLER_PACKAGE_LENGTH", value_name: "10 cm" },
        { id: "SELLER_PACKAGE_WIDTH", value_name: "17 cm" },
        { id: "SELLER_PACKAGE_HEIGHT", value_name: "21 cm" },
        { id: "SELLER_PACKAGE_WEIGHT", value_name: "356 g" },
      ],
    },
  }, "shopee");
  assert.equal(migration.shopee.weight, 0.356);
  assert.equal(migration.shopee.length, 10);
  assert.equal(migration.shopee.width, 17);
  assert.equal(migration.shopee.height, 21);
  assert.equal(migration.shopee.brand, "Sem marca");
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

test("gera SKU e mantem apenas pendencias que nao podem ser preenchidas pelos valores comuns", () => {
  const migration = buildMarketplaceMigration({ ...mlListing, sku: "", raw_payload: {} }, "shopee");
  const updated = applyMarketplaceMigrationDefaults(migration, { shopeeCategoryId: "SHP-1", shopeeWeight: 1 });
  assert.match(updated.sku, /^[A-Z]{3}-/);
  assert.deepEqual(updated.missing, ["Imagens (1/3)"]);
});

test("normaliza planilha exportada da Shopee sem API", () => {
  const [item] = normalizeMarketplaceImportRows([{
    "ID do item": "987654", "Nome do produto": "Miniatura importada", "SKU principal": "SHP-987",
    "Preço": "R$ 79,90", Estoque: "12", "Peso (kg)": "0,25",
    "Imagem 1": "http://images.example/1.jpg", "Imagem 2": "https://images.example/2.jpg",
  }], "Shopee");
  assert.equal(item.marketplace, "Shopee");
  assert.equal(item.price, 79.9);
  assert.equal(item.stock, 12);
  assert.equal(item.weight, 0.25);
  assert.equal(item.images.length, 2);
  assert.equal(item.valid, true);
});

test("aceita colunas comuns de exportacao do Mercado Livre", () => {
  const [item] = normalizeMarketplaceImportRows([{
    "Item ID": "MLB123", Title: "Produto ML", "Seller SKU": "ML-123", Price: "129.90", "Available Quantity": "4",
  }], "Mercado Livre");
  assert.equal(item.externalId, "MLB123");
  assert.equal(item.price, 129.9);
  assert.equal(item.stock, 4);
});
