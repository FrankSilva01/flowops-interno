import { state } from "./state.js";
import { byId, html, showAppMessage } from "./dom.js";
import { setView } from "./router.js";

const PRODUCT_ASSETS_MARKER = "[[FLOWOPS_PRODUCT_ASSETS:";
const PRODUCT_ASSETS_MARKER_END = "]]";

export function initGlobalSearch() {
  const searchInput = byId("globalSearch");
  if (!searchInput) return;

  // Mostrar dropdown ao focar
  searchInput.addEventListener("focus", () => {
    showSearchDropdown();
  });

  // Atualizar resultados enquanto digita
  searchInput.addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    if (state.query.length > 0) {
      showSearchResults(state.query);
    } else {
      hideSearchDropdown();
    }
  });

  // Fechar ao clicar fora
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#globalSearch") && !e.target.closest("#searchDropdown")) {
      hideSearchDropdown();
    }
  });

  // Suporte para Ctrl+K
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearchFromShortcut(searchInput);
    }
  });

  // Escape para fechar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideSearchDropdown();
      searchInput.blur();
    }
  });
}

function openSearchFromShortcut(searchInput) {
  if (searchInput.hidden) searchInput.hidden = false;
  searchInput.focus({ preventScroll: true });
  searchInput.select();
  showSearchDropdown();
}

function showSearchDropdown() {
  let dropdown = byId("searchDropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.id = "searchDropdown";
    dropdown.className = "search-dropdown";
    byId("globalSearch").parentElement.appendChild(dropdown);
  }
  dropdown.style.display = "block";

  const query = byId("globalSearch").value.trim().toLowerCase();
  if (query.length > 0) {
    showSearchResults(query);
  } else {
    showSearchSuggestions();
  }
}

function hideSearchDropdown() {
  const dropdown = byId("searchDropdown");
  if (dropdown) {
    dropdown.style.display = "none";
  }
}

function showSearchSuggestions() {
  const dropdown = byId("searchDropdown");
  if (!dropdown) return;

  const suggestions = [
    { title: "Encomendas", desc: "Buscar pedidos", view: "orders" },
    { title: "Fluxo de Caixa", desc: "Transações financeiras", view: "cash" },
    { title: "Materiais", desc: "Insumos e estoque", view: "materials" },
    { title: "Clientes", desc: "Leads e contatos", view: "leads" },
    { title: "Relatórios", desc: "Análises do negócio", view: "reports" },
    { title: "Marketplace", desc: "Anúncios e vendas", view: "marketplace" },
  ];

  dropdown.innerHTML = `
    <div class="search-header">
      <span class="search-label">Sugestões</span>
      <small>Comece a digitar para buscar</small>
    </div>
    <div class="search-suggestions">
      ${suggestions.map(s => `
        <button class="search-item" type="button" data-view="${s.view}">
          <strong>${s.title}</strong>
          <small>${s.desc}</small>
        </button>
      `).join("")}
    </div>
  `;

  dropdown.querySelectorAll("[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      setView(btn.dataset.view);
      hideSearchDropdown();
      byId("globalSearch").value = "";
    });
  });
}

function showSearchResults(query) {
  const dropdown = byId("searchDropdown");
  if (!dropdown) return;

  const results = searchAllData(query);

  if (results.total === 0) {
    dropdown.innerHTML = `
      <div class="search-header">
        <span class="search-label">Resultados</span>
      </div>
      <div class="search-empty">
        <span>Nenhum resultado encontrado para "${html(query)}"</span>
        <small>Tente outro termo de busca</small>
      </div>
    `;
    return;
  }

  dropdown.innerHTML = `
    <div class="search-header">
      <span class="search-label">Resultados (${results.total})</span>
    </div>
    <div class="search-results">
      ${results.items.map(item => `
        <button class="search-item search-result" type="button" data-action="search-navigate" data-view="${item.view}" data-id="${item.id}">
          <div class="search-result-header">
            <strong>${html(item.title)}</strong>
            <small class="search-badge">${item.category}</small>
          </div>
          <small class="search-result-desc">${html(item.description || "")}</small>
          ${item.meta ? `<small class="search-result-meta">${html(item.meta)}</small>` : ""}
        </button>
      `).join("")}
    </div>
  `;

  dropdown.querySelectorAll("[data-action='search-navigate']").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      const id = btn.dataset.id;
      setView(view);
      hideSearchDropdown();
      byId("globalSearch").value = "";

      // Se há ID, tentar abrir o item específico
      if (id && view === "orders") {
        setTimeout(() => {
          const orderRow = document.querySelector(`[data-order-id="${id}"]`);
          if (orderRow) {
            orderRow.scrollIntoView({ behavior: "smooth", block: "center" });
            orderRow.classList.add("highlight");
          }
        }, 300);
      }
    });
  });
}

