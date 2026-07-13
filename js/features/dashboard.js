import { state, money } from "../core/state.js";
import { byId, html, countBy, sum, formatDate, formatDateShort, formatDateTime, formatRelativeTime, flashActionMessage } from "../core/dom.js";
import { renderBarChart, renderLineChart } from "../core/charts.js";
import { setView, bindActions, renderTables } from "../core/router.js";
import { getOrderPriority, getOrderCode, getMarketplaceLabel, syncOrderFilterControls } from "./orders.js";
import { formatInventoryNumber, setMaterialsTab } from "./materials.js";
import { getLeadFollowUp } from "./customers.js";
import { getSubscriptionAlert, subscriptionStatusText } from "./subscription.js";
import { normalizeMarketplaceChannel } from "./marketplace.js";
import { renderDeliveryStatusWidget, getDeliveryStatusCounts } from "./logistics.js";
import { renderProfitabilityDashboardWidget, getProfitabilitySummary, hasCommercialIntelligenceAccess } from "./pricing.js";
import { renderMarketplaceCommandWidget } from "./marketplace-analytics.js";

export function initDashboardDrag() {
  applyDashboardOrder();
  renderDashboardCustomizer();
  applyDashboardVisibility();
  bindDashboardCollapsibles();
  document.querySelectorAll("[data-dashboard-card]").forEach((card) => {
    card.addEventListener("dragstart", () => {
      state.draggedDashboardCard = card;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      state.draggedDashboardCard = null;
      saveDashboardOrder();
    });
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = state.draggedDashboardCard;
      if (!dragging || dragging === card) return;
      const grid = byId("dashboardGrid");
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      grid.insertBefore(dragging, after ? card.nextSibling : card);
    });
  });
}

export function bindDashboardCollapsibles() {
  document.querySelectorAll("[data-collapsible-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const card = toggle.closest("[data-dashboard-card]");
      if (!card) return;
      const collapsed = card.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
  });
}

export function applyDashboardOrder() {
  const grid = byId("dashboardGrid");
  if (!grid) return;
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem("3daft-dashboard-order") || "[]");
  } catch {
    saved = [];
  }
  saved.forEach((key) => {
    const card = grid.querySelector(`[data-dashboard-card="${key}"]`);
    if (card) grid.appendChild(card);
  });
}

export function saveDashboardOrder() {
  const order = [...document.querySelectorAll("[data-dashboard-card]")].map((card) => card.dataset.dashboardCard);
  localStorage.setItem("3daft-dashboard-order", JSON.stringify(order));
}

export const DASHBOARD_CARD_LABELS = {
  financial: "Financeiro",
  "status-breakdown": "Encomendas por status",
  "material-breakdown": "Encomendas por material",
  "daily-cash": "Movimento por dia",
  "integration-health": "Integrações",
  "top-open": "Top valores em aberto",
  logistics: "Status das Entregas",
  profitability: "Saúde dos Anúncios",
  "material-summary": "Resumo por material",
  commercial: "Comercial",
  "top-products": "Produtos mais vendidos",
  "follow-up": "Follow-up"
};

export function renderDashboardCustomizer() {
  const target = byId("dashboardCustomizeOptions");
  if (!target) return;
  target.innerHTML = [...document.querySelectorAll("[data-dashboard-card]")].map((card) => {
    const key = card.dataset.dashboardCard;
    const checked = !state.dashboardHiddenCards.includes(key);
    return `<label><input type="checkbox" data-dashboard-toggle="${html(key)}" ${checked ? "checked" : ""} /> ${html(DASHBOARD_CARD_LABELS[key] || key)}</label>`;
  }).join("");
  target.querySelectorAll("[data-dashboard-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.dashboardToggle;
      state.dashboardHiddenCards = input.checked ?
         state.dashboardHiddenCards.filter((item) => item !== key)
        : [...new Set([...state.dashboardHiddenCards, key])];
      localStorage.setItem("3daft-dashboard-hidden", JSON.stringify(state.dashboardHiddenCards));
      applyDashboardVisibility();
    });
  });
}

