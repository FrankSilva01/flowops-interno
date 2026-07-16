import {
  state, money, PRODUCTION_STAGES, PRIORITY_OPTIONS, STATUS_OPTIONS,
  normalizeOrderStatus, normalizeStage, defaultChecklist, saveData,
} from "../core/state.js";
import { byId, html, safeUrl, formatDate, formatDateTime, formatRelativeTime, flashActionMessage, nextId, number, renderOperationalSummary, filterRows, showAppConfirm, showAppMessage, showAppPrompt } from "../core/dom.js";
import { bindActions, render } from "../core/router.js";
import { ensureCapability, ensureCanEdit } from "../core/permissions.js";
import { persist, removeRemote, loadRemoteData } from "../data/remote.js";
import { recordAudit } from "./logs.js";
import { getResponsibleNames } from "./users.js";
import { renderSettingsData } from "./backup.js";
import { pick, normalizeText, normalizeDate, normalizeKey } from "../core/importer.js";
import { createNotification } from "./notifications.js";
import { renderLogisticsBadge } from "./logistics.js";
import { getProductForOrder, getProductAssetInfo, renderProductionAssetShortcut } from "./product-assets.js";

export function renderOrders() {
  const rows = sortOrders(filterOrders(filterRows(state.data.orders, ["orderCode", "marketplaceOrderCode", "description", "client", "material", "status", "responsible", "productionStage", "stlLink", "referenceImageUrl", "internalNotes", "tags"])));
  state.selectedOrderIds = (state.selectedOrderIds || []).filter((id) => state.data.orders.some((item) => item.id === id));
  renderOperationalSummary("ordersView", "ordersPageSummary", [
    ["Encomendas", rows.length, "pedidos filtrados", "teal"],
    ["A preparar", rows.filter((item) => normalizeOrderStatus(item.status) === "A preparar").length, "priorize prazos e material", "blue"],
    ["Produzindo", rows.filter((item) => !["Em fila", "Entregue"].includes(normalizeStage(item.productionStage || item.status))).length, `${rows.filter((item) => normalizeStage(item.productionStage || item.status) === "Em fila").length} em fila`, "purple"],
    ["A receber", money.format(rows.reduce((sum, item) => sum + Math.max(0, Number(item.charged || 0) - Number(item.received || 0)), 0)), "valores pendentes", "amber"],
  ]);
  const searchInput = byId("ordersSearchInput");
  if (searchInput && document.activeElement !== searchInput) searchInput.value = state.query;
  byId("ordersTable").innerHTML = rows.map(renderOrderTableRow).join("");
  const selectedOrder = rows.find((item) => item.id === state.selectedOrderId) || rows[0] || null;
  byId("ordersCardList").innerHTML = rows.length ? rows.map((item) => renderOrderCard(item, selectedOrder)).join("")
    : `<div class="empty-state compact"><strong>Nenhuma encomenda encontrada</strong><span>Ajuste os filtros ou cadastre uma nova encomenda.</span></div>`;
  byId("ordersCardList").querySelectorAll(".order-card-link").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  renderOrderDetailPanel(selectedOrder);
  renderOrdersBulkToolbar(rows);
  applyOrdersViewMode();
  bindActions();
}

export function selectOrder(id) {
  state.selectedOrderId = id;
  renderOrders();
}

