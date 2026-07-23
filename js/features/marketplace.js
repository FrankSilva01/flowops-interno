import { state, money, saveData } from "../core/state.js";
import { supabaseFunctionUrl } from "../core/config.js";
import {
  byId, html, number, formatDateTime, flashActionMessage, showAppMessage, showAppConfirm, sanitizeRichHtml,
  renderOperationalSummary,
} from "../core/dom.js";
import { ensureCanAdmin, ensureCanEdit } from "../core/permissions.js";
import { setView, bindActions, render, renderTables } from "../core/router.js";
import { loadRemoteData } from "../data/remote.js";
import { getOrderCode, syncOrderFilterControls } from "./orders.js";
import { recordAudit, isWithinDateRange } from "./logs.js";
import { getTokenAlert } from "./dashboard.js";
import { renderProfitabilityBadge, renderCommercialIntelligence, getListingProfitability } from "./pricing.js";
import { renderMarketplaceAnalyticsPanel, getListingAnalytics, computeIntentScore } from "./marketplace-analytics.js";
import { getProductForSale, renderProductionAssetShortcut } from "./product-assets.js";
import { loadXlsx, parseCsv } from "../core/importer.js";
import { MARKETPLACE_IMPORT_TEMPLATE, normalizeMarketplaceImportRows, runMarketplaceImportBatch } from "./marketplace-file-import.js";
import {
  buildShopeeWorkbook,
  marketplacePackageData,
  validateShopeeExport,
  validateShopeeListing,
} from "./shopee-template-export.js";
import { groupShopeeCategorySuggestions } from "./shopee-category-mapping.js";
import {
  defaultMarketplaceViewForArea,
  marketplaceAreaForView,
  operationalMarketplaceListings,
  productListingLinks,
  marketplaceChannelFiltersVisible,
  renderCatalogLinkedListing,
  resolveLinkedMarketplaceListing,
} from "./marketplace-navigation.js";
import { closeStorefrontProductDialog } from "./storefront-wizard.js";
import { paginate, responsivePageSize } from "../core/pagination.js";
import {
  buildMarketplaceMigration,
  buildMarketplaceMigrationBatch,
  migrationTargetFor,
} from "./marketplace-migration.js";
import {
  MARKETPLACE_CHANNELS,
  marketplaceDisplayName,
  normalizeMarketplaceChannel,
} from "./marketplace-channel.js";

export { marketplaceDisplayName, normalizeMarketplaceChannel } from "./marketplace-channel.js";

const selectedMarketplaceMigrations = new Set();
let currentVisibleMarketplaceListings = [];
let marketplaceFileImportRows = [];

function marketplacePageSize() {
  return responsivePageSize(typeof window === "undefined" ? undefined : window.innerHeight);
}

