









function bindFilter(elementId, filterKey) {
  const element = byId(elementId);
  if (!element) return;
  element.addEventListener("change", (event) => {
    state.filters[filterKey] = event.target.value;
    renderTables();
  });
}

function bindTextFilter(elementId, filterKey, renderer, normalize = true) {
  const element = byId(elementId);
  if (!element) return;
  element.addEventListener("input", (event) => {
    state.filters[filterKey] = normalize ? event.target.value.trim().toLowerCase() : event.target.value;
    renderer();
  });
}





















async function getSubscriptionAccessStatus() {
  try {
    const { data: subscription, error } = await state.supabase
      .from("organization_subscriptions")
      .select("status,trial_end,current_period_end,next_payment_at,grace_ends_at,plan_code,metadata")
      .eq("organization_id", state.organizationId)
      .maybeSingle();
    if (error) return { allowed: false, message: "Nao foi possivel validar a assinatura da empresa." };
    if (!subscription) return { allowed: false, message: "Assinatura da empresa nao encontrada." };
    const status = String(subscription.status || "").toLowerCase();
    if (subscription.plan_code === "free" || status === "free") return { allowed: true };
    const now = Date.now();
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end).getTime() : null;
    const renewalAt = subscription.next_payment_at || subscription.current_period_end;
    const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
    const graceTime = subscription.grace_ends_at ?
       new Date(subscription.grace_ends_at).getTime()
      : renewalTime ?
         renewalTime + SUBSCRIPTION_DEFAULT_GRACE_DAYS * 86400000
        : null;
    if (status === "trial") {
      if (!trialEnd || trialEnd > now) return { allowed: true };
      return {
        allowed: false,
        message: "O periodo de teste desta empresa terminou. Cadastre uma forma de pagamento para reativar o acesso.",
      };
    }
    if (status === "active") {
      if (!renewalTime || renewalTime > now || (graceTime && graceTime > now)) return { allowed: true };
      return {
        allowed: false,
        message: "A assinatura desta empresa venceu e o periodo de tolerancia terminou. Regularize o pagamento para reativar o acesso.",
      };
    }
    if (status === "past_due" && graceTime && graceTime > now) {
      return { allowed: true };
    }
    if (status === "pending") {
      const until = subscription.current_period_end || subscription.trial_end || subscription.next_payment_at;
      if (until && new Date(until).getTime() > now) return { allowed: true };
    }
    return {
      allowed: false,
      message: "A assinatura desta empresa esta suspensa ou pendente. Regularize em Minha Assinatura para reativar o acesso.",
    };
  } catch {
    return { allowed: false, message: "Nao foi possivel validar a assinatura da empresa." };
  }
}
















function renderTables() {
  renderOrders();
  renderCash();
  renderMaterials();
  renderInventory();
}
















const MARKETPLACE_CHANNELS = [
  { id: "mercado-livre", label: "Mercado Livre" },
  { id: "shopee", label: "Shopee" },
  { id: "amazon", label: "Amazon" }
];

function normalizeMarketplaceChannel(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (["mercadolivre", "ml", "meli"].includes(normalized)) return "mercado-livre";
  if (normalized === "shopee") return "shopee";
  if (normalized === "amazon") return "amazon";
  return normalized || "mercado-livre";
}

function marketplaceDisplayName(value) {
  const channel = MARKETPLACE_CHANNELS.find((item) => item.id === normalizeMarketplaceChannel(value));
  return channel?.label || value || "Marketplace";
}

function matchesMarketplaceChannel(item) {
  return state.marketplaceChannelFilter === "all"
    || normalizeMarketplaceChannel(item?.marketplace) === state.marketplaceChannelFilter;
}

function marketplaceChannelsForCurrentFilter() {
  return state.marketplaceChannelFilter === "all" ?
     MARKETPLACE_CHANNELS
    : MARKETPLACE_CHANNELS.filter((item) => item.id === state.marketplaceChannelFilter);
}

