import test from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
globalThis.window = { location: { hash: "" } };

const { state } = await import("../../js/core/state.js");
const { analyzeDataQuality } = await import("../../js/features/data-quality.js");

function resetData() {
  state.data = { orders: [], cash: [], materials: [] };
  state.leads = [];
  state.inventoryItems = [];
  state.marketplaceListings = [];
}

test("identifica cadastro incompleto e possível encomenda duplicada", () => {
  resetData();
  state.data.orders = [
    { id: "1", description: "Peça A", client: "Cliente", material: "", charged: 100, status: "A preparar", deliveryDate: "", responsible: "" },
    { id: "2", description: "peça a", client: "cliente", material: "Resina", charged: 100, status: "A preparar", deliveryDate: "2026-08-01", responsible: "Ana" },
  ];
  const report = analyzeDataQuality();
  assert.equal(report.totalRecords, 2);
  assert.equal(report.duplicates, 2);
  assert.equal(report.critical, 2);
  assert.ok(report.issues[0].problems.includes("Possível encomenda duplicada"));
});

test("não considera registros válidos como problema", () => {
  resetData();
  state.inventoryItems = [{ id: "i1", name: "Resina cinza", unit: "kg", quantity: 12, minimum_quantity: 3 }];
  state.leads = [{ id: "l1", name: "Maria", email: "maria@example.com", status: "Cliente" }];
  const report = analyzeDataQuality();
  assert.equal(report.totalRecords, 2);
  assert.equal(report.affectedRecords, 0);
  assert.equal(report.score, 100);
});