function paginationMarkup(result, action) {
  if (!result.total) return "";
  const buttons = Array.from({ length: result.pageCount }, (_, index) => index + 1)
    .filter((page) => page === 1 || page === result.pageCount || Math.abs(page - result.page) <= 1)
    .map((page, index, pages) => `${index && page - pages[index - 1] > 1 ? '<span aria-hidden="true">…</span>' : ""}<button class="icon-btn ${page === result.page ? "active" : ""}" type="button" data-action="${action}" data-page="${page}" aria-label="Página ${page}" ${page === result.page ? 'aria-current="page"' : ""}>${page}</button>`).join("");
  return `<span>${result.start}-${result.end} de ${result.total}</span><div><button class="icon-btn" type="button" data-action="${action}" data-page="${result.page - 1}" aria-label="Página anterior" ${result.page === 1 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>${buttons}<button class="icon-btn" type="button" data-action="${action}" data-page="${result.page + 1}" aria-label="Próxima página" ${result.page === result.pageCount ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>`;
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

function marketplaceDocumentForSale(sale, documentType) {
  return state.marketplaceDocuments.find((item) =>
    String(item.external_order_id || "") === String(sale.external_order_id || "")
    && normalizeMarketplaceChannel(item.marketplace) === normalizeMarketplaceChannel(sale.marketplace)
    && item.document_type === documentType
  );
}

function documentStatusPresentation(status) {
  return {
    available: ["Disponível", "done"],
    pending: ["Pendente", "queue"],
    unavailable: ["Indisponível", "danger"],
  }[status] || ["Não consultado", "neutral"];
}

function renderSaleDocumentStatus(sale, documentType, label) {
  const document = marketplaceDocumentForSale(sale, documentType);
  const [text, className] = documentStatusPresentation(document?.status);
  const title = document?.last_error || (document?.downloaded_at ? `Arquivo seguro desde ${formatDateTime(document.downloaded_at)}` : text);
  return `<span class="sale-document-status" title="${html(title)}"><span>${html(label)}</span><strong class="badge ${className}">${html(text)}${document?.version ? ` · v${Number(document.version)}` : ""}</strong></span>`;
}

function renderSaleFiscalStatus(sale) {
  const fiscalDocument = (state.fiscalDocuments || []).find((item) => String(item.order_id || "") === String(sale.internal_order_id || ""));
  return `<span class="sale-document-status"><span>NF-e</span><strong class="badge ${fiscalDocument ? "done" : "neutral"}">${fiscalDocument ? "Arquivado" : "Sem arquivo"}</strong></span>`;
}

function renderMarketplaceDocumentsCenter(sales, documents) {
  const available = documents.filter((item) => item.status === "available").length;
  const pending = documents.filter((item) => item.status === "pending").length;
  const unavailable = documents.filter((item) => item.status === "unavailable").length;
  const fiscalProfile = state.organizationSettings?.fiscal_profile || "unknown";
  const selected = state.marketplaceSelectedSales.length;
  return `
    <div class="marketplace-documents-heading">
      <div><span class="section-eyebrow">Documentos oficiais</span><h3>Central fiscal e logística</h3></div>
      <p>Etiqueta, DC-e e XML são obtidos do marketplace e mantidos em armazenamento privado para reimpressão.</p>
    </div>
    <div class="marketplace-document-summary">
      <span><strong>${sales.length}</strong> pedidos</span>
      <span class="done"><strong>${available}</strong> disponíveis</span>
      <span class="queue"><strong>${pending}</strong> pendentes</span>
      <span class="danger"><strong>${unavailable}</strong> indisponíveis</span>
    </div>
    <div class="marketplace-document-toolbar">
      <input id="marketplaceDocumentSearch" type="search" value="${html(state.marketplaceDocumentSearch)}" placeholder="Buscar pedido ou produto" aria-label="Buscar documentos" />
      <select id="marketplaceDocumentFilter" aria-label="Filtrar situação documental">
        <option value="all" ${state.marketplaceDocumentFilter === "all" ? "selected" : ""}>Todos os status</option>
        <option value="available" ${state.marketplaceDocumentFilter === "available" ? "selected" : ""}>Com documento disponível</option>
        <option value="pending" ${state.marketplaceDocumentFilter === "pending" ? "selected" : ""}>Com pendência</option>
        <option value="unavailable" ${state.marketplaceDocumentFilter === "unavailable" ? "selected" : ""}>Indisponíveis</option>
        <option value="missing" ${state.marketplaceDocumentFilter === "missing" ? "selected" : ""}>Não consultados</option>
      </select>
      <button class="secondary-btn" type="button" data-action="marketplace-documents-refresh">Consultar marketplace</button>
      <button class="secondary-btn" type="button" data-action="marketplace-documents-download" ${selected ? "" : "disabled"}>Baixar selecionados (${selected})</button>
      <button class="secondary-btn" type="button" data-action="marketplace-documents-export">Exportar controle fiscal</button>
    </div>
    <div class="marketplace-fiscal-profile ${fiscalProfile === "contributor" ? "warning" : ""}">
      <label for="marketplaceFiscalProfile">Perfil fiscal da empresa</label>
      <select id="marketplaceFiscalProfile">
        <option value="unknown" ${fiscalProfile === "unknown" ? "selected" : ""}>Não configurado</option>
        <option value="non_contributor" ${fiscalProfile === "non_contributor" ? "selected" : ""}>Não contribuinte do ICMS</option>
        <option value="contributor" ${fiscalProfile === "contributor" ? "selected" : ""}>Contribuinte do ICMS</option>
      </select>
      <button class="secondary-btn" type="button" data-action="marketplace-fiscal-profile-save">Salvar perfil</button>
      <span>${fiscalProfile === "contributor" ? "Operações comerciais recorrentes normalmente exigem documento fiscal; revise o uso de DC-e com o contador." : fiscalProfile === "unknown" ? "Configure para receber alertas fiscais mais precisos." : "DC-e só deve ser usada quando não houver obrigação de documento fiscal."}</span>
    </div>`;
}

function filterMarketplaceDocumentSales(sales) {
  const search = state.marketplaceDocumentSearch.trim().toLowerCase();
  return sales.filter((sale) => {
    const payload = sale.raw_payload || {};
    const text = `${sale.external_order_id || ""} ${sale.internal_order_id || ""} ${payload.order_items?.[0]?.item?.title || ""}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    if (state.marketplaceDocumentFilter === "all") return true;
    const related = state.marketplaceDocuments.filter((item) => String(item.external_order_id) === String(sale.external_order_id));
    if (state.marketplaceDocumentFilter === "missing") return related.length === 0;
    return related.some((item) => item.status === state.marketplaceDocumentFilter);
  });
}

export function renderMarketplaces() {
  const accountsTable = byId("marketplaceAccountsTable");
  const listingsGrid = byId("marketplaceListingsGrid");
  const salesGrid = byId("marketplaceSalesGrid");
  const documentsCenter = byId("marketplaceDocumentsCenter");
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
  const operationalListings = operationalMarketplaceListings(state.marketplaceListings);
  const listings = filterListingsForDisplay(operationalListings.filter(matchesMarketplaceChannel));
  const listingsPage = paginate(listings, state.marketplaceListingsPage, marketplacePageSize());
  state.marketplaceListingsPage = listingsPage.page;
  currentVisibleMarketplaceListings = listingsPage.items;
  const channelSales = state.marketplaceSales.filter(matchesMarketplaceChannel);
  const sales = filterMarketplaceDocumentSales(channelSales);
  const documents = state.marketplaceDocuments.filter(matchesMarketplaceChannel);
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
  if (documentsCenter) documentsCenter.innerHTML = renderMarketplaceDocumentsCenter(channelSales, documents);
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
  const featuredListing = currentVisibleMarketplaceListings[0];
  listingsGrid.innerHTML = listings.length ? `
    <div class="marketplace-listing-table-wrap">
      <table class="marketplace-listing-table">
        <thead><tr><th class="listing-select-cell"><input type="checkbox" data-action="marketplace-migrate-select-all" aria-label="Selecionar anuncios visiveis" /></th><th>Produto</th><th>Marketplace</th><th>Preço</th><th>Estoque</th><th>Visualizações</th><th>Conversão</th><th>Intenção</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${currentVisibleMarketplaceListings.map((item) => {
          const analytics = getListingAnalytics(item.marketplace, item.external_id);
          const intent = computeIntentScore(analytics);
          return `
          <tr>
            <td class="listing-select-cell"><input type="checkbox" data-action="marketplace-migrate-select" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}" ${selectedMarketplaceMigrations.has(marketplaceMigrationKey(item)) ? "checked" : ""} aria-label="Selecionar ${html(item.title)}" /></td>
            <td><div class="listing-product-cell">${item.thumbnail_url ? `<img src="${html(ensureHttpsUrl(item.thumbnail_url))}" alt="" loading="lazy" />` : `<span class="listing-placeholder"></span>`}<span><strong>${html(item.title)}</strong><small>${html(item.external_id)}</small></span></div></td>
            <td>${html(marketplaceDisplayName(item.marketplace))}</td>
            <td>${money.format(Number(item.price || 0))} ${renderProfitabilityBadge(item)}</td>
            <td>${Number(item.stock || item.available_quantity || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.views || item.views_today || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.conversion || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
            <td>${intent ? `<span class="badge ${intent.level.className}" title="${html(intent.level.advice)}">${intent.level.emoji} ${intent.score}</span>` : `<span class="badge neutral" title="Sincronize as métricas para calcular">-</span>`}</td>
            <td><span class="badge ${item.status === "active" ? "done" : "neutral"}">${html(item.status || "-")}</span></td>
            <td><div class="inline-actions"><button class="secondary-btn" type="button" data-action="marketplace-stats" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Ver</button><button class="secondary-btn" type="button" data-action="marketplace-edit" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Editar</button>${["mercado-livre", "shopee"].includes(normalizeMarketplaceChannel(item.marketplace)) ? `<button class="secondary-btn" type="button" data-action="marketplace-migrate" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Replicar</button>` : ""}</div></td>
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
  const listingsPagination = byId("marketplaceListingsPagination");
  if (listingsPagination) listingsPagination.innerHTML = paginationMarkup(listingsPage, "marketplace-listings-page");
  updateMarketplaceMigrationSelectionUi();
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
          <input type="checkbox" data-action="marketplace-document-select" data-id="${html(sale.external_order_id)}" ${state.marketplaceSelectedSales.includes(String(sale.external_order_id)) ? "checked" : ""} aria-label="Selecionar documentos do pedido ${html(sale.external_order_id)}" />
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
        <div class="sale-document-statuses">
          ${renderSaleDocumentStatus(sale, "label", "Etiqueta")}
          ${renderSaleDocumentStatus(sale, "declaration", "DC-e")}
          ${renderSaleFiscalStatus(sale)}
        </div>
        <div class="sale-document-actions">
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="label" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar etiqueta</button>
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="declaration" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar declaração</button>
          <button class="secondary-btn" type="button" data-action="marketplace-document" data-document="declaration_xml" data-id="${html(sale.external_order_id)}" data-marketplace="${html(sale.marketplace || "Mercado Livre")}">Baixar XML</button>
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
  byId("marketplaceDocumentSearch")?.addEventListener("change", (event) => {
    state.marketplaceDocumentSearch = event.target.value;
    renderMarketplaces();
  });
  byId("marketplaceDocumentFilter")?.addEventListener("change", (event) => {
    state.marketplaceDocumentFilter = event.target.value;
    renderMarketplaces();
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
        ${item.organization_id ? `<div><dt>Empresa</dt><dd>${html(String(item.organization_id).slice(0, 8))}</dd></div>` : ""}
        ${item.raw_payload?.source ? `<div><dt>Fonte</dt><dd>${html(item.raw_payload.source)}</dd></div>` : ""}
        <div><dt>Usuário</dt><dd>${html(item.actor_email || "Sistema")}</dd></div>
      </dl>
      ${changes.length ? `<div class="api-log-changes">${changes.map((change) => `<span>${html(change)}</span>`).join("")}</div>` : ""}
      ${item.status === "error" && (item.raw_payload?.error || item.raw_payload?.hint || item.raw_payload?.code) ? `<div class="api-error-detail">${html([item.raw_payload.error, item.raw_payload.hint, item.raw_payload.code].filter(Boolean).join(" | "))}</div>` : ""}
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
    "supabase-load": "supabase",
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
  if (kind === "supabase-load") return "neutral";
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
    state.marketplacePerformanceSales = [];
    state.marketplacePerformanceSalesCoverage = "unavailable";
    state.marketplaceDocuments = [];
    state.marketplaceDocumentVersions = [];
    state.marketplaceLogs = [];
    return;
  }
  const [accounts, listings, sales, performanceSales, documents, documentVersions, fiscalDocuments, logs] = await Promise.all([
    state.supabase.from("marketplace_accounts").select("marketplace,seller_name,external_seller_id,token_expires_at,updated_at,raw_payload").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }),
    state.supabase.from("marketplace_listings").select("marketplace,external_id,title,sku,price,status,permalink,thumbnail_url,raw_payload,updated_at").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }).limit(100),
    state.supabase.from("marketplace_order_links").select("marketplace,external_order_id,internal_order_id,raw_payload,created_at,updated_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(100),
    state.supabase.from("marketplace_order_links").select("marketplace,external_order_id,internal_order_id,raw_payload,created_at,updated_at", { count: "exact" }).eq("organization_id", state.organizationId).order("updated_at", { ascending: false }).range(0, 999),
    state.supabase.from("marketplace_documents").select("marketplace,external_order_id,internal_order_id,document_type,status,file_name,mime_type,storage_path,last_error,downloaded_at,checksum_sha256,version,verified_at,updated_at").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }).limit(300),
    state.supabase.from("marketplace_document_versions").select("marketplace,external_order_id,document_type,version,file_name,checksum_sha256,created_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(500),
    state.supabase.from("fiscal_documents").select("id,order_id,type,status,file_name,storage_path,updated_at").eq("organization_id", state.organizationId).order("updated_at", { ascending: false }).limit(300),
    state.supabase.from("marketplace_sync_log").select("id,organization_id,marketplace,kind,status,message,external_item_id,external_order_id,internal_order_id,actor_email,raw_payload,created_at").eq("organization_id", state.organizationId).order("created_at", { ascending: false }).limit(200)
  ]);
  const loadErrors = [
    ["marketplace_accounts", accounts.error],
    ["marketplace_listings", listings.error],
    ["marketplace_order_links", sales.error],
    ["marketplace_order_links_performance", performanceSales.error],
    ["marketplace_documents", documents.error],
    ["marketplace_document_versions", documentVersions.error],
    ["fiscal_documents", fiscalDocuments.error],
    ["marketplace_sync_log", logs.error]
  ].filter(([, error]) => error);
  state.marketplaceAccounts = accounts.error ? [] : accounts.data || [];
  state.marketplaceListings = listings.error ? [] : listings.data || [];
  state.marketplaceSales = sales.error ? [] : sales.data || [];
  state.marketplacePerformanceSales = performanceSales.error ? [] : performanceSales.data || [];
  state.marketplacePerformanceSalesCoverage = performanceSales.error
    ? "unavailable"
    : performanceSales.count > state.marketplacePerformanceSales.length ? "partial" : "complete";
  state.marketplaceDocuments = documents.error ? [] : documents.data || [];
  state.marketplaceDocumentVersions = documentVersions.error ? [] : documentVersions.data || [];
  state.fiscalDocuments = fiscalDocuments.error ? (state.fiscalDocuments || []) : fiscalDocuments.data || [];
  state.marketplaceLogs = [
    ...(logs.error ? [] : logs.data || []),
    ...loadErrors.map(([table, error]) => ({
      id: `local-${table}-${Date.now()}`,
      organization_id: state.organizationId,
      marketplace: "Supabase",
      kind: "supabase-load",
      status: "error",
      message: `Falha ao consultar ${table}. Verifique RLS, vinculo do usuario e policies.`,
      actor_email: state.activeUserEmail || "Usuario atual",
      raw_payload: {
        source: "client",
        table,
        error: error.message,
        code: error.code,
        hint: error.hint
      },
      created_at: new Date().toISOString()
    }))
  ];
}

export async function loadAndRenderMarketplaces() {
  await loadMarketplaces();
  renderMarketplaces();
}

let storefrontUploadedImages = [];

export function resetStorefrontProductDraft() {
  const form = byId("storefrontProductForm");
  form?.reset();
  if (form?.elements.external_id) form.elements.external_id.value = "";
  const editor = byId("storefrontDescriptionEditor");
  if (editor) editor.innerHTML = "";
  const fileInput = byId("storefrontImageFiles");
  if (fileInput) fileInput.value = "";
  const message = byId("storefrontProductMessage");
  if (message) message.textContent = "";
  storefrontUploadedImages = [];
  updateStorefrontTargetFields();
}

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
  const linkedProducts = state.products.filter((product) => productListingLinks(product, state.productListings, state.marketplaceListings).length).length;
  const unpublishedProducts = Math.max(0, state.products.length - linkedProducts);
  const views = state.storefrontEvents.filter((item) => item.event_type === "product_view").length;
  const buyClicks = state.storefrontEvents.filter((item) => item.event_type === "buy_click").length;
  const quoteClicks = state.storefrontEvents.filter((item) => ["quote_click", "custom_quote"].includes(item.event_type)).length;
  stats.innerHTML = `
    <article><span>Produtos cadastrados</span><strong>${state.products.length}</strong></article>
    <article><span>Com anúncios</span><strong>${linkedProducts}</strong></article>
    <article><span>Ainda não publicados</span><strong>${unpublishedProducts}</strong></article>
    <article><span>Visualizações</span><strong>${views}</strong></article>
    <article><span>Cliques em comprar</span><strong>${buyClicks}</strong></article>
    <article><span>Cliques/orçamentos</span><strong>${quoteClicks}</strong></article>
    <article><span>Última atualização</span><strong>${formatDateTime(state.products[0]?.updated_at)}</strong></article>
  `;
  const storefrontPage = paginate(state.products, state.storefrontPage, marketplacePageSize());
  state.storefrontPage = storefrontPage.page;
  list.innerHTML = state.products.length ? storefrontPage.items.map((product) => {
    const links = productListingLinks(product, state.productListings, state.marketplaceListings);
    return `
      <article class="storefront-product-row">
        <span class="listing-placeholder" aria-hidden="true"></span>
        <div>
          <strong>${html(product.name || "Produto sem nome")}</strong>
          <span>${html(product.sku || "Sem SKU")} • ${html(product.category || "Sem categoria")} • Custo ${money.format(Number(product.cost_price || 0))}</span>
          <small>${links.length ? links.map(({ link }) => `${html(marketplaceDisplayName(link.marketplace))} · ${html(link.external_id)}`).join(" | ") : "Ainda não publicado"}</small>
        </div>
        <div class="inline-actions">
          ${links.map(({ link, listing }) => renderCatalogLinkedListing(link, listing)).join("")}
          <button class="secondary-btn" type="button" data-action="edit-product" data-id="${html(product.id)}">Editar produto</button>
        </div>
      </article>
    `;
  }).join("") : `<div class="empty-chart">Nenhum produto cadastrado. Cadastre o primeiro produto para começar.</div>`;
  const pagination = byId("storefrontPagination");
  if (pagination) pagination.innerHTML = paginationMarkup(storefrontPage, "storefront-page");
}

export function updateStorefrontTargetFields() {
  const form = byId("storefrontProductForm");
  if (!form) return;
  const mlFields = byId("storefrontMlFields");
  const shopeeFields = byId("storefrontShopeeFields");
  const tiktokFields = byId("storefrontTiktokFields");
  const amazonFields = byId("storefrontAmazonFields");

  if (form.elements.publish_ml.checked) form.elements.marketplace.value = "Mercado Livre";
  if (form.elements.publish_shopee.checked && !form.elements.publish_ml.checked) form.elements.marketplace.value = "Shopee";
  if (form.elements.publish_tiktok?.checked && !form.elements.publish_ml.checked && !form.elements.publish_shopee.checked) form.elements.marketplace.value = "tiktok_shop";
  if (form.elements.publish_amazon.checked && !form.elements.publish_ml.checked && !form.elements.publish_shopee.checked && !form.elements.publish_tiktok?.checked) {
    form.elements.marketplace.value = "Amazon";
  }
  const marketplace = form.elements.marketplace.value;
  const showMl = form.elements.publish_ml.checked || marketplace === "Mercado Livre";
  const showShopee = form.elements.publish_shopee.checked || marketplace === "Shopee";
  const showTiktok = form.elements.publish_tiktok?.checked || marketplace === "tiktok_shop";
  const showAmazon = form.elements.publish_amazon.checked || marketplace === "Amazon";

  if (mlFields) mlFields.hidden = !showMl;
  if (shopeeFields) shopeeFields.hidden = !showShopee;
  if (form.elements.ml_category_id) form.elements.ml_category_id.required = form.elements.publish_ml.checked;
  if (tiktokFields) tiktokFields.hidden = !showTiktok;
  if (amazonFields) amazonFields.hidden = !showAmazon;
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
  const packageData = marketplacePackageData(item);
  form.elements.shopee_category_id.value = payload.shopee?.category_id || "";
  form.elements.shopee_weight.value = packageData.weight || "";
  form.elements.shopee_length.value = packageData.length || "";
  form.elements.shopee_width.value = packageData.width || "";
  form.elements.shopee_height.value = packageData.height || "";
  form.elements.shopee_days_to_ship.value = payload.shopee?.days_to_ship || 3;
  form.elements.shopee_sku.value = payload.shopee?.sku || item.sku || payload.seller_custom_field || "";
  form.elements.shopee_attributes_json.value = JSON.stringify(payload.shopee?.attributes || [], null, 2);
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
  if (data.get("publish_ml") === "on" && !mlCategoryId) {
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
        length: Number(data.get("shopee_length") || 0),
        width: Number(data.get("shopee_width") || 0),
        height: Number(data.get("shopee_height") || 0),
        brand: "Sem marca",
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
      const created = await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=create-listing`, {
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
    closeStorefrontProductDialog();
  } catch (error) {
    message.textContent = error.message;
  }
}

function findMarketplaceListing(itemId, marketplace) {
  const expectedChannel = normalizeMarketplaceChannel(marketplace);
  return state.marketplaceListings.find((item) =>
    String(item.external_id || "") === String(itemId || "")
      && normalizeMarketplaceChannel(item.marketplace) === expectedChannel
  ) || state.marketplaceListings.find((item) => String(item.external_id || "") === String(itemId || ""));
}

function marketplaceMigrationKey(listing) {
  return `${normalizeMarketplaceChannel(listing?.marketplace)}:${listing?.external_id || ""}`;
}

function selectedMarketplaceListings() {
  return state.marketplaceListings.filter((listing) => selectedMarketplaceMigrations.has(marketplaceMigrationKey(listing)));
}

function updateMarketplaceMigrationSelectionUi() {
  const button = byId("openBulkMarketplaceMigrationBtn");
  const count = selectedMarketplaceMigrations.size;
  const bulkActions = byId("marketplaceBulkActions");
  const selectionCount = byId("marketplaceBulkSelectionCount");
  if (bulkActions) bulkActions.hidden = count === 0;
  if (selectionCount) selectionCount.textContent = String(count);
  if (button) {
    button.disabled = count === 0;
    button.textContent = count ? `Replicar selecionados (${count})` : "Replicar selecionados";
  }
  const shopeeButton = byId("exportShopeeTemplateBtn");
  if (shopeeButton) {
    shopeeButton.disabled = count === 0;
    shopeeButton.innerHTML = `<i class="ti ti-file-spreadsheet" aria-hidden="true"></i> ${count ? `Exportar Shopee (${count})` : "Exportar Shopee"}`;
  }
}

export function openShopeeTemplateExport() {
  const listings = selectedMarketplaceListings();
  if (!listings.length) return;
  const invalid = listings.map((listing, index) => ({ listing, missing: validateShopeeListing(listing, index) })).filter((item) => item.missing.length);
  const categoryGroups = groupShopeeCategorySuggestions(listings);
  const missingPackageData = listings.filter((listing) => {
    const data = marketplacePackageData(listing);
    return !(data.weight > 0 && data.length > 0 && data.width > 0 && data.height > 0);
  });
  const form = byId("shopeeTemplateExportForm");
  form.reset();
  if (categoryGroups.length === 1 && categoryGroups[0].id) form.elements.categoryId.value = categoryGroups[0].id;
  byId("shopeeTemplateExportSubmit").disabled = listings.length === invalid.length;
  byId("shopeeExportSelectionCount").textContent = `${listings.length} anúncio(s) selecionado(s)`;
  byId("shopeeSummaryTotal").textContent = String(listings.length);
  byId("shopeeSummaryReady").textContent = String(listings.length - invalid.length);
  byId("shopeeSummaryIssues").textContent = String(invalid.length);
  byId("shopeeMissingPackageCount").textContent = `${missingPackageData.length} item(ns)`;
  byId("shopeeFallbackFields").open = missingPackageData.length > 0;
  byId("shopeeTemplateExportMessage").textContent = invalid.length ? `${invalid.length} anúncio(s) não serão exportados: complete título, preço e pelo menos 3 imagens.` : "";
  byId("shopeeTemplateCategorySummary").innerHTML = categoryGroups.map((group) => `<span>${html(group.path)} <strong>${group.count}</strong></span>`).join("");
  if (categoryGroups.length > 1) {
    byId("shopeeTemplateExportMessage").textContent += ` A seleção possui ${categoryGroups.length} categorias sugeridas; gere uma planilha por categoria usando o modelo correspondente da Shopee.`;
  }
  byId("shopeeTemplateExportDialog").showModal();
}

export async function exportSelectedListingsToShopee(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const listings = selectedMarketplaceListings().filter((listing) => validateShopeeListing(listing).length === 0);
  const message = byId("shopeeTemplateExportMessage");
  if (!listings.length) {
    message.textContent = "Nenhum anúncio selecionado atende aos requisitos.";
    return;
  }
  try {
    const categoryGroups = groupShopeeCategorySuggestions(listings);
    if (categoryGroups.length > 1) throw new Error("A seleção mistura categorias. Gere uma planilha por categoria.");
    message.textContent = "Gerando planilha...";
    byId("shopeeTemplateExportSubmit").disabled = true;
    await loadXlsx();
    const data = new FormData(event.currentTarget);
    const options = {
      categoryId: data.get("categoryId"),
      weight: data.get("weight"),
      length: data.get("length"),
      width: data.get("width"),
      height: data.get("height"),
      brand: data.get("brand"),
      preOrderDays: data.get("preOrderDays"),
      noGtin: data.get("noGtin") === "on",
    };
    if (!/^\d+$/.test(String(options.categoryId || ""))) throw new Error("Informe o código numérico da categoria Shopee (ex: 101944).");
    const issues = validateShopeeExport(listings, options);
    if (issues.length) throw new Error(`Complete os dados obrigatórios: ${issues.slice(0, 3).join("; ")}.`);
    const workbook = buildShopeeWorkbook(listings, options, window.XLSX);
    const output = window.XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true, cellStyles: true });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    link.download = `FLOWOPS_SHOPEE_${listings.length}_ANUNCIOS.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
    byId("shopeeTemplateExportDialog").close();
    flashActionMessage(`Planilha Shopee gerada com ${listings.length} anúncio(s).`);
  } catch (error) {
    const loaderFailure = /gerador|carregar|inicializado/i.test(String(error.message || ""));
    message.textContent = loaderFailure
      ? `Falha ao carregar o gerador de planilhas: ${error.message}`
      : `Não foi possível gerar a planilha: ${error.message}`;
  } finally {
    byId("shopeeTemplateExportSubmit").disabled = false;
  }
}

export function toggleMarketplaceMigrationSelection(itemId, marketplace, selected) {
  const listing = findMarketplaceListing(itemId, marketplace);
  if (!listing) return;
  const key = marketplaceMigrationKey(listing);
  if (selected) selectedMarketplaceMigrations.add(key);
  else selectedMarketplaceMigrations.delete(key);
  updateMarketplaceMigrationSelectionUi();
}

export function toggleAllMarketplaceMigrationSelections(selected) {
  currentVisibleMarketplaceListings
    .filter((listing) => ["mercado-livre", "shopee"].includes(normalizeMarketplaceChannel(listing.marketplace)))
    .forEach((listing) => {
      const key = marketplaceMigrationKey(listing);
      if (selected) selectedMarketplaceMigrations.add(key);
      else selectedMarketplaceMigrations.delete(key);
    });
  renderMarketplaces();
}

export function openMarketplaceFileImport() {
  const form = byId("marketplaceFileImportForm");
  form.reset();
  marketplaceFileImportRows = [];
  byId("marketplaceFileImportStatus").textContent = "Selecione ou arraste a planilha exportada";
  byId("marketplaceFileImportSummary").innerHTML = "";
  byId("marketplaceFileImportMessage").textContent = "";
  byId("marketplaceFileImportSubmit").disabled = true;
  byId("marketplaceFileImportDialog").showModal();
}

export function bindMarketplaceFileImportDropzone() {
  const dropzone = byId("marketplaceFileImportDropzone");
  const input = byId("marketplaceFileImportInput");
  if (!dropzone || !input || dropzone.dataset.bound === "true") return;
  dropzone.dataset.bound = "true";
  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  }));
  dropzone.addEventListener("drop", async (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    await previewMarketplaceFileImport();
  });
}

async function rowsFromMarketplaceFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text());
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    await loadXlsx();
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }
  throw new Error("Use um arquivo CSV, XLSX ou XLS.");
}

function renderMarketplaceFileImportPreview() {
  const valid = marketplaceFileImportRows.filter((row) => row.valid);
  const incomplete = marketplaceFileImportRows.filter((row) => !row.valid);
  byId("marketplaceFileImportSubmit").disabled = valid.length === 0;
  byId("marketplaceFileImportSummary").innerHTML = marketplaceFileImportRows.length ? `
    <div class="drawer-field-list">
      <div class="drawer-field-row"><span>Encontrados</span><strong>${marketplaceFileImportRows.length}</strong></div>
      <div class="drawer-field-row"><span>Prontos</span><strong>${valid.length}</strong></div>
      <div class="drawer-field-row"><span>Ignorados</span><strong>${incomplete.length}</strong></div>
    </div>
    <div class="marketplace-bulk-items">${marketplaceFileImportRows.slice(0, 50).map((row) => `
      <article><strong>${html(row.title || row.externalId)}</strong><small>${row.valid ? `${html(row.sku || "Sem SKU")} · ${money.format(row.price)} · ${row.images.length} imagem(ns)` : `Pendente: ${html(row.missing.join(", "))}`}</small></article>
    `).join("")}</div>
    ${marketplaceFileImportRows.length > 50 ? `<small class="muted">Exibindo os primeiros 50 itens.</small>` : ""}
  ` : `<div class="listing-drawer-suggestion danger">Nenhum anuncio reconhecido no arquivo.</div>`;
}

export async function previewMarketplaceFileImport() {
  const form = byId("marketplaceFileImportForm");
  const file = form.elements.file.files?.[0];
  if (!file) return;
  const status = byId("marketplaceFileImportStatus");
  try {
    status.textContent = "Lendo planilha...";
    marketplaceFileImportRows = normalizeMarketplaceImportRows(await rowsFromMarketplaceFile(file), form.elements.marketplace.value);
    status.textContent = `${file.name} · ${marketplaceFileImportRows.length} linha(s) reconhecida(s)`;
    byId("marketplaceFileImportMessage").textContent = "";
    renderMarketplaceFileImportPreview();
  } catch (error) {
    marketplaceFileImportRows = [];
    status.textContent = file.name;
    byId("marketplaceFileImportMessage").textContent = error.message;
    renderMarketplaceFileImportPreview();
  }
}

function marketplaceFileRowPayload(row) {
  return {
    action: "save",
    marketplace: row.marketplace,
    external_id: row.externalId,
    title: row.title,
    category: row.category || row.categoryId,
    price: row.price,
    marketplace_url: row.permalink,
    description: row.description,
    image_urls: row.images,
    featured: false,
    status: row.status,
    sku: row.sku,
    publish_targets: { vitrine: false, mercado_livre: false, shopee: false, amazon: false },
    raw_payload: {
      available_quantity: row.stock,
      category_id: row.marketplace === "Mercado Livre" ? row.categoryId : "",
      pictures: row.images.map((url) => ({ secure_url: url, url })),
      shopee: row.marketplace === "Shopee" ? { category_id: row.categoryId, weight: row.weight, sku: row.sku } : {},
      source_file_import: true,
      imported_at: new Date().toISOString(),
    },
  };
}

export async function saveMarketplaceFileImport(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const rows = marketplaceFileImportRows.filter((row) => row.valid);
  if (!rows.length) return;
  const message = byId("marketplaceFileImportMessage");
  message.textContent = `Importando ${rows.length} anuncio(s)...`;
  const results = await runMarketplaceImportBatch(rows, (row) => storefrontRequest(marketplaceFileRowPayload(row)), 4);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    const firstError = failures[0]?.reason?.message || "Falha não identificada";
    message.textContent = `${results.length - failures.length} importado(s); ${failures.length} falharam. Primeiro erro: ${firstError}`;
    return;
  }
  byId("marketplaceFileImportDialog").close();
  await loadMarketplaces();
  renderMarketplaces();
  flashActionMessage(`${results.length} anuncio(s) importados. Agora voce pode replica-los individualmente ou em lote.`);
}

export function downloadMarketplaceImportTemplate() {
  const example = ["123456", "Miniatura exemplo", "SKU-001", "79,90", "10", "Miniaturas", "", "Descricao do produto", "0,25", "https://", "https://imagem1.jpg|https://imagem2.jpg|https://imagem3.jpg", "active"];
  const csv = [MARKETPLACE_IMPORT_TEMPLATE, example].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = "modelo-importacao-marketplace.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function migrationBatchDefaults(form) {
  return {
    shopeeCategoryId: form.elements.shopeeCategoryId.value,
    shopeeWeight: form.elements.shopeeWeight.value,
    mlCategoryId: form.elements.mlCategoryId.value,
  };
}

function renderMarketplaceBulkMigrationPreview() {
  const form = byId("marketplaceBulkMigrationForm");
  const listings = selectedMarketplaceListings();
  if (!form || !listings.length) return;
  const target = migrationTargetFor(listings[0].marketplace);
  let migrations;
  try {
    migrations = buildMarketplaceMigrationBatch(listings, target, migrationBatchDefaults(form));
  } catch (error) {
    byId("marketplaceBulkMigrationSummary").innerHTML = `<div class="listing-drawer-suggestion danger">${html(error.message)}</div>`;
    return;
  }
  const ready = migrations.filter((migration) => migration.ready).length;
  byId("marketplaceBulkMigrationSummary").innerHTML = `
    <div class="drawer-field-list">
      <div class="drawer-field-row"><span>Prontos</span><strong>${ready}/${migrations.length}</strong></div>
      <div class="drawer-field-row"><span>Destino</span><strong>${html(marketplaceDisplayName(target))}</strong></div>
    </div>
    <div class="marketplace-bulk-items">${migrations.map((migration) => `
      <article><strong>${html(migration.title)}</strong><small>${migration.ready ? "Pronto para rascunho" : html(migration.missing.join(", "))}</small></article>
    `).join("")}</div>`;
}

export function openBulkMarketplaceMigration() {
  const listings = selectedMarketplaceListings();
  if (!listings.length) return;
  const sources = new Set(listings.map((listing) => normalizeMarketplaceChannel(listing.marketplace)));
  if (sources.size !== 1) {
    showAppMessage("Selecao de marketplaces misturada", "Selecione apenas anuncios do Mercado Livre ou apenas anuncios da Shopee por lote.", "warning");
    return;
  }
  const source = normalizeMarketplaceChannel(listings[0].marketplace);
  if (!["mercado-livre", "shopee"].includes(source)) return;
  const target = migrationTargetFor(source);
  const form = byId("marketplaceBulkMigrationForm");
  form.reset();
  form.elements.sourceMarketplace.value = source;
  form.elements.targetLabel.value = marketplaceDisplayName(target);
  byId("marketplaceBulkShopeeDefaults").hidden = target !== "shopee";
  byId("marketplaceBulkMlDefaults").hidden = target !== "mercado-livre";
  byId("marketplaceBulkMigrationCount").textContent = `${listings.length} anuncio${listings.length === 1 ? "" : "s"}`;
  byId("marketplaceBulkMigrationMessage").textContent = "";
  renderMarketplaceBulkMigrationPreview();
  byId("marketplaceBulkMigrationDialog").showModal();
}

function marketplaceMigrationDraftPayload(listing, migration) {
  return {
    action: "save",
    marketplace: marketplaceDisplayName(migration.target),
    external_id: "",
    title: migration.title,
    category: migration.target === "mercado-livre" ? migration.ml.categoryId : migration.shopee.categoryId,
    price: migration.price,
    description: migration.description,
    image_urls: migration.images,
    featured: false,
    status: "draft",
    sku: migration.sku,
    publish_targets: {
      vitrine: false,
      mercado_livre: migration.target === "mercado-livre",
      shopee: migration.target === "shopee",
      amazon: false,
    },
    raw_payload: {
      available_quantity: migration.stock,
      category_id: migration.ml.categoryId,
      listing_type_id: migration.ml.listingTypeId,
      condition: migration.ml.condition,
      attributes: migration.ml.attributes,
      shopee: {
        category_id: migration.shopee.categoryId,
        weight: migration.shopee.weight,
        length: migration.shopee.length,
        width: migration.shopee.width,
        height: migration.shopee.height,
        brand: migration.shopee.brand,
        days_to_ship: migration.shopee.daysToShip,
        sku: migration.sku,
        attributes: migration.shopee.attributes,
      },
      migration_source: { marketplace: listing.marketplace, external_id: listing.external_id },
    },
  };
}

export function refreshBulkMarketplaceMigrationPreview() {
  renderMarketplaceBulkMigrationPreview();
}

export async function saveBulkMarketplaceMigration(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const message = byId("marketplaceBulkMigrationMessage");
  const listings = selectedMarketplaceListings();
  const target = migrationTargetFor(listings[0]?.marketplace);
  let migrations;
  try {
    migrations = buildMarketplaceMigrationBatch(listings, target, migrationBatchDefaults(form));
  } catch (error) {
    message.textContent = error.message;
    return;
  }
  const incomplete = migrations.filter((migration) => !migration.ready);
  if (incomplete.length) {
    message.textContent = `${incomplete.length} anuncio(s) ainda possuem campos obrigatorios pendentes.`;
    renderMarketplaceBulkMigrationPreview();
    return;
  }
  const existingSources = new Set(state.marketplaceListings.map((item) => {
    const source = item.raw_payload?.migration_source;
    return source ? `${normalizeMarketplaceChannel(source.marketplace)}:${source.external_id}` : "";
  }).filter(Boolean));
  const pending = listings.map((listing, index) => ({ listing, migration: migrations[index] }))
    .filter(({ listing }) => !existingSources.has(marketplaceMigrationKey(listing)));
  if (!pending.length) {
    message.textContent = "Todos os anuncios selecionados ja possuem rascunho de migracao.";
    return;
  }
  message.textContent = `Criando ${pending.length} rascunho(s)...`;
  const results = await Promise.allSettled(pending.map(({ listing, migration }) =>
    storefrontRequest(marketplaceMigrationDraftPayload(listing, migration))
  ));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    message.textContent = `${results.length - failures.length} criado(s); ${failures.length} falharam. Tente novamente.`;
    return;
  }
  selectedMarketplaceMigrations.clear();
  byId("marketplaceBulkMigrationDialog").close();
  await loadMarketplaces();
  renderMarketplaces();
  flashActionMessage(`${results.length} rascunho(s) para ${marketplaceDisplayName(target)} criados. Revise antes de publicar.`);
}

function renderMarketplaceMigrationPreview(migration) {
  const targetLabel = marketplaceDisplayName(migration.target);
  byId("marketplaceMigrationTarget").value = migration.target;
  byId("marketplaceMigrationSummary").innerHTML = `
    <div class="drawer-field-list">
      <div class="drawer-field-row"><span>Destino</span><strong>${html(targetLabel)}</strong></div>
      <div class="drawer-field-row"><span>Preco</span><strong>${money.format(migration.price)}</strong></div>
      <div class="drawer-field-row"><span>Estoque</span><strong>${migration.stock}</strong></div>
      <div class="drawer-field-row"><span>Imagens</span><strong>${migration.images.length}</strong></div>
    </div>
    <div class="listing-drawer-suggestion ${migration.ready ? "" : "danger"}">
      ${migration.ready ? "Dados minimos prontos para revisao." : `Complete no rascunho: ${html(migration.missing.join(", "))}.`}
    </div>`;
}

export function openMarketplaceMigration(itemId, marketplace) {
  const listing = findMarketplaceListing(itemId, marketplace);
  if (!listing) {
    showAppMessage("Anuncio nao encontrado", "Atualize os anuncios antes de iniciar a replicacao.", "warning");
    return;
  }
  const form = byId("marketplaceMigrationForm");
  form.elements.itemId.value = listing.external_id;
  form.elements.sourceMarketplace.value = listing.marketplace;
  byId("marketplaceMigrationCode").textContent = listing.external_id;
  byId("marketplaceMigrationTitle").textContent = listing.title || "Replicar anuncio";
  renderMarketplaceMigrationPreview(buildMarketplaceMigration(listing, migrationTargetFor(listing.marketplace)));
  byId("marketplaceMigrationDialog").showModal();
}

export function refreshMarketplaceMigrationPreview() {
  const form = byId("marketplaceMigrationForm");
  const listing = findMarketplaceListing(form.elements.itemId.value, form.elements.sourceMarketplace.value);
  if (listing) renderMarketplaceMigrationPreview(buildMarketplaceMigration(listing, form.elements.targetMarketplace.value));
}

export function prepareMarketplaceMigration(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const listing = findMarketplaceListing(form.elements.itemId.value, form.elements.sourceMarketplace.value);
  if (!listing) return;
  const migration = buildMarketplaceMigration(listing, form.elements.targetMarketplace.value);
  fillStorefrontFormFromListing(listing);
  const productForm = byId("storefrontProductForm");
  productForm.elements.external_id.value = "";
  productForm.elements.publish_ml.checked = migration.target === "mercado-livre";
  productForm.elements.publish_shopee.checked = migration.target === "shopee";
  productForm.elements.marketplace.value = marketplaceDisplayName(migration.target);
  productForm.elements.sku.value = migration.sku;
  productForm.elements.shopee_sku.value = migration.sku;
  productForm.elements.shopee_category_id.value = migration.shopee.categoryId;
  productForm.elements.shopee_weight.value = migration.shopee.weight || "";
  productForm.elements.shopee_length.value = migration.shopee.length || "";
  productForm.elements.shopee_width.value = migration.shopee.width || "";
  productForm.elements.shopee_height.value = migration.shopee.height || "";
  productForm.elements.shopee_days_to_ship.value = migration.shopee.daysToShip;
  productForm.elements.shopee_attributes_json.value = JSON.stringify(migration.shopee.attributes, null, 2);
  if (migration.target === "mercado-livre") productForm.elements.ml_category_id.value = migration.ml.categoryId;
  updateStorefrontTargetFields();
  byId("marketplaceMigrationDialog").close();
  setMarketplaceView("storefront");
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
  flashActionMessage(`Rascunho para ${marketplaceDisplayName(migration.target)} preparado. Revise os campos destacados antes de publicar.`);
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
  const response = await fetch(supabaseFunctionUrl("storefront"), {
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
    const data = await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=category-fields&category_id=${encodeURIComponent(categoryId)}`);
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
    const endpoint = supabaseFunctionUrl("marketplace-auth/ml/start");
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
    // Fluxo OAuth interativo (quando implementado no backend): redireciona.
    if (payload.connect_url) { window.location.href = payload.connect_url; return; }
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel iniciar a conexao.");
    // O backend atual nao faz OAuth interativo: uma resposta ok SEM connect_url
    // significa que a conta ja esta conectada e a sincronizacao foi executada.
    // Antes isso disparava um erro falso mesmo com o sync funcionando.
    const imported = Number(payload.imported || 0);
    const listingCount = Number(payload.listing_count || 0);
    showAppMessage(
      "Mercado Livre",
      `Conta já conectada. Sincronização concluída${imported ? ` — ${imported} pedido(s)` : ""}${listingCount ? `, ${listingCount} anúncio(s)` : ""}.`,
      "success",
    );
    await loadAndRenderMarketplaces();
  } catch (error) {
    showAppMessage("Conexão Mercado Livre", `Não consegui iniciar a conexão: ${error.message}`, "error");
  }
}

export async function disconnectMercadoLivre() {
  if (!state.supabase) return;
  const confirmed = await showAppConfirm("Desconectar Mercado Livre?", "A sincronização desta empresa será interrompida até uma nova conexão.", { confirmLabel: "Desconectar", danger: true });
  if (!confirmed) return;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const response = await fetch(supabaseFunctionUrl("marketplace-auth/ml/disconnect"), {
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
  showAppMessage("Integração Shopee", "A conexão requer Partner ID, Partner Key, Shop ID e URL de retorno do Shopee Open Platform.", "info");
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
  state.marketplaceView = ["listings", "storefront", "sales", "integrations", "intelligence", "api-logs", "backup", "ml-questions"].includes(view) ? view : "listings";
  document.querySelectorAll("[data-marketplace-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.marketplaceView === state.marketplaceView);
  });
  const area = marketplaceAreaForView(state.marketplaceView);
  document.querySelectorAll("[data-marketplace-area]").forEach((button) => {
    const active = button.dataset.marketplaceArea === area;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-marketplace-area-views]").forEach((group) => {
    group.hidden = group.dataset.marketplaceAreaViews !== area;
  });
  const marketplaceChannelFilters = byId("marketplaceChannelFilters");
  if (marketplaceChannelFilters) {
    marketplaceChannelFilters.hidden = !marketplaceChannelFiltersVisible(area);
    marketplaceChannelFilters.querySelectorAll("button").forEach((button) => {
      button.disabled = !marketplaceChannelFiltersVisible(area);
    });
  }
  byId("marketplaceListingsView").classList.toggle("active", state.marketplaceView === "listings");
  byId("marketplaceStorefrontView").classList.toggle("active", state.marketplaceView === "storefront");
  byId("marketplaceSalesView").classList.toggle("active", state.marketplaceView === "sales");
  byId("marketplaceIntegrationsView").classList.toggle("active", state.marketplaceView === "integrations");
  byId("marketplaceIntelligenceView").classList.toggle("active", state.marketplaceView === "intelligence");
  byId("marketplaceApiLogsView").classList.toggle("active", state.marketplaceView === "api-logs");
  byId("marketplaceBackupView").classList.toggle("active", state.marketplaceView === "backup");
  byId("marketplaceMLQuestionsView").classList.toggle("active", state.marketplaceView === "ml-questions");

}

export function setMarketplaceArea(area) {
  setMarketplaceView(defaultMarketplaceViewForArea(area));
}

async function fetchLinkedMarketplaceListing(link) {
  if (!state.supabase || !state.organizationId) return null;
  const { data, error } = await state.supabase
    .from("marketplace_listings")
    .select("marketplace,external_id,title,sku,price,status,permalink,thumbnail_url,raw_payload,updated_at")
    .eq("organization_id", state.organizationId)
    .eq("marketplace", link.marketplace)
    .eq("external_id", link.external_id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function openLinkedMarketplaceListing(marketplace, externalId) {
  const link = { marketplace, external_id: externalId };
  const listing = await resolveLinkedMarketplaceListing(link, state.marketplaceListings, fetchLinkedMarketplaceListing);
  if (listing && !state.marketplaceListings.some((item) => item.marketplace === listing.marketplace && item.external_id === listing.external_id)) {
    state.marketplaceListings.push(listing);
  }
  return listing;
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
    showAppMessage("Shopee não conectada", "Conecte a API da conta antes de criar encomendas automaticamente.", "warning");
    return;
  }
  if (!ensureCanAdmin()) return;
  try {
    await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=create-order&order_id=${encodeURIComponent(externalOrderId)}`, {
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
    showAppMessage("Falha ao criar encomenda", error.message, "error");
  }
}

export async function syncMlShipment(orderId) {
  return marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=sync-shipment&order_id=${encodeURIComponent(orderId)}`);
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
    throw new Error(payload.error || `Falha na integracao (${response.status}).`);
  }
  return payload;
}

export async function downloadMarketplaceDocument(externalOrderId, marketplace, documentType, printAfter = false, options = {}) {
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    showAppMessage("Documentos Shopee indisponíveis", "Conecte a conta ao Shopee Open Platform para baixar documentos oficiais.", "warning");
    return;
  }
  const printWindow = printAfter ? window.open("", "_blank") : null;
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const url = new URL(supabaseFunctionUrl("marketplace-sync"));
    url.searchParams.set("marketplace", "ml");
    url.searchParams.set("action", "document");
    url.searchParams.set("order_id", externalOrderId);
    url.searchParams.set("document_type", documentType);
    if (state.organizationId) url.searchParams.set("organization_id", state.organizationId);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    // Handle document not available error
    if (response.status === 404) {
      throw new Error("Documento ainda não disponível. O pedido precisa estar em um status válido (postado ou em trânsito) para gerar a etiqueta ou declaração.");
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const errorMsg = payload.error || "Erro ao gerar documento.";
      const sale = findMarketplaceSale(externalOrderId, marketplace);
      const saleStatus = String(sale?.raw_payload?.status || sale?.status || "").toLowerCase();
      if (documentType === "label" && (saleStatus === "delivered" || errorMsg.toLowerCase().includes("delivered")) && response.status === 409) {
        if (printWindow) printWindow.close();
        downloadLocalMarketplaceDocument(externalOrderId, marketplace, "label-fallback", printAfter);
        await loadAndRenderMarketplaces();
        return;
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
        `${documentType}-${externalOrderId}.${documentType === "declaration_xml" ? "xml" : "pdf"}`;
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    showAppMessage(
      documentType === "label" ? "Etiqueta oficial baixada" : documentType === "declaration_xml" ? "XML oficial baixado" : "Declaração oficial baixada",
      response.headers.get("X-FlowOps-Document-Source") === "private-cache"
        ? "Documento recuperado do arquivo privado do FlowOps."
        : "Documento obtido diretamente do Mercado Livre e arquivado com segurança.",
      "success",
    );
    if (!options.skipReload) await loadAndRenderMarketplaces();
  } catch (error) {
    if (printWindow) printWindow.close();
    showAppMessage("Falha ao gerar documento", error.message || "Erro ao gerar documento.", "error");
    if (!options.skipReload) await loadAndRenderMarketplaces();
  }
}

export function toggleMarketplaceDocumentSelection(externalOrderId, selected) {
  const id = String(externalOrderId || "");
  const values = new Set(state.marketplaceSelectedSales.map(String));
  if (selected) values.add(id); else values.delete(id);
  state.marketplaceSelectedSales = [...values];
  renderMarketplaces();
}

export async function downloadSelectedMarketplaceDocuments() {
  const selected = new Set(state.marketplaceSelectedSales.map(String));
  const available = state.marketplaceDocuments.filter((item) =>
    selected.has(String(item.external_order_id))
    && item.status === "available"
    && ["label", "declaration", "declaration_xml"].includes(item.document_type)
  );
  if (!available.length) {
    showAppMessage("Documentos", "Nenhum documento disponível foi encontrado nos pedidos selecionados.", "warning");
    return;
  }
  try {
    const { data } = await state.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    const url = new URL(supabaseFunctionUrl("marketplace-sync"));
    url.searchParams.set("marketplace", "ml");
    url.searchParams.set("action", "document-bundle");
    if (state.organizationId) url.searchParams.set("organization_id", state.organizationId);
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: [...selected] }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Nao foi possivel montar o pacote de documentos.");
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    const disposition = response.headers.get("Content-Disposition") || "";
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `documentos-marketplace-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    showAppMessage("Pacote preparado", `${response.headers.get("X-FlowOps-Document-Count") || available.length} documento(s) reunidos em um unico ZIP.`, "success");
    await loadAndRenderMarketplaces();
  } catch (error) {
    showAppMessage("Falha no pacote", error.message || String(error), "error");
  }
}

export async function saveMarketplaceFiscalProfile() {
  if (!ensureCanAdmin()) return;
  const fiscalProfile = byId("marketplaceFiscalProfile")?.value || "unknown";
  const { data: settings, error } = await state.supabase.rpc("update_organization_fiscal_profile", { candidate_profile: fiscalProfile });
  if (error) {
    showAppMessage("Perfil fiscal", error.message, "error");
    return;
  }
  state.organizationSettings = settings || { ...(state.organizationSettings || {}), fiscal_profile: fiscalProfile };
  showAppMessage("Perfil fiscal salvo", "Os alertas documentais usarão esta configuração.", "success");
  renderMarketplaces();
}

export function exportMarketplaceDocumentReport() {
  const rows = state.marketplaceSales.map((sale) => {
    const docs = state.marketplaceDocuments.filter((item) => String(item.external_order_id) === String(sale.external_order_id));
    const fiscal = (state.fiscalDocuments || []).find((item) => String(item.order_id || "") === String(sale.internal_order_id || ""));
    const status = (type) => docs.find((item) => item.document_type === type)?.status || "não consultado";
    return [
      sale.external_order_id,
      sale.internal_order_id || "",
      sale.marketplace || "",
      sale.raw_payload?.date_created || sale.created_at || "",
      Number(sale.raw_payload?.total_amount || 0).toFixed(2),
      status("label"),
      status("declaration"),
      status("declaration_xml"),
      fiscal?.status || "sem NF-e vinculada",
    ];
  });
  const header = ["Pedido marketplace", "Encomenda", "Marketplace", "Data", "Valor", "Etiqueta", "DC-e", "XML", "NF-e"];
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `controle-fiscal-marketplaces-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function findMarketplaceSale(externalOrderId, marketplace) {
  const channel = normalizeMarketplaceChannel(marketplace);
  return state.marketplaceSales.find((sale) =>
    String(sale.external_order_id || "") === String(externalOrderId || "")
    && normalizeMarketplaceChannel(sale.marketplace || "Mercado Livre") === channel
  ) || state.marketplaceSales.find((sale) => String(sale.external_order_id || "") === String(externalOrderId || ""));
}

function downloadLocalMarketplaceDocument(externalOrderId, marketplace, documentType, printAfter = false) {
  const sale = findMarketplaceSale(externalOrderId, marketplace);
  const payload = sale?.raw_payload || {};
  const order = state.data.orders.find((item) =>
    String(item.marketplaceOrderCode || item.external_order_id || "") === String(externalOrderId || "")
  );
  const title = documentType === "label-fallback" ? "Comprovante operacional de envio" : "Declaracao de conteudo";
  const product = payload.order_items?.[0]?.item?.title || order?.product || "Produto nao informado";
  const buyer = payload.buyer?.nickname || payload.buyer?.first_name || order?.client || "Cliente nao informado";
  const amount = Number(payload.total_amount || order?.charged || 0);
  const htmlDoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${html(title)} - ${html(String(externalOrderId))}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;background:#fff;color:#111827}.doc{max-width:760px;margin:0 auto;padding:36px}
      h1{margin:0 0 6px;color:#0f8f7e}.muted{color:#64748b;font-size:12px}.box{border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin:18px 0}
      dl{display:grid;grid-template-columns:170px 1fr;gap:8px 14px}dt{color:#64748b}dd{margin:0;font-weight:700}.note{font-size:12px;color:#475569}
    </style></head><body><main class="doc">
      <h1>${html(title)}</h1>
      <div class="muted">Gerado pelo FlowOps em ${new Date().toLocaleString("pt-BR")}</div>
      <section class="box"><dl>
        <dt>Marketplace</dt><dd>${html(marketplaceDisplayName(marketplace))}</dd>
        <dt>Pedido</dt><dd>${html(String(externalOrderId || "-"))}</dd>
        <dt>Status</dt><dd>${html(marketplaceSaleStatus(payload.status || sale?.status))}</dd>
        <dt>Cliente</dt><dd>${html(buyer)}</dd>
        <dt>Produto</dt><dd>${html(product)}</dd>
        <dt>Valor declarado</dt><dd>${money.format(amount)}</dd>
        <dt>Encomenda interna</dt><dd>${html(order ? getOrderCode(order) : "Nao vinculada")}</dd>
      </dl></section>
      <p class="note">${documentType === "label-fallback"
        ? "Este comprovante operacional nao substitui a etiqueta oficial do Mercado Livre para postagem. Use apenas para arquivo interno quando o pedido ja foi entregue ou a API nao disponibilizar mais a etiqueta."
        : "Declaracao operacional para arquivo interno. Confira as exigencias fiscais e de transporte aplicaveis antes de usar fora do FlowOps."}</p>
    </main><script>window.addEventListener("load",()=>window.print());</script></body></html>`;
  if (printAfter) {
    const win = window.open("", "_blank");
    if (!win) {
      showAppMessage("Documento", "Permita pop-ups para imprimir o documento.", "error");
      return;
    }
    win.document.open();
    win.document.write(htmlDoc);
    win.document.close();
    return;
  }
  const blob = new Blob([htmlDoc], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = `${documentType === "label-fallback" ? "comprovante-envio" : "declaracao-conteudo"}-${externalOrderId}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  showAppMessage("Documento gerado", documentType === "label-fallback" ? "Etiqueta oficial indisponivel; gerado comprovante operacional." : "Declaracao de conteudo gerada.", "success");
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
    const data = await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml`);
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
  window.location.href = supabaseFunctionUrl("marketplace-auth/amazon/start");
}

export async function syncAmazon() {
  if (!ensureCanAdmin()) return;
  try {
    const data = await marketplaceRequest(`${supabaseFunctionUrl("amazon-sync")}?action=sync`);
    await loadRemoteData();
    await loadMarketplaces();
    render();
    flashActionMessage(`${data.listing_count || 0} anuncio(s) Amazon e ${data.created || 0} venda(s) importada(s).`);
  } catch (error) {
    showAppMessage("Falha na sincronização Amazon", error.message, "error");
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
    const data = await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=stats&item_id=${encodeURIComponent(itemId)}`);
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
    showAppMessage("Edição Shopee indisponível", "Conecte a conta ao Shopee Open Platform para editar anúncios diretamente.", "warning");
    return;
  }
  const normalizedId = String(itemId || "");
  const listing = state.marketplaceListings.find((item) =>
    String(item.external_id || "") === normalizedId && normalizeMarketplaceChannel(item.marketplace) === channel
  ) || state.marketplaceListings.find((item) =>
    String(item.external_id || "") === normalizedId
  ) || state.marketplaceListings.find((item) =>
    String(item.raw_payload?.id || item.raw_payload?.item_id || "") === normalizedId
  );
  if (!listing) {
    showAppMessage("Anuncio nao encontrado", "Atualize os anuncios ou sincronize o Mercado Livre antes de editar.", "warning");
    return;
  }
  const resolvedMarketplace = listing.marketplace || marketplace || "Mercado Livre";
  const payload = listing.raw_payload || {};
  const saleTerms = Array.isArray(payload.sale_terms) ? payload.sale_terms : [];
  const warranty = saleTerms.find((term) => ["WARRANTY_TYPE", "WARRANTY_TIME"].includes(term.id))?.value_name || payload.warranty || "";
  const manufacturingTime = saleTerms.find((term) => term.id === "MANUFACTURING_TIME")?.value_name || "";
  const form = byId("marketplaceEditForm");
  form.elements.itemId.value = normalizedId;
  form.elements.marketplace.value = resolvedMarketplace;
  form.elements.title.value = listing.title || "";
  form.elements.price.value = Number(listing.price || 0);
  form.elements.availableQuantity.value = Number(
    listing.raw_payload?.available_quantity
    ?? listing.raw_payload?.initial_quantity
    ?? listing.stock
    ?? listing.available_quantity
    ?? 0
  );
  form.elements.categoryId.value = payload.category_id || "";
  form.elements.listingTypeId.value = payload.listing_type_id || "gold_special";
  form.elements.condition.value = payload.condition || "new";
  form.elements.warranty.value = warranty;
  form.elements.manufacturingTime.value = manufacturingTime;
  form.elements.status.value = listing.status === "paused" ? "paused" : "active";
  form.elements.description.value = payload.description || payload.plain_text || "";
  form.elements.attributesJson.value = JSON.stringify(payload.attributes || [], null, 2);
  byId("marketplaceEditCode").textContent = normalizedId;
  byId("marketplaceEditTitle").textContent = listing.title || "Editar anuncio";
  byId("marketplaceEditSubtitle").textContent = marketplaceDisplayName(resolvedMarketplace);
  byId("marketplaceEditMessage").textContent = "";
  const dialog = byId("marketplaceEditDialog");
  if (dialog.open) dialog.close();
  dialog.showModal();
}

export async function saveMarketplaceListing(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
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
    let attributes = [];
    const attributesJson = String(data.get("attributesJson") || "").trim();
    if (attributesJson) {
      attributes = JSON.parse(attributesJson);
      if (!Array.isArray(attributes)) throw new Error("Atributos ML precisam estar em formato de lista JSON.");
    }
    await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=edit&item_id=${encodeURIComponent(itemId)}`, {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title"),
        price: number(data.get("price")),
        available_quantity: Number(data.get("availableQuantity") || 0),
        status: data.get("status"),
        listing_type_id: data.get("listingTypeId"),
        condition: data.get("condition"),
        warranty: data.get("warranty"),
        manufacturing_time: data.get("manufacturingTime"),
        description: data.get("description"),
        attributes
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