// Painel fixo de detalhe ao lado da lista (mestre-detalhe, mesmo padrao
// usado em Clientes e Leads) - substitui o antigo painel deslizante por
// cima so na view de Encomendas. O painel deslizante (#orderDrawer/
// openOrderDrawer) continua existindo e sendo usado em Producao (kanban),
// onde nao ha uma lista mestre pra acompanhar um painel fixo.
function renderOrderDetailPanel(item) {
  const target = byId("orderDetailPanel");
  if (!target) return;
  if (!item) {
    target.innerHTML = `<div class="empty-state compact"><strong>Nenhuma encomenda selecionada</strong></div>`;
    return;
  }
  const status = normalizeOrderStatus(item.status);
  const rows = [
    ["Cliente", item.client || "-"],
    ["Quantidade", Number(item.quantity || 1)],
    ["Material", item.material || "-"],
    ["Status", status],
    ["Prioridade", item.priority || getOrderPriority(item).label],
    ["Etapa de produção", item.productionStage || "Em fila"],
    ["Responsável", item.responsible || "-"],
    ["Data de entrega", item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"],
    ["Valor cobrado", item.charged ? money.format(item.charged) : "-"],
    ["Valor recebido", item.received ? money.format(item.received) : "-"],
    ["Código marketplace", item.marketplaceOrderCode || "-"],
  ];
  const timelineEvents = (item.history || []).slice(0, 5);
  target.innerHTML = `
    <div class="drawer-header">
      <div>
        <span class="order-code">${html(getOrderCode(item))}</span>
        <h3>${html(item.description)}</h3>
        <small>${html(getMarketplaceLabel(item))}</small>
      </div>
    </div>
    <div class="drawer-body">
      <div class="drawer-field-list">
        ${rows.map(([label, value]) => `<div class="drawer-field-row"><span>${html(label)}</span><strong>${html(String(value))}</strong></div>`).join("")}
      </div>
      ${renderOrderProductionAssets(item)}
      ${item.internalNotes ? `<div class="drawer-notes"><strong>Nota interna</strong><p>${html(item.internalNotes)}</p></div>` : ""}
      <div class="drawer-section-title">Histórico recente</div>
      <div class="drawer-timeline">
        ${timelineEvents.length ? timelineEvents.map((entry) => `
          <div class="drawer-timeline-row">
            <strong>${entry.changes.map((change) => `${html(change.field)}: ${html(change.from)} → ${html(change.to)}`).join(", ")}</strong>
            <span title="${formatDateTime(entry.at)}">${formatRelativeTime(entry.at)}</span>
          </div>
        `).join("") : `<div class="empty-chart">Nenhum evento registrado.</div>`}
      </div>
    </div>
    ${state.canEdit ? `
      <div class="drawer-footer">
        <button class="secondary-btn" type="button" data-action="edit-order-modal" data-id="${html(item.id)}">Editar</button>
        <button class="primary-btn" type="button" data-action="toggle-order" data-id="${html(item.id)}">${status === "Entregue" ? "Reabrir" : "Entregar"}</button>
        <button class="secondary-btn" type="button" data-action="history-order" data-id="${html(item.id)}">Histórico completo</button>
        ${state.isAdmin ? `<button class="secondary-btn danger" type="button" data-action="delete-order" data-id="${html(item.id)}"><i class="ti ti-trash" aria-hidden="true"></i> Excluir</button>` : ""}
      </div>
    ` : ""}
  `;
}

function renderOrderTableRow(item) {
  const priority = getOrderPriority(item);
  const status = normalizeOrderStatus(item.status);
  const marketplaceLabel = getMarketplaceLabel(item);
  return `
      <tr>
        <td class="order-select-column"><input class="order-select-checkbox" type="checkbox" data-order-select="${html(item.id)}" aria-label="Selecionar ${html(getOrderCode(item))}" ${state.selectedOrderIds.includes(item.id) ? "checked" : ""} /></td>
        <td>
          <span class="order-code">${html(getOrderCode(item))}</span>
          <strong>${html(item.description)}</strong>
          ${item.quoteStage ? `<span class="badge queue">Orçamento: ${html(item.quoteStage)}</span>` : ""}
          ${item.status !== "Orçamento" ? renderLogisticsBadge(item.id) : ""}
          <small>${html(item.client || "Cliente não informado")}</small>
          ${renderTags((item.tags || []).filter((tag) => !isMarketplaceTag(tag)), item.id)}
          ${renderOrderProductionAssets(item, { compact: true })}
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
}

function renderOrderCard(item, selectedOrder) {
  const priority = getOrderPriority(item);
  const status = normalizeOrderStatus(item.status);
  const marketplaceLabel = getMarketplaceLabel(item);
  const sla = getSlaState(item);
  const isLate = sla.className === "danger-badge" && status !== "Entregue";
  const edgeClass = status === "Entregue" ? "order-card-paid" : isLate ? "order-card-late" : "";
  const selectedClass = selectedOrder?.id === item.id ? "selected" : "";
  const product = getProductForOrder(item);
  const productAssets = getProductAssetInfo(product);
  const thumbUrl = safeUrl(item.referenceImageUrl) || safeUrl(productAssets.imageUrl);
  const stlLink = safeUrl(item.stlLink) || safeUrl(productAssets.stlLink);
  return `
    <article class="order-card ${edgeClass} ${selectedClass}" data-action="select-order" data-id="${html(item.id)}" tabindex="0" role="button" aria-label="Ver detalhes de ${html(getOrderCode(item))}">
      <label class="order-card-select" title="Selecionar para ação em lote"><input class="order-select-checkbox" type="checkbox" data-order-select="${html(item.id)}" aria-label="Selecionar ${html(getOrderCode(item))}" ${state.selectedOrderIds.includes(item.id) ? "checked" : ""} /></label>
      <div class="order-card-thumb">
        ${thumbUrl ? `<img src="${html(thumbUrl)}" alt="" loading="lazy" />` : `<i class="ti ti-package" aria-hidden="true"></i>`}
      </div>
      <div class="order-card-main">
        <div class="order-card-row1">
          <span class="order-code">${html(getOrderCode(item))}</span>
          <strong class="order-card-title">${html(item.description)}</strong>
        </div>
        <div class="order-card-row2">
          <span><i class="ti ti-package" aria-hidden="true"></i> ${Number(item.quantity || 1)}x</span>
          <span>${html(item.material || "Material não informado")}</span>
          <span><i class="ti ti-clock" aria-hidden="true"></i> ${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"}</span>
          ${item.responsible ? `<span><i class="ti ti-user" aria-hidden="true"></i> ${html(item.responsible)}</span>` : ""}
          ${stlLink ? `<a class="order-link order-card-link" href="${html(stlLink)}" target="_blank" rel="noopener"><i class="ti ti-file-3d" aria-hidden="true"></i> STL/origem</a>` : ""}
          ${product ? `<span><i class="ti ti-cube" aria-hidden="true"></i> ${html(product.sku || product.name)}</span>` : ""}
        </div>
      </div>
      <div class="order-card-side">
        <div class="order-card-row3">
          ${marketplaceLabel !== "Marketplace" ? `<span class="badge queue">${html(marketplaceLabel)}</span>` : ""}
          ${["urgent", "high"].includes(priority.key) ? `<span class="badge danger-badge">${html(priority.label)}</span>` : ""}
          <span class="badge ${getFieldClass("status", status)}">${html(status)}</span>
          ${item.quoteStage ? `<span class="badge queue">Orçamento: ${html(item.quoteStage)}</span>` : ""}
        </div>
        <span class="order-card-value">${item.charged ? money.format(item.charged) : "-"}</span>
      </div>
    </article>
  `;
}

function renderOrdersBulkToolbar(rows) {
  const toolbar = byId("ordersBulkToolbar");
  if (!toolbar) return;
  const selected = state.selectedOrderIds || [];
  toolbar.hidden = !state.canEdit;
  byId("ordersBulkCount").textContent = `${selected.length} selecionada${selected.length === 1 ? "" : "s"}`;
  byId("applyOrdersBulkBtn").disabled = selected.length === 0;
  byId("clearOrdersSelectionBtn").disabled = selected.length === 0;
  byId("deleteOrdersSelectionBtn").disabled = selected.length === 0;
  const visibleIds = rows.map((item) => item.id);
  const selectAll = byId("ordersSelectAll");
  selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  selectAll.indeterminate = visibleIds.some((id) => selected.includes(id)) && !selectAll.checked;

  document.querySelectorAll(".order-select-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      toggleOrderSelection(checkbox.dataset.orderSelect, checkbox.checked);
      renderOrders();
    });
  });
  document.querySelectorAll(".order-card-select").forEach((label) => label.addEventListener("click", (event) => event.stopPropagation()));
  selectAll.onchange = () => {
    const next = new Set(state.selectedOrderIds || []);
    visibleIds.forEach((id) => selectAll.checked ? next.add(id) : next.delete(id));
    state.selectedOrderIds = [...next];
    renderOrders();
  };
  byId("ordersBulkField").onchange = (event) => renderOrdersBulkValueOptions(event.target.value);
  byId("clearOrdersSelectionBtn").onclick = () => {
    state.selectedOrderIds = [];
    renderOrders();
  };
  byId("deleteOrdersSelectionBtn").onclick = deleteSelectedOrders;
  byId("applyOrdersBulkBtn").onclick = async () => {
    const field = byId("ordersBulkField").value;
    const value = byId("ordersBulkValue").value;
    if (!field || !value) {
      flashActionMessage("Selecione o campo e o novo valor.");
      return;
    }
    await applyOrdersBulkUpdate(field, value);
  };
}

export async function deleteSelectedOrders() {
  if (!ensureCapability("delete_records", "excluir registros")) return;
  const selected = state.data.orders.filter((item) => state.selectedOrderIds.includes(item.id));
  if (!selected.length) return;
  const confirmed = await showAppConfirm(
    `Excluir ${selected.length} encomenda(s)?`,
    "Esta ação também remove os vínculos de marketplace associados e não pode ser desfeita.",
    { confirmLabel: "Excluir encomendas", danger: true },
  );
  if (!confirmed) return;
  for (const item of selected) {
    try {
      await recordAudit("delete", "order", item.id, getOrderCode(item), item, null, "bulk");
      await removeRemote("orders", item.id);
      state.data.orders = state.data.orders.filter((order) => order.id !== item.id);
    } catch (error) {
      flashActionMessage(`Não foi possível excluir ${getOrderCode(item)}: ${error.message}`);
      render();
      return;
    }
  }
  state.selectedOrderIds = [];
  state.selectedOrderId = state.data.orders[0]?.id || null;
  saveData();
  flashActionMessage(`${selected.length} encomenda(s) excluída(s).`);
  render();
}

function renderOrdersBulkValueOptions(field) {
  const target = byId("ordersBulkValue");
  const options = {
    priority: PRIORITY_OPTIONS.filter(Boolean),
    productionStage: PRODUCTION_STAGES,
    responsible: getResponsibleNames(),
    status: STATUS_OPTIONS,
  }[field] || [];
  target.disabled = !options.length;
  target.innerHTML = options.length
    ? `<option value="">Novo valor</option>${options.map((value) => `<option>${html(value)}</option>`).join("")}`
    : `<option value="">Selecione o campo primeiro</option>`;
}

export function toggleOrderSelection(id, checked) {
  const selected = new Set(state.selectedOrderIds || []);
  if (checked) selected.add(id);
  else selected.delete(id);
  state.selectedOrderIds = [...selected];
}

export async function applyOrdersBulkUpdate(field, value) {
  if (!ensureCanEdit() || !["priority", "productionStage", "responsible", "status"].includes(field)) return;
  const selected = state.data.orders.filter((item) => state.selectedOrderIds.includes(item.id));
  for (const item of selected) {
    const previous = structuredClone(item);
    try {
      const from = item[field] || "Não informado";
      item[field] = value;
      if (field === "productionStage" && value === "Entregue") item.status = "Entregue";
      if (field === "status" && value === "Entregue") item.productionStage = "Entregue";
      item.history = appendHistory(item.history, [{ field: bulkFieldLabel(field), from, to: value }]);
      await persist("orders", item);
      await recordAudit("bulk_update", "order", item.id, getOrderCode(item), previous, item, "manual");
    } catch (error) {
      Object.assign(item, previous);
      saveData();
      flashActionMessage(`Não foi possível atualizar ${getOrderCode(item)}: ${error.message}`);
      render();
      return;
    }
  }
  saveData();
  state.selectedOrderIds = [];
  flashActionMessage(`${selected.length} encomenda(s) atualizada(s).`);
  render();
}

function bulkFieldLabel(field) {
  return ({ priority: "Prioridade", productionStage: "Etapa", responsible: "Responsável", status: "Status" })[field] || field;
}

export function setOrdersViewMode(mode) {
  state.ordersViewMode = mode === "table" ? "table" : "cards";
  localStorage.setItem("3daft-orders-view-mode", state.ordersViewMode);
  applyOrdersViewMode();
}

export function applyOrdersViewMode() {
  const isTable = state.ordersViewMode === "table";
  const tableWrap = byId("ordersTableWrap");
  const ordersGrid = byId("ordersGrid");
  if (tableWrap) tableWrap.hidden = !isTable;
  if (ordersGrid) ordersGrid.hidden = isTable;
  byId("ordersViewCardsBtn")?.setAttribute("aria-pressed", String(!isTable));
  byId("ordersViewTableBtn")?.setAttribute("aria-pressed", String(isTable));
}

export function openOrderDrawer(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item) return;
  const status = normalizeOrderStatus(item.status);
  byId("orderDrawerCode").textContent = getOrderCode(item);
  byId("orderDrawerTitle").textContent = item.description;
  byId("orderDrawerMarketplace").textContent = getMarketplaceLabel(item);
  const rows = [
    ["Cliente", item.client || "-"],
    ["Quantidade", Number(item.quantity || 1)],
    ["Material", item.material || "-"],
    ["Status", status],
    ["Prioridade", item.priority || getOrderPriority(item).label],
    ["Etapa de produção", item.productionStage || "Em fila"],
    ["Responsável", item.responsible || "-"],
    ["Data de entrega", item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"],
    ["Valor cobrado", item.charged ? money.format(item.charged) : "-"],
    ["Valor recebido", item.received ? money.format(item.received) : "-"],
    ["Código marketplace", item.marketplaceOrderCode || "-"],
  ];
  byId("orderDrawerFields").innerHTML = rows.map(([label, value]) => `
    <div class="drawer-field-row"><span>${html(label)}</span><strong>${html(String(value))}</strong></div>
  `).join("");
  byId("orderDrawerReference").innerHTML = renderOrderProductionAssets(item);
  const notesTarget = byId("orderDrawerNotes");
  if (item.internalNotes) {
    notesTarget.hidden = false;
    notesTarget.innerHTML = `<strong>Nota interna</strong><p>${html(item.internalNotes)}</p>`;
  } else {
    notesTarget.hidden = true;
    notesTarget.innerHTML = "";
  }
  const timelineEvents = (item.history || []).slice(0, 5);
  byId("orderDrawerTimeline").innerHTML = timelineEvents.length ? timelineEvents.map((entry) => `
    <div class="drawer-timeline-row">
      <strong>${entry.changes.map((change) => `${html(change.field)}: ${html(change.from)} → ${html(change.to)}`).join(", ")}</strong>
      <span title="${formatDateTime(entry.at)}">${formatRelativeTime(entry.at)}</span>
    </div>
  `).join("") : `<div class="empty-chart">Nenhum evento registrado.</div>`;
  byId("orderDrawerDeliverBtn").textContent = status === "Entregue" ? "Reabrir" : "Entregar";
  byId("orderDrawerDeliverBtn").dataset.id = id;
  byId("orderDrawerEditBtn").dataset.id = id;
  byId("orderDrawerHistoryBtn").dataset.id = id;
  byId("orderDrawer").classList.add("open");
  byId("orderDrawer").setAttribute("aria-hidden", "false");
  byId("orderDrawerOverlay").hidden = false;
}

export function closeOrderDrawer() {
  byId("orderDrawer").classList.remove("open");
  byId("orderDrawer").setAttribute("aria-hidden", "true");
  byId("orderDrawerOverlay").hidden = true;
}

export function bindOrderDrawer() {
  byId("orderDrawerCloseBtn")?.addEventListener("click", closeOrderDrawer);
  byId("orderDrawerOverlay")?.addEventListener("click", closeOrderDrawer);
  byId("orderDrawerEditBtn")?.addEventListener("click", (event) => {
    const id = event.currentTarget.dataset.id;
    closeOrderDrawer();
    openOrderEditDialog(id);
  });
  byId("orderDrawerHistoryBtn")?.addEventListener("click", (event) => {
    showOrderHistory(event.currentTarget.dataset.id);
  });
  byId("orderDrawerDeliverBtn")?.addEventListener("click", async (event) => {
    if (!ensureCanEdit()) return;
    const id = event.currentTarget.dataset.id;
    const item = state.data.orders.find((row) => row.id === id);
    if (!item) return;
    const previousOrder = structuredClone(item);
    const previousStatus = normalizeOrderStatus(item.status);
    item.status = previousStatus === "Entregue" ? "A preparar" : "Entregue";
    if (item.status === "Entregue") item.productionStage = "Entregue";
    applyDeliveredPaymentDefault(item);
    item.history = appendHistory(item.history, [{ field: "Status", from: previousStatus, to: item.status }]);
    await persist("orders", item);
    await syncOrderPaymentCash(item, previousOrder);
    closeOrderDrawer();
    saveData();
    render();
  });
}

export function renderOrderReferences(item) {
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

function renderOrderProductionAssets(item, options = {}) {
  const product = getProductForOrder(item);
  const productBlock = renderProductionAssetShortcut(product, { compact: options.compact });
  const directReference = renderOrderReferences(item);
  if (!productBlock && !directReference) return "";
  if (options.compact) {
    return `<div class="order-production-assets">${productBlock}${directReference}</div>`;
  }
  return `
    <div class="order-production-assets">
      ${productBlock ? `<div class="drawer-section-title">Produto interno / arquivos</div>${productBlock}` : ""}
      ${directReference ? `<div class="drawer-section-title">Arquivos da encomenda</div>${directReference}` : ""}
    </div>
  `;
}

export function renderQuoteActions(item) {
  const stages = ["Solicitado", "Em análise", "Orçamento enviado", "Aguardando cliente", "Aprovado", "Recusado", "Convertido em encomenda"];
  return `
    ${state.canEdit ? `<select class="inline-select queue" data-action="set-quote-stage" data-id="${html(item.id)}">
      ${stages.map((stage) => `<option ${stage === item.quoteStage ? "selected" : ""}>${html(stage)}</option>`).join("")}
    </select>` : `<span class="badge queue">${html(item.quoteStage)}</span>`}
    ${state.canEdit && item.quoteStage === "Aprovado" ? `<button class="primary-btn compact" type="button" data-action="convert-quote" data-id="${html(item.id)}">Enviar para produção</button>` : ""}
  `;
}

export function renderTags(tags = [], id = "") {
  return tags.length ? `<div class="tag-list">${tags.map((tag) => `
    <span class="${getTagClass(tag)}">${html(tag)}${state.canEdit ? `<button type="button" data-action="remove-order-tag" data-id="${html(id)}" data-tag="${html(tag)}">×</button>` : ""}</span>
  `).join("")}</div>` : "";
}

export function renderInlineSelect(field, id, value, options, placeholder = "-") {
  const styleClass = getFieldClass(field, value);
  if (!state.canEdit) return `<span class="badge ${styleClass}">${html(value || placeholder)}</span>`;
  return `
    <select class="inline-select ${styleClass}" data-action="inline-order-field" data-id="${html(id)}" data-field="${html(field)}">
      ${options.map((option) => `<option value="${html(option)}" ${String(option) === String(value) ? "selected" : ""}>${html(option || placeholder)}</option>`).join("")}
    </select>
  `;
}

export function renderDeliveryDate(value) {
  if (!value) return `<span class="date-pill neutral">Sem data</span>`;
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const delivery = new Date(`${value}T00:00:00`);
  const diff = Math.round((delivery - todayDate) / 86400000);
  const className = diff < 0 ? "danger-badge" : diff <= 3 ? "queue" : "done";
  return `<span class="date-pill ${className}">${formatDate(value)}</span>`;
}

export function renderSlaBadge(item) {
  const sla = getSlaState(item);
  return `<span class="sla-badge ${sla.className}" title="${html(sla.title)}">${html(sla.label)}</span>`;
}

export function getSlaState(item) {
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

export function getFieldClass(field, value) {
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

export async function duplicateOrder(id) {
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

export async function removeReferenceImage(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || !item.referenceImageUrl) return;
  const confirmed = await showAppConfirm("Remover imagem de referência?", "A imagem deixará de aparecer nesta encomenda.", { confirmLabel: "Remover imagem", danger: true });
  if (!confirmed) return;
  await removeStorageImage(item.referenceImageUrl);
  item.referenceImageUrl = "";
  item.history = appendHistory(item.history, [{ field: "Imagem de referência", from: "Cadastrada", to: "Removida" }]);
  await persist("orders", item);
  await recordAudit("update", "order", item.id, item.orderCode, { referenceImageUrl: "Cadastrada" }, { referenceImageUrl: "Removida" }, "manual");
  saveData();
  render();
}

export async function updateQuoteStage(id, stage) {
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

export async function convertQuoteToProduction(id) {
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

export async function updateOrderInline(id, field, value) {
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

export async function removeOrderTag(id, tag) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item || !tag) return;
  item.tags = (item.tags || []).filter((current) => current !== tag);
  item.history = appendHistory(item.history, [{ field: "Etiqueta", from: tag, to: "Removida" }]);
  await persist("orders", item);
  saveData();
  render();
}

const ORDER_IMAGE_PATH_MARKERS = [
  "/storage/v1/object/public/order-images/",
  "/storage/v1/object/sign/order-images/",
];

// order-images e um bucket privado: nunca persistimos uma URL publica/assinada
// (elas expiram ou dependem do bucket ser publico). Guardamos so o caminho no
// storage; a URL exibida (assinada) e recalculada a cada carregamento.
export function normalizeReferenceImageValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return raw;
  for (const marker of ORDER_IMAGE_PATH_MARKERS) {
    const index = raw.indexOf(marker);
    if (index !== -1) {
      let path = decodeURIComponent(raw.slice(index + marker.length));
      const queryIndex = path.indexOf("?");
      if (queryIndex !== -1) path = path.slice(0, queryIndex);
      return path;
    }
  }
  return raw;
}

export function isOwnReferenceImagePath(value) {
  const raw = String(value || "").trim();
  return Boolean(raw) && !/^https?:\/\//i.test(raw);
}

export async function removeStorageImage(url) {
  if (!state.supabase) return;
  const path = normalizeReferenceImageValue(url);
  if (!isOwnReferenceImagePath(path)) return;
  await state.supabase.storage.from("order-images").remove([path]);
}

export async function saveOrder(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const existingId = form.get("id");
  const previous = state.data.orders.find((orderItem) => orderItem.id === existingId);
  const nextOrderId = existingId || nextId("ENC", state.data.orders);
  const item = {
    id: nextOrderId,
    createdAt: previous?.createdAt || new Date().toISOString(),
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
    productId: form.get("productId") || "",
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
  byId("orderCreateDialog")?.close();
  render();
  flashActionMessage(previous ? "Encomenda atualizada." : "Encomenda criada.");
}

export function openOrderCreateDialog() {
  resetOrderForm();
  byId("orderCreateDialogTitle").textContent = "Nova encomenda";
  byId("orderCreateDialog").showModal();
  requestAnimationFrame(() => byId("orderForm").elements.description.focus());
}

export function openOrderEditDialog(id) {
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

export async function saveOrderFromDialog(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const item = state.data.orders.find((orderItem) => orderItem.id === form.get("id"));
  if (!item) return;
  const previous = structuredClone(item);
  Object.assign(item, {
    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
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

export function orderPaymentCashId(orderId) {
  return `ORDERPAY-${String(orderId || "").replace(/[^a-z0-9_-]/gi, "")}`;
}

export function applyDeliveredPaymentDefault(item) {
  if (normalizeOrderStatus(item.status) === "Entregue" && Number(item.charged || 0) > 0 && Number(item.received || 0) <= 0) {
    item.received = Number(item.charged || 0);
  }
}

export async function syncOrderPaymentCash(item, previous = null) {
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

export async function ensureCustomTag(value) {
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

export function startOrderEdit(id) {
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
  if (form.elements.productId) form.elements.productId.value = item.productId || "";
  updateMarketplaceCodePlaceholder();
  state.editingOrderId = id;
  form.classList.add("editing");
  byId("orderSubmitBtn").textContent = "Atualizar encomenda";
  byId("cancelOrderEditBtn").hidden = false;
  byId("orderCreateDialogTitle").textContent = `Editar ${getOrderCode(item)}`;
  byId("orderCreateDialog").showModal();
  form.elements.description.focus();
}

export function cancelOrderEdit() {
  resetOrderForm();
  byId("orderCreateDialog")?.close();
}

export function resetOrderForm() {
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
  byId("cancelOrderEditBtn").hidden = false;
}

export function bindReferenceImageInput() {
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

export function setPendingReferenceImage(file, message = "") {
  try {
    validateReferenceImage(file);
  } catch (error) {
    showAppMessage("Imagem inválida", error.message, "error");
    return;
  }
  clearPendingReferenceImage();
  state.pendingReferenceImageFile = file;
  state.pendingReferenceImagePreviewUrl = URL.createObjectURL(file);
  updateReferenceImagePreview(state.pendingReferenceImagePreviewUrl);
  if (message) flashActionMessage(message);
}

export function clearPendingReferenceImage(updatePreview = true) {
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

export function updateReferenceImagePreview(url) {
  const preview = byId("referenceImagePreview");
  const empty = byId("referenceImageEmpty");
  const image = byId("referenceImagePreviewImg");
  if (!preview || !empty || !image) return;
  const hasImage = Boolean(url);
  preview.hidden = !hasImage;
  empty.hidden = hasImage;
  image.src = hasImage ? url : "";
}

export function validateReferenceImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Envie um arquivo de imagem.");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter até 5 MB.");
}

export async function uploadReferenceImage(file, orderId) {
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
  // order-images e privado; assina a URL so para a pre-visualizacao imediata.
  // O que fica persistido (serializeOrderMeta) e sempre o caminho puro, nao a
  // URL assinada, que expira.
  const { data } = await state.supabase.storage.from("order-images").createSignedUrl(path, 3600);
  return data?.signedUrl || path;
}

export function normalizeImportedOrder(row) {
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

export function normalizeMarketplaceTag(value) {
  const text = normalizeText(value);
  if (text.includes("shopee")) return "Shopee";
  if (text.includes("mercado livre") || text === "ml" || text.includes("mercadolivre")) return "Mercado Livre";
  return "";
}

export function filterOrders(rows, options = {}) {
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

export function getOrderMarketplaceChannel(item) {
  const tags = item?.tags || [];
  if (tags.includes("Mercado Livre")) return "mercado-livre";
  if (tags.includes("Shopee")) return "shopee";
  if (tags.includes("Amazon")) return "amazon";
  return "direct";
}

export function matchesOrderFocus(item, focus) {
  const priority = getOrderPriority(item).key;
  if (focus === "urgent") return ["urgent", "high"].includes(priority);
  if (focus === "soon") return priority === "soon";
  if (focus === "late") return priority === "late";
  if (focus === "noDate") return item.status !== "Entregue" && !item.deliveryDate;
  if (focus === "noValue") return item.status !== "Entregue" && !Number(item.charged || 0);
  if (focus === "receivable") return Number(item.charged || 0) > Number(item.received || 0);
  return true;
}

export function sortOrders(rows) {
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

export function getOrderPriority(item) {
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

export function parseOrderMeta(value) {
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
    productId: "",
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
      productId: parsed.productId || "",
      checklist: { ...defaultChecklist(), ...(parsed.checklist || {}) },
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch {
    return fallback;
  }
}

export function serializeOrderMeta(item) {
  const hasMeta = item.marketplaceOrderCode || item.stlLink || item.referenceImageUrl || item.internalNotes || item.tags?.length || item.priority || item.productionStage || item.responsible || item.quoteStage || item.source || item.leadId || item.productId || item.history?.length || Object.values(item.checklist || {}).some(Boolean);
  if (!hasMeta) return item.notes || null;
  return JSON.stringify({
    text: item.notes || "",
    orderCode: item.orderCode || deriveOrderCode(item.id),
    marketplaceOrderCode: item.marketplaceOrderCode || "",
    stlLink: item.stlLink || "",
    referenceImageUrl: normalizeReferenceImageValue(item.referenceImageUrl),
    internalNotes: item.internalNotes || "",
    tags: item.tags || [],
    priority: item.priority || "",
    productionStage: item.productionStage || "",
    responsible: item.responsible || "",
    quoteStage: item.quoteStage || "",
    quoteUpdatedAt: item.quoteUpdatedAt || "",
    source: item.source || "",
    leadId: item.leadId || "",
    productId: item.productId || "",
    checklist: { ...defaultChecklist(), ...(item.checklist || {}) },
    history: item.history || []
  });
}

export function getOrderChanges(previous, next) {
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

export function parseTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function mergeTags(existing, tagToAdd) {
  const tag = String(tagToAdd || "").trim();
  let tags = [...(existing || [])];
  if (isMarketplaceTag(tag)) tags = tags.filter((current) => !isMarketplaceTag(current));
  if (tag && !tags.includes(tag)) tags.push(tag);
  return tags;
}

export function isMarketplaceTag(tag) {
  return ["Mercado Livre", "Shopee", "Amazon"].includes(String(tag || "").trim());
}

export function getMarketplaceLabel(itemOrTags) {
  const tags = Array.isArray(itemOrTags) ? itemOrTags : itemOrTags?.tags || [];
  if (tags.includes("Shopee")) return "Shopee";
  if (tags.includes("Amazon")) return "Amazon";
  if (tags.includes("Mercado Livre")) return "Mercado Livre";
  return "Marketplace";
}

export function getSelectedMarketplaceLabel() {
  const form = byId("orderForm");
  const selected = form?.elements.marketplaceTagToAdd?.value || "";
  if (selected) return selected;
  const existingId = form?.elements.id?.value;
  const existing = state.data.orders.find((item) => item.id === existingId);
  return getMarketplaceLabel(existing);
}

export function updateMarketplaceCodePlaceholder() {
  const form = byId("orderForm");
  if (!form) return;
  const label = getSelectedMarketplaceLabel();
  form.elements.marketplaceOrderCode.placeholder = `Código ${label}`;
}

export function updateOrderFormStatusColor() {
  const form = byId("orderForm");
  const select = form?.elements.status;
  if (!select) return;
  select.classList.remove("done", "queue", "danger-badge", "info-badge", "neutral");
  select.classList.add(getFieldClass("status", select.value));
}

export async function copyMarketplaceCode(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item?.marketplaceOrderCode) return;
  try {
    await navigator.clipboard.writeText(item.marketplaceOrderCode);
    flashActionMessage("Código copiado.");
  } catch {
    await showAppPrompt("Copiar código do marketplace", "A cópia automática foi bloqueada pelo navegador. Selecione o código abaixo e copie manualmente.", { label: "Código", value: item.marketplaceOrderCode, confirmLabel: "Fechar" });
  }
}

export function syncOrderFilterControls() {
  const material = byId("orderMaterialFilter");
  const marketplace = byId("orderMarketplaceFilter");
  const focus = byId("orderFocusFilter");
  const quote = byId("orderQuoteFilter");
  if (material) material.value = state.filters.orderMaterial;
  if (marketplace) marketplace.value = state.filters.orderMarketplace;
  if (focus) focus.value = state.filters.orderFocus;
  if (quote) quote.value = state.filters.orderQuote;
  document.querySelectorAll("[data-order-status-pill]").forEach((button) => {
    button.classList.toggle("active", button.dataset.orderStatusPill === (state.filters.orderStatus || "all"));
  });
  const advancedPanel = byId("orderAdvancedFilters");
  const hasAdvancedFilter = ["orderMaterial", "orderMarketplace", "orderFocus", "orderQuote"].some((key) => state.filters[key] !== "all");
  if (advancedPanel && hasAdvancedFilter) advancedPanel.hidden = false;
}

export function getTagClass(tag) {
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

export function getOrderCode(item) {
  return item.orderCode || deriveOrderCode(item.id);
}

export function deriveOrderCode(id) {
  const numberPart = Number(String(id || "").split("-")[1] || 0);
  return `PED-${String(numberPart || 1).padStart(4, "0")}`;
}

export function nextOrderCode() {
  const max = state.data.orders.reduce((value, row) => {
    const match = String(row.orderCode || "").match(/PED-(\d+)/);
    const fromCode = match ? Number(match[1]) : 0;
    const fromId = Number(String(row.id || "").split("-")[1] || 0);
    return Math.max(value, fromCode, fromId);
  }, 0);
  return `PED-${String(max + 1).padStart(4, "0")}`;
}

export function appendHistory(history, changes) {
  if (!changes.length) return history || [];
  const entry = {
    at: new Date().toISOString(),
    by: state.activeUserName || "Usuário",
    changes
  };
  return [entry, ...(history || [])].slice(0, 40);
}

export function showOrderHistory(id) {
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (!item) return;
  byId("historyDialogCode").textContent = getOrderCode(item);
  byId("historyDialogTitle").textContent = item.description || "Historico da encomenda";
  byId("historyDialogSubtitle").textContent = `${item.client || "Cliente nao informado"} · ${getMarketplaceLabel(item)}`;
  byId("historySummary").innerHTML = `
    <div class="drawer-field-row"><span>Status atual</span><strong>${html(normalizeOrderStatus(item.status))}</strong></div>
    <div class="drawer-field-row"><span>Etapa</span><strong>${html(item.productionStage || "Em fila")}</strong></div>
    <div class="drawer-field-row"><span>Responsavel</span><strong>${html(item.responsible || "-")}</strong></div>
    <div class="drawer-field-row"><span>Entrega</span><strong>${item.deliveryDate ? formatDate(item.deliveryDate) : "Sem data"}</strong></div>
  `;
  const content = byId("historyContent");
  content.innerHTML = item.history?.length ? item.history.map((entry) => `
    <article class="history-event-card">
      <i aria-hidden="true"></i>
      <div>
        <header>
          <strong>${html(entry.by || "Usuario")}</strong>
          <span>${formatDateTime(entry.at)}</span>
        </header>
        <div class="history-change-list">
          ${entry.changes.map((change) => `
            <div class="history-change">
              <span>${html(change.field)}</span>
              <strong>${html(String(change.from || "-"))}</strong>
              <em>para</em>
              <strong>${html(String(change.to || "-"))}</strong>
            </div>
          `).join("")}
        </div>
      </div>
    </article>
  `).join("") : `<div class="empty-chart">Sem alteracoes registradas neste pedido</div>`;
  byId("historyDialog").showModal();
}
export function customTagClass(color) {
  return {
    positive: "tag-positive",
    attention: "tag-attention",
    danger: "tag-danger",
    queue: "tag-marketplace",
  }[color] || "tag-neutral";
}

export async function deleteCustomTag(id) {
  const tag = state.customTags.find((item) => item.id === id);
  if (!tag) return;
  const confirmed = await showAppConfirm(`Excluir a tag ${tag.name}?`, "A tag deixará de estar disponível para novas encomendas.", { confirmLabel: "Excluir tag", danger: true });
  if (!confirmed) return;
  const { error } = await state.supabase.from("custom_tags").delete().eq("id", id);
  if (error) throw error;
  await loadRemoteData();
  renderSettingsData();
}
