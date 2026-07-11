import { state } from "../core/state.js";
import { byId, showAppMessage } from "../core/dom.js";

// Feriados e datas importantes - Ano inteiro
const FERIADOS = {
  // 2025
  "2025-01-01": "🎉 Ano Novo",
  "2025-02-01": "✝️ Sexta-feira Santa",
  "2025-02-04": "🎭 Carnaval",
  "2025-04-21": "👨 Tiradentes",
  "2025-05-01": "🏢 Dia do Trabalho",
  "2025-05-11": "💐 Dia das Mães",
  "2025-05-31": "📋 DASN-SIMEI (Declaração MEI)",
  "2025-06-12": "🎪 Festa Junina",
  "2025-10-12": "👑 N. Sra. Aparecida",
  "2025-10-12": "🎈 Dia das Crianças",
  "2025-09-07": "🌳 Independência",
  "2025-11-02": "💀 Finados",
  "2025-11-15": "🏛️ Proclamação da República",
  "2025-11-20": "🖤 Consciência Negra",
  "2025-12-25": "🎄 Natal",
  // 2026
  "2026-01-01": "🎉 Ano Novo",
  "2026-02-13": "✝️ Sexta-feira Santa",
  "2026-02-17": "🎭 Carnaval",
  "2026-04-21": "👨 Tiradentes",
  "2026-05-01": "🏢 Dia do Trabalho",
  "2026-05-10": "💐 Dia das Mães",
  "2026-05-31": "📋 DASN-SIMEI (Declaração MEI)",
  "2026-06-13": "🎪 Festa Junina",
  "2026-10-12": "👑 N. Sra. Aparecida",
  "2026-10-12": "🎈 Dia das Crianças",
  "2026-09-07": "🌳 Independência",
  "2026-11-02": "💀 Finados",
  "2026-11-15": "🏛️ Proclamação da República",
  "2026-11-20": "🖤 Consciência Negra",
  "2026-12-25": "🎄 Natal",
  // 2027
  "2027-01-01": "🎉 Ano Novo",
  "2027-03-30": "✝️ Sexta-feira Santa",
  "2027-03-02": "🎭 Carnaval",
  "2027-04-21": "👨 Tiradentes",
  "2027-05-01": "🏢 Dia do Trabalho",
  "2027-05-09": "💐 Dia das Mães",
  "2027-05-31": "📋 DASN-SIMEI (Declaração MEI)",
  "2027-06-12": "🎪 Festa Junina",
  "2027-10-12": "👑 N. Sra. Aparecida",
  "2027-10-12": "🎈 Dia das Crianças",
  "2027-09-07": "🌳 Independência",
  "2027-11-02": "💀 Finados",
  "2027-11-15": "🏛️ Proclamação da República",
  "2027-11-20": "🖤 Consciência Negra",
  "2027-12-25": "🎄 Natal",
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
        <button class="calendar-nav-btn cal-prev-btn"><i class="ti ti-chevron-left"></i></button>

        <div class="calendar-month-year-selector">
          <select id="calendarMonth" class="calendar-selector" style="cursor: pointer;">
            ${monthNames.map((m, i) => `<option value="${i}" ${i === month ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <select id="calendarYear" class="calendar-selector" style="cursor: pointer;">
            ${[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
          <button id="calendarToday" class="calendar-nav-btn" title="Ir para hoje"><i class="ti ti-calendar-check"></i></button>
        </div>

        <button class="calendar-nav-btn cal-next-btn"><i class="ti ti-chevron-right"></i></button>
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

    html += `
      <div class="calendar-day-cell${isToday ? ' today' : ''}" data-date="${dateStr}" data-events='${JSON.stringify(dayEvents).replace(/'/g, "&apos;")}'>
        <div class="calendar-day-number">${day}</div>
        <div class="calendar-day-events">
          ${dayEvents.slice(0, 2).map(event => `
            <div class="calendar-event-badge ${event.type}" title="${event.displayLabel}">
              ${event.displayLabel.length > 14 ? event.displayLabel.slice(0, 12) + '...' : event.displayLabel}
            </div>
          `).join('')}
          ${dayEvents.length > 2 ? `<div class="calendar-event-more">+${dayEvents.length - 2}</div>` : ''}
        </div>
        ${hasEvents ? `<div class="calendar-tooltip">${buildTooltipText(dayEvents)}</div>` : ''}
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
    const holidayName = FERIADOS[dateStr];
    events.push({
      type: "feriado",
      displayLabel: `🇧🇷 ${holidayName}`,
      tooltip: `Feriado: ${holidayName}`,
      count: 1,
      action: null,
    });
  }

  // Marketplace sales
  const sales = (state.marketplaceSales || []).filter(s => {
    const dateField = s.date || s.created_at || s.saleDate || s.sale_date || "";
    const saleDate = dateField ? dateField.split("T")[0] : "";
    return saleDate === dateStr && saleDate;
  });

  if (sales.length) {
    sales.forEach(s => {
      const title = s.title || s.product_name || s.name || s.produto || 'Produto';

      // Detectar preço de múltiplos campos possíveis
      let price = 0;
      if (s.price && parseFloat(s.price) > 0) price = s.price;
      else if (s.value && parseFloat(s.value) > 0) price = s.value;
      else if (s.amount && parseFloat(s.amount) > 0) price = s.amount;
      else if (s.sale_price && parseFloat(s.sale_price) > 0) price = s.sale_price;
      else if (s.valor && parseFloat(s.valor) > 0) price = s.valor;
      else if (s.total && parseFloat(s.total) > 0) price = s.total;

      const channel = s.marketplace || s.channel || s.plataforma || 'Marketplace';
      const saleId = s.id || s.sale_id || s.sale_ID;
      const quantity = s.quantity || s.qtd || s.quantidade || 1;

      events.push({
        type: "sales",
        displayLabel: `🛒 ${title}`,
        tooltip: `VENDA\n${title}\n${quantity}x · R$ ${parseFloat(price).toFixed(2)}\nOrigem: ${channel}`,
        count: 1,
        data: s,
        action: "marketplace",
        itemId: saleId,
        itemName: title,
        itemType: "sale",
      });
    });
  }

  // Orders/Deliveries
  const orders = (state.data?.orders || []).filter(o => {
    const delivField = o.deliveryDate || o.delivery_date || "";
    const createField = o.createdAt || o.created_at || "";
    const delivDate = delivField ? delivField.split("T")[0] : "";
    const createDate = createField ? createField.split("T")[0] : "";
    return (delivDate === dateStr && delivDate) || (createDate === dateStr && createDate);
  });

  if (orders.length) {
    orders.forEach(o => {
      // Campos reais: description = nome do produto, quantity = qtd
      const itemName = o.description || o.client || 'Pedido';
      const itemQty = o.quantity || 1;
      const totalItems = 1;
      const orderId = o.id || o.order_id || o.pedido_id || o.numero;
      const status = o.status || o.deliveryStatus || o.statusEntrega || 'Entregue';
      const origin = o.marketplace || o.origin || o.origem || o.channel || 'Loja';

      events.push({
        type: "delivery",
        displayLabel: `📦 ${itemName}`,
        tooltip: `PEDIDO\n${itemName}\n${itemQty}x · R$ ${parseFloat(o.charged || 0).toFixed(2)}\nPedido #${orderId || '---'}\nOrigem: ${origin}\nStatus: ${status}`,
        count: 1,
        data: o,
        action: "orders",
        itemId: orderId,
        itemName: itemName,
        itemType: "delivery",
      });
    });
  }

  // Logistics
  const logistics = (state.orderLogistics || []).filter(l => {
    const logField = l.created_at || l.data_criacao || l.dataCriacao || "";
    const logDate = logField ? logField.split("T")[0] : "";
    return logDate === dateStr && logDate;
  });

  if (logistics.length) {
    logistics.forEach(l => {
      const status = l.status || l.event_type || l.tipo_evento || 'Em trânsito';
      const description = l.description || l.message || l.mensagem || l.descricao || '';
      const orderId = l.order_id || l.orderId || l.pedido_id || l.numero;
      const productName = l.product_name || l.item_name || l.produto || l.nome_produto || 'Produto';

      events.push({
        type: "logistics",
        displayLabel: `🚚 ${status}: ${productName}`,
        tooltip: `EM TRÂNSITO\nPedido #${orderId || '---'}\n${productName}\n${status}${description ? '\n' + description : ''}`,
        count: 1,
        data: l,
        action: "logistics",
        itemId: orderId,
        itemName: productName,
        itemType: "logistics",
      });
    });
  }

  // Cash/Financial
  const cash = (state.data?.cash || []).filter(c => {
    const cashField = c.date || c.data || c.dataCaixa || c.data_lancamento || "";
    const cashDate = cashField ? cashField.split("T")[0] : "";
    return cashDate === dateStr && cashDate;
  });

  if (cash.length) {
    cash.forEach(c => {
      // Detectar tipo: income > 0 = Entrada, expense > 0 = Saída
      let type = 'Lançamento';
      if (c.income && parseFloat(c.income) > 0) type = 'Entrada';
      else if (c.expense && parseFloat(c.expense) > 0) type = 'Saída';
      else {
        const typeStr = (c.type || '').toString().toLowerCase();
        if (typeStr.includes('entrada') || typeStr.includes('in')) type = 'Entrada';
        else if (typeStr.includes('saida') || typeStr.includes('out')) type = 'Saída';
      }

      // Campos reais do cash: income (entrada) e expense (saída)
      let value = 0;
      if (c.income && parseFloat(c.income) > 0) value = c.income;
      else if (c.expense && parseFloat(c.expense) > 0) value = c.expense;
      else if (c.value && parseFloat(c.value) > 0) value = c.value;
      else if (c.amount && parseFloat(c.amount) > 0) value = c.amount;

      const description = c.description || c.note || c.descricao || c.anotacao || c.observacao || 'Sem descrição';
      const cashId = c.id || c.cash_id || c.lancamento_id;

      // Só adicionar se tiver um valor válido
      if (parseFloat(value) > 0) {
        events.push({
          type: "cash",
          displayLabel: `💰 ${type}: R$ ${parseFloat(value).toFixed(2)}`,
          tooltip: `${type}\nR$ ${parseFloat(value).toFixed(2)}\n${description}`,
          count: 1,
          data: c,
          action: "cash",
          itemId: cashId,
          itemName: description,
          itemType: "cash",
        });
      }
    });
  }

  // Custom events
  const customEvents = window.calendarEvents?.[dateStr] || [];
  customEvents.forEach((event, idx) => {
    events.push({
      type: "custom",
      displayLabel: `📌 ${event}`,
      tooltip: `Evento: ${event}\n\n(Clique para editar ou excluir)`,
      count: 1,
      isCustom: true,
      customIndex: idx,
      action: null,
    });
  });

  return events;
}

