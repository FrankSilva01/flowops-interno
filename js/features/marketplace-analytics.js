// Inteligencia Comercial - centro de comando do marketplace.
// Estende pricing.js (rentabilidade/margem) com dados reais do Mercado Livre
// vindos da rota "analytics-full" da Edge Function marketplace-sync:
// visitas, conversao, competitividade de preco, posicao de busca, saude do
// anuncio, frete e reputacao do vendedor. Modulo separado pra nao inflar
// pricing.js, que ja cobre custo/margem/sugestoes de cadastro em lote.
import { state, money } from "../core/state.js";
import { supabaseFunctionUrl } from "../core/config.js";
import { byId, html, safeUrl, formatDateTime, flashActionMessage } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { renderLineChart } from "../core/charts.js";
import { marketplaceRequest } from "./marketplace.js";
import { PERFORMANCE_SECTIONS, performanceSectionForKey } from "./marketplace-navigation.js";
import { buildMarketplacePerformanceSnapshot } from "./marketplace-performance-model.js";
import { marketplaceRevenueForPeriod } from "./report-marketplace-data.js";
import {
  hasCommercialIntelligenceAccess, getListingProfitability, getFinancialSettings,
  computeMarginBreakdown, openPriceCalculatorForListing, renderCommercialIntelligence,
  getProductForListing, getProductAssetInfo,
} from "./pricing.js";

const ANALYTICS_URL = `${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=analytics-full`;
const INTENT_SCORE_URL = `${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=intent-score`;
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

function analyticsKey(marketplace, externalId) {
  return `${marketplace}:${externalId}`;
}

export function getListingAnalytics(marketplace, externalId) {
  return state.listingAnalytics[analyticsKey(marketplace, externalId)] || null;
}

// Le so a leitura mais recente por anuncio (nao a historia toda) - pega as
// ultimas N linhas por synced_at e fica so com a primeira ocorrencia de
// cada anuncio (que ja vem em ordem decrescente).
export async function loadListingAnalytics() {
  if (!state.supabase || !state.organizationId) return;
  const { data, error } = await state.supabase
    .from("listing_analytics")
    .select("*")
    .eq("organization_id", state.organizationId)
    .order("synced_at", { ascending: false })
    .limit(300);
  if (error) return;
  const latestByListing = {};
  for (const row of data || []) {
    const key = analyticsKey(row.marketplace, row.external_id);
    if (!latestByListing[key]) latestByListing[key] = row;
  }
  state.listingAnalytics = latestByListing;
  const mostRecent = (data || [])[0];
  state.analyticsSyncedAt = mostRecent ? mostRecent.synced_at : null;
}

export async function loadSellerMetrics() {
  if (!state.supabase || !state.organizationId) return;
  const { data, error } = await state.supabase
    .from("seller_metrics")
    .select("*")
    .eq("organization_id", state.organizationId)
    .eq("marketplace", "Mercado Livre")
    .maybeSingle();
  state.sellerMetrics = error ? null : data || null;
}

// Mesmo padrao de loadListingAnalytics: so a leitura mais recente por
// anuncio (state.listingFeeSync), usada por resolveListingFeeInfo em
// pricing.js pra priorizar a taxa real sobre a estimativa por tabela.
export async function loadListingFeeSync() {
  if (!state.supabase || !state.organizationId) return;
  const { data, error } = await state.supabase
    .from("listing_fee_sync")
    .select("*")
    .eq("organization_id", state.organizationId)
    .order("synced_at", { ascending: false })
    .limit(300);
  if (error) return;
  const latestByListing = {};
  for (const row of data || []) {
    const key = analyticsKey(row.marketplace, row.external_id);
    if (!latestByListing[key]) latestByListing[key] = row;
  }
  state.listingFeeSync = latestByListing;
}

const FEE_CALCULATOR_URL = `${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=fee-calculator-full`;

export async function syncFeeCalculatorFull(force = false) {
  if (!ensureCanEdit()) return;
  if (state.feeSyncing) return;
  state.feeSyncing = true;
  renderMarketplaceAnalyticsPanel();
  try {
    const url = force ? `${FEE_CALCULATOR_URL}&force=true` : FEE_CALCULATOR_URL;
    const result = await marketplaceRequest(url);
    await loadListingFeeSync();
    const failed = (result.listings || []).filter((item) => !item.ok).length;
    flashActionMessage(failed
      ? `Taxas atualizadas com ${failed} erro(s) - veja Logs API para detalhes.`
      : "Taxas reais do Mercado Livre atualizadas.");
  } catch (error) {
    flashActionMessage(`Não foi possível atualizar as taxas: ${error.message}`);
  } finally {
    state.feeSyncing = false;
    renderMarketplaceAnalyticsPanel();
    if (byId("intelligenceAnalysisSection")) renderCommercialIntelligence();
  }
}

export async function syncAnalyticsFull(force = false) {
  if (!ensureCanEdit()) return;
  if (state.analyticsSyncing) return;
  state.analyticsSyncing = true;
  renderMarketplaceAnalyticsPanel();
  try {
    const url = force ? `${ANALYTICS_URL}&force=true` : ANALYTICS_URL;
    const result = await marketplaceRequest(url);
    // Perguntas recentes (pro score de intencao de compra) sincronizam
    // junto do resto das metricas, no mesmo botao - o usuario nao precisa
    // saber que sao rotas separadas na Edge Function.
    const intentResult = await marketplaceRequest(force ? `${INTENT_SCORE_URL}&force=true` : INTENT_SCORE_URL).catch((error) => ({ listings: [], error }));
    await Promise.all([loadListingAnalytics(), loadSellerMetrics()]);
    const failed = (result.listings || []).filter((item) => !item.ok).length
      + (intentResult.listings || []).filter((item) => !item.ok).length;
    flashActionMessage(failed
      ? `Métricas atualizadas com ${failed} erro(s) - veja Logs API para detalhes.`
      : "Métricas do Mercado Livre atualizadas.");
  } catch (error) {
    flashActionMessage(`Não foi possível atualizar as métricas: ${error.message}`);
  } finally {
    state.analyticsSyncing = false;
    renderMarketplaceAnalyticsPanel();
    renderMarketplaceCommandWidget();
  }
}

// --- Score composto (usado na tabela consolidada e no ranking "Onde investir") ---
// Pesos e formula sao fixos e documentados aqui - o tooltip no front mostra
// os mesmos fatores, nada de "caixa preta".
const SCORE_WEIGHTS = { conversion: 0.25, margin: 0.25, visits: 0.2, competitiveness: 0.15, trend: 0.15 };

function competitivenessScore(value) {
  if (value === "below") return 100;
  if (value === "average") return 70;
  if (value === "above") return 40;
  return 50;
}

function trendScore(value) {
  if (value === "up") return 100;
  if (value === "down") return 20;
  if (value === "stable") return 60;
  return 50;
}

export function computePortfolioAvgConversion() {
  const rates = Object.values(state.listingAnalytics)
    .map((row) => row.conversion_rate)
    .filter((value) => value != null);
  if (!rates.length) return null;
  return rates.reduce((sum, value) => sum + value, 0) / rates.length;
}

function maxVisitsInPortfolio() {
  const visits = Object.values(state.listingAnalytics).map((row) => Number(row.visits || 0));
  return Math.max(...visits, 1);
}

export function computeCompositeScore(listing, analytics, profitability) {
  if (!analytics) return null;
  const conversionSub = analytics.conversion_rate != null ? Math.min(analytics.conversion_rate, 10) / 10 * 100 : 50;
  const marginSub = profitability.hasCost ? Math.max(0, Math.min(100, profitability.marginPct + 50)) : 50;
  const visitsSub = Math.min(Number(analytics.visits || 0) / maxVisitsInPortfolio(), 1) * 100;
  const competitivenessSub = competitivenessScore(analytics.price_competitiveness);
  const trendSub = trendScore(analytics.category_trend);
  const score = conversionSub * SCORE_WEIGHTS.conversion
    + marginSub * SCORE_WEIGHTS.margin
    + visitsSub * SCORE_WEIGHTS.visits
    + competitivenessSub * SCORE_WEIGHTS.competitiveness
    + trendSub * SCORE_WEIGHTS.trend;
  return {
    score: Math.round(score),
    factors: [
      ["Conversão", conversionSub, SCORE_WEIGHTS.conversion],
      ["Margem", marginSub, SCORE_WEIGHTS.margin],
      ["Visitas (normalizado)", visitsSub, SCORE_WEIGHTS.visits],
      ["Competitividade de preço", competitivenessSub, SCORE_WEIGHTS.competitiveness],
      ["Tendência da categoria", trendSub, SCORE_WEIGHTS.trend],
    ],
  };
}

