import { state, money } from "../core/state.js";
import { byId } from "../core/dom.js";

export function renderAdvancedDashboard() {
  const container = byId("advancedDashboard");
  if (!container) return;

  const orders = state.data?.orders || [];
  const cash = state.data?.cash || [];

  // Calculate metrics
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.charged || 0), 0);
  const totalExpense = cash.reduce((sum, c) => sum + Number(c.outcoming || 0), 0);
  const profit = totalRevenue - totalExpense;
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

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
    </div>
  `;
}

export const advancedDashboardCSS = ``;
