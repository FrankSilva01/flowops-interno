import { state } from "../core/state.js";
import { byId, html, formatDateTime, formatRelativeTime } from "../core/dom.js";

const AUDIT_VERBS = {
  create: "criou",
  update: "alterou",
  delete: "excluiu",
  duplicate: "duplicou",
  import: "importou",
  export: "exportou",
  quote_status: "atualizou o orçamento de",
  quote_convert: "converteu o orçamento de",
  lead_create: "criou o lead",
  lead_update: "editou o lead",
  lead_delete: "excluiu o lead",
  lead_file_delete: "excluiu um arquivo de",
  payment_sync: "atualizou o pagamento de",
  marketplace_sync: "sincronizou",
  subscription_plan_change_requested: "solicitou mudança de plano para",
};

const ENTITY_TYPE_LABELS = {
  order: "uma encomenda",
  product: "um produto",
  lead: "um lead",
  order_logistics: "um rastreio",
  subscription: "a assinatura",
  system: "o sistema",
  marketplace: "o marketplace",
};

const FIELD_LABELS = {
  client: "Cliente",
  description: "Descrição",
  material: "Material",
  status: "Status",
  charged: "Valor cobrado",
  received: "Valor recebido",
  productionStage: "Etapa",
  quantity: "Quantidade",
  delivery_date: "Data de entrega",
  deliveryDate: "Data de entrega",
  priority: "Prioridade",
  responsible: "Responsável",
  marketplaceOrderCode: "Código marketplace",
  internalNotes: "Notas internas",
  tags: "Etiquetas",
  quoteStage: "Orçamento",
  sku: "SKU",
  cost_price: "Custo",
  name: "Nome",
  category: "Categoria",
  notes: "Observações",
  email: "E-mail",
  whatsapp: "WhatsApp",
  origin: "Origem",
  carrier: "Transportadora",
  tracking_code: "Código de rastreio",
  estimated_delivery_date: "Previsão de entrega",
};

const TECHNICAL_FIELDS = new Set([
  "id", "organization_id", "updated_at", "created_at", "user_id", "leadId", "productId",
  "checklist", "history", "source", "quoteUpdatedAt", "stlLink", "referenceImageUrl",
]);

function logIcon(entry) {
  if (entry.type === "access") return "ti-user-check";
  if (entry.type === "orders") return "ti-package";
  const auditIcons = { create: "ti-plus", update: "ti-pencil", delete: "ti-trash", duplicate: "ti-copy", import: "ti-upload", export: "ti-download" };
  return auditIcons[entry.action] || "ti-history";
}

function translateEntityType(type) {
  return ENTITY_TYPE_LABELS[type] || type || "um registro";
}

export function renderLogs() {
  const target = byId("logsList");
  if (!target) return;
  const orderLogs = state.data.orders
    .flatMap((orderItem) => (orderItem.history || []).map((entry) => ({
      type: "orders",
      at: entry.at,
      by: entry.by,
      title: `${entry.by || "Usuário"} alterou ${orderItem.orderCode || orderItem.id}`,
      detail: entry.changes.map((change) => `${change.field}: ${change.from} → ${change.to}`).join("\n"),
      rawDetail: "",
    })));
  const accessLogs = state.accessRequests
    .filter((request) => ["approved", "rejected"].includes(request.status))
    .map((request) => ({
      type: "access",
      at: request.decided_at || request.requested_at,
      by: request.decided_by || "Administrador",
      title: `${request.decided_by || "Administrador"} ${request.status === "approved" ? "aprovou" : "recusou"} o acesso de ${request.email}`,
      detail: `Nome: ${request.name || "-"}\nSolicitado em: ${formatDateTime(request.requested_at)}`,
      rawDetail: "",
    }));
  const auditLogs = state.auditEvents.map((event) => {
    const actor = event.actor_email || event.source || "Sistema";
    const verb = AUDIT_VERBS[event.action] || event.action || "alterou";
    const subject = event.order_code || event.entity_id || translateEntityType(event.entity_type);
    return {
      type: "audit",
      action: event.action,
      at: event.created_at,
      by: actor,
      title: `${actor} ${verb} ${subject}`,
      detail: auditDiffText(event.old_value, event.new_value, { humanized: true }),
      rawDetail: auditDiffText(event.old_value, event.new_value, { humanized: false }),
    };
  });
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
      <i class="ti ${logIcon(entry)} history-row-icon" aria-hidden="true"></i>
      <div class="history-row-body">
        <strong>${html(entry.title)}</strong>
        <span class="history-row-time" title="${formatDateTime(entry.at)}">${formatRelativeTime(entry.at)}</span>
        <div class="history-row-detail">${html(entry.detail).replace(/\n/g, "<br>")}</div>
        ${entry.rawDetail ? `<details class="history-tech-details"><summary>Ver detalhes técnicos</summary><pre>${html(entry.rawDetail)}</pre></details>` : ""}
      </div>
    </div>
  `).join("") : `<div class="empty-chart">${state.historyCleared ? "Histórico limpo da tela. Use os filtros ou carregue mais para exibir novamente." : "Sem histórico registrado para os filtros selecionados."}</div>`;
  byId("loadMoreHistoryBtn").hidden = state.historyCleared || rows.length < state.historyLimit;
}

export function applyHistoryRange() {
  state.historyDateFrom = byId("historyDateFrom").value;
  state.historyDateTo = byId("historyDateTo").value;
  state.historyCleared = false;
  state.historyLimit = 40;
  renderLogs();
}

export function isWithinDateRange(value, from, to) {
  const time = new Date(value || 0).getTime();
  if (!time) return !from && !to;
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime()) return false;
  return true;
}

export function auditActionLabel(action) {
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

export function translateFieldLabel(key) {
  return FIELD_LABELS[key] || key;
}

export function auditDiffText(oldValue, newValue, { humanized = true } = {}) {
  if (!oldValue && !newValue) return "Sem detalhes adicionais.";
  const keys = [...new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])];
  const visibleKeys = (humanized ? keys.filter((key) => !TECHNICAL_FIELDS.has(key)) : keys).slice(0, 12);
  if (!visibleKeys.length) return "Sem detalhes adicionais.";
  return visibleKeys
    .map((key) => `${humanized ? translateFieldLabel(key) : key}: ${formatAuditValue(oldValue?.[key])} -> ${formatAuditValue(newValue?.[key])}`)
    .join("\n");
}

export function formatAuditValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function recordAudit(action, entityType, entityId, orderCode, oldValue, newValue, source = "manual", metadata = {}) {
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

export function auditSnapshot(value) {
  if (!value || typeof value !== "object") return value || null;
  const blocked = new Set(["referenceImageUrl", "stlLink", "referenceImages", "stlFile", "history", "checklist"]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !blocked.has(key))
    .map(([key, entry]) => [key, typeof entry === "string" && entry.length > 800 ? `${entry.slice(0, 800)}...` : entry]));
}
