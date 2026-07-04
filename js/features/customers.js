import { state, money } from "../core/state.js";
import { byId, html, formatDateTime, renderOperationalSummary } from "../core/dom.js";
import { bindActions, setView, render } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { loadRemoteData } from "../data/remote.js";
import { getOrderCode, startOrderEdit } from "./orders.js";
import { recordAudit } from "./logs.js";

export function renderLeads() {
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

export function getInitials(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "CL";
}

export function getLeadOrders(lead) {
  const ids = lead.linked_order_ids || [];
  return state.data.orders.filter((orderItem) => ids.includes(orderItem.id) || orderItem.leadId === lead.id);
}

export function getLeadFollowUp(lead) {
  const reference = new Date(lead.last_contact_at || lead.created_at || 0).getTime();
  const days = Math.floor((Date.now() - reference) / 86400000);
  if (lead.status === "Novo" && days > 3) return "Entrar em contato";
  return "";
}

export function openLeadDialog(id = "") {
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

export function renderLeadFiles(lead) {
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

export function renderLeadHistory(lead) {
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

export async function saveLead(event) {
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

export async function uploadLeadFiles(leadId, files) {
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

export async function openLeadFile(id) {
  const file = state.leadFiles.find((item) => item.id === id);
  if (!file) return;
  const { data, error } = await state.supabase.storage.from("lead-files").createSignedUrl(file.storage_path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export async function deleteLeadFile(id) {
  const file = state.leadFiles.find((item) => item.id === id);
  if (!file || !confirm(`Excluir ${file.file_name}?`)) return;
  await state.supabase.storage.from("lead-files").remove([file.storage_path]);
  const { error } = await state.supabase.from("lead_files").delete().eq("id", id);
  if (error) throw error;
  await recordAudit("lead_file_delete", "lead", file.lead_id, "", file, null, "manual");
  await loadRemoteData();
  renderLeadFiles(state.leads.find((item) => item.id === file.lead_id));
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1048576).toFixed(1)} MB`;
}

export function openOrderFromLead(id) {
  state.query = "";
  setView("orders");
  const item = state.data.orders.find((orderItem) => orderItem.id === id);
  if (item) startOrderEdit(item.id);
}
