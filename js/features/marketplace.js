import { state, money, saveData } from "../core/state.js";
import {
  byId, html, number, formatDateTime, flashActionMessage, showAppMessage, sanitizeRichHtml,
  renderOperationalSummary,
} from "../core/dom.js";
import { ensureCanAdmin } from "../core/permissions.js";
import { setView, bindActions, render, renderTables } from "../core/router.js";
import { loadRemoteData } from "../data/remote.js";
import { getOrderCode, syncOrderFilterControls } from "./orders.js";
import { recordAudit, isWithinDateRange } from "./logs.js";
import { getTokenAlert } from "./dashboard.js";
import { renderProfitabilityBadge, renderCommercialIntelligence, getListingProfitability } from "./pricing.js";
import { renderMarketplaceAnalyticsPanel, getListingAnalytics, computeIntentScore } from "./marketplace-analytics.js";
import { getProductForSale, renderProductionAssetShortcut } from "./product-assets.js";

const MARKETPLACE_CHANNELS = [
  { id: "mercado-livre", label: "Mercado Livre" },
  { id: "shopee", label: "Shopee" },
  { id: "amazon", label: "Amazon" },
  { id: "tiktok-shop", label: "TikTok Shop" }
];

export function normalizeMarketplaceChannel(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (["mercadolivre", "ml", "meli"].includes(normalized)) return "mercado-livre";
  if (normalized === "shopee") return "shopee";
  if (normalized === "amazon") return "amazon";
  if (["tiktokshop", "tiktok"].includes(normalized)) return "tiktok-shop";
  return normalized || "mercado-livre";
}

export function marketplaceDisplayName(value) {
  const channel = MARKETPLACE_CHANNELS.find((item) => item.id === normalizeMarketplaceChannel(value));
  return channel?.label || value || "Marketplace";
}

export function matchesMarketplaceChannel(item) {
  return state.marketplaceChannelFilter === "all"
    || normalizeMarketplaceChannel(item?.marketplace) === state.marketplaceChannelFilter;
}

export function marketplaceChannelsForCurrentFilter() {
  return state.marketplaceChannelFilter === "all" ?
     MARKETPLACE_CHANNELS
    : MARKETPLACE_CHANNELS.filter((item) => item.id === state.marketplaceChannelFilter);
}

function ensureHttpsUrl(url) {
  if (!url) return "";
  return String(url).replace(/^http:/, "https:");
}

