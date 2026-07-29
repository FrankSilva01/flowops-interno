import { state } from "../core/state.js";
import { byId, html, formatDate, formatDateTime, flashActionMessage, renderOperationalSummary, showAppMessage, showAppPrompt } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { recordAudit } from "./logs.js";
import { getOrderCode } from "./orders.js";
import { createNotification } from "./notifications.js";
import { syncMlShipment } from "./marketplace.js";
import { getProductForOrder, renderProductionAssetShortcut } from "./product-assets.js";
import { buildLogisticsPresentation } from "./logistics-presentation.js";

export const LOGISTICS_STATUSES = [
  "Aguardando envio", "Postado", "Em trânsito", "Saiu para entrega", "Entregue", "Problema na entrega", "Devolvido",
];

const LOGISTICS_AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
let logisticsAutoSyncInFlight = false;
let logisticsLastAutoSyncAt = 0;

export function getOrderLogistics(orderId) {
  return state.orderLogistics.find((item) => item.order_id === orderId) || null;
}

export function getLogisticsStatusLabel(status) {
  return status || "Sem rastreio";
}

export function getLogisticsStatusClass(status) {
  if (status === "Entregue") return "done";
  if (status === "Problema na entrega" || status === "Devolvido") return "danger-badge";
  if (["Postado", "Em trânsito", "Saiu para entrega"].includes(status)) return "queue";
  return "neutral";
}

export function renderLogisticsBadge(orderId) {
  const logistics = getOrderLogistics(orderId);
  const order = state.data.orders.find((item) => item.id === orderId);
  const status = logistics?.status || "";
  const hasMarketplaceCode = Boolean(order?.marketplaceOrderCode || order?.marketplaceCode);
  const label = status ? getLogisticsStatusLabel(status) : (hasMarketplaceCode ? "Buscar rastreio" : "Rastreio");
  return `<button class="badge ${status ? getLogisticsStatusClass(status) : "neutral"}" type="button" data-action="open-logistics" data-id="${html(orderId)}" title="Rastreio da encomenda">${html(label)}</button>`;
}

function hasMarketplaceTrackingSource(order) {
  return Boolean(order?.marketplaceOrderCode || order?.marketplaceCode);
}

function getFilteredLogisticsPresentation() {
  const search = state.logisticsSearch || "";
  const statusFilter = state.logisticsStatusFilter || "all";
  const presentation = buildLogisticsPresentation(state.data.orders, state.orderLogistics, {
    now: new Date(),
    events: state.logisticsEvents,
  });
  const items = presentation.items.filter((item) => {
    const missingTracking = !item.logistics || !item.logistics.tracking_code;
    if (statusFilter === "sem-rastreio" && !missingTracking) return false;
    if (statusFilter !== "all" && statusFilter !== "sem-rastreio" && item.statusLabel !== statusFilter) return false;
    if (!search) return true;
    const text = `${item.orderCode} ${item.clientLabel} ${item.descriptionLabel} ${item.order.marketplaceOrderCode || ""} ${item.trackingLabel}`.toLowerCase();
    return text.includes(search);
  });
  return { presentation, items };
}

function getMarketplaceSyncCandidates(force = false) {
  const staleBefore = Date.now() - LOGISTICS_AUTO_SYNC_INTERVAL_MS;
  return state.data.orders
    .filter((order) => order.status !== "Orçamento" && order.status !== "Entregue")
    .filter(hasMarketplaceTrackingSource)
    .filter((order) => {
      const logistics = getOrderLogistics(order.id);
      if (force) return logistics?.status !== "Entregue";
      if (!logistics || !logistics.tracking_code || !logistics.status) return true;
      if (logistics.status === "Entregue" || logistics.status === "Devolvido") return false;
      const updatedAt = logistics.updated_at ? new Date(logistics.updated_at).getTime() : 0;
      return !updatedAt || updatedAt < staleBefore;
    });
}

function renderLogisticsSyncStatus(text = "") {
  const target = byId("logisticsSyncStatus");
  if (target) target.textContent = text;
}