export function applyDashboardVisibility() {
  document.querySelectorAll("[data-dashboard-card]").forEach((card) => {
    card.hidden = state.dashboardHiddenCards.includes(card.dataset.dashboardCard);
  });
}

export function resetDashboardPreferences() {
  state.dashboardHiddenCards = [];
  localStorage.removeItem("3daft-dashboard-hidden");
  localStorage.removeItem("3daft-dashboard-order");
  applyDashboardVisibility();
  renderDashboardCustomizer();
  applyDashboardOrder();
}

export function openQuickAction(action) {
  if (action === "order") {
    setView("orders");
    byId("orderForm")?.querySelector("input:not([type=hidden])")?.focus();
    return;
  }
  if (action === "material") {
    setView("materials");
    setMaterialsTab("purchases");
    byId("materialForm")?.querySelector("input:not([type=hidden])")?.focus();
    return;
  }
  setView("leads");
  if (action === "lead" || action === "client") {
    byId("newLeadBtn")?.click();
    const status = action === "client" ? "Cliente recorrente" : "Novo";
    if (byId("leadForm")?.elements.status) byId("leadForm").elements.status.value = status;
  }
}

export function renderDashboard() {
  const { income, expense, receivable } = getFinancialMetrics();
  const openOrders = state.data.orders.filter((item) => item.status !== "Entregue" && !item.quoteStage).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lateOrders = state.data.orders.filter((item) => item.status !== "Entregue" && !item.quoteStage && item.deliveryDate && new Date(`${item.deliveryDate}T00:00:00`) < today).length;
  const cashMonthIncome = state.data.cash
    .filter((item) => String(item.date || "").startsWith(currentMonth))
    .reduce((total, item) => total + Number(item.income || 0), 0);
  const orderMonthIncome = state.data.orders
    .filter((item) => String(item.createdAt || item.deliveryDate || "").startsWith(currentMonth) || (Number(item.received || 0) > 0 && !item.createdAt && !item.deliveryDate))
    .reduce((total, item) => total + Number(item.received || 0), 0);
  const monthIncome = Math.max(cashMonthIncome, orderMonthIncome);
  const monthOrders = state.data.orders.filter((item) => String(item.createdAt || item.deliveryDate || "").startsWith(currentMonth)).length;
  const topClient = getTopClient();
  const firstName = String(state.activeUserName || "usuário").trim().split(/\s+/)[0];
  byId("dashboardGreeting").textContent = `Olá, ${firstName}`;
  byId("dashboardGreetingSummary").textContent = `${openOrders} pedido${openOrders === 1 ? "" : "s"} aguardando produção`;

  byId("kpiIncome").textContent = money.format(income);
  byId("kpiExpense").textContent = money.format(expense);
  byId("kpiBalance").textContent = money.format(income - expense);
  byId("kpiReceivable").textContent = money.format(receivable);
  byId("kpiOpenOrders").textContent = openOrders;
  byId("kpiLateOrders").textContent = lateOrders;
  byId("kpiMonthIncome").textContent = money.format(monthIncome);
  byId("kpiMonthOrders").textContent = monthOrders;
  byId("kpiTopClient").textContent = topClient;
  renderIntegrationHealth();

  renderBarChart("financeChart", [
    { label: "Entradas", value: income, color: "var(--green)", format: money.format },
    { label: "Saídas", value: expense, color: "var(--red)", format: money.format },
    { label: "A receber", value: receivable, color: "var(--blue)", format: money.format }
  ]);

  const statusCounts = countBy(state.data.orders, (item) => item.status || "Sem status");
  renderBarChart("statusChart", statusCounts
    .map((item) => ({ ...item, color: item.label === "Entregue" ? "var(--green)" : "var(--amber)" })));

  const dailyRows = cashByDate(state.data.cash).map((item) => ({ label: formatDateShort(item.date), value: item.income - item.expense, income: item.income, expense: item.expense }));
  renderLineChart("dailyCashChart", dailyRows, { valueLabel: "Saldo" });
  renderAttentionNeeded();
  renderTopOpenOrders();

  const materialCounts = countBy(state.data.orders, (item) => item.material || "Não informado");
  renderBarChart("materialChart", materialCounts.map((item) => ({ ...item, color: "var(--teal)" })));

  const upcoming = [...state.data.orders]
    .filter((item) => item.status !== "Entregue")
    .sort((a, b) => (a.deliveryDate || "9999-99-99").localeCompare(b.deliveryDate || "9999-99-99"))
    .slice(0, 4);
  byId("upcomingList").innerHTML = upcoming.length ? upcoming.map((item) => `
    <div class="list-row">
      <div>
        <strong>${html(item.description)}</strong>
        <span>${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"} • ${html(item.material || "Material não informado")}</span>
      </div>
      <span class="badge queue">${html(item.status)}</span>
    </div>
  `).join("") : `<div class="empty-chart">Nenhuma entrega pendente.</div>`;

  const materials = new Map();
  state.data.orders.forEach((item) => {
    const key = item.material || "Não informado";
    materials.set(key, (materials.get(key) || 0) + 1);
  });
  byId("materialSummary").innerHTML = [...materials.entries()].map(([name, count]) => `
    <div class="list-row">
      <strong>${html(name)}</strong>
      <span>${count} pedido${count === 1 ? "" : "s"}</span>
    </div>
  `).join("");
  renderDeliveryStatusWidget();
  renderProfitabilityDashboardWidget();
  renderMarketplaceCommandWidget();
  updateDashboardCollapsibleSummaries({ income, expense, receivable, statusCounts, materialCounts, dailyRows });
  applyDashboardVisibility();
}

