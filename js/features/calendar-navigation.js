import { state } from "../core/state.js";
import { byId } from "../core/dom.js";

export function bindCalendarEvents() {
  // No-op for now
}

export function renderCalendarWithEvents(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  let html = `
    <div style="padding: 20px; background: #0f1419; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: #fff; font-size: 16px;">${monthNames[month]} ${year}</h3>
      </div>

      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 20px;">
  `;

  // Day headers
  dayNames.forEach(day => {
    html += `<div style="text-align: center; color: #999; font-size: 11px; font-weight: 600; padding: 8px 0; text-transform: uppercase;">${day}</div>`;
  });

  // Empty cells
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += `<div></div>`;
  }

  // Days
  const now = new Date();
  const today = now.getDate();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = day === today && month === thisMonth && year === thisYear;

    const dateStr = date.toISOString().split("T")[0];
    const events = getCalendarEvents(date);
    const hasEvents = events.length > 0;

    html += `
      <div style="
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 4px;
        border-radius: 6px;
        background: ${isToday ? '#00D084' : hasEvents ? '#1a2332' : 'transparent'};
        border: 1px solid ${isToday ? '#00D084' : hasEvents ? '#00D084' : 'transparent'};
        cursor: ${hasEvents ? 'pointer' : 'default'};
        transition: all 0.2s;
        color: ${isToday ? '#000' : '#fff'};
        font-weight: ${isToday ? '700' : '500'};
      " title="${events.map(e => e.label).join(', ')}">
        <span style="font-size: 14px;">${day}</span>
        ${hasEvents ? `<span style="font-size: 9px; opacity: 0.7;">•</span>` : ''}
      </div>
    `;
  }

  html += `
      </div>

      ${getUpcomingEvents(year, month).length > 0 ? `
        <div style="background: #1a2332; padding: 15px; border-radius: 6px; border-left: 3px solid #00D084;">
          <h4 style="margin: 0 0 10px 0; color: #00D084; font-size: 12px; text-transform: uppercase;">Próximos eventos</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${getUpcomingEvents(year, month).slice(0, 5).map(event => `
              <div style="font-size: 12px; color: #ddd;">
                <strong>${event.date}</strong><br>
                <small style="color: #999;">${event.label}</small>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  return html;
}

function getCalendarEvents(date) {
  const dateStr = date.toISOString().split("T")[0];
  const events = [];

  // Check orders
  const orders = state.data?.orders?.filter(o => {
    const orderDate = (o.createdAt || o.deliveryDate || "").split("T")[0];
    return orderDate === dateStr;
  }) || [];

  if (orders.length) {
    events.push({
      type: "orders",
      label: `📦 ${orders.length} pedido${orders.length > 1 ? "s" : ""}`,
      count: orders.length,
    });
  }

  // Check cash
  const cash = state.data?.cash?.filter(c => {
    const cashDate = (c.date || "").split("T")[0];
    return cashDate === dateStr;
  }) || [];

  if (cash.length) {
    events.push({
      type: "cash",
      label: `💰 ${cash.length} lançamento${cash.length > 1 ? "s" : ""}`,
      count: cash.length,
    });
  }

  return events;
}

function getUpcomingEvents(year, month) {
  const events = [];
  const now = new Date(year, month, 1);

  // Get next 30 days
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);

    const dayEvents = getCalendarEvents(date);
    dayEvents.forEach(event => {
      events.push({
        date: date.toLocaleDateString("pt-BR", { month: "short", day: "numeric" }),
        label: event.label,
      });
    });
  }

  return events;
}