function attachCalendarEventListeners() {
  const container = byId("calendarWidget");

  // Função auxiliar para atualizar calendário
  const updateCalendar = (newDate) => {
    if (container) {
      window.calendarDate = newDate;
      container.innerHTML = renderCalendarWithEvents(newDate.getFullYear(), newDate.getMonth());
      attachCalendarEventListeners();
      updateCalendarStats(newDate.getFullYear(), newDate.getMonth());
    }
  };

  // Próximo mês
  const nextBtn = document.querySelector(".cal-next-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (!window.calendarDate) window.calendarDate = new Date();
      const newDate = new Date(window.calendarDate);
      newDate.setMonth(newDate.getMonth() + 1);
      updateCalendar(newDate);
    });
  }

  // Mês anterior
  const prevBtn = document.querySelector(".cal-prev-btn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (!window.calendarDate) window.calendarDate = new Date();
      const newDate = new Date(window.calendarDate);
      newDate.setMonth(newDate.getMonth() - 1);
      updateCalendar(newDate);
    });
  }

  // Seletor de mês
  const monthSelect = document.getElementById("calendarMonth");
  if (monthSelect) {
    monthSelect.addEventListener("change", (e) => {
      if (!window.calendarDate) window.calendarDate = new Date();
      const newDate = new Date(window.calendarDate);
      newDate.setMonth(parseInt(e.target.value));
      updateCalendar(newDate);
    });
  }

  // Seletor de ano
  const yearSelect = document.getElementById("calendarYear");
  if (yearSelect) {
    yearSelect.addEventListener("change", (e) => {
      if (!window.calendarDate) window.calendarDate = new Date();
      const newDate = new Date(window.calendarDate);
      newDate.setFullYear(parseInt(e.target.value));
      updateCalendar(newDate);
    });
  }

  // Botão "Hoje"
  const todayBtn = document.getElementById("calendarToday");
  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      updateCalendar(new Date());
    });
  }

  // Marcar evento
  const markBtn = document.querySelector(".cal-mark-event-btn");
  if (markBtn) {
    markBtn.addEventListener("click", () => {
      openEventForm();
    });
  }

  // Tooltip positioning
  const dayElements = document.querySelectorAll(".calendar-day-cell");
  dayElements.forEach(dayEl => {
    const tooltip = dayEl.querySelector(".calendar-tooltip");
    if (tooltip) {
      dayEl.addEventListener("mouseenter", () => {
        positionTooltip(dayEl, tooltip);
      });
    }

    // Click nos eventos para navegar ou editar
    dayEl.addEventListener("click", (e) => {
      const eventsData = dayEl.getAttribute("data-events");
      if (eventsData) {
        try {
          const events = JSON.parse(eventsData);
          const clickedBadge = e.target.closest(".calendar-event-badge");

          if (clickedBadge) {
            const badgeIndex = Array.from(dayEl.querySelectorAll(".calendar-event-badge")).indexOf(clickedBadge);
            if (badgeIndex >= 0 && events[badgeIndex]) {
              const clickedEvent = events[badgeIndex];
              // Mostrar modal para qualquer evento
              showEventDetailsModal(dayEl.getAttribute("data-date"), clickedEvent);
            }
          }
        } catch (err) {
          console.error("Erro ao processar evento:", err);
        }
      }
    });

  });
}