export function renderCompanySidebarStatus() {
  const plan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  const mlConnected = state.marketplaceAccounts.some((item) => item.marketplace === "Mercado Livre");
  const lastBackup = state.backupRuns[0];
  const active = ["active", "trial", "free"].includes(state.subscription?.status);
  const planName = String(plan?.name || state.subscription?.plan_code || "-");
  byId("sidebarPlan").textContent = `Plano ${planName}`;
  byId("sidebarCompanyStatus").textContent = active ? "Empresa ativa" : "Empresa com atenção";
  byId("sidebarCompanyStatusDot").className = `status-dot ${active ? "ok" : "alert"}`;
  byId("sidebarPlanStatus").textContent = `Plano ${planName}`;
  byId("sidebarMarketplaceStatus").textContent = mlConnected ? "Mercado Livre conectado" : "Mercado Livre pendente";
  byId("sidebarMarketplaceStatusDot").className = `status-dot ${mlConnected ? "ok" : "neutral"}`;
  byId("sidebarBackupStatus").textContent = lastBackup?.status === "success" ? "Último backup OK" : "Backup pendente";
  byId("sidebarBackupStatusDot").className = `status-dot ${lastBackup?.status === "success" ? "ok" : "neutral"}`;
}

export function getRecentIntegrationErrors() {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return state.marketplaceLogs.filter((item) =>
    item.status === "error" && new Date(item.created_at || 0).getTime() >= since
  );
}

export function getTokenAlert() {
  const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === "mercado-livre");
  if (!account?.token_expires_at) return null;
  const remaining = new Date(account.token_expires_at).getTime() - Date.now();
  if (remaining <= 0) return { level: "error", message: "Token Mercado Livre expirado. Reconecte a conta." };
  if (remaining < 24 * 60 * 60 * 1000) {
    return { level: "success", message: "Mercado Livre: renovacao automatica de token ativa." };
  }
  return null;
}

