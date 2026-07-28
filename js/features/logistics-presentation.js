const MOVING_STATUSES = new Set(["Postado", "Em trânsito", "Saiu para entrega"]);
const PROBLEM_STATUSES = new Set(["Problema na entrega", "Devolvido"]);

function asText(value, fallback) {
  return value == null || String(value).trim() === "" ? fallback : String(value);
}

function normalizeStatus(value) {
  if (value === "Em transito") return "Em trânsito";
  return value || "";
}

function dateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function formatLocalDate(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function currentDateOnly(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("A valid operational date is required in options.now");
    return formatLocalDate(value);
  }
  if (typeof value === "string") {
    const dateOnlyValue = value.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
    if (dateOnlyValue) {
      const [year, month, day] = dateOnlyValue.split("-").map(Number);
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
        return dateOnlyValue;
      }
    } else {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatLocalDate(date);
    }
  }
  throw new TypeError("A valid operational date is required in options.now");
}

function hasMarketplaceSource(order) {
  return Boolean(order?.marketplaceOrderCode || order?.marketplaceCode);
}

function isLate(logistics, operationalDate) {
  const status = normalizeStatus(logistics?.status);
  const estimate = dateOnly(logistics?.estimated_delivery_date);
  return Boolean(
    estimate
    && estimate < operationalDate
    && status !== "Entregue"
    && status !== "Devolvido",
  );
}

function getNextAction(order, logistics, late) {
  const status = normalizeStatus(logistics?.status);
  if (late) return { rank: 0, tone: "danger", label: "Verificar atraso", detail: "Previsao vencida. Confirme no Mercado Livre ou Correios." };
  if (status === "Problema na entrega") return { rank: 1, tone: "danger", label: "Resolver problema", detail: "Priorize contato com cliente ou transportadora." };
  if (status === "Entregue") return { rank: 6, tone: "ok", label: "Concluido", detail: "Entrega finalizada." };
  if (!logistics && hasMarketplaceSource(order)) return { rank: 2, tone: "warning", label: "Buscar rastreio ML", detail: "Venda tem codigo do marketplace, mas nao ha rastreio salvo." };
  if (!logistics) return { rank: 3, tone: "warning", label: "Adicionar rastreio", detail: "Pedido sem codigo de rastreio ou sincronizacao." };
  if (!logistics.tracking_code && hasMarketplaceSource(order)) return { rank: 2, tone: "warning", label: "Sincronizar codigo", detail: "Existe venda vinculada, mas falta codigo de rastreio." };
  if (!logistics.tracking_code) return { rank: 3, tone: "warning", label: "Informar codigo", detail: "Status existe, mas falta codigo para consulta." };
  if (MOVING_STATUSES.has(status)) return { rank: 5, tone: "info", label: "Acompanhar entrega", detail: "Pedido em movimento. Revise se passar da previsao." };
  if (status === "Aguardando envio") return { rank: 4, tone: "warning", label: "Postar pedido", detail: "Ainda nao consta postagem em andamento." };
  return { rank: 7, tone: "neutral", label: "Revisar", detail: "Abra o rastreio para conferir os dados." };
}

function buildItem(order, logistics, events, operationalDate) {
  const status = normalizeStatus(logistics?.status);
  const late = isLate(logistics, operationalDate);
  const orderEvents = events.filter((event) => (event.order_id || event.orderId) === order.id);
  const nextAction = getNextAction(order, logistics, late);
  return {
    order,
    logistics,
    orderId: order.id,
    orderCode: asText(order.orderCode, asText(order.id, "Sem codigo")),
    clientLabel: asText(order.client, "Sem cliente"),
    descriptionLabel: asText(order.description, "Sem descricao"),
    carrierLabel: asText(logistics?.carrier, hasMarketplaceSource(order) ? "Mercado Livre vinculado" : "Sem transportadora"),
    trackingLabel: asText(logistics?.tracking_code, "Sem codigo"),
    statusLabel: asText(status, "Sem rastreio"),
    estimatedDeliveryDate: dateOnly(logistics?.estimated_delivery_date),
    estimatedDeliveryLabel: asText(dateOnly(logistics?.estimated_delivery_date), "Sem previsao"),
    isLate: late,
    events: orderEvents,
    eventCount: orderEvents.length,
    nextAction: {
      tone: nextAction.tone,
      label: nextAction.label,
      detail: nextAction.detail,
    },
    actionRank: nextAction.rank,
  };
}

export function buildLogisticsPresentation(orders = [], logisticsRows = [], options = {}) {
  const operationalDate = currentDateOnly(options?.now);
  const sourceOrders = Array.isArray(orders) ? orders : [];
  const sourceRows = Array.isArray(logisticsRows) ? logisticsRows : [];
  const sourceEvents = Array.isArray(options.events) ? options.events : [];
  const rowByOrderId = new Map(sourceRows.map((row) => [row.order_id || row.orderId, row]));
  const items = sourceOrders
    .filter((order) => order && order.status !== "Orcamento" && order.status !== "Orçamento")
    .map((order) => buildItem(order, rowByOrderId.get(order.id) || null, sourceEvents, operationalDate))
    .sort((left, right) => left.actionRank - right.actionRank);

  const summary = {
    total: items.length,
    waiting: items.filter((item) => !item.logistics || item.statusLabel === "Aguardando envio").length,
    moving: items.filter((item) => MOVING_STATUSES.has(item.statusLabel)).length,
    late: items.filter((item) => item.isLate).length,
    problem: items.filter((item) => PROBLEM_STATUSES.has(item.statusLabel)).length,
    delivered: items.filter((item) => item.statusLabel === "Entregue").length,
  };

  return { summary, items };
}
