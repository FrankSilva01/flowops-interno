import { state } from "../core/state.js";
import { byId, html, showAppMessage } from "../core/dom.js";

// ========================================================================
// BLOCO 4: CALENDAR NAVIGATION
// ========================================================================

export function getCalendarEvents(date) {
  const dateStr = date.toISOString().split("T")[0];
  const events = [];

  // Vendas
  const salesDay = state.marketplaceSales.filter(s => {
    const saleDate = new Date(s.date_created || Date.now()).toISOString().split("T")[0];
    return saleDate === dateStr;
  });
  if (salesDay.length) {
    events.push({
      type: "sales",
      label: `📊 ${salesDay.length} venda${salesDay.length > 1 ? "s" : ""}`,
      count: salesDay.length,
      data: salesDay
    });
  }

  // Pedidos (orders)
  const ordersDay = state.data?.orders?.filter(o => {
    const orderDate = new Date(o.deliveryDate || Date.now()).toISOString().split("T")[0];
    return orderDate === dateStr;
  }) || [];
  if (ordersDay.length) {
    events.push({
      type: "orders",
      label: `📦 ${ordersDay.length} pedido${ordersDay.length > 1 ? "s" : ""}`,
      count: ordersDay.length,
      data: ordersDay
    });
  }

  // Logística
  const logisticsDay = state.orderLogistics?.filter(l => {
    const logDate = new Date(l.created_at || Date.now()).toISOString().split("T")[0];
    return logDate === dateStr;
  }) || [];
  if (logisticsDay.length) {
    events.push({
      type: "logistics",
      label: `🚚 ${logisticsDay.length} evento${logisticsDay.length > 1 ? "s" : ""}`,
      count: logisticsDay.length,
      data: logisticsDay
    });
  }

  // Financeiro (movimentação)
  const cashDay = state.data?.cash?.filter(c => {
    const cashDate = new Date(c.date).toISOString().split("T")[0];
    return cashDate === dateStr;
  }) || [];
  if (cashDay.length) {
    const totalIn = cashDay.filter(c => c.type === "Entrada").reduce((sum, c) => sum + c.income, 0);
    const totalOut = cashDay.filter(c => c.type === "Saída").reduce((sum, c) => sum + c.expense, 0);
    events.push({
      type: "financeiro",
      label: `💰 ${cashDay.length} movimento${cashDay.length > 1 ? "s" : ""}`,
      count: cashDay.length,
      data: cashDay,
      summary: { income: totalIn, expense: totalOut }
    });
  }

  return events;
}

export function handleCalendarDateClick(date) {
  const events = getCalendarEvents(date);

  if (!events.length) {
    showAppMessage("Nenhum evento nesta data", "info");
    return;
  }

  if (events.length === 1) {
    // Um evento = ir direto
    navigateToEvent(events[0], date);
  } else {
    // Múltiplos = mostrar drawer
    showMultiEventDrawer(events, date);
  }
}

function navigateToEvent(event, date) {
  const dateStr = date.toLocaleDateString("pt-BR");

  switch (event.type) {
    case "sales":
      state.view = "marketplace";
      state.marketplaceView = "sales";
      state.marketplaceLogDateFrom = date.toISOString().split("T")[0];
      state.marketplaceLogDateTo = date.toISOString().split("T")[0];
      showAppMessage(`Vendas do dia ${dateStr} — ${event.count} venda${event.count > 1 ? "s" : ""}`);
      break;

    case "orders":
      state.view = "orders";
      // TODO: Filtrar tabela de pedidos por data
      showAppMessage(`Pedidos do dia ${dateStr} — ${event.count} pedido${event.count > 1 ? "s" : ""}`);
      break;

    case "logistics":
      state.view = "logistics";
      // TODO: Filtrar logística por data
      showAppMessage(`Eventos de logística do dia ${dateStr}`);
      break;

    case "financeiro":
      state.view = "cash";
      // TODO: Filtrar caixa por data
      const { income, expense } = event.summary || {};
      showAppMessage(`Movimentações do dia ${dateStr} — Entrada: R$${income}, Saída: R$${expense}`);
      break;
  }

  // Disparar re-render (implementar conforme seu sistema)
  window.dispatchEvent(new CustomEvent("state-changed"));
}

function showMultiEventDrawer(events, date) {
  const drawer = document.createElement("div");
  drawer.className = "multi-event-drawer";
  drawer.innerHTML = `
    <div class="multi-event-header">
      <h3>${date.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h3>
      <span class="close-btn">✕</span>
    </div>

    <div class="multi-event-list">
      ${events.map((event, idx) => `
        <div class="event-item" data-event-index="${idx}">
          <div class="event-icon">${getEventIcon(event.type)}</div>
          <div class="event-content">
            <div class="event-title">${event.label}</div>
            ${event.summary ? `
              <div class="event-summary">
                ${event.summary.income ? `Entrada: R$${event.summary.income.toFixed(2)}` : ""}
                ${event.summary.expense ? `${event.summary.income ? " | " : ""}Saída: R$${event.summary.expense.toFixed(2)}` : ""}
              </div>
            ` : ""}
          </div>
          <div class="event-arrow">→</div>
        </div>
      `).join("")}
    </div>
  `;

  // Handlers
  drawer.querySelector(".close-btn").addEventListener("click", () => {
    drawer.classList.add("closing");
    setTimeout(() => drawer.remove(), 200);
  });

  drawer.querySelectorAll(".event-item").forEach(item => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.dataset.eventIndex);
      navigateToEvent(events[idx], date);
      drawer.classList.add("closing");
      setTimeout(() => drawer.remove(), 200);
    });
  });

  // ESC para fechar
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      drawer.classList.add("closing");
      setTimeout(() => drawer.remove(), 200);
      document.removeEventListener("keydown", handleEsc);
    }
  };
  document.addEventListener("keydown", handleEsc);

  document.body.appendChild(drawer);
}

function getEventIcon(type) {
  const icons = {
    sales: "📊",
    orders: "📦",
    logistics: "🚚",
    financeiro: "💰"
  };
  return icons[type] || "📌";
}

// ========== INTEGRAÇÃO COM CALENDÁRIO ==========

export function bindCalendarEvents() {
  // Assumindo que o calendário tem elementos com data-date="YYYY-MM-DD"
  const calendarCells = document.querySelectorAll("[data-calendar-date]");

  calendarCells.forEach(cell => {
    const dateStr = cell.dataset.calendarDate;
    if (dateStr) {
      const date = new Date(dateStr);
      const events = getCalendarEvents(date);

      if (events.length) {
        // Adicionar indicador visual de eventos
        cell.classList.add("has-events");
        cell.dataset.eventCount = events.length;

        // Listener de clique
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => handleCalendarDateClick(date));
      }
    }
  });
}

export function renderCalendarWithEvents(year, month) {
  // Retorna HTML de calendário com eventos marcados
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  let html = `<div class="calendar-grid">`;

  // Cabeçalho com dias da semana
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  dayNames.forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`;
  });

  // Preencher dias vazios do início
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  // Dias do mês
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split("T")[0];
    const events = getCalendarEvents(date);
    const isToday = new Date().toDateString() === date.toDateString();

    html += `
      <div class="calendar-cell ${isToday ? "today" : ""} ${events.length ? "has-events" : ""}"
           data-calendar-date="${dateStr}"
           data-event-count="${events.length}">
        <div class="day-number">${day}</div>
        ${events.length ? `<div class="event-indicator">${events.length}</div>` : ""}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}
