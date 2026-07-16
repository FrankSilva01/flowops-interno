import { state, money } from "../core/state.js";
import { supabaseFunctionUrl } from "../core/config.js";
import { byId, html, flashActionMessage, number, showAppMessage, showAppConfirm, safeUrl } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { renderBarChart } from "../core/charts.js";
import { recordAudit } from "./logs.js";
import { getOrderMarketplaceChannel } from "./orders.js";
import { syncFeeCalculatorFull } from "./marketplace-analytics.js";
import {
  renderMarketplaces, loadMarketplaces, marketplaceRequest, resizeImageFileForStorefront,
} from "./marketplace.js";
import { normalizeMarketplaceChannel, marketplaceDisplayName } from "./marketplace-channel.js";
import {
  calculatePriceSuggestion,
  classifyProfitability,
  computeMarginBreakdown as computeMarginBreakdownValue,
} from "./pricing-math.js";

export { calculatePriceSuggestion } from "./pricing-math.js";

const CREATABLE_MARKETPLACES = ["mercado-livre", "shopee", "amazon", "tiktok-shop"];
const ML_FEE_PREVIEW_URL = `${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=fee-preview`;
let productUploadedImages = [];
let currentProductStep = 1;
let productMlFeePreview = null;
let productMlFeePreviewKey = "";
let productMlFeePreviewRequestId = 0;
const PRODUCT_ASSETS_MARKER = "[[FLOWOPS_PRODUCT_ASSETS:";
const PRODUCT_ASSETS_MARKER_END = "]]";

const DEFAULT_FINANCIAL_SETTINGS = {
  marketplace_fee_rules: {
    // fixed_fee_threshold/fixed_fee_amount: o ML cobra uma taxa fixa (alem
    // da comissao %) em itens de baixo valor - some ao valor da comissao,
    // nao substitui ela. Os outros canais tambem podem ter isso, mas por
    // enquanto so ML tem valores default (sem integracao de API pros demais).
    // Percentuais confirmados pelo usuario contra o simulador real do ML
    // (varia um pouco por categoria - isso e so o default, editavel em
    // Configuracoes financeiras).
    mercado_livre: { classic: 11.5, premium: 16.5, fixed_fee_threshold: 79, fixed_fee_amount: 6.25 },
    shopee: { default: 14, service_fee_pct: 2, fixed_fee_threshold: 0, fixed_fee_amount: 0 },
    amazon: { default: 15, fulfillment_fee_pct: 0, fixed_fee_threshold: 0, fixed_fee_amount: 0 },
    tiktok_shop: { default: 7, fixed_fee_threshold: 0, fixed_fee_amount: 0 },
    direct: { default: 0 },
  },
  default_tax_pct: 6,
  default_shipping_cost: 0,
  default_packaging_cost: 0,
  // Faixas de frete por peso (R$), usadas quando nao ha frete real
  // sincronizado da API e o produto tem peso cadastrado - ver
  // resolveShippingCost(). max_kg e o teto de cada faixa, em ordem crescente.
  shipping_weight_tiers: [
    { max_kg: 0.3, cost: 15 },
    { max_kg: 1, cost: 20 },
    { max_kg: 5, cost: 30 },
    { max_kg: 30, cost: 50 },
  ],
  profitability_thresholds: { critical: 0, attention: 10, healthy: 20, excellent: 35 },
  category_prefixes: {},
};

// --- Taxa fixa (itens de baixo valor) e frete por peso (fallback sem API) ---

export function resolveFixedFeeRule(channel) {
  const rules = getFinancialSettings().marketplace_fee_rules;
  const key = channel === "mercado-livre" ? "mercado_livre" : channel === "tiktok-shop" ? "tiktok_shop" : channel;
  const config = rules?.[key];
  return { threshold: Number(config?.fixed_fee_threshold || 0), amount: Number(config?.fixed_fee_amount || 0) };
}

export function resolveFixedFee(channel, revenue) {
  const rule = resolveFixedFeeRule(channel);
  if (!rule.amount || !rule.threshold) return 0;
  return Number(revenue || 0) < rule.threshold ? rule.amount : 0;
}

export function resolveShippingCost(weightKg, manualShipping) {
  const settings = getFinancialSettings();
  if (manualShipping != null && manualShipping !== "" && Number(manualShipping) > 0) return Number(manualShipping);
  const weight = Number(weightKg || 0);
  if (weight <= 0) return Number(settings.default_shipping_cost || 0);
  const tiers = (settings.shipping_weight_tiers || []).slice().sort((a, b) => a.max_kg - b.max_kg);
  const match = tiers.find((tier) => weight <= Number(tier.max_kg));
  return Number((match || tiers[tiers.length - 1])?.cost || settings.default_shipping_cost || 0);
}

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
  return classifyProfitability(marginPct, thresholds);
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

export function parseProductDescriptionAssets(description) {
  const value = String(description || "");
  const markerIndex = value.lastIndexOf(PRODUCT_ASSETS_MARKER);
  if (markerIndex < 0) return { cleanDescription: value, assets: {} };
  const endIndex = value.indexOf(PRODUCT_ASSETS_MARKER_END, markerIndex);
  if (endIndex < 0) return { cleanDescription: value, assets: {} };
  const encoded = value.slice(markerIndex + PRODUCT_ASSETS_MARKER.length, endIndex);
  try {
    return {
      cleanDescription: value.slice(0, markerIndex).trim(),
      assets: JSON.parse(decodeURIComponent(encoded)) || {},
    };
  } catch (error) {
    return { cleanDescription: value.slice(0, markerIndex).trim(), assets: {} };
  }
}

export function serializeProductDescriptionAssets(description, assets = {}) {
  const cleanDescription = String(description || "").trim();
  const normalized = {
    stlLink: String(assets.stlLink || "").trim(),
    imageUrl: String(assets.imageUrl || "").trim(),
    notes: String(assets.notes || "").trim(),
  };
  if (!normalized.stlLink && !normalized.imageUrl && !normalized.notes) return cleanDescription || null;
  return `${cleanDescription}${cleanDescription ? "\n\n" : ""}${PRODUCT_ASSETS_MARKER}${encodeURIComponent(JSON.stringify(normalized))}${PRODUCT_ASSETS_MARKER_END}`;
}

export function getProductAssetInfo(product) {
  const parsed = parseProductDescriptionAssets(product?.description || "");
  return parsed.assets || {};
}

function renderProductAssetLinks(product) {
  const assets = getProductAssetInfo(product);
  const stl = safeUrl(assets.stlLink);
  const image = safeUrl(assets.imageUrl);
  const notes = String(assets.notes || "").trim();
  if (!stl && !image && !notes) return `<small class="muted">Sem arquivo de producao</small>`;
  return `
    <div class="inline-actions">
      ${stl ? `<a class="order-link" href="${html(stl)}" target="_blank" rel="noopener">STL/origem</a>` : ""}
      ${image ? `<a class="order-link" href="${html(image)}" target="_blank" rel="noopener">Imagem</a>` : ""}
      ${notes ? `<small class="muted">${html(notes)}</small>` : ""}
    </div>
  `;
}

function renderProductLinkedListings(product) {
  const links = state.productListings.filter((item) => item.product_id === product.id);
  if (!links.length) return `<small class="muted">Sem anuncio vinculado</small>`;
  return `
    <div class="product-linked-listings">
      ${links.map((link) => {
        const listing = state.marketplaceListings.find((item) =>
          item.marketplace === link.marketplace && item.external_id === link.external_id
        );
        const title = listing?.title || link.external_id || "Anuncio";
        return `
          <button class="link-cell" type="button" data-action="open-listing-drawer" data-marketplace="${html(link.marketplace)}" data-external-id="${html(link.external_id)}" title="${html(title)}">
            ${html(marketplaceDisplayName(link.marketplace))} · ${html(link.external_id || "-")}
          </button>
        `;
      }).join("")}
    </div>
  `;
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
      <td><strong>${html(item.name)}</strong><br><small class="muted">${html(item.category || "Sem categoria")}${item.weight_kg ? ` · ${Number(item.weight_kg).toLocaleString("pt-BR")} kg` : ""}</small></td>
      <td>${renderProductAssetLinks(item)}</td>
      <td>${renderProductLinkedListings(item)}</td>
      <td>${money.format(Number(item.cost_price || 0))}</td>
      <td>
        ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-product" data-id="${html(item.id)}">Editar</button>
        <button class="icon-btn danger" type="button" data-action="delete-product" data-id="${html(item.id)}">Excluir</button>` : "-"}
      </td>
    </tr>
  `).join("") : `<tr><td colspan="6">Nenhum produto interno cadastrado.</td></tr>`;
  bindActions();
}

const MARKETPLACE_CHECKBOX_NAMES = {
  "mercado-livre": "publish_ml",
  shopee: "publish_shopee",
  amazon: "publish_amazon",
  "tiktok-shop": "publish_tiktok",
};

const ML_PRODUCT_DEFAULT_ATTRIBUTES = [
  { id: "EMPTY_GTIN_REASON", value_id: "17055161" },
  { id: "ITEM_CONDITION", value_id: "2230284" },
  { id: "IS_COLLECTIBLE", value_id: "242085" },
  { id: "IS_REALISTIC_REPLICA", value_id: "242084" },
  { id: "IS_SET", value_id: "242084" },
  { id: "IS_SURPRISE", value_id: "242084" },
  { id: "REQUIRES_ASSEMBLY", value_id: "242084" },
  { id: "PIECES_NUMBER", value_name: "1" },
  { id: "MIN_RECOMMENDED_AGE", value_name: "12 anos" },
];

export function isMarketplaceAccountConnected(channel) {
  return state.marketplaceAccounts.some((item) => normalizeMarketplaceChannel(item.marketplace) === channel);
}

