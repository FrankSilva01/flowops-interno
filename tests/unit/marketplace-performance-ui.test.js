import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analytics = readFileSync(new URL("../../js/features/marketplace-analytics.js", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../js/features/marketplace.js", import.meta.url), "utf8");
const pricing = readFileSync(new URL("../../js/features/pricing.js", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");

test("consulta vendas de performance com recorte temporal e sem limite arbitrario", () => {
  assert.match(marketplace, /marketplacePerformanceSales/);
  assert.match(marketplace, /\.gte\("created_at", performanceSalesCutoff\)/);
  assert.match(marketplace, /\.range\(0, 999\)/);
  assert.match(marketplace, /marketplacePerformanceSalesCoverage/);
});

test("resumo executivo usa o grafico existente quando ha serie historica", () => {
  assert.match(analytics, /renderLineChart\("marketplacePerformanceVisitsChart"/);
  assert.match(analytics, /Sem s.rie hist.rica de visitas dispon.vel/);
});

test("abas preservam selecao, foco e navegacao por teclado", () => {
  assert.match(router, /data-performance-section/);
  assert.match(router, /moveMarketplacePerformanceSection/);
  assert.match(analytics, /\.focus\(\)/);
  assert.match(analytics, /button\.tabIndex = active \? 0 : -1/);
});

test("carregamento e falha preservam o ultimo painel e a rentabilidade", () => {
  assert.match(analytics, /state\.analyticsSyncing = true;[\s\S]*renderMarketplaceAnalyticsPanel\(\)/);
  assert.match(analytics, /catch \(error\) \{[\s\S]*flashActionMessage\(`N.o foi poss.vel atualizar as m.tricas/);
  assert.doesNotMatch(pricing, /state\.marketplacePerformanceSection = "listings"/);
});

test("estados desconectado e sem custo continuam disponiveis sem autenticacao", () => {
  assert.match(analytics, /renderExecutiveEmptyState/);
  assert.match(pricing, /renderIntelligenceEmptyState\(coverage\)/);
  assert.match(pricing, /marketplacePerformanceProfitabilityPanel/);
});