export function renderIntegrationHealth() {
  const errorCount = getRecentIntegrationErrors().length;
  const count = byId("integrationErrorCount");
  const card = byId("integrationErrorCard");
  const panel = card?.closest("[data-dashboard-card]");
  const dashboardAlert = byId("dashboardTokenAlert");
  if (panel) panel.hidden = !state.isAdmin;
  if (!state.isAdmin) return;
  if (count) count.textContent = errorCount;
  if (card) card.classList.toggle("has-errors", errorCount > 0);
  const tokenAlert = getTokenAlert();
  if (dashboardAlert) {
    dashboardAlert.innerHTML = tokenAlert ?
       `<div class="integration-alert ${tokenAlert.level}">${html(tokenAlert.message)}</div>`
      : `<div class="integration-alert success">Tokens dentro do prazo.</div>`;
  }
}

export function renderAttentionNeeded() {
  const open = state.data.orders.filter((item) => item.status !== "Entregue" && !item.quoteStage);
  const noDate = open.filter((item) => !item.deliveryDate).length;
  const soon = open.filter((item) => getOrderPriority(item).key === "soon").length;
  const urgent = open.filter((item) => ["urgent", "high"].includes(getOrderPriority(item).key)).length;
  const noValue = open.filter((item) => !Number(item.charged || 0)).length;
  const lowStock = state.inventoryItems.filter((item) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0)).length;
  const subscriptionAlert = getSubscriptionAlert();

  byId("attentionNoDate").textContent = noDate;
  byId("attentionSoon").textContent = soon;
  byId("attentionUrgent").textContent = urgent;
  byId("attentionNoValue").textContent = noValue;
  byId("attentionLowStock").textContent = lowStock;
  const subscriptionBadge = byId("attentionSubscriptionBadge");
  if (subscriptionBadge) {
    subscriptionBadge.textContent = subscriptionAlert ? subscriptionAlert.title : subscriptionStatusText(state.subscription?.status);
    subscriptionBadge.className = `badge ${subscriptionAlert ? (subscriptionAlert.level === "critical" ? "danger-badge" : "queue") : "done"}`;
  }
  bindActions();
}

export function updateDashboardCollapsibleSummaries({ income, expense, receivable, statusCounts, materialCounts, dailyRows }) {
  const setSummary = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };
  setSummary("summaryFinancial", `Saldo ${money.format(income - expense)}`);
  const topStatus = statusCounts[0];
  setSummary("summaryStatusBreakdown", topStatus ? `${topStatus.label}: ${topStatus.value}` : "Sem dados");
  const topMaterial = materialCounts[0];
  setSummary("summaryMaterialBreakdown", topMaterial ? `${topMaterial.label}: ${topMaterial.value}` : "Sem dados");
  const lastDay = dailyRows[dailyRows.length - 1];
  setSummary("summaryDailyCash", lastDay ? `Último dia: ${money.format(lastDay.value)}` : "Sem dados");
  setSummary("summaryIntegrations", `${getRecentIntegrationErrors().length} erro(s) recente(s)`);
  setSummary("summaryTopOpen", `A receber: ${money.format(receivable)}`);
  const deliveryCounts = getDeliveryStatusCounts();
  setSummary("summaryLogistics", `${deliveryCounts.inTransit} em trânsito, ${deliveryCounts.late} atrasado(s)`);
  setSummary("summaryProfitability", hasCommercialIntelligenceAccess()
    ? (() => {
      const counts = getProfitabilitySummary();
      return `${counts.healthy + counts.excellent} anúncio(s) saudável(is)`;
    })()
    : "Recurso premium");
  setSummary("summaryMarketplaceCommand", state.sellerMetrics
    ? (state.sellerMetrics.seller_level || "Sincronizado")
    : "Sincronize as métricas");
  const materials = new Set(state.data.orders.map((item) => item.material || "Não informado"));
  setSummary("summaryMaterialSummary", `${materials.size} material(is) em uso`);
  const newLeads = state.leads.filter((lead) => lead.status === "Novo").length;
  setSummary("summaryCommercial", `${newLeads} lead(s) novo(s)`);
  setSummary("summaryTopProducts", "Ranking dos últimos 30 dias");
  const followUpCount = state.leads.filter((lead) => getLeadFollowUp(lead)).length +
    state.data.orders.filter((item) =>
      ["Orçamento enviado", "Aguardando cliente"].includes(item.quoteStage)
      && Math.floor((Date.now() - new Date(item.quoteUpdatedAt || 0).getTime()) / 86400000) > 7
    ).length;
  setSummary("summaryFollowUp", followUpCount ? `${followUpCount} pendente(s)` : "Nenhum pendente");
}

