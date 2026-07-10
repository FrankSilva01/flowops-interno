import { state, money, saveData } from "../core/state.js";
import { showAppMessage, byId } from "../core/dom.js";
import { recordAudit } from "./logs.js";

const ML_CONFIG = {
  elasticity: 1.2,
  minMargin: 0.15,
  maxMargin: 0.50,
};

export function analyzeMLPricing() {
  const sales = state.marketplaceSales || [];
  if (!sales.length) return [];

  const recommendations = [];
  const productAnalysis = {};

  sales.forEach(sale => {
    const key = sale.title || sale.name || "Produto";
    if (!productAnalysis[key]) {
      productAnalysis[key] = {
        title: key,
        prices: [],
        visits: 0,
        sold: 0,
        totalRevenue: 0,
      };
    }
    productAnalysis[key].prices.push(Number(sale.price || 0));
    productAnalysis[key].sold++;
    productAnalysis[key].totalRevenue += Number(sale.price || 0);
  });

  Object.values(productAnalysis).forEach(product => {
    const rec = generatePricingRecommendation(product);
    if (rec) recommendations.push(rec);
  });

  return recommendations.sort((a, b) => b.potential_impact - a.potential_impact).slice(0, 10);
}

function generatePricingRecommendation(product) {
  const current_price = Math.max(...product.prices);
  const avg_price = product.prices.reduce((a, b) => a + b, 0) / product.prices.length;
  const sold = product.sold;
  const visits = sold * 2; // Estimativa de visitas
  const cost = avg_price * 0.4; // Estimativa de custo = 40% do preço

  const conversion_rate = (sold / visits) * 100;
  const current_margin = ((current_price - cost) / current_price) * 100;
  const price_variance = Math.max(...product.prices) - Math.min(...product.prices);

  const signals = {
    low_conversion: conversion_rate < 2,
    high_variance: price_variance > current_price * 0.2,
    low_margin: current_margin < ML_CONFIG.minMargin * 100,
    high_margin: current_margin > ML_CONFIG.maxMargin * 100,
    high_velocity: sold > 5,
  };

  let recommended_price = current_price;
  let reasoning = [];
  let confidence = 0.5;

  if (signals.high_variance) {
    recommended_price = avg_price * 1.05;
    reasoning.push("Variação de preço detectada");
    confidence = Math.max(confidence, 0.75);
  }

  if (signals.low_margin && current_margin < 20) {
    recommended_price = current_price * 1.08;
    reasoning.push("Margem baixa");
    confidence = Math.max(confidence, 0.85);
  }

  if (signals.high_velocity) {
    recommended_price = current_price * 1.05;
    reasoning.push("Produto com alta demanda");
    confidence = Math.max(confidence, 0.80);
  }

  if (signals.high_margin && current_margin > 40) {
    recommended_price = current_price * 0.95;
    reasoning.push("Margem muito alta");
    confidence = Math.max(confidence, 0.70);
  }

  const price_change = recommended_price - current_price;
  const price_change_pct = (price_change / current_price) * 100;

  if (Math.abs(price_change_pct) < 2) return null;

  return {
    id: product.title,
    name: product.title,
    current_price,
    recommended_price: Math.round(recommended_price * 100) / 100,
    price_change,
    price_change_pct: Math.round(price_change_pct * 10) / 10,
    reasoning: reasoning.join(" + ") || "Ajuste recomendado",
    confidence: Math.round(confidence * 100),
    impact_metrics: {
      visits,
      conversion_rate: Math.round(conversion_rate * 100) / 100,
      current_margin: Math.round(current_margin),
      sold,
    },
    potential_impact: Math.round((recommended_price * sold * 1.05) - (current_price * sold)),
  };
}