export function renderMarketplaceChannelCards() {
  return marketplaceChannelsForCurrentFilter().map((channel) => {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id);
    const listings = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id).length;
    const sales = state.marketplaceSales.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id).length;
    const errors = state.marketplaceLogs.filter((item) =>
      normalizeMarketplaceChannel(item.marketplace) === channel.id && item.status === "error"
    ).length;
    return `
      <article class="marketplace-channel-card ${account ? "connected" : ""}">
        <div class="marketplace-channel-card-head">
          <strong>${html(channel.label)}</strong>
          <span class="badge ${account ? "done" : "neutral"}">${account ? "Conectado" : "Não conectado"}</span>
        </div>
        <dl>
          <div><dt>Conta</dt><dd>${html(account?.seller_name || account?.external_seller_id || "-")}</dd></div>
          <div><dt>Anúncios</dt><dd>${listings}</dd></div>
          <div><dt>Vendas</dt><dd>${sales}</dd></div>
          <div><dt>Erros API</dt><dd>${errors}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

export function getIntegrationTokenAlert() {
  if (state.marketplaceChannelFilter === "shopee") {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === "shopee");
    if (!account) return { level: "warning", message: "Shopee ainda não conectada. Configure as credenciais para sincronizar anúncios e vendas." };
  }
  if (state.marketplaceChannelFilter === "amazon") {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === "amazon");
    return account ?
       { level: "success", message: "Amazon conectada. Tokens LWA sao renovados automaticamente." }
      : { level: "warning", message: "Amazon preparada. Conecte uma conta Seller para ativar anuncios e vendas." };
  }
  const alert = getTokenAlert();
  if (alert && state.marketplaceChannelFilter !== "shopee") return alert;
  if (state.marketplaceChannelFilter === "mercado-livre") {
    return { level: "success", message: "Token Mercado Livre dentro do prazo." };
  }
  return null;
}

// Filtros rapidos da aba Anuncios (Bloco 2) - busca por texto + checkboxes.
// Aplica depois do filtro de canal (matchesMarketplaceChannel), antes de
// renderizar a tabela.
export function filterListingsForDisplay(listings) {
  const search = (state.marketplaceListingSearch || "").toLowerCase();
  const filters = state.marketplaceListingFilters;
  return listings.filter((item) => {
    if (search && !`${item.title} ${item.external_id} ${item.sku || ""}`.toLowerCase().includes(search)) return false;
    const analytics = getListingAnalytics(item.marketplace, item.external_id);
    const intent = computeIntentScore(analytics);
    if (filters.noSales && Number(analytics?.sold_quantity || 0) > 0) return false;
    if (filters.visits100 && Number(analytics?.visits || 0) <= 100) return false;
    if (filters.questions3 && Number(analytics?.questions_total || 0) <= 3) return false;
    if (filters.zeroStock && Number(item.stock || item.available_quantity || 0) > 0) return false;
    if (filters.marginUnder20) {
      const profitability = getListingProfitability(item);
      if (!profitability.hasCost || profitability.marginPct >= 20) return false;
    }
    if (filters.intentHigh && (!intent || intent.score < 60)) return false;
    if (filters.intentVeryHigh && (!intent || intent.score < 80)) return false;
    return true;
  });
}

export function renderMarketplaces() {
  const accountsTable = byId("marketplaceAccountsTable");
  const listingsGrid = byId("marketplaceListingsGrid");
  const salesGrid = byId("marketplaceSalesGrid");
  const logsSummary = byId("marketplaceLogsSummary");
  const apiLogsList = byId("marketplaceApiLogsList");
  const status = byId("marketplaceStatus");
  const channelCards = byId("marketplaceChannelCards");
  const storefrontList = byId("storefrontProductList");
  if (!accountsTable || !listingsGrid || !salesGrid || !logsSummary || !apiLogsList || !status) return;
  if (!state.isAdmin) {
    accountsTable.innerHTML = "";
    listingsGrid.innerHTML = "";
    salesGrid.innerHTML = "";
    logsSummary.innerHTML = "";
    apiLogsList.innerHTML = "";
    if (storefrontList) storefrontList.innerHTML = "";
    return;
  }
  const accounts = state.marketplaceAccounts.filter(matchesMarketplaceChannel);
  const listings = filterListingsForDisplay(state.marketplaceListings.filter(matchesMarketplaceChannel));
  const sales = state.marketplaceSales.filter(matchesMarketplaceChannel);
  const logs = state.marketplaceLogs.filter(matchesMarketplaceChannel);
  renderOperationalSummary("marketplaceListingsView", "marketplacePageSummary", [
    ["Anúncios ativos", listings.filter((item) => item.status === "active").length, `${listings.length} sincronizados`, "green"],
    ["Visualizações hoje", listings.reduce((sum, item) => sum + Number(item.views_today || 0), 0), "desempenho dos anúncios", "blue"],
    ["Conversões hoje", sales.length, "vendas importadas", "amber"],
    ["Receita gerada", money.format(sales.reduce((sum, item) => sum + Number(item.raw_payload?.total_amount || 0), 0)), "vendas do filtro atual", "teal"],
    ["Com problemas", listings.filter((item) => !["active", "paused"].includes(item.status)).length, "requer atenção", "red"],
  ]);
  renderIntegrationSummary();
  renderStorefrontAdmin();
  renderCommercialIntelligence();
  renderMarketplaceAnalyticsPanel();
  if (channelCards) channelCards.innerHTML = renderMarketplaceChannelCards();
  status.innerHTML = state.marketplaceAccounts.length ?
     `<span class="badge done">Mercado Livre conectado</span><small>${state.marketplaceListings.length} anúncio${state.marketplaceListings.length === 1 ? "" : "s"} importado${state.marketplaceListings.length === 1 ? "" : "s"}</small>`
    : `<span class="badge neutral">Mercado Livre não conectado</span><small>Conecte a conta para importar anúncios e vendas.</small>`;
  status.innerHTML = marketplaceChannelsForCurrentFilter().map((channel) => {
    const account = state.marketplaceAccounts.find((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id);
    const count = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel.id).length;
    return account ?
       `<span class="badge done">${channel.label} conectado</span><small>${count} anúncio${count === 1 ? "" : "s"} sincronizado${count === 1 ? "" : "s"}</small>`
      : `<span class="badge neutral">${channel.label} não conectado</span>`;
  }).join("");
  const shopeeSelected = state.marketplaceChannelFilter === "shopee";
  const amazonSelected = state.marketplaceChannelFilter === "amazon";
  const syncListingsButton = byId("syncMercadoLivreBtn");
  const syncSalesButton = byId("syncMarketplaceSalesBtn");
  if (syncListingsButton) syncListingsButton.textContent = shopeeSelected ? "Configurar Shopee" : amazonSelected ? "Sincronizar Amazon" : "Sincronizar ML";
  if (syncSalesButton) syncSalesButton.textContent = shopeeSelected ? "Configurar Shopee" : amazonSelected ? "Sincronizar Amazon" : "Sincronizar vendas";
  accountsTable.innerHTML = accounts.length ? accounts.map((item) => `
    <tr>
      <td>${html(item.marketplace)}</td>
      <td>${html(item.seller_name || item.external_seller_id || "-")}</td>
      <td>${renderMarketplaceWritePermission(item)}</td>
      <td>${formatDateTime(item.token_expires_at)}</td>
      <td>${formatDateTime(item.updated_at)}</td>
      <td>
        <div class="inline-actions">
          ${normalizeMarketplaceChannel(item.marketplace) === "mercado-livre" ? `<button class="secondary-btn" type="button" data-action="marketplace-reconnect-ml">Reconectar</button><button class="secondary-btn danger" type="button" data-action="marketplace-disconnect-ml">Desconectar</button>` : "-"}
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="6">Nenhuma conta conectada.</td></tr>`;
  const featuredListing = listings[0];
  listingsGrid.innerHTML = listings.length ? `
    <div class="marketplace-listing-table-wrap">
      <table class="marketplace-listing-table">
        <thead><tr><th>Produto</th><th>Marketplace</th><th>Preço</th><th>Estoque</th><th>Visualizações</th><th>Conversão</th><th>Intenção</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${listings.map((item) => {
          const analytics = getListingAnalytics(item.marketplace, item.external_id);
          const intent = computeIntentScore(analytics);
          return `
          <tr>
            <td><div class="listing-product-cell">${item.thumbnail_url ? `<img src="${html(ensureHttpsUrl(item.thumbnail_url))}" alt="" loading="lazy" />` : `<span class="listing-placeholder"></span>`}<span><strong>${html(item.title)}</strong><small>${html(item.external_id)}</small></span></div></td>
            <td>${html(marketplaceDisplayName(item.marketplace))}</td>
            <td>${money.format(Number(item.price || 0))} ${renderProfitabilityBadge(item)}</td>
            <td>${Number(item.stock || item.available_quantity || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.views || item.views_today || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.conversion || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
            <td>${intent ? `<span class="badge ${intent.level.className}" title="${html(intent.level.advice)}">${intent.level.emoji} ${intent.score}</span>` : `<span class="badge neutral" title="Sincronize as métricas para calcular">-</span>`}</td>
            <td><span class="badge ${item.status === "active" ? "done" : "neutral"}">${html(item.status || "-")}</span></td>
            <td><div class="inline-actions"><button class="secondary-btn" type="button" data-action="marketplace-stats" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Ver</button><button class="secondary-btn" type="button" data-action="marketplace-edit" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Editar</button></div></td>
          </tr>`;
        }).join("")}
        </tbody>
      </table>
    </div>
    <aside class="marketplace-listing-detail">
      ${featuredListing.thumbnail_url ? `<img src="${html(ensureHttpsUrl(featuredListing.thumbnail_url))}" alt="${html(featuredListing.title)}" />` : ""}
      <span class="badge ${featuredListing.status === "active" ? "done" : "neutral"}">${html(featuredListing.status || "-")}</span>
      <h3>${html(featuredListing.title)}</h3>
      <small>${html(featuredListing.external_id)}</small>
      <dl><div><dt>Marketplace</dt><dd>${html(marketplaceDisplayName(featuredListing.marketplace))}</dd></div><div><dt>Preço</dt><dd>${money.format(Number(featuredListing.price || 0))}</dd></div><div><dt>Estoque</dt><dd>${Number(featuredListing.stock || featuredListing.available_quantity || 0)} unidades</dd></div></dl>
      <button class="primary-btn" type="button" data-action="marketplace-edit" data-id="${html(featuredListing.external_id)}" data-marketplace="${html(featuredListing.marketplace || "Mercado Livre")}">Editar anúncio</button>
    </aside>
  ` : `<div class="empty-chart">Nenhum anúncio importado.</div>`;
  salesGrid.innerHTML = sales.length ? sales.map((sale) => {
    const payload = sale.raw_payload || {};
    const orderItem = payload.order_items?.[0] || {};
    const product = orderItem.item?.title || payload.title || "Produto não informado";
    const amount = Number(payload.total_amount || orderItem.unit_price || 0);
    const internalOrder = state.data.orders.find((item) => item.id === sale.internal_order_id);
    const internalCode = internalOrder ? getOrderCode(internalOrder) : "";
    const internalProduct = getProductForSale(sale);
    return `
      <article class="marketplace-sale-card">
        <div class="marketplace-sale-head">
          <div>
            <strong class="marketplace-sale-order">${html(internalCode || sale.external_order_id || "Venda")}</strong>
            <span class="marketplace-brand">Venda ${html(marketplaceDisplayName(sale.marketplace))}</span>
          </div>
          <span class="badge ${marketplaceSaleStatusClass(payload.status)}">${html(marketplaceSaleStatus(payload.status))}</span>
        </div>
        <dl class="marketplace-sale-details">
          <div><dt>Pedido</dt><dd>${html(sale.external_order_id || "-")}</dd></div>
          <div><dt>Produto</dt><dd>${html(product)}</dd></div>
          <div><dt>Valor</dt><dd>${money.format(amount)}</dd></div>
          <div><dt>Data</dt><dd>${formatDateTime(payload.date_created || sale.created_at)}</dd></div>
          <div><dt>Encomenda</dt><dd>${internalCode ? html(internalCode) : "Ainda não criada"}</dd></div>
        </dl>
        <div class="marketplace-sale-production">
          ${renderProductionAssetShortcut(internalProduct, { empty: "Venda sem produto interno vinculado" })}
        </div>
        <div class="listing-actions">
          ${internalOrder ?
             `<button class="primary-btn" type="button" data-action="marketplace-view-order" data-id="${html(internalOrder.id)}">Ver encomenda</button>`
            : `<button class="primary-btn" type="button" data-action="marketplace-create-order" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Criar encomenda</button>`}
          <span class="automation-badge" title="Novas vendas recebidas pelo webhook criam encomendas automaticamente">Integração automática</span>
        </div>
        <div class="sale-document-actions">
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="label" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar etiqueta</button>
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="declaration" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar declaração</button>
          <button class="secondary-btn" type="button" data-action="marketplace-print" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Imprimir</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-chart">Nenhuma venda sincronizada ainda.</div>`;
  logsSummary.innerHTML = logs.length ?
     logs.slice(0, 5).map(renderMarketplaceLogSummary).join("")
    : `<div class="empty-chart">Nenhuma sincronização registrada.</div>`;
  const filteredLogs = logs
    .filter(matchesMarketplaceLogFilter)
    .filter((item) => isWithinDateRange(item.created_at, state.marketplaceLogDateFrom, state.marketplaceLogDateTo));
  const visibleLogs = filteredLogs.slice(0, state.marketplaceLogLimit);
  apiLogsList.innerHTML = !state.marketplaceLogsCleared && visibleLogs.length ?
     visibleLogs.map(renderMarketplaceApiLog).join("")
    : `<div class="empty-chart">${state.marketplaceLogsCleared ? "Logs limpos da tela. Aplique um período ou carregue mais para exibir novamente." : "Nenhum log encontrado para este filtro."}</div>`;
  byId("loadMoreMarketplaceLogsBtn").hidden = state.marketplaceLogsCleared || visibleLogs.length >= filteredLogs.length;
  document.querySelectorAll('[data-action="marketplace-log-filter"]').forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.marketplaceLogFilter);
  });
  document.querySelectorAll('[data-action="marketplace-channel-filter"]').forEach((button) => {
    button.classList.toggle("active", button.dataset.channel === state.marketplaceChannelFilter);
  });

  bindActions();
}