function positionTooltip(dayEl, tooltip) {
  setTimeout(() => {
    const rect = dayEl.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const calendarContainer = dayEl.closest(".calendar-modern");

    let top = rect.top - tooltipHeight - 12;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Ajustar se sair da tela
    if (top < 10) {
      top = rect.bottom + 12;
    }
    if (left < 10) {
      left = 10;
    }
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }

    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
  }, 0);
}

function navigateToEvent(action, itemData) {
  // Armazenar filtro no localStorage
  if (itemData) {
    localStorage.setItem("calendarFilter", JSON.stringify({
      type: action,
      itemId: itemData.itemId,
      itemName: itemData.itemName,
      itemType: itemData.itemType,
      timestamp: Date.now(),
    }));
  }

  const tabs = {
    marketplace: () => document.querySelector('[data-view="marketplace"]')?.click(),
    orders: () => document.querySelector('[data-view="orders"]')?.click(),
    logistics: () => document.querySelector('[data-view="logistics"]')?.click(),
    cash: () => document.querySelector('[data-view="cash"]')?.click(),
  };

  if (tabs[action]) {
    tabs[action]();
  }
}

function showEventDetailsModal(dateStr, event) {
  const existingModal = document.querySelector(".calendar-event-modal");
  if (existingModal) existingModal.remove();
  const existingOverlay = document.querySelector(".calendar-modal-overlay");
  if (existingOverlay) existingOverlay.remove();

  const modal = document.createElement("div");
  modal.className = "calendar-event-modal";

  // Cores diferentes por tipo de evento
  const colorMap = {
    sales: "#00D084",
    delivery: "#4CAF50",
    logistics: "#ffc107",
    cash: "#845ef7",
    feriado: "#ff6b6b",
    custom: "#3b82f6",
  };

  const color = colorMap[event.type] || "#00D084";
  const typeLabel = EVENT_LABELS[event.type] || "Evento";

  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    z-index: 10002;
    min-width: 340px;
    max-width: 90vw;
    overflow: hidden;
  `;

  const detailsHtml = event.tooltip.split('\n').map((line, idx) => {
    if (idx === 0) return `<div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;">${line}</div>`;
    return `<div style="font-size: 13px; margin: 4px 0; color: rgba(255,255,255,0.9)">${line}</div>`;
  }).join('');

  modal.innerHTML = `
    <div style="background: linear-gradient(135deg, ${color}, ${color}dd); padding: 24px; color: white;">
      ${event.displayLabel ? `<div style="font-size: 18px; font-weight: 700; word-break: break-word; margin-top: 8px;">${event.displayLabel}</div>` : ''}
    </div>

    <div style="padding: 24px;">
      ${detailsHtml}
    </div>

    <div style="padding: 0 24px 24px; display: flex; flex-direction: column; gap: 12px;">
      ${event.isCustom ? `
        <div style="display: flex; gap: 10px;">
          <button id="editBtn" style="
            flex: 1;
            background: rgba(0, 208, 132, 0.1);
            color: #00D084;
            border: 1.5px solid #00D084;
            padding: 12px 16px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          ">
            <i class="ti ti-edit"></i> Editar
          </button>
          <button id="deleteBtn" style="
            flex: 1;
            background: rgba(255, 107, 107, 0.1);
            color: #ff6b6b;
            border: 1.5px solid #ff6b6b;
            padding: 12px 16px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 700;
            font-size: 13px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          ">
            <i class="ti ti-trash"></i> Excluir
          </button>
        </div>
      ` : ''}
      ${event.action ? `
        <button id="navigateBtn" style="
          width: 100%;
          background: linear-gradient(135deg, ${color}, ${color}dd);
          color: white;
          border: none;
          padding: 12px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <i class="ti ti-arrow-right"></i> Ver Detalhes
        </button>
      ` : ''}
      <button id="closeBtn" style="
        width: 100%;
        background: transparent;
        color: var(--muted);
        border: 1px solid var(--line);
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        transition: all 0.2s ease;
      ">Fechar</button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.className = "calendar-modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 10001;
    backdrop-filter: blur(2px);
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
    overlay.remove();
  };

  const closeBtn = modal.querySelector("#closeBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);

  if (event.isCustom) {
    const editBtn = modal.querySelector("#editBtn");
    const deleteBtn = modal.querySelector("#deleteBtn");

    editBtn.addEventListener("click", () => {
      closeModal();
      editCustomEvent(dateStr, event.customIndex);
    });

    deleteBtn.addEventListener("click", () => {
      if (confirm("Tem certeza que deseja excluir este evento?")) {
        closeModal();
        deleteCustomEvent(dateStr, event.customIndex);
      }
    });

    editBtn.addEventListener("mouseover", () => {
      editBtn.style.background = "rgba(0, 208, 132, 0.2)";
    });
    editBtn.addEventListener("mouseout", () => {
      editBtn.style.background = "rgba(0, 208, 132, 0.1)";
    });

    deleteBtn.addEventListener("mouseover", () => {
      deleteBtn.style.background = "rgba(255, 107, 107, 0.2)";
    });
    deleteBtn.addEventListener("mouseout", () => {
      deleteBtn.style.background = "rgba(255, 107, 107, 0.1)";
    });
  }

  if (event.action) {
    const navigateBtn = modal.querySelector("#navigateBtn");
    navigateBtn.addEventListener("click", () => {
      closeModal();
      navigateToEvent(event.action, {
        itemId: event.itemId,
        itemName: event.itemName,
        itemType: event.itemType,
      });
    });

    navigateBtn.addEventListener("mouseover", () => {
      navigateBtn.style.opacity = "0.9";
    });
    navigateBtn.addEventListener("mouseout", () => {
      navigateBtn.style.opacity = "1";
    });
  }
}

function showCustomEventModal(dateStr, event) {
  const existingModal = document.querySelector(".calendar-event-modal");
  if (existingModal) existingModal.remove();
  const existingOverlay = document.querySelector(".calendar-modal-overlay");
  if (existingOverlay) existingOverlay.remove();

  const modal = document.createElement("div");
  modal.className = "calendar-event-modal";
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--panel);
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    z-index: 10002;
    min-width: 340px;
    max-width: 90vw;
    overflow: hidden;
  `;

  modal.innerHTML = `
    <div style="background: linear-gradient(135deg, #00D084, #00c078); padding: 24px; color: white;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9; margin-bottom: 8px;">Evento Customizado</div>
      <div style="font-size: 18px; font-weight: 700; word-break: break-word;">${event.displayLabel.replace('📌 ', '')}</div>
    </div>

    <div style="padding: 24px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; gap: 10px;">
        <button id="editBtn" style="
          flex: 1;
          background: rgba(0, 208, 132, 0.1);
          color: #00D084;
          border: 1.5px solid #00D084;
          padding: 12px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <i class="ti ti-edit"></i> Editar
        </button>
        <button id="deleteBtn" style="
          flex: 1;
          background: rgba(255, 107, 107, 0.1);
          color: #ff6b6b;
          border: 1.5px solid #ff6b6b;
          padding: 12px 16px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <i class="ti ti-trash"></i> Excluir
        </button>
      </div>
      <button id="closeBtn" style="
        width: 100%;
        background: transparent;
        color: var(--muted);
        border: 1px solid var(--line);
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        transition: all 0.2s ease;
      ">Fechar</button>
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.className = "calendar-modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 10001;
    backdrop-filter: blur(2px);
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(modal);

  const editBtn = modal.querySelector("#editBtn");
  const deleteBtn = modal.querySelector("#deleteBtn");
  const closeBtn = modal.querySelector("#closeBtn");

  const closeModal = () => {
    modal.remove();
    overlay.remove();
  };

  editBtn.addEventListener("click", () => {
    closeModal();
    editCustomEvent(dateStr, event.customIndex);
  });

  deleteBtn.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja excluir este evento?")) {
      closeModal();
      deleteCustomEvent(dateStr, event.customIndex);
    }
  });

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);

  editBtn.addEventListener("mouseover", () => {
    editBtn.style.background = "rgba(0, 208, 132, 0.2)";
  });
  editBtn.addEventListener("mouseout", () => {
    editBtn.style.background = "rgba(0, 208, 132, 0.1)";
  });

  deleteBtn.addEventListener("mouseover", () => {
    deleteBtn.style.background = "rgba(255, 107, 107, 0.2)";
  });
  deleteBtn.addEventListener("mouseout", () => {
    deleteBtn.style.background = "rgba(255, 107, 107, 0.1)";
  });
}

function showCustomEventMenu(dayEl, event, allEvents) {
  const existingMenu = document.querySelector(".calendar-context-menu");
  if (existingMenu) existingMenu.remove();

  const dateStr = dayEl.getAttribute("data-date");
  const customEvents = allEvents.filter(e => e.isCustom);

  if (customEvents.length === 0) return;

  const menu = document.createElement("div");
  menu.className = "calendar-context-menu";
  menu.style.cssText = `
    position: fixed;
    background: var(--panel);
    border: 1.5px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 10001;
    min-width: 200px;
    overflow: hidden;
  `;

  let html = '';
  customEvents.forEach((ev, idx) => {
    html += `
      <div style="padding: 4px 0;">
        <div style="padding: 8px 16px; background: var(--canvas); border-bottom: 1px solid var(--line);">
          <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">Evento ${idx + 1}</div>
          <div style="font-size: 12px; color: var(--ink); word-break: break-word;">${ev.displayLabel.replace('📌 ', '')}</div>
        </div>
        <div style="display: flex; gap: 6px; padding: 8px 8px;">
          <button class="calendar-menu-item" data-date="${dateStr}" data-index="${ev.customIndex}" style="
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 12px;
            background: transparent;
            border: 1px solid var(--teal);
            color: var(--teal);
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(0, 208, 132, 0.1)'" onmouseout="this.style.background='transparent'">
            <i class="ti ti-edit"></i> Editar
          </button>
          <button class="calendar-menu-delete" data-date="${dateStr}" data-index="${ev.customIndex}" style="
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px 12px;
            background: transparent;
            border: 1px solid #ff6b6b;
            color: #ff6b6b;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
          " onmouseover="this.style.background='rgba(255, 107, 107, 0.1)'" onmouseout="this.style.background='transparent'">
            <i class="ti ti-trash"></i> Deletar
          </button>
        </div>
      </div>
    `;
  });

  menu.innerHTML = html;
  document.body.appendChild(menu);

  // Posicionar menu
  setTimeout(() => {
    const rect = dayEl.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;

    // Ajustar se sair da tela
    if (left + 200 > window.innerWidth - 10) {
      left = window.innerWidth - 220;
    }
    if (top + menu.offsetHeight > window.innerHeight - 10) {
      top = rect.top - menu.offsetHeight - 8;
    }

    menu.style.top = top + "px";
    menu.style.left = Math.max(10, left) + "px";
  }, 0);

  // Eventos do menu
  menu.querySelectorAll(".calendar-menu-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-date");
      const idx = parseInt(btn.getAttribute("data-index"));
      editCustomEvent(date, idx);
      menu.remove();
    });
  });

  menu.querySelectorAll(".calendar-menu-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-date");
      const idx = parseInt(btn.getAttribute("data-index"));
      deleteCustomEvent(date, idx);
      menu.remove();
    });
  });

  // Fechar ao clicar fora
  setTimeout(() => {
    document.addEventListener("click", () => {
      menu.remove();
    }, { once: true });
  }, 100);
}

function editCustomEvent(dateStr, index) {
  if (!window.calendarEvents || !window.calendarEvents[dateStr]) return;

  const currentEvent = window.calendarEvents[dateStr][index];

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
    z-index: 10001;
    min-width: 350px;
    max-width: 90vw;
  `;

  dialog.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--ink);">Editar evento</h2>
      <button id="closeForm" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--muted);">✕</button>
    </div>

    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">Data</label>
        <input type="date" id="eventDate" value="${dateStr}" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 13px; background: var(--canvas); color: var(--ink); box-sizing: border-box;">
      </div>

      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; text-transform: uppercase;">Descrição do evento</label>
        <input type="text" id="eventText" value="${currentEvent}" style="width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 13px; background: var(--canvas); color: var(--ink); box-sizing: border-box;">
      </div>

      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <button id="saveEvent" style="flex: 1; background: var(--teal); color: white; border: none; padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s ease;">
          <i class="ti ti-check"></i> Salvar
        </button>
        <button id="cancelEvent" style="flex: 1; background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px;">
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
    z-index: 10000;
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
    const newDate = document.getElementById("eventDate").value;
    const newText = document.getElementById("eventText").value.trim();

    if (!newDate || !newText) {
      showAppMessage("Preencha data e descrição", "warning");
      return;
    }

    // Remover do local antigo
    if (newDate !== dateStr) {
      window.calendarEvents[dateStr].splice(index, 1);
      if (window.calendarEvents[dateStr].length === 0) {
        delete window.calendarEvents[dateStr];
      }
    }

    // Adicionar no novo local
    if (!window.calendarEvents[newDate]) {
      window.calendarEvents[newDate] = [];
    }
    if (newDate === dateStr) {
      window.calendarEvents[dateStr][index] = newText;
    } else {
      window.calendarEvents[newDate].push(newText);
    }

    localStorage.setItem("calendarCustomEvents", JSON.stringify(window.calendarEvents));
    showAppMessage("✅ Evento atualizado!", "success");
    closeDialog();

    // Refresh
    const container = byId("calendarWidget");
    if (container) {
      if (!window.calendarDate) window.calendarDate = new Date();
      container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
      attachCalendarEventListeners();
      updateCalendarStats(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
    }
  });
}

