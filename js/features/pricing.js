import { state, money } from "../core/state.js";
import { byId, html, flashActionMessage, number, showAppMessage } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { recordAudit } from "./logs.js";
import { getOrderMarketplaceChannel } from "./orders.js";
import {
  normalizeMarketplaceChannel, marketplaceDisplayName, renderMarketplaces, loadMarketplaces,
  marketplaceRequest, resizeImageFileForStorefront,
} from "./marketplace.js";

const CREATABLE_MARKETPLACES = ["mercado-livre", "shopee", "amazon", "tiktok-shop"];
let productUploadedImages = [];

const DEFAULT_FINANCIAL_SETTINGS = {
  marketplace_fee_rules: {
    mercado_livre: { classic: 12, premium: 16 },
    shopee: { default: 14 },
    amazon: { default: 15 },
    direct: { default: 0 },
  },
  default_tax_pct: 6,
  default_shipping_cost: 0,
  default_packaging_cost: 0,
  profitability_thresholds: { critical: 0, attention: 10, healthy: 20, excellent: 35 },
  category_prefixes: {},
};

export function getFinancialSettings() {
  return state.financialSettings || DEFAULT_FINANCIAL_SETTINGS;
}

export function hasCommercialIntelligenceAccess() {
  const plan = state.subscriptionPlans.find((item) => item.code === state.subscription?.plan_code);
  return Boolean(plan?.features?.commercial_intelligence);
}

// --- Classificacao de rentabilidade (configuravel via financial_settings) ---

export function getProfitabilityLevel(marginPct) {
  const thresholds = getFinancialSettings().profitability_thresholds;
  if (marginPct < thresholds.critical) return { key: "loss", label: "Prejuízo", className: "danger-badge" };
  if (marginPct < thresholds.attention) return { key: "critical", label: "Crítico", className: "danger-badge" };
  if (marginPct < thresholds.healthy) return { key: "attention", label: "Atenção", className: "queue" };
  if (marginPct < thresholds.excellent) return { key: "healthy", label: "Saudável", className: "done" };
  return { key: "excellent", label: "Excelente", className: "done" };
}

// --- Catalogo de produtos + SKU automatico ---

export function deriveSkuCode(name) {
  const clean = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, 4) || "PROD";
}

export function categoryPrefix(category) {
  const settings = getFinancialSettings();
  const key = String(category || "").trim();
  const configured = settings.category_prefixes?.[key];
  if (configured) return String(configured).toUpperCase();
  const clean = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, 3) || "GER";
}

