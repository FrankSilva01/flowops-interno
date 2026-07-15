import test from "node:test";
import assert from "node:assert/strict";

import { marketplaceSalesForReport, reportMarketplaceRows } from "../../js/features/report-marketplace-data.js";

test("marketplace report deduplicates an external order and reads Mercado Livre total", () => {
  const sales = [
    { marketplace: "Mercado Livre", external_order_id: "2001", raw_payload: { total_amount: 120 } },
    { marketplace: "Mercado Livre", external_order_id: "2001", amount: 0 },
  ];

  const normalized = marketplaceSalesForReport(sales, []);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].report_amount, 120);
  assert.deepEqual(reportMarketplaceRows([], normalized), [{ label: "Mercado Livre", value: 120 }]);
});

test("marketplace report falls back to the linked order value", () => {
  const sales = [{ marketplace: "Mercado Livre", external_order_id: "2002", internal_order_id: "order-1" }];
  const orders = [{ id: "order-1", charged: 94.9, description: "Miniatura Kiki", status: "Entregue" }];

  const [normalized] = marketplaceSalesForReport(sales, orders);

  assert.equal(normalized.report_amount, 94.9);
  assert.equal(normalized.title, "Miniatura Kiki");
  assert.equal(normalized.status, "Entregue");
});

test("marketplace report recovers an imported order when its link is unavailable", () => {
  const orders = [{
    id: "order-2",
    marketplace: "Mercado Livre",
    marketplaceOrderCode: "2003",
    charged: 120,
    description: "Kiki",
    status: "A preparar",
  }];

  const normalized = marketplaceSalesForReport([], orders);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].external_order_id, "2003");
  assert.equal(normalized[0].report_amount, 120);
  assert.equal(normalized[0].report_source, "linked-order");
});

test("marketplace report ignores a manual order with an arbitrary marketplace code", () => {
  const orders = [{ id: "manual-1", source: "manual", marketplaceOrderCode: "32131232123", charged: 600 }];

  assert.deepEqual(marketplaceSalesForReport([], orders), []);
});

test("marketplace report recognizes a Mercado Livre order code even with legacy manual source", () => {
  const orders = [{ id: "legacy-1", source: "manual", marketplaceOrderCode: "2000017248423800", charged: 173.63 }];

  const [normalized] = marketplaceSalesForReport([], orders);

  assert.equal(normalized.marketplace, "Mercado Livre");
  assert.equal(normalized.report_amount, 173.63);
});
