import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMarketplacePerformanceSnapshot,
  selectPerformancePriorities,
} from "../../js/features/marketplace-performance-model.js";

const makeEntry = (kind, analytics = {}, profitability = { marginPct: 25, netProfit: 10 }) => ({
  listing: {
    marketplace: "mercado-livre",
    external_id: `MLB-${kind}`,
    title: `Produto ${kind}`,
  },
  analytics,
  profitability,
  salesRevenue: 0,
});

test("deriva indicadores sem transformar dados ausentes em zero", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    {
      listing: { marketplace: "mercado-livre", external_id: "MLB1", title: "Produto A" },
      analytics: { visits_30d: 100, questions_30d: 5, sales_30d: 4, conversion_rate: 4, health_score: 80 },
      profitability: { marginPct: 30, netProfit: 20 },
      salesRevenue: 200,
    },
    {
      listing: { marketplace: "mercado-livre", external_id: "MLB2", title: "Produto B" },
      analytics: null,
      profitability: null,
      salesRevenue: 0,
    },
  ]);

  assert.deepEqual(snapshot.indicators, {
    revenue: 200,
    conversion: 4,
    averageMargin: 30,
    health: 80,
  });
  assert.deepEqual(snapshot.totals, { visits: 100, questions: 5, sales: 4 });
});

test("mantem indicador indisponivel quando nenhuma linha possui o dado", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([], {});

  assert.equal(snapshot.indicators.revenue, 0);
  assert.equal(snapshot.indicators.conversion, null);
  assert.equal(snapshot.indicators.averageMargin, null);
  assert.equal(snapshot.indicators.health, null);
  assert.equal(snapshot.defaultSection, "listings");
});

test("seleciona prioridades na ordem do plano e respeita o limite", () => {
  const entries = [
    makeEntry("intent", { visits_7d: 80, questions_30d: 5, sales_30d: 0, conversion_rate: 0, intent_score: 90 }),
    makeEntry("conversion", { visits_30d: 200, sales_30d: 1, conversion_rate: 0.5 }),
    makeEntry("risk", { health_score: 20, visits_30d: 10, sales_30d: 0 }),
    makeEntry("opportunity", { health_score: 90, visits_30d: 120, sales_30d: 10, conversion_rate: 8.3 }),
    makeEntry("cost", { visits_30d: 5 }, null),
  ];

  const priorities = selectPerformancePriorities(entries, 4);

  assert.deepEqual(priorities.map((item) => item.kind), ["intent", "conversion", "risk", "opportunity"]);
  assert.equal(priorities.length, 4);
  assert.deepEqual(Object.keys(priorities[0]).sort(), [
    "actionLabel", "externalId", "kind", "marketplace", "rank", "reason", "score", "severity", "title",
  ].sort());
});

test("usa profitability como seção padrão quando há cobertura financeira", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    makeEntry("covered", { visits_30d: 10 }, { marginPct: 12, netProfit: 2 }),
  ], { priorityLimit: 0 });

  assert.equal(snapshot.defaultSection, "profitability");
  assert.deepEqual(snapshot.priorities, []);
});

test("ordena empatadas de forma estável pelo título", () => {
  const entries = [
    makeEntry("zeta", { visits_30d: 200, sales_30d: 1, conversion_rate: 0.5 }),
    makeEntry("alpha", { visits_30d: 200, sales_30d: 1, conversion_rate: 0.5 }),
  ];

  assert.deepEqual(selectPerformancePriorities(entries, 2).map((item) => item.title), [
    "Produto alpha",
    "Produto zeta",
  ]);
});
