import test from "node:test";
import assert from "node:assert/strict";
import { buildShopeeTemplateRow, shopeeSku, validateShopeeListing } from "../../js/features/shopee-template-export.js";

const listing = {
  external_id: "MLB1234567890",
  title: "Kit 5 Miniaturas RPG em Resina",
  description: "Cinco miniaturas produzidas em resina.",
  price: 94.9,
  stock: 4,
  raw_payload: {
    available_quantity: 4,
    pictures: [1, 2, 3].map((id) => ({ secure_url: `https://img.example/${id}.jpg` })),
  },
};

test("preenche as colunas validadas do modelo oficial Shopee", () => {
  const row = buildShopeeTemplateRow(listing);
  assert.equal(row.length, 51);
  assert.equal(row[1], listing.title);
  assert.equal(row[10], 94.9);
  assert.equal(row[11], 4);
  assert.equal(row[17], "https://img.example/1.jpg");
  assert.equal(row[26], 0.25);
  assert.equal(row[30], "Ligado");
  assert.equal(row[3], row[12]);
});

test("gera SKU estável e exige três imagens", () => {
  assert.equal(shopeeSku(listing), shopeeSku(listing));
  assert.deepEqual(validateShopeeListing(listing), []);
  assert.deepEqual(validateShopeeListing({ ...listing, raw_payload: { pictures: [] } }), ["mínimo de 3 imagens"]);
});