export function renderIntegrationSummary() {
  const channelLogs = state.marketplaceLogs.filter(matchesMarketplaceChannel);
  const channelListings = state.marketplaceListings.filter(matchesMarketplaceChannel);
  const latestSync = channelLogs.find((item) => item.kind === "manual-sync");
  const importedSales = channelLogs.filter((item) => item.kind === "order-import" && item.status === "success").length;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const recentErrors = channelLogs.filter((item) =>
    item.status === "error" && new Date(item.created_at || 0).getTime() >= since
  ).length;
  const lastSync = byId("integrationLastSync");
  const listings = byId("integrationListingsCount");
  const sales = byId("integrationSalesCount");
  const errors = byId("integrationRecentErrors");
  const tokenTarget = byId("integrationTokenAlert");
  if (lastSync) lastSync.textContent = latestSync ? formatDateTime(latestSync.created_at) : "-";
  if (listings) listings.textContent = channelListings.length;
  if (sales) sales.textContent = importedSales;
  if (errors) errors.textContent = recentErrors;
  const tokenAlert = getIntegrationTokenAlert();
  if (tokenTarget) {
    tokenTarget.innerHTML = tokenAlert ?
       `<div class="integration-alert ${tokenAlert.level}">${html(tokenAlert.message)}</div>`
      : `<div class="integration-alert success">Integracoes conectadas dentro do prazo.</div>`;
  }
}

export function renderMarketplaceLogSummary(item) {
  return `
    <div class="list-row api-log-summary">
      <div>
        <strong>${html(marketplaceLogLabel(item.kind))} • ${formatDateTime(item.created_at)}</strong>
        <span>${html(marketplaceDisplayName(item.marketplace))} • ${html(item.message || "")}</span>
      </div>
      <span class="api-status ${marketplaceLogStatusClass(item.status)}">${html(marketplaceLogStatusLabel(item.status))}</span>
    </div>
  `;
}

export function renderMarketplaceApiLog(item) {
  const internalOrder = state.data.orders.find((order) => order.id === item.internal_order_id);
  const internalCode = internalOrder ? getOrderCode(internalOrder) : item.internal_order_id || "";
  const before = item.raw_payload?.before || {};
  const after = item.raw_payload?.after || {};
  const changes = [];
  if (before.price !== undefined && after.price !== undefined && Number(before.price) !== Number(after.price)) {
    changes.push(`Preço: ${money.format(Number(before.price || 0))} → ${money.format(Number(after.price || 0))}`);
  }
  if (before.available_quantity !== undefined && after.available_quantity !== undefined && Number(before.available_quantity) !== Number(after.available_quantity)) {
    changes.push(`Estoque: ${before.available_quantity} → ${after.available_quantity}`);
  }
  if (before.status && after.status && before.status !== after.status) changes.push(`Status: ${before.status} → ${after.status}`);
  if (before.title && after.title && before.title !== after.title) changes.push(`Título alterado`);
  const relation = item.external_order_id && internalCode ?
     `<div class="api-log-relation"><span>${html(item.external_order_id)}</span><strong>→</strong><span>${html(internalCode)}</span></div>`
    : "";
  return `
    <article class="api-log-card ${marketplaceLogStatusClass(item.status)}">
      <div class="api-log-card-head">
        <div>
          <span class="api-log-time">${formatDateTime(item.created_at)}</span>
          <strong>${html(item.marketplace || "Marketplace")}</strong>
        </div>
        <div class="api-log-tags">
          <span class="api-kind ${marketplaceLogKindClass(item.kind)}">${html(marketplaceLogLabel(item.kind))}</span>
          <span class="api-status ${marketplaceLogStatusClass(item.status)}">${html(marketplaceLogStatusLabel(item.status))}</span>
        </div>
      </div>
      <p class="api-log-message">${html(item.message || "Sem mensagem retornada.")}</p>
      ${relation}
      <dl class="api-log-meta">
        ${item.external_item_id ? `<div><dt>Anúncio</dt><dd>${html(item.external_item_id)}</dd></div>` : ""}
        ${item.external_order_id ? `<div><dt>Venda</dt><dd>${html(item.external_order_id)}</dd></div>` : ""}
        ${internalCode ? `<div><dt>Encomenda</dt><dd>${html(internalCode)}</dd></div>` : ""}
        <div><dt>Usuário</dt><dd>${html(item.actor_email || "Sistema")}</dd></div>
      </dl>
      ${changes.length ? `<div class="api-log-changes">${changes.map((change) => `<span>${html(change)}</span>`).join("")}</div>` : ""}
      ${item.status === "error" && item.raw_payload?.error ? `<div class="api-error-detail">${html(item.raw_payload.error)}</div>` : ""}
    </article>
  `;
}