export function renderAlerts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoon = state.data.orders
    .filter((item) => item.status !== "Entregue" && item.deliveryDate)
    .filter((item) => {
      const date = new Date(`${item.deliveryDate}T00:00:00`);
      const diff = Math.round((date - today) / 86400000);
      return diff >= 0 && diff <= 7;
    });
  const withoutDate = state.data.orders.filter((item) => item.status !== "Entregue" && !item.deliveryDate).length;
  const withoutValue = state.data.orders.filter((item) => item.status !== "Entregue" && !Number(item.charged || 0)).length;
  const negativeBalance = sum(state.data.cash, "income") - sum(state.data.cash, "expense") < 0;
  const lowStock = state.inventoryItems.filter((item) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0));
  const subscriptionAlert = getSubscriptionAlert();
  const alerts = [
    ...(subscriptionAlert ? [{ title: subscriptionAlert.title, detail: subscriptionAlert.message }] : []),
    ...lowStock.slice(0, 3).map((item) => ({
      title: `Estoque baixo: ${item.name}`,
      detail: `${formatInventoryNumber(item.quantity)} ${item.unit || "un."} disponíveis; mínimo ${formatInventoryNumber(item.minimum_quantity)}`
    })),
    ...dueSoon.slice(0, 4).map((item) => ({
      title: item.description,
      detail: `Entrega em ${formatDate(item.deliveryDate)}`
    })),
    ...(withoutDate ? [{ title: `${withoutDate} encomenda${withoutDate === 1 ? "" : "s"} sem data`, detail: "Defina prazos para priorizar a produção" }] : []),
    ...(withoutValue ? [{ title: `${withoutValue} encomenda${withoutValue === 1 ? "" : "s"} sem valor`, detail: "Complete os valores para o financeiro ficar certo" }] : []),
    ...(negativeBalance ? [{ title: "Saldo negativo", detail: "Revise saídas recentes no fluxo de caixa" }] : [])
  ];
  byId("alertsList").innerHTML = alerts.length ? alerts.map((item) => `
    <div class="list-row alert-row">
      <strong>${html(item.title)}</strong>
      <span>${html(item.detail)}</span>
    </div>
  `).join("") : `<div class="empty-chart">Nenhum alerta no momento</div>`;
}

export function renderWeeklyFocus() {
  const open = state.data.orders.filter((item) => item.status !== "Entregue");
  const focus = {
    urgent: open.filter((item) => ["urgent", "high"].includes(getOrderPriority(item).key)).length,
    soon: open.filter((item) => getOrderPriority(item).key === "soon").length,
    noDate: open.filter((item) => !item.deliveryDate).length,
    noValue: open.filter((item) => !Number(item.charged || 0)).length
  };
  byId("weeklyFocus").innerHTML = `
    <button class="focus-card urgent" type="button" data-action="focus-orders" data-focus="urgent"><span>Alta prioridade</span><strong>${focus.urgent}</strong><small>urgente ou alta</small></button>
    <button class="focus-card soon" type="button" data-action="focus-orders" data-focus="soon"><span>Atenção</span><strong>${focus.soon}</strong><small>prazo curto</small></button>
    <button class="focus-card neutral" type="button" data-action="focus-orders" data-focus="noDate"><span>Sem data</span><strong>${focus.noDate}</strong><small>precisam prazo</small></button>
    <button class="focus-card neutral" type="button" data-action="focus-orders" data-focus="noValue"><span>Sem valor</span><strong>${focus.noValue}</strong><small>financeiro incompleto</small></button>
  `;
  bindActions();
}

