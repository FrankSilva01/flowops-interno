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
      <div class="calendar-day-cell${isToday ? ' today' : ''}" data-date="${dateStr}" style="cursor: ${hasEvents ? 'pointer' : 'default'};">
        <div class="calendar-day-number">${day}</div>
        <div class="calendar-day-events">
          ${dayEvents.slice(0, 3).map(event => `
            <div class="calendar-event-badge ${event.type}">
              ${event.label.length > 16 ? event.label.slice(0, 14) + '...' : event.label}
            </div>
          `).join('')}
          ${dayEvents.length > 3 ? `<div class="calendar-event-more">+${dayEvents.length - 3} mais</div>` : ''}
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
        <div class="calendar-stat-item">
          <span class="calendar-stat-value" id="monthTotal">0</span>
          <span class="calendar-stat-label">Total</span>
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
    const label = EVENT_LABELS[event.type] || event.type;
    return `${icon} ${label}: ${event.detail || event.label}`;
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
      detail: FERIADOS[dateStr],
      count: 1,
    });
  }

  // Marketplace sales
  const sales = (state.marketplaceSales || []).filter(s => {
    const saleDate = (s.date || s.created_at || "").split("T")[0];
    return saleDate === dateStr;
  });

  if (sales.length) {
    events.push({
      type: "sales",
      label: `🛒 ${sales.length} venda${sales.length > 1 ? "s" : ""}`,
      detail: `${sales.length} venda${sales.length > 1 ? "s" : ""} no marketplace`,
      count: sales.length,
      data: sales,
    });
  }

  // Orders
  const orders = (state.data?.orders || []).filter(o => {
    const orderDate = (o.deliveryDate || "").split("T")[0];
    return orderDate === dateStr;
  });

  if (orders.length) {
    events.push({
      type: "delivery",
      label: `📦 ${orders.length} entrega${orders.length > 1 ? "s" : ""}`,
      detail: `${orders.length} entrega${orders.length > 1 ? "s" : ""} agendada${orders.length > 1 ? "s" : ""}`,
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
    events.push({
      type: "logistics",
      label: `🚚 ${logistics.length} evento${logistics.length > 1 ? "s" : ""}`,
      detail: `${logistics.length} evento${logistics.length > 1 ? "s" : ""} logístico${logistics.length > 1 ? "s" : ""}`,
      count: logistics.length,
      data: logistics,
    });
  }

  // Cash
  const cash = (state.data?.cash || []).filter(c => {
    const cashDate = (c.date || "").split("T")[0];
    return cashDate === dateStr;
  });

  if (cash.length) {
    events.push({
      type: "cash",
      label: `💰 ${cash.length} lançamento${cash.length > 1 ? "s" : ""}`,
      detail: `${cash.length} lançamento${cash.length > 1 ? "s" : ""} financeiro${cash.length > 1 ? "s" : ""}`,
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
      detail: event,
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

  // Dias com eventos - Click para mostrar detalhes
  const dayElements = document.querySelectorAll(".calendar-day-cell");
  dayElements.forEach(dayEl => {
    const dateStr = dayEl.getAttribute("data-date");
    if (dateStr) {
      const date = new Date(dateStr);
      const dayEvents = getCalendarEventsForDay(date);
      if (dayEvents.length > 0) {
        dayEl.addEventListener("click", () => {
          showDayEventsDrawer(dateStr, dayEvents);
        });
      }
    }
  });
}

function showDayEventsDrawer(dateStr, dayEvents) {
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Fechar drawer anterior se existir
  const existingDrawer = document.querySelector(".calendar-drawer");
  if (existingDrawer) {
    existingDrawer.remove();
  }
  const existingOverlay = document.querySelector(".calendar-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Overlay
  const overlay = document.createElement("div");
  overlay.className = "calendar-overlay";
  overlay.addEventListener("click", () => {
    drawer.remove();
    overlay.remove();
  });

  // Drawer
  const drawer = document.createElement("div");
  drawer.className = "calendar-drawer";

  drawer.innerHTML = `
    <div class="calendar-drawer-header">
      <div>
        <h2 class="calendar-drawer-title">${dateFormatted}</h2>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--muted);">${dayEvents.length} evento${dayEvents.length > 1 ? "s" : ""}</p>
      </div>
      <button class="calendar-drawer-close" aria-label="Fechar">✕</button>
    </div>

    <div class="calendar-events-list">
      ${dayEvents.map(event => `
        <div class="calendar-event-item ${event.type}">
          <div class="calendar-event-icon">${EVENT_ICONS[event.type]}</div>
          <div class="calendar-event-content">
            <div class="calendar-event-label">${EVENT_LABELS[event.type]}</div>
            <div class="calendar-event-detail">${event.detail || event.label}</div>
            ${event.count > 1 ? `<div class="calendar-event-detail" style="margin-top: 6px; font-weight: 600; color: var(--teal);">${event.count} ocorrências</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  drawer.querySelector(".calendar-drawer-close").addEventListener("click", () => {
    drawer.remove();
    overlay.remove();
  });
}

function openEventForm() {
  // Fechar drawer anterior se existir
  const existingDrawer = document.querySelector(".calendar-drawer");
  if (existingDrawer) {
    existingDrawer.remove();
  }
  const existingOverlay = document.querySelector(".calendar-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Overlay
  const overlay = document.createElement("div");
  overlay.className = "calendar-overlay";
  overlay.addEventListener("click", () => {
    drawer.remove();
    overlay.remove();
  });

  const drawer = document.createElement("div");
  drawer.className = "calendar-drawer";

  const today = new Date().toISOString().split("T")[0];

  drawer.innerHTML = `
    <div class="calendar-drawer-header">
      <h2 class="calendar-drawer-title">Marcar evento</h2>
      <button class="calendar-drawer-close" aria-label="Fechar">✕</button>
    </div>

    <div class="calendar-event-form">
      <div class="calendar-form-group">
        <label class="calendar-form-label">Data</label>
        <input type="date" id="eventDate" value="${today}" class="calendar-form-input">
      </div>

      <div class="calendar-form-group">
        <label class="calendar-form-label">Descrição do evento</label>
        <input type="text" id="eventText" placeholder="Ex: Feriado, Prazo importante..." class="calendar-form-input">
      </div>

      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button id="saveEvent" class="calendar-add-event-btn" style="flex: 1;">
          <i class="ti ti-check"></i>
          Salvar
        </button>
        <button id="closeForm" class="calendar-nav-btn" style="flex: 1;">
          <i class="ti ti-x"></i>
          Cancelar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const closeBtn = drawer.querySelector(".calendar-drawer-close");
  const closeFormBtn = drawer.querySelector("#closeForm");
  const saveBtn = drawer.querySelector("#saveEvent");

  closeBtn.addEventListener("click", () => {
    drawer.remove();
    overlay.remove();
  });

  closeFormBtn.addEventListener("click", () => {
    drawer.remove();
    overlay.remove();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      drawer.remove();
      overlay.remove();
    }
  });

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
    drawer.remove();
    overlay.remove();

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

  const total = salesCount + deliveriesCount + logisticsCount + cashCount;

  const salesEl = document.getElementById("monthSales");
  const deliveriesEl = document.getElementById("monthDeliveries");
  const logisticsEl = document.getElementById("monthLogistics");
  const cashEl = document.getElementById("monthCash");
  const totalEl = document.getElementById("monthTotal");

  if (salesEl) salesEl.textContent = salesCount;
  if (deliveriesEl) deliveriesEl.textContent = deliveriesCount;
  if (logisticsEl) logisticsEl.textContent = logisticsCount;
  if (cashEl) cashEl.textContent = cashCount;
  if (totalEl) totalEl.textContent = total;
}

export { bindCalendarEvents, renderCalendarWithEvents, attachCalendarEventListeners, updateCalendarStats };