function renderFlowOpsNextActionBoard(items) {
  const target = byId("logisticsActionBoard");
  if (!target) return;
  const late = items.filter((item) => item.isLate);
  const missing = items.filter((item) => !item.logistics || !item.logistics.tracking_code);
  const problems = items.filter((item) => ["Problema na entrega", "Devolvido"].includes(item.statusLabel));
  const moving = items.filter((item) => LOGISTICS_STATUSES.slice(1, 4).includes(item.statusLabel));
  const cards = [
    { tone: late.length ? "danger" : "ok", label: "Atrasos", value: late.length, detail: late.length ? "Prioridade maxima: verificar promessa de entrega." : "Sem entregas vencidas." },
    { tone: missing.length ? "warning" : "ok", label: "Sem rastreio util", value: missing.length, detail: missing.length ? "Buscar ML/Correios ou preencher codigo." : "Pedidos ativos tem rastreio." },
    { tone: problems.length ? "danger" : "ok", label: "Com problema", value: problems.length, detail: problems.length ? "Resolver antes de novas postagens." : "Sem ocorrencias abertas." },
    { tone: moving.length ? "info" : "neutral", label: "Em movimento", value: moving.length, detail: "Postados, em transito ou saiu para entrega." },
  ];
  target.innerHTML = cards.map((card) => `
    <article class="logistics-action-card ${card.tone}">
      <span>${html(card.label)}</span>
      <strong>${card.value}</strong>
      <small>${html(card.detail)}</small>
    </article>
  `).join("");
}

function renderFlowOpsNextRow(item) {
  const { order, logistics, nextAction } = item;
  return `
    <tr class="logistics-next-row">
      <td data-logistics-cell="order" data-label="Encomenda"><strong>${html(item.orderCode)}</strong><br><small>${html(item.clientLabel)}</small></td>
      <td data-logistics-cell="product" data-label="Produto / arquivos">${renderProductionAssetShortcut(getProductForOrder(order), { compact: true, empty: "Sem produto vinculado" })}</td>
      <td data-logistics-cell="status" data-label="Situacao"><span class="badge ${getLogisticsStatusClass(logistics?.status)}">${html(item.statusLabel)}</span><br><small>${html(item.carrierLabel)}</small></td>
      <td data-logistics-cell="tracking" data-label="Rastreio">${item.trackingLabel === "Sem codigo" ? `<span class="muted">${html(item.trackingLabel)}</span>` : html(item.trackingLabel)}</td>
      <td data-logistics-cell="estimate" data-label="Previsao">${item.estimatedDeliveryDate ? formatDate(item.estimatedDeliveryDate) : html(item.estimatedDeliveryLabel)}</td>
      <td data-logistics-cell="action" data-label="Proxima acao"><strong class="logistics-next-action ${html(nextAction.tone)}">${html(nextAction.label)}</strong><br><small>${html(nextAction.detail)}</small></td>
      <td data-logistics-cell="open" data-label=""><button class="secondary-btn" type="button" data-action="open-logistics" data-id="${html(order.id)}">Abrir</button></td>
    </tr>
  `;
}

export function renderLogistics() {
  const target = byId("logisticsTable");
  if (!target) return;
  setLogisticsMutationControlsDisabled(state.canEdit);
  const { presentation, items } = getFilteredLogisticsPresentation();
  renderOperationalSummary("logisticsView", "logisticsPageSummary", [
    ["Aguardando envio", presentation.summary.waiting, "sem despacho ainda", "amber"],
    [LOGISTICS_STATUSES[2], presentation.summary.moving, "a caminho do cliente", "blue"],
    ["Em risco", presentation.summary.late + presentation.summary.problem, "atrasos ou ocorrencias", "red"],
    ["Entregues", presentation.summary.delivered, "concluidos", "green"],
  ]);
  renderFlowOpsNextActionBoard(items);
  maybeAutoSyncMarketplaceLogistics();
  target.innerHTML = items.length
    ? items.map(renderFlowOpsNextRow).join("")
    : `<tr><td colspan="7"><div class="empty-state compact"><strong>Nenhuma encomenda encontrada</strong><span>Ajuste os filtros ou aguarde novas encomendas.</span></div></td></tr>`;
  bindActions();
}

async function maybeAutoSyncMarketplaceLogistics() {
  if (!state.canEdit || !state.supabase || logisticsAutoSyncInFlight) return;
  const now = Date.now();
  if (now - logisticsLastAutoSyncAt < LOGISTICS_AUTO_SYNC_INTERVAL_MS) return;
  const candidates = getMarketplaceSyncCandidates(false).slice(0, 12);
  if (!candidates.length) return;
  logisticsAutoSyncInFlight = true;
  logisticsLastAutoSyncAt = now;
  renderLogisticsSyncStatus(`Atualizando ${candidates.length} rastreio(s) do Mercado Livre...`);
  try {
    for (const order of candidates) {
      await applyLogisticsSync(order.id);
    }
    renderLogisticsSyncStatus(`Rastreios ML atualizados automaticamente: ${candidates.length}.`);
  } catch (error) {
    renderLogisticsSyncStatus("Nao foi possivel atualizar todos os rastreios automaticamente.");
  } finally {
    logisticsAutoSyncInFlight = false;
  }
}