export function applyFocusFilter(focus) {
  state.filters.orderFocus = focus || "all";
  state.filters.orderMaterial = "all";
  state.filters.orderStatus = "all";
  state.filters.orderMarketplace = "all";
  syncOrderFilterControls();
  setView("orders");
  renderTables();
}

export function renderTopOpenOrders() {
  const rows = state.data.orders
    .filter((item) => item.status !== "Entregue")
    .map((item) => ({ ...item, balance: Math.max(Number(item.charged || 0) - Number(item.received || 0), 0) }))
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  byId("topOpenOrders").innerHTML = rows.length ? rows.map((item) => `
    <div class="list-row">
      <div>
        <strong>${html(item.description)}</strong>
        <span>${html(item.material || "Material não informado")} • ${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"}</span>
      </div>
      <strong>${money.format(item.balance)}</strong>
    </div>
  `).join("") : `<div class="empty-chart">Sem valores em aberto</div>`;
}

export function cashByDate(rows) {
  const map = new Map();
  rows.forEach((item) => {
    if (!item.date) return;
    if (!map.has(item.date)) map.set(item.date, { date: item.date, income: 0, expense: 0 });
    const entry = map.get(item.date);
    entry.income += Number(item.income || 0);
    entry.expense += Number(item.expense || 0);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
}

export function getTopClient() {
  const map = new Map();
  state.data.orders.forEach((item) => {
    const client = item.client || "Não informado";
    map.set(client, (map.get(client) || 0) + 1);
  });
  const [name] = [...map.entries()].sort((a, b) => b[1] - a[1])[0] || ["-"];
  return name;
}

export function openEmailDigest() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const open = state.data.orders.filter((item) => item.status !== "Entregue");
  const financial = getFinancialMetrics();
  const late = open.filter((item) => item.deliveryDate && new Date(`${item.deliveryDate}T00:00:00`) < today);
  const dueSoon = open
    .filter((item) => item.deliveryDate)
    .filter((item) => {
      const delivery = new Date(`${item.deliveryDate}T00:00:00`);
      const diff = Math.round((delivery - today) / 86400000);
      return diff >= 0 && diff <= 7;
    })
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  const withoutDate = open.filter((item) => !item.deliveryDate);
  const withoutValue = open.filter((item) => Number(item.charged || 0) <= 0);
  const withoutResponsible = open.filter((item) => !item.responsible);
  const highPriority = open.filter((item) => ["Alta", "Urgente"].includes(item.priority));
  const stageCounts = countBy(open, (item) => item.productionStage || "Em fila");
  const statusCounts = countBy(state.data.orders, (item) => item.status || "Sem status");
  const integrationErrors = getRecentIntegrationErrors();
  const riskOrders = [...new Map(
    [...late, ...highPriority, ...dueSoon].map((item) => [item.id, item])
  ).values()].slice(0, 8);
  const monthKey = new Date().toISOString().slice(0, 7);
  const cashMonthIncome = state.data.cash
    .filter((item) => String(item.date || "").startsWith(monthKey))
    .reduce((total, item) => total + Number(item.income || 0), 0);
  const orderMonthIncome = state.data.orders
    .filter((item) => String(item.createdAt || item.deliveryDate || "").startsWith(monthKey) || (Number(item.received || 0) > 0 && !item.createdAt && !item.deliveryDate))
    .reduce((total, item) => total + Number(item.received || 0), 0);
  const monthIncome = Math.max(cashMonthIncome, orderMonthIncome);
  const lines = [
    "3D.AFT | RESUMO OPERACIONAL",
    formatDateTime(new Date().toISOString()),
    "==================================================",
    "",
    "KPIs DA OPERACAO",
    `Pedidos abertos: ${open.length} ? | ? Atrasados: ${late.length} ? | ? Entregas em 7 dias: ${dueSoon.length}`,
    `Alta/Urgente: ${highPriority.length} ? | ? Sem prazo: ${withoutDate.length} ? | ? Sem responsavel: ${withoutResponsible.length}`,
    `A receber: ${money.format(financial.receivable)} ? | ? Recebido no mes: ${money.format(monthIncome)} ? | ? Saldo em caixa: ${money.format(financial.balance)}`,
    `Erros de integracao (24h): ${integrationErrors.length}`,
    "",
    "PRODUCAO",
    ...(stageCounts.length ? stageCounts.map((item) => `- ${item.label}: ${item.value}`) : ["- Nenhum pedido em producao"]),
    "",
    "STATUS DOS PEDIDOS",
    ...statusCounts.map((item) => `- ${item.label}: ${item.value}`),
    "",
    "PONTOS DE ATENCAO",
    ...(riskOrders.length ? riskOrders.map((item) => {
      const date = item.deliveryDate ? formatDate(item.deliveryDate) : "Sem prazo";
      const balance = Math.max(Number(item.charged || 0) - Number(item.received || 0), 0);
      return `- ${getOrderCode(item)} | ${item.description} | ${date} | ${item.priority || "Prioridade normal"} | ${item.productionStage || "Em fila"} | ${item.responsible || "Sem responsavel"} | ${money.format(balance)} a receber`;
    }) : ["- Nenhum pedido critico no momento"]),
    "",
    "PROXIMAS ENTREGAS",
    ...(dueSoon.length ? dueSoon.map((item) => `- ${item.description} (${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"}) - ${item.responsible || "Sem responsavel"}`) : ["- Nenhuma entrega nos proximos 7 dias"]),
    "",
    "CADASTROS INCOMPLETOS",
    `- Sem data: ${withoutDate.length}`,
    `- Sem valor: ${withoutValue.length}`,
    `- Sem responsavel: ${withoutResponsible.length}`,
    "",
    "Gerado automaticamente pelo 3D.AFT."
  ];
  const subject = encodeURIComponent(`3D.AFT | Resumo operacional | ${new Intl.DateTimeFormat("pt-BR").format(new Date())}`);
  const bodyText = lines.join("\n");
  const body = encodeURIComponent(bodyText);
  const to = encodeURIComponent(window.SUPABASE_CONFIG?.ADMIN_EMAIL || "");
  if (navigator.clipboard) navigator.clipboard.writeText(bodyText).catch(() => {});
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, "_blank", "noopener");
  flashActionMessage("Resumo copiado e Gmail aberto.");
}