export function openMLPricingDialog() {
  const recommendations = analyzeMLPricing();

  const modal = document.createElement("dialog");
  modal.className = "ml-pricing-dialog";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>🤖 IA de Precificação</h2>
        <button onclick="this.closest('dialog').close()">✕</button>
      </div>

      <div class="modal-body">
        <div class="pricing-info">
          <p>${recommendations.length ? `Análise de ${recommendations.length} produtos com oportunidades de otimização` : "Nenhuma recomendação de preço disponível. Adicione vendas de marketplace para análise."}</p>
        </div>

        <div class="recommendations-list">
          ${recommendations.length ? recommendations.map((rec, i) => `
            <div class="recommendation-card" data-rec-id="${rec.id}">
              <div class="rec-header">
                <div>
                  <strong>${rec.name}</strong>
                  <small>${rec.reasoning}</small>
                </div>
                <span class="confidence-badge" style="background: ${rec.confidence >= 85 ? '#00D084' : rec.confidence >= 75 ? '#4CAF50' : '#ffc107'}">
                  ${rec.confidence}%
                </span>
              </div>

              <div class="rec-prices">
                <div class="price-item">
                  <span>Atual</span>
                  <strong>${money.format(rec.current_price)}</strong>
                </div>
                <div class="price-arrow">→</div>
                <div class="price-item">
                  <span>Recomendado</span>
                  <strong style="color: ${rec.price_change > 0 ? '#00D084' : '#ffc107'}">
                    ${money.format(rec.recommended_price)}
                  </strong>
                  <small>${rec.price_change > 0 ? '+' : ''}${rec.price_change_pct}%</small>
                </div>
              </div>

              <div class="rec-metrics">
                <div><strong>${rec.impact_metrics.sold}</strong> vendas</div>
                <div><strong>${Math.round(rec.impact_metrics.conversion_rate)}%</strong> conversão</div>
                <div><strong>${rec.impact_metrics.current_margin}%</strong> margem</div>
              </div>

              <button class="primary-btn small-btn" onclick="applyPriceRecommendation('${rec.id.replace(/'/g, "\\'")}', ${rec.recommended_price})">
                Aplicar
              </button>
            </div>
          `).join("") : "<p style='text-align: center; padding: 20px;'>Adicione vendas de marketplace para receber recomendações de preço</p>"}
        </div>
      </div>

      <div class="modal-actions">
        <button class="secondary-btn" onclick="this.closest('dialog').close()">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.showModal();
}

export function applyPriceRecommendation(productName, newPrice) {
  const sale = state.marketplaceSales?.find(s => (s.title || s.name) === productName);
  if (!sale) {
    showAppMessage("Produto não encontrado", "error");
    return;
  }

  const oldPrice = Number(sale.price || 0);
  sale.price = newPrice;

  recordAudit("marketplace", productName, "price_ml_recommendation", oldPrice, newPrice, "IA Pricing");
  saveData();
  showAppMessage(`✅ Preço atualizado: ${money.format(oldPrice)} → ${money.format(newPrice)}`, "success");
}

export const iaPricingCSS = `
.ml-pricing-dialog {
  max-width: 900px;
}

.pricing-info {
  background: #1a2332;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 20px;
  border-left: 3px solid #00D084;
}

.pricing-info p {
  margin: 0;
  color: #ddd;
  font-size: 13px;
}

.recommendations-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 500px;
  overflow-y: auto;
}

.recommendation-card {
  border: 1px solid #222;
  border-radius: 6px;
  padding: 15px;
  background: #0f1419;
}

.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.rec-header strong {
  display: block;
  color: #fff;
  margin-bottom: 3px;
  font-size: 13px;
}

.rec-header small {
  color: #999;
  font-style: italic;
  font-size: 12px;
}

.confidence-badge {
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}

.rec-prices {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 12px;
  background: #1a2332;
  padding: 12px;
  border-radius: 4px;
}

.price-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-item span {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
}

.price-item strong {
  font-size: 16px;
  color: #00D084;
}

.price-item small {
  font-size: 11px;
  font-weight: bold;
}

.price-arrow {
  color: #666;
  font-size: 18px;
}

.rec-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 12px;
  font-size: 12px;
  text-align: center;
  color: #999;
}

.rec-metrics strong {
  color: #00D084;
  display: block;
}

.small-btn {
  width: 100%;
  padding: 8px;
  font-size: 13px;
}
`;
