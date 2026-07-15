import test from "node:test";
import assert from "node:assert/strict";
import { groupShopeeCategorySuggestions, suggestShopeeCategory } from "../../js/features/shopee-category-mapping.js";

test("classifica miniaturas RPG como estátuas e esculturas", () => {
  const result = suggestShopeeCategory({ sku: "MIN-3770099", title: "Kit 5 Miniaturas RPG em Resina" });
  assert.equal(result.path, "Hobbies e Coleções > Itens Colecionáveis > Estátuas e Esculturas");
  assert.equal(result.id, "101386");
  assert.equal(result.confidence, "alta");
});

test("separa figures e organizadores por finalidade", () => {
  assert.equal(suggestShopeeCategory({ sku: "DEC-4016768", title: "Figure Mewtwo Pokémon" }).id, "101385");
  assert.equal(suggestShopeeCategory({ sku: "ORG-1818556", title: "Porta Pincéis de Maquiagem" }).id, "101650");
  assert.match(suggestShopeeCategory({ sku: "SUP-7002734", title: "Suporte de Toalha" }).path, /Banheiros$/);
});

test("agrupa seleção em categorias diferentes", () => {
  const groups = groupShopeeCategorySuggestions([
    { sku: "MIN-1", title: "Miniatura Mago RPG" },
    { sku: "MIN-2", title: "Miniatura Orc RPG" },
    { sku: "DEC-1", title: "Deadpool Action Figure" },
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 2);
});
