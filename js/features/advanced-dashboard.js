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
        <h3>Pedidos por Status</h3>
        <canvas id="statusChart"></canvas>
      </div>

      <div class="card">
        <h3>Receita vs Despesa</h3>
        <canvas id="profitChart"></canvas>
      </div>

      <div class="card full-width">
        <h3>Top 5 Produtos Vendidos</h3>
        <div id="topProducts" class="product-list"></div>
      </div>
    </div>
  `;

  renderSalesChart();
  renderStatusChart();
  renderProfitChart();
  renderTopProducts();
}

function renderSalesChart() {
  const orders = state.data?.orders || [];
  const last30days = {};

  orders.forEach(o => {
    const dateStr = o.createdAt || o.deliveryDate || "";
    if (dateStr) {
      const date = dateStr.split("T")?.[0] || dateStr;
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
  canvas.height = 250;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  ctx.fillStyle = "#1a1f2e";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#666";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    const value = ((maxValue * (5 - i)) / 5);
    ctx.fillText(money.format(value), padding - 10, y + 4);
  }

  ctx.fillStyle = "#00D084";
  ctx.textAlign = "center";
  const barWidth = chartWidth / (dates.length || 1);
  values.forEach((value, i) => {
    const x = padding + i * barWidth + barWidth / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = padding + chartHeight - barHeight;

    ctx.fillRect(x - barWidth / 3, y, barWidth * 0.6, barHeight);

    ctx.fillStyle = "#999";
    ctx.font = "11px sans-serif";
    ctx.fillText(dates[i].slice(5), x, height - 15);
    ctx.fillStyle = "#00D084";
  });
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
  const total = values.reduce((a, b) => a + b, 1);

  const canvas = document.getElementById("statusChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 200;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 30;

  ctx.fillStyle = "#1a1f2e";
  ctx.fillRect(0, 0, width, height);

  const colors = ["#00D084", "#4CAF50", "#ffc107", "#ff6b6b", "#845ef7"];
  let startAngle = -Math.PI / 2;

  values.forEach((value, i) => {
    const sliceAngle = (value / total) * Math.PI * 2;

    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#1a1f2e";
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle += sliceAngle;
  });

  ctx.fillStyle = "#999";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  let angle = -Math.PI / 2;
  values.forEach((value, i) => {
    const sliceAngle = (value / total) * Math.PI * 2;
    const labelAngle = angle + sliceAngle / 2;
    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

    ctx.fillText(`${Math.round((value / total) * 100)}%`, labelX, labelY);
    angle += sliceAngle;
  });
}

function renderProfitChart() {
  const orders = state.data?.orders || [];
  const cash = state.data?.cash || [];

  const last30days = {};

  orders.forEach(o => {
    const dateStr = o.createdAt || o.deliveryDate || "";
    if (dateStr) {
      const date = dateStr.split("T")?.[0] || dateStr;
      const orderDate = new Date(date);
      const now = new Date();
      const daysDiff = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 30 && daysDiff >= 0) {
        if (!last30days[date]) last30days[date] = { income: 0, expense: 0 };
        last30days[date].income = (last30days[date].income || 0) + Number(o.charged || 0);
      }
    }
  });

  cash.forEach(c => {
    const dateStr = c.date || "";
    if (dateStr) {
      const date = dateStr.split("T")?.[0] || dateStr;
      const cashDate = new Date(date);
      const now = new Date();
      const daysDiff = Math.floor((now - cashDate) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 30 && daysDiff >= 0) {
        if (!last30days[date]) last30days[date] = { income: 0, expense: 0 };
        last30days[date].expense = (last30days[date].expense || 0) + Number(c.outcoming || 0);
      }
    }
  });

  const dates = Object.keys(last30days).sort().slice(-7);
  const income = dates.map(d => last30days[d]?.income || 0);
  const expense = dates.map(d => last30days[d]?.expense || 0);
  const maxValue = Math.max(...income, ...expense, 1);

  const canvas = document.getElementById("profitChart");
  if (!canvas) return;

  canvas.width = canvas.offsetWidth;
  canvas.height = 200;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  ctx.fillStyle = "#1a1f2e";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight * i) / 5;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  const barWidth = chartWidth / (dates.length || 1);

  income.forEach((value, i) => {
    const x = padding + i * barWidth + barWidth / 4;
    const barHeight = (value / maxValue) * chartHeight;
    const y = padding + chartHeight - barHeight;

    ctx.fillStyle = "#00D084";
    ctx.fillRect(x, y, barWidth / 3, barHeight);
  });

  expense.forEach((value, i) => {
    const x = padding + i * barWidth + barWidth / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = padding + chartHeight - barHeight;

    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(x, y, barWidth / 3, barHeight);
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
      <div class="product-row">
        <div class="product-rank">#${i + 1}</div>
        <div class="product-info">
          <strong>${p.name}</strong>
          <small>${p.count} vendas • ${money.format(p.revenue)}</small>
        </div>
      </div>
    `).join("") :
    "<p>Sem dados de produtos</p>";
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
  border: 1px solid #222;
  border-radius: 8px;
  padding: 20px;
  color: #fff;
}

.card h3 {
  margin: 0 0 15px 0;
  font-size: 14px;
  color: #00D084;
  text-transform: uppercase;
  font-weight: 600;
}

.card.full-width {
  grid-column: 1 / -1;
}

canvas {
  width: 100%;
  height: auto;
  display: block;
  background: #1a1f2e;
  border-radius: 4px;
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.product-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #1a1f2e;
  border-radius: 4px;
  border-left: 3px solid #00D084;
}

.product-rank {
  font-weight: bold;
  color: #00D084;
  font-size: 18px;
  min-width: 30px;
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

.advanced-dashboard {
  margin-top: 30px;
}
`;
