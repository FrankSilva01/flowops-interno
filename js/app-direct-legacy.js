

function initDashboardDrag() {
  applyDashboardOrder();
  renderDashboardCustomizer();
  applyDashboardVisibility();
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

function applyDashboardOrder() {
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

function saveDashboardOrder() {
  const order = [...document.querySelectorAll("[data-dashboard-card]")].map((card) => card.dataset.dashboardCard);
  localStorage.setItem("3daft-dashboard-order", JSON.stringify(order));
}


const DASHBOARD_CARD_LABELS = {
  "operations-overview": "Visão operacional",
  focus: "Atenção da semana",
  alerts: "Alertas",
  "integration-health": "Integrações",
  "top-open": "Top valores em aberto",
  upcoming: "Próximas entregas",
  "material-summary": "Resumo por material",
  commercial: "Comercial",
  "top-products": "Produtos mais vendidos",
  "follow-up": "Follow-up"
};

function renderDashboardCustomizer() {
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

function applyDashboardVisibility() {
  document.querySelectorAll("[data-dashboard-card]").forEach((card) => {
    card.hidden = state.dashboardHiddenCards.includes(card.dataset.dashboardCard);
  });
}

function resetDashboardPreferences() {
  state.dashboardHiddenCards = [];
  localStorage.removeItem("3daft-dashboard-hidden");
  localStorage.removeItem("3daft-dashboard-order");
  applyDashboardVisibility();
  renderDashboardCustomizer();
  applyDashboardOrder();
}

function bindFilter(elementId, filterKey) {
  const element = byId(elementId);
  if (!element) return;
  element.addEventListener("change", (event) => {
    state.filters[filterKey] = event.target.value;
    renderTables();
  });
}

function bindTextFilter(elementId, filterKey, renderer, normalize = true) {
  const element = byId(elementId);
  if (!element) return;
  element.addEventListener("input", (event) => {
    state.filters[filterKey] = normalize ? event.target.value.trim().toLowerCase() : event.target.value;
    renderer();
  });
}

function setMaterialsTab(tab) {
  document.querySelectorAll("[data-materials-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.materialsTab === tab);
  });
  byId("materialsPurchasesPane").classList.toggle("active", tab === "purchases");
  byId("materialsInventoryPane").classList.toggle("active", tab === "inventory");
}

function clearMaterialFilters() {
  for (const id of ["materialSearchFilter", "materialSupplierFilter", "materialDateFromFilter", "materialDateToFilter"]) {
    byId(id).value = "";
  }
  byId("materialTypeFilter").value = "all";
  Object.assign(state.filters, {
    materialSearch: "",
    materialSupplier: "",
    materialDateFrom: "",
    materialDateTo: "",
    materialType: "all",
  });
  renderMaterials();
}

function clearInventoryFilters() {
  for (const id of ["inventorySearchFilter", "inventorySupplierFilter"]) byId(id).value = "";
  byId("inventoryStatusFilter").value = "all";
  Object.assign(state.filters, {
    inventorySearch: "",
    inventorySupplier: "",
    inventoryStatus: "all",
  });
  renderInventory();
}

function openQuickAction(action) {
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

















async function getSubscriptionAccessStatus() {
  try {
    const { data: subscription, error } = await state.supabase
      .from("organization_subscriptions")
      .select("status,trial_end,current_period_end,next_payment_at,grace_ends_at,plan_code,metadata")
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    if (error) return { allowed: false, message: "Nao foi possivel validar a assinatura da empresa." };
    if (!subscription) return { allowed: false, message: "Assinatura da empresa nao encontrada." };
    const status = String(subscription.status || "").toLowerCase();
    if (subscription.plan_code === "free" || status === "free") return { allowed: true };
    const now = Date.now();
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end).getTime() : null;
    const renewalAt = subscription.next_payment_at || subscription.current_period_end;
    const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
    const graceTime = subscription.grace_ends_at ?
       new Date(subscription.grace_ends_at).getTime()
      : renewalTime ?
         renewalTime + SUBSCRIPTION_DEFAULT_GRACE_DAYS * 86400000
        : null;
    if (status === "trial") {
      if (!trialEnd || trialEnd > now) return { allowed: true };
      return {
        allowed: false,
        message: "O periodo de teste desta empresa terminou. Cadastre uma forma de pagamento para reativar o acesso.",
      };
    }
    if (status === "active") {
      if (!renewalTime || renewalTime > now || (graceTime && graceTime > now)) return { allowed: true };
      return {
        allowed: false,
        message: "A assinatura desta empresa venceu e o periodo de tolerancia terminou. Regularize o pagamento para reativar o acesso.",
      };
    }
    if (status === "past_due" && graceTime && graceTime > now) {
      return { allowed: true };
    }
    if (status === "pending") {
      const until = subscription.current_period_end || subscription.trial_end || subscription.next_payment_at;
      if (until && new Date(until).getTime() > now) return { allowed: true };
    }
    return {
      allowed: false,
      message: "A assinatura desta empresa esta suspensa ou pendente. Regularize em Minha Assinatura para reativar o acesso.",
    };
  } catch {
    return { allowed: false, message: "Nao foi possivel validar a assinatura da empresa." };
  }
}











function renderDashboard() {
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

  renderBarChart("statusChart", countBy(state.data.orders, (item) => item.status || "Sem status")
    .map((item) => ({ ...item, color: item.label === "Entregue" ? "var(--green)" : "var(--amber)" })));

  renderLineChart("dailyCashChart", cashByDate(state.data.cash).map((item) => ({ label: formatDateShort(item.date), value: item.income - item.expense, income: item.income, expense: item.expense })), { valueLabel: "Saldo" });
  renderAlerts();
  renderWeeklyFocus();
  renderTopOpenOrders();

  renderBarChart("materialChart", countBy(state.data.orders, (item) => item.material || "Não informado")
    .map((item) => ({ ...item, color: "var(--teal)" })));

  const upcoming = [...state.data.orders]
    .filter((item) => item.status !== "Entregue")
    .sort((a, b) => (a.deliveryDate || "9999-99-99").localeCompare(b.deliveryDate || "9999-99-99"))
    .slice(0, 6);
  byId("upcomingList").innerHTML = upcoming.map((item) => `
    <div class="list-row">
      <div>
        <strong>${html(item.description)}</strong>
        <span>${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"} • ${html(item.material || "Material não informado")}</span>
      </div>
      <span class="badge queue">${html(item.status)}</span>
    </div>
  `).join("");

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
  applyDashboardVisibility();
}

function renderCompanySidebarStatus() {
  const plan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  const mlConnected = state.marketplaceAccounts.some((item) => item.marketplace === "Mercado Livre");
  const lastBackup = state.backupRuns[0];
  const active = ["active", "trial", "free"].includes(state.subscription?.status);
  byId("sidebarPlan").textContent = `Plano ${String(plan?.name || state.subscription?.plan_code || "-").toUpperCase()}`;
  byId("sidebarCompanyStatus").textContent = active ? "● Empresa ativa" : "● Empresa com atenção";
  byId("sidebarCompanyStatus").className = active ? "status-ok" : "status-alert";
  byId("sidebarPlanStatus").textContent = `★ Plano ${String(plan?.name || state.subscription?.plan_code || "-").toUpperCase()}`;
  byId("sidebarMarketplaceStatus").textContent = mlConnected ? "● Mercado Livre conectado" : "○ Mercado Livre pendente";
  byId("sidebarBackupStatus").textContent = lastBackup?.status === "success" ? "● Último backup OK" : "○ Backup pendente";
}

function getRecentIntegrationErrors() {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return state.marketplaceLogs.filter((item) =>
    item.status === "error" && new Date(item.created_at || 0).getTime() >= since
  );
}

function getTokenAlert() {
  const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === "mercado-livre");
  if (!account?.token_expires_at) return null;
  const remaining = new Date(account.token_expires_at).getTime() - Date.now();
  if (remaining <= 0) return { level: "error", message: "Token Mercado Livre expirado. Reconecte a conta." };
  if (remaining < 24 * 60 * 60 * 1000) {
    return { level: "success", message: "Mercado Livre: renovacao automatica de token ativa." };
  }
  return null;
}

function renderIntegrationHealth() {
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

function renderTables() {
  renderOrders();
  renderCash();
  renderMaterials();
  renderInventory();
}

function renderProduction() {
  renderKanbanFilters();
  const board = byId("kanbanBoard");
  if (!board) return;
  renderProductionSummary();
  const pendingQuotes = state.data.orders.filter((item) => item.quoteStage && !isProductionEligible(item));
  byId("productionQuoteSummary").innerHTML = pendingQuotes.length ? `
    <div class="quote-summary-card">
      <span><strong>${pendingQuotes.length} orçamento${pendingQuotes.length === 1 ? "" : "s"}</strong><br><small>Aguardando aprovação antes de entrar na produção.</small></span>
      <button class="secondary-btn" type="button" data-action="open-quotes">Ver orçamentos</button>
    </div>
  ` : "";
  board.innerHTML = PRODUCTION_STAGES.map((stage) => {
    const orders = sortOrders(filterProductionOrders(
      filterRows(state.data.orders, ["orderCode", "marketplaceOrderCode", "description", "client", "material", "status", "responsible", "productionStage", "internalNotes", "tags"]),
    ))
      .filter(isProductionEligible)
      .filter((item) => normalizeStage(item.productionStage || item.status) === stage);
    return `
      <section class="kanban-column" data-stage="${html(stage)}">
        <div class="kanban-head">
          <h3>${html(stage)}</h3>
          <span>${orders.length}</span>
        </div>
        <div class="kanban-dropzone" data-stage="${html(stage)}">
          ${orders.map(renderKanbanCard).join("") || `<div class="empty-chart">Sem pedidos</div>`}
        </div>
      </section>
    `;
  }).join("");
  bindKanban();
  bindActions();
}

function filterProductionOrders(rows) {
  return rows.filter((item) => {
    const materialMatch = state.filters.productionMaterial === "all"
      || (item.material || "") === state.filters.productionMaterial;
    const statusMatch = state.filters.productionStatus === "all"
      || normalizeOrderStatus(item.status) === state.filters.productionStatus;
    const marketplaceMatch = state.filters.productionMarketplace === "all"
      || getOrderMarketplaceChannel(item) === state.filters.productionMarketplace;
    return materialMatch && statusMatch && marketplaceMatch;
  });
}

function renderProductionSummary() {
  const view = byId("productionView");
  if (!view) return;
  let target = byId("productionStageSummary");
  if (!target) {
    target = document.createElement("section");
    target.id = "productionStageSummary";
    target.className = "production-stage-summary";
    view.prepend(target);
  }
  const eligible = state.data.orders.filter(isProductionEligible);
  const late = eligible.filter((item) => getOrderPriority(item).key === "late").length;
  const inTime = eligible.length ? Math.max(0, Math.round(((eligible.length - late) / eligible.length) * 100)) : 100;
  target.innerHTML = `
    <article class="production-sla"><span>SLA geral</span><strong>${inTime}%</strong><small>${late} atrasado${late === 1 ? "" : "s"}</small></article>
    ${PRODUCTION_STAGES.map((stage) => {
      const count = eligible.filter((item) => normalizeStage(item.productionStage || item.status) === stage).length;
      const width = eligible.length ? Math.max(4, Math.round((count / eligible.length) * 100)) : 4;
      return `<article><span>${html(stage)}</span><strong>${count}</strong><i style="--stage-progress:${width}%"></i></article>`;
    }).join("")}
  `;
}

function isProductionEligible(item) {
  if (!item.quoteStage) return true;
  return ["Aprovado", "Convertido em encomenda"].includes(item.quoteStage);
}

function renderKanbanCard(item) {
  const priority = getOrderPriority(item);
  const status = normalizeOrderStatus(item.status);
  const marketplaceLabel = getMarketplaceLabel(item);
  return `
    <article class="kanban-card" draggable="${state.canEdit}" data-id="${html(item.id)}">
      <div class="kanban-card-head">
        <span class="order-code">${html(getOrderCode(item))}</span>
        ${state.canEdit ? `<button class="icon-btn compact" type="button" data-action="edit-order-modal" data-id="${html(item.id)}">Editar</button>` : ""}
      </div>
      <strong>${html(item.description)}</strong>
      <small>${html(item.client || "Cliente não informado")}</small>
      <small>${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"} • ${html(item.material || "Material não informado")}</small>
      ${renderSlaBadge(item)}
      <div class="marketplace-code-line">
        <span><small>${html(marketplaceLabel)}</small><strong>${html(item.marketplaceOrderCode || "Sem código")}</strong></span>
        <button class="copy-btn" type="button" data-action="copy-marketplace-code" data-id="${html(item.id)}" aria-label="Copiar código" ${item.marketplaceOrderCode ? "" : "disabled"}>
          <span aria-hidden="true"></span>
        </button>
      </div>
      <div class="kanban-inline-fields">
        ${renderInlineSelect("status", item.id, status, STATUS_OPTIONS)}
        ${renderInlineSelect("priority", item.id, item.priority || priority.label, PRIORITY_OPTIONS, priority.label)}
        ${renderInlineSelect("responsible", item.id, item.responsible || "", ["", ...getResponsibleNames()], "Responsável")}
      </div>
      ${item.internalNotes ? `<small class="internal-note">${html(item.internalNotes)}</small>` : ""}
    </article>
  `;
}

function renderKanbanFilters() {
  const filters = byId("kanbanFilters");
  if (!filters) return;
  const materials = ["all", ...uniqueValues(state.data.orders.map((item) => item.material || ""))];
  filters.innerHTML = `
    <div class="filter-group">
      <span>Material</span>
      ${materials.map((material) => {
        const label = material === "all" ? "Todos" : material || "Não informado";
        return `<button class="filter-chip ${state.filters.productionMaterial === material ? "active" : ""}" type="button" data-action="kanban-filter" data-filter="productionMaterial" data-value="${html(material)}">${html(label)}</button>`;
      }).join("")}
    </div>
    <div class="filter-group">
      <span>Status</span>
      ${["all", ...STATUS_OPTIONS].map((status) => {
        const label = status === "all" ? "Todos" : status;
        return `<button class="filter-chip ${state.filters.productionStatus === status ? "active" : ""}" type="button" data-action="kanban-filter" data-filter="productionStatus" data-value="${html(status)}">${html(label)}</button>`;
      }).join("")}
    </div>
    <div class="filter-group">
      <span>Marketplace</span>
      ${[
        ["all", "Todos"],
        ["mercado-livre", "Mercado Livre"],
        ["shopee", "Shopee"],
        ["amazon", "Amazon"],
        ["direct", "Venda direta"]
      ].map(([value, label]) => `<button class="filter-chip ${state.filters.productionMarketplace === value ? "active" : ""}" type="button" data-action="kanban-filter" data-filter="productionMarketplace" data-value="${value}">${label}</button>`).join("")}
    </div>
  `;
}

function bindKanban() {
  document.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      state.draggedOrderId = card.dataset.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      state.draggedOrderId = null;
    });
  });
  document.querySelectorAll(".kanban-column").forEach((column) => {
    column.addEventListener("dragenter", (event) => {
      event.preventDefault();
      column.classList.add("drop-target");
    });
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    column.addEventListener("dragleave", (event) => {
      if (!column.contains(event.relatedTarget)) column.classList.remove("drop-target");
    });
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      column.classList.remove("drop-target");
      const orderId = event.dataTransfer.getData("text/plain") || state.draggedOrderId;
      if (!state.canEdit || !orderId) return;
      await updateOrderInline(orderId, "productionStage", column.dataset.stage);
    });
  });
}

function renderOrders() {
  const rows = sortOrders(filterOrders(filterRows(state.data.orders, ["orderCode", "marketplaceOrderCode", "description", "client", "material", "status", "responsible", "productionStage", "stlLink", "referenceImageUrl", "internalNotes", "tags"])));
  renderOperationalSummary("ordersView", "ordersPageSummary", [
    ["Encomendas", rows.length, "pedidos filtrados", "teal"],
    ["A preparar", rows.filter((item) => normalizeOrderStatus(item.status) === "A preparar").length, "priorize prazos e material", "blue"],
    ["Produzindo", rows.filter((item) => !["Em fila", "Entregue"].includes(normalizeStage(item.productionStage || item.status))).length, `${rows.filter((item) => normalizeStage(item.productionStage || item.status) === "Em fila").length} em fila`, "purple"],
    ["A receber", money.format(rows.reduce((sum, item) => sum + Math.max(0, Number(item.charged || 0) - Number(item.received || 0)), 0)), "valores pendentes", "amber"],
  ]);
  byId("ordersTable").innerHTML = rows.map((item) => {
    const priority = getOrderPriority(item);
    const status = normalizeOrderStatus(item.status);
    const marketplaceLabel = getMarketplaceLabel(item);
    return `
      <tr>
        <td>
          <span class="order-code">${html(getOrderCode(item))}</span>
          <strong>${html(item.description)}</strong>
          ${item.quoteStage ? `<span class="badge queue">Orçamento: ${html(item.quoteStage)}</span>` : ""}
          <small>${html(item.client || "Cliente não informado")}</small>
          ${renderTags((item.tags || []).filter((tag) => !isMarketplaceTag(tag)), item.id)}
          ${renderOrderReferences(item)}
        </td>
        <td>
          <div class="marketplace-code-cell">
            ${renderTags((item.tags || []).filter(isMarketplaceTag), item.id)}
            <div class="marketplace-code-row">
              <span>
                <small>${html(marketplaceLabel)}</small>
                <strong class="marketplace-order-code">${html(item.marketplaceOrderCode || "-")}</strong>
              </span>
              <button class="copy-btn" type="button" data-action="copy-marketplace-code" data-id="${html(item.id)}" aria-label="Copiar código" ${item.marketplaceOrderCode ? "" : "disabled"}><span aria-hidden="true"></span></button>
            </div>
            ${item.internalNotes ? `<div class="order-note"><span>Nota interna</span><p>${html(item.internalNotes)}</p></div>` : ""}
          </div>
        </td>
        <td>${Number(item.quantity || 1).toLocaleString("pt-BR")}</td>
        <td>${html(item.material || "-")}</td>
        <td>${renderSlaBadge(item)}</td>
        <td>${renderDeliveryDate(item.deliveryDate)}</td>
        <td>${renderInlineSelect("priority", item.id, item.priority || priority.label, PRIORITY_OPTIONS, priority.label)}</td>
        <td>${renderInlineSelect("productionStage", item.id, item.productionStage || "Em fila", PRODUCTION_STAGES)}</td>
        <td>${renderInlineSelect("responsible", item.id, item.responsible || "", ["", ...getResponsibleNames()], "Responsável")}</td>
        <td>${renderInlineSelect("status", item.id, status, STATUS_OPTIONS)}</td>
        <td>${item.charged ? money.format(item.charged) : "-"}</td>
        <td>${item.received ? money.format(item.received) : "-"}</td>
        <td>
          ${item.quoteStage ? renderQuoteActions(item) : ""}
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-order" data-id="${item.id}">Editar</button>
          <button class="icon-btn" type="button" data-action="duplicate-order" data-id="${item.id}">Duplicar</button>` : ""}
          <button class="icon-btn" type="button" data-action="history-order" data-id="${item.id}">Histórico</button>
          ${state.canEdit && item.referenceImageUrl ? `<button class="icon-btn" type="button" data-action="remove-reference-image" data-id="${item.id}">Remover imagem</button>` : ""}
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="toggle-order" data-id="${item.id}">${status === "Entregue" ? "Reabrir" : "Entregar"}</button>
          <button class="icon-btn danger" type="button" data-action="delete-order" data-id="${item.id}">Excluir</button>` : ""}
        </td>
      </tr>
    `;
  }).join("");
  bindActions();
}

function renderOrderReferences(item) {
  if (!item.stlLink && !item.referenceImageUrl) return "";
  const stlLink = safeUrl(item.stlLink);
  const imageUrl = safeUrl(item.referenceImageUrl);
  return `
    <div class="order-reference">
      ${imageUrl ? `<a href="${html(imageUrl)}" target="_blank" rel="noopener"><img src="${html(imageUrl)}" alt="Referência de ${html(item.description)}" loading="lazy" /></a>` : ""}
      <div class="order-reference-links">
        ${stlLink ? `<a class="order-link" href="${html(stlLink)}" target="_blank" rel="noopener">Abrir STL/origem</a>` : ""}
        ${imageUrl ? `<a class="order-link" href="${html(imageUrl)}" target="_blank" rel="noopener">Ver referência</a>` : ""}
      </div>
    </div>
  `;
}

function renderQuoteActions(item) {
  const stages = ["Solicitado", "Em análise", "Orçamento enviado", "Aguardando cliente", "Aprovado", "Recusado", "Convertido em encomenda"];
  return `
    ${state.canEdit ? `<select class="inline-select queue" data-action="set-quote-stage" data-id="${html(item.id)}">
      ${stages.map((stage) => `<option ${stage === item.quoteStage ? "selected" : ""}>${html(stage)}</option>`).join("")}
    </select>` : `<span class="badge queue">${html(item.quoteStage)}</span>`}
    ${state.canEdit && item.quoteStage === "Aprovado" ? `<button class="primary-btn compact" type="button" data-action="convert-quote" data-id="${html(item.id)}">Enviar para produção</button>` : ""}
  `;
}

function renderTags(tags = [], id = "") {
  return tags.length ? `<div class="tag-list">${tags.map((tag) => `
    <span class="${getTagClass(tag)}">${html(tag)}${state.canEdit ? `<button type="button" data-action="remove-order-tag" data-id="${html(id)}" data-tag="${html(tag)}">×</button>` : ""}</span>
  `).join("")}</div>` : "";
}

function renderInlineSelect(field, id, value, options, placeholder = "-") {
  const styleClass = getFieldClass(field, value);
  if (!state.canEdit) return `<span class="badge ${styleClass}">${html(value || placeholder)}</span>`;
  return `
    <select class="inline-select ${styleClass}" data-action="inline-order-field" data-id="${html(id)}" data-field="${html(field)}">
      ${options.map((option) => `<option value="${html(option)}" ${String(option) === String(value) ? "selected" : ""}>${html(option || placeholder)}</option>`).join("")}
    </select>
  `;
}

function renderDeliveryDate(value) {
  if (!value) return `<span class="date-pill neutral">Sem data</span>`;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const delivery = new Date(`${value}T00:00:00`);
  const diff = Math.round((delivery - todayDate) / 86400000);
  const className = diff < 0 ? "danger-badge" : diff <= 3 ? "queue" : "done";
  return `<span class="date-pill ${className}">${formatDate(value)}</span>`;
}

function renderSlaBadge(item) {
  const sla = getSlaState(item);
  return `<span class="sla-badge ${sla.className}" title="${html(sla.title)}">${html(sla.label)}</span>`;
}

function getSlaState(item) {
  if (item.status === "Entregue") {
    return { label: "Dentro do prazo", className: "done", title: "Pedido entregue" };
  }
  if (!item.deliveryDate) {
    return { label: "Sem data", className: "neutral", title: "Defina uma data de entrega" };
  }
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const delivery = new Date(`${item.deliveryDate}T00:00:00`);
  const diff = Math.round((delivery - todayDate) / 86400000);
  if (diff < 0) return { label: "Atrasado", className: "danger-badge", title: "Prazo vencido" };
  if (diff <= 3) return { label: "Prazo próximo", className: "queue", title: `Faltam ${diff} dia${diff === 1 ? "" : "s"}` };
  return { label: "Dentro do prazo", className: "done", title: "Dentro do prazo" };
}

function getFieldClass(field, value) {
  if (field === "priority") {
    if (value === "Urgente") return "danger-badge";
    if (value === "Alta") return "queue";
    if (value === "Concluído" || value === "Baixa") return "done";
    return "neutral";
  }
  if (field === "productionStage" || field === "status") {
    if (["Entregue", "Pronto"].includes(value)) return "done";
    if (["A caminho", "Imprimindo", "Pós-processo", "Pintando", "Acabamento"].includes(value)) return "queue";
    if (["Despachado", "Fatiado"].includes(value)) return "info-badge";
    if (value === "Reimpressão") return "danger-badge";
    return "neutral";
  }
  return "neutral";
}

