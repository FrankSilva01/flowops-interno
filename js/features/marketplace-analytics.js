// Inteligencia Comercial - centro de comando do marketplace.
// Estende pricing.js (rentabilidade/margem) com dados reais do Mercado Livre
// vindos da rota "analytics-full" da Edge Function marketplace-sync:
// visitas, conversao, competitividade de preco, posicao de busca, saude do
// anuncio, frete e reputacao do vendedor. Modulo separado pra nao inflar
// pricing.js, que ja cobre custo/margem/sugestoes de cadastro em lote.
import { state, money } from "../core/state.js";
import { byId, html, safeUrl, formatDateTime, flashActionMessage } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { renderLineChart } from "../core/charts.js";
import { marketplaceRequest } from "./marketplace.js";
import {
  hasCommercialIntelligenceAccess, getListingProfitability, getFinancialSettings,
  computeMarginBreakdown, openPriceCalculatorForListing,
} from "./pricing.js";

const ANALYTICS_URL = "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=analytics-full";

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

export async function syncAnalyticsFull(force = false) {
  if (!ensureCanEdit()) return;
  if (state.analyticsSyncing) return;
  state.analyticsSyncing = true;
  renderMarketplaceAnalyticsPanel();
  try {
    const url = force ? `${ANALYTICS_URL}&force=true` : ANALYTICS_URL;
    const result = await marketplaceRequest(url);
    await Promise.all([loadListingAnalytics(), loadSellerMetrics()]);
    const failed = (result.listings || []).filter((item) => !item.ok).length;
    flashActionMessage(failed
      ? `Métricas atualizadas com ${failed} erro(s) - veja Logs API para detalhes.`
      : "Métricas do Mercado Livre atualizadas.");
  } catch (error) {
    flashActionMessage(`Não foi possível atualizar as métricas: ${error.message}`);
  } finally {
    state.analyticsSyncing = false;
    renderMarketplaceAnalyticsPanel();
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
    cost: profitability.cost, revenue: targetPrice, feePct: profitability.feePct,
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
    margin_desc: (a, b) => (b.profitability.hasCost ? b.profitability.marginPct : -999) - (a.profitability.hasCost ? a.profitability.marginPct : -999),
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
        <td>${profitability.hasCost ? `${profitability.marginPct.toFixed(1)}%` : "-"}</td>
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
  const withMargin = rows.filter((row) => row.profitability.hasCost);
  const avgMargin = withMargin.length ? withMargin.reduce((sum, row) => sum + row.profitability.marginPct, 0) / withMargin.length : null;
  target.innerHTML = `
    <tr class="table-totals-row">
      <td>Total (${rows.length})</td>
      <td></td>
      <td></td>
      <td>${totalVisits.toLocaleString("pt-BR")}</td>
      <td></td>
      <td>${totalSold.toLocaleString("pt-BR")}</td>
      <td>${avgMargin === null ? "-" : `${avgMargin.toFixed(1)}%`}</td>
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

// --- Painel geral (botao de sync + "atualizado em") ---
export function renderMarketplaceAnalyticsPanel() {
  const button = byId("syncAnalyticsBtn");
  const status = byId("analyticsSyncedAtLabel");
  if (!hasCommercialIntelligenceAccess()) return;
  if (button) {
    button.disabled = state.analyticsSyncing;
    button.textContent = state.analyticsSyncing ? "Atualizando..." : "Atualizar métricas";
  }
  if (status) {
    status.textContent = state.analyticsSyncedAt
      ? `Atualizado em ${formatDateTime(state.analyticsSyncedAt)}`
      : "Ainda não sincronizado";
  }
  renderPerformanceTable();
}

// --- Raio-X: diagnostico completo por anuncio (drawer com 6 blocos) ---

export function closeListingDrawer() {
  byId("listingDrawer").classList.remove("open");
  byId("listingDrawer").setAttribute("aria-hidden", "true");
  byId("listingDrawerOverlay").hidden = true;
}

export function openListingDrawer(marketplace, externalId) {
  const listing = state.marketplaceListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
  if (!listing) return;
  const analytics = getListingAnalytics(marketplace, externalId);
  const profitability = getListingProfitability(listing);
  const portfolioAvgConversion = computePortfolioAvgConversion();
  const suggestion = getPriceSuggestionScenario(listing, analytics, profitability, portfolioAvgConversion);

  byId("listingDrawerCode").textContent = listing.sku || externalId;
  byId("listingDrawerTitle").textContent = listing.title;
  byId("listingDrawerMarketplace").textContent = marketplace;

  renderListingDrawerFinancial(profitability, suggestion);
  renderListingDrawerPerformance(analytics, portfolioAvgConversion);
  renderListingDrawerCompetitiveness(listing, analytics);
  renderListingDrawerHealth(analytics);
  renderListingDrawerShipping(analytics);

  const simulateBtn = byId("listingDrawerSimulateBtn");
  simulateBtn.hidden = !profitability.hasCost;
  simulateBtn.onclick = () => {
    closeListingDrawer();
    openPriceCalculatorForListing(marketplace, externalId);
  };

  const openMlBtn = byId("listingDrawerOpenMlBtn");
  const permalink = safeUrl(listing.permalink);
  openMlBtn.hidden = !permalink;
  if (permalink) openMlBtn.href = permalink;

  const editBtn = byId("listingDrawerEditBtn");
  editBtn.onclick = () => {
    closeListingDrawer();
    document.querySelector(`[data-action="marketplace-edit"][data-id="${CSS.escape(externalId)}"]`)?.click();
  };

  byId("listingDrawer").classList.add("open");
  byId("listingDrawer").setAttribute("aria-hidden", "false");
  byId("listingDrawerOverlay").hidden = false;
}

function renderListingDrawerFinancial(profitability, suggestion) {
  const target = byId("listingDrawerFinancial");
  if (!profitability.hasCost) {
    target.innerHTML = `<div class="empty-chart">Cadastre o custo deste produto para ver o resumo financeiro.</div>`;
    return;
  }
  const feesTotal = profitability.feeAmount + profitability.taxAmount + profitability.shipping + profitability.packaging;
  const profitColor = profitability.netProfit >= 0 ? "var(--green)" : "var(--red)";
  target.innerHTML = `
    <div class="drawer-field-row"><span>Preço</span><strong>${money.format(profitability.revenue)}</strong></div>
    <div class="drawer-field-row"><span>Custo</span><strong>${money.format(profitability.cost)}</strong></div>
    <div class="drawer-field-row"><span>Taxas</span><strong>${money.format(feesTotal)}</strong></div>
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

export function bindListingDrawer() {
  byId("listingDrawerCloseBtn")?.addEventListener("click", closeListingDrawer);
  byId("listingDrawerOverlay")?.addEventListener("click", closeListingDrawer);
}
