import { state } from "../core/state.js";
import { byId, html, formatDateTime } from "../core/dom.js";

export function renderLogs() {
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

export function auditDiffText(oldValue, newValue) {
  if (!oldValue && !newValue) return "Sem detalhes adicionais.";
  const keys = [...new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])].slice(0, 12);
  return keys.map((key) => `${key}: ${formatAuditValue(oldValue?.[key])} -> ${formatAuditValue(newValue?.[key])}`).join("\n");
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