function renderCash() {
  let running = 0;
  const rows = filterCash(filterRows([...state.data.cash].sort((a, b) => a.date.localeCompare(b.date)), ["description", "category", "type"]));
  const income = rows.reduce((sum, item) => sum + Number(item.income || 0), 0);
  const expense = rows.reduce((sum, item) => sum + Number(item.expense || 0), 0);
  const receivable = state.data.orders.reduce((sum, item) => sum + Math.max(0, Number(item.charged || 0) - Number(item.received || 0)), 0);
  renderOperationalSummary("cashView", "cashPageSummary", [
    ["Saldo atual", money.format(income - expense), "resultado acumulado", "teal"],
    ["Entradas", money.format(income), "recebimentos e vendas", "green"],
    ["Saídas", money.format(expense), "custos e despesas", "red"],
    ["A receber", money.format(receivable), "títulos pendentes", "amber"],
    ["Lucro líquido", money.format(income - expense), "resultado do período", "blue"],
  ]);
  byId("cashTable").innerHTML = rows.map((entry) => {
    running += Number(entry.income || 0) - Number(entry.expense || 0);
    return `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${html(entry.type)}</td>
        <td>${html(entry.category)}</td>
        <td><strong>${html(entry.description)}</strong><small>${html(entry.method || "")}</small></td>
        <td class="money-in">${entry.income ? money.format(entry.income) : "-"}</td>
        <td class="money-out">${entry.expense ? money.format(entry.expense) : "-"}</td>
        <td>${money.format(running)}</td>
        <td>
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-cash" data-id="${entry.id}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-cash" data-id="${entry.id}">Excluir</button>` : "-"}
        </td>
      </tr>
    `;
  }).join("");
  bindActions();
}

function renderMaterials() {
  const rows = sortMaterials(filterMaterials(filterRows(state.data.materials, ["supplier", "type", "spec"])));
  const total = rows.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
  const suppliers = countBy(rows, (item) => item.supplier || "Não informado");
  const topSupplier = Object.entries(suppliers).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  renderOperationalSummary("materialsView", "materialsPageSummary", [
    ["Gastos no período", money.format(total), "compras registradas", "teal"],
    ["Compras realizadas", rows.length, "itens cadastrados", "blue"],
    ["Ticket médio", money.format(rows.length ? total / rows.length : 0), "por compra", "purple"],
    ["Fornecedor principal", topSupplier, "maior frequência", "amber"],
    ["Previsão de gastos", money.format(total), "baseada no histórico", "teal"],
  ]);
  byId("materialsTable").innerHTML = rows.map((item) => {
    const total = Number(item.quantity || 0) * Number(item.unitCost || 0);
    return `
      <tr>
        <td>${formatDate(item.date)}</td>
        <td>${html(item.supplier)}</td>
        <td>${html(item.type)}</td>
        <td>${html(item.spec || "-")}</td>
        <td>${Number(item.quantity || 0).toLocaleString("pt-BR")}</td>
        <td>${money.format(total)}</td>
        <td>
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-material" data-id="${item.id}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-material" data-id="${item.id}">Excluir</button>` : "-"}
        </td>
      </tr>
    `;
  }).join("");
  bindActions();
}

function renderInventory() {
  const table = byId("inventoryTable");
  if (!table) return;
  const rows = state.inventoryItems.filter((item) => {
    const text = `${item.name || ""} ${item.category || ""} ${item.supplier || ""} ${item.notes || ""}`.toLowerCase();
    const isLow = Number(item.quantity || 0) <= Number(item.minimum_quantity || 0);
    return (!state.filters.inventorySearch || text.includes(state.filters.inventorySearch))
      && (!state.filters.inventorySupplier || String(item.supplier || "").toLowerCase().includes(state.filters.inventorySupplier))
      && (state.filters.inventoryStatus === "all"
        || (state.filters.inventoryStatus === "low" && isLow)
        || (state.filters.inventoryStatus === "ok" && !isLow));
  }).sort((left, right) => {
    const leftLow = Number(left.quantity || 0) <= Number(left.minimum_quantity || 0);
    const rightLow = Number(right.quantity || 0) <= Number(right.minimum_quantity || 0);
    return Number(rightLow) - Number(leftLow) || String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
  });
  const lowStock = rows.filter((item) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0));
  const summary = byId("lowStockSummary");
  if (summary) {
    summary.className = `inventory-summary ${lowStock.length ? "low" : "ok"}`;
    summary.textContent = lowStock.length ?
       `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} com estoque baixo`
      : "Estoque dentro dos níveis configurados";
  }
  table.innerHTML = rows.length ? rows.map((item) => {
    const isLow = Number(item.quantity || 0) <= Number(item.minimum_quantity || 0);
    const estimated = Number(item.quantity || 0) * Number(item.unit_cost || 0);
    return `
      <tr class="${isLow ? "low-stock-row" : ""}">
        <td><strong>${html(item.name)}</strong><small>${html(item.supplier || item.notes || "")}</small></td>
        <td>${html(item.category || "Insumo")}</td>
        <td>${formatInventoryNumber(item.quantity)} ${html(item.unit || "un.")}</td>
        <td>${formatInventoryNumber(item.minimum_quantity)} ${html(item.unit || "un.")}</td>
        <td>${money.format(estimated)}</td>
        <td><span class="badge ${isLow ? "danger-badge" : "done"}">${isLow ? "Estoque baixo" : "Normal"}</span></td>
        <td>${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-inventory" data-id="${html(item.id)}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-inventory" data-id="${html(item.id)}">Excluir</button>` : "-"}</td>
      </tr>`;
  }).join("") : `<tr><td colspan="7">Nenhum insumo cadastrado.</td></tr>`;
  bindActions();
}

function formatInventoryNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function renderApprovals() {
  const table = byId("approvalsTable");
  if (!table) return;
  if (!state.isAdmin) {
    table.innerHTML = "";
    return;
  }
  const pending = state.accessRequests.filter((request) => (request.status || "pending") === "pending");
  table.innerHTML = pending.length ? pending.map((request) => `
    <tr>
      <td>${formatDateTime(request.requested_at)}</td>
      <td>${html(request.name || "-")}</td>
      <td>${html(request.email)}</td>
      <td><span class="badge ${request.status === "approved" ? "done" : request.status === "rejected" ? "danger-badge" : "queue"}">${html(request.status || "pending")}</span></td>
      <td>
        <button class="icon-btn" type="button" data-action="approve-access" data-email="${html(request.email)}">Aprovar</button>
        <button class="icon-btn danger" type="button" data-action="reject-access" data-email="${html(request.email)}">Recusar</button>
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="5">Nenhuma solicitação pendente.</td>
    </tr>
  `;
  bindActions();
}

function renderLogs() {
  const target = byId("logsList");
  if (!target) return;
  const orderLogs = state.data.orders
    .flatMap((orderItem) => (orderItem.history || []).map((entry) => ({
      type: "orders",
      ...entry,
      title: orderItem.description,
      detail: entry.changes.map((change) => `${change.field}: ${change.from} -> ${change.to}`).join("\n")
    })));
  const accessLogs = state.accessRequests
    .filter((request) => ["approved", "rejected"].includes(request.status))
    .map((request) => ({
      type: "access",
      at: request.decided_at || request.requested_at,
      by: request.decided_by || "Administrador",
      title: `${request.status === "approved" ? "Acesso aprovado" : "Acesso recusado"}: ${request.email}`,
      detail: `Nome: ${request.name || "-"}\nSolicitado em: ${formatDateTime(request.requested_at)}`
    }));
  const auditLogs = state.auditEvents.map((event) => ({
    type: "audit",
    at: event.created_at,
    by: event.actor_email || event.source || "Sistema",
    title: `${auditActionLabel(event.action)}: ${event.order_code || event.entity_id || event.entity_type}`,
    detail: `${event.entity_type} • origem ${event.source || "manual"}\n${auditDiffText(event.old_value, event.new_value)}`
  }));
  const rows = [...auditLogs, ...orderLogs, ...accessLogs]
    .filter((entry) => state.filters.logType === "all" || entry.type === state.filters.logType)
    .filter((entry) => {
      if (!state.query) return true;
      return `${entry.title} ${entry.by} ${entry.detail} ${entry.type}`.toLowerCase().includes(state.query);
    })
    .filter((entry) => isWithinDateRange(entry.at, state.historyDateFrom, state.historyDateTo))
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, state.historyLimit);
  target.innerHTML = !state.historyCleared && rows.length ? rows.map((entry) => `
    <div class="list-row history-row">
      <div>
        <strong>${html(entry.title)} • ${formatDateTime(entry.at)}</strong>
        <span>${html(entry.by || "Usuário")}<br>${html(entry.detail).replace(/\n/g, "<br>")}</span>
      </div>
    </div>
  `).join("") : `<div class="empty-chart">${state.historyCleared ? "Histórico limpo da tela. Use os filtros ou carregue mais para exibir novamente." : "Sem histórico registrado para os filtros selecionados."}</div>`;
  byId("loadMoreHistoryBtn").hidden = state.historyCleared || rows.length < state.historyLimit;
}

function applyHistoryRange() {
  state.historyDateFrom = byId("historyDateFrom").value;
  state.historyDateTo = byId("historyDateTo").value;
  state.historyCleared = false;
  state.historyLimit = 40;
  renderLogs();
}

function isWithinDateRange(value, from, to) {
  const time = new Date(value || 0).getTime();
  if (!time) return !from && !to;
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime()) return false;
  return true;
}

function auditActionLabel(action) {
  return ({
    create: "Criação",
    update: "Edição",
    delete: "Exclusão",
    duplicate: "Duplicação",
    import: "Importação",
    export: "Exportação",
    quote_status: "Status de orçamento",
    quote_convert: "Conversão de orçamento",
    lead_create: "Lead criado",
    lead_update: "Lead editado",
    lead_delete: "Lead excluído",
  })[action] || action || "Ação";
}

function auditDiffText(oldValue, newValue) {
  if (!oldValue && !newValue) return "Sem detalhes adicionais.";
  const keys = [...new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])].slice(0, 12);
  return keys.map((key) => `${key}: ${formatAuditValue(oldValue?.[key])} -> ${formatAuditValue(newValue?.[key])}`).join("\n");
}

function formatAuditValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderActiveUsers() {
  const table = byId("activeUsersTable");
  if (!table) return;
  if (!state.isAdmin) {
    table.innerHTML = "";
    return;
  }
  const plan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  const limit = Number(plan?.limits?.users || 0);
  const limitLabel = byId("userPlanLimit");
  const overLimit = limit > 0 && state.activeUsers.length >= limit;
  if (limitLabel) {
    limitLabel.className = overLimit ? "limit-warning" : "";
    limitLabel.textContent = limit > 0 ?
       `${state.activeUsers.length} de ${limit} usuários utilizados${state.activeUsers.length > limit ? " — acima do limite" : ""}`
      : `${state.activeUsers.length} usuários`;
  }
  const submitButton = byId("manualUserForm")?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.title = overLimit ?
       "Ao tentar cadastrar, serão exibidas as opções de upgrade."
      : "";
  }
  table.innerHTML = state.activeUsers.length ? state.activeUsers.map((user) => `
    <tr>
      <td>${html(user.email)}</td>
      <td>
        <select class="role-select" data-action="change-user-role" data-email="${html(user.email)}" ${user.email === state.activeUserEmail ? "disabled" : ""}>
          <option value="Administrador" ${user.role === "Administrador" ? "selected" : ""}>Administrador</option>
          <option value="Edicao" ${isEditorRole(user.role) && !isAdminRole(user.role) ? "selected" : ""}>Edição</option>
          <option value="Leitura" ${!isEditorRole(user.role) && !isAdminRole(user.role) ? "selected" : ""}>Somente leitura</option>
        </select>
      </td>
      <td>${formatDateTime(user.approved_at)}</td>
      <td>
        <button class="icon-btn danger" type="button" data-action="remove-user" data-email="${html(user.email)}" ${user.email === state.activeUserEmail ? "disabled" : ""}>Remover</button>
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="4">Nenhum usuário ativo.</td>
    </tr>
  `;
  bindActions();
}

function renderResponsibles() {
  const table = byId("responsiblesTable");
  if (!table) return;
  table.innerHTML = state.responsibles.length ? state.responsibles.map((item) => `
    <tr>
      <td>${html(item.name)}</td>
      <td>
        <button class="icon-btn" type="button" data-action="edit-responsible" data-id="${html(item.id)}">Editar</button>
        <button class="icon-btn danger" type="button" data-action="delete-responsible" data-id="${html(item.id)}">Excluir</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="2">Nenhum responsável cadastrado.</td></tr>`;
  bindActions();
}

const MARKETPLACE_CHANNELS = [
  { id: "mercado-livre", label: "Mercado Livre" },
  { id: "shopee", label: "Shopee" },
  { id: "amazon", label: "Amazon" }
];

function normalizeMarketplaceChannel(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (["mercadolivre", "ml", "meli"].includes(normalized)) return "mercado-livre";
  if (normalized === "shopee") return "shopee";
  if (normalized === "amazon") return "amazon";
  return normalized || "mercado-livre";
}

function marketplaceDisplayName(value) {
  const channel = MARKETPLACE_CHANNELS.find((item) => item.id === normalizeMarketplaceChannel(value));
  return channel?.label || value || "Marketplace";
}

function matchesMarketplaceChannel(item) {
  return state.marketplaceChannelFilter === "all"
    || normalizeMarketplaceChannel(item?.marketplace) === state.marketplaceChannelFilter;
}

function marketplaceChannelsForCurrentFilter() {
  return state.marketplaceChannelFilter === "all" ?
     MARKETPLACE_CHANNELS
    : MARKETPLACE_CHANNELS.filter((item) => item.id === state.marketplaceChannelFilter);
}

function renderMarketplaceChannelCards() {
  return marketplaceChannelsForCurrentFilter().map((channel) => {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id);
    const listings = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id).length;
    const sales = state.marketplaceSales.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id).length;
    const errors = state.marketplaceLogs.filter((item) =>
      normalizeMarketplaceChannel(item.marketplace) === channel.id && item.status === "error"
    ).length;
    return `
      <article class="marketplace-channel-card ${account ? "connected" : ""}">
        <div class="marketplace-channel-card-head">
          <strong>${html(channel.label)}</strong>
          <span class="badge ${account ? "done" : "neutral"}">${account ? "Conectado" : "Não conectado"}</span>
        </div>
        <dl>
          <div><dt>Conta</dt><dd>${html(account?.seller_name || account?.external_seller_id || "-")}</dd></div>
          <div><dt>Anúncios</dt><dd>${listings}</dd></div>
          <div><dt>Vendas</dt><dd>${sales}</dd></div>
          <div><dt>Erros API</dt><dd>${errors}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

function getIntegrationTokenAlert() {
  if (state.marketplaceChannelFilter === "shopee") {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === "shopee");
    if (!account) return { level: "warning", message: "Shopee ainda não conectada. Configure as credenciais para sincronizar anúncios e vendas." };
  }
  if (state.marketplaceChannelFilter === "amazon") {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === "amazon");
    return account ?
       { level: "success", message: "Amazon conectada. Tokens LWA sao renovados automaticamente." }
      : { level: "warning", message: "Amazon preparada. Conecte uma conta Seller para ativar anuncios e vendas." };
  }
  const alert = getTokenAlert();
  if (alert && state.marketplaceChannelFilter !== "shopee") return alert;
  if (state.marketplaceChannelFilter === "mercado-livre") {
    return { level: "success", message: "Token Mercado Livre dentro do prazo." };
  }
  return null;
}

function renderMarketplaces() {
  const accountsTable = byId("marketplaceAccountsTable");
  const listingsGrid = byId("marketplaceListingsGrid");
  const salesGrid = byId("marketplaceSalesGrid");
  const logsSummary = byId("marketplaceLogsSummary");
  const apiLogsList = byId("marketplaceApiLogsList");
  const status = byId("marketplaceStatus");
  const channelCards = byId("marketplaceChannelCards");
  const storefrontList = byId("storefrontProductList");
  if (!accountsTable || !listingsGrid || !salesGrid || !logsSummary || !apiLogsList || !status) return;
  if (!state.isAdmin) {
    accountsTable.innerHTML = "";
    listingsGrid.innerHTML = "";
    salesGrid.innerHTML = "";
    logsSummary.innerHTML = "";
    apiLogsList.innerHTML = "";
    if (storefrontList) storefrontList.innerHTML = "";
    return;
  }
  const accounts = state.marketplaceAccounts.filter(matchesMarketplaceChannel);
  const listings = state.marketplaceListings.filter(matchesMarketplaceChannel);
  const sales = state.marketplaceSales.filter(matchesMarketplaceChannel);
  const logs = state.marketplaceLogs.filter(matchesMarketplaceChannel);
  renderOperationalSummary("marketplaceListingsView", "marketplacePageSummary", [
    ["Anúncios ativos", listings.filter((item) => item.status === "active").length, `${listings.length} sincronizados`, "green"],
    ["Visualizações hoje", listings.reduce((sum, item) => sum + Number(item.views_today || 0), 0), "desempenho dos anúncios", "blue"],
    ["Conversões hoje", sales.length, "vendas importadas", "amber"],
    ["Receita gerada", money.format(sales.reduce((sum, item) => sum + Number(item.raw_payload?.total_amount || 0), 0)), "vendas do filtro atual", "teal"],
    ["Com problemas", listings.filter((item) => !["active", "paused"].includes(item.status)).length, "requer atenção", "red"],
  ]);
  renderIntegrationSummary();
  renderStorefrontAdmin();
  if (channelCards) channelCards.innerHTML = renderMarketplaceChannelCards();
  status.innerHTML = state.marketplaceAccounts.length ?
     `<span class="badge done">Mercado Livre conectado</span><small>${state.marketplaceListings.length} anúncio${state.marketplaceListings.length === 1 ? "" : "s"} importado${state.marketplaceListings.length === 1 ? "" : "s"}</small>`
    : `<span class="badge neutral">Mercado Livre não conectado</span><small>Conecte a conta para importar anúncios e vendas.</small>`;
  status.innerHTML = marketplaceChannelsForCurrentFilter().map((channel) => {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id);
    const count = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id).length;
    return account ?
       `<span class="badge done">${channel.label} conectado</span><small>${count} anúncio${count === 1 ? "" : "s"} sincronizado${count === 1 ? "" : "s"}</small>`
      : `<span class="badge neutral">${channel.label} não conectado</span>`;
  }).join("");
  const shopeeSelected = state.marketplaceChannelFilter === "shopee";
  const amazonSelected = state.marketplaceChannelFilter === "amazon";
  const syncListingsButton = byId("syncMercadoLivreBtn");
  const syncSalesButton = byId("syncMarketplaceSalesBtn");
  if (syncListingsButton) syncListingsButton.textContent = shopeeSelected ? "Configurar Shopee" : amazonSelected ? "Sincronizar Amazon" : "Sincronizar ML";
  if (syncSalesButton) syncSalesButton.textContent = shopeeSelected ? "Configurar Shopee" : amazonSelected ? "Sincronizar Amazon" : "Sincronizar vendas";
  accountsTable.innerHTML = accounts.length ? accounts.map((item) => `
    <tr>
      <td>${html(item.marketplace)}</td>
      <td>${html(item.seller_name || item.external_seller_id || "-")}</td>
      <td>${renderMarketplaceWritePermission(item)}</td>
      <td>${formatDateTime(item.token_expires_at)}</td>
      <td>${formatDateTime(item.updated_at)}</td>
      <td>
        <div class="inline-actions">
          ${normalizeMarketplaceChannel(item.marketplace) === "mercado-livre" ? `<button class="secondary-btn" type="button" data-action="marketplace-reconnect-ml">Reconectar</button><button class="secondary-btn danger" type="button" data-action="marketplace-disconnect-ml">Desconectar</button>` : "-"}
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="6">Nenhuma conta conectada.</td></tr>`;
  const featuredListing = listings[0];
  listingsGrid.innerHTML = listings.length ? `
    <div class="marketplace-listing-table-wrap">
      <div class="marketplace-listing-toolbar">
        <input type="search" placeholder="Buscar anúncio..." aria-label="Buscar anúncio" data-marketplace-local-search />
        <button class="secondary-btn" type="button">Filtros</button>
      </div>
      <table class="marketplace-listing-table">
        <thead><tr><th>Produto</th><th>Marketplace</th><th>Preço</th><th>Estoque</th><th>Visualizações</th><th>Conversão</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${listings.map((item) => `
          <tr>
            <td><div class="listing-product-cell">${item.thumbnail_url ? `<img src="${html(item.thumbnail_url)}" alt="" loading="lazy" />` : `<span class="listing-placeholder"></span>`}<span><strong>${html(item.title)}</strong><small>${html(item.external_id)}</small></span></div></td>
            <td>${html(marketplaceDisplayName(item.marketplace))}</td>
            <td>${money.format(Number(item.price || 0))}</td>
            <td>${Number(item.stock || item.available_quantity || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.views || item.views_today || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.conversion || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
            <td><span class="badge ${item.status === "active" ? "done" : "neutral"}">${html(item.status || "-")}</span></td>
            <td><div class="inline-actions"><button class="secondary-btn" type="button" data-action="marketplace-stats" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Ver</button><button class="secondary-btn" type="button" data-action="marketplace-edit" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Editar</button></div></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <aside class="marketplace-listing-detail">
      ${featuredListing.thumbnail_url ? `<img src="${html(featuredListing.thumbnail_url)}" alt="${html(featuredListing.title)}" />` : ""}
      <span class="badge ${featuredListing.status === "active" ? "done" : "neutral"}">${html(featuredListing.status || "-")}</span>
      <h3>${html(featuredListing.title)}</h3>
      <small>${html(featuredListing.external_id)}</small>
      <dl><div><dt>Marketplace</dt><dd>${html(marketplaceDisplayName(featuredListing.marketplace))}</dd></div><div><dt>Preço</dt><dd>${money.format(Number(featuredListing.price || 0))}</dd></div><div><dt>Estoque</dt><dd>${Number(featuredListing.stock || featuredListing.available_quantity || 0)} unidades</dd></div></dl>
      <button class="primary-btn" type="button" data-action="marketplace-edit" data-id="${html(featuredListing.external_id)}" data-marketplace="${html(featuredListing.marketplace || "Mercado Livre")}">Editar anúncio</button>
    </aside>
  ` : `<div class="empty-chart">Nenhum anúncio importado.</div>`;
  salesGrid.innerHTML = sales.length ? sales.map((sale) => {
    const payload = sale.raw_payload || {};
    const orderItem = payload.order_items?.[0] || {};
    const product = orderItem.item?.title || payload.title || "Produto não informado";
    const amount = Number(payload.total_amount || orderItem.unit_price || 0);
    const internalOrder = state.data.orders.find((item) => item.id === sale.internal_order_id);
    const internalCode = internalOrder ? getOrderCode(internalOrder) : "";
    return `
      <article class="marketplace-sale-card">
        <div class="marketplace-sale-head">
          <div>
            <strong class="marketplace-sale-order">${html(internalCode || sale.external_order_id || "Venda")}</strong>
            <span class="marketplace-brand">Venda ${html(marketplaceDisplayName(sale.marketplace))}</span>
          </div>
          <span class="badge ${marketplaceSaleStatusClass(payload.status)}">${html(marketplaceSaleStatus(payload.status))}</span>
        </div>
        <dl class="marketplace-sale-details">
          <div><dt>Pedido</dt><dd>${html(sale.external_order_id || "-")}</dd></div>
          <div><dt>Produto</dt><dd>${html(product)}</dd></div>
          <div><dt>Valor</dt><dd>${money.format(amount)}</dd></div>
          <div><dt>Data</dt><dd>${formatDateTime(payload.date_created || sale.created_at)}</dd></div>
          <div><dt>Encomenda</dt><dd>${internalCode ? html(internalCode) : "Ainda não criada"}</dd></div>
        </dl>
        <div class="listing-actions">
          ${internalOrder ?
             `<button class="primary-btn" type="button" data-action="marketplace-view-order" data-id="${html(internalOrder.id)}">Ver encomenda</button>`
            : `<button class="primary-btn" type="button" data-action="marketplace-create-order" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Criar encomenda</button>`}
          <span class="automation-badge" title="Novas vendas recebidas pelo webhook criam encomendas automaticamente">Integração automática</span>
        </div>
        <div class="sale-document-actions">
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="label" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar etiqueta</button>
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="declaration" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar declaração</button>
          <button class="secondary-btn" type="button" data-action="marketplace-print" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Imprimir</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-chart">Nenhuma venda sincronizada ainda.</div>`;
  logsSummary.innerHTML = logs.length ?
     logs.slice(0, 5).map(renderMarketplaceLogSummary).join("")
    : `<div class="empty-chart">Nenhuma sincronização registrada.</div>`;
  const filteredLogs = logs
    .filter(matchesMarketplaceLogFilter)
    .filter((item) => isWithinDateRange(item.created_at, state.marketplaceLogDateFrom, state.marketplaceLogDateTo));
  const visibleLogs = filteredLogs.slice(0, state.marketplaceLogLimit);
  apiLogsList.innerHTML = !state.marketplaceLogsCleared && visibleLogs.length ?
     visibleLogs.map(renderMarketplaceApiLog).join("")
    : `<div class="empty-chart">${state.marketplaceLogsCleared ? "Logs limpos da tela. Aplique um período ou carregue mais para exibir novamente." : "Nenhum log encontrado para este filtro."}</div>`;
  byId("loadMoreMarketplaceLogsBtn").hidden = state.marketplaceLogsCleared || visibleLogs.length >= filteredLogs.length;
  document.querySelectorAll('[data-action="marketplace-log-filter"]').forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.marketplaceLogFilter);
  });
  document.querySelectorAll('[data-action="marketplace-channel-filter"]').forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === state.marketplaceChannelFilter);
  });
  bindActions();
}

function renderIntegrationSummary() {
  const channelLogs = state.marketplaceLogs.filter(matchesMarketplaceChannel);
  const channelListings = state.marketplaceListings.filter(matchesMarketplaceChannel);
  const latestSync = channelLogs.find((item) => item.kind === "manual-sync");
  const importedSales = channelLogs.filter((item) => item.kind === "order-import" && item.status === "success").length;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recentErrors = channelLogs.filter((item) =>
    item.status === "error" && new Date(item.created_at || 0).getTime() >= since
  ).length;
  const lastSync = byId("integrationLastSync");
  const listings = byId("integrationListingsCount");
  const sales = byId("integrationSalesCount");
  const errors = byId("integrationRecentErrors");
  const tokenTarget = byId("integrationTokenAlert");
  if (lastSync) lastSync.textContent = latestSync ? formatDateTime(latestSync.created_at) : "-";
  if (listings) listings.textContent = channelListings.length;
  if (sales) sales.textContent = importedSales;
  if (errors) errors.textContent = recentErrors;
  const tokenAlert = getIntegrationTokenAlert();
  if (tokenTarget) {
    tokenTarget.innerHTML = tokenAlert ?
       `<div class="integration-alert ${tokenAlert.level}">${html(tokenAlert.message)}</div>`
      : `<div class="integration-alert success">Integracoes conectadas dentro do prazo.</div>`;
  }
}

function renderMarketplaceLogSummary(item) {
  return `
    <div class="list-row api-log-summary">
      <div>
        <strong>${html(marketplaceLogLabel(item.kind))} • ${formatDateTime(item.created_at)}</strong>
        <span>${html(marketplaceDisplayName(item.marketplace))} • ${html(item.message || "")}</span>
      </div>
      <span class="api-status ${marketplaceLogStatusClass(item.status)}">${html(marketplaceLogStatusLabel(item.status))}</span>
    </div>
  `;
}

function renderMarketplaceApiLog(item) {
  const internalOrder = state.data.orders.find((order) => order.id === item.internal_order_id);
  const internalCode = internalOrder ? getOrderCode(internalOrder) : item.internal_order_id || "";
  const before = item.raw_payload?.before || {};
  const after = item.raw_payload?.after || {};
  const changes = [];
  if (before.price !== undefined && after.price !== undefined && Number(before.price) !== Number(after.price)) {
    changes.push(`Preço: ${money.format(Number(before.price || 0))} → ${money.format(Number(after.price || 0))}`);
  }
  if (before.available_quantity !== undefined && after.available_quantity !== undefined && Number(before.available_quantity) !== Number(after.available_quantity)) {
    changes.push(`Estoque: ${before.available_quantity} → ${after.available_quantity}`);
  }
  if (before.status && after.status && before.status !== after.status) changes.push(`Status: ${before.status} → ${after.status}`);
  if (before.title && after.title && before.title !== after.title) changes.push(`Título alterado`);
  const relation = item.external_order_id && internalCode ?
     `<div class="api-log-relation"><span>${html(item.external_order_id)}</span><strong>→</strong><span>${html(internalCode)}</span></div>`
    : "";
  return `
    <article class="api-log-card ${marketplaceLogStatusClass(item.status)}">
      <div class="api-log-card-head">
        <div>
          <span class="api-log-time">${formatDateTime(item.created_at)}</span>
          <strong>${html(item.marketplace || "Marketplace")}</strong>
        </div>
        <div class="api-log-tags">
          <span class="api-kind ${marketplaceLogKindClass(item.kind)}">${html(marketplaceLogLabel(item.kind))}</span>
          <span class="api-status ${marketplaceLogStatusClass(item.status)}">${html(marketplaceLogStatusLabel(item.status))}</span>
        </div>
      </div>
      <p class="api-log-message">${html(item.message || "Sem mensagem retornada.")}</p>
      ${relation}
      <dl class="api-log-meta">
        ${item.external_item_id ? `<div><dt>Anúncio</dt><dd>${html(item.external_item_id)}</dd></div>` : ""}
        ${item.external_order_id ? `<div><dt>Venda</dt><dd>${html(item.external_order_id)}</dd></div>` : ""}
        ${internalCode ? `<div><dt>Encomenda</dt><dd>${html(internalCode)}</dd></div>` : ""}
        <div><dt>Usuário</dt><dd>${html(item.actor_email || "Sistema")}</dd></div>
      </dl>
      ${changes.length ? `<div class="api-log-changes">${changes.map((change) => `<span>${html(change)}</span>`).join("")}</div>` : ""}
      ${item.status === "error" && item.raw_payload?.error ? `<div class="api-error-detail">${html(item.raw_payload.error)}</div>` : ""}
    </article>
  `;
}

function marketplaceLogLabel(kind) {
  return {
    "sync-products": "sync-products",
    "manual-sync": "sync",
    webhook: "webhook",
    "edit-listing": "edit-listing",
    "order-import": "order-import",
    "create-order": "order-import",
    "token-refresh": "token",
    "oauth-connect": "oauth",
    "document-label": "etiqueta",
    "document-declaration": "declaracao"
  }[kind] || kind || "api";
}

function marketplaceLogKindClass(kind) {
  if (kind === "webhook") return "webhook";
  if (["sync-products", "manual-sync"].includes(kind)) return "sync";
  if (kind === "edit-listing") return "edit";
  if (["order-import", "create-order"].includes(kind)) return "sale";
  if (kind === "token-refresh") return "token";
  if (["document-label", "document-declaration"].includes(kind)) return "document";
  return "neutral";
}

function marketplaceLogStatusLabel(status) {
  if (status === "success") return "Sucesso";
  if (status === "error") return "Erro";
  if (status === "ignored") return "Ignorado";
  return status || "Informação";
}

function marketplaceLogStatusClass(status) {
  if (status === "success") return "success";
  if (status === "error") return "error";
  return "ignored";
}

function matchesMarketplaceLogFilter(item) {
  const filter = state.marketplaceLogFilter;
  if (filter === "all") return true;
  if (filter === "success" || filter === "error") return item.status === filter;
  if (filter === "webhook") return item.kind === "webhook" || item.raw_payload?.source === "webhook";
  if (filter === "listings") return ["sync-products", "edit-listing"].includes(item.kind);
  if (filter === "sales") return ["order-import", "create-order"].includes(item.kind);
  if (filter === "documents") return ["document-label", "document-declaration"].includes(item.kind);
  return true;
}

async function loadAccessRequests() {
  if (!state.supabase || !state.isAdmin) {
    state.accessRequests = [];
    return;
  }
  let { data, error } = await state.supabase
    .from("access_requests")
    .select("email,name,status,requested_at,decided_at,decided_by")
    .eq("organization_id", state.organizationId)
    .order("requested_at", { ascending: false });
  if (error && String(error.message || "").includes("decided_at")) {
    const fallback = await state.supabase
      .from("access_requests")
      .select("email,name,status,requested_at")
      .eq("organization_id", state.organizationId)
      .order("requested_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  state.accessRequests = data || [];
}

async function loadActiveUsers() {
  if (!state.supabase || !state.isAdmin) {
    state.activeUsers = [];
    return;
  }
  const [approved, members] = await Promise.all([
    state.supabase
      .from("approved_users")
      .select("email,role,approved_at")
      .eq("organization_id", state.organizationId)
      .order("approved_at", { ascending: false }),
    state.supabase
      .from("organization_members")
      .select("user_email,role,updated_at,status")
      .eq("organization_id", state.organizationId)
      .eq("status", "active"),
  ]);
  if (approved.error) throw approved.error;
  if (members.error) throw members.error;
  const byEmail = new Map();
  (approved.data || []).forEach((row) => byEmail.set(String(row.email || "").toLowerCase(), row));
  (members.data || []).forEach((row) => {
    const email = String(row.user_email || "").toLowerCase();
    if (!email || byEmail.has(email)) return;
    byEmail.set(email, { email, role: row.role || "Leitura", approved_at: row.updated_at });
  });
  state.activeUsers = [...byEmail.values()];
}

async function loadMarketplaces() {
  if (!state.supabase || !state.isAdmin) {
    state.marketplaceAccounts = [];
    state.marketplaceListings = [];
    state.marketplaceSales = [];
    state.marketplaceLogs = [];
    return;
  }
  const [accounts, listings, sales, logs] = await Promise.all([
    state.supabase.from("marketplace_accounts").select("marketplace,seller_name,external_seller_id,token_expires_at,updated_at,raw_payload").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }),
    state.supabase.from("marketplace_listings").select("marketplace,external_id,title,sku,price,status,permalink,thumbnail_url,raw_payload,updated_at").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }).limit(100),
    state.supabase.from("marketplace_order_links").select("marketplace,external_order_id,internal_order_id,raw_payload,created_at,updated_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(100),
    state.supabase.from("marketplace_sync_log").select("id,marketplace,kind,status,message,external_item_id,external_order_id,internal_order_id,actor_email,raw_payload,created_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(200)
  ]);
  state.marketplaceAccounts = accounts.error ? [] : accounts.data || [];
  state.marketplaceListings = listings.error ? [] : listings.data || [];
  state.marketplaceSales = sales.error ? [] : sales.data || [];
  state.marketplaceLogs = logs.error ? [] : logs.data || [];
}