export function openLogisticsDialog(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  const logistics = getOrderLogistics(orderId);
  const form = byId("logisticsForm");
  form.elements.orderId.value = orderId;
  form.elements.carrier.value = logistics?.carrier || "";
  form.elements.trackingCode.value = logistics?.tracking_code || "";
  form.elements.status.value = logistics?.status || LOGISTICS_STATUSES[0];
  form.elements.estimatedDeliveryDate.value = logistics?.estimated_delivery_date || "";
  byId("logisticsEventForm").elements.orderId.value = orderId;
  byId("logisticsSyncMlButton").dataset.id = orderId;
  const publicLinkButton = byId("copyPublicTrackingLinkButton");
  publicLinkButton.dataset.id = orderId;
  publicLinkButton.disabled = !order.public_tracking_token || order.public_tracking_enabled === false;
  publicLinkButton.title = publicLinkButton.disabled
    ? "Recarregue os dados para disponibilizar o link seguro."
    : "Copia um link seguro que pode ser enviado ao cliente.";
  setLogisticsMutationControlsDisabled(state.canEdit);
  byId("logisticsDialogTitle").textContent = `Rastreio - ${getOrderCode(order)}`;
  renderLogisticsTimeline(orderId);
  byId("logisticsDialog").showModal();
  // Auto-sync if order has marketplace code and is not delivered
  const marketplaceCode = order.marketplaceOrderCode || order.marketplaceCode;
  if (marketplaceCode && logistics?.status !== "Entregue" && order.status !== "Entregue") {
    syncLogisticsFromMarketplaceQuiet(orderId).catch(() => {});
  }
}

function setLogisticsMutationControlsDisabled(canEdit) {
  const disabled = !canEdit;
  for (const formId of ["logisticsForm", "logisticsEventForm"]) {
    const form = byId(formId);
    form?.querySelectorAll?.('input:not([type="hidden"]), select, button[type="submit"]')
      .forEach((control) => { control.disabled = disabled; });
  }
  const syncButton = byId("logisticsSyncMlButton");
  if (syncButton) syncButton.disabled = disabled;
  const syncAllButton = byId("syncAllMlShipmentsBtn");
  if (syncAllButton) syncAllButton.disabled = disabled;
}

export async function copyPublicTrackingLink(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order?.public_tracking_token || order.public_tracking_enabled === false) {
    flashActionMessage("Link seguro indisponivel. Recarregue os dados e tente novamente.");
    return;
  }
  const url = new URL("/tracking.html", window.location.origin);
  url.searchParams.set("token", order.public_tracking_token);
  try {
    await navigator.clipboard.writeText(url.toString());
    flashActionMessage("Link seguro de rastreamento copiado.");
  } catch {
    await showAppPrompt("Copiar link de rastreamento", "A cópia automática foi bloqueada pelo navegador. Selecione o link abaixo e copie manualmente.", { label: "Link seguro", value: url.toString(), confirmLabel: "Fechar" });
  }
}

async function applyLogisticsSync(orderId) {
  const result = await syncMlShipment(orderId);
  const previous = getOrderLogistics(orderId);
  const payload = {
    order_id: orderId,
    organization_id: state.organizationId,
    carrier: result.carrier || previous?.carrier || null,
    tracking_code: result.tracking_code || previous?.tracking_code || null,
    status: result.status,
    estimated_delivery_date: previous?.estimated_delivery_date || null,
    shipped_at: previous?.shipped_at || null,
    delivered_at: result.status === "Entregue" ? (previous?.delivered_at || new Date().toISOString()) : (previous?.delivered_at || null),
    updated_at: new Date().toISOString(),
  };
  const { error } = await state.supabase.from("order_logistics").upsert(payload);
  if (error) throw error;

  const index = state.orderLogistics.findIndex((item) => item.order_id === orderId);
  if (index >= 0) state.orderLogistics[index] = payload;
  else state.orderLogistics.push(payload);

  if (!previous || previous.status !== payload.status || previous.tracking_code !== payload.tracking_code) {
    const trackingText = payload.tracking_code ? ` Codigo: ${payload.tracking_code}.` : "";
    await addLogisticsEventRow(orderId, payload.status, `Sincronizado do Mercado Livre.${trackingText}`, "marketplace");
  }

  const form = byId("logisticsForm");
  if (form && form.elements.orderId.value === orderId) {
    form.elements.carrier.value = payload.carrier || "";
    form.elements.trackingCode.value = payload.tracking_code || "";
    form.elements.status.value = payload.status || LOGISTICS_STATUSES[0];
  }
  renderLogisticsTimeline(orderId);
  renderLogistics();
  return payload;
}

