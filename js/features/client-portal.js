// FlowOps Next — view Portal do cliente. Preview do que o cliente vê (etapa,
// pagamento, progresso) via buildPortalPreview, e compartilhamento do link
// público REUSANDO o contrato existente de tracking.html (data-action=
// copy-public-tracking, tratado no router). Não altera o contrato público.
import { state, money } from "../core/state.js";
import { byId, html } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { buildPortalPreview } from "./commercial-presentation.js";

export function renderClientPortal() {
  const select = byId("portalOrderSelect");
  const preview = byId("portalPreview");
  if (!select || !preview) return;

  const orders = state.data.orders || [];
  if (!orders.length) {
    select.innerHTML = "";
    preview.innerHTML = `<div class="empty-state"><strong>Nenhuma encomenda</strong><span>Cadastre uma encomenda para gerar o portal do cliente.</span></div>`;
    return;
  }

  const activeId = orders.some((o) => o.id === state.portalOrderId) ? state.portalOrderId : orders[0].id;
  select.innerHTML = orders.map((o) =>
    `<option value="${html(o.id)}" ${o.id === activeId ? "selected" : ""}>${html(o.orderCode || o.id)} — ${html(o.client || "Sem cliente")}</option>`
  ).join("");
  if (!select.dataset.bound) {
    select.dataset.bound = "1";
    select.addEventListener("change", () => {
      state.portalOrderId = select.value;
      renderClientPortal();
    });
  }

  const order = orders.find((o) => o.id === activeId);
  const model = buildPortalPreview(order);
  const pct = Math.round((model.progresso || 0) * 100);
  const hasToken = Boolean(order.public_tracking_token) && order.public_tracking_enabled !== false;

  preview.innerHTML = `
    <article class="portal-next-card">
      <header class="portal-next-card-head">
        <strong>${html(model.titulo)}</strong>
        <span class="portal-next-stage">${html(model.etapaAtual)}</span>
      </header>
      <div class="portal-next-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="portal-next-progress-bar" style="width:${pct}%"></div>
      </div>
      <dl class="portal-next-pay">
        <div><dt>Recebido</dt><dd>${money(model.pagamento.recebido)}</dd></div>
        <div><dt>Total</dt><dd>${money(model.pagamento.total)}</dd></div>
        <div><dt>Progresso</dt><dd>${pct}%</dd></div>
      </dl>
      <div class="portal-next-actions">
        <button class="primary-btn" type="button" data-action="copy-public-tracking" data-id="${html(order.id)}" ${hasToken ? "" : "disabled"}>Copiar link do cliente</button>
        ${hasToken ? "" : `<small class="portal-next-hint">Link público desativado nesta encomenda — ative em Logística para compartilhar.</small>`}
      </div>
    </article>`;

  bindActions();
}
