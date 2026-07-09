import { state, money } from "../core/state.js";
import { byId, html, showAppMessage } from "../core/dom.js";
import { getListingProfitability } from "./pricing.js";
import { getListingAnalytics } from "./marketplace-analytics.js";
import { normalizeMarketplaceChannel, marketplaceDisplayName } from "./marketplace.js";

// ========================================================================
// BLOCO 3: INTELIGÊNCIA COMERCIAL
// ========================================================================

// ========== B. SCORE "INTENÇÃO DE COMPRA" ==========

const INTENT_SCORE_WEIGHTS = {
  recentSales: 40,      // Vendas últimos 7 dias
  questions: 20,        // Perguntas recentes
  visits7d: 15,         // Visitas últimos 7 dias
  visitsTrend: 10,      // Crescimento de visitas
  conversion: 15        // Taxa de conversão
};

export function computeIntentScore(listing, analytics, sales) {
  if (!analytics) return null;

  // Vendas recentes (últimos 7 dias) - máx 40 pts
  const recentSalesCount = sales.filter(s => {
    const daysAgo = (Date.now() - new Date(s.date_created || Date.now()).getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 7;
  }).length;
  const recentSalesPts = Math.min(recentSalesCount * 8, 40);

  // Perguntas - máx 20 pts (estimado)
  const questionsPts = Math.min((analytics.questions_count || 0) * 2, 20);

  // Visitas 7d - máx 15 pts
  const visits7dPts = Math.min((analytics.visits_7d || analytics.visits || 0) / 10, 15);

  // Crescimento de visitas - máx 10 pts
  const visitsGrowth = (analytics.visits_growth_pct || 0) / 10;
  const visitsTrendPts = Math.max(0, Math.min(visitsGrowth, 10));

  // Conversão - máx 15 pts
  const conversionRate = analytics.conversion_rate || 0;
  const conversionPts = Math.min(conversionRate * 1.5, 15);

  const totalScore = recentSalesPts + questionsPts + visits7dPts + visitsTrendPts + conversionPts;

  return {
    score: Math.round(totalScore),
    level: getIntentLevel(totalScore),
    factors: {
      recentSales: recentSalesPts,
      questions: questionsPts,
      visits7d: visits7dPts,
      visitsTrend: visitsTrendPts,
      conversion: conversionPts
    },
    details: {
      recentSalesCount,
      questionsCount: analytics.questions_count || 0,
      visits7d: analytics.visits_7d || analytics.visits || 0
    }
  };
}

function getIntentLevel(score) {
  if (score >= 80) return { label: "🔥 Muito Alta", className: "level-critical", color: "#FF6B6B" };
  if (score >= 60) return { label: "🟢 Alta", className: "level-attention", color: "#51CF66" };
  if (score >= 40) return { label: "🟡 Média", className: "level-healthy", color: "#FFD43B" };
  return { label: "🔴 Baixa", className: "level-low", color: "#868E96" };
}

// ========== C. SUGESTÃO DE PREÇO CONTEXTUALIZADA ==========

export function computePriceSuggestion(listing, analytics, profitability) {
  if (!listing || !analytics || !profitability) return null;

  const currentPrice = Number(listing.price || 0);
  const categoryAvgPrice = Number(analytics.category_avg_price || 0);
  const categoryMedianPrice = Number(analytics.category_median_price || 0);
  const conversionRate = analytics.conversion_rate || 0;
  const currentMargin = profitability.marginPct || 0;

  // Lógica: se conversão > 2% e preço abaixo da média, sugerir aumento
  const avgPrice = categoryAvgPrice || categoryMedianPrice || currentPrice;
  const pricePosition = currentPrice > 0 ? (currentPrice / avgPrice - 1) * 100 : 0; // % acima/abaixo

  const suggestions = [];

  // Sugestão 1: Aumentar se conversão boa e preço baixo
  if (conversionRate >= 2 && pricePosition < -5) {
    const suggestedPrice = Math.round(avgPrice * 0.95 * 100) / 100; // 5% abaixo da média
    const priceDiff = suggestedPrice - currentPrice;
    const estimatedMarginGain = priceDiff * 0.85; // 85% vira lucro (15% desconto/taxa)

    if (estimatedMarginGain > 0) {
      suggestions.push({
        type: "increase",
        currentPrice,
        suggestedPrice,
        priceDiff,
        estimatedMarginGain,
        reason: `Conversão alta (${conversionRate.toFixed(1)}%) e preço abaixo da média (${pricePosition.toFixed(0)}%) — há espaço pra subir.`
      });
    }
  }

  // Sugestão 2: Reduzir se conversão baixa e preço acima da média
  if (conversionRate < 1 && pricePosition > 5) {
    const suggestedPrice = Math.round(avgPrice * 1.02 * 100) / 100; // 2% acima da média (não muito)
    const priceDiff = suggestedPrice - currentPrice;

    suggestions.push({
      type: "decrease",
      currentPrice,
      suggestedPrice,
      priceDiff,
      reason: `Conversão baixa (${conversionRate.toFixed(1)}%) e preço acima da média (${pricePosition.toFixed(0)}%) — reduza pra competir.`
    });
  }

  // Sugestão 3: Alerta se preço muito acima/abaixo
  if (pricePosition > 15) {
    suggestions.push({
      type: "alert",
      message: `⚠️ Preço R$${currentPrice.toFixed(2)} está ${pricePosition.toFixed(0)}% acima da média (R$${avgPrice.toFixed(2)}).`,
      risk: "high"
    });
  }

  return {
    currentPrice,
    categoryAvgPrice: avgPrice,
    pricePosition,
    conversionRate,
    currentMargin,
    suggestions
  };
}

// ========== D. RAIO-X DO ANÚNCIO ==========

export function buildListingXRay(listing) {
  const channel = normalizeMarketplaceChannel(listing.marketplace);
  const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
  const profitability = getListingProfitability(listing);

  const sales = state.marketplaceSales.filter(s =>
    s.marketplace === listing.marketplace && s.external_id === listing.external_id
  );

  const intentScore = computeIntentScore(listing, analytics, sales);
  const priceSuggestion = computePriceSuggestion(listing, analytics, profitability);

  return {
    listing,
    analytics,
    profitability,
    intentScore,
    priceSuggestion,
    salesCount: sales.length,
    salesLast7d: sales.filter(s => {
      const daysAgo = (Date.now() - new Date(s.date_created || Date.now()).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    }).length,
    blocks: {
      financial: buildFinancialBlock(listing, profitability),
      performance: buildPerformanceBlock(analytics),
      competitiveness: buildCompetitivenessBlock(analytics),
      health: buildHealthBlock(listing, analytics),
      shipping: buildShippingBlock(listing),
      actions: buildActionsBlock(listing)
    }
  };
}

function buildFinancialBlock(listing, profitability) {
  return {
    title: "Financeiro",
    price: Number(listing.price || 0),
    margin: profitability.marginPct || 0,
    profit: profitability.netProfit || 0,
    feePercentage: profitability.feePct || 0,
    shippingCost: profitability.shipping || 0
  };
}

function buildPerformanceBlock(analytics) {
  return {
    title: "Performance",
    visits: Number(analytics?.visits || 0),
    sales: Number(analytics?.sold_quantity || 0),
    conversion: (analytics?.conversion_rate || 0).toFixed(2) + "%",
    avgTicket: Number(analytics?.avg_ticket || 0),
    questions: Number(analytics?.questions_count || 0),
    rating: Number(analytics?.seller_rating || 0)
  };
}

function buildCompetitivenessBlock(analytics) {
  return {
    title: "Competitividade",
    pricePosition: analytics?.price_competitiveness || "neutral",
    categoryAvgPrice: Number(analytics?.category_avg_price || 0),
    ranking: analytics?.position_in_category || "N/A",
    competitors: Number(analytics?.competitors_count || 0)
  };
}

function buildHealthBlock(listing, analytics) {
  return {
    title: "Saúde",
    active: listing.status === "active",
    violations: Number(analytics?.violations_count || 0),
    complaints: Number(analytics?.complaints_count || 0),
    feedbackRating: Number(analytics?.feedback_rating || 0)
  };
}

function buildShippingBlock(listing) {
  const freeShipping = listing.shipping?.free_shipping || listing.raw_payload?.shipping?.free_shipping;
  return {
    title: "Frete",
    freeShipping,
    shippingType: freeShipping ? "Grátis" : "Pago",
    estimatedCost: "Sincronizando...",
    carrier: listing.shipping?.mode || "Mercado Envios"
  };
}

function buildActionsBlock(listing) {
  return {
    title: "Ações",
    actions: [
      { label: "Editar preço", icon: "💰", action: "edit-price" },
      { label: "Pausar anúncio", icon: "⏸️", action: "pause" },
      { label: "Copiar SKU", icon: "📋", action: "copy-sku" },
      { label: "Ver no ML", icon: "🔗", action: "open-ml" }
    ]
  };
}

// ========== RENDERIZAÇÃO ==========

export function renderIntelligenTable(listings) {
  const rows = listings
    .map(listing => {
      const analytics = getListingAnalytics(listing.marketplace, listing.external_id);
      const profitability = getListingProfitability(listing);
      const sales = state.marketplaceSales.filter(s =>
        s.marketplace === listing.marketplace && s.external_id === listing.external_id
      );
      const intentScore = computeIntentScore(listing, analytics, sales);

      return {
        listing,
        analytics: analytics || {},
        profitability: profitability || { marginPct: 0, netProfit: 0 },
        intentScore: intentScore || { score: 0, level: { label: "N/A" } },
        visits: analytics?.visits || 0,
        sales: analytics?.sold_quantity || 0,
        conversion: (analytics?.conversion_rate || 0).toFixed(2),
        margin: (profitability?.marginPct || 0).toFixed(1),
        profit: profitability?.netProfit || 0
      };
    })
    .sort((a, b) => b.intentScore.score - a.intentScore.score); // Ordena por intenção

  return rows.map(row => `
    <tr class="intelligence-row" data-listing-id="${row.listing.external_id}">
      <td class="col-name">${html(row.listing.title || row.listing.name)}</td>
      <td class="col-visits">${row.visits.toLocaleString()}</td>
      <td class="col-sales">${row.sales}</td>
      <td class="col-conversion">${row.conversion}%</td>
      <td class="col-ticket">R$${(row.profit / Math.max(row.sales, 1)).toFixed(2)}</td>
      <td class="col-margin">${row.margin}%</td>
      <td class="col-intent">
        <span class="intent-badge ${row.intentScore.level.className}">
          ${row.intentScore.level.label}
        </span>
      </td>
      <td class="col-actions">
        <button class="icon-btn" data-action="xray" title="Ver Raio-X">🔍</button>
      </td>
    </tr>
  `).join("");
}

export function openListingXRay(listing) {
  const xray = buildListingXRay(listing);
  renderListingXRayDrawer(xray);
}

function renderListingXRayDrawer(xray) {
  const { listing, analytics, profitability, intentScore, priceSuggestion, blocks } = xray;

  const drawer = document.createElement("div");
  drawer.className = "xray-drawer";
  drawer.innerHTML = `
    <div class="xray-header">
      <div class="xray-title">
        <h2>${html(listing.title || listing.name)}</h2>
        <span class="xray-close" data-action="close-xray">✕</span>
      </div>
      <div class="xray-price-badge">
        <strong>${money.format(listing.price)}</strong>
        <span class="intent-badge ${intentScore?.level.className}">
          ${intentScore?.level.label || "N/A"}
        </span>
      </div>
    </div>

    <div class="xray-content">
      <!-- Bloco 1: Financeiro -->
      <div class="xray-block financial-block">
        <div class="block-title">💰 Financeiro</div>
        <div class="block-grid">
          <div class="stat">
            <div class="stat-label">Preço</div>
            <div class="stat-value">${money.format(blocks.financial.price)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Margem</div>
            <div class="stat-value margin-${profitability.marginPct > 20 ? "good" : "bad"}">
              ${blocks.financial.margin.toFixed(1)}%
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Lucro Estimado</div>
            <div class="stat-value">${money.format(blocks.financial.profit)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Taxa ML</div>
            <div class="stat-value">${blocks.financial.feePercentage.toFixed(1)}%</div>
          </div>
        </div>
        ${priceSuggestion?.suggestions?.length ? `
          <div class="price-suggestions">
            ${priceSuggestion.suggestions.map(s => {
              if (s.type === "alert") {
                return `<div class="suggestion alert">${s.message}</div>`;
              }
              return `
                <div class="suggestion ${s.type}">
                  <strong>${s.suggestedPrice ? "Sugestão" : "Info"}:</strong> ${s.reason || ""}
                  ${s.suggestedPrice ? `<br><small>Preço sugerido: ${money.format(s.suggestedPrice)}</small>` : ""}
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}
      </div>

      <!-- Bloco 2: Performance -->
      <div class="xray-block performance-block">
        <div class="block-title">📊 Performance (30 dias)</div>
        <div class="block-grid">
          <div class="stat">
            <div class="stat-label">Visitas</div>
            <div class="stat-value">${blocks.performance.visits.toLocaleString()}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Vendas</div>
            <div class="stat-value">${blocks.performance.sales}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Conversão</div>
            <div class="stat-value">${blocks.performance.conversion}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Ticket Médio</div>
            <div class="stat-value">${money.format(blocks.performance.avgTicket)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Perguntas</div>
            <div class="stat-value">${blocks.performance.questions}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Rating Vendedor</div>
            <div class="stat-value">${blocks.performance.rating.toFixed(1)}/5</div>
          </div>
        </div>
      </div>

      <!-- Bloco 3: Competitividade -->
      <div class="xray-block competitiveness-block">
        <div class="block-title">🏆 Competitividade</div>
        <div class="block-grid">
          <div class="stat full-width">
            <div class="stat-label">Posição de Preço</div>
            <div class="stat-value">
              ${blocks.competitiveness.pricePosition === "below" ? "✅ Abaixo da média" :
                blocks.competitiveness.pricePosition === "above" ? "⚠️ Acima da média" :
                "→ Na média"}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Preço Médio Categoria</div>
            <div class="stat-value">${money.format(blocks.competitiveness.categoryAvgPrice)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Ranking</div>
            <div class="stat-value">${blocks.competitiveness.ranking}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Competidores</div>
            <div class="stat-value">${blocks.competitiveness.competitors}</div>
          </div>
        </div>
      </div>

      <!-- Bloco 4: Saúde -->
      <div class="xray-block health-block">
        <div class="block-title">❤️ Saúde</div>
        <div class="block-grid">
          <div class="stat">
            <div class="stat-label">Status</div>
            <div class="stat-value">${blocks.health.active ? "🟢 Ativo" : "🔴 Inativo"}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Violações</div>
            <div class="stat-value ${blocks.health.violations > 0 ? "bad" : "good"}">
              ${blocks.health.violations}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Reclamações</div>
            <div class="stat-value ${blocks.health.complaints > 0 ? "bad" : "good"}">
              ${blocks.health.complaints}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Feedback</div>
            <div class="stat-value">${blocks.health.feedbackRating.toFixed(1)}/5</div>
          </div>
        </div>
      </div>

      <!-- Bloco 5: Frete -->
      <div class="xray-block shipping-block">
        <div class="block-title">🚚 Frete</div>
        <div class="block-grid">
          <div class="stat full-width">
            <div class="stat-label">Tipo</div>
            <div class="stat-value">${blocks.shipping.freeShipping ? "📦 Frete Grátis" : "💰 Frete Pago"}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Custo Estimado</div>
            <div class="stat-value">${blocks.shipping.estimatedCost}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Transportadora</div>
            <div class="stat-value">${blocks.shipping.carrier}</div>
          </div>
        </div>
      </div>

      <!-- Bloco 6: Ações -->
      <div class="xray-block actions-block">
        <div class="block-title">⚡ Ações Rápidas</div>
        <div class="actions-grid">
          ${blocks.actions.actions.map(action => `
            <button class="action-btn" data-action="${action.action}" title="${action.label}">
              <span>${action.icon}</span>
              <span>${action.label}</span>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(drawer);
  setupXRayHandlers(drawer, listing);
}

function setupXRayHandlers(drawer, listing) {
  // Fechar
  drawer.querySelector(".xray-close").addEventListener("click", () => {
    drawer.classList.add("closing");
    setTimeout(() => drawer.remove(), 300);
  });

  // Ações
  drawer.querySelectorAll(".action-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const action = e.currentTarget.dataset.action;
      handleXRayAction(action, listing);
    });
  });

  // ESC para fechar
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      drawer.classList.add("closing");
      setTimeout(() => drawer.remove(), 300);
      document.removeEventListener("keydown", handleEsc);
    }
  };
  document.addEventListener("keydown", handleEsc);
}

function handleXRayAction(action, listing) {
  switch(action) {
    case "edit-price":
      console.log("TODO: Abrir editor de preço", listing);
      break;
    case "pause":
      console.log("TODO: Pausar anúncio", listing);
      break;
    case "copy-sku":
      if (listing.sku) {
        navigator.clipboard.writeText(listing.sku);
        flashActionMessage("SKU copiado!");
      }
      break;
    case "open-ml":
      if (listing.permalink) window.open(listing.permalink, "_blank");
      break;
  }
}
