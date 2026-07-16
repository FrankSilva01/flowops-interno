import { state, money, saveData } from "../core/state.js";
import { showAppMessage, byId } from "../core/dom.js";
import { recordAudit } from "./logs.js";

const ML_CONFIG = {
  elasticity: 1.2,
  minMargin: 0.15,
  maxMargin: 0.50,
};

export function analyzeMLPricing() {
  const orders = state.data?.orders || [];
  if (!orders.length) return [];

  const recommendations = [];
  const productAnalysis = {};

  orders.forEach(order => {
    const key = order.description || "Produto sem descrição";
    if (!productAnalysis[key]) {
      productAnalysis[key] = {
        name: key,
        prices: [],
        count: 0,
        totalRevenue: 0,
      };
    }
    productAnalysis[key].prices.push(Number(order.charged || 0));
    productAnalysis[key].count++;
    productAnalysis[key].totalRevenue += Number(order.charged || 0);
  });

  Object.values(productAnalysis).forEach(product => {
    if (product.count > 0) {
      const rec = generatePricingRecommendation(product);
      if (rec) recommendations.push(rec);
    }
  });

  return recommendations.sort((a, b) => b.potential_impact - a.potential_impact).slice(0, 10);
}

function generatePricingRecommendation(product) {
  const current_price = Math.max(...product.prices);
  const avg_price = product.prices.reduce((a, b) => a + b, 0) / product.prices.length;
  const count = product.count;
  const cost = avg_price * 0.4;

  const current_margin = ((current_price - cost) / current_price) * 100;

  let recommended_price = current_price;
  let reasoning = [];
  let confidence = 0.5;

  if (current_margin < 20) {
    recommended_price = current_price * 1.08;
    reasoning.push("Margem baixa");
    confidence = 0.85;
  } else if (current_margin > 40) {
    recommended_price = current_price * 0.95;
    reasoning.push("Margem alta");
    confidence = 0.70;
  } else if (count > 5) {
    recommended_price = current_price * 1.05;
    reasoning.push("Produto com alta demanda");
    confidence = 0.80;
  }

  const price_change = recommended_price - current_price;
  const price_change_pct = (price_change / current_price) * 100;

  if (Math.abs(price_change_pct) < 2) return null;

  return {
    id: product.name,
    name: product.name,
    current_price: Number(current_price.toFixed(2)),
    recommended_price: Number(recommended_price.toFixed(2)),
    price_change: Number(price_change.toFixed(2)),
    price_change_pct: Number(price_change_pct.toFixed(1)),
    reasoning: reasoning.length ? reasoning.join(" + ") : "Ajuste recomendado",
    confidence: Math.round(confidence * 100),
    sold: count,
    current_margin: Math.round(current_margin),
    potential_impact: Math.round((recommended_price * count * 1.05) - (current_price * count)),
  };
}

export function openMLPricingDialog() {
  const recommendations = analyzeMLPricing();

  const modal = document.createElement("dialog");
  modal.className = "modal";

  if (recommendations.length === 0) {
    modal.innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <p style="color: #999; margin-bottom: 20px;">Nenhuma recomendação de preço disponível. Adicione mais vendas para análise.</p>
        <button class="primary-btn" data-pricing-close type="button">Fechar</button>
      </div>
    `;
  } else {
    modal.innerHTML = `
      <div style="padding: 20px; max-width: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px;">🤖 IA de Precificação</h2>
          <button data-pricing-close type="button" aria-label="Fechar" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">✕</button>
        </div>

        <p style="color: #999; font-size: 12px; margin-bottom: 20px;">Análise de ${recommendations.length} produto(s) com oportunidades de otimização</p>

        <div style="display: flex; flex-direction: column; gap: 15px; max-height: 400px; overflow-y: auto;">
          ${recommendations.map((rec) => `
            <div style="border: 1px solid #222; padding: 15px; border-radius: 6px; background: #0f1419;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div>
                  <strong style="display: block; font-size: 13px; margin-bottom: 4px;">${rec.name}</strong>
                  <small style="color: #999; font-size: 11px;">${rec.reasoning}</small>
                </div>
                <span style="background: ${rec.confidence >= 80 ? '#00D084' : rec.confidence >= 70 ? '#4CAF50' : '#ffc107'}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; white-space: nowrap; margin-left: 10px;">
                  ${rec.confidence}%
                </span>
              </div>

              <div style="background: #1a2332; padding: 12px; border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div>
                    <span style="color: #999;">Atual</span><br>
                    <strong style="color: #00D084; font-size: 14px;">${money.format(rec.current_price)}</strong>
                  </div>
                  <div>
                    <span style="color: #999;">Recomendado</span><br>
                    <strong style="color: ${rec.price_change > 0 ? '#00D084' : '#ffc107'}; font-size: 14px;">${money.format(rec.recommended_price)}</strong>
                    <small style="display: block; margin-top: 4px;">${rec.price_change > 0 ? '+' : ''}${rec.price_change_pct}%</small>
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; font-size: 11px; text-align: center; color: #999;">
                <div><strong style="color: #fff; display: block;">${rec.sold}</strong>vendas</div>
                <div><strong style="color: #fff; display: block;">${rec.current_margin}%</strong>margem</div>
                <div><strong style="color: #00D084; display: block;">${money.format(rec.potential_impact)}</strong>impacto</div>
              </div>

              <button class="primary-btn" data-pricing-product="${rec.id}" data-pricing-value="${rec.recommended_price}" type="button" style="width: 100%; padding: 8px; font-size: 13px;">
                Aplicar
              </button>
            </div>
          `).join("")}
        </div>

        <div style="margin-top: 20px; display: flex; gap: 10px;">
          <button class="secondary-btn" data-pricing-close type="button" style="flex: 1; padding: 8px;">Fechar</button>
        </div>
      </div>
    `;
  }

  document.body.appendChild(modal);
  modal.querySelectorAll("[data-pricing-close]").forEach((button) => {
    button.addEventListener("click", () => modal.close());
  });
  modal.querySelectorAll("[data-pricing-product]").forEach((button) => {
    button.addEventListener("click", () => applyPriceRecommendation(button.dataset.pricingProduct, Number(button.dataset.pricingValue)));
  });
  modal.showModal();

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.close();
    }
  });
}

export function applyPriceRecommendation(productName, newPrice) {
  const order = state.data?.orders?.find(o => o.description === productName);
  if (!order) {
    showAppMessage("Produto não encontrado", "error");
    return;
  }

  const oldPrice = Number(order.charged || 0);
  order.charged = newPrice;

  recordAudit("order", order.id, "price_ml_recommendation", oldPrice, newPrice, "IA Pricing");
  saveData();
  showAppMessage(`✅ Preço atualizado: ${money.format(oldPrice)} → ${money.format(newPrice)}`, "success");

  const modal = document.querySelector(".modal");
  if (modal) modal.close();
}

export const iaPricingCSS = ``;
