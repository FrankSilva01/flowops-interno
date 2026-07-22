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
      analytics: { visits_30d: 100, questions_30d: 5, sales_30d: 4, conversion_rate: 4, health_score: 0.8 },
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
    health: 0.8,
  });
  assert.deepEqual(snapshot.totals, { visits: 100, questions: 5, sales: 4 });
});

test("mantem indicador indisponivel quando nenhuma linha possui o dado", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([], {});

  assert.equal(snapshot.indicators.revenue, null);
  assert.equal(snapshot.indicators.conversion, null);
  assert.equal(snapshot.indicators.averageMargin, null);
  assert.equal(snapshot.indicators.health, null);
  assert.deepEqual(snapshot.totals, { visits: null, questions: null, sales: null });
  assert.equal(snapshot.defaultSection, "listings");
});

test("mantem receita indisponivel sem cobertura de vendas utilizaveis", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: { visits_30d: 10 }, profitability: null, salesRevenue: null },
    { listing: {}, analytics: { visits_30d: 20 }, profitability: null, salesRevenue: null },
  ]);

  assert.equal(snapshot.indicators.revenue, null);
});

test("usa anuncios como secao inicial sem cobertura financeira", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: {}, profitability: null },
  ]);

  assert.equal(snapshot.defaultSection, "listings");
});

test("seleciona prioridades na ordem do plano e respeita o limite", () => {
  const entries = [
    { ...makeEntry("intent", { visits_30d: 80, sales_30d: 0, conversion_rate: 4, health_score: 0.8 }), intent: { score: 90 } },
    makeEntry("conversion", { visits_30d: 80, sales_30d: 1, conversion_rate: 0.5, health_score: 0.8 }),
    makeEntry("risk", { health_score: 0.2, visits_30d: 10, sales_30d: 0 }),
    makeEntry("opportunity", { health_score: 0.9, visits_30d: 100, sales_30d: 10, conversion_rate: 8.3 }),
    makeEntry("cost", { visits_30d: 5 }, { hasCost: false }),
  ];

  const priorities = selectPerformancePriorities(entries, 4, { portfolioAvgConversion: 4, maxVisits: 100 });

  assert.deepEqual(priorities.map((item) => item.kind), ["intent", "conversion", "risk", "opportunity"]);
  assert.equal(priorities.length, 4);
  assert.deepEqual(Object.keys(priorities[0]).sort(), [
    "actionLabel", "externalId", "kind", "marketplace", "rank", "reason", "score", "severity", "title",
  ].sort());
});

test("preserva metricas desconhecidas e soma apenas valores conhecidos", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: { visits_30d: 100, sales_30d: null }, profitability: null },
    { listing: {}, analytics: { visits_30d: null, questions_30d: 3, sales_30d: 2 }, profitability: null, salesRevenue: 50 },
  ]);

  assert.deepEqual(snapshot.totals, { visits: 100, questions: 3, sales: 2 });
  assert.equal(snapshot.indicators.conversion, null);
  assert.equal(snapshot.indicators.revenue, 50);
});

test("usa intent fornecido e exige vendas conhecidas para a prioridade de intencao", () => {
  const unknownSales = { ...makeEntry("unknown", { visits_30d: 10 }), intent: { score: 99 } };
  const zeroSales = { ...makeEntry("zero", { visits_30d: 10, sales_30d: 0 }), intent: { score: 99 } };

  assert.deepEqual(selectPerformancePriorities([unknownSales], 4), []);
  assert.equal(selectPerformancePriorities([zeroSales], 4)[0].kind, "intent");
});

test("calcula conversao apenas com anuncios que possuem visitas e vendas conhecidas", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: { visits_30d: 100, sales_30d: null }, profitability: null },
    { listing: {}, analytics: { visits_30d: null, sales_30d: 2 }, profitability: null },
    { listing: {}, analytics: { visits_30d: 50, sales_30d: 5 }, profitability: null },
  ]);

  assert.deepEqual(snapshot.totals, { visits: 150, questions: null, sales: 7 });
  assert.equal(snapshot.indicators.conversion, 10);
});

