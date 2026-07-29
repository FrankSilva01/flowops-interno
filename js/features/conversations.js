// FlowOps Next — view Conversas. Shell inbox + thread alimentado por
// buildConversationsModel (puro, empty-safe). Sem fonte de dados real ainda,
// exibe estado vazio explícito — nunca conteúdo fabricado. Seleção é local
// (state.conversationActiveId), com listeners próprios (sem tocar no router).
import { state } from "../core/state.js";
import { byId, html, formatDateTime } from "../core/dom.js";
import { buildConversationsModel } from "./commercial-presentation.js";

function renderThread(target, conversation) {
  if (!conversation) {
    target.innerHTML = `<div class="empty-state conversas-next-thread-empty"><span>Selecione uma conversa para ver as mensagens.</span></div>`;
    return;
  }
  const header = `
    <header class="conversas-next-thread-head">
      <strong>${html(conversation.client)}</strong>
      <small>${html(conversation.channel)}${conversation.at ? " · " + formatDateTime(conversation.at) : ""}</small>
    </header>`;
  const body = conversation.messages.length
    ? `<div class="conversas-next-messages">${conversation.messages.map((m) => `
        <div class="conversas-next-msg ${m.from === "me" || m.outbound ? "out" : "in"}">
          <p>${html(m.text || m.body || "")}</p>
          ${m.at ? `<time>${html(formatDateTime(m.at))}</time>` : ""}
        </div>`).join("")}</div>`
    : `<div class="empty-state"><span>Sem mensagens nesta conversa.</span></div>`;
  target.innerHTML = header + body;
}

export function renderConversations() {
  const inboxEl = byId("conversasInbox");
  const threadEl = byId("conversasThread");
  if (!inboxEl || !threadEl) return;

  const { inbox } = buildConversationsModel(state.conversations || []);

  if (!inbox.length) {
    inboxEl.innerHTML = `<div class="empty-state"><strong>Nenhuma conversa</strong><span>As conversas com clientes e leads aparecem aqui quando o canal estiver conectado.</span></div>`;
    renderThread(threadEl, null);
    return;
  }

  const activeId = inbox.some((c) => c.id === state.conversationActiveId)
    ? state.conversationActiveId
    : inbox[0].id;

  inboxEl.innerHTML = inbox.map((c) => `
    <button type="button" class="conversas-next-item ${c.id === activeId ? "active" : ""}" data-conversation-id="${html(c.id)}">
      <span class="conversas-next-item-top">
        <strong>${html(c.client)}</strong>
        <em>${html(c.channel)}</em>
      </span>
      <span class="conversas-next-item-preview">${html(c.preview || "")}</span>
    </button>`).join("");

  inboxEl.querySelectorAll("[data-conversation-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.conversationActiveId = btn.dataset.conversationId;
      renderConversations();
    });
  });

  renderThread(threadEl, inbox.find((c) => c.id === activeId) || null);
}
