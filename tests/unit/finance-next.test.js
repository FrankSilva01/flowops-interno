import assert from "node:assert/strict";
import test from "node:test";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.window = { SUPABASE_CONFIG: {}, location: { hash: "" } };

const { buildFinanceNextModel, formatFinanceAmount } = await import("../../js/features/cash.js");

test("buildFinanceNextModel keeps only real positive receivables and preserves unknown totals", () => {
  const cash = [{ id: "CX-1", date: "2026-07-02", income: 100, expense: 20 }];
  const orders = [
    { id: "PED-1", charged: 200, received: 50 },
    { id: "PED-2", charged: 80, received: 80 },
    { id: "PED-3", charged: null, received: 0 },
  ];
  const cashOriginal = structuredClone(cash);
  const ordersOriginal = structuredClone(orders);

  const model = buildFinanceNextModel({ cash, orders });

  assert.deepEqual(model.summary, {
    income: 100,
    expense: 20,
    balance: 80,
    receivable: null,
  });
  assert.deepEqual(model.dailySeries, [
    { date: "2026-07-02", income: 100, expense: 20, balance: 80, complete: true },
  ]);
  assert.deepEqual(model.receivables, [{ order: orders[0], amount: 150 }]);
  assert.deepEqual(cash, cashOriginal);
  assert.deepEqual(orders, ordersOriginal);
});

test("formatFinanceAmount does not turn absent financial data into zero", () => {
  assert.equal(formatFinanceAmount(null), "Não informado");
  assert.equal(formatFinanceAmount(""), "Não informado");
  assert.match(formatFinanceAmount(0), /0,00/);
});
