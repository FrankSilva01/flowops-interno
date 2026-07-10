import { state } from "../core/state.js";
import { byId, showAppMessage } from "../core/dom.js";

export function bindCalendarEvents() {
  // Load custom events from localStorage
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

  let html = `
    <div style="padding: 15px; background: #0f1419; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: #fff; font-size: 14px;">${monthNames[month]} ${year}</h3>
      </div>

      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 15px; font-size: 12px;">
  `;

  // Day headers
  dayNames.forEach(day => {
    html += `<div style="text-align: center; color: #999; font-weight: 600; padding: 6px 0; text-transform: uppercase; font-size: 9px;">${day}</div>`;
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

    const dayEvents = getCalendarEventsForDay(date);
    const hasEvents = dayEvents.length > 0;

    html += `
      <div
        style="
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          background: ${isToday ? '#00D084' : hasEvents ? '#1a2332' : 'transparent'};
          border: 1px solid ${isToday ? '#00D084' : hasEvents ? '#00D084' : '#333'};
          cursor: pointer;
          transition: all 0.2s;
          color: ${isToday ? '#000' : '#ddd'};
          font-weight: ${isToday ? '700' : '500'};
          font-size: 11px;
        "
        title="${hasEvents ? dayEvents.map(e => e.label).join(' | ') : ''}"
        onclick="window.openEventForm('${dateStr}')"
      >
        <div style="text-align: center;">
          <div>${day}</div>
          ${hasEvents ? `<div style="font-size: 8px; opacity: 0.7;">●</div>` : ''}
        </div>
      </div>
    `;
  }

  html += `
      </div>

      <div style="background: #1a2332; padding: 10px; border-radius: 6px; border-left: 3px solid #00D084; font-size: 11px;">
        <button
          onclick="window.openEventForm()"
          style="
            background: #00D084;
            color: #000;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            font-size: 11px;
            width: 100%;
          "
        >
          + Marcar evento
        </button>
      </div>
    </div>
  `;

  return html;
}

function getCalendarEventsForDay(date) {
  const dateStr = date.toISOString().split("T")[0];
  const events = [];

  // Check marketplace sales
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

  // Check custom events
  const customEvents = window.calendarEvents?.[dateStr] || [];
  customEvents.forEach(event => {
    events.push({
      type: "custom",
      label: event,
    });
  });

  return events;
}

window.openEventForm = (dateStr) => {
  const date = dateStr ? new Date(dateStr) : new Date();
  const modal = document.createElement("dialog");
  modal.className = "modal";

  modal.innerHTML = `
    <div style="padding: 20px; max-width: 400px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 16px;">Marcar evento</h2>
        <button onclick="this.closest('dialog').close()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">✕</button>
      </div>

      <div style="margin-bottom: 15px;">
        <label style="display: block; color: #999; font-size: 12px; margin-bottom: 6px;">Data</label>
        <input type="date" id="eventDate" value="${date.toISOString().split('T')[0]}" style="width: 100%; padding: 8px; background: #1a2332; border: 1px solid #222; color: #fff; border-radius: 4px;">
      </div>

      <div style="margin-bottom: 15px;">
        <label style="display: block; color: #999; font-size: 12px; margin-bottom: 6px;">Evento</label>
        <input type="text" id="eventText" placeholder="Ex: Entrega importante, Prazo de pagamento..." style="width: 100%; padding: 8px; background: #1a2332; border: 1px solid #222; color: #fff; border-radius: 4px;">
      </div>

      <div style="display: flex; gap: 10px;">
        <button
          onclick="window.saveCalendarEvent()"
          style="flex: 1; background: #00D084; color: #000; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px;"
        >
          Salvar
        </button>
        <button
          onclick="this.closest('dialog').close()"
          style="flex: 1; background: #222; color: #fff; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;"
        >
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.showModal();

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.close();
  });
};

window.saveCalendarEvent = () => {
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

  const modal = document.querySelector(".modal");
  if (modal) modal.close();

  // Refresh calendar if visible
  const calendarWidget = document.getElementById("calendarWidget");
  if (calendarWidget) {
    const now = new Date();
    calendarWidget.innerHTML = renderCalendarWithEvents(now.getFullYear(), now.getMonth());
  }
};