export function openProductQuickDialog(productId = "") {
  const product = state.products.find((item) => item.id === productId) || null;
  const parsedDescription = parseProductDescriptionAssets(product?.description || "");
  const assets = parsedDescription.assets || {};
  const form = byId("productForm");
  form.reset();
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.category.value = product?.category || "";
  form.elements.costPrice.value = product?.cost_price ?? "";
  form.elements.weightKg.value = product?.weight_kg ?? "";
  form.elements.description.value = parsedDescription.cleanDescription || "";
  form.elements.assetStlLink.value = assets.stlLink || "";
  form.elements.assetImageUrl.value = assets.imageUrl || "";
  form.elements.assetNotes.value = assets.notes || "";
  form.elements.sku.value = product?.sku || "";
  form.dataset.skuTouched = product ? "true" : "false";
  productUploadedImages = [];
  productMlFeePreview = null;
  productMlFeePreviewKey = "";
  productMlFeePreviewRequestId++;
  byId("productImageStatus").textContent = "Selecionar, arrastar ou soltar imagens aqui";

  const linkedListing = product ? state.productListings.find((item) => item.product_id === product.id) : null;
  const linkedListingData = linkedListing
    ? state.marketplaceListings.find((item) => item.marketplace === linkedListing.marketplace && item.external_id === linkedListing.external_id)
    : null;
  form.elements.price.value = linkedListingData ? Number(linkedListingData.price || 0) : "";
  form.elements.stock.value = linkedListingData ? Number(linkedListingData.raw_payload?.available_quantity || 1) : 1;
  form.elements.mlCategoryId.value = linkedListingData?.raw_payload?.category_id || "";
  // Se o produto ja tem um anuncio real vinculado, usa o tipo real (evita
  // presumir "Classico" quando o anuncio de verdade e Premium).
  form.elements.listingType.value = linkedListingData ? classifyMlListingType(linkedListingData.raw_payload || {}) : "classic";
  form.elements.publish_ml.checked = normalizeMarketplaceChannel(linkedListing?.marketplace) === "mercado-livre";

  renderProductListingOptions(product);
  updateProductMarketplaceStatusHints();
  renderProductProfitPreview();
  byId("productDialogTitle").textContent = product ? `Editar produto - ${product.sku}` : "Cadastrar produto";
  byId("productFormMessage").textContent = "";

  // Reset para step 1
  currentProductStep = 0;
  goToProductStep(1);

  byId("productDialog").showModal();
}

export function openProductQuickDialogForListing(marketplace, externalId) {
  const listing = state.marketplaceListings.find((item) =>
    item.marketplace === marketplace && item.external_id === externalId
  ) || state.marketplaceListings.find((item) =>
    normalizeMarketplaceChannel(item.marketplace) === normalizeMarketplaceChannel(marketplace) && item.external_id === externalId
  );
  const product = getProductForListing(marketplace, externalId);
  openProductQuickDialog(product?.id || "");
  const form = byId("productForm");
  const listingMarketplace = listing?.marketplace || marketplace || "Mercado Livre";
  form.elements.listingLink.value = `${listingMarketplace}:${externalId}`;

  if (listing && !product) {
    form.elements.name.value = listing.title || "";
    form.elements.sku.value = listing.sku || "";
    form.elements.price.value = Number(listing.price || 0) || "";
    form.elements.stock.value = Number(listing.raw_payload?.available_quantity || 1);
    form.elements.mlCategoryId.value = listing.raw_payload?.category_id || "";
    form.elements.listingType.value = classifyMlListingType(listing.raw_payload || {});
    form.dataset.skuTouched = listing.sku ? "true" : "false";
  }

  const channel = normalizeMarketplaceChannel(listingMarketplace);
  if (channel === "mercado-livre") form.elements.publish_ml.checked = true;
  updateProductMarketplaceStatusHints();
  renderProductProfitPreview();
  byId("productDialogTitle").textContent = product
    ? `Editar produto - ${product.sku}`
    : `Editar anúncio - ${listing?.sku || externalId}`;
}

export function updateProductMarketplaceStatusHints() {
  const form = byId("productForm");
  if (!form) return;
  CREATABLE_MARKETPLACES.forEach((channel) => {
    const hint = form.querySelector(`[data-marketplace-status="${channel}"]`);
    if (!hint) return;
    if (channel === "mercado-livre" && isMarketplaceAccountConnected(channel)) {
      hint.textContent = "(conectado)";
    } else if (channel === "mercado-livre") {
      hint.textContent = "(conecte em Integrações para publicar)";
    } else {
      hint.textContent = "(salva na vitrine; integração externa não habilitada)";
    }
  });
  // Mostrar/esconder configuração ML baseado na checkbox
  const mlConfigSection = byId("mlConfigSection");
  if (mlConfigSection) {
    mlConfigSection.style.display = form.elements.publish_ml.checked ? "block" : "none";
  }
}