function deleteCustomEvent(dateStr, index) {
  if (confirm("Tem certeza que deseja deletar este evento?")) {
    if (window.calendarEvents && window.calendarEvents[dateStr]) {
      window.calendarEvents[dateStr].splice(index, 1);
      if (window.calendarEvents[dateStr].length === 0) {
        delete window.calendarEvents[dateStr];
      }
      localStorage.setItem("calendarCustomEvents", JSON.stringify(window.calendarEvents));
      showAppMessage("✅ Evento deletado!", "success");

      // Refresh
      const container = byId("calendarWidget");
      if (container) {
        if (!window.calendarDate) window.calendarDate = new Date();
        container.innerHTML = renderCalendarWithEvents(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
        attachCalendarEventListeners();
        updateCalendarStats(window.calendarDate.getFullYear(), window.calendarDate.getMonth());
      }
    }
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
    z-index: 10001;
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
        <button id="saveEvent" style="flex: 1; background: var(--teal); color: white; border: none; padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px;">
          <i class="ti ti-check"></i> Salvar
        </button>
        <button id="cancelEvent" style="flex: 1; background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px;">
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
    z-index: 10000;
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
  let salesCount = 0, deliveriesCount = 0, logisticsCount = 0, cashCount = 0, totalCount = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Coletar eventos e contar
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const events = getCalendarEventsForDay(date);

    events.forEach(e => {
      if (e.type === "sales") {
        salesCount += (e.count || 1);
        totalCount += (e.count || 1);
      }
      if (e.type === "delivery") {
        deliveriesCount += (e.count || 1);
        totalCount += (e.count || 1);
      }
      if (e.type === "logistics") {
        logisticsCount += (e.count || 1);
        totalCount += (e.count || 1);
      }
      if (e.type === "cash") {
        cashCount += (e.count || 1);
        totalCount += (e.count || 1);
      }
    });
  }

  // Atualizar elementos de resumo
  const salesEl = document.getElementById("monthSales");
  const deliveriesEl = document.getElementById("monthDeliveries");
  const logisticsEl = document.getElementById("monthLogistics");
  const cashEl = document.getElementById("monthCash");

  if (salesEl) salesEl.textContent = salesCount || 0;
  if (deliveriesEl) deliveriesEl.textContent = deliveriesCount || 0;
  if (logisticsEl) logisticsEl.textContent = logisticsCount || 0;
  if (cashEl) cashEl.textContent = cashCount || 0;

  // Atualizar total de eventos
  const totalEl = document.getElementById("monthTotal");
  if (totalEl) totalEl.textContent = totalCount || 0;

  // Atualizar próximos eventos
  updateUpcomingEvents(year, month);
}

function updateUpcomingEvents(year, month) {
  const upcomingEl = document.getElementById("upcomingEvents");
  if (!upcomingEl) return;

  const events = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Coletar eventos dos próximos 7 dias
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 7);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);

    // Só contar eventos que estão nos próximos 7 dias
    if (date >= today && date <= endDate) {
      const dayEvents = getCalendarEventsForDay(date);
      dayEvents.forEach(e => {
        if (e.type !== "feriado") {
          events.push({
            date: date.toLocaleDateString("pt-BR"),
            type: e.type,
            label: e.displayLabel,
            tooltip: e.tooltip,
          });
        }
      });
    }
  }

  // Renderizar eventos
  if (events.length === 0) {
    upcomingEl.innerHTML = '<p style="color: var(--muted); margin: 0;">Nenhum evento nos próximos 7 dias</p>';
  } else {
    upcomingEl.innerHTML = events.map(e => `
      <div style="padding: 10px; background: var(--canvas); border-left: 3px solid ${colorMap[e.type] || '#00D084'}; border-radius: 6px;">
        <div style="font-weight: 600; color: var(--ink); font-size: 11px;">${e.label}</div>
        <div style="font-size: 10px; color: var(--muted); margin-top: 4px;">${e.date}</div>
      </div>
    `).join('');
  }
}

const colorMap = {
  sales: "#00D084",
  delivery: "#4CAF50",
  logistics: "#ffc107",
  cash: "#845ef7",
  custom: "#3b82f6",
};

export { bindCalendarEvents, renderCalendarWithEvents, attachCalendarEventListeners, updateCalendarStats };
