import assert from "node:assert/strict";
import test from "node:test";
import { buildLogisticsPresentation } from "../../js/features/logistics-presentation.js";

test("derives logistics counts, explicit empty labels and prioritized actions", () => {
  const orders = [
    { id: "PED-1", orderCode: "FO-001", status: "A preparar" },
    { id: "PED-2", orderCode: "FO-002", status: "A preparar" },
    { id: "PED-3", orderCode: "FO-003", status: "A preparar" },
    { id: "PED-4", orderCode: "FO-004", status: "A preparar" },
    { id: "PED-5", orderCode: "FO-005", status: "Entregue" },
    { id: "PED-6", orderCode: "FO-006", status: "Orcamento" },
  ];
  const rows = [
    { order_id: "PED-1", status: "Aguardando envio", carrier: "Correios" },
    { order_id: "PED-2", status: "Postado", estimated_delivery_date: "2026-07-27" },
    { order_id: "PED-3", status: "Em trânsito", tracking_code: "BR123" },
    { order_id: "PED-4", status: "Problema na entrega", tracking_code: "BR456" },
    { order_id: "PED-5", status: "Entregue", tracking_code: "BR789" },
  ];
  const events = [{ order_id: "PED-4", status: "Problema na entrega", message: "Endereco incompleto" }];
  const ordersOriginal = structuredClone(orders);
  const rowsOriginal = structuredClone(rows);
  const eventsOriginal = structuredClone(events);
  const options = {
    events,
    now: new Date("2026-07-28T12:00:00Z"),
  };
  const optionsOriginal = structuredClone(options);

  const model = buildLogisticsPresentation(orders, rows, options);

  assert.deepEqual(model.summary, {
    total: 5,
    waiting: 1,
    moving: 2,
    late: 1,
    problem: 1,
    delivered: 1,
  });
  assert.equal(model.items[0].orderId, "PED-2");
  assert.equal(model.items[0].nextAction.label, "Verificar atraso");
  assert.equal(model.items.find((item) => item.orderId === "PED-2").trackingLabel, "Sem codigo");
  assert.equal(model.items.find((item) => item.orderId === "PED-4").eventCount, 1);
  assert.equal(model.items.find((item) => item.orderId === "PED-5").statusLabel, "Entregue");
  assert.deepEqual(orders, ordersOriginal);
  assert.deepEqual(rows, rowsOriginal);
  assert.deepEqual(events, eventsOriginal);
  assert.deepEqual(options, optionsOriginal);
});

test("uses explicit logistics labels and marketplace action for missing tracking", () => {
  const order = { id: "PED-7", marketplaceOrderCode: "ML-7" };
  const item = buildLogisticsPresentation([order], [], {
    now: "2026-07-28",
  }).items[0];

  assert.equal(item.order, order);
  assert.equal(item.statusLabel, "Sem rastreio");
  assert.equal(item.trackingLabel, "Sem codigo");
  assert.equal(item.carrierLabel, "Mercado Livre vinculado");
  assert.equal(item.estimatedDeliveryLabel, "Sem previsao");
  assert.equal(item.nextAction.label, "Buscar rastreio ML");
});

test("requires a valid caller-provided logistics date and uses local-date rollover", () => {
  assert.throws(
    () => buildLogisticsPresentation([], [], {}),
    /valid.*date|now/i,
  );
  assert.throws(
    () => buildLogisticsPresentation([], [], { now: "not-a-date" }),
    /valid.*date|now/i,
  );

  const item = buildLogisticsPresentation([
    { id: "PED-LOCAL" },
  ], [{
    order_id: "PED-LOCAL",
    status: "Postado",
    tracking_code: "BR-LOCAL",
    estimated_delivery_date: "2026-07-28",
  }], {
    now: new Date("2026-07-29T02:00:00Z"),
  }).items[0];

  assert.equal(item.isLate, false);
});