export function marketplaceLogLabel(kind) {
  return {
    "sync-products": "sync-products",
    "manual-sync": "sync",
    webhook: "webhook",
    "edit-listing": "edit-listing",
    "order-import": "order-import",
    "create-order": "order-import",
    "token-refresh": "token",
    "oauth-connect": "oauth",
    "document-label": "etiqueta",
    "document-declaration": "declaracao"
  }[kind] || kind || "api";
}

export function marketplaceLogKindClass(kind) {
  if (kind === "webhook") return "webhook";
  if (["sync-products", "manual-sync"].includes(kind)) return "sync";
  if (kind === "edit-listing") return "edit";
  if (["order-import", "create-order"].includes(kind)) return "sale";
  if (kind === "token-refresh") return "token";
  if (["document-label", "document-declaration"].includes(kind)) return "document";
  return "neutral";
}

export function marketplaceLogStatusLabel(status) {
  if (status === "success") return "Sucesso";
  if (status === "error") return "Erro";
  if (status === "ignored") return "Ignorado";
  return status || "Informação";
}

export function marketplaceLogStatusClass(status) {
  if (status === "success") return "success";
  if (status === "error") return "error";
  return "ignored";
}

export function matchesMarketplaceLogFilter(item) {
  const filter = state.marketplaceLogFilter;
  if (filter === "all") return true;
  if (filter === "success" || filter === "error") return item.status === filter;
  if (filter === "webhook") return item.kind === "webhook" || item.raw_payload?.source === "webhook";
  if (filter === "listings") return ["sync-products", "edit-listing"].includes(item.kind);
  if (filter === "sales") return ["order-import", "create-order"].includes(item.kind);
  if (filter === "documents") return ["document-label", "document-declaration"].includes(item.kind);
  return true;
}

export async function loadMarketplaces() {
  if (!state.supabase || !state.isAdmin) {
    state.marketplaceAccounts = [];
    state.marketplaceListings = [];
    state.marketplaceSales = [];
    state.marketplaceLogs = [];
    return;
  }
  const [accounts, listings, sales, logs] = await Promise.all([
    state.supabase.from("marketplace_accounts").select("marketplace,seller_name,external_seller_id,token_expires_at,updated_at,raw_payload").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }),
    state.supabase.from("marketplace_listings").select("marketplace,external_id,title,sku,price,status,permalink,thumbnail_url,raw_payload,updated_at").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }).limit(100),
    state.supabase.from("marketplace_order_links").select("marketplace,external_order_id,internal_order_id,raw_payload,created_at,updated_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(100),
    state.supabase.from("marketplace_sync_log").select("id,marketplace,kind,status,message,external_item_id,external_order_id,internal_order_id,actor_email,raw_payload,created_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(200)
  ]);
  state.marketplaceAccounts = accounts.error ? [] : accounts.data || [];
  state.marketplaceListings = listings.error ? [] : listings.data || [];
  state.marketplaceSales = sales.error ? [] : sales.data || [];
  state.marketplaceLogs = logs.error ? [] : logs.data || [];
}

export async function loadAndRenderMarketplaces() {
  await loadMarketplaces();
  renderMarketplaces();
}

let storefrontUploadedImages = [];

export function renderStorefrontAdmin() {
  const source = byId("storefrontSourceListing");
  const list = byId("storefrontProductList");
  const stats = byId("storefrontStats");
  if (!source || !list || !stats) return;
  const selected = source.value;
  source.innerHTML = `<option value="">Produto novo/manual</option>` + state.marketplaceListings.map((item) => `
    <option value="${html(`${item.marketplace}:${item.external_id}`)}">${html(marketplaceDisplayName(item.marketplace))} - ${html(item.title || item.external_id)}</option>
  `).join("");
  source.value = [...source.options].some((option) => option.value === selected) ? selected : "";
  const synced = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) !== "vitrine").length;
  const manual = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === "vitrine").length;
  const views = state.storefrontEvents.filter((item) => item.event_type === "product_view").length;
  const buyClicks = state.storefrontEvents.filter((item) => item.event_type === "buy_click").length;
  const quoteClicks = state.storefrontEvents.filter((item) => ["quote_click", "custom_quote"].includes(item.event_type)).length;
  stats.innerHTML = `
    <article><span>Produtos na vitrine</span><strong>${state.marketplaceListings.length}</strong></article>
    <article><span>Sincronizados</span><strong>${synced}</strong></article>
    <article><span>Manuais</span><strong>${manual}</strong></article>
    <article><span>Visualizações</span><strong>${views}</strong></article>
    <article><span>Cliques em comprar</span><strong>${buyClicks}</strong></article>
    <article><span>Cliques/orçamentos</span><strong>${quoteClicks}</strong></article>
    <article><span>Última atualização</span><strong>${formatDateTime(state.marketplaceListings[0]?.updated_at)}</strong></article>
  `;
  list.innerHTML = state.marketplaceListings.length ? state.marketplaceListings.map((item) => {
    const payload = item.raw_payload || {};
    const images = storefrontListingImages(item);
    return `
      <article class="storefront-product-row">
        <img src="${html(images[0] || ensureHttpsUrl(item.thumbnail_url) || "")}" alt="${html(item.title)}" />
        <div>
          <strong>${html(item.title)}</strong>
          <span>${html(marketplaceDisplayName(item.marketplace))} • ${money.format(Number(item.price || 0))}</span>
          <small>${html(payload.description || payload.plain_text || "Descrição vinda do marketplace ou cadastro interno.")}</small>
        </div>
        <button class="secondary-btn" type="button" data-action="storefront-edit" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace)}">Editar</button>
      </article>
    `;
  }).join("") : `<div class="empty-chart">Nenhum produto na vitrine.</div>`;
}

export function updateStorefrontTargetFields() {
  const form = byId("storefrontProductForm");
  if (!form) return;
  const marketplace = form.elements.marketplace.value;
  const mlFields = byId("storefrontMlFields");
  const shopeeFields = byId("storefrontShopeeFields");
  const tiktokFields = byId("storefrontTiktokFields");
  const amazonFields = byId("storefrontAmazonFields");

  const showMl = form.elements.publish_ml.checked || marketplace === "Mercado Livre";
  const showShopee = form.elements.publish_shopee.checked || marketplace === "Shopee";
  const showTiktok = form.elements.publish_tiktok?.checked || marketplace === "tiktok_shop";
  const showAmazon = form.elements.publish_amazon.checked || marketplace === "Amazon";

  if (mlFields) mlFields.hidden = !showMl;
  if (shopeeFields) shopeeFields.hidden = !showShopee;
  if (tiktokFields) tiktokFields.hidden = !showTiktok;
  if (amazonFields) amazonFields.hidden = !showAmazon;

  if (form.elements.publish_ml.checked) form.elements.marketplace.value = "Mercado Livre";
  if (form.elements.publish_shopee.checked && !form.elements.publish_ml.checked) form.elements.marketplace.value = "Shopee";
  if (form.elements.publish_tiktok?.checked && !form.elements.publish_ml.checked && !form.elements.publish_shopee.checked) form.elements.marketplace.value = "tiktok_shop";
  if (form.elements.publish_amazon.checked && !form.elements.publish_ml.checked && !form.elements.publish_shopee.checked && !form.elements.publish_tiktok?.checked) {
    form.elements.marketplace.value = "Amazon";
  }
}

