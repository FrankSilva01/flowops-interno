import { state, money, saveData } from "../core/state.js";
import { recordAudit } from "./logs.js";
import { showAppMessage, byId } from "../core/dom.js";

const ML_CONFIG = {
  elasticity: 1.2,
  minMargin: 0.15,
  maxMargin: 0.50,
};

export function analyzeMLPricing() {
  const listings = state.data?.listings || [];
  const recommendations = [];

  listings.forEach(listing => {
    const rec = generatePricingRecommendation(listing);
    if (rec) recommendations.push(rec);
  });

  return recommendations.sort((a, b) => b.potential_impact - a.potential_impact).slice(0, 10);
}

function generatePricingRecommendation(listing) {
  const current_price = Number(listing.price || 0);
  const cost = Number(listing.cost || 0);
  const visits = Number(listing.visits || 0) || 1;
  const conversions = Number(listing.sold_quantity || 0) || 0;
  const stock = Number(listing.stock || 0) || 0;

  const conversion_rate = (conversions / visits) * 100;
  const current_margin = ((current_price - cost) / current_price) * 100;
  const stock_velocity = conversions > 0 ? (conversions * 30) / stock : 0;

  const signals = {
    low_conversion: conversion_rate < 0.5,
    high_velocity: stock_velocity > 20,
    low_stock: stock < 5 && conversions > 0,
    low_margin: current_margin < ML_CONFIG.minMargin * 100,
    high_margin: current_margin > ML_CONFIG.maxMargin * 100,
    high_visits_low_sales: visits > 50 && conversions < 5,
  };

  let recommended_price = current_price;
  let reasoning = [];
  let confidence = 0.5;

  if (signals.low_margin) {
    recommended_price *= 1 + (ML_CONFIG.minMargin - current_margin / 100) * 0.5;
    reasoning.push("Margem abaixo do mínimo ideal");
    confidence = Math.max(confidence, 0.85);
  }

  if (signals.high_visits_low_sales) {
    const discount = 0.05 * (1 - conversion_rate / 1);
    recommended_price *= 1 - discount;
    reasoning.push("Alta visitação mas baixa conversão");
    confidence = Math.max(confidence, 0.80);
  }

  if (signals.high_velocity && !signals.low_stock) {
    const premium = 0.08 * (stock_velocity / 30);
    recommended_price *= 1 + premium;
    reasoning.push("Estoque com alta velocidade");
    confidence = Math.max(confidence, 0.75);
  }

  if (signals.low_stock) {
    recommended_price *= 1.12;
    reasoning.push("Estoque crítico");
    confidence = Math.max(confidence, 0.90);
  }

  const price_change = recommended_price - current_price;
  const price_change_pct = (price_change / current_price) * 100;

  if (Math.abs(price_change_pct) < 2) return null;

  return {
    id: listing.id,
    name: listing.name || listing.title,
    current_price,
    recommended_price: Math.round(recommended_price * 100) / 100,
    price_change,
    price_change_pct: Math.round(price_change_pct * 10) / 10,
    reasoning: reasoning.join(" + "),
    confidence: Math.round(confidence * 100),
    impact_metrics: {
      visits,
      conversion_rate: Math.round(conversion_rate * 100) / 100,
      current_margin: Math.round(current_margin),
      stock_velocity: Math.round(stock_velocity * 10) / 10,
    },
    potential_impact: Math.round((recommended_price * (conversions * 1.05)) - (current_price * conversions)),
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
          <p>Análise de ${recommendations.length} produtos</p>
        </div>

        <div class="recommendations-list">
          ${recommendations.map((rec, i) => `
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

              <button class="primary-btn small-btn" onclick="applyPriceRecommendation('${rec.id}', ${rec.recommended_price})">
                Aplicar
              </button>
            </div>
          `).join("")}
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

export function applyPriceRecommendation(listingId, newPrice) {
  const listing = state.data?.listings?.find(l => l.id === listingId);
  if (!listing) return;

  const oldPrice = Number(listing.price || 0);
  listing.price = newPrice;

  recordAudit("listing", listingId, "price_ml_recommendation", oldPrice, newPrice, "IA Pricing");
  saveData();
  showAppMessage(`✅ Preço atualizado: ${money.format(oldPrice)} → ${money.format(newPrice)}`, "success");
}

export const iaPricingCSS = `
.ml-pricing-dialog {
  max-width: 900px;
}

.pricing-info {
  background: #f0f0f0;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 20px;
}

.recommendations-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 500px;
  overflow-y: auto;
}

.recommendation-card {
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 15px;
  background: #fafafa;
}

.rec-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.rec-header strong {
  display: block;
  color: #333;
  margin-bottom: 3px;
}

.rec-header small {
  color: #666;
  font-style: italic;
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
  background: white;
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
  font-size: 18px;
  color: #00D084;
}

.price-item small {
  font-size: 11px;
  font-weight: bold;
}

.price-arrow {
  color: #ccc;
  font-size: 20px;
}

.small-btn {
  width: 100%;
  padding: 8px;
  font-size: 13px;
}
`;
