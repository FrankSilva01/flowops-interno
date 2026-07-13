import { state } from "../core/state.js";
import { html, safeUrl } from "../core/dom.js";

const PRODUCT_ASSETS_MARKER = "[[FLOWOPS_PRODUCT_ASSETS:";
const PRODUCT_ASSETS_MARKER_END = "]]";

export function parseProductionAssets(description) {
  const value = String(description || "");
  const markerIndex = value.lastIndexOf(PRODUCT_ASSETS_MARKER);
  if (markerIndex < 0) return {};
  const endIndex = value.indexOf(PRODUCT_ASSETS_MARKER_END, markerIndex);
  if (endIndex < 0) return {};
  const encoded = value.slice(markerIndex + PRODUCT_ASSETS_MARKER.length, endIndex);
  try {
    return JSON.parse(decodeURIComponent(encoded)) || {};
  } catch (error) {
    return {};
  }
}

export function getProductAssetInfo(product) {
  return parseProductionAssets(product?.description || "");
}

export function getProductForListing(marketplace, externalId) {
  const link = state.productListings.find((item) => item.marketplace === marketplace && item.external_id === externalId);
  return link ? state.products.find((item) => item.id === link.product_id) || null : null;
}

export function getProductForSale(sale) {
  const itemId = sale?.raw_payload?.order_items?.[0]?.item?.id;
  if (!itemId) return null;
  return getProductForListing(sale.marketplace, itemId);
}

export function getProductForOrder(order) {
  if (order?.productId) {
    const direct = state.products.find((item) => item.id === order.productId);
    if (direct) return direct;
  }
  const sale = state.marketplaceSales.find((item) => item.internal_order_id === order?.id);
  return sale ? getProductForSale(sale) : null;
}

export function renderProductionAssetShortcut(product, options = {}) {
  if (!product) {
    return options.empty ? `<small class="muted">${html(options.empty)}</small>` : "";
  }
  const assets = getProductAssetInfo(product);
  const stl = safeUrl(assets.stlLink);
  const image = safeUrl(assets.imageUrl);
  const notes = String(assets.notes || "").trim();
  if (!stl && !image && !notes) {
    return `<small class="muted">Produto interno sem arquivo salvo</small>`;
  }
  return `
    <div class="production-asset-shortcut ${options.compact ? "compact" : ""}">
      <strong>${html(product.sku || product.name || "Produto interno")}</strong>
      <div class="inline-actions">
        ${stl ? `<a class="order-link" href="${html(stl)}" target="_blank" rel="noopener">STL/origem</a>` : ""}
        ${image ? `<a class="order-link" href="${html(image)}" target="_blank" rel="noopener">Imagem</a>` : ""}
      </div>
      ${notes && !options.compact ? `<small class="muted">${html(notes)}</small>` : ""}
    </div>
  `;
}
