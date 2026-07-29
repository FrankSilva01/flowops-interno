import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.window = { SUPABASE_CONFIG: {}, location: { hash: "" } };

const { materialCashId, materialToCashEntry } = await import("../../js/features/materials.js");

test("materials view exposes the FlowOps Next structure without replacing existing contracts", () => {
  const html = read("index.html");
  const view = html.match(/<section id="materialsView"[\s\S]*?<section id="calendarView"/)?.[0] || "";

  assert.match(view, /id="materialsView" class="view flowops-next-materials"/);
  assert.match(view, /id="materialsNextKpis"/);
  assert.match(view, /role="tablist"[^>]*aria-label="Materiais e estoque"/);
  for (const tab of ["inventory", "purchases", "suppliers"]) {
    assert.match(view, new RegExp(`data-materials-tab="${tab}"`));
    assert.match(view, new RegExp(`id="materials${tab[0].toUpperCase()}${tab.slice(1)}Pane"`));
  }
  for (const id of ["materialForm", "materialsTable", "inventoryForm", "inventoryTable", "lowStockSummary"]) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(view, /id="materialsSuppliersList"/);
});

test("materials tabs implement complete keyboard and ARIA behavior", () => {
  const source = read("js/features/materials.js");
  const router = read("js/core/router.js");

  assert.match(source, /buildMaterialsModel/);
  assert.match(source, /aria-selected/);
  assert.match(source, /tabIndex/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /Home/);
  assert.match(source, /End/);
  assert.match(router, /bindMaterialsTabs/);
});

test("materials commands remain permission-gated and purchase-to-cash integration is preserved", () => {
  const html = read("index.html");
  const materials = read("js/features/materials.js");
  const router = read("js/core/router.js");

  assert.match(html, /id="newMaterialPurchaseBtn"/);
  assert.match(html, /id="newInventoryItemBtn"/);
  assert.match(materials, /state\.canEdit/);
  assert.match(materials, /if \(!ensureCanEdit\(\)\) return/);
  assert.match(materials, /materialToCashEntry\(item\)/);
  assert.match(materials, /id: materialCashId\(item\.id\)/);
  assert.match(router, /const cashId = materialCashId\(id\)/);
  assert.match(router, /removeRemote\("cash", cashId\)/);
});

test("a material purchase keeps the stable linked cash expense contract", () => {
  const purchase = {
    id: "MAT-42",
    date: "2026-07-29",
    supplier: "Fornecedor real",
    type: "Resina",
    spec: "Cinza",
    quantity: 2,
    unitCost: 35,
  };

  assert.equal(materialCashId(purchase.id), "CX-MAT-42");
  assert.deepEqual(materialToCashEntry(purchase), {
    id: "CX-MAT-42",
    date: "2026-07-29",
    type: "Saída",
    category: "Compra de material",
    description: "MAT-42 - Resina - Cinza",
    method: "",
    income: 0,
    expense: 70,
  });
});

test("materials CSS is scoped, bundled once and prevents page-level horizontal overflow", () => {
  const source = read("css/26-flowops-next-materials.css");
  const bundle = read("css/flowops.css");

  assert.match(source, /\.flowops-next-materials/);
  assert.match(source, /overflow-x:\s*auto/);
  assert.match(source, /max-width:\s*100%/);
  assert.match(source, /@media \(max-width:\s*720px\)/);
  assert.match(source, /content:\s*attr\(data-label\)/);
  assert.equal((bundle.match(/Source: css\/26-flowops-next-materials\.css/g) || []).length, 1);
});
