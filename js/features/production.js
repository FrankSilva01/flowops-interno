import { state, PRODUCTION_STAGES, PRIORITY_OPTIONS, STATUS_OPTIONS, normalizeStage, normalizeOrderStatus } from "../core/state.js";
import { byId, html, formatDate, uniqueValues, filterRows } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import {
  sortOrders, getOrderPriority, getMarketplaceLabel, getOrderCode, getOrderMarketplaceChannel,
  renderSlaBadge, renderInlineSelect, updateOrderInline,
} from "./orders.js";
// O card do kanban abre o painel deslizante generico (#orderDrawer,
// data-action="open-order-drawer") em vez de exigir clicar em "Editar"
// pra ver qualquer detalhe. Encomendas passou a usar um painel FIXO
// inline (mestre-detalhe, ver orders.js:renderOrderDetailPanel) em vez
// desse painel deslizante - mas o kanban continua com o deslizante, ja
// que aqui nao ha uma lista mestre pra acompanhar um painel fixo (o
// board e a view principal, precisa da largura toda).
import { getResponsibleNames } from "./users.js";

export function renderProduction() {
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
  board.querySelectorAll(".kanban-card button, .kanban-card select").forEach((el) => {
    el.addEventListener("click", (event) => event.stopPropagation());
  });
  bindKanban();
  bindActions();
}

export function filterProductionOrders(rows) {
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

export function renderProductionSummary() {
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

export function isProductionEligible(item) {
  if (!item.quoteStage) return true;
  return ["Aprovado", "Convertido em encomenda"].includes(item.quoteStage);
}

export function renderKanbanCard(item) {
  const priority = getOrderPriority(item);
  const status = normalizeOrderStatus(item.status);
  const marketplaceLabel = getMarketplaceLabel(item);
  return `
    <article class="kanban-card" draggable="${state.canEdit}" data-id="${html(item.id)}" data-action="open-order-drawer" tabindex="0" role="button" aria-label="Ver detalhes de ${html(getOrderCode(item))}">
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

export function renderKanbanFilters() {
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

export function bindKanban() {
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
