import { state } from "../core/state.js";
import { byId, showAppMessage } from "../core/dom.js";

// Feriados brasileiros
const FERIADOS = {
  "2026-01-01": "Ano Novo",
  "2026-02-13": "Sexta-feira Santa",
  "2026-02-17": "Terça de Carnaval",
  "2026-04-21": "Tiradentes",
  "2026-05-01": "Dia do Trabalho",
  "2026-09-07": "Independência",
  "2026-10-12": "Nossa Senhora Aparecida",
  "2026-11-02": "Finados",
  "2026-11-15": "Proclamação da República",
  "2026-11-20": "Consciência Negra",
  "2026-12-25": "Natal",
};

const EVENT_COLORS = {
  sales: "#00D084",
  delivery: "#4CAF50",
  logistics: "#ffc107",
  cash: "#845ef7",
  feriado: "#ff6b6b",
  custom: "#3b82f6",
};

const EVENT_ICONS = {
  sales: "🛒",
  delivery: "📦",
  logistics: "🚚",
  cash: "💰",
  feriado: "🇧🇷",
  custom: "📌",
};

const EVENT_LABELS = {
  sales: "Vendas",
  delivery: "Entrega",
  logistics: "Logística",
  cash: "Financeiro",
  feriado: "Feriado",
  custom: "Evento",
};

function bindCalendarEvents() {
  window.calendarEvents = JSON.parse(localStorage.getItem("calendarCustomEvents") || "{}");
  if (!window.calendarDate) {
    window.calendarDate = new Date();
  }
}

function renderCalendarWithEvents(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const now = new Date();
  const today = now.getDate();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let html = `
    <div class="calendar-modern">
      <!-- Navigation -->
      <div class="calendar-header">
        <button class="calendar-nav-btn cal-prev-btn"><i class="ti ti-chevron-left"></i> Anterior</button>
        <h2 class="calendar-title">${monthNames[month]} ${year}</h2>
        <button class="calendar-nav-btn cal-next-btn">Próximo <i class="ti ti-chevron-right"></i></button>
      </div>

      <!-- Calendar Grid -->
      <div class="calendar-grid">
  `;

  // Day headers
  dayNames.forEach(day => {
    html += `<div class="calendar-weekday">${day}</div>`;
  });

  // Empty cells
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += `<div class="calendar-day-cell empty"></div>`;
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = day === today && month === thisMonth && year === thisYear;
    const dateStr = date.toISOString().split("T")[0];

    const dayEvents = getCalendarEventsForDay(date);
    const hasEvents = dayEvents.length > 0;

    const tooltipText = buildTooltipText(dayEvents);

    html += `
      <div class="calendar-day-cell${isToday ? ' today' : ''}" data-date="${dateStr}">
        <div class="calendar-day-number">${day}</div>
        <div class="calendar-day-events">
          ${dayEvents.slice(0, 2).map(event => `
            <div class="calendar-event-badge ${event.type}" title="${event.label}">
              ${event.label.length > 14 ? event.label.slice(0, 12) + '...' : event.label}
            </div>
          `).join('')}
          ${dayEvents.length > 2 ? `<div class="calendar-event-more">+${dayEvents.length - 2}</div>` : ''}
        </div>
        ${hasEvents ? `<div class="calendar-tooltip">${tooltipText}</div>` : ''}
      </div>
    `;
  }

  html += `
      </div>

      <!-- Stats -->
      <div class="calendar-stats">
        <div class="calendar-stat-item">
          <span class="calendar-stat-value" id="monthSales">0</span>
          <span class="calendar-stat-label">Vendas</span>
        </div>
        <div class="calendar-stat-item">
          <span class="calendar-stat-value" id="monthDeliveries">0</span>
          <span class="calendar-stat-label">Entregas</span>
        </div>
        <div class="calendar-stat-item">
          <span class="calendar-stat-value" id="monthLogistics">0</span>
          <span class="calendar-stat-label">Logística</span>
        </div>
        <div class="calendar-stat-item">
          <span class="calendar-stat-value" id="monthCash">0</span>
          <span class="calendar-stat-label">Financeiro</span>
        </div>
      </div>

      <!-- Legend -->
      <div class="calendar-legend">
        <div class="calendar-legend-item">
          <div class="calendar-legend-dot sales"></div>
          <span>Vendas</span>
        </div>
        <div class="calendar-legend-item">
          <div class="calendar-legend-dot delivery"></div>
          <span>Entrega</span>
        </div>
        <div class="calendar-legend-item">
          <div class="calendar-legend-dot logistics"></div>
          <span>Logística</span>
        </div>
        <div class="calendar-legend-item">
          <div class="calendar-legend-dot cash"></div>
          <span>Financeiro</span>
        </div>
        <div class="calendar-legend-item">
          <div class="calendar-legend-dot feriado"></div>
          <span>Feriado</span>
        </div>
        <div class="calendar-legend-item">
          <div class="calendar-legend-dot custom"></div>
          <span>Evento</span>
        </div>
      </div>

      <!-- Action Button -->
      <div class="calendar-action-bar">
        <button class="calendar-add-event-btn cal-mark-event-btn">
          <i class="ti ti-plus"></i>
          Marcar evento
        </button>
      </div>
    </div>
  `;

  return html;
}