export async function syncLogisticsFromMarketplace(orderId) {
  if (!ensureCanEdit()) return;
  const button = byId("logisticsSyncMlButton");
  if (button) {
    button.disabled = true;
    button.textContent = "Buscando...";
  }
  try {
    await applyLogisticsSync(orderId);
    flashActionMessage("Rastreio atualizado com o Mercado Livre.");
  } catch (error) {
    showAppMessage("Falha na sincronização", `Não foi possível sincronizar com o Mercado Livre: ${error.message}`, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Buscar status no Mercado Livre";
    }
  }
}

export async function syncAllMarketplaceLogistics(force = true) {
  if (!ensureCanEdit() || logisticsAutoSyncInFlight) return;
  const candidates = getMarketplaceSyncCandidates(force);
  const button = byId("syncAllMlShipmentsBtn");
  if (!candidates.length) {
    flashActionMessage("Nenhum pedido do Mercado Livre pendente para atualizar.");
    renderLogisticsSyncStatus("Nenhum rastreio ML pendente.");
    return;
  }
  logisticsAutoSyncInFlight = true;
  if (button) {
    button.disabled = true;
    button.textContent = `Atualizando ${candidates.length}...`;
  }
  renderLogisticsSyncStatus(`Atualizando ${candidates.length} rastreio(s) do Mercado Livre...`);
  let ok = 0;
  let failed = 0;
  try {
    for (const order of candidates) {
      try {
        await applyLogisticsSync(order.id);
        ok++;
      } catch (error) {
        failed++;
        console.warn("Falha ao atualizar rastreio ML", order.id, error);
      }
    }
    logisticsLastAutoSyncAt = Date.now();
    flashActionMessage(failed
      ? `Rastreios atualizados: ${ok}. Falhas: ${failed}.`
      : `Rastreios ML atualizados: ${ok}.`);
    renderLogisticsSyncStatus(failed
      ? `Atualizados ${ok}; ${failed} falharam.`
      : `Atualizados ${ok} rastreio(s) do Mercado Livre.`);
  } finally {
    logisticsAutoSyncInFlight = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Atualizar rastreios ML";
    }
    renderLogistics();
  }
}

async function syncLogisticsFromMarketplaceQuiet(orderId) {
  try {
    await applyLogisticsSync(orderId);
  } catch (e) {
    // Silencio - apenas falha silenciosamente, não mostra alerta
  }
}

export function renderLogisticsTimeline(orderId) {
  const target = byId("logisticsTimeline");
  if (!target) return;
  const events = state.logisticsEvents
    .filter((item) => item.order_id === orderId)
    .slice()
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  target.innerHTML = events.length
    ? events.map((item) => `
      <div class="history-row">
        <strong>${html(getLogisticsStatusLabel(item.status))}</strong>
        <span>${formatDateTime(item.occurred_at)}${item.message ? ` • ${html(item.message)}` : ""}</span>
      </div>
    `).join("")
    : `<div class="empty-chart">Nenhum evento de rastreio registrado ainda.</div>`;
}

async function addLogisticsEventRow(orderId, status, message, source = "manual") {
  const payload = {
    organization_id: state.organizationId,
    order_id: orderId,
    status,
    message: message || null,
    occurred_at: new Date().toISOString(),
    source,
    actor_email: state.activeUserEmail || null,
  };
  const { data, error } = await state.supabase.from("logistics_events").insert(payload).select().single();
  if (!error && data) state.logisticsEvents.unshift(data);
}