// --- Score de Intencao de Compra (Bloco 2) ---
// Diferente do score composto acima (que mistura margem + demanda pra
// responder "onde vale investir"), esse mede so o interesse/demanda no
// anuncio nos ultimos dias - deliberadamente sem margem. Os 2 convivem
// lado a lado: um responde "isso e lucrativo?", o outro "isso esta
// interessando?". Formula e escalas fixas e documentadas aqui (sem
// "caixa preta"), iguais as descritas na tela.
const INTENT_SCALE = { sales30d: 10, questions30d: 5, visits7d: 100, conversionPct: 3 };

export const INTENT_LEVELS = {
  "very-high": { key: "very-high", label: "Muito alta", emoji: "🔥", className: "done", advice: "Grande chance de vender. Considere aumentar estoque." },
  high: { key: "high", label: "Alta", emoji: "🟢", className: "done", advice: "Interesse crescente. Anúncio bem posicionado." },
  medium: { key: "medium", label: "Média", emoji: "🟡", className: "queue", advice: "Algum interesse. Revise fotos e título." },
  low: { key: "low", label: "Baixa", emoji: "🔴", className: "danger-badge", advice: "Pouco interesse. Considere ajustar preço ou pausar." },
};

function intentLevelFor(score) {
  if (score >= 80) return INTENT_LEVELS["very-high"];
  if (score >= 60) return INTENT_LEVELS.high;
  if (score >= 40) return INTENT_LEVELS.medium;
  return INTENT_LEVELS.low;
}

// A serie diaria de visitas (raw_summary.visits_series, ja capturada pelo
// analytics-full de 30 dias) e a unica fonte pra "ultimos 7 dias" - nao faz
// uma chamada nova so pra isso.
function visitsLast7Days(series) {
  if (!Array.isArray(series) || !series.length) return { current: 0, previous: 0 };
  const sorted = [...series].sort((a, b) => new Date(a.date) - new Date(b.date));
  const totals = sorted.map((day) => Number(day.total || 0));
  const current = totals.slice(-7).reduce((sum, value) => sum + value, 0);
  const previous = totals.slice(-14, -7).reduce((sum, value) => sum + value, 0);
  return { current, previous };
}

export function computeIntentScore(analytics) {
  if (!analytics) return null;
  const salesScore = Math.min(Number(analytics.sold_quantity || 0), INTENT_SCALE.sales30d) / INTENT_SCALE.sales30d * 40;
  const questionsScore = Math.min(Number(analytics.questions_total || 0), INTENT_SCALE.questions30d) / INTENT_SCALE.questions30d * 20;
  const { current, previous } = visitsLast7Days(analytics.raw_summary?.visits_series);
  const visitsScore = Math.min(current, INTENT_SCALE.visits7d) / INTENT_SCALE.visits7d * 15;
  const growth = current > previous ? "up" : current < previous ? "down" : "stable";
  const growthScore = growth === "up" ? 10 : growth === "down" ? 0 : 5;
  const conversion = Number(analytics.conversion_rate || 0);
  const conversionScore = Math.min(conversion, INTENT_SCALE.conversionPct) / INTENT_SCALE.conversionPct * 15;
  const score = Math.round(salesScore + questionsScore + visitsScore + growthScore + conversionScore);
  return {
    score,
    level: intentLevelFor(score),
    visits7d: current,
    visitsGrowth: growth,
    questions: Number(analytics.questions_total || 0),
    questionsUnanswered: Number(analytics.questions_unanswered || 0),
    sales30d: Number(analytics.sold_quantity || 0),
    conversion,
    factors: [
      ["Vendas recentes (30d)", salesScore, 40],
      ["Perguntas recentes", questionsScore, 20],
      ["Visitas (7d)", visitsScore, 15],
      ["Crescimento de visitas", growthScore, 10],
      ["Conversão", conversionScore, 15],
    ],
  };
}

function buildMarketplacePerformanceEntries() {
  return state.marketplaceListings.map((listing) => {
    const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
    return {
      listing,
      analytics,
      intent: computeIntentScore(analytics),
      profitability: getListingProfitability(listing),
    };
  });
}

function performanceRevenue() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const revenue = marketplaceRevenueForPeriod(state.marketplacePerformanceSales, { start, end }, state.data.orders);
  if (state.marketplacePerformanceSalesCoverage === "unavailable") return { value: null, coverage: "unavailable" };
  return {
    ...revenue,
    coverage: revenue.coverage === "complete" ? state.marketplacePerformanceSalesCoverage : revenue.coverage,
  };
}

function unavailable(value, formatter) {
  return value == null ? "Não disponível" : formatter(value);
}

function renderExecutiveEmptyState() {
  const message = "Sincronize as métricas para ver os indicadores executivos.";
  const indicators = byId("marketplacePerformanceIndicators");
  const flow = byId("marketplacePerformanceFlow");
  const priorities = byId("marketplacePerformancePriorities");
  if (indicators) indicators.innerHTML = `<div class="empty-chart">${message}</div>`;
  if (flow) flow.innerHTML = `<div class="empty-chart">${message}</div>`;
  if (priorities) priorities.innerHTML = `<div class="empty-chart">${message}</div>`;
}

function clearMarketplacePerformanceExecutive() {
  ["marketplacePerformanceIndicators", "marketplacePerformanceFlow", "marketplacePerformancePriorities"].forEach((id) => {
    const target = byId(id);
    if (target) target.innerHTML = "";
  });
}

function setMarketplacePerformanceVisibility(visible) {
  document.querySelectorAll([
    ".marketplace-performance-head",
    "#marketplacePerformanceIndicators",
    ".marketplace-performance-overview",
    ".marketplace-performance-detail-tabs",
    "#intelligenceAnalysisSection",
  ].join(",")).forEach((element) => {
    element.hidden = !visible;
  });
}

export function renderMarketplacePerformanceExecutive(snapshot) {
  if (!snapshot) {
    renderExecutiveEmptyState();
    return;
  }

  const hasExecutiveData = Object.values(snapshot.totals).some((value) => value != null)
    || snapshot.indicators.averageMargin != null
    || snapshot.indicators.health != null
    || snapshot.indicators.revenue > 0;
  if (!hasExecutiveData) {
    renderExecutiveEmptyState();
    return;
  }

  const indicators = byId("marketplacePerformanceIndicators");
  const flow = byId("marketplacePerformanceFlow");
  const priorities = byId("marketplacePerformancePriorities");
  const indicatorRows = [
    ["Receita das vendas", unavailable(snapshot.indicators.revenue, (value) => money.format(value)), snapshot.revenueCoverage === "partial" ? "Parcial: há pedidos sem dados compatíveis ou acima do limite carregado" : snapshot.revenueCoverage === "unavailable" ? "Indisponível: faltam data real ou dados de venda compatíveis" : "Vendas confirmadas nos últimos 30 dias"],
    ["Conversão", unavailable(snapshot.indicators.conversion, (value) => percent.format(value / 100)), "Vendas sobre visitas em 30 dias"],
    ["Margem média", unavailable(snapshot.indicators.averageMargin, (value) => percent.format(value / 100)), "Anúncios com custos cadastrados"],
    ["Saúde dos anúncios", unavailable(snapshot.indicators.health, (value) => percent.format(value)), "Média informada pelo marketplace"],
  ];

  if (indicators) {
    indicators.innerHTML = indicatorRows.map(([label, value, detail]) => `
      <article class="marketplace-performance-indicator">
        <span>${html(label)}</span>
        <strong>${html(value)}</strong>
        <small>${html(detail)}</small>
      </article>
    `).join("");
  }

  if (flow) {
    const formatTotal = (value) => value == null ? "Não disponível" : Number(value).toLocaleString("pt-BR");
    flow.innerHTML = `
      <div class="marketplace-performance-flow-head"><strong>Fluxo de performance</strong><small>Totais conhecidos dos últimos 30 dias</small></div>
      <div class="marketplace-performance-flow-stages">
        <div><span>Visitas</span><strong>${html(formatTotal(snapshot.totals.visits))}</strong></div>
        <i class="ti ti-arrow-right" aria-hidden="true"></i>
        <div><span>Perguntas</span><strong>${html(formatTotal(snapshot.totals.questions))}</strong></div>
        <i class="ti ti-arrow-right" aria-hidden="true"></i>
        <div><span>Vendas</span><strong>${html(formatTotal(snapshot.totals.sales))}</strong></div>
      </div>
      <div id="marketplacePerformanceVisitsChart" class="marketplace-performance-visits-chart"></div>
    `;
    if (snapshot.visitsSeries.length) {
      renderLineChart("marketplacePerformanceVisitsChart", snapshot.visitsSeries.map((point) => ({
        label: point.date.slice(5),
        value: point.value,
      })), { format: (value) => `${value} visita${value === 1 ? "" : "s"}`, valueLabel: "Visitas por dia" });
    } else {
      byId("marketplacePerformanceVisitsChart").innerHTML = `<div class="empty-chart">Sem série histórica de visitas disponível.</div>`;
    }
  }

  if (priorities) {
    priorities.innerHTML = snapshot.priorities.length ? `
      <div class="marketplace-performance-priorities-head"><strong>Prioridades de hoje</strong><small>Ações ordenadas por impacto operacional</small></div>
      <div class="stack-list">${snapshot.priorities.map((priority) => {
        const action = priority.kind === "cost"
          ? `<button class="secondary-btn" type="button" data-action="open-bulk-cost-dialog">${html(priority.actionLabel)}</button>`
          : `<button class="secondary-btn" type="button" data-action="open-listing-drawer" data-marketplace="${html(priority.marketplace)}" data-external-id="${html(priority.externalId)}">${html(priority.actionLabel)}</button>`;
        return `<div class="list-row marketplace-performance-priority ${html(priority.severity)}">
          <div><strong>${html(priority.title)}</strong><span>${html(priority.reason)}</span></div>
          ${action}
        </div>`;
      }).join("")}</div>
    ` : `<div class="empty-chart">Nenhuma prioridade crítica com os dados disponíveis.</div>`;
  }
  bindActions();
}

