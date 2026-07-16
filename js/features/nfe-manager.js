import { state, money } from "../core/state.js";
import { supabaseFunctionUrl } from "../core/config.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";

// ========================================================================
// NF-e INTEGRATION: Focus NFe Sync
// ========================================================================

export async function syncNFe() {
  showAppMessage("Sincronizando NF-e do servidor...", "info");

  const response = await fetch(
    `${supabaseFunctionUrl("nfe-sync")}?action=sync&organization_id=${state.organizationId}`,
    { method: "GET", headers: await nfeAuthHeaders() }
  );

  const result = await response.json();

  if (result.ok) {
    flashActionMessage(`✅ ${result.synced} NF-e sincronizadas (${result.total} total)`);
    // Recarregar invoices
    await loadInvoices();
  } else {
    showAppMessage(`Erro: ${result.error}`, "error");
  }
}

export async function loadInvoices() {
  // Carregar invoices do Supabase
  const { data } = await state.supabase
    .from("invoices")
    .select("*")
    .eq("organization_id", state.organizationId)
    .order("issued_at", { ascending: false });

  state.invoices = data || [];
}

export function getInvoiceForOrder(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  if (!order?.invoice_id) return null;

  return state.invoices?.find(inv => inv.external_id === order.invoice_id);
}

export function renderNFeStatus(invoice) {
  if (!invoice) {
    return `<span class="nfe-badge pending">Aguardando NF-e</span>`;
  }

  const statusBadges = {
    authorized: "🟢 NF-e autorizada",
    denied: "🔴 NF-e rejeitada",
    cancelled: "⚪ NF-e cancelada",
    pending: "🟡 Processando NF-e",
  };

  const badge = statusBadges[invoice.status] || "❓ Desconhecido";
  const className = `nfe-badge ${invoice.status}`;

  return `
    <div class="${className}">
      ${badge}
      <small>${invoice.number}/${invoice.series}</small>
    </div>
  `;
}

export async function downloadDANFE(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  if (!order?.invoice_id) {
    showAppMessage("Pedido sem NF-e", "error");
    return;
  }

  const invoice = state.invoices?.find(inv => inv.external_id === order.invoice_id);
  if (!invoice) {
    showAppMessage("NF-e nao encontrada", "error");
    return;
  }

  try {
    const response = await fetch(
      `${supabaseFunctionUrl("nfe-sync")}?action=get-danfe&invoice_id=${invoice.external_id}&organization_id=${state.organizationId}`,
      { headers: await nfeAuthHeaders() }
    );

    if (!response.ok) throw new Error("DANFE nao disponivel");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `DANFE_${invoice.number}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    flashActionMessage("DANFE baixado ✅");
  } catch (error) {
    showAppMessage(`Erro ao baixar DANFE: ${error.message}`, "error");
  }
}

async function nfeAuthHeaders() {
  const { data } = await state.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Entre novamente.");
  return { Authorization: `Bearer ${token}` };
}

export function renderNFeActions(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  const invoice = getInvoiceForOrder(orderId);

  if (!invoice) return "";

  return `
    <div class="nfe-actions">
      <button class="icon-btn" data-nfe-download="${html(orderId)}" type="button" title="Baixar DANFE">
        📄 DANFE
      </button>
      <button class="icon-btn" data-nfe-details="${html(orderId)}" type="button" title="Ver detalhes">
        ℹ️ Detalhes
      </button>
    </div>
  `;
}

export function viewNFeDetails(orderId) {
  const invoice = getInvoiceForOrder(orderId);
  if (!invoice) return;

  const modal = document.createElement("div");
  modal.className = "nfe-details-modal";
  modal.innerHTML = `
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h2>Detalhes da NF-e</h2>
        <span class="close-btn">✕</span>
      </div>

      <div class="modal-body">
        <div class="detail-row">
          <strong>Número:</strong>
          <span>${invoice.number}/${invoice.series}</span>
        </div>
        <div class="detail-row">
          <strong>Chave:</strong>
          <span class="mono">${invoice.nf_key}</span>
        </div>
        <div class="detail-row">
          <strong>Emissão:</strong>
          <span>${new Date(invoice.issued_at).toLocaleDateString("pt-BR")}</span>
        </div>
        <div class="detail-row">
          <strong>Status:</strong>
          <span class="status-badge ${invoice.status}">
            ${invoice.status.toUpperCase()}
          </span>
        </div>
        <div class="detail-row">
          <strong>Razão Social:</strong>
          <span>${invoice.issuer_name}</span>
        </div>
        <div class="detail-row">
          <strong>CNPJ:</strong>
          <span class="mono">${invoice.issuer_cnpj}</span>
        </div>
      </div>

      <div class="modal-actions">
        <button class="primary-btn" data-nfe-download="${html(orderId)}" type="button">
          📄 Baixar DANFE
        </button>
        <button class="secondary-btn" data-nfe-close type="button">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".close-btn").addEventListener("click", () => modal.remove());
  modal.querySelector(".modal-overlay").addEventListener("click", () => modal.remove());
  modal.querySelector("[data-nfe-close]")?.addEventListener("click", () => modal.remove());
  modal.querySelector("[data-nfe-download]")?.addEventListener("click", () => downloadDANFE(orderId));
}

if (!window.__flowOpsNfeActionsBound) {
  window.__flowOpsNfeActionsBound = true;
  document.addEventListener("click", (event) => {
    const detailsButton = event.target.closest("[data-nfe-details]");
    if (detailsButton) viewNFeDetails(detailsButton.dataset.nfeDetails);
    const downloadButton = event.target.closest("[data-nfe-download]");
    if (downloadButton && !downloadButton.closest(".nfe-details-modal")) {
      downloadDANFE(downloadButton.dataset.nfeDownload);
    }
  });
}