function buildTooltipText(events) {
  if (events.length === 0) return "Sem eventos";

  return events.map(event => {
    const icon = EVENT_ICONS[event.type] || "•";
    return `${icon} ${event.tooltip}`;
  }).join("\n");
}

function getCalendarEventsForDay(date) {
  const dateStr = date.toISOString().split("T")[0];
  const events = [];

  // Feriados
  if (FERIADOS[dateStr]) {
    events.push({
      type: "feriado",
      label: `🇧🇷 ${FERIADOS[dateStr]}`,
      tooltip: `Feriado: ${FERIADOS[dateStr]}`,
      count: 1,
    });
  }

  // Marketplace sales
  const sales = (state.marketplaceSales || []).filter(s => {
    const saleDate = (s.date || s.created_at || "").split("T")[0];
    return saleDate === dateStr;
  });

  if (sales.length) {
    const totalSalesValue = sales.reduce((sum, s) => sum + (s.price || s.value || 0), 0);
    const itemsInfo = sales.map(s => `${s.title || s.product_name || 'Produto'} - R$ ${(s.price || s.value || 0).toFixed(2)}`).join("\n");

    events.push({
      type: "sales",
      label: `🛒 ${sales.length} venda${sales.length > 1 ? "s" : ""}`,
      tooltip: `Vendas (${sales.length}):\n${itemsInfo}`,
      count: sales.length,
      data: sales,
    });
  }

  // Orders/Deliveries
  const orders = (state.data?.orders || []).filter(o => {
    const orderDate = (o.deliveryDate || "").split("T")[0];
    return orderDate === dateStr;
  });

  if (orders.length) {
    const itemsInfo = orders.map(o => {
      const items = o.items || [];
      const itemStr = items.map(i => `${i.name || i.product_name || 'Item'} (${i.quantity || 1}x)`).join(", ");
      return `Pedido ${o.id || o.order_id || '---'}: ${itemStr}`;
    }).join("\n");

    events.push({
      type: "delivery",
      label: `📦 ${orders.length} entrega${orders.length > 1 ? "s" : ""}`,
      tooltip: `Entregas (${orders.length}):\n${itemsInfo || 'Itens não especificados'}`,
      count: orders.length,
      data: orders,
    });
  }

  // Logistics
  const logistics = (state.orderLogistics || []).filter(l => {
    const logDate = (l.created_at || "").split("T")[0];
    return logDate === dateStr;
  });

  if (logistics.length) {
    const logInfo = logistics.map(l => {
      const status = l.status || l.event_type || 'Evento';
      const description = l.description || l.message || '';
      return `${status}${description ? ': ' + description : ''}`;
    }).join("\n");

    events.push({
      type: "logistics",
      label: `🚚 ${logistics.length} evento${logistics.length > 1 ? "s" : ""}`,
      tooltip: `Logística (${logistics.length}):\n${logInfo || 'Eventos não especificados'}`,
      count: logistics.length,
      data: logistics,
    });
  }

  // Cash/Financial
  const cash = (state.data?.cash || []).filter(c => {
    const cashDate = (c.date || "").split("T")[0];
    return cashDate === dateStr;
  });

  if (cash.length) {
    const cashInfo = cash.map(c => {
      const type = c.type === 'in' ? 'Entrada' : c.type === 'out' ? 'Saída' : 'Lançamento';
      const value = c.value || c.amount || 0;
      const description = c.description || c.note || 'Sem descrição';
      return `${type}: R$ ${value.toFixed(2)} - ${description}`;
    }).join("\n");

    events.push({
      type: "cash",
      label: `💰 ${cash.length} lançamento${cash.length > 1 ? "s" : ""}`,
      tooltip: `Financeiro (${cash.length}):\n${cashInfo || 'Lançamentos não especificados'}`,
      count: cash.length,
      data: cash,
    });
  }

  // Custom events
  const customEvents = window.calendarEvents?.[dateStr] || [];
  customEvents.forEach(event => {
    events.push({
      type: "custom",
      label: `📌 ${event}`,
      tooltip: `Evento: ${event}`,
      count: 1,
    });
  });

  return events;
}

