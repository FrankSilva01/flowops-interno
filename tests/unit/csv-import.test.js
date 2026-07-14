import test from "node:test";
import assert from "node:assert/strict";

import { parseCsv } from "../../js/core/csv.js";
import { normalizeMarketplaceImportRows, runMarketplaceImportBatch } from "../../js/features/marketplace-file-import.js";

test("le CSV Shopee com BOM, ponto e virgula, aspas e descricao multilinha", () => {
  const rows = parseCsv('\ufeff"ID do item";"Nome do produto";"SKU principal";"Preço";"Descrição do produto"\r\n"123";"Miniatura";"SHP-1";"79,90";"Linha 1\nLinha 2"\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Descrição do produto"], "Linha 1\nLinha 2");
  const [listing] = normalizeMarketplaceImportRows(rows, "Shopee");
  assert.equal(listing.externalId, "123");
  assert.equal(listing.price, 79.9);
  assert.equal(listing.valid, true);
});

test("preserva aspas escapadas no CSV", () => {
  const [row] = parseCsv('Nome,Preco,Descricao\nProduto,10.00,"Peça ""premium"""');
  assert.equal(row.Descricao, 'Peça "premium"');
});

test("processa lote com concorrencia limitada e preserva resultados", async () => {
  let active = 0;
  let maximum = 0;
  const results = await runMarketplaceImportBatch([1, 2, 3, 4, 5], async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (value === 4) throw new Error("falhou");
    return value * 2;
  }, 2);
  assert.equal(maximum, 2);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled", "rejected", "fulfilled"]);
});
