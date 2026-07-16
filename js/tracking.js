const params = new URLSearchParams(window.location.search);
const input = document.getElementById("orderInput");
const result = document.getElementById("result");

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function safeDate(value, fallback = "Data nao informada") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("pt-BR");
}

function renderError(message) {
  result.innerHTML = `<div class="empty-state" role="alert"><div class="empty-state-icon" aria-hidden="true">!</div><div>${escapeHtml(message || "Erro ao buscar pedido")}</div></div>`;
}

function displayOrder(order) {
  const events = Array.isArray(order.events) ? order.events : [];
  const timeline = events.map((event, index) => `
    <div class="timeline-item ${index === 0 ? "active" : ""}">
      <div class="timeline-date">${safeDate(event.occurred_at)}</div>
      <div class="timeline-title">${escapeHtml(event.status || "Atualizacao da entrega")}</div>
      <div class="timeline-desc">${escapeHtml(event.message || "Status atualizado")}</div>
    </div>`).join("");
  const logistics = order.logistics || {};
  const status = String(logistics.status || order.status || "Em andamento");
  const statusClass = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, "-");
  const details = [
    logistics.carrier ? `<div><strong>Transportadora</strong><span>${escapeHtml(logistics.carrier)}</span></div>` : "",
    logistics.tracking_code ? `<div><strong>Codigo de rastreio</strong><span>${escapeHtml(logistics.tracking_code)}</span></div>` : "",
    `<div><strong>Previsao</strong><span>${safeDate(logistics.estimated_delivery_date || order.delivery_date, "A confirmar")}</span></div>`,
  ].filter(Boolean).join("");

  result.innerHTML = `<div class="order-card">
    <div class="order-header"><div><div class="order-id">Pedido #${escapeHtml(order.id)}</div><div class="order-date">Criado em ${safeDate(order.created_at)}</div></div><div class="order-status status-${statusClass}">${escapeHtml(status.toUpperCase())}</div></div>
    <div class="tracking-product"><strong>${escapeHtml(order.description)}</strong></div>
    <div class="tracking-details">${details}</div>
    <div><strong class="timeline-heading">Historico de entrega</strong><div class="timeline">${timeline || '<p class="empty-state">Ainda nao ha eventos de entrega.</p>'}</div></div>
  </div>`;
}

function trackingEndpoint(token) {
  const config = window.SUPABASE_CONFIG || {};
  const functionsUrl = config.FUNCTIONS_URL || `${String(config.SUPABASE_URL || "").replace(/\/$/, "")}/functions/v1`;
  return `${functionsUrl}/public-tracking?${new URLSearchParams({ token })}`;
}

async function searchOrder() {
  const token = input.value.trim();
  if (!token) { renderError("Informe o codigo seguro de rastreamento."); input.focus(); return; }
  result.textContent = "Carregando...";
  try {
    const config = window.SUPABASE_CONFIG || {};
    const response = await fetch(trackingEndpoint(token), {
      headers: config.SUPABASE_ANON_KEY ? { apikey: config.SUPABASE_ANON_KEY } : {},
      referrerPolicy: "no-referrer",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Rastreamento nao encontrado");
    displayOrder(body);
  } catch (error) { renderError(error.message); }
}

document.getElementById("searchOrderBtn").addEventListener("click", searchOrder);
input.addEventListener("keydown", (event) => { if (event.key === "Enter") searchOrder(); });
if (params.has("token")) { input.value = params.get("token"); searchOrder(); }
