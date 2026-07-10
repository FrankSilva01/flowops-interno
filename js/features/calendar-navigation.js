import { state } from "../core/state.js";
import { byId, showAppMessage } from "../core/dom.js";

export function bindCalendarEvents() {
  window.calendarEvents = JSON.parse(localStorage.getItem("calendarCustomEvents") || "{}");
}

export function renderCalendarWithEvents(year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();

  let html = `<div style="padding: 15px; background: #0f1419; border-radius: 8px;">`;

  // Year title
  html += `<h3 style="margin: 0 0 15px 0; color: #fff; font-size: 14px;">Calendário ${currentYear}</h3>`;

  // Grid of months
  html += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">`;

  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  for (let m = 0; m < 12; m++) {
    html += renderMiniMonth(currentYear, m, monthNames[m]);
  }

  html += `</div>`;
  html += `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #222;">
    <button onclick="window.openEventForm()" style="width: 100%; background: #00D084; color: #000; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 11px;">+ Marcar evento</button>
  </div>`;

  html += `</div>`;

  return html;
}

function renderMiniMonth(year, month, monthName) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const dayNames = ["D", "S", "T", "Q", "Q", "S", "S"];
  const now = new Date();
  const today = now.getDate();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let html = `<div style="background: #1a2332; padding: 8px; border-radius: 6px; border: 1px solid #222;">`;
  html += `<div style="font-size: 10px; font-weight: 600; color: #00D084; margin-bottom: 6px; text-align: center;">${monthName}</div>`;

  html += `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; font-size: 8px;">`;

  // Day headers
  dayNames.forEach(day => {
    html += `<div style="text-align: center; color: #666; font-weight: 600;">${day}</div>`;
  });

  // Empty cells
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += `<div></div>`;
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = day === today && month === thisMonth && year === thisYear;
    const dateStr = date.toISOString().split("T")[0];

    const dayEvents = getCalendarEventsForDay(date);
    const hasEvents = dayEvents.length > 0;

    html += `
      <div
        style="
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 2px;
          background: ${isToday ? '#00D084' : hasEvents ? '#0f1419' : 'transparent'};
          border: 1px solid ${isToday ? '#00D084' : hasEvents ? '#00D084' : '#333'};
          cursor: ${hasEvents ? 'pointer' : 'default'};
          font-weight: ${isToday ? '700' : '500'};
          color: ${isToday ? '#000' : '#ddd'};
          font-size: 9px;
        "
        onclick="${hasEvents ? `window.showDayEvents('${dateStr}')` : ''}"
      >
        ${day}
      </div>
    `;
  }

  html += `</div></div>`;

  return html;
}

function getCalendarEventsForDay(date) {
  const dateStr = date.toISOString().split("T")[0];
  const events = [];

  // Marketplace sales
  const sales = (state.marketplaceSales || []).filter(s => {
    const saleDate = (s.date || s.created_at || "").split("T")[0];
    return saleDate === dateStr;
  });

  if (sales.length) {
    events.push({
      type: "sales",
      label: `🛒 ${sales.length} venda${sales.length > 1 ? "s" : ""}`,
      count: sales.length,
      data: sales,
    });
  }

  // Orders with delivery date
  const orders = (state.data?.orders || []).filter(o => {
    const orderDate = (o.deliveryDate || "").split("T")[0];
    return orderDate === dateStr;
  });

  if (orders.length) {
    events.push({
      type: "delivery",
      label: `📦 ${orders.length} entrega${orders.length > 1 ? "s" : ""}`,
      count: orders.length,
      data: orders,
    });
  }

  // Logistics events
  const logistics = (state.orderLogistics || []).filter(l => {
    const logDate = (l.created_at || "").split("T")[0];
    return logDate === dateStr;
  });

  if (logistics.length) {
    events.push({
      type: "logistics",
      label: `🚚 ${logistics.length} evento${logistics.length > 1 ? "s" : ""}`,
      count: logistics.length,
      data: logistics,
    });
  }

  // Cash (financeiro)
  const cash = (state.data?.cash || []).filter(c => {
    const cashDate = (c.date || "").split("T")[0];
    return cashDate === dateStr;
  });

  if (cash.length) {
    events.push({
      type: "cash",
      label: `💰 ${cash.length} lançamento${cash.length > 1 ? "s" : ""}`,
      count: cash.length,
      data: cash,
    });
  }

  // Custom events
  const customEvents = window.calendarEvents?.[dateStr] || [];
  customEvents.forEach(event => {
    events.push({
      type: "custom",
      label: event,
    });
  });

  return events;
}