export function nextProductSku(category, name) {
  const prefix = categoryPrefix(category);
  const code = deriveSkuCode(name);
  const base = `${prefix}-${code}`;
  const pattern = new RegExp(`^${base}-(\\d+)$`);
  const max = state.products.reduce((value, item) => {
    const match = String(item.sku || "").match(pattern);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `${base}-${String(max + 1).padStart(4, "0")}`;
}

export function getProductForListing(marketplace, externalId) {
  const link = state.productListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
  return link ? state.products.find((item) => item.id === link.product_id) || null : null;
}

export function getProductForOrder(order) {
  if (order.productId) {
    const direct = state.products.find((item) => item.id === order.productId);
    if (direct) return direct;
  }
  const link = state.marketplaceSales.find((sale) => sale.internal_order_id === order.id);
  if (!link) return null;
  const externalItemId = link.raw_payload?.order_items?.[0]?.item?.id || link.external_order_id;
  return getProductForListing(link.marketplace, externalItemId);
}

export function renderProductCatalogTable() {
  const target = byId("productCatalogTable");
  if (!target) return;
  const search = (state.productSearch || "").toLowerCase();
  const rows = state.products
    .filter((item) => !search || `${item.name} ${item.sku} ${item.category || ""}`.toLowerCase().includes(search))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
  target.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td><strong>${html(item.sku)}</strong></td>
      <td>${html(item.name)}</td>
      <td>${html(item.category || "-")}</td>
      <td>${money.format(Number(item.cost_price || 0))}</td>
      <td>
        ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-product" data-id="${html(item.id)}">Editar</button>
        <button class="icon-btn danger" type="button" data-action="delete-product" data-id="${html(item.id)}">Excluir</button>` : "-"}
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5">Nenhum produto cadastrado.</td></tr>`;
  bindActions();
}

const MARKETPLACE_CHECKBOX_NAMES = {
  "mercado-livre": "publish_ml",
  shopee: "publish_shopee",
  amazon: "publish_amazon",
  "tiktok-shop": "publish_tiktok",
};

export function isMarketplaceAccountConnected(channel) {
  return state.marketplaceAccounts.some((item) => normalizeMarketplaceChannel(item.marketplace) === channel);
}

export function openProductQuickDialog(productId = "") {
  const product = state.products.find((item) => item.id === productId) || null;
  const form = byId("productForm");
  form.reset();
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.category.value = product?.category || "";
  form.elements.costPrice.value = product?.cost_price ?? "";
  form.elements.notes.value = product?.notes || "";
  form.elements.sku.value = product?.sku || "";
  form.dataset.skuTouched = product ? "true" : "false";
  productUploadedImages = [];
  byId("productImageStatus").textContent = "Selecionar, arrastar ou soltar imagens aqui";

  const linkedListing = product ? state.productListings.find((item) => item.product_id === product.id) : null;
  const linkedListingData = linkedListing
    ? state.marketplaceListings.find((item) => item.marketplace === linkedListing.marketplace && item.external_id === linkedListing.external_id)
    : null;
  form.elements.price.value = linkedListingData ? Number(linkedListingData.price || 0) : "";
  form.elements.stock.value = linkedListingData ? Number(linkedListingData.raw_payload?.available_quantity || 1) : 1;
  form.elements.mlCategoryId.value = linkedListingData?.raw_payload?.category_id || "";

  renderProductListingOptions(product);
  updateProductMarketplaceStatusHints();
  renderProductProfitPreview();
  byId("productDialogTitle").textContent = product ? `Editar produto - ${product.sku}` : "Cadastrar produto";
  byId("productFormMessage").textContent = "";
  byId("productDialog").showModal();
}

export function updateProductMarketplaceStatusHints() {
  const form = byId("productForm");
  if (!form) return;
  CREATABLE_MARKETPLACES.forEach((channel) => {
    const hint = form.querySelector(`[data-marketplace-status="${channel}"]`);
    if (!hint) return;
    if (channel === "mercado-livre" && isMarketplaceAccountConnected(channel)) {
      hint.textContent = "(conectado)";
    } else {
      hint.textContent = "(ainda não disponível para criação automática)";
    }
  });
  byId("productMlCategoryField").hidden = !form.elements.publish_ml.checked;
}

export function bindProductMarketplaceCheckboxes() {
  const form = byId("productForm");
  if (!form) return;
  form.elements.publish_ml.addEventListener("change", () => {
    byId("productMlCategoryField").hidden = !form.elements.publish_ml.checked;
  });
}

export function bindProductImageInputs() {
  const dropzone = byId("productImageDropzone");
  const input = byId("productImageFiles");
  if (!dropzone || !input) return;
  input.addEventListener("change", async () => {
    await addProductImageFiles(input.files);
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
    await addProductImageFiles(event.dataTransfer?.files || []);
  });
}

async function addProductImageFiles(files) {
  const status = byId("productImageStatus");
  const list = Array.from(files || []).filter((file) => file.type?.startsWith("image/"));
  if (!list.length) return;
  status.textContent = "Preparando imagens...";
  const images = await Promise.all(list.slice(0, 8).map(resizeImageFileForStorefront));
  productUploadedImages = [...productUploadedImages, ...images].slice(0, 8);
  status.textContent = `${productUploadedImages.length} imagem(ns) pronta(s) para salvar.`;
  renderProductProfitPreview();
}

// Previa de custos/lucro no proprio cadastro rapido - reaproveita a mesma
// matematica usada na rentabilidade de anuncios/vendas (computeMarginBreakdown).
// Recurso de analise: so aparece para planos com acesso a Inteligencia Comercial.
export function renderProductProfitPreview() {
  const target = byId("productProfitPreview");
  if (!target) return;
  if (!hasCommercialIntelligenceAccess()) {
    target.innerHTML = `<div class="premium-upsell compact"><strong>Cálculo de custos e lucro é um recurso premium</strong><span>Disponível nos planos pagos.</span><button class="secondary-btn" type="button" data-action="open-subscription">Ver planos</button></div>`;
    bindActions();
    return;
  }
  const form = byId("productForm");
  if (!form) return;
  const data = new FormData(form);
  const cost = number(data.get("costPrice"));
  const price = number(data.get("price"));
  const settings = getFinancialSettings();
  const checkedChannels = CREATABLE_MARKETPLACES.filter((channel) => form.elements[MARKETPLACE_CHECKBOX_NAMES[channel]]?.checked);
  const previewChannels = checkedChannels.length ? checkedChannels : ["direct"];
  target.innerHTML = previewChannels.map((channel) => {
    const feePct = resolveChannelFeePct(channel, "classic");
    const breakdown = computeMarginBreakdown({
      cost, revenue: price, feePct, taxPct: settings.default_tax_pct,
      shipping: settings.default_shipping_cost, packaging: settings.default_packaging_cost,
    });
    const label = channel === "direct" ? "Venda direta (estimativa)" : marketplaceDisplayName(channel);
    return `
      <article class="profit-preview-card">
        <div class="profit-preview-head"><strong>${html(label)}</strong><span class="badge ${breakdown.level.className}">${html(breakdown.level.label)}</span></div>
        <dl class="profit-preview-rows">
          <div><dt>Preço de venda</dt><dd>${money.format(breakdown.revenue)}</dd></div>
          <div><dt>Custo do produto</dt><dd>-${money.format(breakdown.cost)}</dd></div>
          <div><dt>Taxa do marketplace (${feePct}%)</dt><dd>-${money.format(breakdown.feeAmount)}</dd></div>
          <div><dt>Imposto (${breakdown.taxPct}%)</dt><dd>-${money.format(breakdown.taxAmount)}</dd></div>
          <div><dt>Frete + embalagem</dt><dd>-${money.format(breakdown.shipping + breakdown.packaging)}</dd></div>
          <div class="profit-preview-total"><dt>Sobra líquida estimada</dt><dd>${money.format(breakdown.netProfit)} (${breakdown.marginPct.toFixed(1)}%)</dd></div>
        </dl>
      </article>
    `;
  }).join("");
}

export function bindProductProfitPreview() {
  const form = byId("productForm");
  if (!form) return;
  form.addEventListener("input", renderProductProfitPreview);
  form.addEventListener("change", renderProductProfitPreview);
}

export function renderProductListingOptions(product) {
  const select = byId("productForm")?.elements.listingLink;
  if (!select) return;
  const linkedListing = product ? state.productListings.find((item) => item.product_id === product.id) : null;
  const linkedValue = linkedListing ? `${linkedListing.marketplace}:${linkedListing.external_id}` : "";
  select.innerHTML = `<option value="">Nenhum anúncio vinculado</option>` + state.marketplaceListings.map((item) => {
    const value = `${item.marketplace}:${item.external_id}`;
    const linkedElsewhere = state.productListings.some((link) =>
      link.marketplace === item.marketplace && link.external_id === item.external_id && link.product_id !== product?.id
    );
    return `<option value="${html(value)}" ${linkedElsewhere ? "disabled" : ""}>${html(item.title)} (${html(marketplaceDisplayName(item.marketplace))})${linkedElsewhere ? " - já vinculado" : ""}</option>`;
  }).join("");
  select.value = linkedValue;
}

export function bindProductFormAutoSku() {
  const form = byId("productForm");
  if (!form) return;
  form.elements.sku.addEventListener("input", () => {
    form.dataset.skuTouched = "true";
  });
  const refresh = () => {
    if (form.dataset.skuTouched === "true" || form.elements.id.value) return;
    form.elements.sku.value = nextProductSku(form.elements.category.value, form.elements.name.value);
  };
  form.elements.name.addEventListener("input", refresh);
  form.elements.category.addEventListener("input", refresh);
}

export async function saveProduct(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = event.currentTarget;
  const message = byId("productFormMessage");
  const data = new FormData(form);
  const id = String(data.get("id") || "");
  const previous = state.products.find((item) => item.id === id) || null;
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  const category = String(data.get("category") || "").trim() || null;
  const sku = String(data.get("sku") || "").trim() || nextProductSku(category, name);
  const price = number(data.get("price"));
  const stock = Math.max(Number(data.get("stock") || 1), 0);
  const payload = {
    organization_id: state.organizationId,
    sku,
    name,
    category,
    cost_price: number(data.get("costPrice")),
    notes: String(data.get("notes") || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (id) payload.id = id;
  message.textContent = "Salvando produto...";
  const { data: saved, error } = await state.supabase.from("products").upsert(payload).select().single();
  if (error) {
    message.textContent = `Não foi possível salvar o produto: ${error.message}`;
    return;
  }
  const index = state.products.findIndex((item) => item.id === saved.id);
  if (index >= 0) state.products[index] = saved;
  else state.products.push(saved);
  await recordAudit(previous ? "update" : "create", "product", saved.id, saved.sku, previous, saved, "manual");

  const listingValue = String(data.get("listingLink") || "");
  if (listingValue) {
    await syncProductListingLink(saved.id, listingValue);
    byId("productDialog").close();
    flashActionMessage("Produto salvo e vinculado ao anúncio selecionado.");
    renderProductCatalogTable();
    renderMarketplaces();
    return;
  }

  const selectedChannels = CREATABLE_MARKETPLACES.filter((channel) => Boolean(data.get(MARKETPLACE_CHECKBOX_NAMES[channel])));
  if (!selectedChannels.length) {
    byId("productDialog").close();
    flashActionMessage("Produto salvo no catálogo.");
    renderProductCatalogTable();
    return;
  }

  const results = [];
  for (const channel of selectedChannels) {
    const alreadyLinked = state.productListings.some((link) =>
      link.product_id === saved.id && normalizeMarketplaceChannel(link.marketplace) === channel
    );
    if (alreadyLinked) {
      results.push(`${marketplaceDisplayName(channel)}: já publicado anteriormente.`);
      continue;
    }
    if (channel !== "mercado-livre") {
      results.push(`${marketplaceDisplayName(channel)}: integração ainda não disponível para criação automática. Cadastre manualmente por enquanto.`);
      continue;
    }
    if (!isMarketplaceAccountConnected(channel)) {
      results.push("Mercado Livre: conta não conectada. Conecte em Integrações antes de publicar.");
      continue;
    }
    const mlCategoryId = String(data.get("mlCategoryId") || "").trim();
    if (!mlCategoryId) {
      results.push("Mercado Livre: informe o ID da categoria do Mercado Livre para publicar.");
      continue;
    }
    try {
      const created = await marketplaceRequest("https://djvrhvzjvnyensbobtby.functions.supabase.co/marketplace-sync?marketplace=ml&action=create-listing", {
        method: "POST",
        body: JSON.stringify({
          title: name,
          price,
          available_quantity: stock,
          category_id: mlCategoryId,
          listing_type_id: "gold_special",
          condition: "new",
          warranty: "Sem garantia",
          sku,
          pictures: productUploadedImages,
          description: name,
          attributes: [],
        }),
      });
      const { data: link, error: linkError } = await state.supabase.from("product_listings").insert({
        organization_id: state.organizationId,
        product_id: saved.id,
        marketplace: "Mercado Livre",
        external_id: created.item?.id || "",
      }).select().single();
      if (!linkError && link) state.productListings.push(link);
      results.push("Mercado Livre: anúncio criado com sucesso.");
    } catch (creationError) {
      results.push(`Mercado Livre: falha ao publicar (${creationError.message}).`);
    }
  }

  await loadMarketplaces();
  renderProductCatalogTable();
  renderMarketplaces();
  byId("productDialog").close();
  showAppMessage("Produto salvo", results.join(" "), results.some((line) => line.includes("sucesso")) ? "success" : "info");
}

async function syncProductListingLink(productId, listingValue) {
  const existing = state.productListings.find((item) => item.product_id === productId);
  if (existing) {
    await state.supabase.from("product_listings").delete().eq("id", existing.id);
    state.productListings = state.productListings.filter((item) => item.id !== existing.id);
  }
  if (!listingValue) return;
  const [marketplace, ...idParts] = listingValue.split(":");
  const externalId = idParts.join(":");
  const { data, error } = await state.supabase.from("product_listings").insert({
    organization_id: state.organizationId,
    product_id: productId,
    marketplace,
    external_id: externalId,
  }).select().single();
  if (!error && data) state.productListings.push(data);
}

export async function deleteProduct(id) {
  if (!ensureCanEdit()) return;
  const product = state.products.find((item) => item.id === id);
  if (!product || !confirm(`Excluir o produto ${product.name}?`)) return;
  const { error } = await state.supabase.from("products").delete().eq("id", id);
  if (error) {
    alert(`Não foi possível excluir: ${error.message}`);
    return;
  }
  state.products = state.products.filter((item) => item.id !== id);
  state.productListings = state.productListings.filter((item) => item.product_id !== id);
  await recordAudit("delete", "product", id, product.sku, product, null, "manual");
  renderProductCatalogTable();
  renderMarketplaces();
}

export function renderOrderProductOptions() {
  const select = document.querySelector('#orderForm select[name="productId"]');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Sem produto vinculado</option>` + state.products
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"))
    .map((item) => `<option value="${html(item.id)}">${html(item.sku)} - ${html(item.name)}</option>`)
    .join("");
  select.value = current;
}

// --- Resolucao de taxas por marketplace/tipo de anuncio ---

export function classifyMlListingType(payload) {
  const type = String(payload?.listing_type_id || "").toLowerCase();
  return type.includes("premium") || type.includes("pro") ? "premium" : "classic";
}

export function resolveChannelFeePct(channel, tier = "classic") {
  const rules = getFinancialSettings().marketplace_fee_rules;
  if (channel === "mercado-livre") return Number(rules.mercado_livre?.[tier] ?? rules.mercado_livre?.classic ?? 12);
  if (channel === "shopee") return Number(rules.shopee?.default ?? 14);
  if (channel === "amazon") return Number(rules.amazon?.default ?? 15);
  return Number(rules.direct?.default ?? 0);
}

export function resolveListingFeePct(listing) {
  const channel = normalizeMarketplaceChannel(listing.marketplace);
  const tier = channel === "mercado-livre" ? classifyMlListingType(listing.raw_payload || {}) : "classic";
  return resolveChannelFeePct(channel, tier);
}

// Matematica de margem compartilhada entre anuncios, vendas reais e a previa do cadastro de produto.
export function computeMarginBreakdown({ cost, revenue, feePct = 0, taxPct = 0, shipping = 0, packaging = 0 }) {
  const normalizedCost = Number(cost || 0);
  const normalizedRevenue = Number(revenue || 0);
  if (normalizedRevenue <= 0) {
    return {
      revenue: 0, cost: normalizedCost, feePct, feeAmount: 0, taxPct, taxAmount: 0, shipping, packaging,
      netProfit: -normalizedCost, marginPct: 0, level: getProfitabilityLevel(0),
    };
  }
  const feeAmount = normalizedRevenue * (feePct / 100);
  const taxAmount = normalizedRevenue * (taxPct / 100);
  const netProfit = normalizedRevenue - normalizedCost - feeAmount - taxAmount - shipping - packaging;
  const marginPct = (netProfit / normalizedRevenue) * 100;
  return {
    revenue: normalizedRevenue, cost: normalizedCost, feePct, feeAmount, taxPct, taxAmount, shipping, packaging,
    netProfit, marginPct, level: getProfitabilityLevel(marginPct),
  };
}

export function resolveOrderFeeInfo(order) {
  const channel = getOrderMarketplaceChannel(order);
  const rules = getFinancialSettings().marketplace_fee_rules;
  if (channel === "direct") return { pct: Number(rules.direct?.default ?? 0), real: false };
  const link = state.marketplaceSales.find((sale) => sale.internal_order_id === order.id);
  const items = link?.raw_payload?.order_items || [];
  const realFee = items.reduce((total, item) => total + Number(item.sale_fee || 0), 0);
  if (realFee > 0) {
    const amount = Number(link.raw_payload?.total_amount
      || items.reduce((total, item) => total + Number(item.unit_price || 0) * Number(item.quantity || 1), 0));
    return { pct: amount > 0 ? (realFee / amount) * 100 : 0, real: true, feeAmount: realFee };
  }
  if (channel === "mercado-livre") return { pct: Number(rules.mercado_livre?.classic ?? 12), real: false };
  const key = channel === "shopee" ? "shopee" : "amazon";
  return { pct: Number(rules[key]?.default ?? 0), real: false };
}

// --- Rentabilidade (por anuncio e por venda real) ---

export function getListingProfitability(listing) {
  const product = getProductForListing(listing.marketplace, listing.external_id);
  if (!product) return { hasCost: false };
  const settings = getFinancialSettings();
  const breakdown = computeMarginBreakdown({
    cost: product.cost_price,
    revenue: listing.price,
    feePct: resolveListingFeePct(listing),
    taxPct: settings.default_tax_pct,
    shipping: settings.default_shipping_cost,
    packaging: settings.default_packaging_cost,
  });
  return { hasCost: true, product, ...breakdown };
}

export function getOrderProfitability(order) {
  const product = getProductForOrder(order);
  if (!product) return { hasCost: false };
  const settings = getFinancialSettings();
  const feeInfo = resolveOrderFeeInfo(order);
  const cost = Number(product.cost_price || 0) * Number(order.quantity || 1);
  const revenue = Number(order.received || order.charged || 0);
  const breakdown = computeMarginBreakdown({
    cost,
    revenue,
    feePct: feeInfo.feeAmount != null && revenue > 0 ? (feeInfo.feeAmount / revenue) * 100 : feeInfo.pct,
    taxPct: settings.default_tax_pct,
    shipping: settings.default_shipping_cost,
    packaging: settings.default_packaging_cost,
  });
  return { hasCost: true, product, ...breakdown, real: feeInfo.real };
}

export function renderProfitabilityBadge(listing) {
  if (!hasCommercialIntelligenceAccess()) return "";
  const profitability = getListingProfitability(listing);
  if (!profitability.hasCost) return `<span class="badge neutral" title="Cadastre o custo deste produto para ver a rentabilidade">Sem custo</span>`;
  return `<span class="badge ${profitability.level.className}" title="Margem estimada: ${profitability.marginPct.toFixed(1)}%">${html(profitability.level.label)}</span>`;
}

export function getProfitabilitySummary() {
  const counts = { loss: 0, critical: 0, attention: 0, healthy: 0, excellent: 0, noCost: 0 };
  state.marketplaceListings.forEach((listing) => {
    const profitability = getListingProfitability(listing);
    if (!profitability.hasCost) {
      counts.noCost++;
      return;
    }
    counts[profitability.level.key]++;
  });
  return counts;
}

// Cobertura de custos cadastrados - decide se mostramos o painel completo
// de rentabilidade ou o guia de cadastro em lote (renderCommercialIntelligence).
export function getCostCoverage() {
  const total = state.marketplaceListings.length;
  const withCost = state.marketplaceListings.filter((listing) => getListingProfitability(listing).hasCost).length;
  const pct = total ? Math.round((withCost / total) * 100) : 0;
  return { total, withCost, pct };
}

export function getProfitPotential() {
  const settings = getFinancialSettings();
  let currentProfit = 0;
  let potentialProfit = 0;
  let itemsBelowHealthy = 0;
  state.marketplaceListings.forEach((listing) => {
    const profitability = getListingProfitability(listing);
    if (!profitability.hasCost) return;
    currentProfit += profitability.netProfit;
    if (["loss", "critical", "attention"].includes(profitability.level.key)) {
      itemsBelowHealthy++;
      const suggestedPrice = calculatePriceSuggestion({
        cost: profitability.cost, feePct: profitability.feePct, taxPct: settings.default_tax_pct,
        shipping: settings.default_shipping_cost, packaging: settings.default_packaging_cost,
        targetMarginPct: settings.profitability_thresholds.healthy,
      });
      potentialProfit += suggestedPrice ? suggestedPrice * (settings.profitability_thresholds.healthy / 100) : Math.max(profitability.netProfit, 0);
    } else {
      potentialProfit += profitability.netProfit;
    }
  });
  return { currentProfit, potentialProfit, itemsBelowHealthy };
}

// --- Calculadora de preco/lucro (disponivel para todos os planos) ---

export function calculatePriceSuggestion({ cost, feePct = 0, taxPct = 0, shipping = 0, packaging = 0, targetMarginPct }) {
  const denominator = 1 - (feePct / 100) - (taxPct / 100) - (targetMarginPct / 100);
  if (denominator <= 0) return null;
  const price = (Number(cost || 0) + Number(shipping || 0) + Number(packaging || 0)) / denominator;
  return Math.round(price * 100) / 100;
}

export function buildPriceCalculatorResult(inputs) {
  const thresholds = getFinancialSettings().profitability_thresholds;
  return {
    minPrice: calculatePriceSuggestion({ ...inputs, targetMarginPct: 0 }),
    recommendedPrice: calculatePriceSuggestion({ ...inputs, targetMarginPct: thresholds.healthy }),
    premiumPrice: calculatePriceSuggestion({ ...inputs, targetMarginPct: thresholds.excellent }),
  };
}

export function openPriceCalculatorDialog() {
  renderPriceCalculator();
  byId("priceCalculatorDialog").showModal();
}

export function renderPriceCalculator() {
  const form = byId("priceCalculatorForm");
  if (!form) return;
  const settings = getFinancialSettings();
  if (form.dataset.initialized !== "true") {
    form.elements.taxPct.value = settings.default_tax_pct;
    form.elements.shipping.value = settings.default_shipping_cost;
    form.elements.packaging.value = settings.default_packaging_cost;
    form.dataset.initialized = "true";
  }
  byId("priceCalculatorListingType").hidden = form.elements.marketplace.value !== "mercado_livre";
  updatePriceCalculatorResult();
}

export function updatePriceCalculatorResult() {
  const form = byId("priceCalculatorForm");
  const result = byId("priceCalculatorResult");
  if (!form || !result) return;
  const data = new FormData(form);
  const marketplace = String(data.get("marketplace") || "direct");
  const listingType = String(data.get("listingType") || "classic");
  const settings = getFinancialSettings();
  const rules = settings.marketplace_fee_rules;
  const feePct = marketplace === "mercado_livre" ? Number(rules.mercado_livre?.[listingType] ?? 12)
    : marketplace === "shopee" ? Number(rules.shopee?.default ?? 14)
      : marketplace === "amazon" ? Number(rules.amazon?.default ?? 15)
        : Number(rules.direct?.default ?? 0);
  const output = buildPriceCalculatorResult({
    cost: number(data.get("cost")),
    feePct,
    taxPct: number(data.get("taxPct")),
    shipping: number(data.get("shipping")),
    packaging: number(data.get("packaging")),
  });
  result.innerHTML = `
    <article><span>Preço mínimo</span><strong>${output.minPrice ? money.format(output.minPrice) : "-"}</strong><small>Cobre custo e taxas (margem 0%)</small></article>
    <article><span>Preço recomendado</span><strong>${output.recommendedPrice ? money.format(output.recommendedPrice) : "-"}</strong><small>Margem saudável (${settings.profitability_thresholds.healthy}%)</small></article>
    <article><span>Preço premium</span><strong>${output.premiumPrice ? money.format(output.premiumPrice) : "-"}</strong><small>Margem excelente (${settings.profitability_thresholds.excellent}%)</small></article>
  `;
}

export function bindPriceCalculatorForm() {
  const form = byId("priceCalculatorForm");
  if (!form) return;
  form.addEventListener("input", updatePriceCalculatorResult);
  form.elements.marketplace.addEventListener("change", () => {
    byId("priceCalculatorListingType").hidden = form.elements.marketplace.value !== "mercado_livre";
    updatePriceCalculatorResult();
  });
}

// --- Sugestoes automaticas ---

export async function generateSuggestions() {
  if (!state.canEdit || !state.supabase || !hasCommercialIntelligenceAccess()) return;
  const settings = getFinancialSettings();
  const openKeys = new Set(
    state.commercialSuggestions.filter((item) => item.status === "open").map((item) => `${item.kind}:${item.target_id}`)
  );
  const queue = [];
  state.marketplaceListings.forEach((listing) => {
    const profitability = getListingProfitability(listing);
    if (!profitability.hasCost) {
      if (!openKeys.has(`no_cost:${listing.external_id}`)) {
        queue.push({
          kind: "no_cost", target_type: "listing", target_id: listing.external_id, marketplace: listing.marketplace,
          title: "Custo não cadastrado",
          message: `Cadastre o custo do produto "${listing.title}" para calcularmos a rentabilidade deste anúncio.`,
        });
      }
      return;
    }
    if (["loss", "critical"].includes(profitability.level.key) && !openKeys.has(`reprice:${listing.external_id}`)) {
      const suggestedPrice = calculatePriceSuggestion({
        cost: profitability.cost, feePct: profitability.feePct, taxPct: settings.default_tax_pct,
        shipping: settings.default_shipping_cost, packaging: settings.default_packaging_cost,
        targetMarginPct: settings.profitability_thresholds.healthy,
      });
      queue.push({
        kind: "reprice", target_type: "listing", target_id: listing.external_id, marketplace: listing.marketplace,
        title: `Margem ${profitability.level.label.toLowerCase()}: ${listing.title}`,
        message: suggestedPrice
          ? `Margem atual de ${profitability.marginPct.toFixed(1)}%. Considere ajustar o preço para ${money.format(suggestedPrice)} para atingir uma margem saudável.`
          : `Margem atual de ${profitability.marginPct.toFixed(1)}%. As taxas configuradas não permitem calcular um preço saudável — revise custo ou taxas.`,
        current_margin: profitability.marginPct,
        suggested_price: suggestedPrice,
      });
    }
  });
  for (const item of queue.slice(0, 30)) {
    const { data, error } = await state.supabase.from("commercial_suggestions").insert({
      organization_id: state.organizationId,
      ...item,
    }).select().single();
    if (!error && data) state.commercialSuggestions.unshift(data);
  }
}

export function renderSuggestions() {
  const target = byId("suggestionsList");
  if (!target) return;
  const open = state.commercialSuggestions
    .filter((item) => item.status === "open")
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  target.innerHTML = open.length ? open.map((item) => `
    <div class="list-row suggestion-row">
      <div>
        <strong>${html(item.title)}</strong>
        <span>${html(item.message)}</span>
      </div>
      <div class="inline-actions">
        <button class="secondary-btn" type="button" data-action="resolve-suggestion" data-id="${html(item.id)}">Resolvido</button>
        <button class="icon-btn" type="button" data-action="dismiss-suggestion" data-id="${html(item.id)}">Dispensar</button>
      </div>
    </div>
  `).join("") : `<div class="empty-chart">Nenhuma sugestão no momento.</div>`;
  bindActions();
}

async function updateSuggestionStatus(id, status) {
  if (!ensureCanEdit()) return;
  const { error } = await state.supabase.from("commercial_suggestions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    alert(`Não foi possível atualizar a sugestão: ${error.message}`);
    return;
  }
  const item = state.commercialSuggestions.find((row) => row.id === id);
  if (item) item.status = status;
  renderSuggestions();
  flashActionMessage(status === "dismissed" ? "Sugestão dispensada." : "Sugestão marcada como resolvida.");
}

export function dismissSuggestion(id) {
  return updateSuggestionStatus(id, "dismissed");
}

export function resolveSuggestion(id) {
  return updateSuggestionStatus(id, "resolved");
}

// --- Simulador de estrategias ---

export function renderProfitSimulator() {
  const select = byId("simulatorProductSelect");
  if (!select) return;
  const options = state.marketplaceListings.filter((listing) => getProductForListing(listing.marketplace, listing.external_id));
  select.innerHTML = `<option value="">Selecione um anúncio com custo cadastrado</option>` + options.map((item) =>
    `<option value="${html(`${item.marketplace}:${item.external_id}`)}">${html(item.title)} (${html(marketplaceDisplayName(item.marketplace))})</option>`
  ).join("");
}

export function simulateSalesForGoal(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const goal = number(data.get("goal"));
  const value = String(data.get("listing") || "");
  const result = byId("simulatorResult");
  if (!goal || !value) {
    result.innerHTML = `<div class="empty-chart">Informe a meta de lucro e escolha um anúncio.</div>`;
    return;
  }
  const [marketplace, ...idParts] = value.split(":");
  const externalId = idParts.join(":");
  const listing = state.marketplaceListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
  const profitability = listing ? getListingProfitability(listing) : { hasCost: false };
  if (!profitability.hasCost || profitability.netProfit <= 0) {
    result.innerHTML = `<div class="empty-chart">Este anúncio não gera lucro por unidade suficiente para simular a meta. Ajuste o preço ou o custo cadastrado.</div>`;
    return;
  }
  const salesNeeded = Math.ceil(goal / profitability.netProfit);
  result.innerHTML = `
    <div class="simulator-result-card">
      <strong>${salesNeeded} venda${salesNeeded === 1 ? "" : "s"}</strong>
      <span>de "${html(listing.title)}" para atingir ${money.format(goal)} de lucro (lucro estimado por unidade: ${money.format(profitability.netProfit)})</span>
    </div>
  `;
}

// --- Comparacao entre marketplaces ---

export function renderMarketplaceComparison() {
  const target = byId("marketplaceComparisonTable");
  if (!target) return;
  const rows = ["mercado-livre", "shopee", "amazon"].map((channel) => {
    const listings = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel);
    const withCost = listings.map(getListingProfitability).filter((item) => item.hasCost);
    const avgMargin = withCost.length ? withCost.reduce((sum, item) => sum + item.marginPct, 0) / withCost.length : null;
    return { label: marketplaceDisplayName(channel), count: listings.length, withCost: withCost.length, avgMargin };
  }).filter((row) => row.count > 0);
  target.innerHTML = rows.length ? rows.map((row) => `
    <tr>
      <td>${html(row.label)}</td>
      <td>${row.count}</td>
      <td>${row.withCost}</td>
      <td>${row.avgMargin === null ? "-" : `${row.avgMargin.toFixed(1)}%`}</td>
    </tr>
  `).join("") : `<tr><td colspan="4">Nenhum anúncio sincronizado ainda.</td></tr>`;
}

// --- Widget de dashboard ---

export function renderProfitabilityDashboardWidget() {
  const target = byId("profitabilityWidget");
  if (!target) return;
  const card = target.closest("[data-dashboard-card]");
  if (card) card.hidden = !state.isAdmin;
  if (!state.isAdmin) return;
  if (!hasCommercialIntelligenceAccess()) {
    target.innerHTML = `<div class="premium-upsell compact"><strong>Recurso premium</strong><span>Disponível nos planos pagos.</span><button class="secondary-btn" type="button" data-action="open-subscription">Ver planos</button></div>`;
    bindActions();
    return;
  }
  const counts = getProfitabilitySummary();
  const potential = getProfitPotential();
  target.innerHTML = `
    <article><span>Prejuízo</span><strong>${counts.loss}</strong></article>
    <article><span>Crítico</span><strong>${counts.critical}</strong></article>
    <article><span>Atenção</span><strong>${counts.attention}</strong></article>
    <article><span>Saudável</span><strong>${counts.healthy}</strong></article>
    <article><span>Excelente</span><strong>${counts.excellent}</strong></article>
    <article><span>Lucro potencial</span><strong>${money.format(Math.max(potential.potentialProfit - potential.currentProfit, 0))}</strong></article>
  `;
}

// --- Cadastro de custo em lote ---

export function openBulkCostDialog() {
  renderBulkCostRows();
  byId("bulkCostMessage").textContent = "";
  byId("bulkCostDialog").showModal();
}

function renderBulkCostRows() {
  const target = byId("bulkCostRows");
  if (!target) return;
  const listings = state.marketplaceListings.slice().sort((a, b) => (a.title || "").localeCompare(b.title || "", "pt-BR"));
  target.innerHTML = listings.length ? listings.map((listing) => {
    const product = getProductForListing(listing.marketplace, listing.external_id);
    return `
      <div class="bulk-cost-row" data-bulk-cost-row data-marketplace="${html(listing.marketplace)}" data-external-id="${html(listing.external_id)}">
        <div class="bulk-cost-row-info">
          <strong>${html(listing.title)}</strong>
          <span class="badge neutral">${html(marketplaceDisplayName(listing.marketplace))}</span>
        </div>
        <span class="bulk-cost-row-price">${money.format(Number(listing.price || 0))}</span>
        <input type="number" min="0" step="0.01" name="cost" placeholder="Custo (R$)" value="${product && product.cost_price ? Number(product.cost_price) : ""}" />
      </div>
    `;
  }).join("") : `<div class="empty-chart">Nenhum anúncio sincronizado ainda.</div>`;
}

export async function saveBulkCosts(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const message = byId("bulkCostMessage");
  const rows = Array.from(byId("bulkCostRows").querySelectorAll("[data-bulk-cost-row]"));
  message.textContent = "Salvando custos...";
  let savedCount = 0;
  for (const row of rows) {
    const input = row.querySelector("input[name='cost']");
    const raw = input.value.trim();
    if (!raw) continue;
    const cost = number(raw);
    const marketplace = row.dataset.marketplace;
    const externalId = row.dataset.externalId;
    const listing = state.marketplaceListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
    if (!listing) continue;
    const existingProduct = getProductForListing(marketplace, externalId);
    if (existingProduct) {
      if (Number(existingProduct.cost_price || 0) === cost) continue;
      const payload = {
        id: existingProduct.id,
        organization_id: state.organizationId,
        sku: existingProduct.sku,
        name: existingProduct.name,
        category: existingProduct.category,
        cost_price: cost,
        notes: existingProduct.notes,
        updated_at: new Date().toISOString(),
      };
      const { data: saved, error } = await state.supabase.from("products").upsert(payload).select().single();
      if (error) continue;
      const index = state.products.findIndex((item) => item.id === saved.id);
      if (index >= 0) state.products[index] = saved;
      await recordAudit("update", "product", saved.id, saved.sku, existingProduct, saved, "manual");
      savedCount++;
    } else {
      const name = listing.title || externalId;
      const sku = nextProductSku(null, name);
      const payload = {
        organization_id: state.organizationId,
        sku,
        name,
        category: null,
        cost_price: cost,
        updated_at: new Date().toISOString(),
      };
      const { data: saved, error } = await state.supabase.from("products").insert(payload).select().single();
      if (error) continue;
      state.products.push(saved);
      await recordAudit("create", "product", saved.id, saved.sku, null, saved, "manual");
      await syncProductListingLink(saved.id, `${marketplace}:${externalId}`);
      savedCount++;
    }
  }
  byId("bulkCostDialog").close();
  flashActionMessage(savedCount ? `${savedCount} custo(s) salvo(s) com sucesso.` : "Nenhum custo novo informado.");
  renderProductCatalogTable();
  renderCommercialIntelligence();
  renderMarketplaces();
}

// --- Aba "Inteligência" dentro de Marketplace ---

function renderIntelligenceEmptyState(coverage) {
  byId("intelligenceCoverageFill").style.width = `${coverage.pct}%`;
  byId("intelligenceCoverageLabel").textContent = `${coverage.withCost} de ${coverage.total} anúncios com custo cadastrado (${coverage.pct}%)`;
}

export function renderCommercialIntelligence() {
  renderProductCatalogTable();
  const analysisSection = byId("intelligenceAnalysisSection");
  const upsell = byId("intelligenceUpsell");
  const emptyState = byId("intelligenceEmptyState");
  if (!analysisSection || !upsell) return;
  const access = hasCommercialIntelligenceAccess();
  upsell.hidden = access;
  if (!access) {
    analysisSection.hidden = true;
    if (emptyState) emptyState.hidden = true;
    return;
  }
  const coverage = getCostCoverage();
  const showEmptyState = coverage.total > 0 && coverage.pct < 50;
  if (emptyState) {
    emptyState.hidden = !showEmptyState;
    if (showEmptyState) renderIntelligenceEmptyState(coverage);
  }
  analysisSection.hidden = showEmptyState;
  if (showEmptyState) {
    bindActions();
    return;
  }
  renderProfitabilitySummaryPanel();
  renderSuggestions();
  renderProfitSimulator();
  renderMarketplaceComparison();
}

export function renderProfitabilitySummaryPanel() {
  const target = byId("intelligenceSummaryGrid");
  if (!target) return;
  const counts = getProfitabilitySummary();
  const potential = getProfitPotential();
  target.innerHTML = `
    <article><span>Prejuízo</span><strong>${counts.loss}</strong></article>
    <article><span>Crítico</span><strong>${counts.critical}</strong></article>
    <article><span>Atenção</span><strong>${counts.attention}</strong></article>
    <article><span>Saudável</span><strong>${counts.healthy}</strong></article>
    <article><span>Excelente</span><strong>${counts.excellent}</strong></article>
    <article><span>Sem custo cadastrado</span><strong>${counts.noCost}</strong></article>
    <article><span>Lucro atual (anúncios)</span><strong>${money.format(potential.currentProfit)}</strong></article>
    <article><span>Lucro potencial estimado</span><strong>${money.format(potential.potentialProfit)}</strong></article>
  `;
}

// --- Configuracoes financeiras por empresa ---

export function openFinancialSettingsDialog() {
  const settings = getFinancialSettings();
  const form = byId("financialSettingsForm");
  form.elements.mlClassicFee.value = settings.marketplace_fee_rules?.mercado_livre?.classic ?? 12;
  form.elements.mlPremiumFee.value = settings.marketplace_fee_rules?.mercado_livre?.premium ?? 16;
  form.elements.shopeeFee.value = settings.marketplace_fee_rules?.shopee?.default ?? 14;
  form.elements.amazonFee.value = settings.marketplace_fee_rules?.amazon?.default ?? 15;
  form.elements.taxPct.value = settings.default_tax_pct;
  form.elements.shippingCost.value = settings.default_shipping_cost;
  form.elements.packagingCost.value = settings.default_packaging_cost;
  form.elements.thresholdAttention.value = settings.profitability_thresholds.attention;
  form.elements.thresholdHealthy.value = settings.profitability_thresholds.healthy;
  form.elements.thresholdExcellent.value = settings.profitability_thresholds.excellent;
  byId("financialSettingsDialog").showModal();
}

export async function saveFinancialSettings(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const data = new FormData(event.currentTarget);
  const payload = {
    organization_id: state.organizationId,
    marketplace_fee_rules: {
      mercado_livre: { classic: number(data.get("mlClassicFee")), premium: number(data.get("mlPremiumFee")) },
      shopee: { default: number(data.get("shopeeFee")) },
      amazon: { default: number(data.get("amazonFee")) },
      direct: { default: 0 },
    },
    default_tax_pct: number(data.get("taxPct")),
    default_shipping_cost: number(data.get("shippingCost")),
    default_packaging_cost: number(data.get("packagingCost")),
    profitability_thresholds: {
      critical: 0,
      attention: number(data.get("thresholdAttention")),
      healthy: number(data.get("thresholdHealthy")),
      excellent: number(data.get("thresholdExcellent")),
    },
    category_prefixes: state.financialSettings?.category_prefixes || {},
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await state.supabase.from("financial_settings").upsert(payload).select().single();
  if (error) {
    alert(`Não foi possível salvar as configurações: ${error.message}`);
    return;
  }
  state.financialSettings = saved;
  byId("financialSettingsDialog").close();
  flashActionMessage("Configurações financeiras atualizadas.");
  renderMarketplaces();
  renderCommercialIntelligence();
}

// --- Relatorio ---

export function reportPricingDefinition() {
  if (!hasCommercialIntelligenceAccess()) {
    return {
      title: "Inteligência Comercial",
      kpis: [["Recurso premium", "Bloqueado", "Disponível nos planos pagos", "amber"]],
      chartTitle: "Rentabilidade por anúncio",
      chartRows: [],
      headers: ["Recurso premium"],
      body: [],
    };
  }
  const counts = getProfitabilitySummary();
  const potential = getProfitPotential();
  const rows = state.marketplaceListings.map((listing) => {
    const profitability = getListingProfitability(listing);
    return [
      listing.title || listing.external_id,
      marketplaceDisplayName(listing.marketplace),
      profitability.hasCost ? money.format(profitability.cost) : "Sem custo",
      money.format(Number(listing.price || 0)),
      profitability.hasCost ? `${profitability.marginPct.toFixed(1)}%` : "-",
      profitability.hasCost ? profitability.level.label : "-",
    ];
  });
  return {
    title: "Inteligência Comercial",
    kpis: [
      ["Anúncios saudáveis+", counts.healthy + counts.excellent, "Margem 20% ou mais", "green"],
      ["Anúncios críticos", counts.loss + counts.critical, "Precisam de atenção imediata", "red"],
      ["Sem custo cadastrado", counts.noCost, "Cadastre o custo para calcular a margem", "amber"],
      ["Lucro potencial", money.format(Math.max(potential.potentialProfit - potential.currentProfit, 0)), "Se reprecificados para margem saudável", "blue"],
    ],
    chartTitle: "Anúncios por nível de rentabilidade",
    chartRows: [
      { label: "Prejuízo", value: counts.loss },
      { label: "Crítico", value: counts.critical },
      { label: "Atenção", value: counts.attention },
      { label: "Saudável", value: counts.healthy },
      { label: "Excelente", value: counts.excellent },
    ],
    headers: ["Anúncio", "Marketplace", "Custo", "Preço", "Margem", "Nível"],
    body: rows,
  };
}