export function setMarketplacePerformanceSection(section) {
  const allowed = PERFORMANCE_SECTIONS.includes(section) ? section : "listings";
  state.marketplacePerformanceSection = allowed;
  document.querySelectorAll("[data-performance-section]").forEach((button) => {
    const active = button.dataset.performanceSection === allowed;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-performance-section-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.performanceSectionPanel !== allowed;
  });
}

export function moveMarketplacePerformanceSection(currentSection, key) {
  const nextSection = performanceSectionForKey(currentSection, key);
  if (!nextSection) return false;
  setMarketplacePerformanceSection(nextSection);
  document.querySelector(`[data-performance-section="${nextSection}"]`)?.focus();
  return true;
}

// --- Sugestao inteligente de preco: 4 cenarios contextualizados ---
// "Media da categoria" vem da API (concorrentes reais); "sua media de
// conversao" e sempre do PROPRIO portfolio do vendedor (a API do ML nao
// expoe taxa de conversao de concorrentes, entao nunca fingimos ter isso).
export function getPriceSuggestionScenario(listing, analytics, profitability, portfolioAvgConversion) {
  if (!profitability.hasCost || !analytics || analytics.price_position_avg == null) return null;
  const settings = getFinancialSettings();
  const healthyMargin = settings.profitability_thresholds.healthy;
  const price = Number(listing.price || 0);
  const categoryAvg = Number(analytics.price_position_avg);
  if (!(categoryAvg > 0) || !(price > 0)) return null;
  const diffPct = ((price - categoryAvg) / categoryAvg) * 100;
  const conversion = analytics.conversion_rate;

  const projectAt = (targetPrice) => computeMarginBreakdown({
    cost: profitability.cost, revenue: targetPrice, feePct: profitability.feePct, fixedFee: profitability.fixedFee,
    taxPct: profitability.taxPct, shipping: profitability.shipping, packaging: profitability.packaging,
  });

  if (conversion != null && portfolioAvgConversion && conversion >= portfolioAvgConversion * 1.5 && profitability.marginPct < healthyMargin) {
    const testPrice = price + 5;
    const projected = projectAt(testPrice);
    return {
      scenario: "alta-conversao-margem-baixa",
      text: `Seu anúncio converte ${conversion.toFixed(1)}% (excelente!), mas sua margem é só ${profitability.marginPct.toFixed(0)}%. Teste aumentar ${money.format(5)} — com essa conversão, a demanda provavelmente se mantém.`,
      impact: projected.netProfit - profitability.netProfit,
      suggestedPrice: testPrice,
    };
  }

  if (Math.abs(diffPct) <= 10 && conversion != null && portfolioAvgConversion != null && conversion < portfolioAvgConversion * 0.5) {
    return {
      scenario: "conversao-baixa",
      text: `Seu preço está na média (${money.format(price)} vs ${money.format(categoryAvg)} da categoria), mas sua conversão é ${conversion.toFixed(1)}% (sua média no portfólio: ${portfolioAvgConversion.toFixed(1)}%). O problema provavelmente não é preço — revise fotos, título e descrição.`,
      impact: null,
      suggestedPrice: null,
    };
  }

  if (diffPct < -5 && profitability.marginPct >= healthyMargin) {
    const targetPrice = Math.min(categoryAvg, price * 1.1);
    const projected = projectAt(targetPrice);
    return {
      scenario: "espaco-para-subir",
      text: `Você vende por ${money.format(price)} com ${profitability.marginPct.toFixed(0)}% de margem. O preço médio da categoria é ${money.format(categoryAvg)}. Você poderia vender por ${money.format(targetPrice)} mantendo um preço competitivo e aumentando seu lucro em ${money.format(Math.max(projected.netProfit - profitability.netProfit, 0))} por venda.`,
      impact: projected.netProfit - profitability.netProfit,
      suggestedPrice: targetPrice,
    };
  }

  if (diffPct > 10) {
    return {
      scenario: "acima-da-media",
      text: `Seu anúncio está acima da média do Mercado Livre. Preço médio na categoria: ${money.format(categoryAvg)}. Considere reduzir para ${money.format(categoryAvg)} para melhorar a conversão.`,
      impact: null,
      suggestedPrice: categoryAvg,
    };
  }

  return null;
}

function healthTone(score) {
  if (score == null) return { className: "neutral", label: "N/D" };
  if (score >= 0.8) return { className: "done", label: "Boa" };
  if (score >= 0.5) return { className: "queue", label: "Média" };
  return { className: "danger-badge", label: "Baixa" };
}

function vsAverageBadge(competitiveness) {
  if (competitiveness === "below") return `<span class="badge done"><i class="ti ti-arrow-narrow-down" aria-hidden="true"></i> abaixo</span>`;
  if (competitiveness === "above") return `<span class="badge danger-badge"><i class="ti ti-arrow-narrow-up" aria-hidden="true"></i> acima</span>`;
  if (competitiveness === "average") return `<span class="badge neutral">na média</span>`;
  return `<span class="badge neutral">N/D</span>`;
}

// --- Tabela consolidada de performance ---
export function renderPerformanceTable() {
  const target = byId("performanceTable");
  if (!target) return;
  const portfolioAvgConversion = computePortfolioAvgConversion();
  const sortBy = state.performanceTableSort;
  const healthFilter = state.performanceTableHealthFilter;

  let rows = state.marketplaceListings.map((listing) => {
    const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
    const profitability = getListingProfitability(listing);
    const composite = computeCompositeScore(listing, analytics, profitability);
    const suggestion = getPriceSuggestionScenario(listing, analytics, profitability, portfolioAvgConversion);
    return { listing, analytics, profitability, composite, suggestion };
  });

  if (healthFilter !== "all") {
    rows = rows.filter((row) => healthTone(row.analytics ? row.analytics.health_score : null).className === (
      healthFilter === "healthy" ? "done" : healthFilter === "attention" ? "queue" : healthFilter === "risk" ? "danger-badge" : "neutral"
    ));
  }

  const sorters = {
    score_desc: (a, b) => (b.composite ? b.composite.score : -1) - (a.composite ? a.composite.score : -1),
    conversion_desc: (a, b) => (b.analytics ? b.analytics.conversion_rate || 0 : -1) - (a.analytics ? a.analytics.conversion_rate || 0 : -1),
    visits_desc: (a, b) => (b.analytics ? b.analytics.visits || 0 : -1) - (a.analytics ? a.analytics.visits || 0 : -1),
  };
  rows.sort(sorters[sortBy] || sorters.score_desc);

  target.innerHTML = rows.length ? rows.map(({ listing, analytics, profitability, composite, suggestion }) => {
    const health = healthTone(analytics ? analytics.health_score : null);
    const scoreColor = composite ? (composite.score >= 70 ? "var(--green)" : composite.score >= 45 ? "var(--amber)" : "var(--red)") : "var(--muted)";
    const factorsTooltip = composite ? composite.factors.map(([label, value, weight]) => `${label}: ${value.toFixed(0)} × ${(weight * 100).toFixed(0)}%`).join(" | ") : "";
    return `
      <tr>
        <td><button class="link-cell" type="button" data-action="open-listing-drawer" data-marketplace="${html(listing.marketplace)}" data-external-id="${html(listing.external_id)}" title="${html(listing.title)}">${html(listing.title)}</button></td>
        <td>${money.format(Number(listing.price || 0))}</td>
        <td>${analytics ? vsAverageBadge(analytics.price_competitiveness) : `<span class="badge neutral">N/D</span>`}</td>
        <td>${analytics && analytics.visits != null ? Number(analytics.visits).toLocaleString("pt-BR") : "-"}</td>
        <td>${analytics && analytics.conversion_rate != null ? `${analytics.conversion_rate.toFixed(1)}%` : "-"}</td>
        <td>${analytics && analytics.sold_quantity != null ? Number(analytics.sold_quantity).toLocaleString("pt-BR") : "-"}</td>
        <td>${analytics && analytics.questions_total != null ? Number(analytics.questions_total).toLocaleString("pt-BR") : "-"}</td>
        <td><span class="badge ${health.className}">${html(health.label)}</span></td>
        <td><strong style="color:${scoreColor}" title="${html(factorsTooltip)}">${composite ? composite.score : "-"}</strong></td>
        <td>${suggestion
          ? `<button class="icon-btn performance-suggestion-btn" type="button" data-action="toggle-performance-suggestion" title="${html(suggestion.text)}">Ver sugestão</button>`
          : "-"}</td>
      </tr>
      ${suggestion ? `<tr class="performance-suggestion-row" hidden><td colspan="10">${html(suggestion.text)}${suggestion.impact ? ` <strong>(+${money.format(suggestion.impact)}/venda estimado)</strong>` : ""}</td></tr>` : ""}
    `;
  }).join("") : `<tr><td colspan="10">Nenhum anúncio sincronizado ainda.</td></tr>`;
  renderPerformanceTotals(rows);
  bindActions();
}

