const params = new URLSearchParams(window.location.search);
const trackingKey = params.get("key") || "";
const input = document.getElementById("orderInput");
const result = document.getElementById("result");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data nao informada" : date.toLocaleDateString("pt-BR");
}

function renderError(message) {
  result.innerHTML = `
    <div class="empty-state" role="alert">
      <div class="empty-state-icon" aria-hidden="true">!</div>
      <div>${escapeHtml(message || "Erro ao buscar pedido")}</div>
    </div>`;
}

function displayOrder(order) {
  const timeline = (Array.isArray(order.logistics) ? order.logistics : []).map((event, index) => `
    <div class="timeline-item ${index === 0 ? "active" : ""}">
      <div class="timeline-date">${safeDate(event.created_at)}</div>
      <div class="timeline-title">${escapeHtml(event.title)}</div>
      <div class="timeline-desc">${escapeHtml(event.description)}</div>
    </div>`).join("");
  const status = String(order.status || "em andamento");
  const statusClass = status.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

  result.innerHTML = `
    <div class="order-card">
      <div class="order-header">
        <div>
          <div class="order-id">Pedido #${escapeHtml(order.id)}</div>
          <div class="order-date">${safeDate(order.created_at)}</div>
        </div>
        <div class="order-status status-${statusClass}">${escapeHtml(status.toUpperCase())}</div>
      </div>
      <div style="margin-bottom: 20px;">
        <strong>${escapeHtml(order.description)}</strong>
        <div style="font-size: 12px; color: #666; margin-top: 5px;">
          Entregar em: ${escapeHtml(order.address_city)}, ${escapeHtml(order.address_state)}
        </div>
      </div>
      <div>
        <strong style="display: block; margin-bottom: 15px;">Historico de entrega</strong>
        <div class="timeline">${timeline || '<p class="empty-state">Sem eventos de entrega</p>'}</div>
      </div>
    </div>`;
}

async function searchOrder() {
  const orderId = input.value.trim();
  if (!orderId) {
    renderError("Digite um codigo de pedido.");
    input.focus();
    return;
  }
  result.textContent = "Carregando...";
  try {
    const query = new URLSearchParams({ order_id: orderId, key: trackingKey });
    const response = await fetch(`/api/tracking?${query}`);
    if (!response.ok) throw new Error("Pedido nao encontrado");
    displayOrder(await response.json());
  } catch (error) {
    renderError(error.message);
  }
}

document.getElementById("searchOrderBtn").addEventListener("click", searchOrder);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchOrder();
});

if (params.has("order")) {
  input.value = params.get("order");
  searchOrder();
}