export function storefrontListingImages(item) {
  const pictures = Array.isArray(item.raw_payload?.pictures) ? item.raw_payload.pictures : [];
  return [
    ...pictures.map((picture) => ensureHttpsUrl(picture.secure_url || picture.url)).filter(Boolean),
    ensureHttpsUrl(item.thumbnail_url),
  ].filter(Boolean);
}

export function storefrontDeliveryNoteFromListing(item) {
  const payload = item.raw_payload || {};
  if (payload.delivery_note) return payload.delivery_note;
  const manufacturing = payload.sale_terms?.find?.((term) => term.id === "MANUFACTURING_TIME")?.value_name;
  if (manufacturing) return `As datas de entrega incluem os ${manufacturing} necessários para deixar o produto pronto.`;
  return item.marketplace === "Mercado Livre" ?
     "Confira o prazo final de entrega no Mercado Livre antes de concluir a compra."
    : "";
}

export function fillStorefrontFormFromListing(item) {
  if (!item) return;
  const form = byId("storefrontProductForm");
  const payload = item.raw_payload || {};
  form.elements.external_id.value = item.external_id || "";
  form.elements.publish_vitrine.checked = true;
  form.elements.publish_ml.checked = false;
  form.elements.publish_shopee.checked = false;
  form.elements.publish_amazon.checked = false;
  form.elements.marketplace.value = item.marketplace || "Vitrine";
  form.elements.title.value = item.title || "";
  form.elements.category.value = payload.category || payload.domain_id || payload.category_id || "Action figures";
  form.elements.price.value = Number(item.price || 0);
  form.elements.available_quantity.value = Number(payload.available_quantity || 1);
  form.elements.marketplace_url.value = item.permalink || payload.permalink || "";
  form.elements.amazon_url.value = payload.amazon_url || (item.marketplace === "Amazon" ? item.permalink || "" : "");
  form.elements.shopee_url.value = payload.shopee_url || "";
  form.elements.whatsapp_url.value = payload.whatsapp_url || "";
  form.elements.payment_note.value = payload.payment_note || "";
  form.elements.delivery_note.value = storefrontDeliveryNoteFromListing(item);
  form.elements.description.value = payload.description || payload.plain_text || "";
  form.elements.description_html.value = sanitizeRichHtml(payload.description_html || "");
  byId("storefrontDescriptionEditor").innerHTML = sanitizeRichHtml(payload.description_html || "");
  form.elements.image_url.value = storefrontListingImages(item).join("\n");
  form.elements.tech_material.value = payload.technical_info?.material || "";
  form.elements.tech_height.value = payload.technical_info?.height || "";
  form.elements.tech_painting.value = payload.technical_info?.painting || "";
  form.elements.tech_assembly.value = payload.technical_info?.assembly || "";
  form.elements.ml_category_id.value = payload.category_id || "";
  form.elements.ml_listing_type_id.value = payload.listing_type_id || "gold_special";
  form.elements.ml_condition.value = payload.condition || "new";
  form.elements.ml_warranty.value = payload.warranty || "Sem garantia";
  form.elements.ml_manufacturing_time.value = payload.sale_terms?.find?.((term) => term.id === "MANUFACTURING_TIME")?.value_name || "";
  form.elements.sku.value = item.sku || payload.seller_custom_field || "";
  form.elements.ml_attributes_json.value = JSON.stringify(payload.attributes || [], null, 2);
  form.elements.featured.checked = true;
  storefrontUploadedImages = [];
  updateStorefrontTargetFields();
}

export function importSelectedListingToStorefrontForm() {
  const value = byId("storefrontSourceListing").value;
  if (!value) return;
  const [marketplace, ...idParts] = value.split(":");
  const externalId = idParts.join(":");
  const item = state.marketplaceListings.find((listing) =>
    listing.external_id === externalId && listing.marketplace === marketplace
  );
  fillStorefrontFormFromListing(item);
}

export async function saveStorefrontProduct(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const message = byId("storefrontProductMessage");
  const imageUrls = String(data.get("image_url") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const descriptionHtml = sanitizeRichHtml(byId("storefrontDescriptionEditor").innerHTML.trim());
  form.elements.description_html.value = descriptionHtml;

  let mlCategoryId = data.get("ml_category_id");
  if (!mlCategoryId) {
    message.textContent = "Selecione uma categoria do Mercado Livre";
    return;
  }

  const publishTargets = {
    vitrine: data.get("publish_vitrine") === "on",
    mercado_livre: data.get("publish_ml") === "on",
    shopee: data.get("publish_shopee") === "on",
    amazon: data.get("publish_amazon") === "on",
  };
  const payload = {
    action: "save",
    marketplace: data.get("marketplace"),
    external_id: data.get("external_id"),
    title: data.get("title"),
    category: data.get("category"),
    price: number(data.get("price")),
    marketplace_url: data.get("marketplace_url"),
    payment_note: data.get("payment_note"),
    delivery_note: data.get("delivery_note"),
    description: data.get("description"),
    image_urls: [...imageUrls, ...storefrontUploadedImages],
    featured: data.get("featured") === "on",
    publish_targets: publishTargets,
    sku: data.get("sku"),
    raw_payload: {
      available_quantity: Number(data.get("available_quantity") || 1),
      shopee_url: data.get("shopee_url"),
      amazon_url: data.get("amazon_url"),
      whatsapp_url: data.get("whatsapp_url"),
      description_html: descriptionHtml,
      technical_info: {
        material: data.get("tech_material"),
        height: data.get("tech_height"),
        painting: data.get("tech_painting"),
        assembly: data.get("tech_assembly"),
      },
      category_id: mlCategoryId,
      listing_type_id: data.get("ml_listing_type_id"),
      condition: data.get("ml_condition"),
      warranty: data.get("ml_warranty"),
      sale_terms: data.get("ml_manufacturing_time") ?
         [{ id: "MANUFACTURING_TIME", name: "Tempo de preparo", value_name: data.get("ml_manufacturing_time") }]
        : [],
      attributes: parseJsonSafe(data.get("ml_attributes_json"), []),
      amazon: {
        sku: data.get("amazon_sku"),
        asin: data.get("amazon_asin"),
        product_type: data.get("amazon_product_type"),
        attributes: parseJsonSafe(data.get("amazon_attributes_json"), {}),
      },
      shopee: {
        category_id: data.get("shopee_category_id"),
        weight: Number(data.get("shopee_weight") || 0),
        days_to_ship: Number(data.get("shopee_days_to_ship") || 20),
        sku: data.get("shopee_sku"),
        attributes: parseJsonSafe(data.get("shopee_attributes_json"), []),
      },
      tiktok_shop: {
        product_id: data.get("tiktok_product_id"),
        weight: Number(data.get("tiktok_weight") || 0),
        delivery_days: Number(data.get("tiktok_delivery_days") || 20),
        sku: data.get("tiktok_sku"),
        attributes: parseJsonSafe(data.get("tiktok_attributes_json"), []),
      },
    },
  };
  message.textContent = "Salvando produto da vitrine...";
  try {
    if (publishTargets.mercado_livre) {
      const created = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=create-listing", {
        method: "POST",
        body: JSON.stringify({
          title: payload.title,
          price: payload.price,
          available_quantity: Number(data.get("available_quantity") || 1),
          category_id: mlCategoryId,
          listing_type_id: data.get("ml_listing_type_id"),
          condition: data.get("ml_condition"),
          warranty: data.get("ml_warranty"),
          manufacturing_time: data.get("ml_manufacturing_time"),
          sku: data.get("sku"),
          pictures: [...imageUrls, ...storefrontUploadedImages],
          description: payload.description,
          attributes: parseJsonSafe(data.get("ml_attributes_json"), []),
        }),
      });
      payload.marketplace = "Mercado Livre";
      payload.external_id = created.item?.id || payload.external_id;
      payload.marketplace_url = created.item?.permalink || payload.marketplace_url;
    } else if (publishTargets.shopee) {
      message.textContent = "Shopee ainda depende da aprovação do app. Salvando somente na vitrine.";
    } else if (publishTargets.amazon) {
      message.textContent = "Amazon preparada. O produto sera sincronizado quando a conta Seller estiver conectada.";
    }
    await storefrontRequest(payload);
    storefrontUploadedImages = [];
    byId("storefrontImageFiles").value = "";
    await loadMarketplaces();
    renderMarketplaces();
    message.textContent = "Produto salvo na vitrine.";
  } catch (error) {
    message.textContent = error.message;
  }
}

