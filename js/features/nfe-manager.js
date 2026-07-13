import { state, money } from "../core/state.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";

// ========================================================================
// NF-e INTEGRATION: Focus NFe Sync
// ========================================================================

export async function syncNFe() {
  showAppMessage("Sincronizando NF-e do servidor...", "info");

  const response = await fetch(
    `https://djvrhvzjvnyensbobtby.functions.supabase.co/nfe-sync?action=sync&organization_id=${state.organizationId}`,
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
      `https://djvrhvzjvnyensbobtby.functions.supabase.co/nfe-sync?action=get-danfe&invoice_id=${invoice.external_id}&organization_id=${state.organizationId}`,
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

export async function sendDANFEByEmail(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  if (!order?.client) {
    showAppMessage("Pedido sem cliente", "error");
    return;
  }

  const invoice = getInvoiceForOrder(orderId);
  if (!invoice?.danfe_url) {
    showAppMessage("DANFE nao disponivel", "error");
    return;
  }

  // TODO: Chamar Edge Function para enviar via Brevo
  showAppMessage("DANFE será enviado por email em breve...", "info");

  // Simular
  setTimeout(() => {
    flashActionMessage(`DANFE enviado para ${order.client}@example.com ✉️`);
  }, 1000);
}

export function renderNFeActions(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  const invoice = getInvoiceForOrder(orderId);

  if (!invoice) return "";

  return `
    <div class="nfe-actions">
      <button class="icon-btn" onclick="downloadDANFE('${orderId}')" title="Baixar DANFE">
        📄 DANFE
      </button>
      <button class="icon-btn" onclick="sendDANFEByEmail('${orderId}')" title="Enviar por email">
        ✉️ Email
      </button>
      <button class="icon-btn" onclick="viewNFeDetails('${orderId}')" title="Ver detalhes">
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
        <button class="primary-btn" onclick="downloadDANFE('${orderId}')">
          📄 Baixar DANFE
        </button>
        <button class="secondary-btn" onclick="this.closest('.nfe-details-modal').remove()">
          Fechar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".close-btn").addEventListener("click", () => modal.remove());
  modal.querySelector(".modal-overlay").addEventListener("click", () => modal.remove());
}
