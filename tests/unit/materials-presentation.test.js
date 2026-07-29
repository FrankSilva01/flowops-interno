import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialsModel } from "../../js/features/materials-presentation.js";

test("buildMaterialsModel derives purchase and inventory summaries without mutating inputs", () => {
  const purchases = [
    { id: "MAT-1", supplier: "Resinas Sul", quantity: 2, unitCost: 25 },
    { id: "MAT-2", supplier: "Resinas Sul", quantity: 1, unitCost: 30 },
    { id: "MAT-3", supplier: "", quantity: 4, unitCost: 5 },
  ];
  const inventory = [
    { id: "INV-1", quantity: 2, minimum_quantity: 2, unit_cost: 25 },
    { id: "INV-2", quantity: 5, minimum_quantity: 2, unit_cost: 30 },
  ];
  const purchasesOriginal = structuredClone(purchases);
  const inventoryOriginal = structuredClone(inventory);

  const model = buildMaterialsModel({ purchases, inventory });

  assert.deepEqual(model.summary, {
    purchaseTotal: 100,
    purchaseCount: 3,
    averageTicket: 100 / 3,
    inventoryCount: 2,
    lowStockCount: 1,
    estimatedStockValue: 200,
  });
  assert.deepEqual(model.suppliers, [
    { supplier: "Resinas Sul", purchaseCount: 2, total: 80 },
  ]);
  assert.deepEqual(model.purchases, purchases);
  assert.deepEqual(model.inventory, inventory);
  assert.deepEqual(purchases, purchasesOriginal);
  assert.deepEqual(inventory, inventoryOriginal);
});

test("buildMaterialsModel keeps incomplete business data explicit and does not fabricate suppliers", () => {
  const purchases = [{ id: "MAT-unknown", supplier: null, quantity: null, unitCost: null }];
  const inventory = [{ id: "INV-unknown", quantity: null, minimum_quantity: null, unit_cost: null }];

  const model = buildMaterialsModel({ purchases, inventory });

  assert.deepEqual(model.summary, {
    purchaseTotal: null,
    purchaseCount: 1,
    averageTicket: null,
    inventoryCount: 1,
    lowStockCount: null,
    estimatedStockValue: null,
  });
  assert.deepEqual(model.suppliers, []);
  assert.deepEqual(model.purchases, purchases);
  assert.deepEqual(model.inventory, inventory);
});

test("buildMaterialsModel accepts numeric strings and preserves invalid numeric data as null", () => {
  const numericStringModel = buildMaterialsModel({
    purchases: [{ supplier: "Resinas Sul", quantity: " 2 ", unitCost: "25" }],
    inventory: [{ quantity: "2", minimum_quantity: " 2 ", unit_cost: "25" }],
  });

  assert.deepEqual(numericStringModel.summary, {
    purchaseTotal: 50,
    purchaseCount: 1,
    averageTicket: 50,
    inventoryCount: 1,
    lowStockCount: 1,
    estimatedStockValue: 50,
  });

  for (const invalid of ["  ", false, {}, [], Number.NaN, Number.NEGATIVE_INFINITY]) {
    const model = buildMaterialsModel({
      purchases: [{ supplier: "Resinas Sul", quantity: invalid, unitCost: 25 }],
      inventory: [{ quantity: 2, minimum_quantity: invalid, unit_cost: 25 }],
    });

    assert.equal(model.summary.purchaseTotal, null);
    assert.equal(model.summary.averageTicket, null);
    assert.equal(model.suppliers[0].total, null);
    assert.equal(model.summary.lowStockCount, null);
    assert.equal(model.summary.estimatedStockValue, 50);
  }
});
