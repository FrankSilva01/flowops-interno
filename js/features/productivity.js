import { state } from "../core/state.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";

// ========================================================================
// PRODUTIVIDADE: Busca Global + Lote + Duplicar
// ========================================================================

// ========== A. BUSCA GLOBAL (Ctrl+K) ==========

let searchPalette = null;

export function initGlobalSearch() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      toggleSearchPalette();
    }
    if (e.key === "Escape" && searchPalette) {
      closeSearchPalette();
    }
  });
}

function toggleSearchPalette() {
  if (searchPalette) {
    closeSearchPalette();
  } else {
    openSearchPalette();
  }
}

function openSearchPalette() {
  searchPalette = document.createElement("div");
  searchPalette.className = "search-palette";
  searchPalette.innerHTML = `
    <div class="search-palette-overlay"></div>
    <div class="search-palette-modal">
      <input
        type="text"
        id="search-input"
        class="search-input"
        placeholder="Buscar pedidos, produtos, clientes, anúncios... (Ctrl+K)"
        autocomplete="off"
      />
      <div class="search-results" id="search-results"></div>
      <div class="search-hint">
        <kbd>↑↓</kbd> navegar · <kbd>Enter</kbd> ir · <kbd>Esc</kbd> fechar
      </div>
    </div>
  `;

  document.body.appendChild(searchPalette);

  const input = searchPalette.querySelector(".search-input");
  const resultsDiv = searchPalette.querySelector(".search-results");

  input.focus();

  // Busca em tempo real
  input.addEventListener("input", () => {
    const query = input.value.toLowerCase();
    const results = performSearch(query);
    displaySearchResults(results, resultsDiv);
  });

  // Navegação com teclado
  let selectedIndex = -1;
  input.addEventListener("keydown", (e) => {
    const items = resultsDiv.querySelectorAll(".search-result-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items, selectedIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(items, selectedIndex);
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      items[selectedIndex].click();
    }
  });

  // Fechar ao clicar fora
  searchPalette.querySelector(".search-palette-overlay").addEventListener("click", closeSearchPalette);
}

function closeSearchPalette() {
  if (searchPalette) {
    searchPalette.remove();
    searchPalette = null;
  }
}

function performSearch(query) {
  if (!query) return [];

  const results = [];

  // Buscar em orders
  (state.data?.orders || []).forEach(o => {
    if (o.description?.toLowerCase().includes(query) || o.id?.toLowerCase().includes(query)) {
      results.push({
        type: "order",
        id: o.id,
        title: o.description,
        subtitle: `Pedido ${o.id}`,
        action: () => {
          state.view = "orders";
          window.dispatchEvent(new CustomEvent("state-changed"));
          closeSearchPalette();
        }
      });
    }
  });

  // Buscar em produtos
  (state.products || []).forEach(p => {
    if (p.name?.toLowerCase().includes(query) || p.sku?.toLowerCase().includes(query)) {
      results.push({
        type: "product",
        id: p.id,
        title: p.name,
        subtitle: `SKU: ${p.sku}`,
        action: () => {
          state.view = "marketplace";
          // TODO: abrir produto
          closeSearchPalette();
        }
      });
    }
  });

  // Buscar em anúncios
  (state.marketplaceListings || []).forEach(l => {
    if (l.title?.toLowerCase().includes(query) || l.external_id?.toLowerCase().includes(query)) {
      results.push({
        type: "listing",
        id: l.external_id,
        title: l.title,
        subtitle: `R$ ${l.price?.toFixed(2) || "—"}`,
        action: () => {
          state.view = "marketplace";
          // TODO: abrir anúncio
          closeSearchPalette();
        }
      });
    }
  });

  // Buscar em clientes/leads
  (state.leads || []).forEach(l => {
    if (l.name?.toLowerCase().includes(query) || l.email?.toLowerCase().includes(query)) {
      results.push({
        type: "lead",
        id: l.id,
        title: l.name,
        subtitle: l.email || l.phone,
        action: () => {
          state.view = "leads";
          window.dispatchEvent(new CustomEvent("state-changed"));
          closeSearchPalette();
        }
      });
    }
  });

  // Retornar agrupado por tipo
  return results.slice(0, 15);
}

function displaySearchResults(results, container) {
  if (!results.length) {
    container.innerHTML = `<div class="empty-results">Nenhum resultado para sua busca</div>`;
    return;
  }

  const grouped = {};
  results.forEach(r => {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  });

  container.innerHTML = Object.entries(grouped).map(([type, items]) => `
    <div class="search-group">
      <div class="group-title">${getTypeName(type)}</div>
      ${items.map((item, idx) => `
        <div class="search-result-item" data-index="${idx}">
          <div class="result-icon">${getTypeIcon(type)}</div>
          <div class="result-content">
            <div class="result-title">${html(item.title)}</div>
            <div class="result-subtitle">${html(item.subtitle)}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");

  container.querySelectorAll(".search-result-item").forEach(item => {
    item.addEventListener("click", () => {
      const type = item.closest(".search-group").querySelector(".group-title").textContent;
      const idx = item.dataset.index;
      const result = results[Object.values(grouped).flat().indexOf(items[idx])];
      result.action();
    });
  });
}

function updateSelection(items, index) {
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === index);
  });
}

