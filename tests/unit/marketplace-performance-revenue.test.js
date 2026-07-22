import assert from "node:assert/strict";
import test from "node:test";

import { marketplaceRevenueForPeriod } from "../../js/features/report-marketplace-data.js";

const period = { start: "2026-06-22T00:00:00.000Z", end: "2026-07-22T00:00:00.000Z" };

test("calcula receita sem depender das 100 listagens carregadas", () => {
  const sales = Array.from({ length: 101 }, (_, index) => ({
    marketplace: "Mercado Livre",
    external_order_id: `ML-${index}`,
    raw_payload: { status: "paid", date_created: "2026-07-10T12:00:00.000Z", total_amount: 10 },
  }));

  const revenue = marketplaceRevenueForPeriod(sales, period);

  assert.equal(revenue.value, 1010);
  assert.equal(revenue.coverage, "complete");
});

test("normaliza valores, status e data de pedidos Mercado Livre e Amazon", () => {
  const revenue = marketplaceRevenueForPeriod([
    { marketplace: "Mercado Livre", external_order_id: "ml-1", raw_payload: { status: "paid", date_closed: "2026-07-11T12:00:00.000Z", total_amount: 120 } },
    { marketplace: "Amazon", external_order_id: "amazon-1", raw_payload: { OrderStatus: "Shipped", PurchaseDate: "2026-07-12T12:00:00.000Z", OrderTotal: { Amount: "80.50" } } },
    { marketplace: "Canal interno", external_order_id: "native-1", total_amount: 30, order_date: "2026-07-13T12:00:00.000Z", status: "confirmed" },
  ], period);

  assert.equal(revenue.value, 230.5);
  assert.equal(revenue.coverage, "complete");
});

test("inclui pedidos Amazon ativos ainda nao enviados ou parcialmente enviados", () => {
  const revenue = marketplaceRevenueForPeriod([
    { marketplace: "Amazon", external_order_id: "amazon-unshipped", raw_payload: { OrderStatus: "Unshipped", PurchaseDate: "2026-07-12T12:00:00.000Z", OrderTotal: { Amount: "35" } } },
    { marketplace: "Amazon", external_order_id: "amazon-partial", raw_payload: { OrderStatus: "pArTiAlLyShIpPeD", PurchaseDate: "2026-07-13T12:00:00.000Z", OrderTotal: { Amount: "45" } } },
  ], period);

  assert.equal(revenue.value, 80);
  assert.equal(revenue.coverage, "complete");
});

test("usa a data real do pedido e trata backfill sem data como parcial", () => {
  const revenue = marketplaceRevenueForPeriod([
    { marketplace: "Mercado Livre", created_at: "2026-07-21T12:00:00.000Z", raw_payload: { status: "paid", date_created: "2026-06-01T12:00:00.000Z", total_amount: 100 } },
    { marketplace: "Amazon", created_at: "2026-06-01T12:00:00.000Z", raw_payload: { OrderStatus: "Shipped", PurchaseDate: "2026-07-20T12:00:00.000Z", OrderTotal: { Amount: "40" } } },
    { marketplace: "Desconhecido", created_at: "2026-07-20T12:00:00.000Z", raw_payload: { status: "paid", total_amount: 70 } },
  ], period);

  assert.equal(revenue.value, 40);
  assert.equal(revenue.coverage, "partial");
});

test("marca receita como indisponivel quando nenhum pedido tem data real suportada", () => {
  const revenue = marketplaceRevenueForPeriod([
    { marketplace: "Mercado Livre", created_at: "2026-07-20T12:00:00.000Z", raw_payload: { status: "paid", total_amount: 70 } },
  ], period);

  assert.equal(revenue.value, null);
  assert.equal(revenue.coverage, "unavailable");
});

test("marca payload sem identificador externo como parcial em vez de deduplicar silenciosamente", () => {
  const revenue = marketplaceRevenueForPeriod([
    { marketplace: "Mercado Livre", external_order_id: "known", raw_payload: { status: "paid", date_created: "2026-07-10T12:00:00.000Z", total_amount: 20 } },
    { marketplace: "Canal sem contrato", raw_payload: { status: "paid", date_created: "2026-07-11T12:00:00.000Z", total_amount: 30 } },
  ], period);

  assert.equal(revenue.value, 50);
  assert.equal(revenue.coverage, "partial");
});