function attachCalendarEventListeners() {
  // Próximo mês
  const nextBtn = document.querySelector(".cal-next-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (!window.calendarDate) window.calendarDate = new Date();
      window.calendarDate.setMonth(window.calendarDate.getMonth() + 1);
      const container = byId("calendarWidget");
      if (container) {
        container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
        attachCalendarEventListeners();
        updateCalendarStats(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
      }
    });
  }

  // Mês anterior
  const prevBtn = document.querySelector(".cal-prev-btn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (!window.calendarDate) window.calendarDate = new Date();
      window.calendarDate.setMonth(window.calendarDate.getMonth() - 1);
      const container = byId("calendarWidget");
      if (container) {
        container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
        attachCalendarEventListeners();
        updateCalendarStats(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
      }
    });
  }

  // Marcar evento
  const markBtn = document.querySelector(".cal-mark-event-btn");
  if (markBtn) {
    markBtn.addEventListener("click", () => {
      openEventForm();
    });
  }
}

function openEventForm() {
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    padding: 28px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    z-index: 2000;
    min-width: 350px;
    max-width: 90vw;
  `;

  const today = new Date().toISOString().split("T")[0];

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--ink);">Marcar evento</h2>
      <button id="closeForm" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--muted);">✕</button>
    </div>

    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">Data</label>
        <input type="date" id="eventDate" value="${today}" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 13px; background: var(--canvas); color: var(--ink); box-sizing: border-box;">
      </div>

      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">Descrição</label>
        <input type="text" id="eventText" placeholder="Ex: Feriado, Prazo importante..." style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 13px; background: var(--canvas); color: var(--ink); box-sizing: border-box;">
      </div>

      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button id="saveEvent" style="flex: 1; background: var(--teal); color: white; border: none; padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease;">
          <i class="ti ti-check"></i> Salvar
        </button>
        <button id="cancelEvent" style="flex: 1; background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease;">
          Cancelar
        </button>
      </div>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1999;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector("#closeForm");
  const cancelBtn = dialog.querySelector("#cancelEvent");
  const saveBtn = dialog.querySelector("#saveEvent");

  const closeDialog = () => {
    dialog.remove();
    overlay.remove();
  };

  closeBtn.addEventListener("click", closeDialog);
  cancelBtn.addEventListener("click", closeDialog);
  overlay.addEventListener("click", closeDialog);

  saveBtn.addEventListener("click", () => {
    const dateInput = document.getElementById("eventDate");
    const textInput = document.getElementById("eventText");

    if (!dateInput.value || !textInput.value.trim()) {
      showAppMessage("Preencha data e descrição do evento", "warning");
      return;
    }

    if (!window.calendarEvents) window.calendarEvents = {};
    const dateStr = dateInput.value;
    if (!window.calendarEvents[dateStr]) {
      window.calendarEvents[dateStr] = [];
    }

    window.calendarEvents[dateStr].push(textInput.value.trim());
    localStorage.setItem("calendarCustomEvents", JSON.stringify(window.calendarEvents));

    showAppMessage("✅ Evento marcado com sucesso!", "success");
    closeDialog();

    // Refresh calendar
    const container = byId("calendarWidget");
    if (container) {
      if (!window.calendarDate) window.calendarDate = new Date();
      container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
      attachCalendarEventListeners();
      updateCalendarStats(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
    }
  });
}

function updateCalendarStats(year, month) {
  let salesCount = 0, deliveriesCount = 0, logisticsCount = 0, cashCount = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const events = getCalendarEventsForDay(date);
    events.forEach(e => {
      if (e.type === "sales") salesCount += e.count || 1;
      if (e.type === "delivery") deliveriesCount += e.count || 1;
      if (e.type === "logistics") logisticsCount += e.count || 1;
      if (e.type === "cash") cashCount += e.count || 1;
    });
  }

  const salesEl = document.getElementById("monthSales");
  const deliveriesEl = document.getElementById("monthDeliveries");
  const logisticsEl = document.getElementById("monthLogistics");
  const cashEl = document.getElementById("monthCash");

  if (salesEl) salesEl.textContent = salesCount;
  if (deliveriesEl) deliveriesEl.textContent = deliveriesCount;
  if (logisticsEl) logisticsEl.textContent = logisticsCount;
  if (cashEl) cashEl.textContent = cashCount;
}

export { bindCalendarEvents, renderCalendarWithEvents, attachCalendarEventListeners, updateCalendarStats };