async function loadResponsibles() {
  if (!state.supabase) return;
  try {
    const { data, error } = await state.supabase
      .from("responsibles")
      .select("id,name")
      .eq("organization_id", state.organizationId)
      .order("name", { ascending: true });
    if (error) return;
    state.responsibles = data || [];
  } catch {
    // Mantém responsáveis padrão quando a tabela ainda não existe.
  }
}

async function loadAndRenderResponsibles() {
  await loadResponsibles();
  renderResponsibles();
  renderResponsibleOptions();
}

async function loadAndRenderApprovals() {
  await loadAccessRequests();
  renderApprovals();
}

async function loadAndRenderUsers() {
  await loadActiveUsers();
  renderActiveUsers();
}

async function loadAndRenderMarketplaces() {
  await loadMarketplaces();
  renderMarketplaces();
}

let storefrontUploadedImages = [];

function renderStorefrontAdmin() {
  const source = byId("storefrontSourceListing");
  const list = byId("storefrontProductList");
  const stats = byId("storefrontStats");
  if (!source || !list || !stats) return;
  const selected = source.value;
  source.innerHTML = `<option value="">Produto novo/manual</option>` + state.marketplaceListings.map((item) => `
    <option value="${html(`${item.marketplace}:${item.external_id}`)}">${html(marketplaceDisplayName(item.marketplace))} - ${html(item.title || item.external_id)}</option>
  `).join("");
  source.value = [...source.options].some((option) => option.value === selected) ? selected : "";
  const synced = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) !== "vitrine").length;
  const manual = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === "vitrine").length;
  const views = state.storefrontEvents.filter((item) => item.event_type === "product_view").length;
  const buyClicks = state.storefrontEvents.filter((item) => item.event_type === "buy_click").length;
  const quoteClicks = state.storefrontEvents.filter((item) => ["quote_click", "custom_quote"].includes(item.event_type)).length;
  stats.innerHTML = `
    <article><span>Produtos na vitrine</span><strong>${state.marketplaceListings.length}</strong></article>
    <article><span>Sincronizados</span><strong>${synced}</strong></article>
    <article><span>Manuais</span><strong>${manual}</strong></article>
    <article><span>Visualizações</span><strong>${views}</strong></article>
    <article><span>Cliques em comprar</span><strong>${buyClicks}</strong></article>
    <article><span>Cliques/orçamentos</span><strong>${quoteClicks}</strong></article>
    <article><span>Última atualização</span><strong>${formatDateTime(state.marketplaceListings[0]?.updated_at)}</strong></article>
  `;
  list.innerHTML = state.marketplaceListings.length ? state.marketplaceListings.map((item) => {
    const payload = item.raw_payload || {};
    const images = storefrontListingImages(item);
    return `
      <article class="storefront-product-row">
        <img src="${html(images[0] || item.thumbnail_url || "")}" alt="${html(item.title)}" />
        <div>
          <strong>${html(item.title)}</strong>
          <span>${html(marketplaceDisplayName(item.marketplace))} • ${money.format(Number(item.price || 0))}</span>
          <small>${html(payload.description || payload.plain_text || "Descrição vinda do marketplace ou cadastro interno.")}</small>
        </div>
        <button class="secondary-btn" type="button" data-action="storefront-edit" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace)}">Editar</button>
      </article>
    `;
  }).join("") : `<div class="empty-chart">Nenhum produto na vitrine.</div>`;
}

function updateStorefrontTargetFields() {
  const form = byId("storefrontProductForm");
  if (!form) return;
  const marketplace = form.elements.marketplace.value;
  const mlFields = byId("storefrontMlFields");
  const shopeeFields = byId("storefrontShopeeFields");
  const amazonFields = byId("storefrontAmazonFields");
  const showMl = form.elements.publish_ml.checked || marketplace === "Mercado Livre";
  const showShopee = form.elements.publish_shopee.checked || marketplace === "Shopee";
  const showAmazon = form.elements.publish_amazon.checked || marketplace === "Amazon";
  if (mlFields) mlFields.hidden = !showMl;
  if (shopeeFields) shopeeFields.hidden = !showShopee;
  if (amazonFields) amazonFields.hidden = !showAmazon;
  if (form.elements.publish_ml.checked) form.elements.marketplace.value = "Mercado Livre";
  if (form.elements.publish_shopee.checked && !form.elements.publish_ml.checked) form.elements.marketplace.value = "Shopee";
  if (form.elements.publish_amazon.checked && !form.elements.publish_ml.checked && !form.elements.publish_shopee.checked) {
    form.elements.marketplace.value = "Amazon";
  }
}

function storefrontListingImages(item) {
  const pictures = Array.isArray(item.raw_payload?.pictures) ? item.raw_payload.pictures : [];
  return [
    ...pictures.map((picture) => picture.secure_url || picture.url).filter(Boolean),
    item.thumbnail_url,
  ].filter(Boolean);
}

function storefrontDeliveryNoteFromListing(item) {
  const payload = item.raw_payload || {};
  if (payload.delivery_note) return payload.delivery_note;
  const manufacturing = payload.sale_terms?.find?.((term) => term.id === "MANUFACTURING_TIME")?.value_name;
  if (manufacturing) return `As datas de entrega incluem os ${manufacturing} necessários para deixar o produto pronto.`;
  return item.marketplace === "Mercado Livre" ?
     "Confira o prazo final de entrega no Mercado Livre antes de concluir a compra."
    : "";
}

function fillStorefrontFormFromListing(item) {
  if (!item) return;
  const form = byId("storefrontProductForm");
  const payload = item.raw_payload || {};
  form.elements.external_id.value = item.external_id || "";
  form.elements.publish_vitrine.checked = true;
  form.elements.publish_ml.checked = false;
  form.elements.publish_shopee.checked = false;
  form.elements.publish_amazon.checked = false;
  form.elements.marketplace.value = item.marketplace || "Vitrine";
  form.elements.title.value = item.title || "";
  form.elements.category.value = payload.category || payload.domain_id || payload.category_id || "Action figures";
  form.elements.price.value = Number(item.price || 0);
  form.elements.available_quantity.value = Number(payload.available_quantity || 1);
  form.elements.marketplace_url.value = item.permalink || payload.permalink || "";
  form.elements.amazon_url.value = payload.amazon_url || (item.marketplace === "Amazon" ? item.permalink || "" : "");
  form.elements.shopee_url.value = payload.shopee_url || "";
  form.elements.whatsapp_url.value = payload.whatsapp_url || "";
  form.elements.payment_note.value = payload.payment_note || "";
  form.elements.delivery_note.value = storefrontDeliveryNoteFromListing(item);
  form.elements.description.value = payload.description || payload.plain_text || "";
  form.elements.description_html.value = sanitizeRichHtml(payload.description_html || "");
  byId("storefrontDescriptionEditor").innerHTML = sanitizeRichHtml(payload.description_html || "");
  form.elements.image_url.value = storefrontListingImages(item).join("\n");
  form.elements.tech_material.value = payload.technical_info?.material || "";
  form.elements.tech_height.value = payload.technical_info?.height || "";
  form.elements.tech_painting.value = payload.technical_info?.painting || "";
  form.elements.tech_assembly.value = payload.technical_info?.assembly || "";
  form.elements.ml_category_id.value = payload.category_id || "";
  form.elements.ml_listing_type_id.value = payload.listing_type_id || "gold_special";
  form.elements.ml_condition.value = payload.condition || "new";
  form.elements.ml_warranty.value = payload.warranty || "Sem garantia";
  form.elements.ml_manufacturing_time.value = payload.sale_terms?.find?.((term) => term.id === "MANUFACTURING_TIME")?.value_name || "";
  form.elements.sku.value = item.sku || payload.seller_custom_field || "";
  form.elements.ml_attributes_json.value = JSON.stringify(payload.attributes || [], null, 2);
  form.elements.featured.checked = true;
  storefrontUploadedImages = [];
  updateStorefrontTargetFields();
}

function importSelectedListingToStorefrontForm() {
  const value = byId("storefrontSourceListing").value;
  if (!value) return;
  const [marketplace, ...idParts] = value.split(":");
  const externalId = idParts.join(":");
  const item = state.marketplaceListings.find((listing) =>
    listing.external_id === externalId && listing.marketplace === marketplace
  );
  fillStorefrontFormFromListing(item);
}

async function saveStorefrontProduct(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const message = byId("storefrontProductMessage");
  const imageUrls = String(data.get("image_url") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const descriptionHtml = sanitizeRichHtml(byId("storefrontDescriptionEditor").innerHTML.trim());
  form.elements.description_html.value = descriptionHtml;
  const publishTargets = {
    vitrine: data.get("publish_vitrine") === "on",
    mercado_livre: data.get("publish_ml") === "on",
    shopee: data.get("publish_shopee") === "on",
    amazon: data.get("publish_amazon") === "on",
  };
  const payload = {
    action: "save",
    marketplace: data.get("marketplace"),
    external_id: data.get("external_id"),
    title: data.get("title"),
    category: data.get("category"),
    price: number(data.get("price")),
    marketplace_url: data.get("marketplace_url"),
    payment_note: data.get("payment_note"),
    delivery_note: data.get("delivery_note"),
    description: data.get("description"),
    image_urls: [...imageUrls, ...storefrontUploadedImages],
    featured: data.get("featured") === "on",
    publish_targets: publishTargets,
    sku: data.get("sku"),
    raw_payload: {
      available_quantity: Number(data.get("available_quantity") || 1),
      shopee_url: data.get("shopee_url"),
      amazon_url: data.get("amazon_url"),
      whatsapp_url: data.get("whatsapp_url"),
      description_html: descriptionHtml,
      technical_info: {
        material: data.get("tech_material"),
        height: data.get("tech_height"),
        painting: data.get("tech_painting"),
        assembly: data.get("tech_assembly"),
      },
      category_id: data.get("ml_category_id"),
      listing_type_id: data.get("ml_listing_type_id"),
      condition: data.get("ml_condition"),
      warranty: data.get("ml_warranty"),
      sale_terms: data.get("ml_manufacturing_time") ?
         [{ id: "MANUFACTURING_TIME", name: "Tempo de preparo", value_name: data.get("ml_manufacturing_time") }]
        : [],
      attributes: parseJsonSafe(data.get("ml_attributes_json"), []),
      amazon: {
        sku: data.get("amazon_sku"),
        asin: data.get("amazon_asin"),
        product_type: data.get("amazon_product_type"),
        attributes: parseJsonSafe(data.get("amazon_attributes_json"), {}),
      },
    },
  };
  message.textContent = "Salvando produto da vitrine...";
  try {
    if (publishTargets.mercado_livre) {
      const created = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=create-listing", {
        method: "POST",
        body: JSON.stringify({
          title: payload.title,
          price: payload.price,
          available_quantity: Number(data.get("available_quantity") || 1),
          category_id: data.get("ml_category_id"),
          listing_type_id: data.get("ml_listing_type_id"),
          condition: data.get("ml_condition"),
          warranty: data.get("ml_warranty"),
          manufacturing_time: data.get("ml_manufacturing_time"),
          sku: data.get("sku"),
          pictures: [...imageUrls, ...storefrontUploadedImages],
          description: payload.description,
          attributes: parseJsonSafe(data.get("ml_attributes_json"), []),
        }),
      });
      payload.marketplace = "Mercado Livre";
      payload.external_id = created.item?.id || payload.external_id;
      payload.marketplace_url = created.item?.permalink || payload.marketplace_url;
    } else if (publishTargets.shopee) {
      message.textContent = "Shopee ainda depende da aprovação do app. Salvando somente na vitrine.";
    } else if (publishTargets.amazon) {
      message.textContent = "Amazon preparada. O produto sera sincronizado quando a conta Seller estiver conectada.";
    }
    await storefrontRequest(payload);
    storefrontUploadedImages = [];
    byId("storefrontImageFiles").value = "";
    await loadMarketplaces();
    renderMarketplaces();
    message.textContent = "Produto salvo na vitrine.";
  } catch (error) {
    message.textContent = error.message;
  }
}

function bindStorefrontImageInputs() {
  const dropzone = byId("storefrontImageDropzone");
  const input = byId("storefrontImageFiles");
  if (!dropzone || !input) return;
  input.addEventListener("change", async () => {
    await addStorefrontImageFiles(input.files);
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });
  dropzone.addEventListener("drop", async (event) => {
    await addStorefrontImageFiles(event.dataTransfer?.files || []);
  });
}

async function addStorefrontImageFiles(files) {
  const message = byId("storefrontProductMessage");
  const list = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!list.length) return;
  message.textContent = "Preparando imagens...";
  const images = await Promise.all(list.slice(0, 8).map(resizeImageFileForStorefront));
  storefrontUploadedImages = [...storefrontUploadedImages, ...images].slice(0, 8);
  message.textContent = `${storefrontUploadedImages.length} imagem(ns) pronta(s) para salvar.`;
}

function bindStorefrontDescriptionEditor() {
  const editor = byId("storefrontDescriptionEditor");
  if (!editor) return;
  editor.addEventListener("paste", async (event) => {
    const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    const images = await Promise.all(files.map(resizeImageFileForStorefront));
    images.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Imagem da descrição";
      editor.appendChild(img);
    });
  });
}

function resizeImageFileForStorefront(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem invalida."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function storefrontRequest(payload) {
  const { data } = await state.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/storefront", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const dataJson = await response.json();
  if (!response.ok || !dataJson.ok) throw new Error(dataJson.error || "Falha ao salvar na vitrine.");
  return dataJson;
}

async function loadMlCategoryFields() {
  const form = byId("storefrontProductForm");
  const categoryId = form.elements.ml_category_id.value.trim();
  const preview = byId("mlCategoryFieldsPreview");
  if (!categoryId) {
    preview.innerHTML = `<p class="form-error">Informe o ID da categoria ML.</p>`;
    return;
  }
  preview.innerHTML = "Carregando campos obrigatórios...";
  try {
    const data = await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=category-fields&category_id=${encodeURIComponent(categoryId)}`);
    const required = (data.attributes || []).filter((item) => item.tags?.required || item.tags?.catalog_required);
    preview.innerHTML = required.length ?
       required.slice(0, 20).map((item) => `<span>${html(item.id)} - ${html(item.name)}</span>`).join("")
      : `<span>Nenhum campo obrigatório retornado para esta categoria.</span>`;
  } catch (error) {
    preview.innerHTML = `<p class="form-error">${html(error.message)}</p>`;
  }
}

function parseJsonSafe(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || "").trim() || JSON.stringify(fallback));
    return Array.isArray(parsed) || typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function approveAccess(email) {
  try {
    await userAccessRequest({
      action: "approve-request",
      email,
      role: "Edicao",
    }, true);
  } catch (error) {
    showAppMessage(
      /limite de usuarios/i.test(error.message) ? "Limite do plano atingido" : "Não foi possível aprovar",
      error.message,
      "error",
    );
    return;
  }
  await loadAndRenderApprovals();
  await loadAndRenderUsers();
  renderLogs();
}

async function rejectAccess(email) {
  const decidedAt = new Date().toISOString();
  const { error } = await state.supabase
    .from("access_requests")
    .update({
      status: "rejected",
      decided_at: decidedAt,
      decided_by: state.activeUserEmail
    })
    .eq("email", email);
  if (error) {
    await state.supabase
      .from("access_requests")
      .update({ status: "rejected", requested_at: decidedAt })
      .eq("email", email);
  }
  state.accessRequests = state.accessRequests.map((item) => item.email === email ? { ...item, status: "rejected", decided_at: decidedAt, decided_by: state.activeUserEmail } : item);
  await loadAndRenderApprovals();
  renderLogs();
}

async function duplicateOrder(id) {
  const source = state.data.orders.find((item) => item.id === id);
  if (!source) return;
  const copy = {
    ...source,
    id: nextId("ENC", state.data.orders),
    description: `${source.description} (cópia)`,
    status: "A preparar",
    received: 0,
    history: appendHistory([], [{ field: "Pedido", from: "-", to: "Duplicado" }])
  };
  state.data.orders.push(copy);
  await persist("orders", copy);
  await recordAudit("duplicate", "order", copy.id, copy.orderCode, source, copy, "manual");
  saveData();
  render();
}

async function removeReferenceImage(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || !item.referenceImageUrl) return;
  if (!confirm("Remover a imagem de referência desta encomenda?")) return;
  await removeStorageImage(item.referenceImageUrl);
  item.referenceImageUrl = "";
  item.history = appendHistory(item.history, [{ field: "Imagem de referência", from: "Cadastrada", to: "Removida" }]);
  await persist("orders", item);
  await recordAudit("update", "order", item.id, item.orderCode, { [field]: previous }, { [field]: value }, "manual");
  saveData();
  render();
}

async function updateQuoteStage(id, stage) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || !stage || item.quoteStage === stage) return;
  const previous = item.quoteStage || "Solicitado";
  item.quoteStage = stage;
  item.quoteUpdatedAt = new Date().toISOString();
  item.history = appendHistory(item.history, [{ field: "Orçamento", from: previous, to: stage }]);
  if (stage === "Aprovado") item.tags = mergeTags(item.tags || [], "Personalizado");
  await persist("orders", item);
  await recordAudit("quote_status", "order", item.id, item.orderCode, { quoteStage: previous }, { quoteStage: stage }, "manual");
  if (["Orçamento enviado", "Aguardando cliente"].includes(stage)) {
    await createNotification("quote", "Orçamento aguardando cliente", `${item.orderCode} - ${item.description}`, "order", item.id, "normal", "editor");
  }
  saveData();
  render();
}

async function convertQuoteToProduction(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || item.quoteStage !== "Aprovado") return;
  const previous = { quoteStage: item.quoteStage, productionStage: item.productionStage };
  item.quoteStage = "Convertido em encomenda";
  item.quoteUpdatedAt = new Date().toISOString();
  item.productionStage = "Em fila";
  item.status = "A preparar";
  item.history = appendHistory(item.history, [{ field: "Orçamento", from: "Aprovado", to: "Convertido em encomenda" }]);
  await persist("orders", item);
  await recordAudit("quote_convert", "order", item.id, item.orderCode, previous, {
    quoteStage: item.quoteStage,
    productionStage: item.productionStage,
  }, "manual");
  saveData();
  render();
}

async function updateOrderInline(id, field, value) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || !["priority", "status", "productionStage", "responsible"].includes(field)) return;
  const snapshot = structuredClone(item);
  const previous = field === "status" ? normalizeOrderStatus(item[field]) : item[field] || "";
  if (field === "status") value = normalizeOrderStatus(value);
  if (previous === value) return;
  item[field] = value;
  if (field === "productionStage" && value === "Entregue") item.status = "Entregue";
  if (field === "status" && value === "Entregue") item.productionStage = "Entregue";
  applyDeliveredPaymentDefault(item);
  item.history = appendHistory(item.history, [{
    field: {
      priority: "Prioridade",
      status: "Status",
      productionStage: "Etapa",
      responsible: "Responsável"
    }[field],
    from: previous || "-",
    to: value || "-"
  }]);
  await persist("orders", item);
  await syncOrderPaymentCash(item, snapshot);
  saveData();
  render();
}

async function removeOrderTag(id, tag) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || !tag) return;
  item.tags = (item.tags || []).filter((current) => current !== tag);
  item.history = appendHistory(item.history, [{ field: "Etiqueta", from: tag, to: "Removida" }]);
  await persist("orders", item);
  saveData();
  render();
}

async function removeStorageImage(url) {
  if (!state.supabase) return;
  const marker = "/storage/v1/object/public/order-images/";
  const index = String(url || "").indexOf(marker);
  if (index < 0) return;
  const path = decodeURIComponent(String(url).slice(index + marker.length));
  if (!path) return;
  await state.supabase.storage.from("order-images").remove([path]);
}

async function changeUserRole(email, role) {
  await state.supabase
    .from("approved_users")
    .update({ role })
    .eq("email", email)
    .eq("organization_id", state.organizationId);
  await state.supabase
    .from("organization_members")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("organization_id", state.organizationId)
    .eq("user_email", email);
  await loadAndRenderUsers();
}

async function removeUser(email) {
  if (!confirm(`Remover acesso de ${email}?`)) return;
  await state.supabase
    .from("approved_users")
    .delete()
    .eq("email", email)
    .eq("organization_id", state.organizationId);
  await state.supabase
    .from("organization_members")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("organization_id", state.organizationId)
    .eq("user_email", email);
  await loadAndRenderUsers();
}

async function createManualUserAccess(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");
  const role = String(data.get("role") || "Edicao");
  if (!email) return;
  const currentPlan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  const userLimit = Number(currentPlan?.limits?.users || 0);
  if (userLimit > 0 && state.activeUsers.length >= userLimit) {
    showPlanLimitDialog(currentPlan, userLimit);
    return;
  }
  if (password.length < 6) {
    showAppMessage("Senha inválida", "A senha precisa ter pelo menos 6 caracteres.", "error");
    return;
  }
  try {
    await userAccessRequest({
      action: "manual-create",
      name,
      email,
      password,
      role
    }, true);
  } catch (error) {
    showAppMessage("Não foi possível criar o acesso", error.message, "error");
    return;
  }
  form.reset();
  await loadAndRenderUsers();
  await loadAndRenderApprovals();
  renderLogs();
  showAppMessage("Acesso criado", "A senha foi definida e o usuário já pode entrar.");
}

function showPlanLimitDialog(plan, limit) {
  const currentPrice = Number(plan?.price_monthly || 0);
  const currentUsers = Number(plan?.limits?.users || limit || 0);
  const nextPlan = state.subscriptionPlans
    .filter((item) => item.active !== false && (
      Number(item.limits?.users || 0) > currentUsers
      || Number(item.price_monthly || 0) > currentPrice
    ))
    .sort((a, b) => Number(a.limits?.users || 0) - Number(b.limits?.users || 0))[0];
  byId("planLimitMessage").textContent = `O plano ${plan?.name || state.subscription?.plan_code || "atual"} permite ${limit} usuário(s) e a empresa possui ${state.activeUsers.length}.`;
  byId("planLimitRecommendation").innerHTML = nextPlan
    ? `<strong>Plano recomendado: ${html(nextPlan.name)}</strong><span>${Number(nextPlan.limits?.users || 0)} usuários e ${Number(nextPlan.limits?.marketplace_sales_month || 0)} vendas importadas por mês.</span>`
    : `<strong>Limite atingido</strong><span>Remova usuários não utilizados ou fale com o suporte sobre um plano superior.</span>`;
  byId("planLimitDialog").showModal();
}

async function connectMercadoLivre() {
  if (!state.supabase) return;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const endpoint = "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/ml/start";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        organization_id: state.organizationId,
        return_url: `${window.location.origin}${window.location.pathname}#marketplace`
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.connect_url) throw new Error(payload.error || "Nao foi possivel iniciar a conexao.");
    window.location.href = payload.connect_url;
  } catch (error) {
    showAppMessage("Conexão Mercado Livre", `Não consegui iniciar a conexão: ${error.message}`, "error");
  }
}

async function disconnectMercadoLivre() {
  if (!state.supabase || !confirm("Desconectar a conta Mercado Livre desta empresa?")) return;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/ml/disconnect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ organization_id: state.organizationId }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "Nao foi possivel desconectar.");
    showAppMessage("Mercado Livre desconectado", "A conta foi removida desta empresa. Nenhum token de outra empresa sera usado.", "success");
    await loadAndRenderMarketplaces();
  } catch (error) {
    showAppMessage("Mercado Livre", `Nao foi possivel desconectar: ${error.message}`, "error");
  }
}

function configureShopee() {
  alert("A integracao da Shopee ainda precisa das credenciais do Shopee Open Platform: Partner ID, Partner Key, Shop ID e URL de retorno. O painel ja esta preparado para exibir anuncios, vendas, integracao e logs da Shopee.");
}

function renderMarketplaceWritePermission(account) {
  const scope = String(account.raw_payload?.scope || "");
  const readOnly = scope.includes("publish-sync:/read-only");
  const readWrite = scope.includes("publish-sync:/write") || scope.includes("publish-sync:/read-write");
  if (readWrite) return `<span class="badge done">Leitura e escrita</span>`;
  if (readOnly) return `<span class="badge queue">Somente leitura</span>`;
  return `<span class="badge neutral">Não identificada</span>`;
}

function marketplaceSaleStatus(status) {
  return {
    confirmed: "Confirmada",
    payment_required: "Aguardando pagamento",
    payment_in_process: "Pagamento em análise",
    paid: "A preparar",
    partially_paid: "Pagamento parcial",
    cancelled: "Cancelada",
    invalid: "Inválida"
  }[status] || status || "A preparar";
}

function marketplaceSaleStatusClass(status) {
  if (["paid", "confirmed"].includes(status)) return "done";
  if (["cancelled", "invalid"].includes(status)) return "danger-badge";
  return "queue";
}

function setMarketplaceView(view) {
  state.marketplaceView = ["listings", "storefront", "sales", "integrations", "api-logs", "backup"].includes(view) ? view : "listings";
  document.querySelectorAll("[data-marketplace-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.marketplaceView === state.marketplaceView);
  });
  byId("marketplaceListingsView").classList.toggle("active", state.marketplaceView === "listings");
  byId("marketplaceStorefrontView").classList.toggle("active", state.marketplaceView === "storefront");
  byId("marketplaceSalesView").classList.toggle("active", state.marketplaceView === "sales");
  byId("marketplaceIntegrationsView").classList.toggle("active", state.marketplaceView === "integrations");
  byId("marketplaceApiLogsView").classList.toggle("active", state.marketplaceView === "api-logs");
  byId("marketplaceBackupView").classList.toggle("active", state.marketplaceView === "backup");
}

function applyMarketplaceLogRange() {
  state.marketplaceLogDateFrom = byId("marketplaceLogDateFrom").value;
  state.marketplaceLogDateTo = byId("marketplaceLogDateTo").value;
  state.marketplaceLogsCleared = false;
  state.marketplaceLogLimit = 30;
  renderMarketplaces();
}

function viewMarketplaceOrder(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  state.query = getOrderCode(order).toLowerCase();
  byId("globalSearch").value = getOrderCode(order);
  state.filters.orderMaterial = "all";
  state.filters.orderStatus = "all";
  state.filters.orderMarketplace = "all";
  state.filters.orderFocus = "all";
  syncOrderFilterControls();
  setView("orders");
  renderTables();
}

