import { byId, html, safeUrl } from "../core/dom.js";
import { state } from "../core/state.js";

export function buildReferenceLibrary(orders = []) {
  return orders.flatMap((order) => {
    const common = {
      orderId: order.id,
      orderCode: order.orderCode || order.id,
      client: order.client || "Cliente n\u00e3o informado",
      title: order.description || "Encomenda sem descri\u00e7\u00e3o"
    };
    return [
      order.referenceImageUrl && { ...common, id: `${order.id}:image`, type: "image", url: safeUrl(order.referenceImageUrl) },
      order.stlLink && { ...common, id: `${order.id}:model`, type: "model", url: safeUrl(order.stlLink) }
    ].filter((asset) => asset?.url);
  });
}

export function filterReferenceLibrary(assets = [], filters = {}) {
  const type = String(filters.type || "all");
  const order = String(filters.order || "").trim().toLowerCase();
  const client = String(filters.client || "").trim().toLowerCase();
  return assets.filter((asset) => {
    if (type !== "all" && asset.type !== type) return false;
    if (order && !String(asset.orderCode || "").toLowerCase().includes(order)) return false;
    return !client || String(asset.client || "").toLowerCase().includes(client);
  });
}

function optionMarkup(value, label, selected) {
  return `<option value="${html(value)}"${value === selected ? " selected" : ""}>${html(label)}</option>`;
}

function syncFilterOptions(element, options, selected) {
  if (!element) return;
  const hasSelectedOption = options.some(([value]) => value === selected);
  const selectedOptions = hasSelectedOption ? options : [...options, [selected, "Sem resultados"]];
  element.innerHTML = selectedOptions.map(([value, label]) => optionMarkup(value, label, selected)).join("");
}

function renderReferenceAsset(asset) {
  const preview = asset.type === "image"
    ? `<img src="${html(asset.url)}" alt="Referência de ${html(asset.title)}" loading="lazy" />`
    : `<i class="ti ti-cube" aria-hidden="true"></i>`;
  const typeLabel = asset.type === "image" ? "Imagem" : "Modelo 3D";
  const typeIcon = asset.type === "image" ? "ti-photo" : "ti-cube";
  return `
    <article class="reference-library-card" data-library-asset data-library-type="${html(asset.type)}" data-library-order-code="${html(asset.orderCode)}">
      <div class="reference-library-preview reference-library-preview-${html(asset.type)}">${preview}</div>
      <div class="reference-library-card-content">
        <div class="reference-library-card-meta"><span><i class="ti ${typeIcon}" aria-hidden="true"></i> ${html(typeLabel)}</span><span>${html(asset.orderCode)}</span></div>
        <h3>${html(asset.title)}</h3>
        <p>${html(asset.client)}</p>
        <a class="secondary-btn compact" href="${html(asset.url)}" target="_blank" rel="noopener noreferrer">Abrir referência</a>
      </div>
    </article>`;
}

export function renderReferenceLibrary() {
  const assets = buildReferenceLibrary(state.data.orders);
  const filters = {
    type: state.filters.libraryType,
    order: state.filters.libraryOrder,
    client: state.filters.libraryClient,
  };
  const typeFilter = byId("libraryTypeFilter");
  const orderFilter = byId("libraryOrderFilter");
  const clientFilter = byId("libraryClientFilter");
  syncFilterOptions(typeFilter, [["all", "Todos os tipos"], ["image", "Imagens"], ["model", "Modelos 3D"]], filters.type);
  syncFilterOptions(orderFilter, [["", "Todos os pedidos"], ...[...new Set(assets.map((asset) => asset.orderCode))].map((orderCode) => [orderCode, orderCode])], filters.order);
  syncFilterOptions(clientFilter, [["", "Todos os clientes"], ...[...new Set(assets.map((asset) => asset.client))].map((client) => [client, client])], filters.client);

  const grid = byId("referenceLibraryGrid");
  if (!grid) return;
  const filteredAssets = filterReferenceLibrary(assets, filters);
  grid.innerHTML = filteredAssets.length
    ? filteredAssets.map(renderReferenceAsset).join("")
    : `<div id="referenceLibraryEmpty" class="reference-library-empty"><i class="ti ti-photo-off" aria-hidden="true"></i><strong>Nenhuma referência encontrada</strong><span>As referências aparecem aqui quando uma encomenda possui imagem ou modelo 3D vinculado.</span></div>`;
}