function renderPerformanceTotals(rows) {
  const target = byId("performanceTableTotals");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = "";
    return;
  }
  const withAnalytics = rows.filter((row) => row.analytics);
  const totalVisits = withAnalytics.reduce((sum, row) => sum + Number(row.analytics.visits || 0), 0);
  const totalSold = withAnalytics.reduce((sum, row) => sum + Number(row.analytics.sold_quantity || 0), 0);
  const totalQuestions = withAnalytics.reduce((sum, row) => sum + Number(row.analytics.questions_total || 0), 0);
  target.innerHTML = `
    <tr class="table-totals-row">
      <td>Total (${rows.length})</td>
      <td></td>
      <td></td>
      <td>${totalVisits.toLocaleString("pt-BR")}</td>
      <td></td>
      <td>${totalSold.toLocaleString("pt-BR")}</td>
      <td>${totalQuestions.toLocaleString("pt-BR")}</td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
  `;
}

export function bindPerformanceTableToggles() {
  byId("performanceTable")?.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="toggle-performance-suggestion"]');
    if (!button) return;
    const row = button.closest("tr");
    const detailRow = row?.nextElementSibling;
    if (detailRow?.classList.contains("performance-suggestion-row")) detailRow.hidden = !detailRow.hidden;
  });
}

// --- Ranking "Onde investir" ---
function investmentTier(score) {
  if (score >= 70) return { className: "done", label: "Investir", color: "var(--green)" };
  if (score >= 45) return { className: "queue", label: "Ajustar antes", color: "var(--amber)" };
  return { className: "danger-badge", label: "Não investir agora", color: "var(--red)" };
}

function getInvestmentActionTips(listing, analytics, profitability, composite, suggestion, portfolioAvgConversion) {
  const tips = [];
  if (suggestion?.text) tips.push(suggestion.text);
  if (!profitability.hasCost) {
    tips.push("Cadastre o custo do produto antes de decidir investimento pago.");
  } else if (profitability.marginPct < 15) {
    tips.push("Margem baixa: ajuste preco, custo ou frete antes de aumentar exposicao.");
  }
  if (!analytics) {
    tips.push("Atualize metricas do Mercado Livre para validar demanda real.");
  } else {
    const visits = Number(analytics.visits || 0);
    const conversion = Number(analytics.conversion_rate || 0);
    const questions = Number(analytics.questions_total || 0);
    const sold = Number(analytics.sold_quantity || 0);
    if (analytics.price_competitiveness === "above") tips.push("Preco acima da media: simule um preco mais competitivo antes de investir.");
    if (visits < 30) tips.push("Baixa exposicao: revise titulo, categoria e foto principal.");
    if (portfolioAvgConversion != null && conversion < portfolioAvgConversion * 0.7 && visits >= 30) {
      tips.push("Tem trafego, mas converte abaixo da media: melhorar fotos, descricao e proposta de valor.");
    }
    if (questions >= 3 && sold === 0) tips.push("Perguntas sem venda: transforme as duvidas em descricao e revise preco.");
    if (analytics.search_position && Number(analytics.search_position) > 30) tips.push("Posicao de busca baixa: revisar palavras do titulo e categoria.");
    if (analytics.shipping?.free_shipping && Number(analytics.shipping?.shipping_share_pct || 0) > 20) tips.push("Frete pesa no lucro: valide preco com frete antes de impulsionar.");
  }
  if (composite?.score >= 70 && profitability.hasCost && profitability.marginPct >= 20) {
    tips.push("Bom candidato: priorize estoque, foto principal e teste de exposicao.");
  }
  return [...new Set(tips)].slice(0, 3);
}

function renderInvestmentFocusCard(ranked) {
  if (!ranked.length) return "";
  const ready = ranked.find((row) => row.composite.score >= 70 && row.profitability.hasCost && row.profitability.marginPct >= 20);
  const missingCost = ranked.filter((row) => !row.profitability.hasCost).length;
  const weakMargin = ranked.filter((row) => row.profitability.hasCost && row.profitability.marginPct < 15).length;
  let title = "Foco recomendado";
  let message = "Atualize metricas e custos para separar oportunidade real de anuncio apenas ranqueado.";
  if (ready) {
    title = "Foque em escala controlada";
    message = `${ready.listing.title}: melhor combinacao de demanda e margem. Antes de investir mais, garanta estoque, foto principal forte e preco validado.`;
  } else if (weakMargin >= Math.max(1, ranked.length / 3)) {
    title = "Foque em margem antes de trafego";
    message = "Varios anuncios aparecem com demanda, mas margem baixa. Ajuste preco, custo ou frete antes de investir em exposicao.";
  } else if (missingCost >= Math.max(1, ranked.length / 3)) {
    title = "Foque em completar custos";
    message = "Ha oportunidades sem custo cadastrado. Sem custo real, o ranking pode superestimar o que vale investir.";
  } else {
    const top = ranked[0];
    message = `${top.listing.title}: revise os pontos sugeridos abaixo e teste melhoria antes de colocar verba.`;
  }
  return `<div class="intelligence-focus-card"><strong>${html(title)}</strong><span>${html(message)}</span></div>`;
}

function getIntentAction(intent, analytics, portfolioAvgConversion) {
  if (!intent || !analytics) return "Atualize metricas para medir intencao real.";
  if (intent.visits7d >= 50 && intent.questions >= 3 && intent.sales30d === 0) return "Muito interesse sem venda: revisar preco, fotos, descricao e respostas das perguntas.";
  if (intent.questionsUnanswered > 0) return "Responda perguntas pendentes e inclua essas duvidas na descricao do anuncio.";
  if (portfolioAvgConversion != null && intent.conversion >= portfolioAvgConversion * 1.5 && intent.conversion > 0) return "Boa conversao: aumentar exposicao e garantir estoque.";
  if (intent.visits7d === 0 && intent.sales30d === 0) return "Sem sinal recente: revisar titulo/categoria ou pausar ate ter nova estrategia.";
  if (intent.visitsGrowth === "up" && intent.conversion === 0) return "Visitas subindo sem conversao: ajustar foto principal e preco antes de investir.";
  if (intent.level.key === "very-high" || intent.level.key === "high") return "Sinal bom: priorize estoque, resposta rapida e teste de exposicao.";
  return intent.level.advice;
}

function renderIntentFocusCard(ranked, portfolioAvgConversion) {
  if (!ranked.length) return "";
  const noSalesWithDemand = ranked.find((row) => row.intent.visits7d >= 50 && row.intent.questions >= 3 && row.intent.sales30d === 0);
  const highConversion = ranked.find((row) => portfolioAvgConversion != null && row.intent.conversion >= portfolioAvgConversion * 1.5 && row.intent.conversion > 0);
  let title = "Foco dos sinais de compra";
  let message = "Use este bloco para decidir onde responder, melhorar o anuncio ou aumentar exposicao.";
  if (noSalesWithDemand) {
    title = "Corrigir gargalo de conversao";
    message = `${noSalesWithDemand.listing.title}: tem visitas e perguntas, mas nao vendeu. Priorize preco, foto principal e descricao.`;
  } else if (highConversion) {
    title = "Acelerar o que ja converte";
    message = `${highConversion.listing.title}: conversao acima da media. Vale priorizar estoque e exposicao.`;
  } else if (ranked[0].intent.visits7d === 0) {
    title = "Gerar demanda primeiro";
    message = "Os principais anuncios nao tiveram visitas recentes. Revise titulo, categoria e imagem antes de investir.";
  }
  return `<div class="intelligence-focus-card"><strong>${html(title)}</strong><span>${html(message)}</span></div>`;
}