async function createMarketplaceOrder(externalOrderId, marketplace = "Mercado Livre") {
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    alert("A criacao automatica de encomendas da Shopee sera ativada quando a API da conta estiver conectada.");
    return;
  }
  if (!ensureCanAdmin()) return;
  try {
    await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=create-order&order_id=${encodeURIComponent(externalOrderId)}`, {
      method: "POST",
      body: "{}"
    });
    await loadRemoteData();
    await loadMarketplaces();
    saveData();
    render();
    setMarketplaceView("sales");
    flashActionMessage("Encomenda criada a partir da venda.");
  } catch (error) {
    alert(`Não consegui criar a encomenda: ${error.message}`);
  }
}

async function marketplaceRequest(url, options = {}) {
  const { data } = await state.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Entre novamente.");
  const requestUrl = new URL(url);
  if (state.organizationId && !requestUrl.searchParams.get("organization_id")) {
    requestUrl.searchParams.set("organization_id", state.organizationId);
  }
  const response = await fetch(requestUrl.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Falha na integracao.");
  return payload;
}

async function downloadMarketplaceDocument(externalOrderId, marketplace, documentType, printAfter = false) {
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    alert("Os documentos da Shopee serao liberados quando a conta estiver conectada ao Shopee Open Platform.");
    return;
  }
  const printWindow = printAfter ? window.open("", "_blank") : null;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const url = new URL("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync");
    url.searchParams.set("marketplace", "ml");
    url.searchParams.set("action", "document");
    url.searchParams.set("order_id", externalOrderId);
    url.searchParams.set("document_type", documentType);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Erro ao gerar documento.");
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (printAfter && printWindow) {
      printWindow.location.href = blobUrl;
      setTimeout(() => printWindow.print(), 900);
    } else {
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="?([^"]+)"?/i)?.[1] ||
        `${documentType}-${externalOrderId}.pdf`;
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    await loadAndRenderMarketplaces();
  } catch (error) {
    if (printWindow) printWindow.close();
    alert(error.message || "Erro ao gerar documento.");
    await loadAndRenderMarketplaces();
  }
}

async function syncMercadoLivre() {
  if (!ensureCanAdmin()) return;
  if (state.marketplaceChannelFilter === "shopee") {
    configureShopee();
    return;
  }
  if (state.marketplaceChannelFilter === "amazon") {
    await syncAmazon();
    return;
  }
  const status = byId("marketplaceStatus");
  if (status) status.innerHTML = `<span class="badge queue">Sincronizando Mercado Livre...</span>`;
  try {
    const data = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml");
    await loadRemoteData();
    await loadMarketplaces();
    saveData();
    render();
    await recordAudit("marketplace_sync", "marketplace", "Mercado Livre", "", null, {
      created: data.created_count || 0,
      ignored: data.ignored_count || 0,
    }, "marketplace");
    flashActionMessage(`${data.created_count || 0} venda(s) importada(s), ${data.ignored_count || 0} duplicada(s) ignorada(s).`);
  } catch (error) {
    const message = error.message || "Falha ao sincronizar Mercado Livre.";
    if (message.toLowerCase().includes("nenhuma conta mercado livre conectada")) {
      setMarketplaceView("integrations");
      showAppMessage(
        "Mercado Livre não conectado",
        "Conecte a conta Mercado Livre desta empresa em Integrações. Depois disso, os anúncios e vendas serão sincronizados apenas para este ambiente.",
        "error"
      );
    } else {
      showAppMessage("Sincronização Mercado Livre", `Não consegui sincronizar: ${message}`, "error");
    }
    await loadAndRenderMarketplaces();
  }
}

function connectAmazon() {
  if (!ensureCanAdmin()) return;
  window.location.href = "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/amazon/start";
}

async function syncAmazon() {
  if (!ensureCanAdmin()) return;
  try {
    const data = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/amazon-sync?action=sync");
    await loadRemoteData();
    await loadMarketplaces();
    render();
    flashActionMessage(`${data.listing_count || 0} anuncio(s) Amazon e ${data.created || 0} venda(s) importada(s).`);
  } catch (error) {
    alert(`Nao consegui sincronizar Amazon: ${error.message}`);
  }
}

async function showMarketplaceStats(itemId, marketplace = "Mercado Livre") {
  const content = byId("marketplaceStatsContent");
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    content.innerHTML = `<div class="empty-chart">As estatisticas da Shopee ficarao disponiveis assim que a conta for conectada.</div>`;
    byId("marketplaceStatsDialog").showModal();
    return;
  }
  content.innerHTML = `<div class="empty-chart">Carregando estatisticas...</div>`;
  byId("marketplaceStatsDialog").showModal();
  try {
    const data = await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=stats&item_id=${encodeURIComponent(itemId)}`);
    const stats = data.stats;
    content.innerHTML = `
      <div class="stats-grid">
        <article><span>Vendas efetuadas</span><strong>${Number(stats.sold_quantity || 0).toLocaleString("pt-BR")}</strong></article>
        <article><span>Visualizacoes</span><strong>${Number(stats.visits || 0).toLocaleString("pt-BR")}</strong></article>
        <article><span>Estoque disponivel</span><strong>${Number(stats.available_quantity || 0).toLocaleString("pt-BR")}</strong></article>
        <article><span>Preco</span><strong>${money.format(Number(stats.price || 0))}</strong></article>
        <article><span>Status</span><strong>${html(stats.status || "-")}</strong></article>
        <article><span>Saude do anuncio</span><strong>${stats.health == null ? "-" : `${Math.round(Number(stats.health) * 100)}%`}</strong></article>
      </div>
      <div class="listing-stats-detail">
        <strong>${html(stats.title || itemId)}</strong>
        <span>Criado em ${formatDateTime(stats.date_created)} • Atualizado em ${formatDateTime(stats.last_updated)}</span>
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<p class="form-error">${html(error.message)}</p>`;
  }
}

async function openMarketplaceEdit(itemId, marketplace = "Mercado Livre") {
  const channel = normalizeMarketplaceChannel(marketplace);
  if (channel === "shopee") {
    alert("A edicao de anuncios da Shopee sera liberada depois que a conta estiver conectada ao Shopee Open Platform.");
    return;
  }
  const listing = state.marketplaceListings.find((item) =>
    item.external_id === itemId && normalizeMarketplaceChannel(item.marketplace) === channel
  );
  if (!listing) return;
  const form = byId("marketplaceEditForm");
  form.elements.itemId.value = itemId;
  form.elements.marketplace.value = marketplace;
  form.elements.title.value = listing.title || "";
  form.elements.price.value = Number(listing.price || 0);
  form.elements.availableQuantity.value = Number(listing.raw_payload?.available_quantity || 0);
  form.elements.status.value = listing.status === "paused" ? "paused" : "active";
  byId("marketplaceEditMessage").textContent = "";
  byId("marketplaceEditDialog").showModal();
}

