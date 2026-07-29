import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
};
globalThis.window = { SUPABASE_CONFIG: {}, location: { hash: "" } };

const { buildFinanceNextModel, formatFinanceAmount, paginateCashRows } = await import("../../js/features/cash.js");

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

test("paginateCashRows limits the ledger and clamps invalid pages", () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({ id: `CX-${index + 1}` }));
  assert.deepEqual(paginateCashRows(rows, 2, 10), {
    rows: rows.slice(10, 20),
    page: 2,
    pageCount: 3,
    total: 23,
  });
  assert.equal(paginateCashRows(rows, 99, 10).page, 3);
});

test("finance markup preserves accessible tabs, pagination and edit permission hook", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const markup = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const router = fs.readFileSync(path.join(root, "js/core/router.js"), "utf8");
  const permissions = fs.readFileSync(path.join(root, "js/core/permissions.js"), "utf8");

  assert.match(markup, /id="financeOverviewTab"[^>]+aria-controls="financeOverviewPane"/);
  assert.match(markup, /id="financeOverviewPane"[^>]+aria-labelledby="financeOverviewTab"/);
  assert.match(markup, /id="cashPagination"/);
  assert.match(router, /handleFinanceTabKeydown/);
  assert.match(permissions, /newCashEntryBtn/);
});