export function renderCommercialDashboard() {
  const target = byId("commercialDashboard");
  if (!target) return;
  const quotes = state.data.orders.filter((item) => item.quoteStage);
  const converted = quotes.filter((item) => item.quoteStage === "Convertido em encomenda").length;
  const resolved = quotes.filter((item) => ["Convertido em encomenda", "Recusado"].includes(item.quoteStage)).length;
  const conversion = resolved ? Math.round((converted / resolved) * 100) : 0;
  const revenueMl = state.data.orders.filter((item) => (item.tags || []).includes("Mercado Livre")).reduce((sumValue, item) => sumValue + Number(item.received || 0), 0);
  const revenueShopee = state.data.orders.filter((item) => (item.tags || []).includes("Shopee")).reduce((sumValue, item) => sumValue + Number(item.received || 0), 0);
  const revenueAmazon = state.data.orders.filter((item) => (item.tags || []).includes("Amazon")).reduce((sumValue, item) => sumValue + Number(item.received || 0), 0);
  const values = [
    ["Leads novos", state.leads.filter((item) => item.status === "Novo").length, "leads"],
    ["Em análise", quotes.filter((item) => ["Solicitado", "Em análise"].includes(item.quoteStage)).length, "quotes"],
    ["Enviados", quotes.filter((item) => item.quoteStage === "Orçamento enviado").length, "quotes"],
    ["Aguardando cliente", quotes.filter((item) => item.quoteStage === "Aguardando cliente").length, "quotes"],
    ["Convertidos", converted, "quotes"],
    ["Taxa de conversão", `${conversion}%`, "quotes"],
    ["Receita Mercado Livre", money.format(revenueMl), "quotes"],
    ["Receita Shopee", money.format(revenueShopee), "quotes"],
    ["Receita Amazon", money.format(revenueAmazon), "quotes"],
  ];
  target.innerHTML = values.map(([label, value, targetView]) => `
    <button type="button" data-action="${targetView === "leads" ? "open-leads" : "open-quotes"}"><span>${label}</span><strong>${value}</strong></button>
  `).join("");
  bindActions();
}

