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

export function bindCalendarEvents() {
  window.calendarEvents = JSON.parse(localStorage.getItem("calendarCustomEvents") || "{}");
}

export function renderCalendarWithEvents(year, month) {
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
    <div style="padding: 20px; background: #0f1419; border-radius: 8px; max-width: 600px;">
      <!-- Navigation -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <button onclick="window.prevMonth()" style="background: #222; color: #00D084; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;">← Anterior</button>
        <h2 style="margin: 0; color: #fff; font-size: 16px;">${monthNames[month]} ${year}</h2>
        <button onclick="window.nextMonth()" style="background: #222; color: #00D084; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;">Próximo →</button>
      </div>

      <!-- Calendar Grid -->
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 20px;">
  `;

  // Day headers
  dayNames.forEach(day => {
    html += `<div style="text-align: center; color: #999; font-size: 12px; font-weight: 600; padding: 8px 0; text-transform: uppercase;">${day}</div>`;
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
      <div style="
        aspect-ratio: 1;
        border-radius: 6px;
        background: ${isToday ? '#00D08422' : '#1a2332'};
        border: ${isToday ? '2px solid #00D084' : '1px solid #222'};
        padding: 6px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      " onmouseover="this.style.background='#23303f'" onmouseout="this.style.background='${isToday ? '#00D08422' : '#1a2332'}'">
        <div style="color: ${isToday ? '#00D084' : '#ddd'}; font-weight: ${isToday ? '700' : '500'}; font-size: 13px;">${day}</div>
        <div style="display: flex; gap: 3px; flex-wrap: wrap;">
          ${dayEvents.slice(0, 3).map(event => `
            <div style="
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: ${EVENT_COLORS[event.type]};
              title='${event.label}';
            " title="${event.label}"></div>
          `).join('')}
          ${dayEvents.length > 3 ? `<small style="font-size: 8px; color: #999;">+${dayEvents.length - 3}</small>` : ''}
        </div>
      </div>
      <div class="calendar-tooltip-${dateStr}" style="position: fixed; display: none; background: #1a2332; border: 1px solid #222; padding: 8px; border-radius: 4px; font-size: 11px; z-index: 100; color: #ddd; border-left: 3px solid #00D084; max-width: 200px;"></div>
    `;
  }

  html += `
      </div>

      <!-- Action Button -->
      <button onclick="window.openEventForm()" style="
        width: 100%;
        background: #00D084;
        color: #000;
        border: none;
        padding: 10px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        margin-bottom: 10px;
      ">+ Marcar evento</button>

      <!-- Legend -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 11px;">
        <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 6px; height: 6px; border-radius: 50%; background: ${EVENT_COLORS.sales};"></div><span>Vendas</span></div>
        <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 6px; height: 6px; border-radius: 50%; background: ${EVENT_COLORS.delivery};"></div><span>Entrega</span></div>
        <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 6px; height: 6px; border-radius: 50%; background: ${EVENT_COLORS.logistics};"></div><span>Logística</span></div>
        <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 6px; height: 6px; border-radius: 50%; background: ${EVENT_COLORS.cash};"></div><span>Financeiro</span></div>
        <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 6px; height: 6px; border-radius: 50%; background: ${EVENT_COLORS.feriado};"></div><span>Feriado</span></div>
        <div style="display: flex; align-items: center; gap: 6px;"><div style="width: 6px; height: 6px; border-radius: 50%; background: ${EVENT_COLORS.custom};"></div><span>Evento</span></div>
      </div>
    </div>
  `;

  return html;
}

function getCalendarEventsForDay(date) {
  const dateStr = date.toISOString().split("T")[0];
  const events = [];

  // Feriados
  if (FERIADOS[dateStr]) {
    events.push({
      type: "feriado",
      label: `🇧🇷 ${FERIADOS[dateStr]}`,
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
    });
  }

  // Custom events
  const customEvents = window.calendarEvents?.[dateStr] || [];
  customEvents.forEach(event => {
    events.push({
      type: "custom",
      label: `📌 ${event}`,
    });
  });

  return events;
}

window.prevMonth = () => {
  if (!window.calendarDate) window.calendarDate = new Date();
  window.calendarDate.setMonth(window.calendarDate.getMonth() - 1);
  const container = byId("calendarWidget");
  if (container) {
    container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
  }
};

window.nextMonth = () => {
  if (!window.calendarDate) window.calendarDate = new Date();
  window.calendarDate.setMonth(window.calendarDate.getMonth() + 1);
  const container = byId("calendarWidget");
  if (container) {
    container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
  }
};

window.openEventForm = () => {
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

  const today = new Date().toISOString().split("T")[0];

  drawer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0; font-size: 14px; color: #fff;">Marcar evento</h2>
      <button id="closeEventForm" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">✕</button>
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; color: #999; font-size: 12px; margin-bottom: 6px;">Data</label>
      <input type="date" id="eventDate" value="${today}" style="width: 100%; padding: 8px; background: #1a2332; border: 1px solid #222; color: #fff; border-radius: 4px; box-sizing: border-box; font-size: 12px;">
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; color: #999; font-size: 12px; margin-bottom: 6px;">Evento</label>
      <input type="text" id="eventText" placeholder="Ex: Feriado, Prazo importante..." style="width: 100%; padding: 8px; background: #1a2332; border: 1px solid #222; color: #fff; border-radius: 4px; box-sizing: border-box; font-size: 12px;">
    </div>

    <div style="display: flex; gap: 10px;">
      <button id="saveEventBtn" style="flex: 1; background: #00D084; color: #000; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px;">Salvar</button>
      <button id="closeEventBtn2" style="flex: 1; background: #222; color: #fff; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Fechar</button>
    </div>
  `;

  document.body.appendChild(drawer);

  document.getElementById("closeEventForm").addEventListener("click", () => drawer.remove());
  document.getElementById("closeEventBtn2").addEventListener("click", () => drawer.remove());
  document.getElementById("saveEventBtn").addEventListener("click", () => {
    const dateInput = document.getElementById("eventDate");
    const textInput = document.getElementById("eventText");

    if (!dateInput.value || !textInput.value.trim()) {
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
    drawer.remove();

    // Refresh calendar
    const container = byId("calendarWidget");
    if (container) {
      if (!window.calendarDate) window.calendarDate = new Date();
      container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
    }
  });
};