function renderTrendFocusCard(keywords, highlightedListings) {
  const terms = [...keywords].slice(0, 3);
  let message = "Sincronize as metricas para cruzar termos de busca, destaques de categoria e desempenho real.";
  if (highlightedListings.length) {
    message = `${highlightedListings[0].title}: aparece como destaque da categoria. Priorize estoque, foto principal e preco desse item antes de testar novos produtos parecidos.`;
  } else if (terms.length) {
    message = `Teste foco em produtos/titulos ligados a: ${terms.join(", ")}. Use como direcao, nao como previsao de venda.`;
  }
  return `
    <div class="intelligence-focus-card trend-focus-card">
      <strong>Foco sugerido</strong>
      <span>${html(message)}</span>
      <small>Confiabilidade: media. O Mercado Livre retorna termos e destaques, mas nao volume, crescimento ou previsao de vendas.</small>
    </div>
  `;
}

// --- Tendencias e demanda ---
// Nao mostramos badge de "categoria em alta/queda": a API de trends do ML
// devolve so termos ranqueados, sem volume numerico, entao nao ha como
// calcular uma direcao (up/down) ou % de crescimento honestos. O que
// exibimos e real: os termos mais buscados nas categorias sincronizadas, e
// se o proprio anuncio aparece nos destaques da categoria (sinal genuino,
// vindo de /highlights).
export function renderCategoryTrendsPanel() {
  const target = byId("categoryTrendsContent");
  if (!target) return;
  const keywords = new Set();
  const highlightedListings = [];
  state.marketplaceListings.forEach((listing) => {
    const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
    (analytics?.raw_summary?.trend_keywords || []).forEach((word) => keywords.add(word));
    if (analytics?.raw_summary?.category_highlighted) highlightedListings.push(listing);
  });
  if (!keywords.size && !highlightedListings.length) {
    target.innerHTML = `<div class="empty-chart">Sincronize as métricas para ver tendências de demanda.</div>`;
    return;
  }
  target.innerHTML = `
    ${renderTrendFocusCard(keywords, highlightedListings)}
    ${keywords.size ? `
      <div class="drawer-section-title">Termos mais buscados nas suas categorias</div>
      <div class="trend-keyword-list">${[...keywords].slice(0, 20).map((word) => `<span class="badge neutral">${html(word)}</span>`).join("")}</div>
    ` : ""}
    ${highlightedListings.length ? `
      <div class="drawer-section-title">Destaques da categoria</div>
      <div class="stack-list">${highlightedListings.map((listing) => `
        <div class="list-row"><div><strong>${html(listing.title)}</strong><span>Está entre os destaques da categoria no Mercado Livre.</span></div></div>
      `).join("")}</div>
    ` : ""}
  `;
}

export function renderInvestmentRanking() {
  const target = byId("investmentRankingList");
  if (!target) return;
  const portfolioAvgConversion = computePortfolioAvgConversion();
  const ranked = state.marketplaceListings
    .map((listing) => {
      const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
      const profitability = getListingProfitability(listing);
      const composite = computeCompositeScore(listing, analytics, profitability);
      const suggestion = getPriceSuggestionScenario(listing, analytics, profitability, portfolioAvgConversion);
      return { listing, analytics, profitability, composite, suggestion };
    })
    .filter((row) => row.composite)
    .sort((a, b) => b.composite.score - a.composite.score)
    .slice(0, 10);

  target.innerHTML = ranked.length ? `
    ${renderInvestmentFocusCard(ranked)}
    ${ranked.map(({ listing, analytics, profitability, composite, suggestion }, index) => {
    const tier = investmentTier(composite.score);
    const factorsTooltip = composite.factors.map(([label, value, weight]) => `${label}: ${value.toFixed(0)} × ${(weight * 100).toFixed(0)}%`).join(" | ");
    const text = suggestion ? suggestion.text : `Score ${composite.score} de 100 - ${tier.label.toLowerCase()}.`;
    const tips = getInvestmentActionTips(listing, analytics, profitability, composite, suggestion, portfolioAvgConversion);
    return `
      <div class="list-row investment-ranking-row">
        <div>
          <span class="investment-ranking-position">#${index + 1}</span>
          <button class="link-cell" type="button" data-action="open-listing-drawer" data-marketplace="${html(listing.marketplace)}" data-external-id="${html(listing.external_id)}">${html(listing.title)}</button>
          <span>${html(text)}</span>
          ${tips.length ? `<ul class="investment-action-list">${tips.map((tip) => `<li>${html(tip)}</li>`).join("")}</ul>` : ""}
        </div>
        <div class="investment-ranking-side">
          <strong style="color:${tier.color}" title="${html(factorsTooltip)}">${composite.score}</strong>
          <span class="badge ${tier.className}">${html(tier.label)}</span>
        </div>
      </div>
    `;
  }).join("")}
  ` : `<div class="empty-chart">Sincronize as metricas para ver o ranking.</div>`;
}

// --- Ranking "Intencao de compra" (Bloco 2, aba Inteligencia) ---
export function renderIntentScoreRanking() {
  const target = byId("intentScoreRankingList");
  if (!target) return;
  const portfolioAvgConversion = computePortfolioAvgConversion();
  const ranked = state.marketplaceListings
    .map((listing) => {
      const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
      return { listing, analytics, intent: computeIntentScore(analytics) };
    })
    .filter((row) => row.intent)
    .sort((a, b) => b.intent.score - a.intent.score)
    .slice(0, 10);

  target.innerHTML = ranked.length ? `
    ${renderIntentFocusCard(ranked, portfolioAvgConversion)}
    ${ranked.map(({ listing, analytics, intent }, index) => {
    const factorsTooltip = intent.factors.map(([label, value, max]) => `${label}: ${value.toFixed(0)} de ${max}`).join(" | ");
    const action = getIntentAction(intent, analytics, portfolioAvgConversion);
    return `
      <div class="list-row investment-ranking-row">
        <div>
          <span class="investment-ranking-position">#${index + 1}</span>
          <button class="link-cell" type="button" data-action="open-listing-drawer" data-marketplace="${html(listing.marketplace)}" data-external-id="${html(listing.external_id)}">${html(listing.title)}</button>
          <span>${intent.visits7d} visita${intent.visits7d === 1 ? "" : "s"} (7d) · ${intent.questions} pergunta${intent.questions === 1 ? "" : "s"} · ${intent.sales30d} venda${intent.sales30d === 1 ? "" : "s"} (30d) · ${intent.conversion.toFixed(1)}% conversão</span>
          <span class="intent-action-note">${html(action)}</span>
        </div>
        <div class="investment-ranking-side">
          <strong title="${html(factorsTooltip)}">${intent.level.emoji} ${intent.score}</strong>
          <span class="badge ${intent.level.className}">${html(intent.level.label)}</span>
        </div>
      </div>
    `;
  }).join("")}
  ` : `<div class="empty-chart">Sincronize as metricas e as perguntas para ver o ranking.</div>`;
}

// --- Insights automaticos de intencao de compra (Bloco 2) ---
// Mesmo cartao visual de pricing.js (renderInsightCard), mas os insights
// aqui sao sobre demanda/interesse, nao margem - por isso ficam num modulo
// separado, junto do resto da logica de intencao de compra.
function getIntentScoreInsights(limit = 5) {
  const portfolioAvgConversion = computePortfolioAvgConversion();
  const results = [];
  state.marketplaceListings.forEach((listing) => {
    const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
    const intent = computeIntentScore(analytics);
    if (!intent || !analytics) return;
    if (intent.visits7d >= 50 && intent.questions >= 3 && intent.sales30d === 0) {
      results.push({
        key: `intent-no-sales:${listing.marketplace}:${listing.external_id}`,
        title: listing.title,
        message: `${intent.visits7d} visitas e ${intent.questions} pergunta${intent.questions === 1 ? "" : "s"} nos últimos dias, mas nenhuma venda em 30 dias. Revise preço, fotos e descrição.`,
      });
      return;
    }
    if (portfolioAvgConversion != null && intent.conversion >= portfolioAvgConversion * 1.5 && intent.conversion > 0) {
      results.push({
        key: `intent-high-conversion:${listing.marketplace}:${listing.external_id}`,
        title: listing.title,
        message: `Converteu ${intent.conversion.toFixed(1)}% (acima da média do portfólio de ${portfolioAvgConversion.toFixed(1)}%). Oportunidade de investir em exposição.`,
      });
      return;
    }
    if (intent.visits7d === 0 && intent.sales30d === 0) {
      results.push({
        key: `intent-no-visits:${listing.marketplace}:${listing.external_id}`,
        title: listing.title,
        message: `Sem visitas nos últimos 7 dias. Considere pausar ou revisar o título e a categoria.`,
      });
    }
  });
  return results.slice(0, limit);
}

