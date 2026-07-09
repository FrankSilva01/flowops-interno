import { state, money } from "../core/state.js";
import { byId, html } from "../core/dom.js";

// ========================================================================
// ANÁLISE DE PREÇO: Histórico + Correlação com Vendas
// ========================================================================

const ANALYSIS_PERIOD_DAYS = 30;

export function getPriceHistory(listing) {
  const priceChanges = (state.priceHistory || []).filter(ph =>
    ph.marketplace === listing.marketplace &&
    ph.external_listing_id === listing.external_id
  );
  return priceChanges.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
}

export function buildPriceCorrelation(listing) {
  const priceHistory = getPriceHistory(listing);
  if (!priceHistory.length) return null;

  const recentChange = priceHistory[0]; // Mudança mais recente
  if (!recentChange) return null;

  const changeDate = new Date(recentChange.changed_at);
  const daysAgo = (Date.now() - changeDate.getTime()) / (1000 * 60 * 60 * 24);

  // Período: 14 dias antes e 14 dias depois (ou até agora)
  const beforeStart = new Date(changeDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const afterEnd = new Date();

  // Vendas no período antes da mudança
  const salesBefore = state.marketplaceSales.filter(s => {
    const saleDate = new Date(s.date_created || Date.now());
    return s.marketplace === listing.marketplace &&
      s.external_id === listing.external_id &&
      saleDate >= beforeStart &&
      saleDate < changeDate;
  });

  // Vendas no período depois da mudança
  const salesAfter = state.marketplaceSales.filter(s => {
    const saleDate = new Date(s.date_created || Date.now());
    return s.marketplace === listing.marketplace &&
      s.external_id === listing.external_id &&
      saleDate >= changeDate &&
      saleDate <= afterEnd;
  });

  const daysBefore = Math.max(1, (changeDate - beforeStart) / (1000 * 60 * 60 * 24));
  const daysAfter = Math.min(14, (afterEnd - changeDate) / (1000 * 60 * 60 * 24));

  const salesPerDayBefore = salesBefore.length / daysBefore;
  const salesPerDayAfter = salesAfter.length / Math.max(1, daysAfter);

  const salesChange = salesPerDayBefore > 0
    ? ((salesPerDayAfter - salesPerDayBefore) / salesPerDayBefore) * 100
    : (salesPerDayAfter > 0 ? 100 : 0);

  const revenueBeforeKnown = salesBefore.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const revenueAfterKnown = salesAfter.reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const priceChange = recentChange.new_price - recentChange.old_price;
  const priceChangePercent = recentChange.change_percent;

  return {
    change: recentChange,
    daysAgo: Math.round(daysAgo * 10) / 10,
    direction: priceChange > 0 ? "increase" : "decrease",
    priceChange,
    priceChangePercent,
    salesBefore: salesBefore.length,
    salesAfter: salesAfter.length,
    salesPerDayBefore: Math.round(salesPerDayBefore * 100) / 100,
    salesPerDayAfter: Math.round(salesPerDayAfter * 100) / 100,
    salesChange: Math.round(salesChange * 100) / 100,
    revenueBefore: revenueBeforeKnown,
    revenueAfter: revenueAfterKnown,
    daysDataAvailable: Math.round(daysAfter),
    isRecent: daysAgo < 1,
    isPending: daysAgo < 7 // "Aguardando dados" se menos de 7 dias
  };
}

export function getPriceAnalysisInsight(correlation) {
  if (!correlation) return null;

  const { priceChangePercent, salesChange, direction, daysAgo, isPending } = correlation;

  if (isPending) {
    return {
      type: "pending",
      text: `⏳ Mudança ${daysAgo < 1 ? "hoje" : `há ${Math.round(daysAgo)} dias`} — aguardando dados de vendas.`,
      color: "#FFB84D"
    };
  }

  // Redução de preço
  if (direction === "decrease") {
    const impactScore = Math.abs(salesChange);
    if (impactScore > 50) {
      return {
        type: "success",
        text: `✅ Redução de ${Math.abs(priceChangePercent).toFixed(1)}% aumentou vendas em ${salesChange.toFixed(0)}% — excelente decisão!`,
        color: "#51CF66"
      };
    } else if (impactScore > 0) {
      return {
        type: "good",
        text: `✓ Redução de ${Math.abs(priceChangePercent).toFixed(1)}% resultou em +${salesChange.toFixed(0)}% vendas.`,
        color: "#51CF66"
      };
    } else {
      return {
        type: "neutral",
        text: `→ Redução de ${Math.abs(priceChangePercent).toFixed(1)}% não afetou vendas (há espaço pra ir mais baixo?).`,
        color: "#FFB84D"
      };
    }
  }

  // Aumento de preço
  if (direction === "increase") {
    const impactScore = Math.abs(salesChange);
    if (impactScore > 30) {
      return {
        type: "warning",
        text: `⚠️ Aumento de ${priceChangePercent.toFixed(1)}% reduziu vendas em ${impactScore.toFixed(0)}% — preço acima do tolerável.`,
        color: "#FF8787"
      };
    } else if (impactScore > 10) {
      return {
        type: "caution",
        text: `△ Aumento de ${priceChangePercent.toFixed(1)}% reduziu vendas em ${impactScore.toFixed(0)}%.`,
        color: "#FFB84D"
      };
    } else {
      return {
        type: "success",
        text: `✅ Aumento de ${priceChangePercent.toFixed(1)}% não afetou vendas — havia espaço pra subir!`,
        color: "#51CF66"
      };
    }
  }

  return null;
}

export function renderPriceHistoryTable(listing) {
  const priceHistory = getPriceHistory(listing);
  if (!priceHistory.length) {
    return `<div class="empty-state">Sem histórico de preços</div>`;
  }

  return `
    <div class="price-history-table">
      <div class="price-history-header">
        <div>Data</div>
        <div>Preço Anterior</div>
        <div>Preço Novo</div>
        <div>Mudança</div>
        <div>%</div>
      </div>
      ${priceHistory.slice(0, 10).map(ph => {
        const date = new Date(ph.changed_at);
        const dateStr = date.toLocaleDateString("pt-BR");
        const changePercent = ph.change_percent;
        const directionClass = changePercent > 0 ? "increase" : "decrease";

        return `
          <div class="price-history-row">
            <div>${dateStr}</div>
            <div>${money.format(ph.old_price)}</div>
            <div>${money.format(ph.new_price)}</div>
            <div class="price-diff ${directionClass}">
              ${changePercent > 0 ? "+" : ""}${money.format(ph.new_price - ph.old_price)}
            </div>
            <div class="price-pct ${directionClass}">
              ${changePercent > 0 ? "+" : ""}${changePercent.toFixed(1)}%
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

export function renderPriceAnalysisChart(listing) {
  const correlation = buildPriceCorrelation(listing);
  if (!correlation) {
    return `<div class="empty-state">Sem dados de correlação</div>`;
  }

  const insight = getPriceAnalysisInsight(correlation);
  const { salesPerDayBefore, salesPerDayAfter, direction, change, daysDataAvailable } = correlation;

  // Criar mini-gráfico com barras
  const maxSales = Math.max(salesPerDayBefore, salesPerDayAfter, 1);
  const beforeHeight = (salesPerDayBefore / maxSales) * 100;
  const afterHeight = (salesPerDayAfter / maxSales) * 100;

  return `
    <div class="price-analysis-card">
      <div class="price-analysis-insight" style="border-left: 4px solid ${insight.color}">
        <strong>${insight.text}</strong>
      </div>

      <div class="price-change-summary">
        <div class="change-item">
          <div class="change-label">Mudança de Preço</div>
          <div class="change-value ${direction}">
            ${direction === "increase" ? "📈" : "📉"}
            ${change.new_price > change.old_price ? "+" : ""}${money.format(change.new_price - change.old_price)}
            (${change.change_percent > 0 ? "+" : ""}${change.change_percent.toFixed(1)}%)
          </div>
        </div>

        <div class="change-item">
          <div class="change-label">Vendas/dia Antes</div>
          <div class="change-value">${salesPerDayBefore.toFixed(1)} vend/dia</div>
        </div>

        <div class="change-item">
          <div class="change-label">Vendas/dia Depois</div>
          <div class="change-value">${salesPerDayAfter.toFixed(1)} vend/dia</div>
        </div>

        <div class="change-item">
          <div class="change-label">Mudança</div>
          <div class="change-value ${correlation.salesChange > 0 ? "positive" : "negative"}">
            ${correlation.salesChange > 0 ? "+" : ""}${correlation.salesChange.toFixed(0)}%
          </div>
        </div>
      </div>

      <div class="price-sales-bars">
        <div class="bar-container">
          <div class="bar before" style="height: ${beforeHeight}%"></div>
          <div class="bar-label">Antes</div>
        </div>
        <div class="bar-container">
          <div class="bar after" style="height: ${afterHeight}%"></div>
          <div class="bar-label">Depois</div>
        </div>
      </div>

      <div class="analysis-note">
        Dados de ${daysDataAvailable} dias após mudança ${daysDataAvailable < 7 ? "(período ainda curto)" : ""}
      </div>
    </div>
  `;
}
