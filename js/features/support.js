import { state } from "../core/state.js";
import { byId, html, formatDateTime, flashActionMessage } from "../core/dom.js";
import { loadRemoteData } from "../data/remote.js";

export async function submitSupportTicket(event) {
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

export function renderSupportPortal() {
  const target = byId("supportTicketsList");
  if (!target) return;
  target.innerHTML = state.supportTickets.length ? state.supportTickets.map((ticket) => `
    <article class="list-row support-ticket">
      <div><strong>${html(ticket.subject)}</strong><span>${html(ticket.category)} • ${formatDateTime(ticket.created_at)}</span><p>${html(ticket.message)}</p>${ticket.admin_response ? `<div class="support-response"><strong>Resposta do suporte</strong><p>${html(ticket.admin_response)}</p></div>` : ""}</div>
      <span class="badge ${ticket.status === "Fechado" ? "done" : ticket.priority === "Urgente" ? "danger-badge" : "queue"}">${html(ticket.status)}</span>
    </article>
  `).join("") : `<div class="empty-chart">Nenhum chamado enviado.</div>`;
}

export function renderWhatsNew() {
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