export function bindStorefrontImageInputs() {
  const dropzone = byId("storefrontImageDropzone");
  const input = byId("storefrontImageFiles");
  if (!dropzone || !input) return;
  input.addEventListener("change", async () => {
    await addStorefrontImageFiles(input.files);
  });
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragging");
    });
  });
  dropzone.addEventListener("drop", async (event) => {
    await addStorefrontImageFiles(event.dataTransfer?.files || []);
  });
}

export async function addStorefrontImageFiles(files) {
  const message = byId("storefrontProductMessage");
  const list = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!list.length) return;
  message.textContent = "Preparando imagens...";
  const images = await Promise.all(list.slice(0, 8).map(resizeImageFileForStorefront));
  storefrontUploadedImages = [...storefrontUploadedImages, ...images].slice(0, 8);
  message.textContent = `${storefrontUploadedImages.length} imagem(ns) pronta(s) para salvar.`;
}

export function bindStorefrontDescriptionEditor() {
  const editor = byId("storefrontDescriptionEditor");
  if (!editor) return;
  editor.addEventListener("paste", async (event) => {
    const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type?.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    const images = await Promise.all(files.map(resizeImageFileForStorefront));
    images.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Imagem da descrição";
      editor.appendChild(img);
    });
  });
}

export function resizeImageFileForStorefront(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem invalida."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function storefrontRequest(payload) {
  const { data } = await state.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/storefront", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const dataJson = await response.json();
  if (!response.ok || !dataJson.ok) throw new Error(dataJson.error || "Falha ao salvar na vitrine.");
  return dataJson;
}

const ML_CATEGORIES = [
  { id: "MLB5672", name: "Ação Figures e Bonecos" },
  { id: "MLB1366", name: "Acessórios para Crianças" },
  { id: "MLB1384", name: "Artesanato" },
  { id: "MLB1953", name: "Brinquedos" },
  { id: "MLB374", name: "Coleções" },
  { id: "MLB1000", name: "Decoração" },
  { id: "MLB1051", name: "Eletrônicos e Tecnologia" },
  { id: "MLB1132", name: "Esportes e Fitness" },
  { id: "MLB1168", name: "Fantasias e Roupas" },
  { id: "MLB1201", name: "Hobbies" },
  { id: "MLB1246", name: "Iluminação" },
  { id: "MLB1276", name: "Jogos" },
  { id: "MLB1319", name: "Livros" },
  { id: "MLB1403", name: "Miniaturismo" },
  { id: "MLB1430", name: "Modelos em Escala" },
  { id: "MLB1500", name: "Música" },
  { id: "MLB1549", name: "Moda" },
  { id: "MLB1574", name: "Pelúcias" },
  { id: "MLB1635", name: "Vinil e CDs" },
  { id: "MLB1726", name: "Videogames" },
  { id: "MLB263", name: "Antigos" },
  { id: "MLB264", name: "Outros" },
];

export function bindMlCategorySelect() {
  // Select element handles everything natively - no custom binding needed
}

export async function loadMlCategoryFields() {
  const form = byId("storefrontProductForm");
  const select = byId("mlCategorySelect");
  const manualInput = form.elements.ml_category_id_manual;

  let categoryId = select?.value || "";
  if (categoryId === "MLB1522") {
    categoryId = manualInput?.value.trim() || "";
  }

  const preview = byId("mlCategoryFieldsPreview");
  if (!categoryId) {
    preview.innerHTML = `<p class="form-error">Informe a categoria ou ID da categoria ML.</p>`;
    return;
  }
  preview.innerHTML = "Carregando campos obrigatórios...";
  try {
    const data = await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=category-fields&category_id=${encodeURIComponent(categoryId)}`);
    const required = (data.attributes || []).filter((item) => item.tags?.required || item.tags?.catalog_required);
    preview.innerHTML = required.length ?
       required.slice(0, 20).map((item) => `<span>${html(item.id)} - ${html(item.name)}</span>`).join("")
      : `<span>Nenhum campo obrigatório retornado para esta categoria.</span>`;
  } catch (error) {
    preview.innerHTML = `<p class="form-error">${html(error.message)}</p>`;
  }
}

export function parseJsonSafe(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || "").trim() || JSON.stringify(fallback));
    return Array.isArray(parsed) || typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export async function connectMercadoLivre() {
  if (!state.supabase) return;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const endpoint = "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/ml/start";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        organization_id: state.organizationId,
        return_url: `${window.location.origin}${window.location.pathname}#marketplace`
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.connect_url) throw new Error(payload.error || "Nao foi possivel iniciar a conexao.");
    window.location.href = payload.connect_url;
  } catch (error) {
    showAppMessage("Conexão Mercado Livre", `Não consegui iniciar a conexão: ${error.message}`, "error");
  }
}

export async function disconnectMercadoLivre() {
  if (!state.supabase || !confirm("Desconectar a conta Mercado Livre desta empresa?")) return;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/ml/disconnect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ organization_id: state.organizationId }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || "Nao foi possivel desconectar.");
    showAppMessage("Mercado Livre desconectado", "A conta foi removida desta empresa. Nenhum token de outra empresa sera usado.", "success");
    await loadAndRenderMarketplaces();
  } catch (error) {
    showAppMessage("Mercado Livre", `Nao foi possivel desconectar: ${error.message}`, "error");
  }
}

export function configureShopee() {
  alert("A integracao da Shopee ainda precisa das credenciais do Shopee Open Platform: Partner ID, Partner Key, Shop ID e URL de retorno. O painel ja esta preparado para exibir anuncios, vendas, integracao e logs da Shopee.");
}