function getTypeName(type) {
  const names = { order: "Pedidos", product: "Produtos", listing: "Anúncios", lead: "Clientes/Leads", cash: "Financeiro" };
  return names[type] || type;
}

function getTypeIcon(type) {
  const icons = { order: "📦", product: "🛍️", listing: "📢", lead: "👤", cash: "💰" };
  return icons[type] || "📌";
}

// ========== B. AÇÕES EM LOTE ==========

let selectedItems = new Set();

export function initBatchActions() {
  // Mostrar/esconder barra de ações quando selecionar items
  document.addEventListener("item-selected", updateBatchBar);
}

export function toggleItemSelection(itemId, itemData) {
  if (selectedItems.has(itemId)) {
    selectedItems.delete(itemId);
  } else {
    selectedItems.set(itemId, itemData);
  }
  updateBatchBar();
}

function updateBatchBar() {
  const count = selectedItems.size;
  let bar = document.getElementById("batch-actions-bar");

  if (count === 0) {
    if (bar) bar.remove();
    return;
  }

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "batch-actions-bar";
    bar.className = "batch-actions-bar";
    document.body.appendChild(bar);
  }

  bar.innerHTML = `
    <div class="batch-info">${count} selecionado${count > 1 ? "s" : ""}</div>
    <div class="batch-buttons">
      <button class="action-btn" data-action="change-status">📊 Status</button>
      <button class="action-btn" data-action="change-stage">⚙️ Etapa</button>
      <button class="action-btn" data-action="change-responsible">👤 Responsável</button>
      <button class="action-btn" data-action="change-priority">⭐ Prioridade</button>
      <button class="action-btn" data-action="change-date">📅 Data</button>
      <button class="action-btn danger" data-action="delete">🗑️ Deletar</button>
      <button class="action-btn" data-action="clear">✕ Limpar</button>
    </div>
  `;

  bar.querySelectorAll(".action-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      handleBatchAction(action);
    });
  });
}

function handleBatchAction(action) {
  switch (action) {
    case "change-status":
      // TODO: Modal com opções de status
      flashActionMessage(`Alterando status de ${selectedItems.size} itens...`);
      break;
    case "change-stage":
      flashActionMessage(`Alterando etapa de ${selectedItems.size} itens...`);
      break;
    case "change-responsible":
      flashActionMessage(`Alterando responsável de ${selectedItems.size} itens...`);
      break;
    case "change-priority":
      flashActionMessage(`Alterando prioridade de ${selectedItems.size} itens...`);
      break;
    case "change-date":
      flashActionMessage(`Alterando data de ${selectedItems.size} itens...`);
      break;
    case "delete":
      if (confirm(`Deletar ${selectedItems.size} itens? Isso não pode ser desfeito.`)) {
        // TODO: Deletar itens
        flashActionMessage(`${selectedItems.size} itens deletados`);
        selectedItems.clear();
        updateBatchBar();
      }
      break;
    case "clear":
      selectedItems.clear();
      updateBatchBar();
      break;
  }
}

// ========== C. DUPLICAR ==========

export async function duplicateOrder(orderId) {
  const order = state.data?.orders?.find(o => o.id === orderId);
  if (!order) return;

  const newOrder = {
    ...JSON.parse(JSON.stringify(order)),
    id: `${order.id}-CÓPIA-${Date.now()}`,
    status: "Orçamento",
    charged: 0,
    received: 0,
    deliveryDate: "",
    notes: `Cópia de ${orderId}`,
    history: []
  };

  state.data.orders.push(newOrder);
  flashActionMessage(`Pedido duplicado: ${newOrder.id}`);

  // Log de auditoria
  // TODO: recordAudit("duplicate", "order", orderId, newOrder.id);

  return newOrder;
}

export async function duplicateProduct(productId) {
  const product = state.products?.find(p => p.id === productId);
  if (!product) return;

  const newSku = `${product.sku}-COPY-${Date.now()}`;
  const newProduct = {
    ...JSON.parse(JSON.stringify(product)),
    id: `${productId}-COPY-${Date.now()}`,
    name: `${product.name} (cópia)`,
    sku: newSku
  };

  state.products.push(newProduct);
  flashActionMessage(`Produto duplicado: ${newProduct.name}`);

  // Log de auditoria
  // TODO: recordAudit("duplicate", "product", productId, newProduct.id);

  return newProduct;
}