async function saveMarketplaceListing(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const itemId = String(data.get("itemId") || "");
  const marketplace = String(data.get("marketplace") || "Mercado Livre");
  const message = byId("marketplaceEditMessage");
  if (normalizeMarketplaceChannel(marketplace) !== "mercado-livre") {
    message.textContent = "Edicao indisponivel enquanto a Shopee nao estiver conectada.";
    return;
  }
  message.textContent = "Salvando no Mercado Livre...";
  try {
    await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=edit&item_id=${encodeURIComponent(itemId)}`, {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title"),
        price: number(data.get("price")),
        available_quantity: Number(data.get("availableQuantity") || 0),
        status: data.get("status")
      })
    });
    await loadMarketplaces();
    renderMarketplaces();
    byId("marketplaceEditDialog").close();
    flashActionMessage("Anuncio atualizado no Mercado Livre.");
  } catch (error) {
    message.textContent = error.message;
  }
}

async function saveResponsible(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const name = new FormData(event.currentTarget).get("name").trim();
  if (!name) return;
  const item = { id: nextResponsibleId(), name };
  if (state.supabase) await state.supabase.from("responsibles").upsert({ ...item, organization_id: state.organizationId });
  state.responsibles.push(item);
  event.currentTarget.reset();
  renderResponsibles();
  renderResponsibleOptions();
}

async function editResponsible(id) {
  const item = state.responsibles.find((row) => row.id === id);
  if (!item) return;
  const nextName = prompt("Novo nome do responsável:", item.name);
  if (!nextName?.trim()) return;
  item.name = nextName.trim();
  if (state.supabase) await state.supabase.from("responsibles").upsert({ ...item, organization_id: state.organizationId });
  renderResponsibles();
  renderResponsibleOptions();
}

async function deleteResponsible(id) {
  const item = state.responsibles.find((row) => row.id === id);
  if (!item || !confirm(`Excluir responsável ${item.name}?`)) return;
  if (state.supabase) await state.supabase.from("responsibles").delete().eq("id", id).eq("organization_id", state.organizationId);
  state.responsibles = state.responsibles.filter((row) => row.id !== id);
  renderResponsibles();
  renderResponsibleOptions();
}




async function saveOrder(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const existingId = form.get("id");
  const previous = state.data.orders.find((orderItem) => orderItem.id === existingId);
  const nextOrderId = existingId || nextId("ENC", state.data.orders);
  const item = {
    id: nextOrderId,
    orderCode: previous?.orderCode || nextOrderCode(),
    marketplaceOrderCode: form.get("marketplaceOrderCode").trim(),
    quantity: Math.max(Number(form.get("quantity") || 1), 1),
    client: form.get("client").trim(),
    description: form.get("description").trim(),
    material: form.get("material"),
    deliveryDate: form.get("deliveryDate"),
    status: normalizeOrderStatus(form.get("status")),
    charged: number(form.get("charged")),
    received: number(form.get("received")),
    notes: "",
    stlLink: form.get("stlLink").trim(),
    referenceImageUrl: form.get("referenceImageUrl").trim(),
    internalNotes: form.get("internalNotes").trim(),
    tags: mergeTags(
      mergeTags(previous?.tags || [], form.get("marketplaceTagToAdd")),
      form.get("customTagToAdd"),
    ),
    priority: form.get("priority"),
    productionStage: form.get("productionStage"),
    responsible: form.get("responsible"),
    quoteStage: form.get("quoteStage"),
    quoteUpdatedAt: previous?.quoteStage === form.get("quoteStage") ? previous?.quoteUpdatedAt || "" : new Date().toISOString(),
    source: previous?.source || "manual",
    leadId: previous?.leadId || "",
    checklist: previous?.checklist || defaultChecklist(),
    history: previous?.history || []
  };
  applyDeliveredPaymentDefault(item);
  const imageFile = state.pendingReferenceImageFile || event.currentTarget.elements.referenceImageFile.files?.[0];
  if (imageFile) item.referenceImageUrl = await uploadReferenceImage(imageFile, item.id);
  item.history = appendHistory(item.history, getOrderChanges(previous, item));

  const index = state.data.orders.findIndex((orderItem) => orderItem.id === item.id);
  if (index >= 0) {
    state.data.orders[index] = item;
  } else {
    state.data.orders.push(item);
  }
  await persist("orders", item);
  await syncOrderPaymentCash(item, previous);
  await ensureCustomTag(form.get("customTagToAdd"));
  await recordAudit(previous ? "update" : "create", "order", item.id, item.orderCode, previous || null, item, "manual");
  resetOrderForm();
  saveData();
  render();
}

function openOrderEditDialog(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item) return;
  const form = byId("orderEditDialogForm");
  form.elements.id.value = item.id;
  form.elements.description.value = item.description || "";
  form.elements.client.value = item.client || "";
  form.elements.marketplaceOrderCode.value = item.marketplaceOrderCode || "";
  form.elements.quantity.value = Number(item.quantity || 1);
  form.elements.material.value = item.material || "";
  form.elements.deliveryDate.value = item.deliveryDate || "";
  form.elements.charged.value = item.charged || "";
  form.elements.received.value = item.received || "";
  form.elements.priority.value = item.priority || "";
  form.elements.productionStage.innerHTML = PRODUCTION_STAGES.map((stage) => `<option ${stage === item.productionStage ? "selected" : ""}>${html(stage)}</option>`).join("");
  form.elements.responsible.innerHTML = `<option value="">Responsável</option>${getResponsibleNames().map((name) => `<option ${name === item.responsible ? "selected" : ""}>${html(name)}</option>`).join("")}`;
  form.elements.status.innerHTML = STATUS_OPTIONS.map((status) => `<option ${status === normalizeOrderStatus(item.status) ? "selected" : ""}>${html(status)}</option>`).join("");
  form.elements.stlLink.value = item.stlLink || "";
  form.elements.internalNotes.value = item.internalNotes || "";
  byId("orderEditDialogCode").textContent = getOrderCode(item);
  byId("orderEditDialog").showModal();
}

async function saveOrderFromDialog(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const item = state.data.orders.find((orderItem) => orderItem.id === form.get("id"));
  if (!item) return;
  const previous = structuredClone(item);
  Object.assign(item, {
    description: String(form.get("description") || "").trim(),
    client: String(form.get("client") || "").trim(),
    marketplaceOrderCode: String(form.get("marketplaceOrderCode") || "").trim(),
    quantity: Math.max(Number(form.get("quantity") || 1), 1),
    material: form.get("material") || "",
    deliveryDate: form.get("deliveryDate") || "",
    charged: number(form.get("charged")),
    received: number(form.get("received")),
    priority: form.get("priority") || "",
    productionStage: form.get("productionStage") || "Em fila",
    responsible: form.get("responsible") || "",
    status: normalizeOrderStatus(form.get("status")),
    stlLink: String(form.get("stlLink") || "").trim(),
    internalNotes: String(form.get("internalNotes") || "").trim()
  });
  applyDeliveredPaymentDefault(item);
  item.history = appendHistory(item.history || [], getOrderChanges(previous, item));
  await persist("orders", item);
  await syncOrderPaymentCash(item, previous);
  await recordAudit("update", "order", item.id, item.orderCode, previous, item, "manual");
  saveData();
  byId("orderEditDialog").close();
  render();
  flashActionMessage("Encomenda atualizada.");
}

function orderPaymentCashId(orderId) {
  return `ORDERPAY-${String(orderId || "").replace(/[^a-z0-9_-]/gi, "")}`;
}

function applyDeliveredPaymentDefault(item) {
  if (normalizeOrderStatus(item.status) === "Entregue" && Number(item.charged || 0) > 0 && Number(item.received || 0) <= 0) {
    item.received = Number(item.charged || 0);
  }
}

async function syncOrderPaymentCash(item, previous = null) {
  const cashId = orderPaymentCashId(item.id);
  const received = Number(item.received || 0);
  const existingIndex = state.data.cash.findIndex((entry) => entry.id === cashId);
  if (received <= 0) {
    if (existingIndex >= 0) {
      state.data.cash.splice(existingIndex, 1);
      await removeRemote("cash", cashId);
    }
    return;
  }
  const cashEntry = {
    id: cashId,
    date: new Date().toISOString().slice(0, 10),
    type: "Entrada",
    category: "Venda",
    description: `${getOrderCode(item)} - ${item.description || item.client || "Encomenda"}`,
    method: (item.tags || []).find((tag) => ["Mercado Livre", "Shopee", "Amazon", "Vitrine"].includes(tag)) || "Pedido",
    income: received,
    expense: 0
  };
  if (existingIndex >= 0) state.data.cash[existingIndex] = cashEntry;
  else state.data.cash.push(cashEntry);
  await persist("cash", cashEntry);
  if (previous && Number(previous.received || 0) !== received) {
    await recordAudit("payment_sync", "order", item.id, item.orderCode, { received: previous.received || 0 }, { received }, "manual");
  }
}

async function ensureCustomTag(value) {
  const name = String(value || "").trim();
  if (!name || state.customTags.some((tag) => tag.name.toLowerCase() === name.toLowerCase()) || !state.supabase) return;
  const { data, error } = await state.supabase.from("custom_tags").insert({
    name,
    color: "neutral",
    created_by: state.activeUserEmail || null,
  }).select("id,name,color").single();
  if (!error && data) {
    state.customTags.push(data);
    renderSettingsData();
  }
}

function startOrderEdit(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item) return;
  const form = byId("orderForm");
  form.elements.id.value = item.id;
  form.elements.description.value = item.description || "";
  form.elements.client.value = item.client || "";
  form.elements.marketplaceOrderCode.value = item.marketplaceOrderCode || "";
  form.elements.quantity.value = Number(item.quantity || 1);
  form.elements.material.value = item.material || "";
  form.elements.deliveryDate.value = item.deliveryDate || "";
  form.elements.charged.value = item.charged || "";
  form.elements.received.value = item.received || "";
  form.elements.priority.value = item.priority || "";
  form.elements.productionStage.value = item.productionStage || "";
  form.elements.responsible.value = item.responsible || "";
  form.elements.status.value = normalizeOrderStatus(item.status);
  form.elements.quoteStage.value = item.quoteStage || "";
  updateOrderFormStatusColor();
  form.elements.stlLink.value = item.stlLink || "";
  form.elements.referenceImageUrl.value = item.referenceImageUrl || "";
  form.elements.referenceImageFile.value = "";
  clearPendingReferenceImage(false);
  updateReferenceImagePreview(item.referenceImageUrl || "");
  form.elements.marketplaceTagToAdd.value = "";
  form.elements.customTagToAdd.value = "";
  form.elements.internalNotes.value = item.internalNotes || "";
  updateMarketplaceCodePlaceholder();
  state.editingOrderId = id;
  form.classList.add("editing");
  byId("orderSubmitBtn").textContent = "Atualizar encomenda";
  byId("cancelOrderEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.description.focus();
}

function cancelOrderEdit() {
  resetOrderForm();
}

function resetOrderForm() {
  const form = byId("orderForm");
  clearPendingReferenceImage(false);
  form.reset();
  form.elements.id.value = "";
  form.elements.quantity.value = 1;
  form.elements.quoteStage.value = "";
  updateReferenceImagePreview("");
  updateMarketplaceCodePlaceholder();
  updateOrderFormStatusColor();
  form.classList.remove("editing");
  state.editingOrderId = null;
  byId("orderSubmitBtn").textContent = "Salvar encomenda";
  byId("cancelOrderEditBtn").hidden = true;
}

function bindReferenceImageInput() {
  const zone = byId("referenceImageDropzone");
  const input = byId("orderForm").elements.referenceImageFile;
  if (!zone || !input) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) setPendingReferenceImage(file);
  });
  zone.addEventListener("click", (event) => {
    if (event.target.closest("#removePendingImageBtn") || event.target === input) return;
    input.click();
  });
  zone.addEventListener("keydown", (event) => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      input.click();
    }
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
    });
  });
  zone.addEventListener("drop", (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("image/"));
    if (!file) {
      flashActionMessage("Solte um arquivo de imagem.");
      return;
    }
    setPendingReferenceImage(file, "Imagem adicionada.");
  });
  byId("removePendingImageBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    clearPendingReferenceImage();
    byId("orderForm").elements.referenceImageUrl.value = "";
    updateReferenceImagePreview("");
  });
}

function setPendingReferenceImage(file, message = "") {
  try {
    validateReferenceImage(file);
  } catch (error) {
    alert(error.message);
    return;
  }
  clearPendingReferenceImage();
  state.pendingReferenceImageFile = file;
  state.pendingReferenceImagePreviewUrl = URL.createObjectURL(file);
  updateReferenceImagePreview(state.pendingReferenceImagePreviewUrl);
  if (message) flashActionMessage(message);
}

function clearPendingReferenceImage(updatePreview = true) {
  if (state.pendingReferenceImagePreviewUrl) URL.revokeObjectURL(state.pendingReferenceImagePreviewUrl);
  state.pendingReferenceImageFile = null;
  state.pendingReferenceImagePreviewUrl = "";
  const input = byId("orderForm")?.elements.referenceImageFile;
  if (input) input.value = "";
  if (updatePreview) {
    const existingUrl = byId("orderForm")?.elements.referenceImageUrl?.value || "";
    updateReferenceImagePreview(existingUrl);
  }
}

function updateReferenceImagePreview(url) {
  const preview = byId("referenceImagePreview");
  const empty = byId("referenceImageEmpty");
  const image = byId("referenceImagePreviewImg");
  if (!preview || !empty || !image) return;
  const hasImage = Boolean(url);
  preview.hidden = !hasImage;
  empty.hidden = hasImage;
  image.src = hasImage ? url : "";
}

function validateReferenceImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Envie um arquivo de imagem.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter até 5 MB.");
}

async function saveCash(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const type = form.get("type");
  const amount = number(form.get("amount"));
  const existingId = form.get("id");
  const item = {
    id: existingId || nextId("CX", state.data.cash),
    date: form.get("date"),
    type,
    category: form.get("category").trim(),
    description: form.get("description").trim(),
    method: form.get("method").trim(),
    income: type === "Entrada" ? amount : 0,
    expense: type === "Saída" ? amount : 0
  };
  const index = state.data.cash.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    state.data.cash[index] = item;
  } else {
    state.data.cash.push(item);
  }
  await persist("cash", item);
  resetCashForm();
  saveData();
  render();
}

function startCashEdit(id) {
  const item = state.data.cash.find((entry) => entry.id === id);
  if (!item) return;
  const form = byId("cashForm");
  form.elements.id.value = item.id;
  form.elements.date.value = item.date || "";
  form.elements.type.value = item.type || "Entrada";
  form.elements.category.value = item.category || "";
  form.elements.description.value = item.description || "";
  form.elements.amount.value = item.type === "Saída" ? item.expense || "" : item.income || "";
  form.elements.method.value = item.method || "";
  state.editingCashId = id;
  form.classList.add("editing");
  byId("cashSubmitBtn").textContent = "Atualizar lançamento";
  byId("cancelCashEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.date.focus();
}

function cancelCashEdit() {
  resetCashForm();
}

function resetCashForm() {
  const form = byId("cashForm");
  form.reset();
  form.elements.id.value = "";
  form.classList.remove("editing");
  state.editingCashId = null;
  byId("cashSubmitBtn").textContent = "Salvar lançamento";
  byId("cancelCashEditBtn").hidden = true;
}

async function saveMaterial(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const existingId = form.get("id");
  const item = {
    id: existingId || nextId("MAT", state.data.materials),
    date: form.get("date"),
    supplier: form.get("supplier").trim(),
    type: form.get("type"),
    spec: form.get("spec").trim(),
    quantity: number(form.get("quantity")),
    unitCost: number(form.get("unitCost"))
  };
  const index = state.data.materials.findIndex((material) => material.id === item.id);
  if (index >= 0) {
    state.data.materials[index] = item;
  } else {
    state.data.materials.push(item);
  }
  await persist("materials", item);
  const cashEntry = materialToCashEntry(item);
  const cashIndex = state.data.cash.findIndex((entry) => entry.id === cashEntry.id);
  if (cashIndex >= 0) {
    state.data.cash[cashIndex] = cashEntry;
  } else {
    state.data.cash.push(cashEntry);
  }
  await persist("cash", cashEntry);
  resetMaterialForm();
  saveData();
  render();
}

function startMaterialEdit(id) {
  const item = state.data.materials.find((material) => material.id === id);
  if (!item) return;
  const form = byId("materialForm");
  form.elements.id.value = item.id;
  form.elements.date.value = item.date || "";
  form.elements.supplier.value = item.supplier || "";
  form.elements.type.value = item.type || "Resina";
  form.elements.spec.value = item.spec || "";
  form.elements.quantity.value = item.quantity || "";
  form.elements.unitCost.value = item.unitCost || "";
  state.editingMaterialId = id;
  form.classList.add("editing");
  byId("materialSubmitBtn").textContent = "Atualizar material";
  byId("cancelMaterialEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.supplier.focus();
}

function cancelMaterialEdit() {
  resetMaterialForm();
}

function resetMaterialForm() {
  const form = byId("materialForm");
  form.reset();
  form.elements.id.value = "";
  form.classList.remove("editing");
  state.editingMaterialId = null;
  byId("materialSubmitBtn").textContent = "Salvar material";
  byId("cancelMaterialEditBtn").hidden = true;
}

async function saveInventoryItem(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const payload = {
    organization_id: state.organizationId,
    name: String(values.name || "").trim(),
    category: String(values.category || "Insumo").trim(),
    unit: String(values.unit || "un.").trim(),
    quantity: number(values.quantity),
    minimum_quantity: number(values.minimum_quantity),
    unit_cost: number(values.unit_cost),
    supplier: String(values.supplier || "").trim() || null,
    notes: String(values.notes || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  let query = state.supabase.from("inventory_items");
  const response = values.id ?
     await query.update(payload).eq("id", values.id).select().single()
    : await query.insert(payload).select().single();
  if (response.error) {
    showAppMessage("Não foi possível salvar o insumo", response.error.message, "error");
    return;
  }
  const index = state.inventoryItems.findIndex((item) => item.id === response.data.id);
  if (index >= 0) state.inventoryItems[index] = response.data;
  else state.inventoryItems.push(response.data);
  resetInventoryForm();
  renderInventory();
  await ensureOperationalNotifications();
}

function startInventoryEdit(id) {
  const item = state.inventoryItems.find((entry) => entry.id === id);
  if (!item) return;
  const form = byId("inventoryForm");
  for (const field of ["id", "name", "category", "unit", "quantity", "minimum_quantity", "unit_cost", "supplier", "notes"]) {
    if (form.elements[field]) form.elements[field].value = item[field] ?? "";
  }
  state.editingInventoryId = id;
  byId("inventorySubmitBtn").textContent = "Atualizar insumo";
  byId("cancelInventoryEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetInventoryForm() {
  const form = byId("inventoryForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.category.value = "Insumo";
  form.elements.unit.value = "un.";
  state.editingInventoryId = null;
  byId("inventorySubmitBtn").textContent = "Salvar insumo";
  byId("cancelInventoryEditBtn").hidden = true;
}

function materialToCashEntry(item) {
  const total = Number(item.quantity || 0) * Number(item.unitCost || 0);
  return {
    id: materialCashId(item.id),
    date: item.date,
    type: "Saída",
    category: "Compra de material",
    description: `${item.id} - ${item.type} - ${item.spec || item.supplier}`,
    method: "",
    income: 0,
    expense: total
  };
}

function materialCashId(materialId) {
  return `CX-${materialId}`;
}




function subscriptionFallbackFromOrganization(organization) {
  if (!organization?.plan_code) return null;
  const now = new Date().toISOString();
  return {
    organization_id: organization.id,
    plan_code: organization.plan_code,
    status: organization.status === "trial" ? "trial" : organization.status === "active" ? "active" : organization.status || "active",
    provider: "manual",
    trial_start: null,
    trial_end: organization.trial_ends_at || null,
    current_period_start: now,
    current_period_end: organization.trial_ends_at || null,
    next_payment_at: null,
    provider_subscription_id: null,
    metadata: { source: "organization_fallback" },
  };
}









function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "3d-aft-dados.json";
  link.click();
  URL.revokeObjectURL(link.href);
  recordAudit("export", "system", "json", "", null, { orders: state.data.orders.length }, "manual");
}

async function importFile(event) {
  if (!ensureCanEdit()) {
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;
  let imported = false;
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      await importJson(await file.text());
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      await importRows(parseCsv(await file.text()));
    } else if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      await importRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
    } else {
      alert("Formato não suportado. Use JSON, CSV ou XLSX.");
      return;
    }
    saveData();
    render();
    imported = true;
    alert("Importação concluída.");
  } catch (error) {
    alert(`Não foi possível importar: ${error.message}`);
  } finally {
    if (imported) await recordAudit("import", "system", file.name, "", null, { file: file.name, size: file.size }, "manual");
    event.target.value = "";
  }
}

async function uploadReferenceImage(file, orderId) {
  if (!state.supabase) throw new Error("Upload de imagem precisa do Supabase online.");
  validateReferenceImage(file);
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await state.supabase.storage
    .from("order-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });
  if (error) {
    throw new Error(`Não consegui enviar a imagem. Rode o SQL atualizado para criar o bucket order-images. Detalhe: ${error.message}`);
  }
  const { data } = state.supabase.storage.from("order-images").getPublicUrl(path);
  return data.publicUrl;
}

async function importJson(text) {
  const parsed = JSON.parse(text);
  const incoming = {
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    cash: Array.isArray(parsed.cash) ? parsed.cash : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials : []
  };
  await importCollection("orders", incoming.orders);
  await importCollection("cash", incoming.cash);
  await importCollection("materials", incoming.materials);
}

async function importCollection(kind, rows) {
  for (const row of rows) {
    const item = normalizeImportedItem(kind, row);
    upsertLocal(kind, item);
    await persist(kind, item);
  }
}

async function importRows(rows) {
  const orders = rows.map((row) => normalizeImportedOrder(row)).filter(Boolean);
  if (!orders.length) throw new Error("Não encontrei colunas de encomenda no arquivo.");
  await importCollection("orders", orders);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function splitCsvLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((item) => item.replace(/^"|"$/g, "").trim());
}

function normalizeImportedOrder(row) {
  const description = pick(row, ["description", "pedido", "encomenda", "produto", "item"]);
  if (!description) return null;
  const marketplaceTag = normalizeMarketplaceTag(pick(row, ["marketplace", "canal", "origem"]));
  return {
    id: pick(row, ["id"]) || nextId("ENC", state.data.orders),
    orderCode: pick(row, ["orderCode", "codigo", "código", "pedido interno"]) || nextOrderCode(),
    marketplaceOrderCode: pick(row, ["marketplaceOrderCode", "codigo marketplace", "código marketplace", "codigo mercado livre", "código mercado livre", "pedido mercado livre", "codigo ml", "código ml", "ml", "codigo shopee", "código shopee", "pedido shopee"]) || "",
    client: pick(row, ["client", "cliente", "comprador"]) || "",
    description,
    material: pick(row, ["material"]) || "",
    deliveryDate: normalizeDate(pick(row, ["deliveryDate", "delivery_date", "entrega", "data entrega", "data_de_entrega"])),
    status: normalizeOrderStatus(pick(row, ["status", "situacao", "situação"]) || "A preparar"),
    charged: number(pick(row, ["charged", "valor", "preco", "preço"])),
    received: number(pick(row, ["received", "recebido", "pago"])),
    notes: pick(row, ["notes", "observacoes", "observações"]) || "",
    stlLink: pick(row, ["stlLink", "stl", "link stl", "link", "origem"]) || "",
    referenceImageUrl: pick(row, ["referenceImageUrl", "imagem", "foto", "referencia", "referência"]) || "",
    internalNotes: pick(row, ["internalNotes", "notas internas", "nota interna"]) || "",
    tags: mergeTags(parseTags(pick(row, ["tags", "etiquetas"])), marketplaceTag),
    priority: pick(row, ["priority", "prioridade"]) || "",
    productionStage: pick(row, ["productionStage", "etapa"]) || "",
    responsible: pick(row, ["responsible", "responsavel", "responsável"]) || "",
    checklist: defaultChecklist(),
    history: []
  };
}

function normalizeMarketplaceTag(value) {
  const text = normalizeText(value);
  if (text.includes("shopee")) return "Shopee";
  if (text.includes("mercado livre") || text === "ml" || text.includes("mercadolivre")) return "Mercado Livre";
  return "";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeImportedItem(kind, row) {
  if (kind === "orders") return normalizeImportedOrder(row) || order(row.id || nextId("ENC", state.data.orders), row.description || "Importado", row.material || "", row.deliveryDate || "", row.charged || 0, row.received || 0, normalizeOrderStatus(row.status || "A preparar"), row.notes || "");
  if (kind === "cash") return {
    id: row.id || nextId("CX", state.data.cash),
    date: normalizeDate(row.date) || today(),
    type: row.type || "Entrada",
    category: row.category || "Importado",
    description: row.description || "Importado",
    method: row.method || "",
    income: Number(row.income || 0),
    expense: Number(row.expense || 0)
  };
  return {
    id: row.id || nextId("MAT", state.data.materials),
    date: normalizeDate(row.date) || today(),
    supplier: row.supplier || "Importado",
    type: row.type || "Material",
    spec: row.spec || "",
    quantity: Number(row.quantity || 0),
    unitCost: Number(row.unitCost || row.unit_cost || 0)
  };
}

function upsertLocal(kind, item) {
  const key = kind === "cash" ? "cash" : kind;
  const index = state.data[key].findIndex((row) => row.id === item.id);
  if (index >= 0) state.data[key][index] = item;
  else state.data[key].push(item);
}

function pick(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const found = entries.find(([name]) => normalizeKey(name) === normalizeKey(key));
    if (found && String(found[1]).trim()) return String(found[1]).trim();
  }
  return "";
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return "";
}

function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de XLSX."));
    document.head.appendChild(script);
  });
}


function filterCash(rows) {
  if (state.filters.cashType === "all") return rows;
  return rows.filter((item) => item.type === state.filters.cashType);
}

function filterOrders(rows, options = {}) {
  return rows.filter((item) => {
    const materialMatch = state.filters.orderMaterial === "all" || (item.material || "") === state.filters.orderMaterial;
    const statusMatch = state.filters.orderStatus === "all" || normalizeOrderStatus(item.status) === state.filters.orderStatus;
    const marketplaceMatch = state.filters.orderMarketplace === "all"
      || getOrderMarketplaceChannel(item) === state.filters.orderMarketplace;
    const focusMatch = state.filters.orderFocus === "all" || matchesOrderFocus(item, state.filters.orderFocus);
    const quoteMatch = options.ignoreQuote || state.filters.orderQuote === "all"
      || (state.filters.orderQuote === "quotes" ? Boolean(item.quoteStage) : item.quoteStage === state.filters.orderQuote);
    return materialMatch && statusMatch && marketplaceMatch && focusMatch && quoteMatch;
  });
}

function getOrderMarketplaceChannel(item) {
  const tags = item?.tags || [];
  if (tags.includes("Mercado Livre")) return "mercado-livre";
  if (tags.includes("Shopee")) return "shopee";
  if (tags.includes("Amazon")) return "amazon";
  return "direct";
}

function matchesOrderFocus(item, focus) {
  const priority = getOrderPriority(item).key;
  if (focus === "urgent") return ["urgent", "high"].includes(priority);
  if (focus === "soon") return priority === "soon";
  if (focus === "late") return priority === "late";
  if (focus === "noDate") return item.status !== "Entregue" && !item.deliveryDate;
  if (focus === "noValue") return item.status !== "Entregue" && !Number(item.charged || 0);
  return true;
}

function sortOrders(rows) {
  const sorted = [...rows];
  if (state.filters.orderSort === "delivery") {
    return sorted.sort((a, b) => (a.deliveryDate || "9999-99-99").localeCompare(b.deliveryDate || "9999-99-99"));
  }
  if (state.filters.orderSort === "value") {
    return sorted.sort((a, b) => Number(b.charged || 0) - Number(a.charged || 0));
  }
  if (state.filters.orderSort === "material") {
    return sorted.sort((a, b) => `${a.material || "zzz"} ${a.description}`.localeCompare(`${b.material || "zzz"} ${b.description}`));
  }
  return sorted.sort((a, b) => (a.description || "").localeCompare(b.description || "", "pt-BR"));
}

function filterMaterials(rows) {
  return rows.filter((item) => {
    const text = `${item.type || ""} ${item.spec || ""} ${item.supplier || ""}`.toLowerCase();
    return (state.filters.materialType === "all" || item.type === state.filters.materialType)
      && (!state.filters.materialSearch || text.includes(state.filters.materialSearch))
      && (!state.filters.materialSupplier || String(item.supplier || "").toLowerCase().includes(state.filters.materialSupplier))
      && (!state.filters.materialDateFrom || String(item.date || "") >= state.filters.materialDateFrom)
      && (!state.filters.materialDateTo || String(item.date || "") <= state.filters.materialDateTo);
  });
}

function sortMaterials(rows) {
  const sorted = [...rows];
  if (state.filters.materialSort === "supplier") {
    return sorted.sort((a, b) => (a.supplier || "").localeCompare(b.supplier || "", "pt-BR"));
  }
  if (state.filters.materialSort === "type") {
    return sorted.sort((a, b) => `${a.type || ""} ${a.spec || ""}`.localeCompare(`${b.type || ""} ${b.spec || ""}`, "pt-BR"));
  }
  if (state.filters.materialSort === "total") {
    return sorted.sort((a, b) => (Number(b.quantity || 0) * Number(b.unitCost || 0)) - (Number(a.quantity || 0) * Number(a.unitCost || 0)));
  }
  return sorted.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}


function renderReports() {
  const content = byId("reportsContent");
  if (!content) return;
  const rows = getReportRows();
  const financial = getReportFinancial(rows.cash, rows.orders);
  const totalOrders = rows.orders.length;
  const ticket = totalOrders ? financial.revenue / totalOrders : 0;
  const marketplaceItems = reportMarketplaceRows([], rows.sales);
  const materialItems = countBy(rows.orders, (item) => item.material || "Não informado").slice(0, 6);
  const dailyRows = reportDailyRows(rows.cash, rows.orders);
  const statusRows = countBy(rows.orders, (item) => item.status || "Sem status");
  const tableRows = dailyRows.slice(-8).reverse();
  if (state.reportTab !== "overview") {
    renderReportTabContent(content, state.reportTab, rows, financial, dailyRows);
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lateReportOrders = rows.orders.filter((item) =>
    item.deliveryDate && item.status !== "Entregue" && new Date(`${item.deliveryDate}T00:00:00`) < today
  ).length;
  content.innerHTML = `
    <div class="report-kpi-grid">
      ${reportKpi("Receita líquida", money.format(financial.revenue), "+18% vs período anterior", "teal")}
      ${reportKpi("Custos", money.format(financial.costs), "-8% vs período anterior", "red")}
      ${reportKpi("Lucro líquido", money.format(financial.profit), "+24% vs período anterior", "blue")}
      ${reportKpi("Ticket médio", money.format(ticket), "+12% vs período anterior", "purple")}
      ${reportKpi("A receber", money.format(financial.receivable), `${rows.orders.filter((item) => Number(item.charged || 0) > Number(item.received || 0)).length} títulos pendentes`, "amber")}
      ${reportKpi("Pedidos", totalOrders, "+10% vs período anterior", "green")}
    </div>
    <div class="report-main-grid">
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Receita por dia</h3><span>Linha</span></div>
        <div id="reportRevenueLine" class="line-chart-container"></div>
      </section>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Entradas x Saídas</h3><span>Saldo diário</span></div>
        <div id="reportCashLine" class="line-chart-container"></div>
      </section>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Receita por marketplace</h3></div>
        ${renderDonutChart(marketplaceItems, Math.max(marketplaceItems.reduce((total, item) => total + Number(item.value || 0), 0), 1))}
      </section>
      <section class="panel report-table-card">
        <div class="panel-head">
          <h3>Resumo financeiro</h3>
          <div class="panel-head-actions">
            <button class="secondary-btn" type="button" data-report-export="csv">Exportar CSV</button>
            <button class="secondary-btn" type="button" data-report-export="xlsx">Exportar Excel</button>
            <button class="secondary-btn" type="button" data-report-export="pdf">Exportar PDF</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Data</th><th>Itens</th><th>Entradas</th><th>Saídas</th><th>Lucro</th><th>Pedidos</th><th>Ticket médio</th></tr></thead>
          <tbody>${tableRows.map((item) => `<tr><td>${html(formatReportGroupLabel(item.date))}</td><td>${html(item.items || "-")}</td><td>${money.format(item.income)}</td><td>${money.format(item.expense)}</td><td>${money.format(item.income - item.expense)}</td><td>${item.orders}</td><td>${money.format(item.orders ? item.income / item.orders : 0)}</td></tr>`).join("") || `<tr><td colspan="7">Nenhum dado no período.</td></tr>`}</tbody>
        </table>
      </section>
      <aside class="panel report-insights">
        <h3>Insights do período</h3>
        ${renderReportInsight("↗", `Sua receita acumulada foi de ${money.format(financial.revenue)}.`)}
          ${renderReportInsight("◎", marketplaceItems[0] ? `${marketplaceItems[0].label} foi o principal marketplace no período.` : "Nenhuma venda de marketplace no período.")}
        ${renderReportInsight("●", `Você possui ${rows.leads.length} lead${rows.leads.length === 1 ? "" : "s"} no período.`)}
        ${renderReportInsight("!", `${lateReportOrders} pedido(s) atrasado(s).`)}
      </aside>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Pedidos por status</h3></div>
        ${renderDonutChart(statusRows, Math.max(totalOrders, 1), "Pedidos")}
      </section>
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>Pedidos por material</h3></div>
        ${renderDonutChart(materialItems, Math.max(totalOrders, 1), "Materiais")}
      </section>
    </div>
  `;
  content.querySelectorAll("[data-report-export]").forEach((button) => {
    button.addEventListener("click", () => exportReport(button.dataset.reportExport, tableRows));
  });
  renderLineChart("reportRevenueLine", dailyRows.map((item) => ({ label: formatReportGroupLabel(item.date, true), value: item.income })), { valueLabel: "Receita" });
  renderLineChart("reportCashLine", dailyRows.map((item) => ({ label: formatReportGroupLabel(item.date, true), value: item.income - item.expense })), { valueLabel: "Saldo" });
}


function renderReportTabContent(content, tab, rows, financial, dailyRows) {
  const definitions = {
    financial: {
      title: "Financeiro",
      kpis: [
        ["Receita", money.format(financial.revenue), "Valores recebidos no período", "teal"],
        ["Custos", money.format(financial.costs), "Saídas registradas", "red"],
        ["Lucro", money.format(financial.profit), "Receita menos custos", "blue"],
        ["A receber", money.format(financial.receivable), "Valores ainda pendentes", "amber"],
      ],
      chartTitle: "Resultado financeiro",
      chartRows: dailyRows.map((item) => ({ label: formatReportGroupLabel(item.date, true), value: item.income - item.expense })),
      headers: ["Data", "Itens", "Entradas", "Saídas", "Resultado"],
      body: dailyRows.slice().reverse().map((item) => [
        formatReportGroupLabel(item.date), item.items || "-", money.format(item.income), money.format(item.expense), money.format(item.income - item.expense),
      ]),
    },
    production: {
      title: "Produção",
      kpis: [
        ["Em produção", rows.orders.filter((item) => item.status !== "Entregue" && !item.quoteStage).length, "Pedidos ativos", "teal"],
        ["Concluídos", rows.orders.filter((item) => item.status === "Entregue").length, "Entregues no período", "green"],
        ["Atrasados", reportLateOrders(rows.orders).length, "Exigem atenção", "red"],
        ["Sem responsável", rows.orders.filter((item) => !item.responsible).length, "Aguardando atribuição", "amber"],
      ],
      chartTitle: "Pedidos por etapa",
      chartRows: countBy(rows.orders, (item) => item.productionStage || item.stage || "Em fila"),
      headers: ["Pedido", "Item", "Etapa", "Status", "Responsável", "Entrega"],
      body: rows.orders.map((item) => [
        getOrderCode(item), item.description || "-", item.productionStage || item.stage || "Em fila", item.status || "-", item.responsible || "-", item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data",
      ]),
    },
    commercial: {
      title: "Comercial",
      kpis: [
        ["Leads", rows.leads.length, "Criados no período", "teal"],
        ["Pedidos", rows.orders.length, "Encomendas registradas", "blue"],
        ["Clientes", new Set(rows.orders.map((item) => item.client).filter(Boolean)).size, "Clientes com pedidos", "purple"],
        ["Ticket médio", money.format(rows.orders.length ? financial.revenue / rows.orders.length : 0), "Receita por pedido", "green"],
      ],
      chartTitle: "Leads por status",
      chartRows: countBy(rows.leads, (item) => item.status || "Novo"),
      headers: ["Nome", "E-mail", "WhatsApp", "Status", "Origem", "Último contato"],
      body: rows.leads.map((item) => [
        item.name || "-", item.email || "-", item.whatsapp || item.phone || "-", item.status || "Novo", item.origin || item.source || "-", item.last_contact_at ? formatDateTime(item.last_contact_at) : "-",
      ]),
    },
    marketplaces: {
      title: "Marketplaces",
      kpis: [
        ["Vendas importadas", rows.sales.length, "No período selecionado", "teal"],
        ["Receita", money.format(reportMarketplaceRows([], rows.sales).reduce((sumValue, item) => sumValue + Number(item.value || 0), 0)), "Somente vendas importadas", "green"],
        ["Mercado Livre", rows.sales.filter((item) => normalizeMarketplaceChannel(item.marketplace) === "mercado_livre").length, "Vendas importadas", "blue"],
        ["Outros marketplaces", rows.sales.filter((item) => normalizeMarketplaceChannel(item.marketplace) !== "mercado_livre").length, "Shopee, Amazon e futuros canais", "amber"],
      ],
      chartTitle: "Receita por marketplace",
      chartRows: reportMarketplaceRows([], rows.sales),
      headers: ["Canal", "Código", "Item", "Valor", "Data", "Status"],
      body: rows.sales.map((item) => [
        item.marketplace || "-", item.external_order_id || item.order_id || "-", item.title || item.item_title || item.description || "-", money.format(Number(item.total || item.amount || 0)), item.date || item.created_at ? formatDate(item.date || item.created_at) : "-", item.status || "-",
      ]),
    },
    products: reportProductDefinition(rows),
    materials: reportMaterialDefinition(rows),
    clients: reportClientDefinition(rows),
    stock: reportStockDefinition(),
  };
  const definition = definitions[tab] || definitions.financial;
  const limitedBody = definition.body.slice(0, 100);
  content.innerHTML = `
    <div class="report-section-heading"><div><p class="eyebrow">Relatórios</p><h2>${html(definition.title)}</h2></div><span>${html(reportPeriodLabel())}</span></div>
    <div class="report-kpi-grid report-kpi-grid-compact">
      ${definition.kpis.map((item) => reportKpi(item[0], item[1], item[2], item[3])).join("")}
    </div>
    <div class="report-main-grid report-tab-grid">
      <section class="panel report-chart-card">
        <div class="panel-head"><h3>${html(definition.chartTitle)}</h3><span>${html(reportGroupLabel())}</span></div>
        <div id="reportTabChart" class="line-chart-container"></div>
      </section>
      <section class="panel report-table-card report-tab-table">
        <div class="panel-head">
          <h3>Detalhamento</h3>
          <div class="panel-head-actions">
            <button class="secondary-btn" type="button" data-report-tab-export="csv">Exportar CSV</button>
            <button class="secondary-btn" type="button" data-report-tab-export="xlsx">Exportar Excel</button>
            <button class="secondary-btn" type="button" data-report-tab-export="pdf">Exportar PDF</button>
          </div>
        </div>
        <div class="table-scroll"><table><thead><tr>${definition.headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead>
        <tbody>${limitedBody.length ? limitedBody.map((row) => `<tr>${row.map((cell) => `<td>${html(String(cell ?? "-"))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${definition.headers.length}">Nenhum dado no período selecionado.</td></tr>`}</tbody></table></div>
      </section>
    </div>`;
  content.querySelectorAll("[data-report-tab-export]").forEach((button) => {
    button.addEventListener("click", () => exportReportTable(button.dataset.reportTabExport, definition.headers, definition.body));
  });
  renderLineChart("reportTabChart", definition.chartRows.map((item) => ({
    label: item.label,
    value: Number(item.value || 0),
  })), { valueLabel: definition.chartTitle, format: (value) => Number(value).toLocaleString("pt-BR") });
}

function reportProductDefinition(rows) {
  const datedIds = new Set(rows.orders.map((item) => item.id));
  const legacyOrders = state.data.orders.filter((item) =>
    !datedIds.has(item.id)
    && !item.createdAt
    && !item.created_at
    && !item.deliveryDate
    && (item.status === "Entregue" || Number(item.received || 0) > 0)
  );
  const soldOrders = [...rows.orders, ...legacyOrders].filter((item) =>
    item.status === "Entregue" || Number(item.received || 0) > 0
  );
  const products = aggregateReportRows(soldOrders, (item) => item.description || "Sem nome", (item) => ({
    quantity: Number(item.quantity || 1),
    revenue: Number(item.received || item.charged || 0),
  }));
  return {
    title: "Produtos",
    kpis: [
      ["Produtos vendidos", products.length, legacyOrders.length ? `${legacyOrders.length} registro(s) legado(s) sem data incluído(s)` : "Itens diferentes", "teal"],
      ["Unidades", products.reduce((sumValue, item) => sumValue + item.quantity, 0), "Quantidade total", "blue"],
      ["Receita", money.format(products.reduce((sumValue, item) => sumValue + item.revenue, 0)), "Receita dos produtos", "green"],
      ["Mais vendido", products[0]?.label || "-", products[0] ? `${products[0].quantity} unidade(s)` : "Sem vendas", "purple"],
    ],
    chartTitle: "Produtos mais vendidos",
    chartRows: products.slice(0, 12).map((item) => ({ label: item.label, value: item.quantity })),
    headers: ["Produto", "Quantidade", "Receita"],
    body: products.map((item) => [item.label, item.quantity, money.format(item.revenue)]),
  };
}

function reportMaterialDefinition(rows) {
  const materials = aggregateReportRows(rows.materials, (item) => item.type || "Não informado", (item) => ({
    quantity: Number(item.quantity || 0),
    revenue: Number(item.quantity || 0) * Number(item.unitCost || 0),
  }));
  const totalSpent = materials.reduce((sumValue, item) => sumValue + item.revenue, 0);
  const suppliers = new Set(rows.materials.map((item) => item.supplier).filter(Boolean));
  return {
    title: "Materiais",
    kpis: [
      ["Compras", rows.materials.length, "Registros no período", "teal"],
      ["Valor investido", money.format(totalSpent), "Compras de materiais", "red"],
      ["Fornecedores", suppliers.size, "Fornecedores diferentes", "blue"],
      ["Maior investimento", materials.slice().sort((a, b) => b.revenue - a.revenue)[0]?.label || "-", "Por tipo de material", "purple"],
    ],
    chartTitle: "Investimento por material",
    chartRows: materials.map((item) => ({ label: item.label, value: item.revenue })),
    headers: ["Data", "Material", "Especificação", "Fornecedor", "Quantidade", "Custo unitário", "Total"],
    body: rows.materials.map((item) => [
      item.date ? formatDate(item.date) : "-",
      item.type || "-",
      item.spec || "-",
      item.supplier || "-",
      Number(item.quantity || 0).toLocaleString("pt-BR"),
      money.format(Number(item.unitCost || 0)),
      money.format(Number(item.quantity || 0) * Number(item.unitCost || 0)),
    ]),
  };
}

function reportClientDefinition(rows) {
  const clients = aggregateReportRows(rows.orders.filter((item) => item.client), (item) => item.client, (item) => ({
    quantity: 1,
    revenue: Number(item.received || item.charged || 0),
  }));
  return {
    title: "Clientes",
    kpis: [
      ["Clientes", clients.length, "Com pedidos no período", "teal"],
      ["Novos leads", rows.leads.length, "Leads capturados", "blue"],
      ["Receita", money.format(clients.reduce((sumValue, item) => sumValue + item.revenue, 0)), "Receita por clientes", "green"],
      ["Maior cliente", clients.sort((a, b) => b.revenue - a.revenue)[0]?.label || "-", "Por receita", "purple"],
    ],
    chartTitle: "Pedidos por cliente",
    chartRows: clients.slice().sort((a, b) => b.quantity - a.quantity).slice(0, 12).map((item) => ({ label: item.label, value: item.quantity })),
    headers: ["Cliente", "Pedidos", "Receita"],
    body: clients.map((item) => [item.label, item.quantity, money.format(item.revenue)]),
  };
}

function reportStockDefinition() {
  const stock = state.inventoryItems.map((item) => ({
    label: item.name || item.description || item.material || "Insumo",
    quantity: Number(item.quantity || 0),
    minimum: Number(item.minimum_quantity || item.minimum || 0),
    unit: item.unit || "un.",
  }));
  const low = stock.filter((item) => item.quantity <= item.minimum);
  return {
    title: "Estoque",
    kpis: [
      ["Itens cadastrados", stock.length, "Insumos monitorados", "teal"],
      ["Estoque baixo", low.length, "Itens abaixo do mínimo", "red"],
      ["Quantidade total", stock.reduce((sumValue, item) => sumValue + item.quantity, 0), "Todas as unidades", "blue"],
      ["Em situação normal", stock.length - low.length, "Itens com saldo suficiente", "green"],
    ],
    chartTitle: "Saldo em estoque",
    chartRows: stock.slice(0, 15).map((item) => ({ label: item.label, value: item.quantity })),
    headers: ["Item", "Quantidade", "Mínimo", "Unidade", "Situação"],
    body: stock.map((item) => [item.label, item.quantity, item.minimum, item.unit, item.quantity <= item.minimum ? "Estoque baixo" : "Normal"]),
  };
}

function aggregateReportRows(rows, labelGetter, valuesGetter) {
  const map = new Map();
  rows.forEach((item) => {
    const label = labelGetter(item);
    const values = valuesGetter(item);
    const current = map.get(label) || { label, quantity: 0, revenue: 0 };
    current.quantity += Number(values.quantity || 0);
    current.revenue += Number(values.revenue || 0);
    map.set(label, current);
  });
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

function reportLateOrders(orders) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return orders.filter((item) => item.deliveryDate && item.status !== "Entregue" && new Date(`${item.deliveryDate}T00:00:00`) < today);
}

function reportTabLabel(tab) {
  return ({
    overview: "Visão geral", financial: "Financeiro", production: "Produção", commercial: "Comercial",
    marketplaces: "Marketplaces", products: "Produtos", materials: "Materiais", clients: "Clientes", stock: "Estoque",
  })[tab] || "Relatório";
}

function reportPeriodLabel() {
  return state.reportPeriod === "all" ? "Todo o período" : `Últimos ${state.reportPeriod} dias`;
}

function reportGroupLabel() {
  return ({ day: "Por dia", week: "Por semana", month: "Por mês" })[state.reportGroup] || "Por dia";
}

function exportReportTable(format, headers, body) {
  if (format === "pdf") {
    openReportPrintView(headers, body);
    return;
  }
  if (format === "xlsx") {
    const table = `<table><thead><tr>${headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${html(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadTextFile(table, `flowops-${state.reportTab}-${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8");
    return;
  }
  const csv = [headers, ...body].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
  downloadTextFile(csv, `flowops-${state.reportTab}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

function exportReport(format, rows) {
  const headers = ["Data", "Itens", "Entradas", "Saídas", "Lucro", "Pedidos", "Ticket médio"];
  const body = rows.map((item) => [
    formatReportGroupLabel(item.date),
    item.items || "-",
    money.format(Number(item.income || 0)),
    money.format(Number(item.expense || 0)),
    money.format(Number((item.income || 0) - (item.expense || 0))),
    item.orders || 0,
    money.format(Number(item.orders ? item.income / item.orders : 0)),
  ]);
  if (format === "pdf") {
    openReportPrintView(headers, body);
    return;
  }
  if (format === "xlsx") {
    const table = `<table><thead><tr>${headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${html(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    downloadTextFile(table, `flowops-relatorio-${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8");
    return;
  }
  const csv = [headers, ...body]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  downloadTextFile(csv, `flowops-relatorio-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function getReportRows() {
  const from = reportStartDate();
  const until = reportReferenceDate();
  until.setHours(23, 59, 59, 999);
  const inPeriod = (dateValue) => {
    if (!dateValue) return true;
    const date = parseReportDate(dateValue);
    if (!date) return true;
    return (!from || date >= from) && date <= until;
  };
  return {
    cash: state.data.cash.filter((item) => inPeriod(item.date)),
    orders: state.data.orders.filter((item) => inPeriod(reportOrderDate(item))),
    sales: state.marketplaceSales.filter((item) => inPeriod(item.date || item.created_at)),
    leads: state.leads.filter((item) => inPeriod(item.created_at || item.updated_at)),
    materials: state.data.materials.filter((item) => inPeriod(item.date || item.created_at)),
  };
}

function reportStartDate() {
  if (state.reportPeriod === "all") return null;
  const days = Number(state.reportPeriod || 30);
  const date = reportReferenceDate();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  return date;
}

function reportReferenceDate() {
  const candidates = [
    new Date(),
    ...state.data.cash.map((item) => parseReportDate(item.date)),
    ...state.data.orders.map((item) => parseReportDate(reportOrderDate(item))),
    ...state.marketplaceSales.map((item) => parseReportDate(item.date || item.created_at)),
    ...state.data.materials.map((item) => parseReportDate(item.date || item.created_at)),
  ].filter(Boolean);
  return new Date(Math.max(...candidates.map((item) => item.getTime())));
}

function reportOrderDate(item) {
  const direct = item.createdAt || item.created_at || item.orderDate || item.order_date;
  if (direct) return direct;
  const cashEntry = findOrderCashEntry(item);
  if (cashEntry?.date) return cashEntry.date;
  const historyDate = [...(item.history || [])]
    .map((entry) => entry.at || entry.date || entry.created_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  return historyDate || item.deliveryDate || "";
}

function findOrderCashEntry(item, rows = state.data.cash) {
  const tokens = [getOrderCode(item), item.id, item.description]
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 4);
  return rows.find((entry) => {
    const description = normalizeText(entry.description);
    return tokens.some((token) => description.includes(token));
  });
}

function getReportFinancial(cashRows, orderRows) {
  const income = sum(cashRows, "income");
  const expense = sum(cashRows, "expense");
  const orderReceived = orderRows.reduce((total, item) => total + Number(item.received || 0), 0);
  const revenue = Math.max(income, orderReceived);
  const receivable = orderRows.reduce((total, item) => total + Math.max(Number(item.charged || 0) - Number(item.received || 0), 0), 0);
  return { revenue, costs: expense, profit: revenue - expense, receivable };
}

function reportDailyRows(cashRows, orderRows) {
  const map = new Map();
  const ensure = (date) => {
    const key = reportGroupKey(date);
    if (!map.has(key)) map.set(key, { date: key, income: 0, expense: 0, orders: 0, itemNames: new Set() });
    return map.get(key);
  };
  cashRows.forEach((item) => {
    const row = ensure(item.date);
    row.income += Number(item.income || 0);
    row.expense += Number(item.expense || 0);
    if (item.description) row.itemNames.add(item.description);
  });
  orderRows.forEach((item) => {
    const row = ensure(reportOrderDate(item));
    if (!findOrderCashEntry(item, cashRows)) row.income += Number(item.received || 0);
    row.orders += 1;
    row.itemNames.add(item.description || item.orderCode || item.id || "Encomenda");
  });
  return [...map.values()]
    .map((item) => ({ ...item, items: [...item.itemNames].slice(0, 4).join(", ") + (item.itemNames.size > 4 ? ` +${item.itemNames.size - 4}` : "") }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function reportGroupKey(dateValue) {
  const date = parseReportDate(dateValue) || new Date();
  if (state.reportGroup === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (state.reportGroup === "week") {
    const monday = new Date(date);
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
    return `${localReportDateKey(monday)}|week`;
  }
  return localReportDateKey(date);
}

function localReportDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatReportGroupLabel(value, short = false) {
  const raw = String(value || "");
  if (raw.endsWith("|week")) {
    const date = new Date(`${raw.replace("|week", "")}T00:00:00`);
    return `${short ? "Sem." : "Semana de"} ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
  }
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: short ? "short" : "long", year: "numeric" });
  }
  return short ? formatDateShort(raw) : formatDate(raw);
}

function parseReportDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(value);
  return Number.isFinite(iso.getTime()) ? iso : null;
}

function openReportPrintView(headers, body) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showAppMessage("Exportar PDF", "Permita pop-ups para gerar o PDF do relatório.", "error");
    return;
  }
  reportWindow.opener = null;
  const title = `Relatório FlowOps - ${reportTabLabel(state.reportTab)}`;
  reportWindow.document.open();
  const financial = getReportFinancial(getReportRows().cash, getReportRows().orders);
  const itemColumn = headers.findIndex((item) => item === "Itens");
  reportWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${html(title)}</title>
    <style>
      *{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#17212b;margin:0;background:#fff}
      .report{padding:28px}.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #0f8f7e}
      .brand{display:flex;align-items:center;gap:12px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:8px;background:#0f8f7e;color:#fff;font-weight:800}
      h1{font-size:22px;margin:0 0 5px}p{color:#526273;margin:0}.meta{text-align:right;line-height:1.55}
      .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.metric{padding:12px;border:1px solid #d7e0e7;border-radius:7px;background:#f7fafb}
      .metric span{display:block;color:#607181;font-size:11px;margin-bottom:5px}.metric strong{font-size:17px}
      h2{font-size:16px;margin:22px 0 10px}table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{padding:9px 8px;border-bottom:1px solid #d7e0e7;text-align:left;vertical-align:top;overflow-wrap:anywhere}
      th{background:#eef4f6;color:#334554;font-size:10px;text-transform:uppercase}tbody tr:nth-child(even){background:#fafcfd}
      .items{display:grid;gap:3px;line-height:1.35}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #d7e0e7;color:#738290;font-size:10px}
      @page{size:landscape;margin:10mm}@media print{.report{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body><main class="report">
    <header class="header"><div class="brand"><div class="mark">FO</div><div><h1>${html(title)}</h1><p>${html(state.organizationName || "FlowOps")}</p></div></div>
    <div class="meta"><strong>${html(reportPeriodLabel())}</strong><br>${html(reportGroupLabel())}<br>Gerado em ${html(new Date().toLocaleString("pt-BR"))}</div></header>
    <section class="metrics">
      <div class="metric"><span>Receita</span><strong>${html(money.format(financial.revenue))}</strong></div>
      <div class="metric"><span>Custos</span><strong>${html(money.format(financial.costs))}</strong></div>
      <div class="metric"><span>Resultado</span><strong>${html(money.format(financial.profit))}</strong></div>
      <div class="metric"><span>A receber</span><strong>${html(money.format(financial.receivable))}</strong></div>
    </section>
    <h2>Detalhamento do período</h2>
    <table><thead><tr>${headers.map((item) => `<th>${html(item)}</th>`).join("")}</tr></thead>
    <tbody>${body.map((row) => `<tr>${row.map((cell, index) => {
      const value = html(String(cell));
      return index === itemColumn ? `<td><div class="items">${value.split(", ").map((part) => `<span>${part}</span>`).join("")}</div></td>` : `<td>${value}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>
    <footer class="footer">Relatório gerado pelo FlowOps. Os valores refletem os registros disponíveis no período selecionado.</footer></main>
    <script>window.addEventListener('load',()=>{window.print();});<\/script></body></html>`);
  reportWindow.document.close();
}

function reportMarketplaceRows(orderRows, salesRows) {
  const map = new Map();
  const add = (label, value) => map.set(label, (map.get(label) || 0) + Number(value || 0));
  orderRows.forEach((item) => add(item.marketplace || item.source || "Venda direta", item.received || item.charged || 0));
  salesRows.forEach((item) => add(item.marketplace || "Marketplace", item.total || item.amount || 0));
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
}

function reportKpi(label, value, note, tone) {
  return `<article class="report-kpi ${tone || ""}"><span>${html(label)}</span><strong>${html(String(value))}</strong><small>${html(note)}</small></article>`;
}

function renderDonutChart(rows, total, centerLabel = "Total") {
  if (!rows.length) return `<div class="empty-chart">Sem dados</div>`;
  const colors = ["#22c55e", "#3b82f6", "#8b5cf6", "#eab308", "#14b8a6", "#f43f5e"];
  let current = 0;
  const parts = rows.map((item, index) => {
    const start = current;
    const percent = total ? (Number(item.value || 0) / total) * 100 : 0;
    current += percent;
    return `${colors[index % colors.length]} ${start}% ${current}%`;
  }).join(", ");
  return `<div class="donut-panel report-donut-panel">
    <div class="donut" title="${html(centerLabel)}: ${html(String(total))}" style="background: conic-gradient(${parts})"><span>${html(centerLabel)}</span></div>
    <div class="donut-legend">${rows.map((item, index) => {
      const percent = total ? Math.round((Number(item.value || 0) / total) * 100) : 0;
      const value = Number(item.value || 0) > 20 ? money.format(Number(item.value || 0)) : item.value;
      return `<div title="${html(item.label)}: ${html(String(value))} (${percent}%)"><span><i style="background:${colors[index % colors.length]}"></i>${html(item.label)}</span><strong>${html(String(value))} (${percent}%)</strong></div>`;
    }).join("")}</div>
  </div>`;
}

function renderReportInsight(icon, text) {
  return `<div class="report-insight"><span>${html(icon)}</span><p>${html(text)}</p></div>`;
}



function renderAlerts() {
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

function getSubscriptionAlert() {
  const subscription = state.subscription;
  const plan = state.subscriptionPlans.find((item) => item.code === subscription?.plan_code);
  if (!subscription || !plan) return null;
  const latestPayment = state.subscriptionPayments[0];
  const metadata = subscription.metadata || {};
  const cardLastFour = metadata.card_last_four || metadata.last_four || latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
  const paymentMethod = cardLastFour ? `Cartão final ${cardLastFour}` : latestPayment?.payment_method || "";
  const now = Date.now();
  const renewalAt = subscription.status === "trial" ?
     subscription.trial_end
    : subscription.status === "active" && Number(plan.price_monthly || 0) > 0 ?
       subscription.next_payment_at || subscription.current_period_end
      : null;
  const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
  const graceTime = subscription.grace_ends_at ?
     new Date(subscription.grace_ends_at).getTime()
    : renewalTime ?
       renewalTime + SUBSCRIPTION_DEFAULT_GRACE_DAYS * 86400000
      : null;
  if (subscription.status === "past_due") {
    return { level: "critical", title: "Pagamento da assinatura pendente", message: "Atualize o pagamento para evitar a suspensão do acesso." };
  }
  if (renewalTime && renewalTime <= now && graceTime && graceTime > now) {
    return { level: "critical", title: "Assinatura em período de tolerância", message: `Regularize o pagamento até ${formatDateTime(new Date(graceTime).toISOString())}.` };
  }
  if (renewalTime && graceTime && graceTime <= now && subscription.status === "active") {
    return { level: "critical", title: "Assinatura vencida", message: "O período de tolerância terminou. Regularize o pagamento para evitar bloqueio." };
  }
  if (!renewalAt) return null;
  const days = Math.max(0, Math.ceil((new Date(renewalAt).getTime() - now) / 86400000));
  if (days > 7) return null;
  const hasRegisteredPaymentMethod = Boolean(paymentMethod || subscription.provider_subscription_id || metadata.payment_method_registered);
  if (subscription.status === "trial" && !hasRegisteredPaymentMethod) {
    return { level: "critical", title: `Seu período de teste termina em ${days} dia${days === 1 ? "" : "s"}`, message: "Não encontramos um método de pagamento cadastrado." };
  }
  if (subscription.status === "active" && !hasRegisteredPaymentMethod) {
    return { level: "critical", title: "Método de pagamento não encontrado", message: "Seu plano vence em breve. Adicione um cartão para evitar a suspensão." };
  }
  return {
    level: days <= 1 ? "critical" : "normal",
    title: days === 1 ? "Seu plano será renovado amanhã" : `Seu plano será renovado em ${days} dias`,
    message: `${plan.name} • ${money.format(Number(plan.price_monthly || 0))} • ${paymentMethod || "Método não informado"}`,
  };
}

function renderWeeklyFocus() {
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

function applyFocusFilter(focus) {
  state.filters.orderFocus = focus || "all";
  state.filters.orderMaterial = "all";
  state.filters.orderStatus = "all";
  state.filters.orderMarketplace = "all";
  syncOrderFilterControls();
  setView("orders");
  renderTables();
}

function renderTopOpenOrders() {
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

function cashByDate(rows) {
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

function getOrderPriority(item) {
  if (item.status === "Entregue") return { key: "done", label: "Concluído", className: "done" };
  if (item.priority === "Urgente") return { key: "urgent", label: "Urgente", className: "danger-badge" };
  if (item.priority === "Alta") return { key: "high", label: "Alta", className: "queue" };
  if (item.priority === "Normal") return { key: "normal", label: "Normal", className: "neutral" };
  if (item.priority === "Baixa") return { key: "low", label: "Baixa", className: "neutral" };
  if (!item.deliveryDate) return { key: "no-date", label: "Sem data", className: "neutral" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(`${item.deliveryDate}T00:00:00`);
  const diff = Math.round((delivery - today) / 86400000);
  if (diff < 0) return { key: "late", label: "Atrasado", className: "danger-badge" };
  if (diff <= 3) return { key: "urgent", label: "Urgente", className: "danger-badge" };
  if (diff <= 7) return { key: "soon", label: "Atenção", className: "queue" };
  return { key: "normal", label: "Normal", className: "neutral" };
}


function getMarketplaceStatusFromHash() {
  const hash = window.location.hash.replace("#", "");
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("ml_status") || "";
}

function showMarketplaceOAuthStatus(status) {
  if (!status) return;
  const messages = {
    connected: ["Mercado Livre conectado", "A conta foi autorizada com sucesso. Os anuncios e vendas serao sincronizados apenas para esta empresa.", "success"],
    reconnected: ["Mercado Livre reconectado", "Os tokens desta empresa foram atualizados com sucesso.", "success"],
    already_linked: ["Conta Mercado Livre ja conectada", "Esta conta Mercado Livre ja esta conectada em outra empresa no FlowOps. Para conectar outra conta, saia da conta atual do Mercado Livre ou use uma janela anonima e tente novamente.", "warning"],
    error: ["Mercado Livre", "Nao foi possivel concluir a conexao. Tente novamente pela aba Integracoes.", "error"],
  };
  const [title, message, tone] = messages[status] || messages.error;
  showAppMessage(title, message, tone);
}



function parseOrderMeta(value) {
  const fallback = {
    text: value || "",
    orderCode: "",
    marketplaceOrderCode: "",
    stlLink: "",
    referenceImageUrl: "",
    internalNotes: "",
    tags: [],
    priority: "",
    productionStage: "",
    responsible: "",
    quoteStage: "",
    quoteUpdatedAt: "",
    source: "manual",
    leadId: "",
    checklist: defaultChecklist(),
    history: []
  };
  if (!value) return { ...fallback, text: "" };
  try {
    const parsed = JSON.parse(value);
    return {
      text: parsed.text || "",
      orderCode: parsed.orderCode || "",
      marketplaceOrderCode: parsed.marketplaceOrderCode || "",
      stlLink: parsed.stlLink || "",
      referenceImageUrl: parsed.referenceImageUrl || "",
      internalNotes: parsed.internalNotes || "",
      tags: Array.isArray(parsed.tags) ? parsed.tags : parseTags(parsed.tags || ""),
      priority: parsed.priority || "",
      productionStage: parsed.productionStage || "",
      responsible: parsed.responsible || "",
      quoteStage: parsed.quoteStage || "",
      quoteUpdatedAt: parsed.quoteUpdatedAt || "",
      source: parsed.source || "",
      leadId: parsed.leadId || "",
      checklist: { ...defaultChecklist(), ...(parsed.checklist || {}) },
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch {
    return fallback;
  }
}

function serializeOrderMeta(item) {
  const hasMeta = item.marketplaceOrderCode || item.stlLink || item.referenceImageUrl || item.internalNotes || item.tags?.length || item.priority || item.productionStage || item.responsible || item.quoteStage || item.source || item.leadId || item.history?.length || Object.values(item.checklist || {}).some(Boolean);
  if (!hasMeta) return item.notes || null;
  return JSON.stringify({
    text: item.notes || "",
    orderCode: item.orderCode || deriveOrderCode(item.id),
    marketplaceOrderCode: item.marketplaceOrderCode || "",
    stlLink: item.stlLink || "",
    referenceImageUrl: item.referenceImageUrl || "",
    internalNotes: item.internalNotes || "",
    tags: item.tags || [],
    priority: item.priority || "",
    productionStage: item.productionStage || "",
    responsible: item.responsible || "",
    quoteStage: item.quoteStage || "",
    quoteUpdatedAt: item.quoteUpdatedAt || "",
    source: item.source || "",
    leadId: item.leadId || "",
    checklist: { ...defaultChecklist(), ...(item.checklist || {}) },
    history: item.history || []
  });
}

function getOrderChanges(previous, next) {
  if (!previous) return [{ field: "Pedido", from: "-", to: "Criado" }];
  const fields = [
    ["Status", previous.status, next.status],
    ["Quantidade", previous.quantity || 1, next.quantity || 1],
    ["Código Marketplace", previous.marketplaceOrderCode, next.marketplaceOrderCode],
    ["Valor", previous.charged, next.charged, money.format],
    ["Recebido", previous.received, next.received, money.format],
    ["Data de entrega", previous.deliveryDate, next.deliveryDate, (value) => value ? formatDate(value) : "Sem data"],
    ["Prioridade", previous.priority, next.priority],
    ["Etapa", previous.productionStage, next.productionStage],
    ["Responsável", previous.responsible, next.responsible],
    ["Notas internas", previous.internalNotes, next.internalNotes],
    ["Etiquetas", (previous.tags || []).join(", "), (next.tags || []).join(", ")]
  ];
  return fields
    .filter(([, from, to]) => String(from || "") !== String(to || ""))
    .map(([field, from, to, formatter]) => ({
      field,
      from: formatter ? formatter(from || 0) : (from || "-"),
      to: formatter ? formatter(to || 0) : (to || "-")
    }));
}

function parseTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function mergeTags(existing, tagToAdd) {
  const tag = String(tagToAdd || "").trim();
  let tags = [...(existing || [])];
  if (isMarketplaceTag(tag)) tags = tags.filter((current) => !isMarketplaceTag(current));
  if (tag && !tags.includes(tag)) tags.push(tag);
  return tags;
}

function isMarketplaceTag(tag) {
  return ["Mercado Livre", "Shopee", "Amazon"].includes(String(tag || "").trim());
}

function getMarketplaceLabel(itemOrTags) {
  const tags = Array.isArray(itemOrTags) ? itemOrTags : itemOrTags?.tags || [];
  if (tags.includes("Shopee")) return "Shopee";
  if (tags.includes("Amazon")) return "Amazon";
  if (tags.includes("Mercado Livre")) return "Mercado Livre";
  return "Marketplace";
}

function getSelectedMarketplaceLabel() {
  const form = byId("orderForm");
  const selected = form?.elements.marketplaceTagToAdd?.value || "";
  if (selected) return selected;
  const existingId = form?.elements.id?.value;
  const existing = state.data.orders.find((item) => item.id === existingId);
  return getMarketplaceLabel(existing);
}

function updateMarketplaceCodePlaceholder() {
  const form = byId("orderForm");
  if (!form) return;
  const label = getSelectedMarketplaceLabel();
  form.elements.marketplaceOrderCode.placeholder = `Código ${label}`;
}

function updateOrderFormStatusColor() {
  const form = byId("orderForm");
  const select = form?.elements.status;
  if (!select) return;
  select.classList.remove("done", "queue", "danger-badge", "info-badge", "neutral");
  select.classList.add(getFieldClass("status", select.value));
}

async function copyMarketplaceCode(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item?.marketplaceOrderCode) return;
  try {
    await navigator.clipboard.writeText(item.marketplaceOrderCode);
    flashActionMessage("Código copiado.");
  } catch {
    prompt("Copie o código:", item.marketplaceOrderCode);
  }
}


function syncOrderFilterControls() {
  const material = byId("orderMaterialFilter");
  const status = byId("orderStatusFilter");
  const marketplace = byId("orderMarketplaceFilter");
  const focus = byId("orderFocusFilter");
  const quote = byId("orderQuoteFilter");
  if (material) material.value = state.filters.orderMaterial;
  if (status) status.value = state.filters.orderStatus;
  if (marketplace) marketplace.value = state.filters.orderMarketplace;
  if (focus) focus.value = state.filters.orderFocus;
  if (quote) quote.value = state.filters.orderQuote;
}


function getTagClass(tag) {
  const value = normalizeKey(tag);
  const custom = state.customTags.find((item) => normalizeKey(item.name) === value);
  if (custom) return customTagClass(custom.color);
  if (value === "mercadolivre") return "marketplace-ml";
  if (value === "shopee") return "marketplace-shopee";
  if (value === "urgente" || value === "reimpressao") return "tag-danger";
  if (value === "pintura" || value === "pintando") return "tag-attention";
  if (value === "sempintura") return "tag-positive";
  return "";
}

function renderResponsibleOptions() {
  const select = document.querySelector('#orderForm select[name="responsible"]');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Responsável</option>${getResponsibleNames().map((name) => `<option>${html(name)}</option>`).join("")}`;
  select.value = current;
}

function getResponsibleNames() {
  return [...new Set(state.responsibles.map((item) => item.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function nextResponsibleId() {
  const max = state.responsibles.reduce((value, row) => Math.max(value, Number(String(row.id || "").split("-")[1] || 0)), 0);
  return `RESP-${String(max + 1).padStart(3, "0")}`;
}

function getOrderCode(item) {
  return item.orderCode || deriveOrderCode(item.id);
}

function deriveOrderCode(id) {
  const numberPart = Number(String(id || "").split("-")[1] || 0);
  return `PED-${String(numberPart || 1).padStart(4, "0")}`;
}

function nextOrderCode() {
  const max = state.data.orders.reduce((value, row) => {
    const match = String(row.orderCode || "").match(/PED-(\d+)/);
    const fromCode = match ? Number(match[1]) : 0;
    const fromId = Number(String(row.id || "").split("-")[1] || 0);
    return Math.max(value, fromCode, fromId);
  }, 0);
  return `PED-${String(max + 1).padStart(4, "0")}`;
}


function getTopClient() {
  const map = new Map();
  state.data.orders.forEach((item) => {
    const client = item.client || "Não informado";
    map.set(client, (map.get(client) || 0) + 1);
  });
  const [name] = [...map.entries()].sort((a, b) => b[1] - a[1])[0] || ["-"];
  return name;
}



function appendHistory(history, changes) {
  if (!changes.length) return history || [];
  const entry = {
    at: new Date().toISOString(),
    by: state.activeUserName || "Usuário",
    changes
  };
  return [entry, ...(history || [])].slice(0, 40);
}

function showOrderHistory(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item) return;
  const content = byId("historyContent");
  content.innerHTML = item.history?.length ? item.history.map((entry) => `
    <div class="list-row history-row">
      <div>
        <strong>${formatDateTime(entry.at)} - ${html(entry.by || "Usuário")}</strong>
        <span>${entry.changes.map((change) => `${html(change.field)}: ${html(change.from)} -> ${html(change.to)}`).join("<br>")}</span>
      </div>
    </div>
  `).join("") : `<div class="empty-chart">Sem alterações registradas neste pedido</div>`;
  byId("historyDialog").showModal();
}

function openEmailDigest() {
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

function renderLeads() {
  const target = byId("leadsList");
  if (!target) return;
  const rows = state.leads.filter((lead) => {
    const linked = (lead.linked_order_ids || []).join(" ");
    const searchMatch = !state.leadSearch || `${lead.name} ${lead.email || ""} ${lead.whatsapp || ""} ${linked}`.toLowerCase().includes(state.leadSearch);
    const statusMatch = state.leadStatusFilter === "all" || lead.status === state.leadStatusFilter;
    const originMatch = state.leadOriginFilter === "all" || lead.origin === state.leadOriginFilter;
    return searchMatch && statusMatch && originMatch;
  });
  const opportunities = rows.filter((lead) => ["Novo", "Em negociação"].includes(lead.status));
  const linkedOrders = rows.flatMap(getLeadOrders);
  renderOperationalSummary("leadsView", "leadsPageSummary", [
    ["Clientes", rows.filter((lead) => ["Convertido", "Cliente recorrente"].includes(lead.status)).length, "base ativa", "green"],
    ["Leads novos", rows.filter((lead) => lead.status === "Novo").length, "aguardando contato", "blue"],
    ["Oportunidades", opportunities.length, money.format(linkedOrders.reduce((sum, item) => sum + Number(item.charged || 0), 0)), "amber"],
    ["Pedidos originados", linkedOrders.length, "vinculados aos contatos", "purple"],
  ]);
  const selectedLead = rows.find((lead) => lead.id === state.selectedLeadId) || rows[0];
  const cards = rows.map((lead) => {
    const linkedOrders = getLeadOrders(lead);
    const followUp = getLeadFollowUp(lead);
    const initials = getInitials(lead.name || lead.email || "Cliente");
    const photo = lead.photo_url || lead.avatar_url || lead.image_url || "";
    return `
      <article class="lead-card ${followUp ? "follow-up" : ""} ${selectedLead?.id === lead.id ? "selected" : ""}">
        <div class="lead-card-head">
          <div class="lead-identity">
            ${photo ? `<img src="${html(photo)}" alt="" />` : `<span class="lead-avatar">${html(initials)}</span>`}
            <div><strong>${html(lead.name)}</strong><small>${html(lead.email || lead.whatsapp || "Contato não informado")}</small></div>
          </div>
          <span class="badge ${lead.status === "Convertido" ? "done" : lead.status === "Perdido" ? "danger-badge" : "queue"}">${html(lead.status)}</span>
        </div>
        <div class="lead-card-meta"><span>${html(lead.origin)}</span><strong>${linkedOrders.length} pedido${linkedOrders.length === 1 ? "" : "s"}</strong></div>
        ${followUp ? `<span class="integration-alert warning">${html(followUp)}</span>` : ""}
        <small>Último contato: ${lead.last_contact_at ? formatDateTime(lead.last_contact_at) : "Não registrado"}</small>
        <div class="lead-card-actions">
          <button class="secondary-btn" type="button" data-action="edit-lead" data-id="${html(lead.id)}">Abrir / editar</button>
          ${linkedOrders[0] ? `<button class="secondary-btn" type="button" data-action="open-lead-order" data-id="${html(linkedOrders[0].id)}">Abrir pedido</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state"><strong>Nenhum cliente encontrado</strong><span>Ajuste os filtros ou cadastre um novo lead.</span></div>`;
  } else {
    const selectedOrders = getLeadOrders(selectedLead);
    const selectedPhoto = selectedLead.photo_url || selectedLead.avatar_url || selectedLead.image_url || "";
    target.innerHTML = `
      <div class="lead-list-column">${cards}</div>
      <aside class="lead-detail-card">
        <div class="lead-detail-head">
          ${selectedPhoto ? `<img src="${html(selectedPhoto)}" alt="" />` : `<span class="lead-avatar large">${html(getInitials(selectedLead.name || selectedLead.email || "Cliente"))}</span>`}
          <div><h3>${html(selectedLead.name)}</h3><span class="badge ${selectedLead.status === "Convertido" ? "done" : selectedLead.status === "Perdido" ? "danger-badge" : "queue"}">${html(selectedLead.status)}</span></div>
        </div>
        <dl class="lead-detail-metrics">
          <div><dt>Origem</dt><dd>${html(selectedLead.origin || "-")}</dd></div>
          <div><dt>Último contato</dt><dd>${selectedLead.last_contact_at ? formatDateTime(selectedLead.last_contact_at) : "-"}</dd></div>
          <div><dt>Pedidos</dt><dd>${selectedOrders.length}</dd></div>
          <div><dt>Total</dt><dd>${money.format(selectedOrders.reduce((sum, order) => sum + Number(order.received || 0), 0))}</dd></div>
        </dl>
        <div class="lead-contact-grid">
          <span><small>E-mail</small><strong>${html(selectedLead.email || "-")}</strong></span>
          <span><small>WhatsApp</small><strong>${html(selectedLead.whatsapp || "-")}</strong></span>
        </div>
        <div class="lead-detail-orders">
          <h3>Pedidos recentes</h3>
          ${selectedOrders.length ? selectedOrders.slice(0, 5).map((order) => `
            <button type="button" data-action="open-lead-order" data-id="${html(order.id)}">
              <span><strong>${html(getOrderCode(order))}</strong><small>${html(order.description || "-")}</small></span>
              <strong>${money.format(Number(order.charged || 0))}</strong>
            </button>`).join("") : `<div class="empty-state compact"><strong>Nenhum pedido vinculado</strong></div>`}
        </div>
        <button class="primary-btn" type="button" data-action="edit-lead" data-id="${html(selectedLead.id)}">Abrir ficha completa</button>
      </aside>`;
  }
  bindActions();
}

function getInitials(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "CL";
}

function getLeadOrders(lead) {
  const ids = lead.linked_order_ids || [];
  return state.data.orders.filter((orderItem) => ids.includes(orderItem.id) || orderItem.leadId === lead.id);
}

function getLeadFollowUp(lead) {
  const reference = new Date(lead.last_contact_at || lead.created_at || 0).getTime();
  const days = Math.floor((Date.now() - reference) / 86400000);
  if (lead.status === "Novo" && days > 3) return "Entrar em contato";
  return "";
}

function openLeadDialog(id = "") {
  const lead = state.leads.find((item) => item.id === id);
  const form = byId("leadForm");
  form.reset();
  form.elements.id.value = lead?.id || "";
  form.elements.name.value = lead?.name || "";
  form.elements.email.value = lead?.email || "";
  form.elements.whatsapp.value = lead?.whatsapp || "";
  form.elements.origin.value = lead?.origin || "Manual";
  form.elements.status.value = lead?.status || "Novo";
  form.elements.last_contact_at.value = lead?.last_contact_at ? String(lead.last_contact_at).slice(0, 16) : "";
  form.elements.notes.value = lead?.notes || "";
  byId("leadDialogTitle").textContent = lead ? lead.name : "Novo lead";
  renderLeadHistory(lead);
  renderLeadFiles(lead);
  byId("leadDialog").showModal();
}

function renderLeadFiles(lead) {
  const target = byId("leadFilesList");
  if (!target) return;
  if (!lead) {
    target.innerHTML = "";
    return;
  }
  const files = state.leadFiles.filter((item) => item.lead_id === lead.id);
  target.innerHTML = `
    <div class="panel-head"><h3>Arquivos do cliente</h3><small>Fotos, STLs, referencias e PDFs</small></div>
    ${files.length ? files.map((file) => `
      <div class="list-row">
        <span><strong>${html(file.file_name)}</strong><br><small>${html(file.category || file.file_type || "Arquivo")} • ${formatFileSize(file.size_bytes)}</small></span>
        <span class="inline-actions">
          <button class="secondary-btn" type="button" data-action="open-lead-file" data-id="${html(file.id)}">Abrir</button>
          ${state.canEdit ? `<button class="icon-btn danger" type="button" data-action="delete-lead-file" data-id="${html(file.id)}">Excluir</button>` : ""}
        </span>
      </div>
    `).join("") : `<div class="empty-chart">Nenhum arquivo anexado.</div>`}
  `;
  bindActions();
}

function renderLeadHistory(lead) {
  const target = byId("leadHistoryContent");
  if (!lead) {
    target.innerHTML = "";
    return;
  }
  const orders = getLeadOrders(lead);
  const total = orders.filter((item) => item.status === "Entregue" || Number(item.received || 0) > 0)
    .reduce((sumValue, item) => sumValue + Number(item.received || item.charged || 0), 0);
  target.innerHTML = `
    <div class="panel-head"><h3>Histórico do cliente</h3><strong>${money.format(total)} vendidos</strong></div>
    ${orders.length ? orders.map((item) => `
      <div class="list-row">
        <span><strong>${html(item.orderCode || item.id)} • ${html(item.description)}</strong><br><small>${html(item.quoteStage || item.status)} • ${money.format(Number(item.charged || 0))}</small></span>
        <button class="secondary-btn" type="button" data-action="open-lead-order" data-id="${html(item.id)}">Abrir</button>
      </div>
    `).join("") : `<div class="empty-chart">Nenhum pedido vinculado.</div>`}
  `;
  bindActions();
}

async function saveLead(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const id = String(form.get("id") || "");
  const previous = state.leads.find((item) => item.id === id);
  const item = {
    id: id || crypto.randomUUID(),
    name: String(form.get("name") || "").trim(),
    email: String(form.get("email") || "").trim().toLowerCase() || null,
    whatsapp: String(form.get("whatsapp") || "").trim() || null,
    origin: String(form.get("origin") || "Manual"),
    status: String(form.get("status") || "Novo"),
    last_contact_at: form.get("last_contact_at") ? new Date(String(form.get("last_contact_at"))).toISOString() : null,
    notes: String(form.get("notes") || "").trim() || null,
    linked_order_ids: previous?.linked_order_ids || [],
    created_at: previous?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await state.supabase.from("crm_leads").upsert(item);
  if (error) throw error;
  await uploadLeadFiles(item.id, byId("leadFileInput").files);
  await recordAudit(previous ? "lead_update" : "lead_create", "lead", item.id, "", previous || null, item, "manual");
  byId("leadDialog").close();
  await loadRemoteData();
  render();
}

async function uploadLeadFiles(leadId, files) {
  for (const file of Array.from(files || [])) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${leadId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await state.supabase.storage.from("lead-files").upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) throw uploadError;
    const category = file.type.startsWith("image/") ? "Foto/Referência"
      : /\.pdf$/i.test(file.name) ? "PDF"
      : /\.(stl|obj|3mf)$/i.test(file.name) ? "Arquivo 3D"
      : "Arquivo";
    const { error } = await state.supabase.from("lead_files").insert({
      lead_id: leadId,
      file_name: file.name,
      file_type: file.type || null,
      storage_path: path,
      category,
      size_bytes: file.size,
      uploaded_by: state.activeUserEmail || null,
    });
    if (error) throw error;
  }
}

async function openLeadFile(id) {
  const file = state.leadFiles.find((item) => item.id === id);
  if (!file) return;
  const { data, error } = await state.supabase.storage.from("lead-files").createSignedUrl(file.storage_path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

async function deleteLeadFile(id) {
  const file = state.leadFiles.find((item) => item.id === id);
  if (!file || !confirm(`Excluir ${file.file_name}?`)) return;
  await state.supabase.storage.from("lead-files").remove([file.storage_path]);
  const { error } = await state.supabase.from("lead_files").delete().eq("id", id);
  if (error) throw error;
  await recordAudit("lead_file_delete", "lead", file.lead_id, "", file, null, "manual");
  await loadRemoteData();
  renderLeadFiles(state.leads.find((item) => item.id === file.lead_id));
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1048576).toFixed(1)} MB`;
}

function renderSettingsData() {
  const datalist = byId("customTagsList");
  if (datalist) datalist.innerHTML = state.customTags.map((tag) => `<option value="${html(tag.name)}"></option>`).join("");
  const manager = byId("customTagsManager");
  if (manager) {
    manager.innerHTML = state.customTags.length ? state.customTags.map((tag) => `
      <span class="${customTagClass(tag.color)}">${html(tag.name)}
        ${state.canEdit ? `<button type="button" data-action="delete-custom-tag" data-id="${html(tag.id)}">×</button>` : ""}
      </span>
    `).join("") : `<span class="muted">Nenhuma tag personalizada.</span>`;
  }
  const backup = byId("backupStatus");
  if (backup) {
    const latest = state.backupRuns[0];
    backup.innerHTML = `
      <article><span>Ultimo backup</span><strong>${latest ? formatDateTime(latest.started_at) : "Ainda nao executado"}</strong></article>
      <article><span>Resultado</span><strong>${latest?.status === "success" ? "Concluido" : latest?.status === "error" ? "Falhou" : latest?.status || "-"}</strong></article>
      <article><span>Tamanho</span><strong>${latest?.size_bytes ? formatFileSize(latest.size_bytes) : "-"}</strong></article>
      <article><span>Falhou?</span><strong>${latest?.status === "error" ? "Sim" : "Nao"}</strong></article>
    `;
  }
  const backupHistory = byId("backupHistoryList");
  if (backupHistory) {
    backupHistory.innerHTML = state.backupRuns.length ? state.backupRuns.slice(0, 30).map((run) => `
      <div class="list-row">
        <span><strong>${run.status === "success" ? "Backup concluído" : "Backup com erro"}</strong><br><small>${formatDateTime(run.started_at)} • ${run.backup_type || "automático"}</small></span>
        <span class="backup-history-actions">
          <span class="badge ${run.status === "success" ? "done" : "danger-badge"}">${run.status === "success" ? formatFileSize(run.size_bytes) : html(run.error_message || "Falhou")}</span>
          ${run.status === "success" && run.storage_path ? `<button class="secondary-btn compact" type="button" data-action="download-saved-backup" data-id="${html(run.id)}">Baixar</button>` : ""}
        </span>
      </div>
    `).join("") : `<div class="empty-chart">Nenhum backup executado ainda.</div>`;
  }
  bindActions();
}

function customTagClass(color) {
  return {
    positive: "tag-positive",
    attention: "tag-attention",
    danger: "tag-danger",
    queue: "tag-marketplace",
  }[color] || "tag-neutral";
}

async function saveCustomTag(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  if (!name) return;
  const { error } = await state.supabase.from("custom_tags").insert({
    name,
    color: String(form.get("color") || "neutral"),
    created_by: state.activeUserEmail || null,
  });
  if (error) {
    alert(error.code === "23505" ? "Essa tag ja existe." : error.message);
    return;
  }
  event.currentTarget.reset();
  await loadRemoteData();
  renderSettingsData();
}

async function deleteCustomTag(id) {
  const tag = state.customTags.find((item) => item.id === id);
  if (!tag || !confirm(`Excluir a tag ${tag.name}?`)) return;
  const { error } = await state.supabase.from("custom_tags").delete().eq("id", id);
  if (error) throw error;
  await loadRemoteData();
  renderSettingsData();
}

async function runManualBackup() {
  if (!ensureCanAdmin()) return;
  const button = byId("runBackupBtn");
  button.disabled = true;
  button.textContent = "Executando...";
  try {
    const { data: sessionData } = await state.supabase.auth.getSession();
    const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
      body: JSON.stringify({ action: "manual" }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Falha no backup.");
    await loadRemoteData();
    renderSettingsData();
    flashActionMessage("Backup concluido.");
  } catch (error) {
    alert(`Backup falhou: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Executar agora";
  }
}

async function maintenanceRequest(payload) {
  if (!ensureCanAdmin()) throw new Error("Apenas administradores podem gerenciar backups.");
  const { data: sessionData } = await state.supabase.auth.getSession();
  const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao processar o backup.");
  return data;
}

async function downloadBackupScope(scope) {
  const labels = {
    system: "sistema",
    storefront: "vitrine",
    database: "banco-completo",
  };
  const button = byId(scope === "system" ?
     "downloadSystemBackupBtn"
    : scope === "storefront" ?
       "downloadStorefrontBackupBtn"
      : "downloadDatabaseBackupBtn");
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando...";
  try {
    const data = await maintenanceRequest({ action: "export", scope });
    downloadJsonFile(data.snapshot, `3daft-backup-${labels[scope]}-${new Date().toISOString().slice(0, 10)}.json`);
    flashActionMessage("Backup baixado.");
  } catch (error) {
    alert(`Nao foi possivel baixar o backup: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function downloadSavedBackup(id) {
  try {
    const data = await maintenanceRequest({ action: "download", backup_id: id });
    const anchor = document.createElement("a");
    anchor.href = data.url;
    anchor.download = data.file_name || "3daft-backup.json.gz";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    alert(`Nao foi possivel baixar o backup: ${error.message}`);
  }
}

async function restoreBackupFromFile() {
  if (!ensureCanAdmin()) return;
  const input = byId("backupImportFile");
  const message = byId("backupRestoreMessage");
  const button = byId("restoreBackupBtn");
  const file = input.files?.[0];
  if (!file) {
    message.textContent = "Selecione um arquivo de backup.";
    return;
  }
  if (!confirm("Restaurar este backup Registros com o mesmo identificador serao atualizados no Supabase.")) return;
  button.disabled = true;
  button.textContent = "Restaurando...";
  message.textContent = "Validando arquivo...";
  try {
    const snapshot = await readBackupFile(file);
    validateBackupSnapshot(snapshot);
    const data = await maintenanceRequest({ action: "restore", snapshot });
    message.textContent = `${data.restored_rows || 0} registro(s) restaurado(s) em ${data.restored_tables || 0} tabela(s).`;
    input.value = "";
    await loadRemoteData();
    await loadMarketplaces();
    render();
    renderMarketplaces();
  } catch (error) {
    message.textContent = `Falha: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Importar backup";
  }
}

async function simulateBackupRestore() {
  if (!ensureCanAdmin()) return;
  const input = byId("backupImportFile");
  const message = byId("backupRestoreMessage");
  const report = byId("backupSimulationReport");
  const button = byId("simulateBackupRestoreBtn");
  const file = input.files?.[0];
  if (!file) {
    message.textContent = "Selecione um arquivo de backup.";
    report.hidden = true;
    return;
  }
  button.disabled = true;
  button.textContent = "Analisando...";
  message.textContent = "Comparando o backup com o banco atual sem alterar dados...";
  report.hidden = true;
  try {
    const snapshot = await readBackupFile(file);
    validateBackupSnapshot(snapshot);
    const data = await maintenanceRequest({ action: "simulate-restore", snapshot });
    renderBackupSimulation(data);
    message.textContent = data.can_restore ?
       "Teste concluido. O arquivo pode ser restaurado."
      : "Teste concluido com problemas que precisam ser revisados.";
  } catch (error) {
    message.textContent = `Falha no teste: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Testar restauracao";
  }
}

function renderBackupSimulation(data) {
  const report = byId("backupSimulationReport");
  const totals = data.totals || {};
  const rows = Array.isArray(data.tables) ? data.tables : [];
  report.innerHTML = `
    <div class="backup-simulation-summary">
      <article><span>Criaria</span><strong>${Number(totals.create || 0)}</strong></article>
      <article><span>Atualizaria</span><strong>${Number(totals.update || 0)}</strong></article>
      <article><span>Sem mudanca</span><strong>${Number(totals.identical || 0)}</strong></article>
      <article><span>Ignorados</span><strong>${Number(totals.skipped || 0)}</strong></article>
      <article><span>Invalidos</span><strong>${Number(totals.invalid || 0)}</strong></article>
    </div>
    <div class="table-wrap">
      <table class="backup-simulation-table">
        <thead><tr><th>Tabela</th><th>Arquivo</th><th>Novos</th><th>Atualizacoes</th><th>Iguais</th><th>Ignorados</th><th>Invalidos</th></tr></thead>
        <tbody>${rows.map((item) => `
          <tr>
            <td><strong>${html(item.table)}</strong>${item.reason ? `<br><small>${html(item.reason)}</small>` : ""}</td>
            <td>${Number(item.rows || 0)}</td>
            <td>${Number(item.create || 0)}</td>
            <td>${Number(item.update || 0)}</td>
            <td>${Number(item.identical || 0)}</td>
            <td>${Number(item.skipped || 0)}</td>
            <td>${Number(item.invalid || 0)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
    <p class="backup-simulation-result ${data.can_restore ? "success" : "warning"}">
      ${data.can_restore ?
         "Nenhuma alteracao foi executada. A restauracao real continua dependendo do botao Importar backup."
        : "Nenhuma alteracao foi executada. Corrija ou substitua o arquivo antes da restauracao."}
    </p>
  `;
  report.hidden = false;
}

async function readBackupFile(file) {
  let text;
  if (file.name.toLowerCase().endsWith(".gz") || file.type === "application/gzip") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("Este navegador nao suporta arquivos GZIP. Use um backup JSON.");
    }
    const decompressed = file.stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(decompressed).text();
  } else {
    text = await file.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Arquivo JSON invalido.");
  }
}

function validateBackupSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("O arquivo nao possui a estrutura de backup da 3D.AFT.");
  }
  if (!Object.values(snapshot.tables).every(Array.isArray)) {
    throw new Error("Uma ou mais tabelas do backup sao invalidas.");
  }
}

function downloadJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openOrderFromLead(id) {
  state.query = "";
  setView("orders");
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (item) startOrderEdit(item.id);
}

async function recordAudit(action, entityType, entityId, orderCode, oldValue, newValue, source = "manual", metadata = {}) {
  if (!state.supabase || !state.canEdit) return;
  const payload = {
    actor_email: state.activeUserEmail || null,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    order_code: orderCode || null,
    old_value: auditSnapshot(oldValue),
    new_value: auditSnapshot(newValue),
    source,
    metadata,
  };
  const { data, error } = await state.supabase.from("audit_events").insert(payload).select().single();
  if (!error && data) state.auditEvents.unshift(data);
}

function auditSnapshot(value) {
  if (!value || typeof value !== "object") return value || null;
  const blocked = new Set(["referenceImageUrl", "stlLink", "referenceImages", "stlFile", "history", "checklist"]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !blocked.has(key))
    .map(([key, entry]) => [key, typeof entry === "string" && entry.length > 800 ? `${entry.slice(0, 800)}...` : entry]));
}

async function createNotification(type, title, message, relatedEntity, relatedEntityId, priority = "normal", roleTarget = "all") {
  if (!state.supabase) return;
  const payload = {
    organization_id: state.organizationId,
    type,
    title,
    message,
    related_entity: relatedEntity || null,
    related_entity_id: relatedEntityId || null,
    priority,
    role_target: roleTarget,
  };
  const { data, error } = await state.supabase.from("notifications").insert(payload).select().single();
  if (!error && data) state.notifications.unshift(data);
}

async function ensureOperationalNotifications() {
  if (!state.canEdit || !state.supabase) return;
  const today = new Date().toISOString().slice(0, 10);
  const exists = (type, entityId, title) => state.notifications.some((item) =>
    item.type === type
    && String(item.related_entity_id || "") === String(entityId || "")
    && item.title === title
    && String(item.created_at || "").startsWith(today)
  );
  const queue = [];
  const add = (type, title, message, entity, id, priority = "normal", role = "editor") => {
    if (!exists(type, id, title)) queue.push([type, title, message, entity, id, priority, role]);
  };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  state.data.orders.forEach((item) => {
    if (item.status !== "Entregue" && item.deliveryDate && new Date(`${item.deliveryDate}T00:00:00`) < now) {
      add("system", "Pedido atrasado", `${item.orderCode || item.id} - ${item.description}`, "order", item.id, "high");
    }
    if (item.status !== "Entregue" && !item.deliveryDate && !item.quoteStage) {
      add("system", "Encomenda sem data", `${item.orderCode || item.id} - ${item.description}`, "order", item.id);
    }
    if (item.status !== "Entregue" && !Number(item.charged || 0) && !item.quoteStage) {
      add("system", "Encomenda sem valor", `${item.orderCode || item.id} - ${item.description}`, "order", item.id);
    }
    if (["Orçamento enviado", "Aguardando cliente"].includes(item.quoteStage)) {
      const days = Math.floor((Date.now() - new Date(item.quoteUpdatedAt || 0).getTime()) / 86400000);
      if (days > 7) add("quote", "Follow-up necessário", `${item.orderCode || item.id} aguarda cliente há ${days} dias`, "order", item.id, "high");
    }
  });
  state.leads.forEach((lead) => {
    const followUp = getLeadFollowUp(lead);
    if (followUp) add("lead", followUp, lead.name, "lead", lead.id);
  });
  state.inventoryItems
    .filter((item) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0))
    .forEach((item) => {
      add(
        "stock",
        "Estoque baixo",
        `${item.name}: ${formatInventoryNumber(item.quantity)} ${item.unit || "un."} disponíveis; mínimo ${formatInventoryNumber(item.minimum_quantity)}.`,
        "inventory",
        item.id,
        "high",
      );
    });
  const subscriptionAlert = getSubscriptionAlert();
  if (subscriptionAlert) {
    add(
      "subscription",
      subscriptionAlert.title,
      subscriptionAlert.message,
      "subscription",
      `subscription-${today}`,
      subscriptionAlert.level === "critical" ? "high" : "normal",
      "all",
    );
  }
  if (state.isAdmin) {
    const tokenAlert = getTokenAlert();
    if (tokenAlert && tokenAlert.level !== "success") {
      add("marketplace", "Token próximo do vencimento", tokenAlert.message, "marketplace_log", "token-ml", tokenAlert.level === "error" ? "high" : "normal", "admin");
    }
    getRecentIntegrationErrors().slice(0, 5).forEach((log) => {
      add("marketplace", "Erro em integração marketplace", log.message || log.kind, "marketplace_log", String(log.id), "high", "admin");
    });
  }
  for (const args of queue.slice(0, 30)) await createNotification(...args);
}

function renderNotifications() {
  const list = byId("notificationList");
  if (!list) return;
  const visible = state.notifications.filter(notificationAllowed).filter((item) => !item.dismissed_at).filter((item) => {
    const filter = state.notificationFilter;
    if (filter === "unread") return !item.is_read;
    if (filter === "error") return item.priority === "high" || item.type === "error";
    if (filter === "quote") return item.type === "quote" || item.type === "lead";
    if (filter === "marketplace") return item.type === "marketplace";
    if (filter === "system") return ["system", "backup", "access", "stock", "subscription"].includes(item.type);
    return true;
  });
  const unread = state.notifications.filter(notificationAllowed).filter((item) => !item.dismissed_at && !item.is_read).length;
  byId("notificationBadge").hidden = unread === 0;
  byId("notificationBadge").textContent = unread > 99 ? "99+" : unread;
  byId("sidebarNotificationBadge").hidden = unread === 0;
  byId("sidebarNotificationBadge").textContent = unread > 99 ? "99+" : unread;
  document.querySelectorAll("[data-notification-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.notificationFilter === state.notificationFilter);
  });
  list.innerHTML = visible.length ? visible.slice(0, state.notificationLimit).map((item) => `
    <button class="notification-item ${item.is_read ? "" : "unread"} ${html(item.priority)}" type="button" data-action="open-notification" data-id="${html(item.id)}">
      <i class="notification-item-icon" aria-hidden="true"></i>
      <span class="notification-item-copy"><strong>${html(item.title)}</strong><span>${html(item.message || "")}</span><small>${formatDateTime(item.created_at)}</small></span>
    </button>
  `).join("") : `<div class="empty-state compact"><strong>Tudo certo por aqui</strong><span>Nenhuma notificação encontrada.</span></div>`;
  const dashboardList = byId("dashboardNotificationList");
  if (dashboardList) {
    dashboardList.innerHTML = visible.length ? visible.slice(0, 5).map((item) => `
      <button type="button" data-action="open-notification" data-id="${html(item.id)}">
        <span class="notification-dot ${html(item.priority)}"></span>
        <span><strong>${html(item.title)}</strong><small>${html(item.message || "")}</small></span>
        <time>${formatDateTime(item.created_at)}</time>
      </button>`).join("") : `<div class="empty-chart">Nenhuma notificação importante.</div>`;
  }
  const pageList = byId("notificationsPageList");
  if (pageList) {
    pageList.innerHTML = visible.length ? visible.map((item) => `
      <article class="notification-page-item ${item.is_read ? "" : "unread"} ${html(item.priority)}">
        <button type="button" data-action="open-notification" data-id="${html(item.id)}">
          <span class="notification-dot ${html(item.priority)}"></span>
          <span><strong>${html(item.title)}</strong><small>${html(item.message || "")}</small></span>
          <time>${formatDateTime(item.created_at)}</time>
        </button>
      </article>`).join("") : `<div class="empty-chart">Nenhuma notificação para este filtro.</div>`;
  }
  bindActions();
}

function notificationAllowed(item) {
  if (String(item.role_target || "").toLowerCase().includes("admin") && !state.isAdmin) return false;
  return true;
}

async function markNotificationRead(id, isRead) {
  const item = state.notifications.find((notification) => notification.id === id);
  if (!item || item.is_read === isRead) return;
  const readAt = isRead ? new Date().toISOString() : null;
  await state.supabase.from("notifications").update({ is_read: isRead, read_at: readAt }).eq("id", id);
  item.is_read = isRead;
  item.read_at = readAt;
  renderNotifications();
}

async function markAllNotificationsRead() {
  const ids = state.notifications.filter(notificationAllowed).filter((item) => !item.dismissed_at && !item.is_read).map((item) => item.id);
  if (!ids.length) return;
  const readAt = new Date().toISOString();
  await state.supabase.from("notifications").update({ is_read: true, read_at: readAt }).in("id", ids);
  state.notifications.forEach((item) => {
    if (ids.includes(item.id)) {
      item.is_read = true;
      item.read_at = readAt;
    }
  });
  renderNotifications();
}

async function clearReadNotifications() {
  const ids = state.notifications.filter(notificationAllowed).filter((item) => item.is_read && !item.dismissed_at).map((item) => item.id);
  if (!ids.length) {
    flashActionMessage("Não há notificações lidas para limpar.");
    return;
  }
  const dismissedAt = new Date().toISOString();
  const { error } = await state.supabase.from("notifications").update({ dismissed_at: dismissedAt }).in("id", ids);
  if (error) {
    alert(`Não foi possível limpar as notificações: ${error.message}`);
    return;
  }
  state.notifications.forEach((item) => {
    if (ids.includes(item.id)) item.dismissed_at = dismissedAt;
  });
  renderNotifications();
}

async function clearVisibleNotifications() {
  const ids = state.notifications
    .filter(notificationAllowed)
    .filter((item) => !item.dismissed_at)
    .map((item) => item.id);
  if (!ids.length) {
    flashActionMessage("A tela de notificações já está limpa.");
    return;
  }
  const dismissedAt = new Date().toISOString();
  const { error } = await state.supabase.from("notifications").update({
    dismissed_at: dismissedAt,
    is_read: true,
    read_at: dismissedAt,
  }).in("id", ids);
  if (error) {
    alert(`Não foi possível limpar as notificações: ${error.message}`);
    return;
  }
  state.notifications.forEach((item) => {
    if (ids.includes(item.id)) {
      item.dismissed_at = dismissedAt;
      item.is_read = true;
      item.read_at = dismissedAt;
    }
  });
  renderNotifications();
}

async function openNotification(id) {
  const item = state.notifications.find((notification) => notification.id === id);
  if (!item) return;
  await markNotificationRead(id, true);
  byId("notificationDropdown").hidden = true;
  if (item.related_entity === "order") {
    setView("orders");
    const orderItem = state.data.orders.find((order) => order.id === item.related_entity_id);
    if (orderItem) startOrderEdit(orderItem.id);
  } else if (item.related_entity === "lead") {
    setView("leads");
    openLeadDialog(item.related_entity_id);
  } else if (item.related_entity === "marketplace_log") {
    setView("marketplace");
    setMarketplaceView("api-logs");
  } else if (item.related_entity === "access_request") {
    setView("approvals");
  } else if (item.related_entity === "announcement") {
    setView("whatsnew");
  } else if (item.related_entity === "support_ticket") {
    setView("support");
  } else if (item.related_entity === "subscription") {
    setView("subscription");
  } else if (item.related_entity === "inventory") {
    setView("materials");
    startInventoryEdit(item.related_entity_id);
  }
}

function renderTrialBanner() {
  const banner = byId("trialBanner");
  if (!banner) return;
  const alert = getSubscriptionAlert();
  if (!alert) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.className = `trial-banner ${alert.level === "critical" ? "critical" : "warning"}`;
  banner.innerHTML = `<div><strong>${html(alert.title)}</strong><span>${html(alert.message)}</span></div><button type="button" class="secondary-btn" data-action="open-subscription">Ver assinatura</button>`;
  bindActions();
}

function renderSubscriptionPortal() {
  const target = byId("subscriptionSummary");
  const table = byId("billingHistoryTable");
  if (!target || !table) return;
  const subscription = state.subscription;
  const plan = state.subscriptionPlans.find((item) => item.code === subscription?.plan_code);
  if (!subscription) {
    target.innerHTML = `<div class="panel"><div class="empty-chart">Assinatura não encontrada para esta empresa.</div></div>`;
    table.innerHTML = `<tr><td colspan="5">Nenhuma cobrança registrada.</td></tr>`;
    return;
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const importedSales = state.marketplaceSales.filter((item) => new Date(item.created_at) >= monthStart).length;
  const users = state.activeUsers.length || 1;
  const latestPayment = state.subscriptionPayments[0];
  const paymentMetadata = subscription.metadata || {};
  const cardLastFour = paymentMetadata.card_last_four || paymentMetadata.last_four || latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
  const cardBrand = paymentMetadata.card_brand || latestPayment?.metadata?.card_brand || latestPayment?.payment_method || "";
  const hasRegisteredPaymentMethod = Boolean((paymentMetadata.payment_method_registered !== false) && (cardLastFour || paymentMetadata.payment_method_registered || subscription.provider_subscription_id || latestPayment?.payment_method));
  const paymentMethod = cardLastFour ? `${cardBrand ? `${cardBrand} ` : "Cartão "}final ${cardLastFour}` : hasRegisteredPaymentMethod ? "Cartão cadastrado no Mercado Pago" : "Não cadastrado";
  const renewalAt = subscription.next_payment_at || subscription.current_period_end;
  const grace = getSubscriptionGraceInfo(subscription, latestPayment);
  const renewalMissed = subscriptionRenewalMissed(subscription, latestPayment);
  const paymentDetail = subscription.last_payment_reason
    || latestPayment?.failure_reason
    || latestPayment?.status_detail
    || latestPayment?.metadata?.reason
    || latestPayment?.metadata?.status_detail
    || latestPayment?.metadata?.message
    || latestPayment?.metadata?.provider_status
    || "-";
  const lastPaymentAttemptAt = subscription.last_payment_attempt_at
    || latestPayment?.attempted_at
    || latestPayment?.created_at;
  const health = getCompanyHealth();
  const subscriptionPrice = getSubscriptionPrice(plan, subscription);
  const userLimit = Number(plan?.limits?.users || 0);
  const salesLimit = Number(plan?.limits?.marketplace_sales_month || 0);
  const connectedMarketplaces = state.marketplaceAccounts.map((item) => marketplaceDisplayName(item.marketplace));
  const usagePercent = (value, limit) => limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  target.innerHTML = `
    <section class="subscription-premium-hero">
      <div class="subscription-plan-intro">
        <span>Seu plano atual</span>
        <div><strong>${html(plan?.name || subscription.plan_code)}</strong><span class="badge ${html(subscription.status)}">${html(subscriptionStatusText(subscription.status))}</span></div>
        <p>Todas as funcionalidades disponíveis para impulsionar sua operação.</p>
        <div class="inline-actions"><button class="secondary-btn" type="button" data-action="scroll-subscription-payment">Gerenciar assinatura</button><button class="secondary-btn" type="button" data-action="scroll-subscription-plans">Alterar plano</button></div>
      </div>
      <div class="subscription-renewal-timeline">
        <article><i></i><span>Renovação automática</span><strong>${renewalAt ? formatDate(renewalAt) : "Não agendada"}</strong></article>
        <article><i></i><span>Método de pagamento</span><strong>${html(paymentMethod)}</strong></article>
        <article><i></i><span>Valor da mensalidade</span><strong>${money.format(subscriptionPrice)} / mês</strong></article>
      </div>
      <div class="subscription-health-visual ${health.level}"><i></i><div><strong>${html(health.label)}</strong><span>${html(health.detail)}</span></div></div>
    </section>
    <section class="subscription-usage-panel panel">
      <div class="panel-head"><div><h3>Resumo do uso</h3><span>Acompanhe o consumo atual dos principais recursos do plano.</span></div></div>
      <div class="subscription-usage-grid">
        <article><span>Usuários</span><strong>${users} / ${userLimit || "-"}</strong><small>${usagePercent(users, userLimit)}% utilizado</small><i style="--usage:${usagePercent(users, userLimit)}%"></i><small>Limite de ${userLimit || "usuários ilimitados"}</small></article>
        <article><span>Vendas importadas</span><strong>${importedSales} / ${salesLimit || "-"}</strong><small>${usagePercent(importedSales, salesLimit)}% utilizado</small><i style="--usage:${usagePercent(importedSales, salesLimit)}%"></i><small>Limite de ${salesLimit || "vendas ilimitadas"} por mês</small></article>
        <article><span>Backup automático</span><strong>${plan?.features?.automatic_backup ? "Ativo" : "Não incluído"}</strong><small>${plan?.features?.automatic_backup ? "Proteção periódica habilitada" : "Disponível em planos superiores"}</small></article>
        <article><span>Marketplaces</span><strong>${connectedMarketplaces.length} ativo${connectedMarketplaces.length === 1 ? "" : "s"}</strong><small>${html(connectedMarketplaces.join(", ") || "Nenhuma conta conectada")}</small></article>
      </div>
    </section>
    <section id="subscriptionPaymentSection" class="subscription-payment-premium panel ${!hasRegisteredPaymentMethod ? "missing-payment" : ""}">
      <div><span>Método de pagamento</span><strong>${html(paymentMethod)}</strong><small>Próxima cobrança: ${subscription.next_payment_at ? formatDateTime(subscription.next_payment_at) : "Não agendada"} • Valor: ${money.format(subscriptionPrice)}</small><small id="subscriptionPaymentMessage" class="form-message"></small></div>
      ${hasRegisteredPaymentMethod ?
           `<div class="subscription-card-actions"><button class="primary-btn" type="button" data-payment-action="update-card">Trocar cartão</button><button class="secondary-btn" type="button" data-payment-action="activate">Adicionar novo cartão</button><button class="secondary-btn" type="button" data-payment-action="reconcile-billing">Atualizar cobrança</button><button class="secondary-btn danger" type="button" data-payment-action="remove-card">Excluir cartão</button></div>`
          : subscriptionPrice > 0 ?
             `<button class="primary-btn" type="button" data-payment-action="activate">Cadastrar forma de pagamento</button>`
            : ""}
    </section>
    ${subscription.pending_plan_code ? `<div class="scheduled-plan-change">
      <strong>Alteração agendada</strong>
      <span>O plano ${html(state.subscriptionPlans.find((item) => item.code === subscription.pending_plan_code)?.name || subscription.pending_plan_code)}
      entrará em vigor em ${formatDateTime(subscription.pending_plan_effective_at)}. Não haverá cobrança antes dessa data.</span>
    </div>` : ""}
    <div class="subscription-metrics subscription-renewal-details">
      ${subscriptionMetric("Próxima cobrança", subscription.next_payment_at ? formatDateTime(subscription.next_payment_at) : "Não agendada")}
      ${subscriptionMetric("Status da renovação", renewalMissed ? "Não renovada" : "Em dia")}
      ${subscriptionMetric("Período de tolerância", grace.detail)}
      ${subscriptionMetric("Método de pagamento", paymentMethod)}
      ${subscriptionMetric("Última tentativa", lastPaymentAttemptAt ? formatDateTime(lastPaymentAttemptAt) : "-")}
      ${subscriptionMetric("Último motivo", paymentDetail)}
    </div>`;
  table.innerHTML = state.subscriptionPayments.length ? state.subscriptionPayments.map((item) => {
    const meta = item.metadata || {};
    const rowCardLastFour = meta.card_last_four || meta.last_four || "";
    const rowCardBrand = meta.card_brand || item.payment_method || "";
    const detail = item.failure_reason || item.status_detail || meta.reason || meta.status_detail || meta.message || meta.provider_status || "-";
    return `<tr><td>${formatDateTime(item.attempted_at || item.paid_at || item.created_at)}</td><td>${money.format(Number(item.amount || 0))}</td><td><span class="badge ${html(item.status)}">${html(paymentStatusText(item.status))}</span></td><td>${html(item.payment_method || item.provider || "-")}</td><td>${rowCardLastFour ? html(`${rowCardBrand ? `${rowCardBrand} ` : ""}final ${rowCardLastFour}`) : "-"}</td><td>${html(detail)}</td></tr>`;
  }).join("") : `<tr><td colspan="6">Nenhuma cobrança registrada.</td></tr>`;
  renderSubscriptionPlanOptions(plan);
  bindActions();
}

function getSubscriptionPrice(plan, subscription = state.subscription) {
  return Number(subscription?.metadata?.custom_price_monthly || plan?.price_monthly || 0);
}

function renderOperationalSummary(viewId, summaryId, metrics) {
  const view = byId(viewId);
  if (!view) return;
  let target = byId(summaryId);
  if (!target) {
    target = document.createElement("section");
    target.id = summaryId;
    target.className = "operational-summary-grid";
    view.prepend(target);
  }
  target.innerHTML = metrics.map(([label, value, note, tone]) => `
    <article class="operational-summary-card ${html(tone || "teal")}">
      <i aria-hidden="true"></i>
      <div><span>${html(label)}</span><strong>${html(String(value))}</strong><small>${html(note || "")}</small></div>
    </article>
  `).join("");
}

function addDays(dateValue, days) {
  if (!dateValue) return null;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + days * 86400000).toISOString();
}

function subscriptionPaymentApproved(payment) {
  return ["approved", "paid", "authorized"].includes(String(payment?.status || "").toLowerCase());
}

function subscriptionRenewalMissed(subscription, latestPayment) {
  if (!subscription || subscription.plan_code === "free" || String(subscription.status).toLowerCase() === "free") return false;
  const dueAt = subscription.next_payment_at || subscription.current_period_end;
  if (!dueAt) return false;
  const dueTime = new Date(dueAt).getTime();
  return Number.isFinite(dueTime) && dueTime <= Date.now() && !subscriptionPaymentApproved(latestPayment);
}

function getSubscriptionGraceInfo(subscription, latestPayment) {
  if (!subscription || subscription.plan_code === "free" || String(subscription.status).toLowerCase() === "free") {
    return { level: "neutral", detail: "Não aplicável" };
  }
  const renewalAt = subscription.next_payment_at || subscription.current_period_end;
  const graceUntil = subscription.grace_ends_at || addDays(renewalAt, 5);
  const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
  const graceTime = graceUntil ? new Date(graceUntil).getTime() : null;
  const now = Date.now();
  if (String(subscription.status).toLowerCase() === "past_due" || (renewalTime && renewalTime <= now && graceTime && graceTime > now && !subscriptionPaymentApproved(latestPayment))) {
    return { level: "warning", detail: `Em tolerância até ${formatDateTime(graceUntil)}` };
  }
  if (renewalTime && graceTime && graceTime <= now && !subscriptionPaymentApproved(latestPayment)) {
    return { level: "danger", detail: `Tolerância encerrada em ${formatDateTime(graceUntil)}` };
  }
  return { level: "success", detail: graceUntil ? `Tolerância prevista até ${formatDateTime(graceUntil)}` : "-" };
}

function renderSubscriptionPlanOptions(currentPlan) {
  const target = byId("subscriptionPlanOptions");
  if (!target) return;
  const currentPrice = Number(currentPlan?.price_monthly || 0);
  const activeUsers = state.activeUsers.length || 1;
  const orderedPlans = state.subscriptionPlans
    .filter((plan) => plan.active !== false)
    .sort((a, b) => Number(a.limits?.users || 0) - Number(b.limits?.users || 0));
  const columns = orderedPlans.map((plan) => {
    const usersLimit = Number(plan.limits?.users || 0);
    const isCurrent = plan.code === currentPlan?.code;
    const isEnterprise = plan.code === "enterprise";
    const isUpgrade = isEnterprise
      || usersLimit > Number(currentPlan?.limits?.users || 0)
      || Number(plan.price_monthly || 0) > currentPrice;
    const blockedUsers = usersLimit > 0 && activeUsers > usersLimit;
    const priceLabel = isEnterprise && !Number(plan.price_monthly) ?
       "Sob consulta"
      : `${money.format(Number(plan.price_monthly || 0))}<small>/mês</small>`;
    const button = isCurrent ?
       `<button class="secondary-btn" type="button" disabled>Plano atual</button>`
      : `<button class="${isUpgrade ? "primary-btn" : "secondary-btn"}" type="button" data-request-plan="${html(plan.code)}">${isEnterprise ? "Falar com vendas" : isUpgrade ? "Solicitar upgrade" : "Solicitar downgrade"}</button>`;
    return { plan, usersLimit, isCurrent, priceLabel, button, blockedUsers };
  });
  const featureCell = (enabled, text = "") => enabled ? `<span class="feature-yes">${text || "✓"}</span>` : `<span class="feature-no">×</span>`;
  target.innerHTML = `
    <div class="plan-comparison-wrap">
      <table class="plan-comparison-table">
        <thead><tr><th>Recurso</th>${columns.map(({ plan, isCurrent, priceLabel }) => `<th class="${isCurrent ? "current" : ""}"><strong>${html(plan.name)}</strong><span>${priceLabel}</span>${isCurrent ? `<small>Atual</small>` : ""}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><th>Usuários</th>${columns.map(({ usersLimit }) => `<td>${usersLimit || "Ilimitado"}</td>`).join("")}</tr>
          <tr><th>Vendas importadas/mês</th>${columns.map(({ plan }) => `<td>${Number(plan.limits?.marketplace_sales_month || 0)}</td>`).join("")}</tr>
          <tr><th>Marketplaces</th>${columns.map(({ plan }) => `<td>${[plan.features?.mercado_livre, plan.features?.shopee, plan.features?.amazon].filter(Boolean).length || "-"}</td>`).join("")}</tr>
          <tr><th>Backup automático</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.automatic_backup)}</td>`).join("")}</tr>
          <tr><th>Relatórios avançados</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.advanced_reports)}</td>`).join("")}</tr>
          <tr><th>White label</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.white_label)}</td>`).join("")}</tr>
          <tr class="plan-actions-row"><th></th>${columns.map(({ button, blockedUsers, usersLimit }) => `<td>${button}${blockedUsers ? `<small class="plan-warning">Desative ${activeUsers - usersLimit} usuário(s) ao fim do plano.</small>` : ""}</td>`).join("")}</tr>
        </tbody>
      </table>
    </div>`;
}

async function requestPlanChange(planCode) {
  const targetPlan = state.subscriptionPlans.find((plan) => plan.code === planCode);
  const currentPlan = state.subscriptionPlans.find((plan) => plan.code === state.subscription?.plan_code);
  const isDowngrade = Number(targetPlan?.price_monthly || 0) < Number(currentPlan?.price_monthly || 0);
  if (isDowngrade) {
    openDowngradeDialog(targetPlan);
    return;
  }
  const message = byId("subscriptionChangeMessage");
  message.textContent = "Validando alteração...";
  message.className = "form-message";
  try {
    if (Number(targetPlan?.price_monthly || 0) > 0) {
      message.textContent = "Informe o cartao para ativar o plano.";
      await openPaymentMethodDialog(planCode);
      return;
    }
    const { data, error } = await state.supabase.rpc("request_subscription_plan_change", {
      target_plan_code: planCode,
    });
    if (error) throw error;
    message.textContent = `Solicitação para o plano ${targetPlan?.name || planCode} registrada. A alteração será concluída após a confirmação necessária.`;
    message.className = "form-message success";
    await recordAudit(
      "subscription_plan_change_requested",
      "subscription",
      data?.id || planCode,
      "",
      { plan_code: state.subscription?.plan_code || null },
      { plan_code: planCode },
      "manual",
    );
  } catch (error) {
    message.textContent = error.message || "Não foi possível solicitar a alteração.";
    message.className = "form-message error";
  }
}

function openDowngradeDialog(targetPlan) {
  const dialog = byId("downgradeDialog");
  const targetLimit = Number(targetPlan?.limits?.users || 0);
  const users = state.activeUsers.filter((item) => String(item.email || item.user_email || "").toLowerCase() !== state.activeUserEmail);
  const requiredRemoval = targetLimit > 0 ? Math.max(state.activeUsers.length - targetLimit, 0) : 0;
  byId("downgradeForm").elements.plan_code.value = targetPlan.code;
  byId("downgradeDialogTitle").textContent = `Agendar plano ${targetPlan.name}`;
  const effectiveAt = state.subscription?.current_period_end || state.subscription?.next_payment_at || state.subscription?.trial_end;
  byId("downgradeEffectiveText").textContent = `O plano atual continuará válido até ${effectiveAt ? formatDateTime(effectiveAt) : "o fim do ciclo vigente"}. Nenhuma cobrança será feita agora.`;
  byId("downgradeUsersInstruction").textContent = requiredRemoval ?
     `Selecione pelo menos ${requiredRemoval} usuário(s) para desativar quando o novo plano entrar em vigor.`
    : "Nenhum usuário precisa ser removido para este plano.";
  byId("downgradeUserList").innerHTML = users.length ? users.map((user) => {
    const email = user.email || user.user_email || "";
    return `<label><input type="checkbox" name="deactivate_users" value="${html(email)}" /> <span><strong>${html(user.name || email)}</strong><small>${html(email)}</small></span></label>`;
  }).join("") : `<div class="empty-chart">Nenhum usuário adicional cadastrado.</div>`;
  byId("downgradeMessage").textContent = "";
  dialog.dataset.requiredRemoval = String(requiredRemoval);
  dialog.showModal();
}

async function submitScheduledDowngrade(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const selectedUsers = [...form.querySelectorAll('input[name="deactivate_users"]:checked')].map((input) => input.value);
  const requiredRemoval = Number(byId("downgradeDialog").dataset.requiredRemoval || 0);
  const message = byId("downgradeMessage");
  if (selectedUsers.length < requiredRemoval) {
    message.textContent = `Selecione mais ${requiredRemoval - selectedUsers.length} usuário(s).`;
    return;
  }
  message.textContent = "Agendando alteração...";
  try {
    const result = await callSubscriptionApi({
      action: "schedule-downgrade",
      plan_code: form.elements.plan_code.value,
      deactivate_users: selectedUsers,
    });
    message.textContent = `Downgrade agendado para ${formatDateTime(result.effective_at)}.`;
    message.className = "form-message success";
    await loadRemoteData();
    setTimeout(() => byId("downgradeDialog").close(), 800);
  } catch (error) {
    message.textContent = error.message || "Não foi possível agendar o downgrade.";
    message.className = "form-message error";
  }
}

async function handlePaymentAction(action) {
  const message = byId("subscriptionPaymentMessage");
  const button = document.querySelector(`[data-payment-action="${action}"]`);
  if (message) {
    message.textContent = "Abrindo ambiente seguro do Mercado Pago...";
    message.className = "form-message";
  }
  if (button) button.disabled = true;
  try {
    if (action === "activate" || action === "update-card") {
      await openPaymentMethodDialog();
      return;
    }
    if (action === "remove-card") {
      const confirmed = await showAppConfirm(
        "Remover forma de pagamento",
        "O cartão será removido do FlowOps e a renovação automática ficará pausada até cadastrar uma nova forma de pagamento. Deseja continuar?"
      );
      if (!confirmed) return;
      await callSubscriptionApi({ action: "remove-payment-method" });
      if (message) {
        message.textContent = "Cartão removido. Cadastre uma nova forma de pagamento antes da próxima renovação.";
        message.className = "form-message success";
      }
      await loadRemoteData();
      return;
    }
    if (action === "reconcile-billing") {
      const result = await callSubscriptionApi({ action: "reconcile-billing" });
      if (message) {
        message.textContent = result.message || "Cobrança verificada no Mercado Pago.";
        message.className = "form-message success";
      }
      flashActionMessage("Cobrança e assinatura atualizadas.");
      await loadRemoteData();
      return;
    }
  } catch (error) {
    if (byId("paymentMethodDialog")?.open) {
      await showPaymentCheckoutFallback(error.message || "Nao foi possivel abrir o Mercado Pago.");
    }
    if (message) {
      message.textContent = error.message || "Nao foi possivel abrir o Mercado Pago.";
      message.className = "form-message error";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function callSubscriptionApi(payload) {
  const { data: sessionData } = await state.supabase.auth.getSession();
  const response = await fetch(window.SUPABASE_CONFIG.MERCADO_PAGO_SUBSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(normalizeApiError(result.error, "Falha ao processar a assinatura."));
  return result;
}

async function openPaymentMethodDialog(planCode = "") {
  const dialog = byId("paymentMethodDialog");
  const message = byId("paymentMethodMessage");
  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
  const brickContainer = byId("cardPaymentBrick_container");
  if (brickContainer) brickContainer.innerHTML = `<div class="payment-loading">Preparando formulário seguro do Mercado Pago...</div>`;
  if (!dialog.open) dialog.showModal();
  try {
    await loadMercadoPagoSdk();
    if (window.cardPaymentBrickController) {
      window.cardPaymentBrickController.unmount?.().catch(() => null);
      window.cardPaymentBrickController = null;
    }
    const mp = new window.MercadoPago(window.SUPABASE_CONFIG.MERCADO_PAGO_PUBLIC_KEY, { locale: "pt-BR" });
    const plan = state.subscriptionPlans.find((item) => item.code === (planCode || state.subscription?.plan_code));
    if (!brickContainer) throw new Error("Area de pagamento nao encontrada.");
    brickContainer.innerHTML = `
      <form id="mpCardForm" class="mp-card-form">
        <div class="mp-card-form-grid">
          <label class="mp-field mp-field-wide">
            <span>Número do cartão</span>
            <input id="form-checkout__cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" required>
          </label>
          <label class="mp-field">
            <span>Validade</span>
            <input id="form-checkout__expirationDate" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" required>
          </label>
          <label class="mp-field">
            <span>CVV</span>
            <input id="form-checkout__securityCode" type="text" inputmode="numeric" autocomplete="cc-csc" placeholder="CVV" required>
          </label>
          <label class="mp-field mp-field-wide">
            <span>Nome no cartão</span>
            <input id="form-checkout__cardholderName" type="text" autocomplete="cc-name" required>
          </label>
          <label class="mp-field">
            <span>Documento</span>
            <select id="form-checkout__identificationType"></select>
          </label>
          <label class="mp-field">
            <span>Número do documento</span>
            <input id="form-checkout__identificationNumber" type="text" inputmode="numeric" required>
          </label>
          <label class="mp-field mp-field-wide">
            <span>E-mail</span>
            <input id="form-checkout__cardholderEmail" type="email" value="${html(state.currentUserEmail || "")}" autocomplete="email" required>
          </label>
        </div>
        <select id="form-checkout__issuer" class="sr-only" aria-hidden="true"></select>
        <select id="form-checkout__installments" class="sr-only" aria-hidden="true"></select>
        <button id="mpCardFormSubmit" class="primary-btn" type="submit">Cadastrar cartão</button>
      </form>
    `;
    let paymentSubmitting = false;
    const cardForm = mp.cardForm({
      amount: String(Math.max(getSubscriptionPrice(plan), 1)),
      iframe: false,
      form: {
        id: "mpCardForm",
        cardNumber: { id: "form-checkout__cardNumber", placeholder: "0000 0000 0000 0000" },
        expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/AA" },
        securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
        cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nome impresso no cartão" },
        issuer: { id: "form-checkout__issuer", placeholder: "Banco emissor" },
        installments: { id: "form-checkout__installments", placeholder: "Parcelas" },
        identificationType: { id: "form-checkout__identificationType", placeholder: "Tipo" },
        identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "Numero" },
        cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "email@empresa.com" },
      },
      callbacks: {
        onFormMounted: (error) => {
          if (error) throw error;
          const readyMessage = byId("paymentMethodMessage");
          if (readyMessage) {
            readyMessage.textContent = "";
            readyMessage.className = "form-message";
          }
        },
        onSubmit: async (event) => {
          event.preventDefault();
          if (paymentSubmitting) return;
          paymentSubmitting = true;
          const submit = byId("mpCardFormSubmit");
          try {
            if (submit) {
              submit.disabled = true;
              submit.textContent = "Cadastrando cartão...";
            }
            const target = byId("paymentMethodMessage");
            if (target) {
              target.textContent = "Validando cartão com o Mercado Pago...";
              target.className = "form-message";
            }
            normalizeMercadoPagoCardFields();
            const formData = cardForm.getCardFormData();
            if (!formData?.token) throw new Error("Não foi possível validar os dados do cartão.");
            const cardDigits = String(byId("form-checkout__cardNumber")?.value || "").replace(/\D/g, "");
            await callSubscriptionApi({
              action: "update-payment-method",
              card_token_id: formData.token,
              card_last_four: cardDigits.slice(-4),
              card_brand: formData.paymentMethodId || "",
              plan_code: planCode || state.subscription?.plan_code || ""
            });
            const success = byId("paymentMethodMessage");
            if (success) {
              success.textContent = planCode ?
                 "Plano e cartão cadastrados com sucesso."
                : "Cartão cadastrado para as próximas cobranças.";
              success.className = "form-message success";
            }
            await loadRemoteData();
            setTimeout(closePaymentMethodDialog, 800);
          } catch (error) {
            const target = byId("paymentMethodMessage");
            if (target) {
              const raw = error.message || "Nao foi possivel cadastrar o cartao.";
              target.textContent = paymentErrorMessage(raw);
              target.className = "form-message error";
            }
            await refreshPaymentCardFormAfterError(planCode);
          }
        },
        onFetching: () => {
          const target = byId("paymentMethodMessage");
          if (target) {
            target.textContent = "Consultando dados seguros do Mercado Pago...";
            target.className = "form-message";
          }
        },
        onValidityChange: () => {
          const target = byId("paymentMethodMessage");
          if (target?.classList.contains("error")) {
            target.textContent = "";
            target.className = "form-message";
          }
        },
        onError: (error) => {
          const target = byId("paymentMethodMessage");
          if (target) {
            target.textContent = normalizeApiError(error, "Nao foi possivel carregar o formulario.");
            target.className = "form-message error";
          }
        },
      },
    });
    window.cardPaymentBrickController = { unmount: () => Promise.resolve(cardForm?.unmount?.()) };
  } catch (error) {
    showPaymentCheckoutFallback(error.message || "Nao foi possivel carregar o formulario do Mercado Pago.", planCode);
  }
}

function normalizeMercadoPagoCardFields() {
  const expiration = byId("form-checkout__expirationDate");
  if (!expiration) return;
  const digits = String(expiration.value || "").replace(/\D/g, "");
  if (digits.length >= 6) {
    expiration.value = `${digits.slice(0, 2)}/${digits.slice(-2)}`;
  } else if (digits.length === 4) {
    expiration.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
}

function paymentErrorMessage(raw) {
  const text = String(raw || "");
  if (text.includes("without cvv validation")) {
    return "Nao foi possivel validar o CVV. Confira o codigo de seguranca e tente novamente.";
  }
  if (text.toLowerCase().includes("card token was used")) {
    return "O Mercado Pago recusou esta tentativa por seguranca. Gere um novo token preenchendo o formulario novamente.";
  }
  return text || "Nao foi possivel cadastrar o cartao.";
}

async function refreshPaymentCardFormAfterError(planCode = "") {
  const brickContainer = byId("cardPaymentBrick_container");
  const message = byId("paymentMethodMessage");
  if (!brickContainer) return;
  const controller = window.cardPaymentBrickController;
  window.cardPaymentBrickController = null;
  if (controller) await controller.unmount?.().catch(() => null);
  if (message) {
    message.textContent = "Por seguranca, preencha os dados novamente para gerar um novo token.";
    message.className = "form-message error";
  }
  setTimeout(() => openPaymentMethodDialog(planCode), 900);
}

function showPaymentCheckoutFallback(reason, planCode = "") {
  const message = byId("paymentMethodMessage");
  const brickContainer = byId("cardPaymentBrick_container");
  if (window.cardPaymentBrickController) {
    window.cardPaymentBrickController.unmount().catch(() => null);
    window.cardPaymentBrickController = null;
  }
  if (message) {
    message.textContent = reason;
    message.className = "form-message error";
  }
  if (!brickContainer) return;
  brickContainer.innerHTML = `
    <div class="payment-fallback">
      <strong>Nao foi possivel carregar o formulario agora.</strong>
      <span>Verifique a conexao e tente novamente. O pagamento permanece dentro do FlowOps pelo Mercado Pago.</span>
      <button class="primary-btn" type="button" id="retryMercadoPagoBrickBtn">Tentar novamente</button>
    </div>
  `;
  byId("retryMercadoPagoBrickBtn")?.addEventListener("click", () => openPaymentMethodDialog(planCode));
}
function closePaymentMethodDialog() {
  const dialog = byId("paymentMethodDialog");
  if (dialog?.open) dialog.close();
  const brickContainer = byId("cardPaymentBrick_container");
  if (brickContainer) brickContainer.innerHTML = "";
  const message = byId("paymentMethodMessage");
  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
  const controller = window.cardPaymentBrickController;
  window.cardPaymentBrickController = null;
  if (controller) {
    setTimeout(() => controller.unmount?.().catch(() => null), 0);
  }
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => reject(new Error("O Mercado Pago demorou para responder.")), 8000);
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Nao foi possivel carregar o Mercado Pago."));
    };
    document.head.appendChild(script);
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

function normalizeApiError(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.message || value.error || value.cause?.[0]?.description || fallback;
}

function subscriptionMetric(label, value) {
  return `<article><span>${html(label)}</span><strong>${html(String(value))}</strong></article>`;
}

function getCompanyHealth() {
  const mlConnected = state.marketplaceAccounts.some((item) => item.marketplace === "Mercado Livre");
  const backupOk = state.backupRuns.some((item) => item.status === "success");
  const subscriptionOk = ["active", "trial", "free"].includes(state.subscription?.status);
  const score = [mlConnected, backupOk, subscriptionOk].filter(Boolean).length;
  if (score === 3) return { level: "healthy", label: "Saudável", detail: "Integração, backup e assinatura em ordem." };
  if (score >= 2) return { level: "attention", label: "Atenção", detail: "Existe uma configuração importante pendente." };
  return { level: "risk", label: "Em risco", detail: "Revise assinatura, integração e backup." };
}

async function submitSupportTicket(event) {
  event.preventDefault();
  if (!state.supabase || !state.organizationId) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const { error } = await state.supabase.from("saas_support_tickets").insert({
    organization_id: state.organizationId,
    created_by: state.activeUserEmail,
    category: values.category,
    subject: String(values.subject || "").trim(),
    message: String(values.message || "").trim(),
    priority: values.priority || "Normal",
  });
  if (error) {
    alert(`Não foi possível enviar o chamado: ${error.message}`);
    return;
  }
  form.reset();
  await loadRemoteData();
  renderSupportPortal();
  flashActionMessage("Chamado enviado para o suporte.");
}

function renderSupportPortal() {
  const target = byId("supportTicketsList");
  if (!target) return;
  target.innerHTML = state.supportTickets.length ? state.supportTickets.map((ticket) => `
    <article class="list-row support-ticket">
      <div><strong>${html(ticket.subject)}</strong><span>${html(ticket.category)} • ${formatDateTime(ticket.created_at)}</span><p>${html(ticket.message)}</p>${ticket.admin_response ? `<div class="support-response"><strong>Resposta do suporte</strong><p>${html(ticket.admin_response)}</p></div>` : ""}</div>
      <span class="badge ${ticket.status === "Fechado" ? "done" : ticket.priority === "Urgente" ? "danger-badge" : "queue"}">${html(ticket.status)}</span>
    </article>
  `).join("") : `<div class="empty-chart">Nenhum chamado enviado.</div>`;
}

function renderWhatsNew() {
  const announcements = byId("announcementsList");
  const changelog = byId("changelogList");
  if (!announcements || !changelog) return;
  announcements.innerHTML = state.announcements.length ? state.announcements.map((item) => `
    <article class="list-row announcement-row"><div><strong>${html(item.title)}</strong><span>${html(item.category)} • ${formatDateTime(item.published_at)}</span><p>${html(item.message)}</p></div></article>
  `).join("") : `<div class="empty-chart">Nenhum comunicado publicado.</div>`;
  changelog.innerHTML = state.changelog.length ? state.changelog.map((item) => `
    <article class="list-row changelog-row"><span class="version-badge">${html(item.version)}</span><div class="changelog-copy"><strong>${html(item.title)}</strong><span>${html(item.category)} • ${formatDateTime(item.published_at)}</span><p>${html(item.description)}</p></div></article>
  `).join("") : `<div class="empty-chart">Nenhuma novidade publicada.</div>`;
}

function subscriptionStatusText(value) {
  return ({ free: "Gratuito", trial: "Em teste", pending: "Aguardando pagamento", active: "Ativo", past_due: "Pagamento pendente", paused: "Pausado", cancelled: "Cancelado", suspended: "Suspenso" })[value] || value || "-";
}

function paymentStatusText(value) {
  return ({ approved: "Aprovado", pending: "Pendente", rejected: "Recusado", refunded: "Estornado", cancelled: "Cancelado" })[value] || value || "-";
}

function renderCommercialDashboard() {
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

function renderTopProducts() {
  const target = byId("topProductsList");
  if (!target) return;
  const days = state.topProductsPeriod === "all" ? null : Number(state.topProductsPeriod || 30);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const rows = state.data.orders.filter((item) => {
    if (!(item.status === "Entregue" || Number(item.received || 0) > 0)) return false;
    const date = new Date(item.deliveryDate || item.createdAt || 0).getTime();
    return !days || !date || date >= cutoff;
  });
  const grouped = new Map();
  rows.forEach((item) => {
    const key = item.description || "Produto";
    const current = grouped.get(key) || { title: key, quantity: 0, revenue: 0, origin: getMarketplaceLabel(item) };
    current.quantity += Number(item.quantity || 1);
    current.revenue += Number(item.received || item.charged || 0);
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

function renderFollowUps() {
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


function getFinancialMetrics() {
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