export function renderIntentScoreInsights() {
  const target = byId("intentScoreInsightsList");
  if (!target) return;
  const dismissed = state.dismissedInsightKeys;
  const insights = getIntentScoreInsights().filter((insight) => !dismissed.includes(insight.key));
  target.innerHTML = insights.length ? insights.map((insight) => `
    <div class="suggestion-insight-card">
      <div>
        <strong>${html(insight.title)}</strong>
        <span>${html(insight.message)}</span>
      </div>
      <div class="inline-actions">
        <button class="icon-btn" type="button" data-action="dismiss-insight" data-insight-key="${html(insight.key)}">Dispensar</button>
      </div>
    </div>
  `).join("") : `<div class="empty-chart">Nenhum insight de intenção de compra no momento.</div>`;
  bindActions();
}

// --- Reputacao do vendedor ---
// Limiares de alerta sao uma referencia aproximada nossa (documentada aqui
// e na propria UI), nao os valores oficiais/exatos do programa MercadoLider,
// que o Mercado Livre nao expoe via API.
const REPUTATION_THRESHOLDS = { claimsWarning: 4, claimsCritical: 5, cancellationWarning: 3, delayedWarning: 15 };

export function renderSellerReputationPanel() {
  const panel = byId("sellerReputationPanel");
  const target = byId("sellerReputationContent");
  if (!panel || !target) return;
  const metrics = state.sellerMetrics;
  if (!metrics) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const alerts = [];
  if (metrics.claims_rate != null) {
    if (metrics.claims_rate >= REPUTATION_THRESHOLDS.claimsCritical) {
      alerts.push(`Sua taxa de reclamações está em ${metrics.claims_rate.toFixed(1)}% — acima de ${REPUTATION_THRESHOLDS.claimsCritical}% você corre risco de perder o MercadoLíder.`);
    } else if (metrics.claims_rate >= REPUTATION_THRESHOLDS.claimsWarning) {
      alerts.push(`Sua taxa de reclamações subiu para ${metrics.claims_rate.toFixed(1)}% — fique de olho, a referência de risco é ${REPUTATION_THRESHOLDS.claimsCritical}%.`);
    }
  }
  if (metrics.cancellation_rate != null && metrics.cancellation_rate >= REPUTATION_THRESHOLDS.cancellationWarning) {
    alerts.push(`Taxa de cancelamentos em ${metrics.cancellation_rate.toFixed(1)}% — acima da referência de ${REPUTATION_THRESHOLDS.cancellationWarning}%.`);
  }
  if (metrics.delayed_rate != null && metrics.delayed_rate >= REPUTATION_THRESHOLDS.delayedWarning) {
    alerts.push(`${metrics.delayed_rate.toFixed(1)}% dos envios com atraso no despacho — acima da referência de ${REPUTATION_THRESHOLDS.delayedWarning}%.`);
  }

  target.innerHTML = `
    <div class="seller-reputation-grid">
      <div class="seller-reputation-level">
        <i class="ti ti-medal" aria-hidden="true"></i>
        <div><strong>${html(metrics.seller_level || "Não disponível")}</strong><span>Nível no Mercado Livre</span></div>
      </div>
      <div class="drawer-field-row"><span>Reclamações</span><strong>${metrics.claims_rate != null ? `${metrics.claims_rate.toFixed(1)}%` : "-"}</strong></div>
      <div class="drawer-field-row"><span>Despacho no prazo</span><strong>${metrics.delayed_rate != null ? `${(100 - metrics.delayed_rate).toFixed(1)}%` : "-"}</strong></div>
      <div class="drawer-field-row"><span>Cancelamentos</span><strong>${metrics.cancellation_rate != null ? `${metrics.cancellation_rate.toFixed(1)}%` : "-"}</strong></div>
      <div class="drawer-field-row"><span>Total de vendas</span><strong>${Number(metrics.total_sales || 0).toLocaleString("pt-BR")}</strong></div>
    </div>
    ${alerts.length ? `<div class="seller-reputation-alerts">${alerts.map((text) => `<div class="listing-drawer-suggestion danger">${html(text)}</div>`).join("")}</div>` : ""}
    <small class="form-hint">Atualizado em ${formatDateTime(metrics.synced_at)} - referências de risco (reclamações/cancelamentos/atraso) são aproximadas, não os valores oficiais do programa MercadoLíder.</small>
  `;
}

// --- Painel geral (botao de sync + "atualizado em") ---
export function renderMarketplaceAnalyticsPanel() {
  if (!hasCommercialIntelligenceAccess()) {
    byId("marketplaceAnalyticsEmptyState")?.setAttribute("hidden", "");
    setMarketplacePerformanceVisibility(false);
    clearMarketplacePerformanceExecutive();
    return;
  }
  const connected = state.marketplaceAccounts.length > 0;
  const emptyState = byId("marketplaceAnalyticsEmptyState");
  const panels = ["sellerReputationPanel", "marketplacePerformancePanel", "investmentRankingPanel", "intentScoreRankingPanel", "categoryTrendsPanel"];
  if (emptyState) emptyState.hidden = connected;
  if (!connected) {
    panels.forEach((id) => {
      const panel = byId(id);
      if (panel) panel.hidden = true;
    });
    if (byId("intelligenceEmptyState")) byId("intelligenceEmptyState").hidden = true;
    setMarketplacePerformanceVisibility(false);
    clearMarketplacePerformanceExecutive();
    return;
  }
  setMarketplacePerformanceVisibility(true);
  ["marketplacePerformancePanel", "investmentRankingPanel", "intentScoreRankingPanel", "categoryTrendsPanel"].forEach((id) => {
    const panel = byId(id);
    if (panel) panel.hidden = false;
  });

  const button = byId("syncAnalyticsBtn");
  const status = byId("analyticsSyncedAtLabel");
  if (button) {
    button.disabled = state.analyticsSyncing;
    button.textContent = state.analyticsSyncing ? "Atualizando..." : "Atualizar métricas";
  }
  if (status) {
    status.textContent = state.analyticsSyncedAt
      ? `Atualizado em ${formatDateTime(state.analyticsSyncedAt)}`
      : "Ainda não sincronizado";
  }
  renderSellerReputationPanel();
  renderPerformanceTable();
  renderInvestmentRanking();
  renderIntentScoreRanking();
  renderIntentScoreInsights();
  renderCategoryTrendsPanel();
  const snapshot = buildMarketplacePerformanceSnapshot(buildMarketplacePerformanceEntries(), { revenue: performanceRevenue() });
  renderMarketplacePerformanceExecutive(snapshot);
  const section = state.marketplacePerformanceSection === "profitability" && snapshot.defaultSection === "listings"
    ? snapshot.defaultSection
    : state.marketplacePerformanceSection;
  setMarketplacePerformanceSection(section);
}

// --- Widget do dashboard: "Centro de comando" ---
// Visitas subindo/descendo e um dado real (soma dos valores diarios de
// raw_summary.visits_series, 1a metade dos 30 dias vs 2a metade) - nao um
// numero inventado, diferente da tendencia de categoria (que nao temos
// como calcular de forma confiavel, ver renderCategoryTrendsPanel).
function computeVisitsTrend() {
  let firstHalf = 0;
  let secondHalf = 0;
  Object.values(state.listingAnalytics).forEach((row) => {
    const series = row.raw_summary?.visits_series || [];
    const mid = Math.floor(series.length / 2);
    series.forEach((point, index) => {
      const value = Number(point.total || 0);
      if (index < mid) firstHalf += value;
      else secondHalf += value;
    });
  });
  if (!firstHalf && !secondHalf) return null;
  const diffPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : (secondHalf > 0 ? 100 : 0);
  const direction = diffPct > 10 ? "up" : diffPct < -10 ? "down" : "stable";
  return { direction, diffPct };
}