export async function saveLogisticsInfo(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const orderId = form.get("orderId");
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  const previous = getOrderLogistics(orderId);
  const status = form.get("status") || LOGISTICS_STATUSES[0];
  const payload = {
    order_id: orderId,
    organization_id: state.organizationId,
    carrier: form.get("carrier")?.trim() || null,
    tracking_code: form.get("trackingCode")?.trim() || null,
    status,
    estimated_delivery_date: form.get("estimatedDeliveryDate") || null,
    shipped_at: previous?.shipped_at || null,
    delivered_at: previous?.delivered_at || null,
    updated_at: new Date().toISOString(),
  };
  if (status === "Entregue" && !payload.delivered_at) payload.delivered_at = new Date().toISOString();
  if (["Postado", "Em trânsito", "Saiu para entrega"].includes(status) && !payload.shipped_at) payload.shipped_at = new Date().toISOString();

  const { error } = await state.supabase.from("order_logistics").upsert(payload);
  if (error) {
    showAppMessage("Falha ao salvar rastreio", error.message, "error");
    return;
  }
  const index = state.orderLogistics.findIndex((item) => item.order_id === orderId);
  if (index >= 0) state.orderLogistics[index] = payload;
  else state.orderLogistics.push(payload);

  if (!previous || previous.status !== status) {
    await addLogisticsEventRow(orderId, status, previous ? "Status atualizado manualmente." : "Rastreio iniciado.");
  }
  await recordAudit("update", "order_logistics", orderId, getOrderCode(order), previous, payload, "manual");
  await createNotification(
    "logistics",
    "Rastreio atualizado",
    `${getOrderCode(order)}: ${getLogisticsStatusLabel(status)}`,
    "order",
    orderId,
    status === "Problema na entrega" ? "high" : "normal",
    "all",
  );
  flashActionMessage("Rastreio atualizado.");
  renderLogisticsTimeline(orderId);
  renderLogistics();
}

export async function addLogisticsEvent(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const orderId = data.get("orderId");
  const status = data.get("eventStatus") || "";
  const message = String(data.get("eventMessage") || "").trim();
  if (!orderId || (!status && !message)) return;
  await addLogisticsEventRow(orderId, status || getOrderLogistics(orderId)?.status || LOGISTICS_STATUSES[0], message);
  form.reset();
  form.elements.orderId.value = orderId;
  renderLogisticsTimeline(orderId);
  flashActionMessage("Evento adicionado ao rastreio.");
}

export function getDeliveryStatusCounts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let waiting = 0, inTransit = 0, late = 0, deliveredToday = 0;
  for (const logistics of state.orderLogistics) {
    if (logistics.status === "Entregue") {
      if (logistics.delivered_at && new Date(logistics.delivered_at) >= today) deliveredToday++;
      continue;
    }
    if (["Postado", "Em trânsito", "Saiu para entrega"].includes(logistics.status)) inTransit++;
    else if (logistics.status === "Aguardando envio") waiting++;
    if (logistics.estimated_delivery_date && new Date(`${logistics.estimated_delivery_date}T00:00:00`) < today) late++;
  }
  return { waiting, inTransit, late, deliveredToday };
}

export function renderDeliveryStatusWidget() {
  const target = byId("logisticsStatusWidget");
  if (!target) return;
  const counts = getDeliveryStatusCounts();
  target.innerHTML = `
    <article><span>Aguardando envio</span><strong>${counts.waiting}</strong></article>
    <article><span>Em trânsito</span><strong>${counts.inTransit}</strong></article>
    <article><span>Atrasados</span><strong>${counts.late}</strong></article>
    <article><span>Entregues hoje</span><strong>${counts.deliveredToday}</strong></article>
  `;
}

export async function checkLogisticsDelays() {
  if (!state.canEdit || !state.supabase) return;
  const today = new Date().toISOString().slice(0, 10);
  const alreadyNotified = (entityId) => state.notifications.some((item) =>
    item.type === "logistics"
    && String(item.related_entity_id || "") === String(entityId || "")
    && String(item.created_at || "").startsWith(today)
  );
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const queue = [];
  for (const logistics of state.orderLogistics) {
    if (logistics.status === "Entregue" || logistics.status === "Devolvido") continue;
    if (!logistics.estimated_delivery_date) continue;
    if (new Date(`${logistics.estimated_delivery_date}T00:00:00`) >= now) continue;
    if (alreadyNotified(logistics.order_id)) continue;
    const order = state.data.orders.find((item) => item.id === logistics.order_id);
    queue.push([
      "logistics",
      "Entrega atrasada",
      `${order ? getOrderCode(order) : logistics.order_id} está atrasada (previsão: ${formatDate(logistics.estimated_delivery_date)})`,
      "order",
      logistics.order_id,
      "high",
      "editor",
    ]);
  }
  for (const args of queue.slice(0, 30)) await createNotification(...args);
}
