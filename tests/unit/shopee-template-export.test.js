import test from "node:test";
import assert from "node:assert/strict";
import { applyShopeeTemplateRows, buildShopeeTemplateRow, listingAttributeValue, marketplacePackageData, readShopeeTemplateSchema, shopeeSku, validateShopeeListing } from "../../js/features/shopee-template-export.js";

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

test("detecta atributo obrigatório de modelo específico e aproveita valor do Mercado Livre", () => {
  const sheet = {
    "!ref": "A1:AZ6",
    A1: { v: "ps_category|0|0" },
    A3: { v: "Categoria" },
    A4: { v: "Opcional" },
    AZ1: { v: "ps_attribute_material|1|0" },
    AZ3: { v: "Material" },
    AZ4: { v: "Obrigatório" },
  };
  const xlsx = {
    utils: {
      decode_range: () => ({ s: { c: 0 }, e: { c: 51 } }),
      encode_cell: ({ r, c }) => `${c === 51 ? "AZ" : c === 0 ? "A" : "B"}${r + 1}`,
      sheet_add_aoa: (target, rows) => { target.rows = rows; },
    },
  };
  const schema = readShopeeTemplateSchema(sheet, xlsx);
  assert.equal(schema.categorySpecific, true);
  assert.equal(schema.requiredAttributes[0].label, "Material");
  const enriched = { ...listing, raw_payload: { ...listing.raw_payload, attributes: [{ name: "Material", value_name: "Resina" }] } };
  assert.equal(listingAttributeValue(enriched, "Material"), "Resina");
  const rows = applyShopeeTemplateRows(sheet, [enriched], schema, { categoryId: "101944", length: 15, width: 10, height: 10, preOrderDays: 3, attributes: {} }, xlsx);
  assert.equal(rows[0][0], "101944");
  assert.equal(rows[0][51], "Resina");
});

test("coleta dimensões e peso da embalagem do Mercado Livre", () => {
  const measured = {
    ...listing,
    raw_payload: {
      ...listing.raw_payload,
      attributes: [
        { id: "SELLER_PACKAGE_LENGTH", value_name: "9 cm" },
        { id: "SELLER_PACKAGE_WIDTH", value_name: "17 cm" },
        { id: "SELLER_PACKAGE_HEIGHT", value_name: "27 cm" },
        { id: "SELLER_PACKAGE_WEIGHT", value_name: "2179 g" },
        { id: "BRAND", name: "Marca", value_name: "3DAFT" },
      ],
    },
  };
  assert.deepEqual(marketplacePackageData(measured), { weight: 2.179, length: 9, width: 17, height: 27, brand: "Sem marca" });
  assert.equal(buildShopeeTemplateRow(measured)[26], 2.179);
  assert.equal(listingAttributeValue(measured, "Marca"), "Sem marca");
});