function getTopListingsByConversion(limit = 3) {
  return state.marketplaceListings
    .map((listing) => ({ listing, analytics: getListingAnalytics(listing.marketplace, listing.external_id) }))
    .filter((row) => row.analytics && row.analytics.conversion_rate != null)
    .sort((a, b) => b.analytics.conversion_rate - a.analytics.conversion_rate)
    .slice(0, limit);
}

// "Anuncios quentes" (Bloco 2) - top N por score de intencao de compra.
function getTopListingsByIntentScore(limit = 3) {
  return state.marketplaceListings
    .map((listing) => ({ listing, intent: computeIntentScore(getListingAnalytics(listing.marketplace, listing.external_id)) }))
    .filter((row) => row.intent)
    .sort((a, b) => b.intent.score - a.intent.score)
    .slice(0, limit);
}

function getListingsNeedingAttention(limit = 5) {
  const analyticsRows = Object.values(state.listingAnalytics);
  const maxVisits = Math.max(...analyticsRows.map((row) => Number(row.visits || 0)), 1);
  const portfolioAvgConversion = computePortfolioAvgConversion();
  return state.marketplaceListings
    .map((listing) => ({ listing, analytics: getListingAnalytics(listing.marketplace, listing.external_id) }))
    .filter(({ analytics }) => {
      if (!analytics) return false;
      const highVisits = Number(analytics.visits || 0) >= maxVisits * 0.5;
      const lowConversion = portfolioAvgConversion != null && analytics.conversion_rate != null && analytics.conversion_rate < portfolioAvgConversion * 0.6;
      const priceOff = analytics.price_competitiveness === "above";
      return (highVisits && lowConversion) || priceOff;
    })
    .slice(0, limit);
}

export function renderMarketplaceCommandWidget() {
  const target = byId("marketplaceCommandWidget");
  const card = target?.closest("[data-dashboard-card]");
  if (!target) return;
  if (card) card.hidden = !state.isAdmin;
  if (!state.isAdmin) return;
  if (!hasCommercialIntelligenceAccess()) {
    target.innerHTML = `<div class="premium-upsell compact"><strong>Recurso premium</strong><span>Disponível nos planos pagos.</span><button class="secondary-btn" type="button" data-action="open-subscription">Ver planos</button></div>`;
    bindActions();
    return;
  }
  const metrics = state.sellerMetrics;
  const top3 = getTopListingsByConversion();
  const hotListings = getTopListingsByIntentScore();
  const attention = getListingsNeedingAttention();
  const visitsTrend = computeVisitsTrend();
  const trendLabel = visitsTrend
    ? (visitsTrend.direction === "up" ? `<i class="ti ti-trending-up" aria-hidden="true"></i> Visitas subindo` : visitsTrend.direction === "down" ? `<i class="ti ti-trending-down" aria-hidden="true"></i> Visitas caindo` : `<i class="ti ti-minus" aria-hidden="true"></i> Visitas estáveis`)
    : "Sem dados de visitas ainda";

  target.innerHTML = `
    <div class="marketplace-command-row">
      <div class="marketplace-command-block">
        <span>Reputação</span>
        <strong>${metrics ? html(metrics.seller_level || "N/D") : "Não sincronizado"}</strong>
        ${metrics && metrics.claims_rate != null && metrics.claims_rate >= 4 ? `<small class="danger-text">Reclamações em ${metrics.claims_rate.toFixed(1)}%</small>` : ""}
      </div>
      <div class="marketplace-command-block">
        <span>Tendência de visitas</span>
        <strong>${trendLabel}</strong>
      </div>
    </div>
    <div class="drawer-section-title">Anúncios quentes (intenção de compra)</div>
    ${hotListings.length ? `<div class="stack-list">${hotListings.map(({ listing, intent }) => `
      <div class="list-row"><div><strong>${html(listing.title)}</strong><span>${intent.level.emoji} ${intent.score} - ${html(intent.level.label)}</span></div></div>
    `).join("")}</div>` : `<div class="empty-chart">Sincronize as métricas e as perguntas para ver o ranking.</div>`}
    <div class="drawer-section-title">Top 3 por conversão</div>
    ${top3.length ? `<div class="stack-list">${top3.map(({ listing, analytics }) => `
      <div class="list-row"><div><strong>${html(listing.title)}</strong><span>${analytics.conversion_rate.toFixed(1)}% de conversão</span></div></div>
    `).join("")}</div>` : `<div class="empty-chart">Sem dados de conversão ainda.</div>`}
    <div class="drawer-section-title">Precisam de atenção</div>
    ${attention.length ? `<div class="stack-list">${attention.map(({ listing, analytics }) => `
      <div class="list-row"><div><strong>${html(listing.title)}</strong><span>${analytics.price_competitiveness === "above" ? "Preço acima da média" : "Muita visita, pouca conversão"}</span></div></div>
    `).join("")}</div>` : `<div class="empty-chart">Nenhum anúncio precisando de atenção agora.</div>`}
  `;
}

// --- Raio-X: diagnostico completo por anuncio (drawer com 6 blocos) ---

export function closeListingDrawer() {
  byId("listingDrawer").classList.remove("open");
  byId("listingDrawer").setAttribute("aria-hidden", "true");
  byId("listingDrawerOverlay").hidden = true;
}

export function openListingDrawer(listing, { onEdit } = {}) {
  if (!listing) return;
  const { marketplace, external_id: externalId } = listing;
  const analytics = getListingAnalytics(marketplace, externalId);
  const profitability = getListingProfitability(listing);
  const portfolioAvgConversion = computePortfolioAvgConversion();
  const suggestion = getPriceSuggestionScenario(listing, analytics, profitability, portfolioAvgConversion);

  byId("listingDrawerCode").textContent = listing.sku || externalId;
  byId("listingDrawerTitle").textContent = listing.title;
  byId("listingDrawerMarketplace").textContent = marketplace;

  renderListingDrawerFinancial(profitability, suggestion);
  renderListingDrawerProductAssets(marketplace, externalId);
  renderListingDrawerPerformance(analytics, portfolioAvgConversion);
  renderListingDrawerCompetitiveness(listing, analytics);
  renderListingDrawerHealth(analytics);
  renderListingDrawerShipping(analytics);

  const simulateBtn = byId("listingDrawerSimulateBtn");
  simulateBtn.hidden = !profitability.hasCost;
  simulateBtn.onclick = () => {
    closeListingDrawer();
    openPriceCalculatorForListing(marketplace, externalId);
    showCalculatorSuggestion(suggestion);
  };

  const openMlBtn = byId("listingDrawerOpenMlBtn");
  const permalink = safeUrl(listing.permalink);
  openMlBtn.hidden = !permalink;
  if (permalink) openMlBtn.href = permalink;

  const editBtn = byId("listingDrawerEditBtn");
  editBtn.onclick = () => onEdit?.(listing);

  byId("listingDrawer").classList.add("open");
  byId("listingDrawer").setAttribute("aria-hidden", "false");
  byId("listingDrawerOverlay").hidden = false;
}

function renderListingDrawerProductAssets(marketplace, externalId) {
  const target = byId("listingDrawerProductAssets");
  if (!target) return;
  const product = getProductForListing(marketplace, externalId);
  if (!product) {
    target.innerHTML = `<div class="empty-chart">Nenhum produto interno vinculado. Clique em Editar anuncio para criar o vinculo e salvar STL, imagem e observacoes de producao.</div>`;
    return;
  }
  const assets = getProductAssetInfo(product);
  const stl = safeUrl(assets.stlLink);
  const image = safeUrl(assets.imageUrl);
  const notes = String(assets.notes || "").trim();
  target.innerHTML = `
    <div class="product-asset-card">
      ${image ? `<a href="${html(image)}" target="_blank" rel="noopener"><img src="${html(image)}" alt="${html(product.name || "Produto")}" loading="lazy" /></a>` : `<div class="product-asset-placeholder">Sem imagem</div>`}
      <div>
        <strong>${html(product.name || "Produto interno")}</strong>
        <span>SKU ${html(product.sku || "-")}${product.category ? ` · ${html(product.category)}` : ""}</span>
        <div class="inline-actions">
          ${stl ? `<a class="order-link" href="${html(stl)}" target="_blank" rel="noopener">Abrir STL/origem</a>` : ""}
          ${image ? `<a class="order-link" href="${html(image)}" target="_blank" rel="noopener">Abrir imagem</a>` : ""}
        </div>
        ${notes ? `<small class="muted">${html(notes)}</small>` : `<small class="muted">Sem observacoes de producao.</small>`}
      </div>
    </div>
  `;
}

