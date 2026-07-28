import assert from "node:assert/strict";
import test from "node:test";
import { buildProductionPresentation } from "../../js/features/production-presentation.js";

const stages = [
  { key: "queued", label: "Em fila" },
  { key: "producing", label: "Imprimindo" },
  { key: "review", label: "Pós-processo" },
  { key: "ready", label: "Pronto" },
];

test("groups eligible orders by normalized stage and derives production counts", () => {
  const orders = [
    { id: "PED-1", productionStage: "Fatiado", deliveryDate: "2026-07-30" },
    { id: "PED-2", productionStage: "Imprimindo", deliveryDate: "2026-07-27" },
    { id: "PED-3", productionStage: "Pintando", deliveryDate: "2026-07-30" },
    { id: "PED-4", productionStage: "Pós-processo", deliveryDate: "2026-07-30" },
    { id: "PED-5", productionStage: "Pronto", deliveryDate: "2026-07-30" },
    { id: "PED-6", productionStage: "Pronto", quoteStage: "Pendente", deliveryDate: "2026-07-30" },
  ];
  const original = structuredClone(orders);

  const model = buildProductionPresentation(orders, {
    stages,
    now: new Date("2026-07-28T12:00:00Z"),
  });

  assert.deepEqual(model.summary, {
    total: 5,
    queued: 1,
    producing: 2,
    review: 1,
    ready: 1,
    late: 1,
  });
  assert.equal(model.columns[0].key, "queued");
  assert.equal(model.columns[0].orders[0].id, "PED-1");
  assert.equal(model.columns[0].orders[0].order, orders[0]);
  assert.equal(model.columns[1].orders[0].isLate, true);
  assert.deepEqual(orders, original);
});

test("uses explicit production labels for incomplete orders", () => {
  const order = { id: "PED-7", productionStage: "Em fila" };
  const item = buildProductionPresentation([order], {
    stages: ["Em fila"],
    now: new Date("2026-07-28T12:00:00Z"),
  }).columns[0].orders[0];

  assert.equal(item.order, order);
  assert.equal(item.orderCode, "PED-7");
  assert.equal(item.clientLabel, "Sem cliente");
  assert.equal(item.descriptionLabel, "Sem descricao");
  assert.equal(item.deliveryLabel, "Sem previsao");
  assert.equal(item.responsibleLabel, "Sem responsavel");
});