window.showDayEvents = (dateStr) => {
  const date = new Date(dateStr);
  const events = getCalendarEventsForDay(date);

  if (events.length === 1 && events[0].type !== "custom") {
    window.navigateToEvent(events[0]);
    return;
  }

  // Drawer para múltiplos eventos
  const drawer = document.createElement("div");
  drawer.id = "eventDrawer";
  drawer.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 350px;
    height: 100vh;
    background: #0f1419;
    border-left: 1px solid #222;
    padding: 20px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: -2px 0 10px rgba(0,0,0,0.5);
  `;

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 14px;">${date.toLocaleDateString("pt-BR")}</h2>
      <button onclick="document.getElementById('eventDrawer').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">✕</button>
    </div>

    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${events.map((event, idx) => `
        <div onclick="${event.type !== 'custom' ? `window.navigateToEvent(${JSON.stringify(event).replace(/"/g, '&quot;')})` : ''}" style="
          background: #1a2332;
          padding: 12px;
          border-radius: 6px;
          border-left: 3px solid #00D084;
          cursor: ${event.type !== 'custom' ? 'pointer' : 'default'};
          transition: all 0.2s;
        " onmouseover="this.style.background='#23303f'" onmouseout="this.style.background='#1a2332'">
          <strong style="display: block; color: #ddd; font-size: 12px; margin-bottom: 4px;">${event.label}</strong>
          ${event.type === 'custom' ? `<small style="color: #999;">Evento marcado</small>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  document.body.appendChild(drawer);
};

window.navigateToEvent = (event) => {
  const drawer = document.getElementById("eventDrawer");
  if (drawer) drawer.remove();

  switch(event.type) {
    case "sales":
      // Navegar para Marketplace > Vendas filtrado
      window.location.hash = "#marketplace";
      setTimeout(() => showAppMessage("Marketplace - Vendas aberto", "info"), 100);
      break;
    case "delivery":
      // Navegar para Encomendas filtrado
      window.location.hash = "#orders";
      setTimeout(() => showAppMessage("Encomendas - Entregas aberto", "info"), 100);
      break;
    case "logistics":
      // Navegar para Logística filtrado
      window.location.hash = "#logistics";
      setTimeout(() => showAppMessage("Logística aberto", "info"), 100);
      break;
    case "cash":
      // Drawer no calendário para financeiro
      showAppMessage("Financeiro - Drawer aberto", "info");
      break;
  }
};

window.openEventForm = (dateStr = null) => {
  const date = dateStr ? new Date(dateStr) : new Date();
  const drawer = document.createElement("div");
  drawer.id = "eventFormDrawer";
  drawer.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 350px;
    height: 100vh;
    background: #0f1419;
    border-left: 1px solid #222;
    padding: 20px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: -2px 0 10px rgba(0,0,0,0.5);
  `;

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 14px;">Marcar evento</h2>
      <button onclick="document.getElementById('eventFormDrawer').remove()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">✕</button>
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; color: #999; font-size: 12px; margin-bottom: 6px;">Data</label>
      <input type="date" id="eventDate" value="${date.toISOString().split('T')[0]}" style="width: 100%; padding: 8px; background: #1a2332; border: 1px solid #222; color: #fff; border-radius: 4px; box-sizing: border-box;">
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; color: #999; font-size: 12px; margin-bottom: 6px;">Evento</label>
      <input type="text" id="eventText" placeholder="Ex: Feriado, Prazo importante..." style="width: 100%; padding: 8px; background: #1a2332; border: 1px solid #222; color: #fff; border-radius: 4px; box-sizing: border-box;">
    </div>

    <div style="display: flex; gap: 10px;">
      <button onclick="window.saveCalendarEvent()" style="flex: 1; background: #00D084; color: #000; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px;">Salvar</button>
      <button onclick="document.getElementById('eventFormDrawer').remove()" style="flex: 1; background: #222; color: #fff; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Fechar</button>
    </div>
  `;

  document.body.appendChild(drawer);
};

window.saveCalendarEvent = () => {
  const dateInput = document.getElementById("eventDate");
  const textInput = document.getElementById("eventText");

  if (!dateInput || !textInput || !dateInput.value || !textInput.value.trim()) {
    showAppMessage("Preencha data e evento", "warning");
    return;
  }

  if (!window.calendarEvents) window.calendarEvents = {};

  const dateStr = dateInput.value;
  if (!window.calendarEvents[dateStr]) {
    window.calendarEvents[dateStr] = [];
  }

  window.calendarEvents[dateStr].push(textInput.value.trim());
  localStorage.setItem("calendarCustomEvents", JSON.stringify(window.calendarEvents));

  showAppMessage("✅ Evento marcado!", "success");

  const drawer = document.getElementById("eventFormDrawer");
  if (drawer) drawer.remove();

  // Refresh calendar
  const calendarWidget = document.getElementById("calendarWidget");
  if (calendarWidget) {
    const now = new Date();
    calendarWidget.innerHTML = renderCalendarWithEvents(now.getFullYear(), now.getMonth());
  }
};
