import { state, money } from "../core/state.js";
import { byId } from "../core/dom.js";
import { setView } from "../core/router.js";

export function renderAdvancedDashboard() {
  const container = byId("advancedDashboard");
  if (!container) return;

  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="card full-width">
        <h3>📊 Vendas (Últimos 30 dias)</h3>
        <canvas id="salesChart"></canvas>
      </div>

      <div class="card">
        <h3>💰 Lucratividade Acumulada</h3>
        <canvas id="profitChart"></canvas>
      </div>

      <div class="card">
        <h3>📦 Pedidos por Status</h3>
        <canvas id="statusChart"></canvas>
      </div>

      <div class="card">
        <h3>🎯 Marketplace Sales</h3>
        <canvas id="marketplaceChart"></canvas>
      </div>

      <div class="card full-width">
        <h3>🏆 Top 5 Produtos Vendidos</h3>
        <div id="topProducts" class="product-list"></div>
      </div>

      <div class="card full-width">
        <h3>📈 Taxa de Conversão por Dia</h3>
        <canvas id="conversionChart"></canvas>
      </div>
    </div>
  `;

  renderSalesChart();
  renderProfitChart();
  renderStatusChart();
  renderMarketplaceChart();
  renderTopProducts();
  renderConversionChart();
}

function renderSalesChart() {
  const orders = state.data?.orders || [];
  const last30days = {};

  orders.forEach(o => {
    const dateStr = o.createdAt || o.deliveryDate || "";
    if (dateStr) {
      const date = dateStr.split("T")[0];
      const orderDate = new Date(date);
      const now = new Date();
      const daysDiff = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 30 && daysDiff >= 0) {
        last30days[date] = (last30days[date] || 0) + Number(o.charged || 0);
      }
    }
  });

  const dates = Object.keys(last30days).sort().slice(-7);
  const values = dates.map(d => last30days[d]);
  const maxValue = Math.max(...values, 1);

  const canvas = document.getElementById("salesChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 280;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 50;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#00D084";
  ctx.textAlign = "right";
  ctx.font = "11px sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartHeight * i) / 4;
    const value = ((maxValue * (4 - i)) / 4);
    ctx.fillText(money.format(value), padding - 10, y + 3);
  }

  const barWidth = chartWidth / (dates.length || 1);
  values.forEach((value, i) => {
    const x = padding + i * barWidth + barWidth / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = padding + chartHeight - barHeight;

    ctx.fillStyle = "#00D084";
    ctx.fillRect(x - barWidth * 0.35, y, barWidth * 0.7, barHeight);

    ctx.fillStyle = "#999";
    ctx.textAlign = "center";
    ctx.font = "10px sans-serif";
    ctx.fillText(dates[i].slice(5), x, height - 15);
  });
}

function renderProfitChart() {
  const orders = state.data?.orders || [];
  const cash = state.data?.cash || [];

  let totalProfit = 0;
  orders.forEach(o => {
    totalProfit += Number(o.charged || 0);
  });
  cash.forEach(c => {
    totalProfit -= Number(c.outcoming || 0);
  });

  const canvas = document.getElementById("profitChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 180;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  const isPositive = totalProfit >= 0;
  const angleEnd = isPositive ? Math.PI * 2 : Math.PI;

  ctx.fillStyle = isPositive ? "#00D084" : "#ff6b6b";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, angleEnd - Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radius, angleEnd - Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = isPositive ? "#00D084" : "#ff6b6b";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(money.format(Math.abs(totalProfit)), centerX, centerY - 10);

  ctx.fillStyle = "#999";
  ctx.font = "12px sans-serif";
  ctx.fillText(isPositive ? "Lucro" : "Prejuízo", centerX, centerY + 20);
}

function renderStatusChart() {
  const orders = state.data?.orders || [];
  const statusCount = {};

  orders.forEach(o => {
    const status = o.status || "Sem status";
    statusCount[status] = (statusCount[status] || 0) + 1;
  });

  const labels = Object.keys(statusCount);
  const values = Object.values(statusCount);

  const canvas = document.getElementById("statusChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 180;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);

  const barWidth = width / (labels.length || 1);
  const maxValue = Math.max(...values, 1);

  const colors = ["#00D084", "#4CAF50", "#ffc107", "#ff6b6b", "#845ef7"];

  values.forEach((value, i) => {
    const barHeight = (value / maxValue) * (height * 0.8);
    const x = i * barWidth + 5;
    const y = height - barHeight - 25;

    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, barWidth - 10, barHeight);

    ctx.fillStyle = "#999";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labels[i].slice(0, 8), x + barWidth / 2 - 5, height - 5);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(value, x + barWidth / 2 - 5, y - 5);
  });
}

function renderMarketplaceChart() {
  const sales = state.marketplaceSales || [];
  const channelSales = {};

  sales.forEach(s => {
    const channel = s.marketplace || "Direct";
    channelSales[channel] = (channelSales[channel] || 0) + Number(s.price || 0);
  });

  const channels = Object.keys(channelSales);
  const salesValues = Object.values(channelSales);
  const total = salesValues.reduce((a, b) => a + b, 1);

  const canvas = document.getElementById("marketplaceChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 180;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 30;

  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);

  const colors = ["#00D084", "#4CAF50", "#ffc107", "#ff6b6b", "#845ef7"];
  let startAngle = -Math.PI / 2;

  salesValues.forEach((value, i) => {
    const sliceAngle = (value / total) * Math.PI * 2;

    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#0f1419";
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle += sliceAngle;
  });
}

function renderTopProducts() {
  const orders = state.data?.orders || [];
  const productCount = {};
  const productRevenue = {};

  orders.forEach(o => {
    const desc = o.description || "Sem descrição";
    productCount[desc] = (productCount[desc] || 0) + 1;
    productRevenue[desc] = (productRevenue[desc] || 0) + Number(o.charged || 0);
  });

  const top5 = Object.keys(productCount)
    .map(name => ({
      name,
      count: productCount[name],
      revenue: productRevenue[name],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const container = byId("topProducts");
  if (!container) return;

  container.innerHTML = top5.length ?
    top5.map((p, i) => `
      <div class="product-row" data-product="${p.name}" style="cursor: pointer;">
        <div class="product-rank">#${i + 1}</div>
        <div class="product-info">
          <strong>${p.name}</strong>
          <small>${p.count} vendas • ${money.format(p.revenue)}</small>
        </div>
        <div class="product-badge">${p.count}</div>
      </div>
    `).join("") :
    "<p>Sem dados de produtos</p>";

  container.querySelectorAll(".product-row").forEach(row => {
    row.addEventListener("click", () => {
      const productName = row.dataset.product;
      setView("orders", true);
      setTimeout(() => {
        const searchInput = byId("orderFilterInput");
        if (searchInput) {
          searchInput.value = productName;
          searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, 100);
    });
  });
}

function renderConversionChart() {
  const orders = state.data?.orders || [];
  const dailyConversion = {};

  orders.forEach(o => {
    const dateStr = o.createdAt || o.deliveryDate || "";
    if (dateStr) {
      const date = dateStr.split("T")[0];
      if (!dailyConversion[date]) {
        dailyConversion[date] = { visited: 1, converted: 1 };
      } else {
        dailyConversion[date].visited += 1;
        dailyConversion[date].converted += 1;
      }
    }
  });

  const dates = Object.keys(dailyConversion).sort().slice(-7);
  const conversions = dates.map(d => ((dailyConversion[d].converted / dailyConversion[d].visited) * 100) || 0);
  const maxValue = Math.max(...conversions, 1);

  const canvas = document.getElementById("conversionChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 220;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#4CAF50";
  ctx.lineWidth = 2;
  ctx.beginPath();

  conversions.forEach((conv, i) => {
    const x = padding + (chartWidth * i) / (conversions.length - 1 || 1);
    const y = padding + chartHeight - (conv / maxValue) * chartHeight;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    ctx.fillStyle = "#4CAF50";
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.stroke();

  ctx.fillStyle = "#999";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  dates.forEach((date, i) => {
    const x = padding + (chartWidth * i) / (dates.length - 1 || 1);
    ctx.fillText(date.slice(5), x, height - 15);
  });

  ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    const value = ((maxValue * (5 - i)) / 5);
    ctx.fillText(`${Math.round(value)}%`, padding - 10, y + 3);
  }
}

export const advancedDashboardCSS = `
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.card {
  background: #0f1419;
  border: 1px solid #1a2332;
  border-radius: 8px;
  padding: 20px;
  color: #fff;
}

.card h3 {
  margin: 0 0 15px 0;
  font-size: 13px;
  color: #00D084;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.card.full-width {
  grid-column: 1 / -1;
}

canvas {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 4px;
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.product-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #1a2332;
  border-radius: 6px;
  border-left: 3px solid #00D084;
  transition: all 0.2s;
}

.product-row:hover {
  background: #23303f;
  transform: translateX(4px);
}

.product-rank {
  font-weight: bold;
  color: #00D084;
  font-size: 16px;
  min-width: 28px;
  text-align: center;
}

.product-info {
  flex: 1;
}

.product-info strong {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
  color: #fff;
}

.product-info small {
  color: #999;
  font-size: 11px;
}

.product-badge {
  background: #00D084;
  color: #0f1419;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
  min-width: 30px;
  text-align: center;
}

.advanced-dashboard {
  margin-top: 30px;
}
`;
