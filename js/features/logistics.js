import { state } from "../core/state.js";
import { byId, html, formatDate, formatDateTime, flashActionMessage, renderOperationalSummary } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { recordAudit } from "./logs.js";
import { getOrderCode } from "./orders.js";
import { createNotification } from "./notifications.js";
import { syncMlShipment } from "./marketplace.js";
import { getProductForOrder, renderProductionAssetShortcut } from "./product-assets.js";

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

function isLogisticsLate(logistics) {
  if (!logistics?.estimated_delivery_date || logistics.status === "Entregue" || logistics.status === "Devolvido") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${logistics.estimated_delivery_date}T00:00:00`) < today;
}

function getLogisticsNextAction(order, logistics) {
  if (isLogisticsLate(logistics)) return { tone: "danger", label: "Verificar atraso", detail: "Previsao vencida. Confirme no Mercado Livre ou Correios." };
  if (logistics?.status === "Problema na entrega") return { tone: "danger", label: "Resolver problema", detail: "Priorize contato com cliente ou transportadora." };
  if (logistics?.status === "Entregue") return { tone: "ok", label: "Concluido", detail: "Entrega finalizada." };
  if (!logistics && hasMarketplaceTrackingSource(order)) return { tone: "warning", label: "Buscar rastreio ML", detail: "Venda tem codigo do marketplace, mas nao ha rastreio salvo." };
  if (!logistics) return { tone: "warning", label: "Adicionar rastreio", detail: "Pedido sem codigo de rastreio ou sincronizacao." };
  if (!logistics.tracking_code && hasMarketplaceTrackingSource(order)) return { tone: "warning", label: "Sincronizar codigo", detail: "Existe venda vinculada, mas falta codigo de rastreio." };
  if (!logistics.tracking_code) return { tone: "warning", label: "Informar codigo", detail: "Status existe, mas falta codigo para consulta." };
  if (["Postado", "Em trânsito", "Saiu para entrega"].includes(logistics.status)) return { tone: "info", label: "Acompanhar entrega", detail: "Pedido em movimento. Revise se passar da previsao." };
  if (logistics.status === "Aguardando envio") return { tone: "warning", label: "Postar pedido", detail: "Ainda nao consta postagem em andamento." };
  return { tone: "neutral", label: "Revisar", detail: "Abra o rastreio para conferir os dados." };
}

function getLogisticsRows() {
  const search = state.logisticsSearch || "";
  const statusFilter = state.logisticsStatusFilter || "all";
  return state.data.orders
    .filter((order) => order.status !== "Orçamento")
    .map((order) => {
      const logistics = getOrderLogistics(order.id);
      return { order, logistics, action: getLogisticsNextAction(order, logistics) };
    })
    .filter(({ order, logistics }) => {
      const missingTracking = !logistics || !logistics.tracking_code;
      if (statusFilter === "sem-rastreio" && !missingTracking) return false;
      if (statusFilter !== "all" && statusFilter !== "sem-rastreio" && (logistics?.status || "") !== statusFilter) return false;
      if (search) {
        const text = `${getOrderCode(order)} ${order.client || ""} ${order.description || ""} ${order.marketplaceOrderCode || ""} ${logistics?.tracking_code || ""}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
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

function renderLogisticsActionBoard(rows) {
  const target = byId("logisticsActionBoard");
  if (!target) return;
  const sourceRows = rows || getLogisticsRows();
  const late = sourceRows.filter(({ logistics }) => isLogisticsLate(logistics));
  const missing = sourceRows.filter(({ logistics }) => !logistics || !logistics.tracking_code);
  const problems = sourceRows.filter(({ logistics }) => logistics?.status === "Problema na entrega" || logistics?.status === "Devolvido");
  const moving = sourceRows.filter(({ logistics }) => ["Postado", "Em trânsito", "Saiu para entrega"].includes(logistics?.status));
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

export function renderLogistics() {
  const target = byId("logisticsTable");
  if (!target) return;
  const rows = getLogisticsRows();
  const counts = getDeliveryStatusCounts();
  renderOperationalSummary("logisticsView", "logisticsPageSummary", [
    ["Aguardando envio", counts.waiting, "sem despacho ainda", "amber"],
    ["Em trânsito", counts.inTransit, "a caminho do cliente", "blue"],
    ["Atrasados", counts.late, "passaram da previsão", "red"],
    ["Entregues hoje", counts.deliveredToday, "concluídos no dia", "green"],
  ]);
  renderLogisticsActionBoard(rows);
  maybeAutoSyncMarketplaceLogistics();
  target.innerHTML = rows.length ? rows.map(({ order, logistics, action }) => `
    <tr>
      <td><strong>${html(getOrderCode(order))}</strong><br><small>${html(order.client || order.description || "")}</small></td>
      <td>${renderProductionAssetShortcut(getProductForOrder(order), { compact: true, empty: "Sem produto vinculado" })}</td>
      <td><span class="badge ${getLogisticsStatusClass(logistics?.status)}">${html(getLogisticsStatusLabel(logistics?.status))}</span><br><small>${html(logistics?.carrier || (hasMarketplaceTrackingSource(order) ? "Mercado Livre vinculado" : "Sem transportadora"))}</small></td>
      <td>${logistics?.tracking_code ? html(logistics.tracking_code) : `<span class="muted">Sem codigo</span>`}</td>
      <td>${logistics?.estimated_delivery_date ? formatDate(logistics.estimated_delivery_date) : "-"}</td>
      <td><strong class="logistics-next-action ${html(action.tone)}">${html(action.label)}</strong><br><small>${html(action.detail)}</small></td>
      <td><button class="secondary-btn" type="button" data-action="open-logistics" data-id="${html(order.id)}">Abrir</button></td>
    </tr>
  `).join("") : `<tr><td colspan="7"><div class="empty-state compact"><strong>Nenhuma encomenda encontrada</strong><span>Ajuste os filtros ou aguarde novas encomendas.</span></div></td></tr>`;
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
  byId("logisticsDialogTitle").textContent = `Rastreio - ${getOrderCode(order)}`;
  renderLogisticsTimeline(orderId);
  byId("logisticsDialog").showModal();
  // Auto-sync if order has marketplace code and is not delivered
  const marketplaceCode = order.marketplaceOrderCode || order.marketplaceCode;
  if (marketplaceCode && logistics?.status !== "Entregue" && order.status !== "Entregue") {
    syncLogisticsFromMarketplaceQuiet(orderId).catch(e => console.log("Auto-sync skipped:", e.message));
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
    alert(`Não foi possível sincronizar com o Mercado Livre: ${error.message}`);
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
    alert(`Não foi possível salvar o rastreio: ${error.message}`);
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