test("agrega a serie historica de visitas para o grafico executivo", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    { listing: {}, analytics: { raw_summary: { visits_series: [{ date: "2026-07-01", total: 4 }, { date: "2026-07-02", total: 7 }] } }, profitability: null },
    { listing: {}, analytics: { raw_summary: { visits_series: [{ date: "2026-07-01", total: 3 }, { date: "2026-07-03", total: 2 }] } }, profitability: null },
  ]);

  assert.deepEqual(snapshot.visitsSeries, [
    { date: "2026-07-01", value: 7 },
    { date: "2026-07-02", value: 7 },
    { date: "2026-07-03", value: 2 },
  ]);
});

test("classifica trafego e conversao relativamente ao portfolio", () => {
  const entries = [
    makeEntry("relative-conversion", { visits_30d: 50, sales_30d: 1, conversion_rate: 2 }),
    makeEntry("portfolio-reference", { visits_30d: 100, sales_30d: 10, conversion_rate: 10 }),
  ];

  const priorities = selectPerformancePriorities(entries, 4, { portfolioAvgConversion: 5, maxVisits: 100 });

  assert.equal(priorities[0].kind, "conversion");
});

test("mantem prioridades independentes por anuncio e consolida custo em lote", () => {
  const entries = [
    {
      ...makeEntry("multi", { visits_30d: 50, sales_30d: 0, conversion_rate: 5, health_score: 0.2 }),
      intent: { score: 90 },
    },
    makeEntry("no-cost-risk", { visits_30d: 10, health_score: 0.2 }, { hasCost: false }),
  ];

  const priorities = selectPerformancePriorities(entries, 10, { portfolioAvgConversion: 5, maxVisits: 100 });

  assert.deepEqual(priorities.map((item) => item.kind), ["intent", "risk", "risk", "cost"]);
  assert.equal(priorities.filter((item) => item.kind === "cost").length, 1);
  assert.equal(priorities.find((item) => item.kind === "cost").externalId, null);
});

test("normaliza health apenas pela semantica 0-1 e deduplica cobertura de custo", () => {
  const entries = [
    makeEntry("risk", { health_score: 0.49, visits_30d: 1 }),
    makeEntry("healthy", { health_score: 0.8, visits_30d: 100, sales_30d: 10, conversion_rate: 5 }),
    makeEntry("cost-a", { visits_30d: 10 }, { hasCost: false }),
    makeEntry("cost-b", { visits_30d: 20 }, null),
  ];

  const priorities = selectPerformancePriorities(entries, 4, { portfolioAvgConversion: 5, maxVisits: 100 });

  assert.deepEqual(priorities.map((item) => item.kind), ["risk", "opportunity", "cost"]);
  assert.equal(priorities.filter((item) => item.kind === "cost").length, 1);
  assert.equal(priorities.find((item) => item.kind === "cost").externalId, null);
  assert.equal(priorities.find((item) => item.kind === "cost").actionLabel, "Cadastrar custos em lote");
});

test("usa profitability como seção padrão quando há cobertura financeira", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    makeEntry("covered", { visits_30d: 10 }, { marginPct: 12, netProfit: 2 }),
  ], { priorityLimit: 0 });

  assert.equal(snapshot.defaultSection, "profitability");
  assert.deepEqual(snapshot.priorities, []);
});

test("mantem rentabilidade como secao inicial com cobertura financeira sem custo", () => {
  const snapshot = buildMarketplacePerformanceSnapshot([
    makeEntry("missing-cost", { visits_30d: 10 }, { hasCost: false }),
  ]);

  assert.equal(snapshot.defaultSection, "profitability");
});

test("ordena empatadas de forma estável pelo título", () => {
  const entries = [
    makeEntry("zeta", { visits_30d: 200, sales_30d: 1, conversion_rate: 0.5 }),
    makeEntry("alpha", { visits_30d: 200, sales_30d: 1, conversion_rate: 0.5 }),
  ];

  assert.deepEqual(selectPerformancePriorities(entries, 2, { portfolioAvgConversion: 1, maxVisits: 200 }).map((item) => item.title), [
    "Produto alpha",
    "Produto zeta",
  ]);
});