function renderListingDrawerFinancial(profitability, suggestion) {
  const target = byId("listingDrawerFinancial");
  if (!profitability.hasCost) {
    target.innerHTML = `<div class="empty-chart">Cadastre o custo deste produto para ver o resumo financeiro.</div>`;
    return;
  }
  const feesTotal = profitability.feeAmount + (profitability.fixedFee || 0) + profitability.taxAmount + profitability.shipping + profitability.packaging;
  const profitColor = profitability.netProfit >= 0 ? "var(--green)" : "var(--red)";
  const feeSourceTag = profitability.real
    ? `<span class="badge done" title="Taxa sincronizada da API do Mercado Livre">real</span>`
    : `<span class="badge neutral" title="Estimativa por tabela">estimado</span>`;
  target.innerHTML = `
    <div class="drawer-field-row"><span>Preço</span><strong>${money.format(profitability.revenue)}</strong></div>
    <div class="drawer-field-row"><span>Custo</span><strong>${money.format(profitability.cost)}</strong></div>
    <div class="drawer-field-row"><span>Taxas</span><strong>${money.format(feesTotal)} ${feeSourceTag}</strong></div>
    <div class="drawer-field-row"><span>Lucro</span><strong style="color:${profitColor}">${money.format(profitability.netProfit)}</strong></div>
    <div class="drawer-field-row"><span>Margem</span><strong><span class="badge ${profitability.level.className}">${profitability.marginPct.toFixed(1)}% - ${html(profitability.level.label)}</span></strong></div>
    ${suggestion ? `<div class="listing-drawer-suggestion">${html(suggestion.text)}${suggestion.impact ? ` <strong>(+${money.format(suggestion.impact)}/venda estimado)</strong>` : ""}</div>` : ""}
  `;
}

function renderListingDrawerPerformance(analytics, portfolioAvgConversion) {
  const target = byId("listingDrawerPerformance");
  if (!analytics) {
    target.innerHTML = `<div class="empty-chart">Clique em "Atualizar métricas" para sincronizar dados de performance.</div>`;
    byId("listingDrawerVisitsChart").innerHTML = "";
    return;
  }
  const avgTicket = analytics.avg_ticket != null ? money.format(analytics.avg_ticket) : "-";
  target.innerHTML = `
    <div class="drawer-field-row"><span>Visitas (30d)</span><strong>${Number(analytics.visits || 0).toLocaleString("pt-BR")}</strong></div>
    <div class="drawer-field-row"><span>Vendas no período</span><strong>${Number(analytics.sold_quantity || 0).toLocaleString("pt-BR")}</strong></div>
    <div class="drawer-field-row"><span>Conversão</span><strong>${analytics.conversion_rate != null ? `${analytics.conversion_rate.toFixed(1)}%` : "-"}${portfolioAvgConversion ? ` <small>(sua média no portfólio: ${portfolioAvgConversion.toFixed(1)}%)</small>` : ""}</strong></div>
    <div class="drawer-field-row"><span>Ticket médio</span><strong>${avgTicket}</strong></div>
  `;
  const series = analytics.raw_summary?.visits_series || [];
  if (series.length) {
    renderLineChart("listingDrawerVisitsChart", series.map((point) => ({
      label: point.date ? String(point.date).slice(5) : "",
      value: Number(point.total || 0),
    })), { format: (value) => `${value} visita${value === 1 ? "" : "s"}`, valueLabel: "Visitas por dia" });
  } else {
    byId("listingDrawerVisitsChart").innerHTML = `<div class="empty-chart">Sem série de visitas disponível.</div>`;
  }
}

function renderListingDrawerCompetitiveness(listing, analytics) {
  const target = byId("listingDrawerCompetitiveness");
  if (!analytics || analytics.price_position_min == null) {
    target.innerHTML = `<div class="empty-chart">Dados de concorrência não disponíveis ainda.</div>`;
    return;
  }
  const price = Number(listing.price || 0);
  const min = analytics.price_position_min;
  const max = analytics.price_position_max;
  const avg = analytics.price_position_avg;
  const range = Math.max(max - min, 1);
  const userPct = Math.min(Math.max(((price - min) / range) * 100, 0), 100);
  const avgPct = Math.min(Math.max(((avg - min) / range) * 100, 0), 100);
  target.innerHTML = `
    <div class="drawer-field-row"><span>Seu preço</span><strong>${money.format(price)}</strong></div>
    <div class="drawer-field-row"><span>Média da categoria</span><strong>${money.format(avg)}</strong></div>
    <div class="drawer-field-row"><span>Mediana</span><strong>${money.format(analytics.price_position_median)}</strong></div>
    <div class="price-spectrum">
      <div class="price-spectrum-track">
        <div class="price-spectrum-marker price-spectrum-avg" style="left:${avgPct}%" title="Média: ${html(money.format(avg))}"></div>
        <div class="price-spectrum-marker price-spectrum-user" style="left:${userPct}%" title="Seu preço: ${html(money.format(price))}"></div>
      </div>
      <div class="price-spectrum-labels"><span>Mais barato: ${money.format(min)}</span><span>Mais caro: ${money.format(max)}</span></div>
    </div>
    <div class="drawer-field-row"><span>Posição nos resultados de busca</span><strong>${analytics.search_position ? `#${analytics.search_position}` : "Fora do top 50"}</strong></div>
  `;
}

function renderListingDrawerHealth(analytics) {
  const target = byId("listingDrawerHealth");
  if (!analytics) {
    target.innerHTML = `<div class="empty-chart">Saúde do anúncio não disponível ainda.</div>`;
    return;
  }
  const tone = healthTone(analytics.health_score);
  const checklist = analytics.health_checklist || {};
  const items = [
    ["fotos", "Fotos suficientes"],
    ["descricao", "Descrição completa"],
    ["ficha_tecnica", "Ficha técnica preenchida"],
    ["video", "Vídeo do produto"],
  ];
  target.innerHTML = `
    <div class="drawer-field-row"><span>Score geral</span><strong><span class="badge ${tone.className}">${analytics.health_score != null ? `${Math.round(analytics.health_score * 100)}%` : "N/D"} - ${html(tone.label)}</span></strong></div>
    <ul class="health-checklist">
      ${items.map(([key, label]) => `<li class="${checklist[key] ? "ok" : "fail"}"><i class="ti ${checklist[key] ? "ti-check" : "ti-x"}" aria-hidden="true"></i> ${html(label)}</li>`).join("")}
    </ul>
    <small class="form-hint">Checklist estimado a partir dos dados do anúncio - o Mercado Livre não expõe um checklist oficial de qualidade via API.</small>
  `;
}

function renderListingDrawerShipping(analytics) {
  const target = byId("listingDrawerShipping");
  const shipping = analytics?.raw_summary?.shipping;
  if (!shipping) {
    target.innerHTML = `<div class="empty-chart">Dados de frete não disponíveis ainda.</div>`;
    return;
  }
  const cityLabels = { SP: "São Paulo", RJ: "Rio de Janeiro", BH: "Belo Horizonte" };
  const costRows = Object.entries(shipping.costs_by_city || {}).map(([city, cost]) => `
    <div class="drawer-field-row"><span>Frete estimado (${html(cityLabels[city] || city)})</span><strong>${cost != null ? money.format(cost) : "N/D"}</strong></div>
  `).join("");
  target.innerHTML = `
    <div class="drawer-field-row"><span>Frete grátis ativo</span><strong>${shipping.free_shipping ? "Sim" : "Não"}</strong></div>
    ${costRows}
    ${shipping.shipping_share_pct != null && shipping.shipping_share_pct >= 15
      ? `<div class="listing-drawer-suggestion">O frete representa ${shipping.shipping_share_pct.toFixed(0)}% do preço. Considere embutir o frete no preço.</div>`
      : ""}
  `;
}

// Preenche o box de sugestao dentro do dialog da calculadora de preco -
// reaproveitado tanto pelo botao "Simular novo preco" do drawer quanto
// pela acao "simulate-listing" (tabela de rentabilidade/sugestoes agrupadas).
export function showCalculatorSuggestion(suggestion) {
  const target = byId("priceCalculatorSuggestion");
  if (!target) return;
  target.hidden = !suggestion;
  if (suggestion) {
    target.textContent = suggestion.text + (suggestion.impact ? ` (+${money.format(suggestion.impact)}/venda estimado)` : "");
  }
}

export function getSuggestionForListing(marketplace, externalId) {
  const listing = state.marketplaceListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
  if (!listing) return null;
  const analytics = getListingAnalytics(marketplace, externalId);
  const profitability = getListingProfitability(listing);
  return getPriceSuggestionScenario(listing, analytics, profitability, computePortfolioAvgConversion());
}

export function bindListingDrawer() {
  byId("listingDrawerCloseBtn")?.addEventListener("click", closeListingDrawer);
  byId("listingDrawerOverlay")?.addEventListener("click", closeListingDrawer);
}