function searchAllData(query) {
  const items = [];
  const includes = (...values) => values.some((value) => String(value || "").toLowerCase().includes(query));
  const productAssets = (product) => {
    const value = String(product?.description || "");
    const markerIndex = value.lastIndexOf(PRODUCT_ASSETS_MARKER);
    if (markerIndex < 0) return {};
    const endIndex = value.indexOf(PRODUCT_ASSETS_MARKER_END, markerIndex);
    if (endIndex < 0) return {};
    try {
      return JSON.parse(decodeURIComponent(value.slice(markerIndex + PRODUCT_ASSETS_MARKER.length, endIndex))) || {};
    } catch {
      return {};
    }
  };

  state.data.orders?.forEach((order) => {
    const logistics = state.orderLogistics?.find((item) => item.order_id === order.id);
    if (includes(order.description, order.client, order.id, order.orderCode, order.marketplaceOrderCode, order.stlLink, logistics?.tracking_code)) {
      items.push({
        title: order.description || "Sem descricao",
        description: `Cliente: ${order.client || "N/A"} | Pedido: ${order.marketplaceOrderCode || order.id}`,
        category: "Pedido",
        view: "orders",
        id: order.id,
        meta: logistics?.tracking_code ? `Rastreio: ${logistics.tracking_code}` : (order.status || "Sem status"),
      });
    }
  });

  state.products?.forEach((product) => {
    const assets = productAssets(product);
    if (includes(product.name, product.sku, product.category, assets.stlLink, assets.imageUrl, assets.notes)) {
      items.push({
        title: product.name || product.sku || "Produto",
        description: `SKU: ${product.sku || "-"} | ${product.category || "Sem categoria"}`,
        category: "Produto",
        view: "marketplace",
        id: product.id,
        meta: assets.stlLink ? "Tem STL/origem salvo" : "Produto interno",
      });
    }
  });

  state.marketplaceListings?.forEach((listing) => {
    if (includes(listing.title, listing.sku, listing.external_id, listing.permalink, listing.marketplace)) {
      items.push({
        title: listing.title || listing.external_id,
        description: `${listing.marketplace || "Marketplace"} | ${listing.external_id || "-"}`,
        category: "Anuncio",
        view: "marketplace",
        id: listing.external_id,
        meta: listing.status || "",
      });
    }
  });

  state.orderLogistics?.forEach((logistics) => {
    const order = state.data.orders?.find((item) => item.id === logistics.order_id);
    if (includes(logistics.tracking_code, logistics.carrier, logistics.status, order?.description, order?.client)) {
      items.push({
        title: logistics.tracking_code || order?.description || "Rastreio",
        description: `${order?.client || "Cliente nao informado"} | ${order?.description || logistics.carrier || ""}`,
        category: "Rastreio",
        view: "logistics",
        id: logistics.order_id,
        meta: logistics.status || "Sem status",
      });
    }
  });

  state.data.materials?.forEach((material) => {
    if (includes(material.type, material.supplier, material.spec)) {
      items.push({
        title: material.type || "Material",
        description: `Fornecedor: ${material.supplier || "N/A"} | Qtd: ${material.quantity}`,
        category: "Material",
        view: "materials",
        id: material.id,
        meta: material.spec || "",
      });
    }
  });

  state.data.cash?.forEach((entry) => {
    if (includes(entry.description, entry.category, entry.type, entry.date)) {
      items.push({
        title: entry.description || entry.category,
        description: `${entry.type}: R$ ${entry.amount || 0}`,
        category: entry.type,
        view: "cash",
        id: entry.id,
        meta: entry.date || "",
      });
    }
  });

  state.leads?.forEach((lead) => {
    if (includes(lead.name, lead.email, lead.whatsapp, lead.phone, lead.company, lead.status)) {
      items.push({
        title: lead.name || "Lead",
        description: `${lead.email || lead.whatsapp || "Sem contato"}`,
        category: "Cliente/Lead",
        view: "leads",
        id: lead.id,
        meta: lead.status || "Novo",
      });
    }
  });

  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.category}:${item.id}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return { items: unique.slice(0, 15), total: unique.length };
}
// CSS agora está em 12-global-search.css
// Nada para inicializar aqui
