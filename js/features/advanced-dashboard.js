import { state, money } from "../core/state.js";
import { byId } from "../core/dom.js";

export function renderAdvancedDashboard() {
  const container = byId("advancedDashboard");
  if (!container) return;

  const orders = state.data?.orders || [];
  const cash = state.data?.cash || [];

  // Calculate metrics
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.charged || 0), 0);
  const totalExpense = cash.reduce((sum, c) => sum + Number(c.outcoming || 0), 0);
  const profit = totalRevenue - totalExpense;
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

  // Status distribution
  const statusCounts = {};
  orders.forEach(o => {
    const status = o.status || "Sem status";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  // Daily revenue (last 7 days)
  const dailyRevenue = {};
  orders.forEach(o => {
    const date = (o.createdAt || o.deliveryDate || "").split("T")[0];
    if (date) {
      const orderDate = new Date(date);
      const today = new Date();
      const daysDiff = Math.floor((today - orderDate) / (1000 * 60 * 60 * 24));
      if (daysDiff <= 7 && daysDiff >= 0) {
        dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(o.charged || 0);
      }
    }
  });

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
      <!-- KPI Cards -->
      <div style="background: #0f1419; border: 1px solid #222; padding: 20px; border-radius: 8px; border-left: 3px solid #00D084;">
        <p style="margin: 0 0 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Receita Total</p>
        <strong style="color: #00D084; font-size: 24px;">${money.format(totalRevenue)}</strong>
        <p style="margin: 8px 0 0 0; color: #999; font-size: 11px;">${totalOrders} pedidos</p>
      </div>

      <div style="background: #0f1419; border: 1px solid #222; padding: 20px; border-radius: 8px; border-left: 3px solid #4CAF50;">
        <p style="margin: 0 0 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Lucro Líquido</p>
        <strong style="color: ${profit >= 0 ? '#4CAF50' : '#ff6b6b'}; font-size: 24px;">${money.format(profit)}</strong>
        <p style="margin: 8px 0 0 0; color: #999; font-size: 11px;">${money.format(totalRevenue)} - ${money.format(totalExpense)}</p>
      </div>

      <div style="background: #0f1419; border: 1px solid #222; padding: 20px; border-radius: 8px; border-left: 3px solid #ffc107;">
        <p style="margin: 0 0 8px 0; color: #999; font-size: 12px; text-transform: uppercase;">Ticket Médio</p>
        <strong style="color: #ffc107; font-size: 24px;">${money.format(avgOrderValue)}</strong>
        <p style="margin: 8px 0 0 0; color: #999; font-size: 11px;">por pedido</p>
      </div>

      <!-- Status Distribution -->
      <div style="background: #0f1419; border: 1px solid #222; padding: 20px; border-radius: 8px; grid-column: 1 / -1;">
        <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 14px; text-transform: uppercase;">Pedidos por Status</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([status, count], idx) => {
              const colors = ["#00D084", "#4CAF50", "#ffc107", "#ff6b6b", "#845ef7", "#3b82f6"];
              const color = colors[idx % colors.length];
              const percent = (count / totalOrders) * 100;
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-size: 12px; color: #ddd;">${status}</span>
                    <span style="font-size: 12px; color: #999;">${count} (${Math.round(percent)}%)</span>
                  </div>
                  <div style="height: 8px; background: #222; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${percent}%; background: ${color};"></div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>

      <!-- Daily Revenue Chart -->
      ${Object.keys(dailyRevenue).length > 0 ? `
        <div style="background: #0f1419; border: 1px solid #222; padding: 20px; border-radius: 8px; grid-column: 1 / -1;">
          <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 14px; text-transform: uppercase;">Receita (Últimos 7 dias)</h3>
          <div style="display: flex; align-items: flex-end; gap: 8px; height: 150px;">
            ${Object.keys(dailyRevenue)
              .sort()
              .slice(-7)
              .map(date => {
                const revenue = dailyRevenue[date];
                const maxRevenue = Math.max(...Object.values(dailyRevenue));
                const height = (revenue / maxRevenue) * 100;
                const dateObj = new Date(date);
                return `
                  <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                    <div style="width: 100%; height: ${height}%; background: #00D084; border-radius: 4px 4px 0 0; min-height: 8px;"></div>
                    <small style="margin-top: 8px; color: #999; font-size: 10px;">${dateObj.getDate()}/${dateObj.getMonth() + 1}</small>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export const advancedDashboardCSS = ``;
