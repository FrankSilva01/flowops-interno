import { state, money } from "../core/state.js";
import { byId } from "../core/dom.js";

export function renderAdvancedDashboard() {
  const container = byId("advancedDashboard");
  if (!container) return;

  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="card full-width">
        <h3>Vendas (Últimos 30 dias)</h3>
        <canvas id="salesChart"></canvas>
      </div>

      <div class="card">
        <h3>Lucratividade por Categoria</h3>
        <canvas id="profitChart"></canvas>
      </div>

      <div class="card">
        <h3>Marketplace Performance</h3>
        <canvas id="marketplaceChart"></canvas>
      </div>

      <div class="card">
        <h3>Top 5 Produtos</h3>
        <div id="topProducts" class="product-list"></div>
      </div>

      <div class="card full-width">
        <h3>Métrica de Conversão</h3>
        <canvas id="conversionChart"></canvas>
      </div>
    </div>
  `;

  renderSalesChart();
  renderProfitChart();
  renderMarketplaceChart();
  renderTopProducts();
  renderConversionChart();
}

function renderSalesChart() {
  const orders = state.data?.orders || [];
  const last30days = {};

  orders.forEach(o => {
    const date = new Date(o.created_at).toISOString().split("T")[0];
    if (date >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]) {
      last30days[date] = (last30days[date] || 0) + Number(o.charged || 0);
    }
  });

  const maxValue = Math.max(...Object.values(last30days), 1);
  const dates = Object.keys(last30days).slice(-7);
  const values = dates.map(d => last30days[d]);

  const canvas = document.getElementById("salesChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = (height * i) / 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const barWidth = width / dates.length;
  ctx.fillStyle = "#00D084";
  values.forEach((value, i) => {
    const barHeight = (value / maxValue) * (height * 0.8);
    ctx.fillRect(i * barWidth + 5, height - barHeight - 20, barWidth - 10, barHeight);
  });

  ctx.fillStyle = "#666";
  ctx.font = "12px Arial";
  dates.forEach((date, i) => {
    ctx.fillText(date.slice(5), i * barWidth + barWidth / 2 - 15, height - 5);
  });
}

function renderProfitChart() {
  const listings = state.data?.listings || [];
  const categoryProfits = {};

  listings.forEach(l => {
    const cat = l.category || "Sem Categoria";
    const profit = (Number(l.price || 0) - Number(l.cost || 0)) * Number(l.sold_quantity || 0);
    categoryProfits[cat] = (categoryProfits[cat] || 0) + profit;
  });

  const canvas = document.getElementById("profitChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const categories = Object.keys(categoryProfits).slice(0, 5);
  const values = categories.map(c => categoryProfits[c]);
  const total = values.reduce((a, b) => a + b, 1);

  let currentAngle = 0;
  const colors = ["#00D084", "#ffc107", "#ff6b6b", "#4CAF50", "#2196F3"];

  categories.forEach((cat, i) => {
    const sliceAngle = (values[i] / total) * 2 * Math.PI;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 60, currentAngle, currentAngle + sliceAngle);
    ctx.lineTo(width / 2, height / 2);
    ctx.fill();
    currentAngle += sliceAngle;
  });

  ctx.fillStyle = "#333";
  ctx.font = "12px Arial";
  categories.forEach((cat, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(width - 150, 20 + i * 20, 12, 12);
    ctx.fillStyle = "#333";
    ctx.fillText(`${cat}: ${((values[i] / total) * 100).toFixed(0)}%`, width - 130, 30 + i * 20);
  });
}

function renderMarketplaceChart() {
  const listings = state.data?.listings || [];
  const ml = listings.filter(l => l.marketplace === "mercado_livre");
  const shopee = listings.filter(l => l.marketplace === "shopee");
  const amazon = listings.filter(l => l.marketplace === "amazon");

  const canvas = document.getElementById("marketplaceChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const data = [
    { name: "Mercado Livre", value: ml.length, color: "#00D084" },
    { name: "Shopee", value: shopee.length, color: "#ffc107" },
    { name: "Amazon", value: amazon.length, color: "#ff6b6b" }
  ];

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const barWidth = width / data.length;

  data.forEach((item, i) => {
    const barHeight = (item.value / maxValue) * (height * 0.7);
    ctx.fillStyle = item.color;
    ctx.fillRect(i * barWidth + 10, height - barHeight - 30, barWidth - 20, barHeight);

    ctx.fillStyle = "#333";
    ctx.font = "12px Arial";
    ctx.fillText(item.name, i * barWidth + 15, height - 10);
    ctx.fillText(item.value, i * barWidth + barWidth / 2 - 10, height - barHeight - 10);
  });
}

function renderTopProducts() {
  const listings = state.data?.listings || [];
  const container = document.getElementById("topProducts");
  if (!container) return;

  const top5 = listings
    .sort((a, b) => Number(b.sold_quantity || 0) - Number(a.sold_quantity || 0))
    .slice(0, 5);

  container.innerHTML = top5.map(l => `
    <div class="product-row">
      <div class="product-name">${l.name || l.title}</div>
      <div class="product-stats">
        <span>📊 ${l.sold_quantity || 0} vendas</span>
        <span>💰 ${money.format(l.price)}</span>
      </div>
    </div>
  `).join("");
}

function renderConversionChart() {
  const listings = state.data?.listings || [];
  const canvas = document.getElementById("conversionChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const data = listings.map((l, i) => {
    const visits = Number(l.visits || 0) || 1;
    const conversion = (Number(l.sold_quantity || 0) / visits) * 100;
    return { x: i * (width / listings.length), y: height - (conversion * height) / 2 };
  }).slice(0, 10);

  ctx.strokeStyle = "#00D084";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((point, i) => {
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  ctx.fillStyle = "#00D084";
  data.forEach(point => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
    ctx.fill();
  });
}

export const advancedDashboardCSS = `
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card.full-width {
  grid-column: 1 / -1;
}

.card h3 {
  margin-top: 0;
  color: #00D084;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.card canvas {
  width: 100%;
  height: 300px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.product-row {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 4px;
  border-left: 3px solid #00D084;
}

.product-name {
  font-weight: 600;
  color: #333;
}

.product-stats {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: #666;
}
`;