export function renderTopProducts() {
  const target = byId("topProductsList");
  if (!target) return;
  const days = state.topProductsPeriod === "all" ? null : Number(state.topProductsPeriod || 30);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const rows = state.data.orders.filter((item) => {
    if (item.quoteStage && item.quoteStage !== "Convertido em encomenda") return false;
    if (Number(item.charged || 0) <= 0) return false;
    const date = new Date(item.createdAt || item.created_at || item.orderDate || item.order_date || item.deliveryDate || 0).getTime();
    return !days || !date || date >= cutoff;
  });
  const grouped = new Map();
  rows.forEach((item) => {
    const key = item.description || "Produto";
    const current = grouped.get(key) || { title: key, quantity: 0, revenue: 0, origin: getMarketplaceLabel(item) };
    current.quantity += Number(item.quantity || 1);
    current.revenue += Number(item.charged || item.received || 0);
    grouped.set(key, current);
  });
  const top = [...grouped.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10);
  target.innerHTML = top.length ? top.map((item, index) => `
    <div class="top-product-row">
      <strong>${index + 1}</strong>
      <span><strong>${html(item.title)}</strong><br><small>${item.quantity} vendidos • ${html(item.origin)}</small></span>
      <em>${money.format(item.revenue)}</em>
    </div>
  `).join("") : `<div class="empty-chart">Nenhum produto vendido no período.</div>`;
}

export function renderFollowUps() {
  const target = byId("followUpList");
  if (!target) return;
  const items = [];
  state.leads.forEach((lead) => {
    const message = getLeadFollowUp(lead);
    if (message) items.push({ title: lead.name, message, entity: "lead", id: lead.id });
  });
  state.data.orders.filter((item) => ["Orçamento enviado", "Aguardando cliente"].includes(item.quoteStage)).forEach((item) => {
    const days = Math.floor((Date.now() - new Date(item.quoteUpdatedAt || 0).getTime()) / 86400000);
    if (days > 7) items.push({ title: item.orderCode || item.id, message: "Follow-up necessário", entity: "order", id: item.id });
  });
  target.innerHTML = items.length ? items.slice(0, 10).map((item) => `
    <button class="list-row" type="button" data-action="${item.entity === "lead" ? "edit-lead" : "edit-order"}" data-id="${html(item.id)}">
      <span><strong>${html(item.title)}</strong><br><small>${html(item.message)}</small></span>
    </button>
  `).join("") : `<div class="empty-chart">Nenhum follow-up pendente.</div>`;
  bindActions();
}

export function getFinancialMetrics() {
  const cashIncome = sum(state.data.cash, "income");
  const expense = sum(state.data.cash, "expense");
  const charged = sum(state.data.orders, "charged");
  const received = sum(state.data.orders, "received");
  const operationalIncome = Math.max(cashIncome, received);
  const receivable = state.data.orders.reduce(
    (total, item) => total + Math.max(Number(item.charged || 0) - Number(item.received || 0), 0),
    0
  );
  return {
    income: operationalIncome,
    cashIncome,
    expense,
    balance: operationalIncome - expense,
    charged,
    received,
    receivable
  };
}
