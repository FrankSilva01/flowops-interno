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
  const options = {
    stages,
    now: new Date("2026-07-28T12:00:00Z"),
  };
  const optionsOriginal = structuredClone(options);

  const model = buildProductionPresentation(orders, options);

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
  assert.deepEqual(stages, optionsOriginal.stages);
  assert.deepEqual(options, optionsOriginal);
});

test("excludes approved quotes until they are converted into orders", () => {
  const orders = [
    { id: "PED-APPROVED", productionStage: "Pronto", quoteStage: "Aprovado" },
    { id: "PED-CONVERTED", productionStage: "Pronto", quoteStage: "Convertido em encomenda" },
  ];

  const model = buildProductionPresentation(orders, {
    stages: ["Pronto"],
    now: "2026-07-28",
  });

  assert.deepEqual(model.columns[0].orders.map((item) => item.id), ["PED-CONVERTED"]);
});

test("requires a valid caller-provided production date and uses local-date rollover", () => {
  assert.throws(
    () => buildProductionPresentation([], { stages: ["Pronto"] }),
    /valid.*date|now/i,
  );
  assert.throws(
    () => buildProductionPresentation([], { stages: ["Pronto"], now: new Date("invalid") }),
    /valid.*date|now/i,
  );

  const item = buildProductionPresentation([
    { id: "PED-LOCAL", productionStage: "Pronto", deliveryDate: "2026-07-28" },
  ], {
    stages: ["Pronto"],
    now: new Date(2026, 6, 28, 23, 0, 0),
  }).columns[0].orders[0];

  assert.equal(item.isLate, false);
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