function renderMarketplaceChannelCards() {
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

function getIntegrationTokenAlert() {
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

function renderMarketplaces() {
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
  const listings = state.marketplaceListings.filter(matchesMarketplaceChannel);
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
      <div class="marketplace-listing-toolbar">
        <input type="search" placeholder="Buscar anúncio..." aria-label="Buscar anúncio" data-marketplace-local-search />
        <button class="secondary-btn" type="button">Filtros</button>
      </div>
      <table class="marketplace-listing-table">
        <thead><tr><th>Produto</th><th>Marketplace</th><th>Preço</th><th>Estoque</th><th>Visualizações</th><th>Conversão</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>${listings.map((item) => `
          <tr>
            <td><div class="listing-product-cell">${item.thumbnail_url ? `<img src="${html(item.thumbnail_url)}" alt="" loading="lazy" />` : `<span class="listing-placeholder"></span>`}<span><strong>${html(item.title)}</strong><small>${html(item.external_id)}</small></span></div></td>
            <td>${html(marketplaceDisplayName(item.marketplace))}</td>
            <td>${money.format(Number(item.price || 0))}</td>
            <td>${Number(item.stock || item.available_quantity || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.views || item.views_today || 0).toLocaleString("pt-BR")}</td>
            <td>${Number(item.conversion || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
            <td><span class="badge ${item.status === "active" ? "done" : "neutral"}">${html(item.status || "-")}</span></td>
            <td><div class="inline-actions"><button class="secondary-btn" type="button" data-action="marketplace-stats" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Ver</button><button class="secondary-btn" type="button" data-action="marketplace-edit" data-id="${html(item.external_id)}" data-marketplace="${html(item.marketplace || "Mercado Livre")}">Editar</button></div></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <aside class="marketplace-listing-detail">
      ${featuredListing.thumbnail_url ? `<img src="${html(featuredListing.thumbnail_url)}" alt="${html(featuredListing.title)}" />` : ""}
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

function renderIntegrationSummary() {
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

function renderMarketplaceLogSummary(item) {
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

function renderMarketplaceApiLog(item) {
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

function marketplaceLogLabel(kind) {
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

function marketplaceLogKindClass(kind) {
  if (kind === "webhook") return "webhook";
  if (["sync-products", "manual-sync"].includes(kind)) return "sync";
  if (kind === "edit-listing") return "edit";
  if (["order-import", "create-order"].includes(kind)) return "sale";
  if (kind === "token-refresh") return "token";
  if (["document-label", "document-declaration"].includes(kind)) return "document";
  return "neutral";
}

function marketplaceLogStatusLabel(status) {
  if (status === "success") return "Sucesso";
  if (status === "error") return "Erro";
  if (status === "ignored") return "Ignorado";
  return status || "Informação";
}

function marketplaceLogStatusClass(status) {
  if (status === "success") return "success";
  if (status === "error") return "error";
  return "ignored";
}

function matchesMarketplaceLogFilter(item) {
  const filter = state.marketplaceLogFilter;
  if (filter === "all") return true;
  if (filter === "success" || filter === "error") return item.status === filter;
  if (filter === "webhook") return item.kind === "webhook" || item.raw_payload?.source === "webhook";
  if (filter === "listings") return ["sync-products", "edit-listing"].includes(item.kind);
  if (filter === "sales") return ["order-import", "create-order"].includes(item.kind);
  if (filter === "documents") return ["document-label", "document-declaration"].includes(item.kind);
  return true;
}



async function loadMarketplaces() {
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





async function loadAndRenderMarketplaces() {
  await loadMarketplaces();
  renderMarketplaces();
}

let storefrontUploadedImages = [];

function renderStorefrontAdmin() {
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
        <img src="${html(images[0] || item.thumbnail_url || "")}" alt="${html(item.title)}" />
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

function updateStorefrontTargetFields() {
  const form = byId("storefrontProductForm");
  if (!form) return;
  const marketplace = form.elements.marketplace.value;
  const mlFields = byId("storefrontMlFields");
  const shopeeFields = byId("storefrontShopeeFields");
  const amazonFields = byId("storefrontAmazonFields");
  const showMl = form.elements.publish_ml.checked || marketplace === "Mercado Livre";
  const showShopee = form.elements.publish_shopee.checked || marketplace === "Shopee";
  const showAmazon = form.elements.publish_amazon.checked || marketplace === "Amazon";
  if (mlFields) mlFields.hidden = !showMl;
  if (shopeeFields) shopeeFields.hidden = !showShopee;
  if (amazonFields) amazonFields.hidden = !showAmazon;
  if (form.elements.publish_ml.checked) form.elements.marketplace.value = "Mercado Livre";
  if (form.elements.publish_shopee.checked && !form.elements.publish_ml.checked) form.elements.marketplace.value = "Shopee";
  if (form.elements.publish_amazon.checked && !form.elements.publish_ml.checked && !form.elements.publish_shopee.checked) {
    form.elements.marketplace.value = "Amazon";
  }
}

function storefrontListingImages(item) {
  const pictures = Array.isArray(item.raw_payload?.pictures) ? item.raw_payload.pictures : [];
  return [
    ...pictures.map((picture) => picture.secure_url || picture.url).filter(Boolean),
    item.thumbnail_url,
  ].filter(Boolean);
}

function storefrontDeliveryNoteFromListing(item) {
  const payload = item.raw_payload || {};
  if (payload.delivery_note) return payload.delivery_note;
  const manufacturing = payload.sale_terms?.find?.((term) => term.id === "MANUFACTURING_TIME")?.value_name;
  if (manufacturing) return `As datas de entrega incluem os ${manufacturing} necessários para deixar o produto pronto.`;
  return item.marketplace === "Mercado Livre" ?
     "Confira o prazo final de entrega no Mercado Livre antes de concluir a compra."
    : "";
}

function fillStorefrontFormFromListing(item) {
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

function importSelectedListingToStorefrontForm() {
  const value = byId("storefrontSourceListing").value;
  if (!value) return;
  const [marketplace, ...idParts] = value.split(":");
  const externalId = idParts.join(":");
  const item = state.marketplaceListings.find((listing) =>
    listing.external_id === externalId && listing.marketplace === marketplace
  );
  fillStorefrontFormFromListing(item);
}

async function saveStorefrontProduct(event) {
  event.preventDefault();
  if (!ensureCanAdmin()) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const message = byId("storefrontProductMessage");
  const imageUrls = String(data.get("image_url") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const descriptionHtml = sanitizeRichHtml(byId("storefrontDescriptionEditor").innerHTML.trim());
  form.elements.description_html.value = descriptionHtml;
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
      category_id: data.get("ml_category_id"),
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
          category_id: data.get("ml_category_id"),
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

function bindStorefrontImageInputs() {
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

async function addStorefrontImageFiles(files) {
  const message = byId("storefrontProductMessage");
  const list = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!list.length) return;
  message.textContent = "Preparando imagens...";
  const images = await Promise.all(list.slice(0, 8).map(resizeImageFileForStorefront));
  storefrontUploadedImages = [...storefrontUploadedImages, ...images].slice(0, 8);
  message.textContent = `${storefrontUploadedImages.length} imagem(ns) pronta(s) para salvar.`;
}

function bindStorefrontDescriptionEditor() {
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

function resizeImageFileForStorefront(file) {
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

async function storefrontRequest(payload) {
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

async function loadMlCategoryFields() {
  const form = byId("storefrontProductForm");
  const categoryId = form.elements.ml_category_id.value.trim();
  const preview = byId("mlCategoryFieldsPreview");
  if (!categoryId) {
    preview.innerHTML = `<p class="form-error">Informe o ID da categoria ML.</p>`;
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

function parseJsonSafe(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || "").trim() || JSON.stringify(fallback));
    return Array.isArray(parsed) || typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}














async function connectMercadoLivre() {
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

async function disconnectMercadoLivre() {
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

function configureShopee() {
  alert("A integracao da Shopee ainda precisa das credenciais do Shopee Open Platform: Partner ID, Partner Key, Shop ID e URL de retorno. O painel ja esta preparado para exibir anuncios, vendas, integracao e logs da Shopee.");
}

function renderMarketplaceWritePermission(account) {
  const scope = String(account.raw_payload?.scope || "");
  const readOnly = scope.includes("publish-sync:/read-only");
  const readWrite = scope.includes("publish-sync:/write") || scope.includes("publish-sync:/read-write");
  if (readWrite) return `<span class="badge done">Leitura e escrita</span>`;
  if (readOnly) return `<span class="badge queue">Somente leitura</span>`;
  return `<span class="badge neutral">Não identificada</span>`;
}

function marketplaceSaleStatus(status) {
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

function marketplaceSaleStatusClass(status) {
  if (["paid", "confirmed"].includes(status)) return "done";
  if (["cancelled", "invalid"].includes(status)) return "danger-badge";
  return "queue";
}

function setMarketplaceView(view) {
  state.marketplaceView = ["listings", "storefront", "sales", "integrations", "api-logs", "backup"].includes(view) ? view : "listings";
  document.querySelectorAll("[data-marketplace-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.marketplaceView === state.marketplaceView);
  });
  byId("marketplaceListingsView").classList.toggle("active", state.marketplaceView === "listings");
  byId("marketplaceStorefrontView").classList.toggle("active", state.marketplaceView === "storefront");
  byId("marketplaceSalesView").classList.toggle("active", state.marketplaceView === "sales");
  byId("marketplaceIntegrationsView").classList.toggle("active", state.marketplaceView === "integrations");
  byId("marketplaceApiLogsView").classList.toggle("active", state.marketplaceView === "api-logs");
  byId("marketplaceBackupView").classList.toggle("active", state.marketplaceView === "backup");
}

function applyMarketplaceLogRange() {
  state.marketplaceLogDateFrom = byId("marketplaceLogDateFrom").value;
  state.marketplaceLogDateTo = byId("marketplaceLogDateTo").value;
  state.marketplaceLogsCleared = false;
  state.marketplaceLogLimit = 30;
  renderMarketplaces();
}

function viewMarketplaceOrder(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  state.query = getOrderCode(order).toLowerCase();
  byId("globalSearch").value = getOrderCode(order);
  state.filters.orderMaterial = "all";
  state.filters.orderStatus = "all";
  state.filters.orderMarketplace = "all";
  state.filters.orderFocus = "all";
  syncOrderFilterControls();
  setView("orders");
  renderTables();
}

async function createMarketplaceOrder(externalOrderId, marketplace = "Mercado Livre") {
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

async function marketplaceRequest(url, options = {}) {
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
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Falha na integracao.");
  return payload;
}

async function downloadMarketplaceDocument(externalOrderId, marketplace, documentType, printAfter = false) {
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
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Erro ao gerar documento.");
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

async function syncMercadoLivre() {
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

function connectAmazon() {
  if (!ensureCanAdmin()) return;
  window.location.href = "https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-auth/amazon/start";
}

async function syncAmazon() {
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

async function showMarketplaceStats(itemId, marketplace = "Mercado Livre") {
  const content = byId("marketplaceStatsContent");
  if (normalizeMarketplaceChannel(marketplace) === "shopee") {
    content.innerHTML = `<div class="empty-chart">As estatisticas da Shopee ficarao disponiveis assim que a conta for conectada.</div>`;
    byId("marketplaceStatsDialog").showModal();
    return;
  }
  content.innerHTML = `<div class="empty-chart">Carregando estatisticas...</div>`;
  byId("marketplaceStatsDialog").showModal();
  try {
    const data = await marketplaceRequest(`https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=stats&item_id=${encodeURIComponent(itemId)}`);
    const stats = data.stats;
    content.innerHTML = `
      <div class="stats-grid">
        <article><span>Vendas efetuadas</span><strong>${Number(stats.sold_quantity || 0).toLocaleString("pt-BR")}</strong></article>
        <article><span>Visualizacoes</span><strong>${Number(stats.visits || 0).toLocaleString("pt-BR")}</strong></article>
        <article><span>Estoque disponivel</span><strong>${Number(stats.available_quantity || 0).toLocaleString("pt-BR")}</strong></article>
        <article><span>Preco</span><strong>${money.format(Number(stats.price || 0))}</strong></article>
        <article><span>Status</span><strong>${html(stats.status || "-")}</strong></article>
        <article><span>Saude do anuncio</span><strong>${stats.health == null ? "-" : `${Math.round(Number(stats.health) * 100)}%`}</strong></article>
      </div>
      <div class="listing-stats-detail">
        <strong>${html(stats.title || itemId)}</strong>
        <span>Criado em ${formatDateTime(stats.date_created)} • Atualizado em ${formatDateTime(stats.last_updated)}</span>
      </div>
    `;
  } catch (error) {
    content.innerHTML = `<p class="form-error">${html(error.message)}</p>`;
  }
}

async function openMarketplaceEdit(itemId, marketplace = "Mercado Livre") {
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

async function saveMarketplaceListing(event) {
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






































function subscriptionFallbackFromOrganization(organization) {
  if (!organization?.plan_code) return null;
  const now = new Date().toISOString();
  return {
    organization_id: organization.id,
    plan_code: organization.plan_code,
    status: organization.status === "trial" ? "trial" : organization.status === "active" ? "active" : organization.status || "active",
    provider: "manual",
    trial_start: null,
    trial_end: organization.trial_ends_at || null,
    current_period_start: now,
    current_period_end: organization.trial_ends_at || null,
    next_payment_at: null,
    provider_subscription_id: null,
    metadata: { source: "organization_fallback" },
  };
}









function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "3d-aft-dados.json";
  link.click();
  URL.revokeObjectURL(link.href);
  recordAudit("export", "system", "json", "", null, { orders: state.data.orders.length }, "manual");
}

async function importFile(event) {
  if (!ensureCanEdit()) {
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;
  let imported = false;
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      await importJson(await file.text());
    } else if (file.name.toLowerCase().endsWith(".csv")) {
      await importRows(parseCsv(await file.text()));
    } else if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      await importRows(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
    } else {
      alert("Formato não suportado. Use JSON, CSV ou XLSX.");
      return;
    }
    saveData();
    render();
    imported = true;
    alert("Importação concluída.");
  } catch (error) {
    alert(`Não foi possível importar: ${error.message}`);
  } finally {
    if (imported) await recordAudit("import", "system", file.name, "", null, { file: file.name, size: file.size }, "manual");
    event.target.value = "";
  }
}


async function importJson(text) {
  const parsed = JSON.parse(text);
  const incoming = {
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    cash: Array.isArray(parsed.cash) ? parsed.cash : [],
    materials: Array.isArray(parsed.materials) ? parsed.materials : []
  };
  await importCollection("orders", incoming.orders);
  await importCollection("cash", incoming.cash);
  await importCollection("materials", incoming.materials);
}

async function importCollection(kind, rows) {
  for (const row of rows) {
    const item = normalizeImportedItem(kind, row);
    upsertLocal(kind, item);
    await persist(kind, item);
  }
}

async function importRows(rows) {
  const orders = rows.map((row) => normalizeImportedOrder(row)).filter(Boolean);
  if (!orders.length) throw new Error("Não encontrei colunas de encomenda no arquivo.");
  await importCollection("orders", orders);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function splitCsvLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((item) => item.replace(/^"|"$/g, "").trim());
}



function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeImportedItem(kind, row) {
  if (kind === "orders") return normalizeImportedOrder(row) || order(row.id || nextId("ENC", state.data.orders), row.description || "Importado", row.material || "", row.deliveryDate || "", row.charged || 0, row.received || 0, normalizeOrderStatus(row.status || "A preparar"), row.notes || "");
  if (kind === "cash") return {
    id: row.id || nextId("CX", state.data.cash),
    date: normalizeDate(row.date) || today(),
    type: row.type || "Entrada",
    category: row.category || "Importado",
    description: row.description || "Importado",
    method: row.method || "",
    income: Number(row.income || 0),
    expense: Number(row.expense || 0)
  };
  return {
    id: row.id || nextId("MAT", state.data.materials),
    date: normalizeDate(row.date) || today(),
    supplier: row.supplier || "Importado",
    type: row.type || "Material",
    spec: row.spec || "",
    quantity: Number(row.quantity || 0),
    unitCost: Number(row.unitCost || row.unit_cost || 0)
  };
}

function upsertLocal(kind, item) {
  const key = kind === "cash" ? "cash" : kind;
  const index = state.data[key].findIndex((row) => row.id === item.id);
  if (index >= 0) state.data[key][index] = item;
  else state.data[key].push(item);
}

function pick(row, keys) {
  const entries = Object.entries(row || {});
  for (const key of keys) {
    const found = entries.find(([name]) => normalizeKey(name) === normalizeKey(key));
    if (found && String(found[1]).trim()) return String(found[1]).trim();
  }
  return "";
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return "";
}

function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de XLSX."));
    document.head.appendChild(script);
  });
}














function getSubscriptionAlert() {
  const subscription = state.subscription;
  const plan = state.subscriptionPlans.find((item) => item.code === subscription?.plan_code);
  if (!subscription || !plan) return null;
  const latestPayment = state.subscriptionPayments[0];
  const metadata = subscription.metadata || {};
  const cardLastFour = metadata.card_last_four || metadata.last_four || latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
  const paymentMethod = cardLastFour ? `Cartão final ${cardLastFour}` : latestPayment?.payment_method || "";
  const now = Date.now();
  const renewalAt = subscription.status === "trial" ?
     subscription.trial_end
    : subscription.status === "active" && Number(plan.price_monthly || 0) > 0 ?
       subscription.next_payment_at || subscription.current_period_end
      : null;
  const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
  const graceTime = subscription.grace_ends_at ?
     new Date(subscription.grace_ends_at).getTime()
    : renewalTime ?
       renewalTime + SUBSCRIPTION_DEFAULT_GRACE_DAYS * 86400000
      : null;
  if (subscription.status === "past_due") {
    return { level: "critical", title: "Pagamento da assinatura pendente", message: "Atualize o pagamento para evitar a suspensão do acesso." };
  }
  if (renewalTime && renewalTime <= now && graceTime && graceTime > now) {
    return { level: "critical", title: "Assinatura em período de tolerância", message: `Regularize o pagamento até ${formatDateTime(new Date(graceTime).toISOString())}.` };
  }
  if (renewalTime && graceTime && graceTime <= now && subscription.status === "active") {
    return { level: "critical", title: "Assinatura vencida", message: "O período de tolerância terminou. Regularize o pagamento para evitar bloqueio." };
  }
  if (!renewalAt) return null;
  const days = Math.max(0, Math.ceil((new Date(renewalAt).getTime() - now) / 86400000));
  if (days > 7) return null;
  const hasRegisteredPaymentMethod = Boolean(paymentMethod || subscription.provider_subscription_id || metadata.payment_method_registered);
  if (subscription.status === "trial" && !hasRegisteredPaymentMethod) {
    return { level: "critical", title: `Seu período de teste termina em ${days} dia${days === 1 ? "" : "s"}`, message: "Não encontramos um método de pagamento cadastrado." };
  }
  if (subscription.status === "active" && !hasRegisteredPaymentMethod) {
    return { level: "critical", title: "Método de pagamento não encontrado", message: "Seu plano vence em breve. Adicione um cartão para evitar a suspensão." };
  }
  return {
    level: days <= 1 ? "critical" : "normal",
    title: days === 1 ? "Seu plano será renovado amanhã" : `Seu plano será renovado em ${days} dias`,
    message: `${plan.name} • ${money.format(Number(plan.price_monthly || 0))} • ${paymentMethod || "Método não informado"}`,
  };
}







function getMarketplaceStatusFromHash() {
  const hash = window.location.hash.replace("#", "");
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("ml_status") || "";
}

function showMarketplaceOAuthStatus(status) {
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











































function renderSettingsData() {
  const datalist = byId("customTagsList");
  if (datalist) datalist.innerHTML = state.customTags.map((tag) => `<option value="${html(tag.name)}"></option>`).join("");
  const manager = byId("customTagsManager");
  if (manager) {
    manager.innerHTML = state.customTags.length ? state.customTags.map((tag) => `
      <span class="${customTagClass(tag.color)}">${html(tag.name)}
        ${state.canEdit ? `<button type="button" data-action="delete-custom-tag" data-id="${html(tag.id)}">×</button>` : ""}
      </span>
    `).join("") : `<span class="muted">Nenhuma tag personalizada.</span>`;
  }
  const backup = byId("backupStatus");
  if (backup) {
    const latest = state.backupRuns[0];
    backup.innerHTML = `
      <article><span>Ultimo backup</span><strong>${latest ? formatDateTime(latest.started_at) : "Ainda nao executado"}</strong></article>
      <article><span>Resultado</span><strong>${latest?.status === "success" ? "Concluido" : latest?.status === "error" ? "Falhou" : latest?.status || "-"}</strong></article>
      <article><span>Tamanho</span><strong>${latest?.size_bytes ? formatFileSize(latest.size_bytes) : "-"}</strong></article>
      <article><span>Falhou?</span><strong>${latest?.status === "error" ? "Sim" : "Nao"}</strong></article>
    `;
  }
  const backupHistory = byId("backupHistoryList");
  if (backupHistory) {
    backupHistory.innerHTML = state.backupRuns.length ? state.backupRuns.slice(0, 30).map((run) => `
      <div class="list-row">
        <span><strong>${run.status === "success" ? "Backup concluído" : "Backup com erro"}</strong><br><small>${formatDateTime(run.started_at)} • ${run.backup_type || "automático"}</small></span>
        <span class="backup-history-actions">
          <span class="badge ${run.status === "success" ? "done" : "danger-badge"}">${run.status === "success" ? formatFileSize(run.size_bytes) : html(run.error_message || "Falhou")}</span>
          ${run.status === "success" && run.storage_path ? `<button class="secondary-btn compact" type="button" data-action="download-saved-backup" data-id="${html(run.id)}">Baixar</button>` : ""}
        </span>
      </div>
    `).join("") : `<div class="empty-chart">Nenhum backup executado ainda.</div>`;
  }
  bindActions();
}




async function runManualBackup() {
  if (!ensureCanAdmin()) return;
  const button = byId("runBackupBtn");
  button.disabled = true;
  button.textContent = "Executando...";
  try {
    const { data: sessionData } = await state.supabase.auth.getSession();
    const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
      body: JSON.stringify({ action: "manual" }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Falha no backup.");
    await loadRemoteData();
    renderSettingsData();
    flashActionMessage("Backup concluido.");
  } catch (error) {
    alert(`Backup falhou: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Executar agora";
  }
}

async function maintenanceRequest(payload) {
  if (!ensureCanAdmin()) throw new Error("Apenas administradores podem gerenciar backups.");
  const { data: sessionData } = await state.supabase.auth.getSession();
  const response = await fetch("https://djvrhvzjvnyensbobtby.functions.supabase.co/system-maintenance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Falha ao processar o backup.");
  return data;
}

async function downloadBackupScope(scope) {
  const labels = {
    system: "sistema",
    storefront: "vitrine",
    database: "banco-completo",
  };
  const button = byId(scope === "system" ?
     "downloadSystemBackupBtn"
    : scope === "storefront" ?
       "downloadStorefrontBackupBtn"
      : "downloadDatabaseBackupBtn");
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Preparando...";
  try {
    const data = await maintenanceRequest({ action: "export", scope });
    downloadJsonFile(data.snapshot, `3daft-backup-${labels[scope]}-${new Date().toISOString().slice(0, 10)}.json`);
    flashActionMessage("Backup baixado.");
  } catch (error) {
    alert(`Nao foi possivel baixar o backup: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = previous;
  }
}

async function downloadSavedBackup(id) {
  try {
    const data = await maintenanceRequest({ action: "download", backup_id: id });
    const anchor = document.createElement("a");
    anchor.href = data.url;
    anchor.download = data.file_name || "3daft-backup.json.gz";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    alert(`Nao foi possivel baixar o backup: ${error.message}`);
  }
}

async function restoreBackupFromFile() {
  if (!ensureCanAdmin()) return;
  const input = byId("backupImportFile");
  const message = byId("backupRestoreMessage");
  const button = byId("restoreBackupBtn");
  const file = input.files?.[0];
  if (!file) {
    message.textContent = "Selecione um arquivo de backup.";
    return;
  }
  if (!confirm("Restaurar este backup Registros com o mesmo identificador serao atualizados no Supabase.")) return;
  button.disabled = true;
  button.textContent = "Restaurando...";
  message.textContent = "Validando arquivo...";
  try {
    const snapshot = await readBackupFile(file);
    validateBackupSnapshot(snapshot);
    const data = await maintenanceRequest({ action: "restore", snapshot });
    message.textContent = `${data.restored_rows || 0} registro(s) restaurado(s) em ${data.restored_tables || 0} tabela(s).`;
    input.value = "";
    await loadRemoteData();
    await loadMarketplaces();
    render();
    renderMarketplaces();
  } catch (error) {
    message.textContent = `Falha: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Importar backup";
  }
}

async function simulateBackupRestore() {
  if (!ensureCanAdmin()) return;
  const input = byId("backupImportFile");
  const message = byId("backupRestoreMessage");
  const report = byId("backupSimulationReport");
  const button = byId("simulateBackupRestoreBtn");
  const file = input.files?.[0];
  if (!file) {
    message.textContent = "Selecione um arquivo de backup.";
    report.hidden = true;
    return;
  }
  button.disabled = true;
  button.textContent = "Analisando...";
  message.textContent = "Comparando o backup com o banco atual sem alterar dados...";
  report.hidden = true;
  try {
    const snapshot = await readBackupFile(file);
    validateBackupSnapshot(snapshot);
    const data = await maintenanceRequest({ action: "simulate-restore", snapshot });
    renderBackupSimulation(data);
    message.textContent = data.can_restore ?
       "Teste concluido. O arquivo pode ser restaurado."
      : "Teste concluido com problemas que precisam ser revisados.";
  } catch (error) {
    message.textContent = `Falha no teste: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Testar restauracao";
  }
}

function renderBackupSimulation(data) {
  const report = byId("backupSimulationReport");
  const totals = data.totals || {};
  const rows = Array.isArray(data.tables) ? data.tables : [];
  report.innerHTML = `
    <div class="backup-simulation-summary">
      <article><span>Criaria</span><strong>${Number(totals.create || 0)}</strong></article>
      <article><span>Atualizaria</span><strong>${Number(totals.update || 0)}</strong></article>
      <article><span>Sem mudanca</span><strong>${Number(totals.identical || 0)}</strong></article>
      <article><span>Ignorados</span><strong>${Number(totals.skipped || 0)}</strong></article>
      <article><span>Invalidos</span><strong>${Number(totals.invalid || 0)}</strong></article>
    </div>
    <div class="table-wrap">
      <table class="backup-simulation-table">
        <thead><tr><th>Tabela</th><th>Arquivo</th><th>Novos</th><th>Atualizacoes</th><th>Iguais</th><th>Ignorados</th><th>Invalidos</th></tr></thead>
        <tbody>${rows.map((item) => `
          <tr>
            <td><strong>${html(item.table)}</strong>${item.reason ? `<br><small>${html(item.reason)}</small>` : ""}</td>
            <td>${Number(item.rows || 0)}</td>
            <td>${Number(item.create || 0)}</td>
            <td>${Number(item.update || 0)}</td>
            <td>${Number(item.identical || 0)}</td>
            <td>${Number(item.skipped || 0)}</td>
            <td>${Number(item.invalid || 0)}</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
    <p class="backup-simulation-result ${data.can_restore ? "success" : "warning"}">
      ${data.can_restore ?
         "Nenhuma alteracao foi executada. A restauracao real continua dependendo do botao Importar backup."
        : "Nenhuma alteracao foi executada. Corrija ou substitua o arquivo antes da restauracao."}
    </p>
  `;
  report.hidden = false;
}

async function readBackupFile(file) {
  let text;
  if (file.name.toLowerCase().endsWith(".gz") || file.type === "application/gzip") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("Este navegador nao suporta arquivos GZIP. Use um backup JSON.");
    }
    const decompressed = file.stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(decompressed).text();
  } else {
    text = await file.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Arquivo JSON invalido.");
  }
}

function validateBackupSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("O arquivo nao possui a estrutura de backup da 3D.AFT.");
  }
  if (!Object.values(snapshot.tables).every(Array.isArray)) {
    throw new Error("Uma ou mais tabelas do backup sao invalidas.");
  }
}

function downloadJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}





function renderSubscriptionPortal() {
  const target = byId("subscriptionSummary");
  const table = byId("billingHistoryTable");
  if (!target || !table) return;
  const subscription = state.subscription;
  const plan = state.subscriptionPlans.find((item) => item.code === subscription?.plan_code);
  if (!subscription) {
    target.innerHTML = `<div class="panel"><div class="empty-chart">Assinatura não encontrada para esta empresa.</div></div>`;
    table.innerHTML = `<tr><td colspan="5">Nenhuma cobrança registrada.</td></tr>`;
    return;
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const importedSales = state.marketplaceSales.filter((item) => new Date(item.created_at) >= monthStart).length;
  const users = state.activeUsers.length || 1;
  const latestPayment = state.subscriptionPayments[0];
  const paymentMetadata = subscription.metadata || {};
  const cardLastFour = paymentMetadata.card_last_four || paymentMetadata.last_four || latestPayment?.metadata?.card_last_four || latestPayment?.metadata?.last_four || "";
  const cardBrand = paymentMetadata.card_brand || latestPayment?.metadata?.card_brand || latestPayment?.payment_method || "";
  const hasRegisteredPaymentMethod = Boolean((paymentMetadata.payment_method_registered !== false) && (cardLastFour || paymentMetadata.payment_method_registered || subscription.provider_subscription_id || latestPayment?.payment_method));
  const paymentMethod = cardLastFour ? `${cardBrand ? `${cardBrand} ` : "Cartão "}final ${cardLastFour}` : hasRegisteredPaymentMethod ? "Cartão cadastrado no Mercado Pago" : "Não cadastrado";
  const renewalAt = subscription.next_payment_at || subscription.current_period_end;
  const grace = getSubscriptionGraceInfo(subscription, latestPayment);
  const renewalMissed = subscriptionRenewalMissed(subscription, latestPayment);
  const paymentDetail = subscription.last_payment_reason
    || latestPayment?.failure_reason
    || latestPayment?.status_detail
    || latestPayment?.metadata?.reason
    || latestPayment?.metadata?.status_detail
    || latestPayment?.metadata?.message
    || latestPayment?.metadata?.provider_status
    || "-";
  const lastPaymentAttemptAt = subscription.last_payment_attempt_at
    || latestPayment?.attempted_at
    || latestPayment?.created_at;
  const health = getCompanyHealth();
  const subscriptionPrice = getSubscriptionPrice(plan, subscription);
  const userLimit = Number(plan?.limits?.users || 0);
  const salesLimit = Number(plan?.limits?.marketplace_sales_month || 0);
  const connectedMarketplaces = state.marketplaceAccounts.map((item) => marketplaceDisplayName(item.marketplace));
  const usagePercent = (value, limit) => limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  target.innerHTML = `
    <section class="subscription-premium-hero">
      <div class="subscription-plan-intro">
        <span>Seu plano atual</span>
        <div><strong>${html(plan?.name || subscription.plan_code)}</strong><span class="badge ${html(subscription.status)}">${html(subscriptionStatusText(subscription.status))}</span></div>
        <p>Todas as funcionalidades disponíveis para impulsionar sua operação.</p>
        <div class="inline-actions"><button class="secondary-btn" type="button" data-action="scroll-subscription-payment">Gerenciar assinatura</button><button class="secondary-btn" type="button" data-action="scroll-subscription-plans">Alterar plano</button></div>
      </div>
      <div class="subscription-renewal-timeline">
        <article><i></i><span>Renovação automática</span><strong>${renewalAt ? formatDate(renewalAt) : "Não agendada"}</strong></article>
        <article><i></i><span>Método de pagamento</span><strong>${html(paymentMethod)}</strong></article>
        <article><i></i><span>Valor da mensalidade</span><strong>${money.format(subscriptionPrice)} / mês</strong></article>
      </div>
      <div class="subscription-health-visual ${health.level}"><i></i><div><strong>${html(health.label)}</strong><span>${html(health.detail)}</span></div></div>
    </section>
    <section class="subscription-usage-panel panel">
      <div class="panel-head"><div><h3>Resumo do uso</h3><span>Acompanhe o consumo atual dos principais recursos do plano.</span></div></div>
      <div class="subscription-usage-grid">
        <article><span>Usuários</span><strong>${users} / ${userLimit || "-"}</strong><small>${usagePercent(users, userLimit)}% utilizado</small><i style="--usage:${usagePercent(users, userLimit)}%"></i><small>Limite de ${userLimit || "usuários ilimitados"}</small></article>
        <article><span>Vendas importadas</span><strong>${importedSales} / ${salesLimit || "-"}</strong><small>${usagePercent(importedSales, salesLimit)}% utilizado</small><i style="--usage:${usagePercent(importedSales, salesLimit)}%"></i><small>Limite de ${salesLimit || "vendas ilimitadas"} por mês</small></article>
        <article><span>Backup automático</span><strong>${plan?.features?.automatic_backup ? "Ativo" : "Não incluído"}</strong><small>${plan?.features?.automatic_backup ? "Proteção periódica habilitada" : "Disponível em planos superiores"}</small></article>
        <article><span>Marketplaces</span><strong>${connectedMarketplaces.length} ativo${connectedMarketplaces.length === 1 ? "" : "s"}</strong><small>${html(connectedMarketplaces.join(", ") || "Nenhuma conta conectada")}</small></article>
      </div>
    </section>
    <section id="subscriptionPaymentSection" class="subscription-payment-premium panel ${!hasRegisteredPaymentMethod ? "missing-payment" : ""}">
      <div><span>Método de pagamento</span><strong>${html(paymentMethod)}</strong><small>Próxima cobrança: ${subscription.next_payment_at ? formatDateTime(subscription.next_payment_at) : "Não agendada"} • Valor: ${money.format(subscriptionPrice)}</small><small id="subscriptionPaymentMessage" class="form-message"></small></div>
      ${hasRegisteredPaymentMethod ?
           `<div class="subscription-card-actions"><button class="primary-btn" type="button" data-payment-action="update-card">Trocar cartão</button><button class="secondary-btn" type="button" data-payment-action="activate">Adicionar novo cartão</button><button class="secondary-btn" type="button" data-payment-action="reconcile-billing">Atualizar cobrança</button><button class="secondary-btn danger" type="button" data-payment-action="remove-card">Excluir cartão</button></div>`
          : subscriptionPrice > 0 ?
             `<button class="primary-btn" type="button" data-payment-action="activate">Cadastrar forma de pagamento</button>`
            : ""}
    </section>
    ${subscription.pending_plan_code ? `<div class="scheduled-plan-change">
      <strong>Alteração agendada</strong>
      <span>O plano ${html(state.subscriptionPlans.find((item) => item.code === subscription.pending_plan_code)?.name || subscription.pending_plan_code)}
      entrará em vigor em ${formatDateTime(subscription.pending_plan_effective_at)}. Não haverá cobrança antes dessa data.</span>
    </div>` : ""}
    <div class="subscription-metrics subscription-renewal-details">
      ${subscriptionMetric("Próxima cobrança", subscription.next_payment_at ? formatDateTime(subscription.next_payment_at) : "Não agendada")}
      ${subscriptionMetric("Status da renovação", renewalMissed ? "Não renovada" : "Em dia")}
      ${subscriptionMetric("Período de tolerância", grace.detail)}
      ${subscriptionMetric("Método de pagamento", paymentMethod)}
      ${subscriptionMetric("Última tentativa", lastPaymentAttemptAt ? formatDateTime(lastPaymentAttemptAt) : "-")}
      ${subscriptionMetric("Último motivo", paymentDetail)}
    </div>`;
  table.innerHTML = state.subscriptionPayments.length ? state.subscriptionPayments.map((item) => {
    const meta = item.metadata || {};
    const rowCardLastFour = meta.card_last_four || meta.last_four || "";
    const rowCardBrand = meta.card_brand || item.payment_method || "";
    const detail = item.failure_reason || item.status_detail || meta.reason || meta.status_detail || meta.message || meta.provider_status || "-";
    return `<tr><td>${formatDateTime(item.attempted_at || item.paid_at || item.created_at)}</td><td>${money.format(Number(item.amount || 0))}</td><td><span class="badge ${html(item.status)}">${html(paymentStatusText(item.status))}</span></td><td>${html(item.payment_method || item.provider || "-")}</td><td>${rowCardLastFour ? html(`${rowCardBrand ? `${rowCardBrand} ` : ""}final ${rowCardLastFour}`) : "-"}</td><td>${html(detail)}</td></tr>`;
  }).join("") : `<tr><td colspan="6">Nenhuma cobrança registrada.</td></tr>`;
  renderSubscriptionPlanOptions(plan);
  bindActions();
}

function getSubscriptionPrice(plan, subscription = state.subscription) {
  return Number(subscription?.metadata?.custom_price_monthly || plan?.price_monthly || 0);
}

function renderOperationalSummary(viewId, summaryId, metrics) {
  const view = byId(viewId);
  if (!view) return;
  let target = byId(summaryId);
  if (!target) {
    target = document.createElement("section");
    target.id = summaryId;
    target.className = "operational-summary-grid";
    view.prepend(target);
  }
  target.innerHTML = metrics.map(([label, value, note, tone]) => `
    <article class="operational-summary-card ${html(tone || "teal")}">
      <i aria-hidden="true"></i>
      <div><span>${html(label)}</span><strong>${html(String(value))}</strong><small>${html(note || "")}</small></div>
    </article>
  `).join("");
}

function addDays(dateValue, days) {
  if (!dateValue) return null;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time + days * 86400000).toISOString();
}

function subscriptionPaymentApproved(payment) {
  return ["approved", "paid", "authorized"].includes(String(payment?.status || "").toLowerCase());
}

function subscriptionRenewalMissed(subscription, latestPayment) {
  if (!subscription || subscription.plan_code === "free" || String(subscription.status).toLowerCase() === "free") return false;
  const dueAt = subscription.next_payment_at || subscription.current_period_end;
  if (!dueAt) return false;
  const dueTime = new Date(dueAt).getTime();
  return Number.isFinite(dueTime) && dueTime <= Date.now() && !subscriptionPaymentApproved(latestPayment);
}

function getSubscriptionGraceInfo(subscription, latestPayment) {
  if (!subscription || subscription.plan_code === "free" || String(subscription.status).toLowerCase() === "free") {
    return { level: "neutral", detail: "Não aplicável" };
  }
  const renewalAt = subscription.next_payment_at || subscription.current_period_end;
  const graceUntil = subscription.grace_ends_at || addDays(renewalAt, 5);
  const renewalTime = renewalAt ? new Date(renewalAt).getTime() : null;
  const graceTime = graceUntil ? new Date(graceUntil).getTime() : null;
  const now = Date.now();
  if (String(subscription.status).toLowerCase() === "past_due" || (renewalTime && renewalTime <= now && graceTime && graceTime > now && !subscriptionPaymentApproved(latestPayment))) {
    return { level: "warning", detail: `Em tolerância até ${formatDateTime(graceUntil)}` };
  }
  if (renewalTime && graceTime && graceTime <= now && !subscriptionPaymentApproved(latestPayment)) {
    return { level: "danger", detail: `Tolerância encerrada em ${formatDateTime(graceUntil)}` };
  }
  return { level: "success", detail: graceUntil ? `Tolerância prevista até ${formatDateTime(graceUntil)}` : "-" };
}

function renderSubscriptionPlanOptions(currentPlan) {
  const target = byId("subscriptionPlanOptions");
  if (!target) return;
  const currentPrice = Number(currentPlan?.price_monthly || 0);
  const activeUsers = state.activeUsers.length || 1;
  const orderedPlans = state.subscriptionPlans
    .filter((plan) => plan.active !== false)
    .sort((a, b) => Number(a.limits?.users || 0) - Number(b.limits?.users || 0));
  const columns = orderedPlans.map((plan) => {
    const usersLimit = Number(plan.limits?.users || 0);
    const isCurrent = plan.code === currentPlan?.code;
    const isEnterprise = plan.code === "enterprise";
    const isUpgrade = isEnterprise
      || usersLimit > Number(currentPlan?.limits?.users || 0)
      || Number(plan.price_monthly || 0) > currentPrice;
    const blockedUsers = usersLimit > 0 && activeUsers > usersLimit;
    const priceLabel = isEnterprise && !Number(plan.price_monthly) ?
       "Sob consulta"
      : `${money.format(Number(plan.price_monthly || 0))}<small>/mês</small>`;
    const button = isCurrent ?
       `<button class="secondary-btn" type="button" disabled>Plano atual</button>`
      : `<button class="${isUpgrade ? "primary-btn" : "secondary-btn"}" type="button" data-request-plan="${html(plan.code)}">${isEnterprise ? "Falar com vendas" : isUpgrade ? "Solicitar upgrade" : "Solicitar downgrade"}</button>`;
    return { plan, usersLimit, isCurrent, priceLabel, button, blockedUsers };
  });
  const featureCell = (enabled, text = "") => enabled ? `<span class="feature-yes">${text || "✓"}</span>` : `<span class="feature-no">×</span>`;
  target.innerHTML = `
    <div class="plan-comparison-wrap">
      <table class="plan-comparison-table">
        <thead><tr><th>Recurso</th>${columns.map(({ plan, isCurrent, priceLabel }) => `<th class="${isCurrent ? "current" : ""}"><strong>${html(plan.name)}</strong><span>${priceLabel}</span>${isCurrent ? `<small>Atual</small>` : ""}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><th>Usuários</th>${columns.map(({ usersLimit }) => `<td>${usersLimit || "Ilimitado"}</td>`).join("")}</tr>
          <tr><th>Vendas importadas/mês</th>${columns.map(({ plan }) => `<td>${Number(plan.limits?.marketplace_sales_month || 0)}</td>`).join("")}</tr>
          <tr><th>Marketplaces</th>${columns.map(({ plan }) => `<td>${[plan.features?.mercado_livre, plan.features?.shopee, plan.features?.amazon].filter(Boolean).length || "-"}</td>`).join("")}</tr>
          <tr><th>Backup automático</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.automatic_backup)}</td>`).join("")}</tr>
          <tr><th>Relatórios avançados</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.advanced_reports)}</td>`).join("")}</tr>
          <tr><th>White label</th>${columns.map(({ plan }) => `<td>${featureCell(plan.features?.white_label)}</td>`).join("")}</tr>
          <tr class="plan-actions-row"><th></th>${columns.map(({ button, blockedUsers, usersLimit }) => `<td>${button}${blockedUsers ? `<small class="plan-warning">Desative ${activeUsers - usersLimit} usuário(s) ao fim do plano.</small>` : ""}</td>`).join("")}</tr>
        </tbody>
      </table>
    </div>`;
}

async function requestPlanChange(planCode) {
  const targetPlan = state.subscriptionPlans.find((plan) => plan.code === planCode);
  const currentPlan = state.subscriptionPlans.find((plan) => plan.code === state.subscription?.plan_code);
  const isDowngrade = Number(targetPlan?.price_monthly || 0) < Number(currentPlan?.price_monthly || 0);
  if (isDowngrade) {
    openDowngradeDialog(targetPlan);
    return;
  }
  const message = byId("subscriptionChangeMessage");
  message.textContent = "Validando alteração...";
  message.className = "form-message";
  try {
    if (Number(targetPlan?.price_monthly || 0) > 0) {
      message.textContent = "Informe o cartao para ativar o plano.";
      await openPaymentMethodDialog(planCode);
      return;
    }
    const { data, error } = await state.supabase.rpc("request_subscription_plan_change", {
      target_plan_code: planCode,
    });
    if (error) throw error;
    message.textContent = `Solicitação para o plano ${targetPlan?.name || planCode} registrada. A alteração será concluída após a confirmação necessária.`;
    message.className = "form-message success";
    await recordAudit(
      "subscription_plan_change_requested",
      "subscription",
      data?.id || planCode,
      "",
      { plan_code: state.subscription?.plan_code || null },
      { plan_code: planCode },
      "manual",
    );
  } catch (error) {
    message.textContent = error.message || "Não foi possível solicitar a alteração.";
    message.className = "form-message error";
  }
}

function openDowngradeDialog(targetPlan) {
  const dialog = byId("downgradeDialog");
  const targetLimit = Number(targetPlan?.limits?.users || 0);
  const users = state.activeUsers.filter((item) => String(item.email || item.user_email || "").toLowerCase() !== state.activeUserEmail);
  const requiredRemoval = targetLimit > 0 ? Math.max(state.activeUsers.length - targetLimit, 0) : 0;
  byId("downgradeForm").elements.plan_code.value = targetPlan.code;
  byId("downgradeDialogTitle").textContent = `Agendar plano ${targetPlan.name}`;
  const effectiveAt = state.subscription?.current_period_end || state.subscription?.next_payment_at || state.subscription?.trial_end;
  byId("downgradeEffectiveText").textContent = `O plano atual continuará válido até ${effectiveAt ? formatDateTime(effectiveAt) : "o fim do ciclo vigente"}. Nenhuma cobrança será feita agora.`;
  byId("downgradeUsersInstruction").textContent = requiredRemoval ?
     `Selecione pelo menos ${requiredRemoval} usuário(s) para desativar quando o novo plano entrar em vigor.`
    : "Nenhum usuário precisa ser removido para este plano.";
  byId("downgradeUserList").innerHTML = users.length ? users.map((user) => {
    const email = user.email || user.user_email || "";
    return `<label><input type="checkbox" name="deactivate_users" value="${html(email)}" /> <span><strong>${html(user.name || email)}</strong><small>${html(email)}</small></span></label>`;
  }).join("") : `<div class="empty-chart">Nenhum usuário adicional cadastrado.</div>`;
  byId("downgradeMessage").textContent = "";
  dialog.dataset.requiredRemoval = String(requiredRemoval);
  dialog.showModal();
}

async function submitScheduledDowngrade(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const selectedUsers = [...form.querySelectorAll('input[name="deactivate_users"]:checked')].map((input) => input.value);
  const requiredRemoval = Number(byId("downgradeDialog").dataset.requiredRemoval || 0);
  const message = byId("downgradeMessage");
  if (selectedUsers.length < requiredRemoval) {
    message.textContent = `Selecione mais ${requiredRemoval - selectedUsers.length} usuário(s).`;
    return;
  }
  message.textContent = "Agendando alteração...";
  try {
    const result = await callSubscriptionApi({
      action: "schedule-downgrade",
      plan_code: form.elements.plan_code.value,
      deactivate_users: selectedUsers,
    });
    message.textContent = `Downgrade agendado para ${formatDateTime(result.effective_at)}.`;
    message.className = "form-message success";
    await loadRemoteData();
    setTimeout(() => byId("downgradeDialog").close(), 800);
  } catch (error) {
    message.textContent = error.message || "Não foi possível agendar o downgrade.";
    message.className = "form-message error";
  }
}

async function handlePaymentAction(action) {
  const message = byId("subscriptionPaymentMessage");
  const button = document.querySelector(`[data-payment-action="${action}"]`);
  if (message) {
    message.textContent = "Abrindo ambiente seguro do Mercado Pago...";
    message.className = "form-message";
  }
  if (button) button.disabled = true;
  try {
    if (action === "activate" || action === "update-card") {
      await openPaymentMethodDialog();
      return;
    }
    if (action === "remove-card") {
      const confirmed = await showAppConfirm(
        "Remover forma de pagamento",
        "O cartão será removido do FlowOps e a renovação automática ficará pausada até cadastrar uma nova forma de pagamento. Deseja continuar?"
      );
      if (!confirmed) return;
      await callSubscriptionApi({ action: "remove-payment-method" });
      if (message) {
        message.textContent = "Cartão removido. Cadastre uma nova forma de pagamento antes da próxima renovação.";
        message.className = "form-message success";
      }
      await loadRemoteData();
      return;
    }
    if (action === "reconcile-billing") {
      const result = await callSubscriptionApi({ action: "reconcile-billing" });
      if (message) {
        message.textContent = result.message || "Cobrança verificada no Mercado Pago.";
        message.className = "form-message success";
      }
      flashActionMessage("Cobrança e assinatura atualizadas.");
      await loadRemoteData();
      return;
    }
  } catch (error) {
    if (byId("paymentMethodDialog")?.open) {
      await showPaymentCheckoutFallback(error.message || "Nao foi possivel abrir o Mercado Pago.");
    }
    if (message) {
      message.textContent = error.message || "Nao foi possivel abrir o Mercado Pago.";
      message.className = "form-message error";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function callSubscriptionApi(payload) {
  const { data: sessionData } = await state.supabase.auth.getSession();
  const response = await fetch(window.SUPABASE_CONFIG.MERCADO_PAGO_SUBSCRIPTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      apikey: window.SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(normalizeApiError(result.error, "Falha ao processar a assinatura."));
  return result;
}

async function openPaymentMethodDialog(planCode = "") {
  const dialog = byId("paymentMethodDialog");
  const message = byId("paymentMethodMessage");
  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
  const brickContainer = byId("cardPaymentBrick_container");
  if (brickContainer) brickContainer.innerHTML = `<div class="payment-loading">Preparando formulário seguro do Mercado Pago...</div>`;
  if (!dialog.open) dialog.showModal();
  try {
    await loadMercadoPagoSdk();
    if (window.cardPaymentBrickController) {
      window.cardPaymentBrickController.unmount?.().catch(() => null);
      window.cardPaymentBrickController = null;
    }
    const mp = new window.MercadoPago(window.SUPABASE_CONFIG.MERCADO_PAGO_PUBLIC_KEY, { locale: "pt-BR" });
    const plan = state.subscriptionPlans.find((item) => item.code === (planCode || state.subscription?.plan_code));
    if (!brickContainer) throw new Error("Area de pagamento nao encontrada.");
    brickContainer.innerHTML = `
      <form id="mpCardForm" class="mp-card-form">
        <div class="mp-card-form-grid">
          <label class="mp-field mp-field-wide">
            <span>Número do cartão</span>
            <input id="form-checkout__cardNumber" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" required>
          </label>
          <label class="mp-field">
            <span>Validade</span>
            <input id="form-checkout__expirationDate" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" required>
          </label>
          <label class="mp-field">
            <span>CVV</span>
            <input id="form-checkout__securityCode" type="text" inputmode="numeric" autocomplete="cc-csc" placeholder="CVV" required>
          </label>
          <label class="mp-field mp-field-wide">
            <span>Nome no cartão</span>
            <input id="form-checkout__cardholderName" type="text" autocomplete="cc-name" required>
          </label>
          <label class="mp-field">
            <span>Documento</span>
            <select id="form-checkout__identificationType"></select>
          </label>
          <label class="mp-field">
            <span>Número do documento</span>
            <input id="form-checkout__identificationNumber" type="text" inputmode="numeric" required>
          </label>
          <label class="mp-field mp-field-wide">
            <span>E-mail</span>
            <input id="form-checkout__cardholderEmail" type="email" value="${html(state.currentUserEmail || "")}" autocomplete="email" required>
          </label>
        </div>
        <select id="form-checkout__issuer" class="sr-only" aria-hidden="true"></select>
        <select id="form-checkout__installments" class="sr-only" aria-hidden="true"></select>
        <button id="mpCardFormSubmit" class="primary-btn" type="submit">Cadastrar cartão</button>
      </form>
    `;
    let paymentSubmitting = false;
    const cardForm = mp.cardForm({
      amount: String(Math.max(getSubscriptionPrice(plan), 1)),
      iframe: false,
      form: {
        id: "mpCardForm",
        cardNumber: { id: "form-checkout__cardNumber", placeholder: "0000 0000 0000 0000" },
        expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/AA" },
        securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
        cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nome impresso no cartão" },
        issuer: { id: "form-checkout__issuer", placeholder: "Banco emissor" },
        installments: { id: "form-checkout__installments", placeholder: "Parcelas" },
        identificationType: { id: "form-checkout__identificationType", placeholder: "Tipo" },
        identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "Numero" },
        cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "email@empresa.com" },
      },
      callbacks: {
        onFormMounted: (error) => {
          if (error) throw error;
          const readyMessage = byId("paymentMethodMessage");
          if (readyMessage) {
            readyMessage.textContent = "";
            readyMessage.className = "form-message";
          }
        },
        onSubmit: async (event) => {
          event.preventDefault();
          if (paymentSubmitting) return;
          paymentSubmitting = true;
          const submit = byId("mpCardFormSubmit");
          try {
            if (submit) {
              submit.disabled = true;
              submit.textContent = "Cadastrando cartão...";
            }
            const target = byId("paymentMethodMessage");
            if (target) {
              target.textContent = "Validando cartão com o Mercado Pago...";
              target.className = "form-message";
            }
            normalizeMercadoPagoCardFields();
            const formData = cardForm.getCardFormData();
            if (!formData?.token) throw new Error("Não foi possível validar os dados do cartão.");
            const cardDigits = String(byId("form-checkout__cardNumber")?.value || "").replace(/\D/g, "");
            await callSubscriptionApi({
              action: "update-payment-method",
              card_token_id: formData.token,
              card_last_four: cardDigits.slice(-4),
              card_brand: formData.paymentMethodId || "",
              plan_code: planCode || state.subscription?.plan_code || ""
            });
            const success = byId("paymentMethodMessage");
            if (success) {
              success.textContent = planCode ?
                 "Plano e cartão cadastrados com sucesso."
                : "Cartão cadastrado para as próximas cobranças.";
              success.className = "form-message success";
            }
            await loadRemoteData();
            setTimeout(closePaymentMethodDialog, 800);
          } catch (error) {
            const target = byId("paymentMethodMessage");
            if (target) {
              const raw = error.message || "Nao foi possivel cadastrar o cartao.";
              target.textContent = paymentErrorMessage(raw);
              target.className = "form-message error";
            }
            await refreshPaymentCardFormAfterError(planCode);
          }
        },
        onFetching: () => {
          const target = byId("paymentMethodMessage");
          if (target) {
            target.textContent = "Consultando dados seguros do Mercado Pago...";
            target.className = "form-message";
          }
        },
        onValidityChange: () => {
          const target = byId("paymentMethodMessage");
          if (target?.classList.contains("error")) {
            target.textContent = "";
            target.className = "form-message";
          }
        },
        onError: (error) => {
          const target = byId("paymentMethodMessage");
          if (target) {
            target.textContent = normalizeApiError(error, "Nao foi possivel carregar o formulario.");
            target.className = "form-message error";
          }
        },
      },
    });
    window.cardPaymentBrickController = { unmount: () => Promise.resolve(cardForm?.unmount?.()) };
  } catch (error) {
    showPaymentCheckoutFallback(error.message || "Nao foi possivel carregar o formulario do Mercado Pago.", planCode);
  }
}

function normalizeMercadoPagoCardFields() {
  const expiration = byId("form-checkout__expirationDate");
  if (!expiration) return;
  const digits = String(expiration.value || "").replace(/\D/g, "");
  if (digits.length >= 6) {
    expiration.value = `${digits.slice(0, 2)}/${digits.slice(-2)}`;
  } else if (digits.length === 4) {
    expiration.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
}

function paymentErrorMessage(raw) {
  const text = String(raw || "");
  if (text.includes("without cvv validation")) {
    return "Nao foi possivel validar o CVV. Confira o codigo de seguranca e tente novamente.";
  }
  if (text.toLowerCase().includes("card token was used")) {
    return "O Mercado Pago recusou esta tentativa por seguranca. Gere um novo token preenchendo o formulario novamente.";
  }
  return text || "Nao foi possivel cadastrar o cartao.";
}

async function refreshPaymentCardFormAfterError(planCode = "") {
  const brickContainer = byId("cardPaymentBrick_container");
  const message = byId("paymentMethodMessage");
  if (!brickContainer) return;
  const controller = window.cardPaymentBrickController;
  window.cardPaymentBrickController = null;
  if (controller) await controller.unmount?.().catch(() => null);
  if (message) {
    message.textContent = "Por seguranca, preencha os dados novamente para gerar um novo token.";
    message.className = "form-message error";
  }
  setTimeout(() => openPaymentMethodDialog(planCode), 900);
}

function showPaymentCheckoutFallback(reason, planCode = "") {
  const message = byId("paymentMethodMessage");
  const brickContainer = byId("cardPaymentBrick_container");
  if (window.cardPaymentBrickController) {
    window.cardPaymentBrickController.unmount().catch(() => null);
    window.cardPaymentBrickController = null;
  }
  if (message) {
    message.textContent = reason;
    message.className = "form-message error";
  }
  if (!brickContainer) return;
  brickContainer.innerHTML = `
    <div class="payment-fallback">
      <strong>Nao foi possivel carregar o formulario agora.</strong>
      <span>Verifique a conexao e tente novamente. O pagamento permanece dentro do FlowOps pelo Mercado Pago.</span>
      <button class="primary-btn" type="button" id="retryMercadoPagoBrickBtn">Tentar novamente</button>
    </div>
  `;
  byId("retryMercadoPagoBrickBtn")?.addEventListener("click", () => openPaymentMethodDialog(planCode));
}
function closePaymentMethodDialog() {
  const dialog = byId("paymentMethodDialog");
  if (dialog?.open) dialog.close();
  const brickContainer = byId("cardPaymentBrick_container");
  if (brickContainer) brickContainer.innerHTML = "";
  const message = byId("paymentMethodMessage");
  if (message) {
    message.textContent = "";
    message.className = "form-message";
  }
  const controller = window.cardPaymentBrickController;
  window.cardPaymentBrickController = null;
  if (controller) {
    setTimeout(() => controller.unmount?.().catch(() => null), 0);
  }
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => reject(new Error("O Mercado Pago demorou para responder.")), 8000);
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Nao foi possivel carregar o Mercado Pago."));
    };
    document.head.appendChild(script);
  });
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

function normalizeApiError(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.message || value.error || value.cause?.[0]?.description || fallback;
}

function subscriptionMetric(label, value) {
  return `<article><span>${html(label)}</span><strong>${html(String(value))}</strong></article>`;
}

function getCompanyHealth() {
  const mlConnected = state.marketplaceAccounts.some((item) => item.marketplace === "Mercado Livre");
  const backupOk = state.backupRuns.some((item) => item.status === "success");
  const subscriptionOk = ["active", "trial", "free"].includes(state.subscription?.status);
  const score = [mlConnected, backupOk, subscriptionOk].filter(Boolean).length;
  if (score === 3) return { level: "healthy", label: "Saudável", detail: "Integração, backup e assinatura em ordem." };
  if (score >= 2) return { level: "attention", label: "Atenção", detail: "Existe uma configuração importante pendente." };
  return { level: "risk", label: "Em risco", detail: "Revise assinatura, integração e backup." };
}

async function submitSupportTicket(event) {
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

function renderSupportPortal() {
  const target = byId("supportTicketsList");
  if (!target) return;
  target.innerHTML = state.supportTickets.length ? state.supportTickets.map((ticket) => `
    <article class="list-row support-ticket">
      <div><strong>${html(ticket.subject)}</strong><span>${html(ticket.category)} • ${formatDateTime(ticket.created_at)}</span><p>${html(ticket.message)}</p>${ticket.admin_response ? `<div class="support-response"><strong>Resposta do suporte</strong><p>${html(ticket.admin_response)}</p></div>` : ""}</div>
      <span class="badge ${ticket.status === "Fechado" ? "done" : ticket.priority === "Urgente" ? "danger-badge" : "queue"}">${html(ticket.status)}</span>
    </article>
  `).join("") : `<div class="empty-chart">Nenhum chamado enviado.</div>`;
}

function renderWhatsNew() {
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

function subscriptionStatusText(value) {
  return ({ free: "Gratuito", trial: "Em teste", pending: "Aguardando pagamento", active: "Ativo", past_due: "Pagamento pendente", paused: "Pausado", cancelled: "Cancelado", suspended: "Suspenso" })[value] || value || "-";
}

function paymentStatusText(value) {
  return ({ approved: "Aprovado", pending: "Pendente", rejected: "Recusado", refunded: "Estornado", cancelled: "Cancelado" })[value] || value || "-";
}