export function renderMarketplaceWritePermission(account) {
  const scope = String(account.raw_payload?.scope || "");
  const readOnly = scope.includes("publish-sync:/read-only");
  const readWrite = scope.includes("publish-sync:/write") || scope.includes("publish-sync:/read-write");
  if (readWrite) return `<span class="badge done">Leitura e escrita</span>`;
  if (readOnly) return `<span class="badge queue">Somente leitura</span>`;
  return `<span class="badge neutral">Não identificada</span>`;
}

export function marketplaceSaleStatus(status) {
  return {
    confirmed: "Confirmada",
    payment_required: "Aguardando pagamento",
    payment_in_process: "Pagamento em análise",
    paid: "A preparar",
    partially_paid: "Pagamento parcial",
    cancelled: "Cancelada",
    invalid: "Inválida"
  }[status] || status || "A preparar";
}

export function marketplaceSaleStatusClass(status) {
  if (["paid", "confirmed"].includes(status)) return "done";
  if (["cancelled", "invalid"].includes(status)) return "danger-badge";
  return "queue";
}

export function setMarketplaceView(view) {
  state.marketplaceView = ["listings", "storefront", "sales", "integrations", "intelligence", "api-logs", "backup", "whatsapp"].includes(view) ? view : "listings";
  document.querySelectorAll("[data-marketplace-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.marketplaceView === state.marketplaceView);
  });
  byId("marketplaceListingsView").classList.toggle("active", state.marketplaceView === "listings");
  byId("marketplaceStorefrontView").classList.toggle("active", state.marketplaceView === "storefront");
  byId("marketplaceSalesView").classList.toggle("active", state.marketplaceView === "sales");
  byId("marketplaceIntegrationsView").classList.toggle("active", state.marketplaceView === "integrations");
  byId("marketplaceIntelligenceView").classList.toggle("active", state.marketplaceView === "intelligence");
  byId("marketplaceApiLogsView").classList.toggle("active", state.marketplaceView === "api-logs");
  byId("marketplaceBackupView").classList.toggle("active", state.marketplaceView === "backup");
  byId("marketplaceWhatsappView").classList.toggle("active", state.marketplaceView === "whatsapp");

  // Renderizar whatsapp se necessário
  if (state.marketplaceView === "whatsapp") {
    import("./marketplace-whatsapp.js").then(({ renderMarketplaceWhatsapp }) => {
      renderMarketplaceWhatsapp();
    });
  }
}

export function applyMarketplaceLogRange() {
  state.marketplaceLogDateFrom = byId("marketplaceLogDateFrom").value;
  state.marketplaceLogDateTo = byId("marketplaceLogDateTo").value;
  state.marketplaceLogsCleared = false;
  state.marketplaceLogLimit = 30;
  renderMarketplaces();
}

export function viewMarketplaceOrder(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  state.query = getOrderCode(order).toLowerCase();
  byId("globalSearch").value = getOrderCode(order);
  if (byId("ordersSearchInput")) byId("ordersSearchInput").value = getOrderCode(order);
  state.filters.orderMaterial = "all";
  state.filters.orderStatus = "all";
  state.filters.orderMarketplace = "all";
  state.filters.orderFocus = "all";
  syncOrderFilterControls();
  setView("orders");
  renderTables();
}

export async function createMarketplaceOrder(externalOrderId, marketplace = "Mercado Livre") {
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    alert("A criacao automatica de encomendas da Shopee sera ativada quando a API da conta estiver conectada.");
    return;
  }
  if (!ensureCanAdmin()) return;
  try {
    await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=create-order&order_id=${encodeURIComponent(externalOrderId)}`, {
      method: "POST",
      body: "{}"
    });
    await loadRemoteData();
    await loadMarketplaces();
    saveData();
    render();
    setMarketplaceView("sales");
    flashActionMessage("Encomenda criada a partir da venda.");
  } catch (error) {
    alert(`Não consegui criar a encomenda: ${error.message}`);
  }
}

export async function syncMlShipment(orderId) {
  return marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=sync-shipment&order_id=${encodeURIComponent(orderId)}`);
}

export async function marketplaceRequest(url, options = {}) {
  const { data } = await state.supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Entre novamente.");
  const requestUrl = new URL(url);
  if (state.organizationId && !requestUrl.searchParams.get("organization_id")) {
    requestUrl.searchParams.set("organization_id", state.organizationId);
  }
  const response = await fetch(requestUrl.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    console.error("❌ API Error:", { status: response.status, payload });
    throw new Error(payload.error || `Falha na integracao (${response.status}).`);
  }
  return payload;
}

export async function downloadMarketplaceDocument(externalOrderId, marketplace, documentType, printAfter = false) {
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    alert("Os documentos da Shopee serao liberados quando a conta estiver conectada ao Shopee Open Platform.");
    return;
  }
  const printWindow = printAfter ? window.open("", "_blank") : null;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const url = new URL("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync");
    url.searchParams.set("marketplace", "ml");
    url.searchParams.set("action", "document");
    url.searchParams.set("order_id", externalOrderId);
    url.searchParams.set("document_type", documentType);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    // Handle document not available error
    if (response.status === 404) {
      throw new Error("Documento ainda não disponível. O pedido precisa estar em um status válido (postado ou em trânsito) para gerar a etiqueta ou declaração.");
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      // Provide more helpful error message
      const errorMsg = payload.error || "Erro ao gerar documento.";
      if (errorMsg.includes("delivered")) {
        throw new Error("Documento não pode ser regenerado para pedidos já entregues. Verifique o status do pedido no Mercado Livre.");
      }
      throw new Error(errorMsg);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (printAfter && printWindow) {
      printWindow.location.href = blobUrl;
      setTimeout(() => printWindow.print(), 900);
    } else {
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="?([^"]+)"?/i)?.[1] ||
        `${documentType}-${externalOrderId}.pdf`;
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    await loadAndRenderMarketplaces();
  } catch (error) {
    if (printWindow) printWindow.close();
    alert(error.message || "Erro ao gerar documento.");
    await loadAndRenderMarketplaces();
  }
}

export async function syncMercadoLivre() {
  if (!ensureCanAdmin()) return;
  if (state.marketplaceChannelFilter === "shopee") {
    configureShopee();
    return;
  }
  if (state.marketplaceChannelFilter === "amazon") {
    await syncAmazon();
    return;
  }
  const status = byId("marketplaceStatus");
  if (status) status.innerHTML = `<span class="badge queue">Sincronizando Mercado Livre...</span>`;
  try {
    const data = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml");
    await loadRemoteData();
    await loadMarketplaces();
    saveData();
    render();
    await recordAudit("marketplace_sync", "marketplace", "Mercado Livre", "", null, {
      created: data.created_count || 0,
      ignored: data.ignored_count || 0,
    }, "marketplace");
    flashActionMessage(`${data.created_count || 0} venda(s) importada(s), ${data.ignored_count || 0} duplicada(s) ignorada(s).`);
  } catch (error) {
    const message = error.message || "Falha ao sincronizar Mercado Livre.";
    if (message.toLowerCase().includes("nenhuma conta mercado livre conectada")) {
      setMarketplaceView("integrations");
      showAppMessage(
        "Mercado Livre não conectado",
        "Conecte a conta Mercado Livre desta empresa em Integrações. Depois disso, os anúncios e vendas serão sincronizados apenas para este ambiente.",
        "error"
      );
    } else {
      showAppMessage("Sincronização Mercado Livre", `Não consegui sincronizar: ${message}`, "error");
    }
    await loadAndRenderMarketplaces();
  }
}

