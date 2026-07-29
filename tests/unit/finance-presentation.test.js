import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceModel } from "../../js/features/finance-presentation.js";

test("buildFinanceModel derives chronological cash, daily totals and receivables without mutating inputs", () => {
  const cash = [
    { id: "CX-2", date: "2026-07-03", income: 0, expense: 30 },
    { id: "CX-1", date: "2026-07-01", income: 100, expense: 0 },
    { id: "CX-3", date: "2026-07-03", income: 40, expense: 5 },
  ];
  const orders = [
    { id: "PED-1", charged: 200, received: 50 },
    { id: "PED-2", charged: 80, received: 100 },
    { id: "PED-3", charged: 0, received: 0 },
  ];
  const cashOriginal = structuredClone(cash);
  const ordersOriginal = structuredClone(orders);

  const model = buildFinanceModel({ cash, orders });

  assert.deepEqual(model.summary, {
    income: 140,
    expense: 35,
    balance: 105,
    receivable: 150,
  });
  assert.deepEqual(model.rows.map((row) => row.id), ["CX-1", "CX-2", "CX-3"]);
  assert.deepEqual(model.dailySeries, [
    { date: "2026-07-01", income: 100, expense: 0, balance: 100 },
    { date: "2026-07-03", income: 40, expense: 35, balance: 5 },
  ]);
  assert.deepEqual(model.receivables, [
    { order: orders[0], amount: 150 },
    { order: orders[1], amount: 0 },
    { order: orders[2], amount: 0 },
  ]);
  assert.deepEqual(cash, cashOriginal);
  assert.deepEqual(orders, ordersOriginal);
});

test("buildFinanceModel preserves incomplete records without inventing values", () => {
  const cash = [{ id: "CX-unknown", date: "", income: null }];
  const orders = [{ id: "PED-unknown", charged: null }];

  const model = buildFinanceModel({ cash, orders });

  assert.deepEqual(model.summary, {
    income: null,
    expense: null,
    balance: null,
    receivable: null,
  });
  assert.deepEqual(model.rows, cash);
  assert.deepEqual(model.dailySeries, []);
  assert.deepEqual(model.receivables, [{ order: orders[0], amount: null }]);
});