export function bindProductMarketplaceCheckboxes() {
  const form = byId("productForm");
  if (!form) return;
  form.elements.publish_ml.addEventListener("change", () => {
    const mlConfigSection = byId("mlConfigSection");
    if (mlConfigSection) {
      mlConfigSection.style.display = form.elements.publish_ml.checked ? "block" : "none";
    }
    renderProductProfitPreview();
  });
  form.elements.listingType.addEventListener("change", renderProductProfitPreview);
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
// Card com o breakdown visual tipo funil (preco -> taxas -> imposto -> frete
// -> custo -> lucro). Reaproveitado na previa de cadastro de produto
// e na calculadora de preco.
function renderPriceBreakdownCard(label, breakdown, note = "") {
  // Frete null/undefined significa pendente; frete 0 e um valor valido retornado/calculado.
  const shippingDisplay = breakdown.shipping !== null
    ? `-${money.format(breakdown.shipping)}`
    : `<span title="Frete ainda não foi calculado" style="color: #ff6b6b; font-weight: 600;">⚠️ Não calculado</span>`;
  const totalLabel = breakdown.shipping === null ? "Sobra estimada sem frete" : "Sobra líquida estimada";

  return `
    <article class="profit-preview-card">
      <div class="profit-preview-head"><strong>${html(label)}</strong><span class="badge ${breakdown.level.className}">${html(breakdown.level.label)}</span></div>
      <dl class="profit-preview-rows">
        <div><dt>Preço de venda</dt><dd>${money.format(breakdown.revenue)}</dd></div>
        <div><dt>Custo do produto</dt><dd>-${money.format(breakdown.cost)}</dd></div>
        <div><dt>Taxa do marketplace (${breakdown.feePct.toFixed(1)}%)</dt><dd>-${money.format(breakdown.feeAmount)}</dd></div>
        ${breakdown.fixedFee > 0 ? `<div><dt>Taxa fixa (item de baixo valor)</dt><dd>-${money.format(breakdown.fixedFee)}</dd></div>` : ""}
        <div><dt>Imposto (${breakdown.taxPct}%)</dt><dd>-${money.format(breakdown.taxAmount)}</dd></div>
        <div><dt>Frete</dt><dd>${shippingDisplay}</dd></div>
        <div class="profit-preview-total"><dt>${totalLabel}</dt><dd>${money.format(breakdown.netProfit)} (${breakdown.marginPct.toFixed(1)}%)</dd></div>
      </dl>
      ${note ? `<small class="form-hint">${html(note)}</small>` : ""}
    </article>
  `;
}

function getMlFeePreviewKey(data) {
  const price = number(data.get("price"));
  const categoryId = String(data.get("mlCategoryId") || "").trim();
  const listingType = String(data.get("listingType") || "classic");
  if (price <= 0 || !categoryId || !isMarketplaceAccountConnected("mercado-livre")) return "";
  return `${price}|${categoryId}|${listingType}`;
}

async function loadMlFeePreviewForProduct(data, key) {
  const requestId = ++productMlFeePreviewRequestId;
  try {
    const listingType = String(data.get("listingType") || "classic");
    const result = await marketplaceRequest(ML_FEE_PREVIEW_URL, {
      method: "POST",
      body: JSON.stringify({
        price: number(data.get("price")),
        category_id: String(data.get("mlCategoryId") || "").trim(),
        listing_type_id: listingType === "premium" ? "gold_pro" : "gold_special",
      }),
    });
    if (requestId !== productMlFeePreviewRequestId) return;
    productMlFeePreviewKey = key;
    productMlFeePreview = {
      pct: Number(result.real_fee_pct || 0),
      fixedFee: Number(result.real_fee_fixed || 0),
    };
    renderProductProfitPreview();
  } catch (error) {
    if (requestId !== productMlFeePreviewRequestId) return;
    productMlFeePreviewKey = key;
    productMlFeePreview = { error: error.message || "Falha ao simular taxa do Mercado Livre." };
    renderProductProfitPreview();
  }
}

function ensureMlFeePreview(data) {
  const key = getMlFeePreviewKey(data);
  if (!key) {
    productMlFeePreviewKey = "";
    productMlFeePreview = null;
    return { key: "", preview: null, loading: false };
  }
  if (productMlFeePreviewKey === key) return { key, preview: productMlFeePreview, loading: false };
  productMlFeePreviewKey = key;
  productMlFeePreview = null;
  loadMlFeePreviewForProduct(data, key);
  return { key, preview: null, loading: true };
}

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

  // Ja vinculado a um anuncio real: usa a rentabilidade de verdade (que ja
  // prioriza taxa/frete sincronizados da API, ver resolveListingFeeInfo) em
  // vez de reestimar do zero por tabela - assim a previa bate com o que a
  // tabela de rentabilidade/o simulador real do Mercado Livre mostram.
  const listingValue = String(data.get("listingLink") || "");
  if (listingValue) {
    const [linkedMarketplace, ...idParts] = listingValue.split(":");
    const linkedExternalId = idParts.join(":");
    const linkedListing = state.marketplaceListings.find((item) => item.marketplace === linkedMarketplace && item.external_id === linkedExternalId);
    if (linkedListing) {
      const settings = getFinancialSettings();
      const feeInfo = resolveListingFeeInfo(linkedListing);
      const breakdown = computeMarginBreakdown({
        cost, revenue: price || Number(linkedListing.price || 0),
        feePct: feeInfo.pct, fixedFee: feeInfo.fixedFee, taxPct: settings.default_tax_pct,
        shipping: feeInfo.shipping, packaging: 0,
      });
      let note = feeInfo.real
        ? "Taxa e frete sincronizados da API do Mercado Livre."
        : "Estimativa por tabela - sincronize as taxas em Marketplace > Inteligência para o valor real.";
      // Frete 0 e valido; so trate null/undefined como pendente.
      const hasFreShipping = linkedListing.shipping?.free_shipping || linkedListing.raw_payload?.shipping?.free_shipping;
      if (feeInfo.notCalculated || (hasFreShipping && (feeInfo.shipping === null || feeInfo.shipping === undefined))) {
        note = "⚠️ Frete não calculado — o anúncio tem frete grátis, mas não recebemos o custo do Mercado Livre. Informe o peso para estimar ou sincronize as taxas.";
      }
      target.innerHTML = renderPriceBreakdownCard(`${marketplaceDisplayName(linkedMarketplace)} (anúncio vinculado)`, breakdown, note);
      return;
    }
  }

  const weight = number(data.get("weightKg"));
  const listingType = String(data.get("listingType") || "classic");
  const settings = getFinancialSettings();
  const checkedChannels = CREATABLE_MARKETPLACES.filter((channel) => form.elements[MARKETPLACE_CHECKBOX_NAMES[channel]]?.checked);
  const previewChannels = checkedChannels.length ? checkedChannels : ["direct"];
  const mlPreview = previewChannels.includes("mercado-livre") ? ensureMlFeePreview(data) : { preview: null, loading: false };
  // Sem peso cadastrado e sem anuncio real ainda, o frete cai no default (as
  // vezes R$0) - deixa isso explicito em vez de parecer "frete gratis calculado".
  const shippingNote = weight > 0 ? "" : "Frete estimado sem peso cadastrado — informe o peso do produto para uma estimativa mais próxima da real.";
  target.innerHTML = previewChannels.map((channel) => {
    let feePct = resolveChannelFeePct(channel, channel === "mercado-livre" ? listingType : "classic");
    let fixedFee = resolveFixedFee(channel, price);
    let note = shippingNote;
    if (channel === "mercado-livre") {
      if (mlPreview.preview?.pct != null) {
        feePct = mlPreview.preview.pct;
        fixedFee = mlPreview.preview.fixedFee;
        note = [shippingNote, "Taxa do Mercado Livre simulada pela API para preço, categoria e tipo de anúncio."].filter(Boolean).join(" ");
      } else if (mlPreview.preview?.error) {
        note = [shippingNote, `Não foi possível simular a taxa do Mercado Livre: ${mlPreview.preview.error}`].filter(Boolean).join(" ");
      } else if (mlPreview.key) {
        note = [shippingNote, "Simulando taxa do Mercado Livre..."].filter(Boolean).join(" ");
      }
    }
    const breakdown = computeMarginBreakdown({
      cost, revenue: price, feePct, fixedFee, taxPct: settings.default_tax_pct,
      shipping: resolveShippingCost(weight, null), packaging: 0,
    });
    const label = channel === "direct" ? "Venda direta (estimativa)" : marketplaceDisplayName(channel);
    return renderPriceBreakdownCard(label, breakdown, note);
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

function buildMlProductAttributes(data, name) {
  const brand = String(data.get("mlBrand") || "3D.AFT").trim() || "3D.AFT";
  const model = String(data.get("mlModel") || name).trim() || name;
  const material = String(data.get("mlMaterial") || "Resina").trim() || "Resina";
  return [
    { id: "BRAND", value_name: brand },
    { id: "MODEL", value_name: model },
    { id: "MANUFACTURER", value_name: brand },
    { id: "MATERIALS", value_name: material },
    ...ML_PRODUCT_DEFAULT_ATTRIBUTES,
  ];
}

function validateMlProductTitle(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  const words = clean.split(" ").filter(Boolean);
  if (clean.length < 10 || words.length < 2) {
    return "Para publicar no Mercado Livre, use um nome mais completo com marca, modelo ou categoria. Ex: Miniatura Deadpool 15cm Resina.";
  }
  return "";
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
  const rawCost = String(data.get("costPrice") || "").trim();
  const listingValue = String(data.get("listingLink") || "");
  const selectedChannels = CREATABLE_MARKETPLACES.filter((channel) => Boolean(data.get(MARKETPLACE_CHECKBOX_NAMES[channel])));
  const linkedMarketplace = normalizeMarketplaceChannel(listingValue.split(":")[0] || "");
  const mlTitleError = (selectedChannels.includes("mercado-livre") || linkedMarketplace === "mercado-livre") ? validateMlProductTitle(name) : "";
  if (mlTitleError) {
    message.textContent = mlTitleError;
    return;
  }
  if (selectedChannels.includes("mercado-livre") && !isMarketplaceAccountConnected("mercado-livre")) {
    message.textContent = "Conecte o Mercado Livre em Integrações antes de publicar. Para salvar apenas no catálogo, desmarque Mercado Livre.";
    return;
  }
  const channelsWithAutomaticPublication = selectedChannels.filter((channel) =>
    channel === "mercado-livre" && isMarketplaceAccountConnected(channel)
  );
  // So exige as 3 fotos quando o cadastro vai CRIAR um anuncio novo (mesmo
  // padrao do Mercado Livre) - vincular a um anuncio ja existente reaproveita
  // as fotos que ja estao la, entao nao entra nessa exigencia.
  if (!listingValue && channelsWithAutomaticPublication.length && productUploadedImages.length < 3) {
    message.textContent = `Adicione pelo menos 3 fotos do produto para publicar no Mercado Livre (${productUploadedImages.length} de 3).`;
    return;
  }
  const payload = {
    organization_id: state.organizationId,
    sku,
    name,
    category,
    cost_price: rawCost ? number(rawCost) : null,
    weight_kg: number(data.get("weightKg")) || null,
    description: serializeProductDescriptionAssets(String(data.get("description") || "").trim(), {
      stlLink: data.get("assetStlLink"),
      imageUrl: data.get("assetImageUrl"),
      notes: data.get("assetNotes"),
    }),
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

  if (listingValue) {
    await syncProductListingLink(saved.id, listingValue);
    const listingUpdate = await updateLinkedMarketplaceListing(listingValue, { name, price, stock }).catch((error) => ({ error }));
    await loadMarketplaces();
    byId("productDialog").close();
    flashActionMessage(listingUpdate?.error
      ? `Produto salvo, mas não consegui atualizar o anúncio: ${listingUpdate.error.message}`
      : "Produto e anúncio atualizados.");
    renderProductCatalogTable();
    renderMarketplaces();
    return;
  }

  // Se nenhum marketplace selecionado, apenas salva localmente
  if (!selectedChannels.length) {
    byId("productDialog").close();
    flashActionMessage("Produto salvo no catálogo.");
    renderProductCatalogTable();
    renderMarketplaces();
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
    const mlCategoryId = String(data.get("mlCategoryId") || "").trim() || null;
    if (!mlCategoryId) {
      results.push("Mercado Livre: categoria não especificada. O anúncio será criado sem categoria definida — você pode editá-lo depois no Mercado Livre.");
      continue;
    }
    try {
      const listingType = String(data.get("listingType") || "classic");

      const mlPayload = {
        title: name,
        price: Number(price),
        currency_id: "BRL",
        available_quantity: Number(stock),
        category_id: mlCategoryId,
        listing_type_id: listingType === "premium" ? "gold_pro" : "gold_special",
        condition: "new",
        sku,
        description: String(data.get("description") || "").trim() || name,
        pictures: productUploadedImages.slice(0, 6),
        warranty: "Sem garantia",
        manufacturing_time: String(data.get("mlManufacturingTime") || "20 dias").trim() || "20 dias",
        attributes: buildMlProductAttributes(data, name),
      };
      const created = await marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=create-listing`, {
        method: "POST",
        body: JSON.stringify(mlPayload),
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
    const { error } = await state.supabase.from("product_listings").delete().eq("id", existing.id).eq("organization_id", state.organizationId);
    if (error) throw error;
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

async function updateLinkedMarketplaceListing(listingValue, { name, price, stock }) {
  const [marketplace, ...idParts] = String(listingValue || "").split(":");
  const externalId = idParts.join(":");
  if (!externalId || normalizeMarketplaceChannel(marketplace) !== "mercado-livre") return null;
  return marketplaceRequest(`${supabaseFunctionUrl("marketplace-sync")}?marketplace=ml&action=edit&item_id=${encodeURIComponent(externalId)}`, {
    method: "POST",
    body: JSON.stringify({
      title: name,
      price: Number(price),
      available_quantity: Number(stock),
    }),
  });
}

export async function deleteProduct(id) {
  if (!ensureCanEdit()) return;
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const confirmed = await showAppConfirm(`Excluir ${product.name}?`, "O produto será removido do catálogo interno e seus vínculos locais serão desassociados.", { confirmLabel: "Excluir produto", danger: true });
  if (!confirmed) return;
  const { error } = await state.supabase.from("products").delete().eq("id", id).eq("organization_id", state.organizationId);
  if (error) {
    showAppMessage("Falha ao excluir produto", error.message, "error");
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

export function applyProductAssetsToOrderForm(productId) {
  const form = byId("orderForm");
  if (!form || !productId) return;
  const product = state.products.find((item) => item.id === productId);
  const assets = getProductAssetInfo(product);
  if (assets.stlLink && form.elements.stlLink && !form.elements.stlLink.value) {
    form.elements.stlLink.value = assets.stlLink;
  }
  if (assets.imageUrl && form.elements.referenceImageUrl && !form.elements.referenceImageUrl.value) {
    form.elements.referenceImageUrl.value = assets.imageUrl;
    form.elements.referenceImageUrl.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// --- Resolucao de taxas por marketplace/tipo de anuncio ---

export function classifyMlListingType(payload) {
  const type = String(payload?.listing_type_id || "").toLowerCase();
  return type.includes("premium") || type.includes("pro") ? "premium" : "classic";
}

export function resolveChannelFeePct(channel, tier = "classic") {
  const rules = getFinancialSettings().marketplace_fee_rules;
  if (channel === "mercado-livre") return Number(rules.mercado_livre?.[tier] ?? rules.mercado_livre?.classic ?? 11.5);
  if (channel === "shopee") return Number(rules.shopee?.default ?? 14);
  if (channel === "amazon") return Number(rules.amazon?.default ?? 15);
  return Number(rules.direct?.default ?? 0);
}

export function resolveListingFeePct(listing) {
  const channel = normalizeMarketplaceChannel(listing.marketplace);
  const tier = channel === "mercado-livre" ? classifyMlListingType(listing.raw_payload || {}) : "classic";
  return resolveChannelFeePct(channel, tier);
}

// Taxa real sincronizada da API (Bloco 1.B, ver marketplace-analytics.js
// getListingFeeSync) tem prioridade sobre a estimativa por tabela. Devolve
// {pct, fixedFee, shipping, real} no mesmo formato de resolveOrderFeeInfo,
// pra getListingProfitability usar sem se importar se o dado e real ou estimado.
export function resolveListingFeeInfo(listing) {
  const channel = normalizeMarketplaceChannel(listing.marketplace);
  const product = getProductForListing(listing.marketplace, listing.external_id);
  const realSync = state.listingFeeSync?.[`${listing.marketplace}:${listing.external_id}`];
  if (realSync) {
    // CRÍTICO: NULL != 0. NULL = não conseguiu calcular frete. 0 = cliente paga tudo.
    // Se frete grátis mas não foi calculado, retorna null em vez de 0 para alertar UX
    const shippingCost = realSync.shipping_cost;
    const isFreeShipping = realSync.free_shipping === true;
    const finalShipping = shippingCost !== null && shippingCost !== undefined
      ? Number(shippingCost)
      : isFreeShipping ? null : 0;

    return {
      pct: Number(realSync.real_fee_pct || 0),
      fixedFee: Number(realSync.real_fee_fixed || 0),
      shipping: finalShipping,
      real: true,
      notCalculated: isFreeShipping && (shippingCost === null || shippingCost === undefined),
    };
  }
  const tier = channel === "mercado-livre" ? classifyMlListingType(listing.raw_payload || {}) : "classic";
  return {
    pct: resolveChannelFeePct(channel, tier),
    fixedFee: resolveFixedFee(channel, Number(listing.price || 0)),
    shipping: resolveShippingCost(product?.weight_kg, null),
    real: false,
  };
}

// Matematica de margem compartilhada entre anuncios, vendas reais e a previa do cadastro de produto.
// fixedFee: taxa fixa (R$) de itens de baixo valor, somada a comissao % (resolveFixedFee).
export function computeMarginBreakdown({ cost, revenue, feePct = 0, taxPct = 0, shipping = 0, packaging = 0, fixedFee = 0 }) {
  return computeMarginBreakdownValue(
    { cost, revenue, feePct, taxPct, shipping, packaging, fixedFee },
    getFinancialSettings().profitability_thresholds,
  );
}

export function resolveOrderFeeInfo(order) {
  const channel = getOrderMarketplaceChannel(order);
  const rules = getFinancialSettings().marketplace_fee_rules;
  if (channel === "direct") return { pct: Number(rules.direct?.default ?? 0), real: false, fixedFee: 0 };
  const link = state.marketplaceSales.find((sale) => sale.internal_order_id === order.id);
  const items = link?.raw_payload?.order_items || [];
  const realFee = items.reduce((total, item) => total + Number(item.sale_fee || 0), 0);
  if (realFee > 0) {
    const amount = Number(link.raw_payload?.total_amount
      || items.reduce((total, item) => total + Number(item.unit_price || 0) * Number(item.quantity || 1), 0));
    // Fee real da venda ja vem com qualquer taxa fixa embutida (sale_fee e o
    // valor total cobrado pelo marketplace) - nao soma fixedFee de novo aqui.
    return { pct: amount > 0 ? (realFee / amount) * 100 : 0, real: true, feeAmount: realFee, fixedFee: 0 };
  }
  const fixedFee = resolveFixedFee(channel, Number(order.received || order.charged || 0));
  if (channel === "mercado-livre") return { pct: Number(rules.mercado_livre?.classic ?? 11.5), real: false, fixedFee };
  const key = channel === "shopee" ? "shopee" : channel === "tiktok-shop" ? "tiktok_shop" : "amazon";
  return { pct: Number(rules[key]?.default ?? 0), real: false, fixedFee };
}

// --- Rentabilidade (por anuncio e por venda real) ---

export function getListingProfitability(listing) {
  const product = getProductForListing(listing.marketplace, listing.external_id);
  if (!product) return { hasCost: false };
  const settings = getFinancialSettings();
  const feeInfo = resolveListingFeeInfo(listing);
  const breakdown = computeMarginBreakdown({
    cost: product.cost_price,
    revenue: listing.price,
    feePct: feeInfo.pct,
    fixedFee: feeInfo.fixedFee,
    taxPct: settings.default_tax_pct,
    shipping: feeInfo.shipping,
    packaging: 0,
  });
  return { hasCost: true, product, ...breakdown, real: feeInfo.real };
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
    fixedFee: feeInfo.fixedFee,
    taxPct: settings.default_tax_pct,
    shipping: resolveShippingCost(product.weight_kg, settings.default_shipping_cost),
    packaging: 0,
  });
  return { hasCost: true, product, ...breakdown, real: feeInfo.real };
}

export function renderProfitabilityBadge(listing) {
  if (!hasCommercialIntelligenceAccess()) return "";
  const profitability = getListingProfitability(listing);
  if (!profitability.hasCost) return `<span class="badge neutral" title="Cadastre o custo deste produto para ver a rentabilidade">Sem custo</span>`;
  return `<span class="badge ${profitability.level.className}" title="${html(profitability.level.label)} - margem estimada: ${profitability.marginPct.toFixed(1)}%">${Math.round(profitability.marginPct)}%</span>`;
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
      const fixedFeeRule = resolveFixedFeeRule(normalizeMarketplaceChannel(listing.marketplace));
      const suggestedPrice = calculatePriceSuggestion({
        cost: profitability.cost, feePct: profitability.feePct, taxPct: settings.default_tax_pct,
        shipping: profitability.shipping, packaging: profitability.packaging,
        fixedFee: fixedFeeRule.amount, fixedFeeThreshold: fixedFeeRule.threshold,
        targetMarginPct: settings.profitability_thresholds.healthy,
      });
      potentialProfit += suggestedPrice ? suggestedPrice * (settings.profitability_thresholds.healthy / 100) : Math.max(profitability.netProfit, 0);
    } else {
      potentialProfit += profitability.netProfit;
    }
  });
  return { currentProfit, potentialProfit, itemsBelowHealthy };
}

// Totais do portfolio (todos os anuncios com custo cadastrado) - usados nos
// KPIs do painel de rentabilidade e no relatorio de Inteligencia Comercial.
// Receita e estimada com base no preco de listagem (mesma convencao usada em
// getListingProfitability), nao no volume real de vendas.
export function getPortfolioTotals() {
  let revenueTotal = 0;
  let costTotal = 0;
  let feeTotal = 0;
  let netProfitTotal = 0;
  let marginSum = 0;
  let count = 0;
  state.marketplaceListings.forEach((listing) => {
    const profitability = getListingProfitability(listing);
    if (!profitability.hasCost) return;
    revenueTotal += profitability.revenue;
    costTotal += profitability.cost;
    feeTotal += profitability.feeAmount + (profitability.fixedFee || 0) + profitability.taxAmount + profitability.shipping + profitability.packaging;
    netProfitTotal += profitability.netProfit;
    marginSum += profitability.marginPct;
    count++;
  });
  return { revenueTotal, costTotal, feeTotal, netProfitTotal, avgMarginPct: count ? marginSum / count : 0, count };
}

// --- Calculadora de preco/lucro (disponivel para todos os planos) ---

// fixedFeeThreshold/fixedFee: a taxa fixa so entra se o preco resultante
// ficar abaixo do limiar (mesma regra de resolveFixedFee) - por isso o
// calculo e feito em duas passagens (o preco sugerido e o que decide se a
// taxa fixa se aplica, entao nao da pra saber de antemao sem calcular 1x sem
// ela primeiro).
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
    form.dataset.initialized = "true";
  }
  const calcListingTypeEl = byId("priceCalculatorListingType");
  if (calcListingTypeEl) calcListingTypeEl.hidden = form.elements.marketplace.value !== "mercado_livre";
  updatePriceCalculatorResult();
}

const CALCULATOR_CHANNEL_MAP = { mercado_livre: "mercado-livre", shopee: "shopee", amazon: "amazon", tiktok_shop: "tiktok-shop", direct: "direct" };

export function updatePriceCalculatorResult() {
  const form = byId("priceCalculatorForm");
  const result = byId("priceCalculatorResult");
  if (!form || !result) return;
  const data = new FormData(form);
  const marketplace = String(data.get("marketplace") || "direct");
  const listingType = String(data.get("listingType") || "classic");
  const channel = CALCULATOR_CHANNEL_MAP[marketplace] || "direct";
  const feePct = resolveChannelFeePct(channel, channel === "mercado-livre" ? listingType : "classic");
  const fixedFeeRule = resolveFixedFeeRule(channel);
  const inputs = {
    cost: number(data.get("cost")),
    feePct,
    fixedFee: fixedFeeRule.amount,
    fixedFeeThreshold: fixedFeeRule.threshold,
    taxPct: number(data.get("taxPct")),
    shipping: resolveShippingCost(number(data.get("weightKg")), data.get("shipping")),
    packaging: 0,
  };
  const settings = getFinancialSettings();
  const output = buildPriceCalculatorResult(inputs);
  const cards = [];
  if (output.minPrice) cards.push(renderPriceBreakdownCard("Preço mínimo (margem 0%)", computeMarginBreakdown({ ...inputs, revenue: output.minPrice })));
  if (output.recommendedPrice) cards.push(renderPriceBreakdownCard(`Preço recomendado (margem ${settings.profitability_thresholds.healthy}%)`, computeMarginBreakdown({ ...inputs, revenue: output.recommendedPrice })));
  if (output.premiumPrice) cards.push(renderPriceBreakdownCard(`Preço premium (margem ${settings.profitability_thresholds.excellent}%)`, computeMarginBreakdown({ ...inputs, revenue: output.premiumPrice })));

  const targetMarginPct = number(data.get("targetMargin"));
  if (targetMarginPct > 0) {
    const targetPrice = calculatePriceSuggestion({ ...inputs, targetMarginPct });
    cards.push(targetPrice
      ? renderPriceBreakdownCard(`Meta de margem: ${targetMarginPct}%`, computeMarginBreakdown({ ...inputs, revenue: targetPrice }))
      : `<div class="empty-chart">Não é possível atingir ${targetMarginPct}% de margem com as taxas configuradas.</div>`);
  }
  result.innerHTML = cards.length ? cards.join("") : `<div class="empty-chart">Informe o custo do produto.</div>`;
}

export function bindPriceCalculatorForm() {
  const form = byId("priceCalculatorForm");
  if (!form) return;
  form.addEventListener("input", updatePriceCalculatorResult);
  form.elements.marketplace.addEventListener("change", () => {
    const calcListingTypeEl = byId("priceCalculatorListingType");
  if (calcListingTypeEl) calcListingTypeEl.hidden = form.elements.marketplace.value !== "mercado_livre";
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
    // Anuncios sem custo nao viram mais uma sugestao por item (era a origem do
    // spam de "cadastre o custo" repetido) - agora aparecem agregados no card
    // "Acao necessaria" de renderSuggestions, calculado a partir de getCostCoverage.
    if (!profitability.hasCost) return;
    if (["loss", "critical"].includes(profitability.level.key) && !openKeys.has(`reprice:${listing.external_id}`)) {
      const fixedFeeRule = resolveFixedFeeRule(normalizeMarketplaceChannel(listing.marketplace));
      const suggestedPrice = calculatePriceSuggestion({
        cost: profitability.cost, feePct: profitability.feePct, taxPct: settings.default_tax_pct,
        shipping: profitability.shipping, packaging: profitability.packaging,
        fixedFee: fixedFeeRule.amount, fixedFeeThreshold: fixedFeeRule.threshold,
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

function countRecentSalesForListing(listing) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return state.marketplaceSales.filter((sale) => {
    if (sale.marketplace !== listing.marketplace) return false;
    const itemId = sale.raw_payload?.order_items?.[0]?.item?.id;
    if (itemId !== listing.external_id) return false;
    const when = new Date(sale.raw_payload?.date_created || sale.created_at || 0).getTime();
    return when >= cutoff;
  }).length;
}

// Produtos que vendem bem mas com margem baixa - so entra se tiver pelo menos
// 5 vendas nos ultimos 30 dias (state.marketplaceSales), pra nao sugerir
// aumento de preco em anuncios sem volume relevante.
function getHighVolumeLowMarginInsights() {
  const settings = getFinancialSettings();
  const results = [];
  state.marketplaceListings.forEach((listing) => {
    const profitability = getListingProfitability(listing);
    if (!profitability.hasCost || profitability.marginPct >= settings.profitability_thresholds.healthy) return;
    const salesCount = countRecentSalesForListing(listing);
    if (salesCount < 5) return;
    const fixedFeeRule = resolveFixedFeeRule(normalizeMarketplaceChannel(listing.marketplace));
    const suggestedPrice = calculatePriceSuggestion({
      cost: profitability.cost, feePct: profitability.feePct, taxPct: profitability.taxPct,
      shipping: profitability.shipping, packaging: profitability.packaging,
      fixedFee: fixedFeeRule.amount, fixedFeeThreshold: fixedFeeRule.threshold,
      targetMarginPct: settings.profitability_thresholds.healthy,
    });
    const priceIncrease = suggestedPrice ? suggestedPrice - profitability.revenue : 0;
    if (priceIncrease <= 0) return;
    results.push({
      key: `high-volume-low-margin:${listing.marketplace}:${listing.external_id}`,
      title: listing.title,
      message: `Vende bem (${salesCount} venda${salesCount === 1 ? "" : "s"}/mês) mas tem margem de apenas ${profitability.marginPct.toFixed(1)}%. Aumente ${money.format(priceIncrease)} no preço para atingir ${settings.profitability_thresholds.healthy}% de margem.`,
      impact: priceIncrease * salesCount,
      action: { action: "simulate-listing", label: "Simular novo preço", marketplace: listing.marketplace, externalId: listing.external_id },
    });
  });
  return results.sort((a, b) => b.impact - a.impact).slice(0, 3);
}

// Mesmo produto vinculado a mais de um marketplace com margem bem diferente
// entre os canais (>=15 pontos percentuais de diferenca).
function getChannelGapInsights() {
  const byProduct = new Map();
  state.marketplaceListings.forEach((listing) => {
    const product = getProductForListing(listing.marketplace, listing.external_id);
    if (!product) return;
    const profitability = getListingProfitability(listing);
    if (!profitability.hasCost) return;
    const entry = byProduct.get(product.id) || { product, channels: [] };
    entry.channels.push({ listing, profitability });
    byProduct.set(product.id, entry);
  });
  const results = [];
  byProduct.forEach(({ product, channels }) => {
    if (channels.length < 2) return;
    const sorted = channels.slice().sort((a, b) => b.profitability.marginPct - a.profitability.marginPct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = best.profitability.marginPct - worst.profitability.marginPct;
    if (gap < 15) return;
    results.push({
      key: `channel-gap:${product.id}`,
      title: product.name,
      message: `Tem ${best.profitability.marginPct.toFixed(1)}% de margem em ${html(marketplaceDisplayName(best.listing.marketplace))} mas só ${worst.profitability.marginPct.toFixed(1)}% em ${html(marketplaceDisplayName(worst.listing.marketplace))}. Priorize vendas pelo canal com maior margem.`,
    });
  });
  return results.slice(0, 3);
}

// Frete como % media do preco no portfolio com custo cadastrado.
function getShippingShareInsight() {
  const withCost = state.marketplaceListings.map(getListingProfitability).filter((item) => item.hasCost && item.revenue > 0);
  if (!withCost.length) return null;
  const avgPct = withCost.reduce((sum, item) => sum + (item.shipping / item.revenue) * 100, 0) / withCost.length;
  if (avgPct < 15) return null;
  return {
    key: "shipping-share",
    title: "Frete representa uma fatia grande do preço",
    message: `Frete representa em média ${avgPct.toFixed(1)}% do preço dos seus anúncios com custo cadastrado. Avalie embutir o frete no preço ou revisar a estratégia de envio.`,
  };
}

function estimateRepriceImpact(suggestion) {
  const listing = state.marketplaceListings.find((item) => item.marketplace === suggestion.marketplace && item.external_id === suggestion.target_id);
  if (!listing || !suggestion.suggested_price) return 0;
  const profitability = getListingProfitability(listing);
  if (!profitability.hasCost) return 0;
  const projected = computeMarginBreakdown({
    cost: profitability.cost, revenue: suggestion.suggested_price, feePct: profitability.feePct,
    taxPct: profitability.taxPct, shipping: profitability.shipping, packaging: profitability.packaging,
  });
  return Math.max(projected.netProfit - profitability.netProfit, 0);
}

function renderInsightCard(insight) {
  return `
    <div class="suggestion-insight-card">
      <div>
        <strong>${html(insight.title)}</strong>
        <span>${html(insight.message)}</span>
      </div>
      <div class="inline-actions">
        ${insight.action ? `<button class="secondary-btn" type="button" data-action="${html(insight.action.action)}" data-marketplace="${html(insight.action.marketplace || "")}" data-external-id="${html(insight.action.externalId || "")}">${html(insight.action.label)}</button>` : ""}
        <button class="icon-btn" type="button" data-action="dismiss-insight" data-insight-key="${html(insight.key)}">Dispensar</button>
      </div>
    </div>
  `;
}

export function dismissInsight(key) {
  if (!state.dismissedInsightKeys.includes(key)) state.dismissedInsightKeys.push(key);
  renderSuggestions();
}

export function renderSuggestions() {
  const target = byId("suggestionsList");
  if (!target) return;
  const sections = [];
  const dismissed = state.dismissedInsightKeys;

  const coverage = getCostCoverage();
  const missing = coverage.total - coverage.withCost;
  if (missing > 0) {
    sections.push(`
      <div class="suggestion-action-card">
        <div>
          <strong>${missing} anúncio${missing === 1 ? "" : "s"} sem custo cadastrado</strong>
          <span>Sem o custo, não é possível calcular margem ou lucro desses anúncios.</span>
        </div>
        <button class="primary-btn" type="button" data-action="open-bulk-cost-dialog">Cadastrar em lote</button>
      </div>
    `);
  }

  const openReprice = state.commercialSuggestions
    .filter((item) => item.status === "open" && item.kind === "reprice")
    .sort((a, b) => (a.current_margin ?? 0) - (b.current_margin ?? 0));
  if (openReprice.length) {
    const totalImpact = openReprice.reduce((sum, item) => sum + estimateRepriceImpact(item), 0);
    sections.push(`
      <details class="suggestion-group" open>
        <summary>
          <span>${openReprice.length} anúncio${openReprice.length === 1 ? "" : "s"} com margem abaixo do saudável — ajuste o preço ou revise o custo</span>
          ${totalImpact > 0 ? `<span class="suggestion-group-impact">+${money.format(totalImpact)}/mês estimado</span>` : ""}
        </summary>
        <div class="suggestion-group-list">
          ${openReprice.map((item) => `
            <div class="list-row suggestion-row">
              <div>
                <strong>${html(item.title)}</strong>
                <span>${html(item.message)}</span>
              </div>
              <div class="inline-actions">
                ${item.suggested_price ? `<button class="secondary-btn" type="button" data-action="simulate-listing" data-marketplace="${html(item.marketplace)}" data-external-id="${html(item.target_id)}">Simular novo preço</button>` : ""}
                <button class="secondary-btn" type="button" data-action="resolve-suggestion" data-id="${html(item.id)}">Resolvido</button>
                <button class="icon-btn" type="button" data-action="dismiss-suggestion" data-id="${html(item.id)}">Dispensar</button>
              </div>
            </div>
          `).join("")}
        </div>
      </details>
    `);
  }

  getHighVolumeLowMarginInsights().filter((insight) => !dismissed.includes(insight.key)).forEach((insight) => sections.push(renderInsightCard(insight)));
  getChannelGapInsights().filter((insight) => !dismissed.includes(insight.key)).forEach((insight) => sections.push(renderInsightCard(insight)));
  const shippingInsight = getShippingShareInsight();
  if (shippingInsight && !dismissed.includes(shippingInsight.key)) sections.push(renderInsightCard(shippingInsight));

  target.innerHTML = sections.length ? sections.join("") : `<div class="empty-chart">Nenhuma sugestão no momento.</div>`;
  bindActions();
}

async function updateSuggestionStatus(id, status) {
  if (!ensureCanEdit()) return;
  const { error } = await state.supabase.from("commercial_suggestions").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", state.organizationId);
  if (error) {
    showAppMessage("Falha ao atualizar sugestão", error.message, "error");
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
  const insightTarget = byId("marketplaceComparisonInsight");
  if (!target) return;
  const rows = ["mercado-livre", "shopee", "amazon"].map((channel) => {
    const listings = state.marketplaceListings.filter((item) => normalizeMarketplaceChannel(item.marketplace) === channel);
    const withCost = listings.map(getListingProfitability).filter((item) => item.hasCost);
    const avgMargin = withCost.length ? withCost.reduce((sum, item) => sum + item.marginPct, 0) / withCost.length : null;
    const avgProfit = withCost.length ? withCost.reduce((sum, item) => sum + item.netProfit, 0) / withCost.length : null;
    return { channel, label: marketplaceDisplayName(channel), count: listings.length, avgMargin, avgProfit };
  }).filter((row) => row.count > 0);

  const withMargin = rows.filter((row) => row.avgMargin !== null);
  const best = withMargin.length ? withMargin.reduce((a, b) => (b.avgMargin > a.avgMargin ? b : a)) : null;
  const worst = withMargin.length ? withMargin.reduce((a, b) => (b.avgMargin < a.avgMargin ? b : a)) : null;
  const hasGap = Boolean(best && worst && best.channel !== worst.channel && best.avgMargin - worst.avgMargin >= 5);

  target.innerHTML = rows.length ? rows.map((row) => {
    let recommendation = "Estável";
    if (row.avgMargin === null) recommendation = "-";
    else if (hasGap && row.channel === best.channel) recommendation = "Priorizar este canal";
    else if (hasGap && row.channel === worst.channel) recommendation = "Revisar preço ou taxas";
    return `
      <tr>
        <td>${html(row.label)}</td>
        <td>${row.count}</td>
        <td>${row.avgMargin === null ? "-" : `${row.avgMargin.toFixed(1)}%`}</td>
        <td>${row.avgProfit === null ? "-" : money.format(row.avgProfit)}</td>
        <td>${html(recommendation)}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="5">Nenhum anúncio sincronizado ainda.</td></tr>`;

  if (insightTarget) {
    insightTarget.hidden = !hasGap;
    if (hasGap) {
      insightTarget.textContent = `Sua margem média no ${best.label} é ${best.avgMargin.toFixed(1)}%, no ${worst.label} é ${worst.avgMargin.toFixed(1)}%. Considere priorizar o canal com maior margem.`;
    }
  }
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

// --- Aba "Inteligência" dentro de Marketplace ---

function renderIntelligenceEmptyState(coverage) {
  const target = byId("intelligenceEmptyState");
  if (!target) return;

  const withoutCost = coverage.total - coverage.withCost;
  const progressBar = byId("intelligenceCoverageFill");
  const progressLabel = byId("intelligenceLabel");

  if (progressBar) progressBar.style.width = `${coverage.pct}%`;
  if (progressLabel) {
    progressLabel.textContent = `${coverage.withCost} de ${coverage.total} anúncios com custo cadastrado (${coverage.pct}%)`;
  }

  // Adicionar botão "Cadastrar em lote" se houver anúncios sem custo
  const bulkBtn = byId("bulkAddCostBtn");
  if (bulkBtn) {
    bulkBtn.hidden = withoutCost === 0;
    if (withoutCost > 0) {
      bulkBtn.textContent = `📊 Cadastrar ${withoutCost} custo${withoutCost === 1 ? "" : "s"} em lote`;
      bulkBtn.onclick = () => openBulkCostDialog(coverage);
    }
  }
}

// Diálogo para cadastro de custos em lote
export async function openBulkCostDialog(coverage) {
  const listingsWithoutCost = state.marketplaceListings.filter(
    listing => !getListingProfitability(listing).hasCost
  );

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: var(--panel); padding: 28px; border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); z-index: 10000;
    max-width: 600px; width: 90vw; max-height: 80vh; overflow-y: auto;
  `;

  let rows = listingsWithoutCost.map(listing => ({
    listing,
    name: listing.title || listing.name || 'Produto sem nome',
    price: Number(listing.price || 0),
    cost: 0,
  }));

  const renderForm = () => {
    const formHTML = rows.map((row, idx) => `
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--line); align-items: center;">
        <input type="text" value="${html(row.name)}" disabled style="background: transparent; border: none; padding: 6px 0; color: var(--ink); font-size: 13px;">
        <div style="text-align: center; font-size: 12px; color: var(--muted);">R\$ ${row.price.toFixed(2)}</div>
        <input data-bulk-cost="${idx}" type="number" step="0.01" min="0" value="${row.cost}" placeholder="Custo" aria-label="Custo de ${html(row.name)}" style="padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px;">
      </div>
    `).join('');

    dialog.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 600;">Cadastro em lote</h2>
        <button style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--muted);">✕</button>
      </div>

      <div style="margin-bottom: 16px; font-size: 12px; color: var(--muted);">
        <strong>${rows.length}</strong> produto${rows.length === 1 ? "" : "s"} sem custo
      </div>

      <div style="background: var(--canvas); padding: 12px; border-radius: 8px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; margin-bottom: 8px;">
          <div>Produto</div>
          <div style="text-align: center;">Preço</div>
          <div>Custo</div>
        </div>
        <div>${formHTML}</div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button id="saveBulkCosts" style="flex: 1; background: var(--teal); color: white; border: none; padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px;">💾 Salvar custos</button>
        <button id="closeBulkDialog" style="flex: 1; background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 12px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 13px;">Cancelar</button>
      </div>
    `;

    dialog.querySelector("#closeBulkDialog")?.addEventListener("click", () => dialog.remove());
    dialog.querySelectorAll("[data-bulk-cost]").forEach((input) => {
      input.addEventListener("input", () => {
        rows[Number(input.dataset.bulkCost)].cost = Number(input.value || 0);
      });
    });
    dialog.querySelector("#saveBulkCosts")?.addEventListener("click", () => saveBulkCosts(rows, dialog));
  };

  renderForm();
  document.body.appendChild(dialog);
}

export async function saveBulkCosts(input, dialog) {
  if (!ensureCanEdit()) return;
  let rows = input;
  if (input instanceof Event) {
    input.preventDefault();
    rows = Array.from(input.currentTarget.querySelectorAll("[data-bulk-cost-row]")).map((row) => ({
      listing: state.marketplaceListings.find((listing) =>
        listing.marketplace === row.dataset.marketplace && listing.external_id === row.dataset.externalId
      ),
      cost: Number(row.querySelector('[name="cost"]')?.value || 0),
    }));
  }
  const validRows = (Array.isArray(rows) ? rows : []).filter((row) => row.listing && Number(row.cost) > 0);
  if (!validRows.length) {
    showAppMessage("Custo necessário", "Informe ao menos um custo maior que zero.", "warning");
    return;
  }

  let savedCount = 0;
  try {
    for (const row of validRows) {
      let product = getProductForListing(row.listing.marketplace, row.listing.external_id);
      if (product) {
        const { data, error } = await state.supabase.from("products")
          .update({ cost_price: Number(row.cost), updated_at: new Date().toISOString() })
          .eq("organization_id", state.organizationId)
          .eq("id", product.id)
          .select()
          .single();
        if (error) throw error;
        Object.assign(product, data);
      } else {
        const name = row.listing.title || row.listing.name || "Produto marketplace";
        const { data, error } = await state.supabase.from("products").insert({
          organization_id: state.organizationId,
          sku: nextProductSku("Marketplace", name),
          name,
          category: "Marketplace",
          cost_price: Number(row.cost),
          updated_at: new Date().toISOString(),
        }).select().single();
        if (error) throw error;
        product = data;
        state.products.push(product);
        const { data: link, error: linkError } = await state.supabase.from("product_listings").insert({
          organization_id: state.organizationId,
          product_id: product.id,
          marketplace: row.listing.marketplace,
          external_id: row.listing.external_id,
        }).select().single();
        if (linkError) throw linkError;
        state.productListings.push(link);
      }
      savedCount += 1;
    }
    showAppMessage("Custos salvos", `${savedCount} custo${savedCount === 1 ? " foi salvo" : "s foram salvos"}.`, "success");
    dialog?.remove();
    renderBulkCostRows();
    renderCommercialIntelligence();
  } catch (error) {
    showAppMessage("Falha ao salvar custos", error.message, "error");
  }
}

export function renderCommercialIntelligence() {
  renderProductCatalogTable();
  const syncFeeBtn = byId("syncFeeCalculatorBtn");
  if (syncFeeBtn) syncFeeBtn.hidden = false;
  if (isMarketplaceAccountConnected("mercado-livre")) {
    syncFeeCalculatorFull();
  }
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
  renderIntelligenceDecisionBoard();
  renderProfitabilitySummaryPanel();
  renderProfitabilityDistributionChart();
  renderTopProductsProfitChart();
  renderListingProfitabilityTable();
  renderSuggestions();
  renderProfitSimulator();
  renderMarketplaceComparison();
}

function getListingAnalyticsSnapshot(listing) {
  return state.listingAnalytics?.[`${listing.marketplace}:${listing.external_id}`] || null;
}

function getIntelligenceDecisionData() {
  const coverage = getCostCoverage();
  const missingCost = Math.max(coverage.total - coverage.withCost, 0);
  const summary = getProfitabilitySummary();
  const atRisk = summary.loss + summary.critical + summary.attention;
  const potential = getProfitPotential();
  const potentialGain = Math.max(potential.potentialProfit - potential.currentProfit, 0);
  const rows = state.marketplaceListings.map((listing) => ({
    listing,
    profitability: getListingProfitability(listing),
    analytics: getListingAnalyticsSnapshot(listing),
  }));
  const withAnalytics = rows.filter((row) => row.analytics);
  const avgConversion = withAnalytics.length
    ? withAnalytics.reduce((sum, row) => sum + Number(row.analytics.conversion_rate || 0), 0) / withAnalytics.length
    : null;
  const highViewsLowSales = withAnalytics.filter((row) =>
    Number(row.analytics.visits || 0) >= 50
    && Number(row.analytics.sales_30d || row.analytics.sales || 0) === 0
  );
  const noTraffic = withAnalytics.filter((row) => Number(row.analytics.visits || row.analytics.visits_7d || 0) === 0);
  const investable = rows
    .filter((row) => row.profitability.hasCost && row.profitability.marginPct >= 20 && row.analytics)
    .sort((a, b) => Number(b.analytics.conversion_rate || 0) - Number(a.analytics.conversion_rate || 0));
  const intentRows = withAnalytics
    .map((row) => ({
      ...row,
      intentScore: Number(row.analytics.visits_7d || 0)
        + Number(row.analytics.questions || row.analytics.questions_7d || 0) * 12
        + Number(row.analytics.sales_30d || row.analytics.sales || 0) * 20
        + Number(row.analytics.conversion_rate || 0) * 4,
    }))
    .sort((a, b) => b.intentScore - a.intentScore);
  return { missingCost, atRisk, potentialGain, avgConversion, highViewsLowSales, noTraffic, investable, intentRows };
}

function renderDecisionCard(card) {
  return `
    <article class="intelligence-decision-card ${card.tone}">
      <div>
        <span>${html(card.label)}</span>
        <strong>${html(card.value)}</strong>
        <small>${html(card.detail)}</small>
      </div>
      ${card.items?.length ? `<ul>${card.items.slice(0, 2).map((item) => `<li>${html(item)}</li>`).join("")}</ul>` : ""}
      ${card.action ? `<button class="${html(card.action.className || "secondary-btn")}" type="button" data-action="${html(card.action.action)}">${html(card.action.label)}</button>` : ""}
    </article>
  `;
}

function renderIntelligenceDecisionBoard() {
  const target = byId("intelligenceDecisionBoard");
  if (!target) return;
  const decision = getIntelligenceDecisionData();
  const mainPerformanceIssue = decision.highViewsLowSales.length
    ? `${decision.highViewsLowSales.length} anuncio(s) com visita e sem venda`
    : decision.noTraffic.length
      ? `${decision.noTraffic.length} anuncio(s) sem trafego`
      : decision.avgConversion == null
        ? "Metricas nao sincronizadas"
        : `Conversao media ${decision.avgConversion.toFixed(1)}%`;
  const investTop = decision.investable[0];
  const intentTop = decision.intentRows[0];
  const actionLabel = decision.missingCost
    ? "Cadastrar custos"
    : decision.atRisk
      ? "Revisar margem"
      : decision.potentialGain > 0
        ? "Simular precos"
        : "Monitorar";
  const cards = [
    {
      tone: decision.highViewsLowSales.length || decision.noTraffic.length ? "warning" : "ok",
      label: "Diagnostico de performance",
      value: mainPerformanceIssue,
      detail: decision.avgConversion == null ? "Atualize metricas para puxar dados do Mercado Livre." : "Gargalo principal antes da tabela detalhada.",
      items: [
        decision.highViewsLowSales[0] ? `Revisar: ${decision.highViewsLowSales[0].listing.title}` : "",
        decision.noTraffic[0] ? `Sem trafego: ${decision.noTraffic[0].listing.title}` : "",
      ].filter(Boolean),
      action: { action: "sync-analytics-full", label: "Atualizar metricas" },
    },
    {
      tone: investTop ? "opportunity" : "neutral",
      label: "Onde investir",
      value: investTop ? investTop.listing.title : "Sem candidato claro",
      detail: investTop ? `Margem ${investTop.profitability.marginPct.toFixed(1)}% e melhor conversao relativa.` : "Cadastre custos e sincronize metricas.",
      items: investTop ? [`Lucro unitario: ${money.format(investTop.profitability.netProfit)}`] : [],
    },
    {
      tone: intentTop ? "ok" : "neutral",
      label: "Intencao de compra",
      value: intentTop ? intentTop.listing.title : "Sem sinais recentes",
      detail: intentTop ? "Maior combinacao de visitas, perguntas, vendas e conversao." : "Sincronize metricas e perguntas.",
      items: intentTop ? [
        `${Number(intentTop.analytics.visits_7d || intentTop.analytics.visits || 0)} visitas recentes`,
        `${Number(intentTop.analytics.questions || intentTop.analytics.questions_7d || 0)} perguntas`,
      ] : [],
    },
    {
      tone: decision.missingCost || decision.atRisk ? "danger" : "ok",
      label: "Acao recomendada",
      value: actionLabel,
      detail: decision.missingCost
        ? `${decision.missingCost} anuncio(s) sem custo impedem margem real.`
        : decision.atRisk
          ? `${decision.atRisk} anuncio(s) pedem revisao de preco, frete ou taxa.`
          : `Ganho potencial estimado: ${money.format(decision.potentialGain)}.`,
      action: decision.missingCost
        ? { action: "open-bulk-cost-dialog", label: "Cadastrar custos", className: "primary-btn" }
        : null,
    },
  ];
  target.innerHTML = cards.map(renderDecisionCard).join("");
  bindActions();
}

function renderIntelligencePriorityStrip() {
  const target = byId("intelligencePriorityStrip");
  if (!target) return;
  const coverage = getCostCoverage();
  const missingCost = Math.max(coverage.total - coverage.withCost, 0);
  const summary = getProfitabilitySummary();
  const atRisk = summary.loss + summary.critical + summary.attention;
  const healthy = summary.healthy + summary.excellent;
  const potential = getProfitPotential();
  const potentialGain = Math.max(potential.potentialProfit - potential.currentProfit, 0);
  const cards = [
    {
      tone: missingCost ? "warning" : "ok",
      label: "Custos pendentes",
      value: String(missingCost),
      detail: missingCost ? "Complete para liberar margem real" : "Cobertura de custos em dia",
    },
    {
      tone: atRisk ? "danger" : "ok",
      label: "Margem em atenção",
      value: String(atRisk),
      detail: atRisk ? "Revise preço, taxa ou frete" : "Sem anúncios em faixa crítica",
    },
    {
      tone: healthy ? "ok" : "neutral",
      label: "Saudáveis",
      value: String(healthy),
      detail: "Anúncios com margem saudável ou excelente",
    },
    {
      tone: potentialGain > 0 ? "opportunity" : "neutral",
      label: "Ganho potencial",
      value: money.format(potentialGain),
      detail: "Estimativa ao reprecificar itens abaixo da meta",
    },
  ];
  target.innerHTML = cards.map((card) => `
    <article class="intelligence-priority-card ${card.tone}">
      <span>${html(card.label)}</span>
      <strong>${html(card.value)}</strong>
      <small>${html(card.detail)}</small>
    </article>
  `).join("");
}

export function renderProfitabilitySummaryPanel() {
  const target = byId("intelligenceSummaryGrid");
  if (!target) return;
  const totals = getPortfolioTotals();
  const potential = getProfitPotential();
  const profitColor = totals.netProfitTotal >= 0 ? "var(--green)" : "var(--red)";
  const potentialGain = Math.max(potential.potentialProfit - potential.currentProfit, 0);
  target.innerHTML = `
    <article><span>Receita bruta total</span><strong>${money.format(totals.revenueTotal)}</strong><small>Estimado, ${totals.count} anúncio${totals.count === 1 ? "" : "s"} com custo</small></article>
    <article><span>Custo total</span><strong>${money.format(totals.costTotal)}</strong></article>
    <article><span>Taxas estimadas totais</span><strong>${money.format(totals.feeTotal)}</strong><small>Comissão + imposto + frete</small></article>
    <article><span>Lucro líquido total</span><strong style="color:${profitColor}">${money.format(totals.netProfitTotal)}</strong></article>
    <article><span>Margem média</span><strong>${totals.avgMarginPct.toFixed(1)}%</strong></article>
    <article><span>Lucro potencial estimado</span><strong style="color:var(--green)">${money.format(potentialGain)}</strong><small>Estimado, se reprecificado para margem saudável</small></article>
  `;
}

// --- Graficos (reaproveitam renderBarChart, ja existente em core/charts.js) ---

const PROFITABILITY_CHART_COLORS = {
  loss: "#dc2626",
  critical: "#f97316",
  attention: "#eab308",
  healthy: "#22c55e",
  excellent: "#15803c",
};

export function renderProfitabilityDistributionChart() {
  const counts = getProfitabilitySummary();
  renderBarChart("profitabilityDistributionChart", [
    { label: "Prejuízo", value: counts.loss, color: PROFITABILITY_CHART_COLORS.loss },
    { label: "Crítico", value: counts.critical, color: PROFITABILITY_CHART_COLORS.critical },
    { label: "Atenção", value: counts.attention, color: PROFITABILITY_CHART_COLORS.attention },
    { label: "Saudável", value: counts.healthy, color: PROFITABILITY_CHART_COLORS.healthy },
    { label: "Excelente", value: counts.excellent, color: PROFITABILITY_CHART_COLORS.excellent },
  ]);
}

export function renderTopProductsProfitChart() {
  const top = state.marketplaceListings
    .map((listing) => ({ listing, profitability: getListingProfitability(listing) }))
    .filter((row) => row.profitability.hasCost)
    .sort((a, b) => b.profitability.netProfit - a.profitability.netProfit)
    .slice(0, 10);
  renderBarChart("topProductsProfitChart", top.map(({ listing, profitability }) => ({
    label: (listing.title || listing.external_id || "").length > 24 ? `${listing.title.slice(0, 24)}…` : (listing.title || listing.external_id),
    value: profitability.netProfit,
    color: PROFITABILITY_CHART_COLORS[profitability.level.key],
    format: (value) => money.format(value),
  })));
}

// --- Tabela de rentabilidade por anuncio (filtros + ordenacao) ---

export function getListingsProfitabilityTable() {
  const levelFilter = state.intelligenceTableLevelFilter;
  const marketplaceFilter = state.intelligenceTableMarketplaceFilter;
  const sortBy = state.intelligenceTableSort;
  const rows = state.marketplaceListings
    .map((listing) => ({ listing, profitability: getListingProfitability(listing) }))
    .filter((row) => row.profitability.hasCost)
    .filter((row) => levelFilter === "all" || row.profitability.level.key === levelFilter)
    .filter((row) => marketplaceFilter === "all" || normalizeMarketplaceChannel(row.listing.marketplace) === marketplaceFilter);
  const sorters = {
    margin_desc: (a, b) => b.profitability.marginPct - a.profitability.marginPct,
    margin_asc: (a, b) => a.profitability.marginPct - b.profitability.marginPct,
    profit_desc: (a, b) => b.profitability.netProfit - a.profitability.netProfit,
    price_desc: (a, b) => Number(b.listing.price || 0) - Number(a.listing.price || 0),
    name_asc: (a, b) => (a.listing.title || "").localeCompare(b.listing.title || "", "pt-BR"),
  };
  return rows.sort(sorters[sortBy] || sorters.margin_desc);
}

export function renderListingProfitabilityTable() {
  const target = byId("listingProfitabilityTable");
  if (!target) return;
  const rows = getListingsProfitabilityTable();
  target.innerHTML = rows.length ? rows.map(({ listing, profitability }) => {
    const feesTotal = profitability.feeAmount + (profitability.fixedFee || 0) + profitability.taxAmount + profitability.shipping + profitability.packaging;
    const feeBreakdown = `Comissão ${profitability.feePct.toFixed(1)}%: ${money.format(profitability.feeAmount)}`
      + (profitability.fixedFee > 0 ? ` + Taxa fixa: ${money.format(profitability.fixedFee)}` : "")
      + ` + Imposto: ${money.format(profitability.taxAmount)} + Frete: ${money.format(profitability.shipping)}`;
    const profitColor = profitability.netProfit >= 0 ? "var(--green)" : "var(--red)";
    const feeSourceTag = profitability.real
      ? `<span class="badge done" title="Taxa sincronizada da API do Mercado Livre">real</span>`
      : `<span class="badge neutral" title="Estimativa por tabela - conecte o Mercado Livre e sincronize as taxas para o valor real">estimado</span>`;
    return `
      <tr>
        <td class="listing-profitability-name" title="${html(listing.title)}"><button class="link-cell" type="button" data-action="open-listing-drawer" data-marketplace="${html(listing.marketplace)}" data-external-id="${html(listing.external_id)}">${html(listing.title)}</button></td>
        <td><span class="badge neutral">${html(marketplaceDisplayName(listing.marketplace))}</span></td>
        <td>${money.format(Number(listing.price || 0))}</td>
        <td>${money.format(profitability.cost)}</td>
        <td title="${html(feeBreakdown)}">${money.format(feesTotal)} ${feeSourceTag}</td>
        <td style="color:${profitColor}">${money.format(profitability.netProfit)}</td>
        <td><span class="badge ${profitability.level.className}">${profitability.marginPct.toFixed(1)}%</span></td>
        <td><button class="icon-btn" type="button" data-action="simulate-listing" data-marketplace="${html(listing.marketplace)}" data-external-id="${html(listing.external_id)}">Simular</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8">Nenhum anúncio com custo cadastrado para este filtro.</td></tr>`;
  renderListingProfitabilityTotals(rows);
  bindActions();
}

function renderListingProfitabilityTotals(rows) {
  const target = byId("listingProfitabilityTotals");
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = "";
    return;
  }
  const revenueTotal = rows.reduce((sum, row) => sum + row.profitability.revenue, 0);
  const costTotal = rows.reduce((sum, row) => sum + row.profitability.cost, 0);
  const feeTotal = rows.reduce((sum, row) => sum + row.profitability.feeAmount + (row.profitability.fixedFee || 0) + row.profitability.taxAmount + row.profitability.shipping + row.profitability.packaging, 0);
  const netProfitTotal = rows.reduce((sum, row) => sum + row.profitability.netProfit, 0);
  const avgMargin = rows.reduce((sum, row) => sum + row.profitability.marginPct, 0) / rows.length;
  target.innerHTML = `
    <tr class="table-totals-row">
      <td>Total (${rows.length})</td>
      <td></td>
      <td>${money.format(revenueTotal)}</td>
      <td>${money.format(costTotal)}</td>
      <td>${money.format(feeTotal)}</td>
      <td>${money.format(netProfitTotal)}</td>
      <td>${avgMargin.toFixed(1)}%</td>
      <td></td>
    </tr>
  `;
}

export function openPriceCalculatorForListing(marketplace, externalId) {
  const listing = state.marketplaceListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
  if (!listing) return;
  const profitability = getListingProfitability(listing);
  if (!profitability.hasCost) return;
  const form = byId("priceCalculatorForm");
  const channel = normalizeMarketplaceChannel(listing.marketplace);
  form.elements.cost.value = profitability.cost;
  form.elements.marketplace.value = channel === "mercado-livre" ? "mercado_livre" : ["shopee", "amazon"].includes(channel) ? channel : "direct";
  form.elements.listingType.value = channel === "mercado-livre" ? classifyMlListingType(listing.raw_payload || {}) : "classic";
  form.elements.taxPct.value = profitability.taxPct;
  form.elements.shipping.value = profitability.shipping;
  form.elements.targetMargin.value = "";
  form.dataset.initialized = "true";
  const calcListingTypeEl = byId("priceCalculatorListingType");
  if (calcListingTypeEl) calcListingTypeEl.hidden = form.elements.marketplace.value !== "mercado_livre";
  updatePriceCalculatorResult();
  byId("priceCalculatorDialog").showModal();
}

// --- Configuracoes financeiras por empresa ---

export function openFinancialSettingsDialog() {
  const settings = getFinancialSettings();
  const form = byId("financialSettingsForm");
  const rules = settings.marketplace_fee_rules || {};
  const tiers = settings.shipping_weight_tiers || [];
  form.elements.mlClassicFee.value = rules.mercado_livre?.classic ?? 11.5;
  form.elements.mlPremiumFee.value = rules.mercado_livre?.premium ?? 16.5;
  form.elements.mlFixedFeeAmount.value = rules.mercado_livre?.fixed_fee_amount ?? 0;
  form.elements.mlFixedFeeThreshold.value = rules.mercado_livre?.fixed_fee_threshold ?? 0;
  form.elements.shopeeFee.value = rules.shopee?.default ?? 14;
  form.elements.shopeeServiceFee.value = rules.shopee?.service_fee_pct ?? 0;
  form.elements.amazonFee.value = rules.amazon?.default ?? 15;
  form.elements.amazonFulfillmentFee.value = rules.amazon?.fulfillment_fee_pct ?? 0;
  form.elements.tiktokFee.value = rules.tiktok_shop?.default ?? 7;
  form.elements.taxPct.value = settings.default_tax_pct;
  form.elements.shippingCost.value = settings.default_shipping_cost;
  form.elements.shippingTier1.value = tiers[0]?.cost ?? 15;
  form.elements.shippingTier2.value = tiers[1]?.cost ?? 20;
  form.elements.shippingTier3.value = tiers[2]?.cost ?? 30;
  form.elements.shippingTier4.value = tiers[3]?.cost ?? 50;
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
      mercado_livre: {
        classic: number(data.get("mlClassicFee")), premium: number(data.get("mlPremiumFee")),
        fixed_fee_amount: number(data.get("mlFixedFeeAmount")), fixed_fee_threshold: number(data.get("mlFixedFeeThreshold")),
      },
      shopee: { default: number(data.get("shopeeFee")), service_fee_pct: number(data.get("shopeeServiceFee")) },
      amazon: { default: number(data.get("amazonFee")), fulfillment_fee_pct: number(data.get("amazonFulfillmentFee")) },
      tiktok_shop: { default: number(data.get("tiktokFee")) },
      direct: { default: 0 },
    },
    default_tax_pct: number(data.get("taxPct")),
    default_shipping_cost: number(data.get("shippingCost")),
    default_packaging_cost: 0,
    shipping_weight_tiers: [
      { max_kg: 0.3, cost: number(data.get("shippingTier1")) },
      { max_kg: 1, cost: number(data.get("shippingTier2")) },
      { max_kg: 5, cost: number(data.get("shippingTier3")) },
      { max_kg: 30, cost: number(data.get("shippingTier4")) },
    ],
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
    showAppMessage("Falha ao salvar configurações", error.message, "error");
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

// ==========================================================================
// Navegação entre Steps do Modal de Cadastro de Produto
// ==========================================================================

export function initProductSteps() {
  const form = byId("productForm");
  if (!form) return;

  byId("productNextBtn")?.addEventListener("click", () => goToProductStep(currentProductStep + 1));
  byId("productPrevBtn")?.addEventListener("click", () => goToProductStep(currentProductStep - 1));

  form.elements.publish_ml?.addEventListener("change", () => {
    const mlSection = byId("mlConfigSection");
    if (mlSection) {
      mlSection.style.display = form.elements.publish_ml.checked ? "block" : "none";
    }
  });
}

export function goToProductStep(step) {
  const form = byId("productForm");
  if (!form) return;

  // Validar step atual antes de passar
  if (!validateProductStep(currentProductStep)) {
    return;
  }

  step = Math.max(1, Math.min(4, step)); // Limita entre 1 e 4
  currentProductStep = step;

  // Atualizar visibilidade dos steps
  document.querySelectorAll(".form-step").forEach((el) => {
    el.style.display = el.dataset.step == step ? "block" : "none";
  });

  // Atualizar indicadores
  document.querySelectorAll(".step-indicator").forEach((el) => {
    const stepNum = parseInt(el.dataset.step);
    el.classList.toggle("active", stepNum === step);
    el.classList.toggle("completed", stepNum < step);
  });

  // Atualizar botões
  const prevBtn = byId("productPrevBtn");
  const nextBtn = byId("productNextBtn");
  const submitBtn = byId("productSubmitBtn");

  if (prevBtn) prevBtn.style.display = step > 1 ? "block" : "none";
  if (nextBtn) nextBtn.style.display = step < 4 ? "block" : "none";
  if (submitBtn) submitBtn.style.display = step === 4 ? "block" : "none";

  // No passo 3 (Marketplace) ou 4 (Resumo), atualizar preview
  if (step === 3 || step === 4) {
    updateProductMarketplaceStatusHints();
    renderProductProfitPreview();
  }
}

function validateProductStep(step) {
  const form = byId("productForm");
  if (!form) return true;

  switch (step) {
    case 1:
      // Passo 1: Validar Nome (obrigatório)
      if (!form.elements.name.value.trim()) {
        showAppMessage("Campo obrigatório", "Por favor, preencha o nome do produto.", "error");
        form.elements.name.focus();
        return false;
      }
      return true;

    case 2:
      // Passo 2: Validar Preços
      if (!form.elements.price.value) {
        showAppMessage("Campo obrigatório", "Por favor, preencha o preço de venda.", "error");
        form.elements.price.focus();
        return false;
      }
      return true;

    case 3:
      // Marketplace é opcional: sem seleção, o produto será salvo apenas no catálogo.
      if (form.elements.publish_ml.checked && !isMarketplaceAccountConnected("mercado-livre")) {
        showAppMessage(
          "Mercado Livre não conectado",
          "Conecte sua conta em Marketplace > Integrações antes de publicar. Para salvar apenas no catálogo, desmarque Mercado Livre.",
          "error"
        );
        return false;
      }
      if (form.elements.publish_ml.checked) {
        const titleError = validateMlProductTitle(form.elements.name.value);
        if (titleError) {
          showAppMessage("Nome incompleto para Mercado Livre", titleError, "error");
          form.elements.name.focus();
          return false;
        }
      }
      if (form.elements.publish_ml.checked && !form.elements.mlCategoryId.value.trim()) {
        showAppMessage("Campo obrigatório", "Por favor, selecione a categoria do Mercado Livre.", "error");
        form.elements.mlCategoryId.focus();
        return false;
      }
      return true;

    default:
      return true;
  }
}