export function connectAmazon() {
  if (!ensureCanAdmin()) return;
  window.location.href = "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/amazon/start";
}

export async function syncAmazon() {
  if (!ensureCanAdmin()) return;
  try {
    const data = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/amazon-sync?action=sync");
    await loadRemoteData();
    await loadMarketplaces();
    render();
    flashActionMessage(`${data.listing_count || 0} anuncio(s) Amazon e ${data.created || 0} venda(s) importada(s).`);
  } catch (error) {
    alert(`Nao consegui sincronizar Amazon: ${error.message}`);
  }
}

export async function showMarketplaceStats(itemId, marketplace = "Mercado Livre") {
  const content = byId("marketplaceStatsContent");
  byId("marketplaceStatsCode").textContent = itemId;
  byId("marketplaceStatsTitle").textContent = "Estatisticas do anuncio";
  byId("marketplaceStatsSubtitle").textContent = marketplaceDisplayName(marketplace);
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    content.innerHTML = `<div class="empty-chart">As estatisticas da Shopee ficarao disponiveis assim que a conta for conectada.</div>`;
    byId("marketplaceStatsDialog").showModal();
    return;
  }
  content.innerHTML = `<div class="empty-chart">Carregando estatisticas...</div>`;
  byId("marketplaceStatsDialog").showModal();
  try {
    const data = await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=stats&item_id=${encodeURIComponent(itemId)}`);
    const stats = data.stats || {};
    const visits = Number(stats.visits || 0);
    const sold = Number(stats.sold_quantity || 0);
    const conversion = visits > 0 ? sold / visits * 100 : 0;
    const health = stats.health == null ? null : Math.round(Number(stats.health) * 100);
    const statusClass = String(stats.status || "").toLowerCase() === "active" ? "done" : "neutral";
    byId("marketplaceStatsCode").textContent = itemId;
    byId("marketplaceStatsTitle").textContent = stats.title || "Estatisticas do anuncio";
    byId("marketplaceStatsSubtitle").textContent = `Criado em ${formatDateTime(stats.date_created)} · Atualizado em ${formatDateTime(stats.last_updated)}`;
    content.innerHTML = `
      <section class="stats-hero-card">
        <div>
          <span class="badge ${statusClass}">${html(stats.status || "-")}</span>
          <strong>${html(stats.title || itemId)}</strong>
          <small>${html(marketplaceDisplayName(marketplace))}</small>
        </div>
        <div class="stats-health-ring ${health != null && health >= 70 ? "ok" : health != null && health >= 40 ? "warn" : "risk"}">
          <strong>${health == null ? "-" : `${health}%`}</strong>
          <span>saude</span>
        </div>
      </section>
      <div class="stats-grid stats-grid-modern">
        <article><span>Vendas</span><strong>${sold.toLocaleString("pt-BR")}</strong><small>efetuadas</small></article>
        <article><span>Visualizacoes</span><strong>${visits.toLocaleString("pt-BR")}</strong><small>visitas totais</small></article>
        <article><span>Conversao</span><strong>${conversion.toFixed(1)}%</strong><small>vendas / visitas</small></article>
        <article><span>Estoque</span><strong>${Number(stats.available_quantity || 0).toLocaleString("pt-BR")}</strong><small>disponivel</small></article>
        <article><span>Preco</span><strong>${money.format(Number(stats.price || 0))}</strong><small>valor atual</small></article>
        <article><span>Status</span><strong>${html(stats.status || "-")}</strong><small>publicacao</small></article>
      </div>
      <div class="listing-drawer-suggestion">
        ${visits === 0 ? "Sem visitas recentes: revise titulo, foto principal e categoria." : sold === 0 ? "Tem visualizacao, mas ainda nao vendeu: valide preco, fotos e descricao." : "Anuncio com venda registrada: acompanhe estoque, margem e perguntas para escalar com seguranca."}
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<p class="form-error">${html(error.message)}</p>`;
  }
}
export async function openMarketplaceEdit(itemId, marketplace = "Mercado Livre") {
  const channel = normalizeMarketplaceChannel(marketplace);
  if (channel === "shopee") {
    alert("A edicao de anuncios da Shopee sera liberada depois que a conta estiver conectada ao Shopee Open Platform.");
    return;
  }
  const listing = state.marketplaceListings.find((item) =>
    item.external_id === itemId && normalizeMarketplaceChannel(item.marketplace) === channel
  );
  if (!listing) return;
  const form = byId("marketplaceEditForm");
  form.elements.itemId.value = itemId;
  form.elements.marketplace.value = marketplace;
  form.elements.title.value = listing.title || "";
  form.elements.price.value = Number(listing.price || 0);
  form.elements.availableQuantity.value = Number(listing.raw_payload?.available_quantity || 0);
  form.elements.status.value = listing.status === "paused" ? "paused" : "active";
  byId("marketplaceEditMessage").textContent = "";
  byId("marketplaceEditDialog").showModal();
}

export async function saveMarketplaceListing(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const itemId = String(data.get("itemId") || "");
  const marketplace = String(data.get("marketplace") || "Mercado Livre");
  const message = byId("marketplaceEditMessage");
  if (normalizeMarketplaceChannel(marketplace) !== "mercado-livre") {
    message.textContent = "Edicao indisponivel enquanto a Shopee nao estiver conectada.";
    return;
  }
  message.textContent = "Salvando no Mercado Livre...";
  try {
    await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=edit&item_id=${encodeURIComponent(itemId)}`, {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title"),
        price: number(data.get("price")),
        available_quantity: Number(data.get("availableQuantity") || 0),
        status: data.get("status")
      })
    });
    await loadMarketplaces();
    renderMarketplaces();
    byId("marketplaceEditDialog").close();
    flashActionMessage("Anuncio atualizado no Mercado Livre.");
  } catch (error) {
    message.textContent = error.message;
  }
}

export function getMarketplaceStatusFromHash() {
  const hash = window.location.hash.replace("#", "");
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("ml_status") || "";
}

export function showMarketplaceOAuthStatus(status) {
  if (!status) return;
  const messages = {
    connected: ["Mercado Livre conectado", "A conta foi autorizada com sucesso. Os anuncios e vendas serao sincronizados apenas para esta empresa.", "success"],
    reconnected: ["Mercado Livre reconectado", "Os tokens desta empresa foram atualizados com sucesso.", "success"],
    already_linked: ["Conta Mercado Livre ja conectada", "Esta conta Mercado Livre ja esta conectada em outra empresa no FlowOps. Para conectar outra conta, saia da conta atual do Mercado Livre ou use uma janela anonima e tente novamente.", "warning"],
    error: ["Mercado Livre", "Nao foi possivel concluir a conexao. Tente novamente pela aba Integracoes.", "error"],
  };
  const [title, message, tone] = messages[status] || messages.error;
  showAppMessage(title, message, tone);
}
