import { state } from "../core/state.js";
import { byId, html, showAppMessage, flashActionMessage } from "../core/dom.js";
import { recordAudit } from "./logs.js";

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
      openBatchStatusDialog();
      break;
    case "change-stage":
      openBatchStageDialog();
      break;
    case "change-responsible":
      openBatchResponsibleDialog();
      break;
    case "change-priority":
      openBatchPriorityDialog();
      break;
    case "change-date":
      openBatchDateDialog();
      break;
    case "delete":
      if (confirm(`Deletar ${selectedItems.size} itens? Isso não pode ser desfeito.`)) {
        deleteBatchItems();
      }
      break;
    case "clear":
      selectedItems.clear();
      updateBatchBar();
      break;
  }
}

// Batch action dialogs
function openBatchStatusDialog() {
  const dialog = createBatchDialog("Alterar Status");
  const options = ["Orçamento", "Aprovado", "Em Produção", "Pronto", "Enviado", "Entregue", "Cancelado"];

  const select = document.createElement("select");
  select.innerHTML = `<option value="">Selecionar status...</option>` +
    options.map(s => `<option value="${s}">${s}</option>`).join("");
  select.style.cssText = "width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px;";

  dialog.querySelector(".batch-dialog-content").appendChild(select);

  dialog.querySelector(".batch-confirm-btn").onclick = () => {
    const newStatus = select.value;
    if (!newStatus) {
      showAppMessage("Selecione um status", "warning");
      return;
    }
    applyBatchChange("status", newStatus);
    dialog.remove();
    document.querySelector(".batch-dialog-overlay").remove();
  };
}

function openBatchStageDialog() {
  const dialog = createBatchDialog("Alterar Etapa");
  const stages = ["Orçamento", "Corte", "Solda", "Pintura", "Montagem", "Empacotamento", "Expedição"];

  const select = document.createElement("select");
  select.innerHTML = `<option value="">Selecionar etapa...</option>` +
    stages.map(s => `<option value="${s}">${s}</option>`).join("");
  select.style.cssText = "width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px;";

  dialog.querySelector(".batch-dialog-content").appendChild(select);

  dialog.querySelector(".batch-confirm-btn").onclick = () => {
    const newStage = select.value;
    if (!newStage) {
      showAppMessage("Selecione uma etapa", "warning");
      return;
    }
    applyBatchChange("stage", newStage);
    dialog.remove();
    document.querySelector(".batch-dialog-overlay").remove();
  };
}

function openBatchResponsibleDialog() {
  const dialog = createBatchDialog("Alterar Responsável");
  const responsibles = state.responsibles || [];

  const select = document.createElement("select");
  select.innerHTML = `<option value="">Selecionar responsável...</option>` +
    responsibles.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
  select.style.cssText = "width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px;";

  dialog.querySelector(".batch-dialog-content").appendChild(select);

  dialog.querySelector(".batch-confirm-btn").onclick = () => {
    const newResponsibleId = select.value;
    if (!newResponsibleId) {
      showAppMessage("Selecione um responsável", "warning");
      return;
    }
    applyBatchChange("responsible", newResponsibleId);
    dialog.remove();
    document.querySelector(".batch-dialog-overlay").remove();
  };
}

function openBatchPriorityDialog() {
  const dialog = createBatchDialog("Alterar Prioridade");
  const priorities = ["Baixa", "Normal", "Alta", "Urgente"];

  const select = document.createElement("select");
  select.innerHTML = `<option value="">Selecionar prioridade...</option>` +
    priorities.map(p => `<option value="${p}">${p}</option>`).join("");
  select.style.cssText = "width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px;";

  dialog.querySelector(".batch-dialog-content").appendChild(select);

  dialog.querySelector(".batch-confirm-btn").onclick = () => {
    const newPriority = select.value;
    if (!newPriority) {
      showAppMessage("Selecione uma prioridade", "warning");
      return;
    }
    applyBatchChange("priority", newPriority);
    dialog.remove();
    document.querySelector(".batch-dialog-overlay").remove();
  };
}

function openBatchDateDialog() {
  const dialog = createBatchDialog("Alterar Data de Entrega");

  const input = document.createElement("input");
  input.type = "date";
  input.style.cssText = "width: 100%; padding: 8px; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px;";

  dialog.querySelector(".batch-dialog-content").appendChild(input);

  dialog.querySelector(".batch-confirm-btn").onclick = () => {
    const newDate = input.value;
    if (!newDate) {
      showAppMessage("Selecione uma data", "warning");
      return;
    }
    applyBatchChange("deliveryDate", newDate);
    dialog.remove();
    document.querySelector(".batch-dialog-overlay").remove();
  };
}

function createBatchDialog(title) {
  const overlay = document.createElement("div");
  overlay.className = "batch-dialog-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: var(--panel); padding: 24px; border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    min-width: 350px; max-width: 90vw;
  `;

  dialog.innerHTML = `
    <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: var(--ink);">${title}</h2>
    <div class="batch-dialog-content"></div>
    <div style="display: flex; gap: 8px;">
      <button class="batch-confirm-btn" style="flex: 1; background: var(--teal); color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600;">Aplicar</button>
      <button class="batch-cancel-btn" style="flex: 1; background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 600;">Cancelar</button>
    </div>
  `;

  dialog.querySelector(".batch-cancel-btn").onclick = () => {
    dialog.remove();
    overlay.remove();
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      dialog.remove();
      overlay.remove();
    }
  };

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  return dialog;
}

function applyBatchChange(field, value) {
  let count = 0;
  selectedItems.forEach((itemData, itemId) => {
    const order = state.data?.orders?.find(o => o.id === itemId);
    if (order) {
      const oldValue = order[field];
      order[field] = value;
      count++;
    }
  });

  if (count > 0) {
    flashActionMessage(`${field === "status" ? "Status" : field} de ${count} pedido(s) alterado(s)`);
    selectedItems.clear();
    updateBatchBar();
    window.dispatchEvent(new CustomEvent("orders-updated"));
  }
}

function deleteBatchItems() {
  let deletedCount = 0;
  selectedItems.forEach((itemData, itemId) => {
    const idx = state.data?.orders?.findIndex(o => o.id === itemId);
    if (idx >= 0) {
      state.data.orders.splice(idx, 1);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    flashActionMessage(`${deletedCount} pedido(s) deletado(s)`);
    selectedItems.clear();
    updateBatchBar();
    window.dispatchEvent(new CustomEvent("orders-updated"));
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

  await recordAudit("duplicate", "order", orderId, newOrder.id, order, newOrder, "manual");

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

  await recordAudit("duplicate", "product", productId, newProduct.sku, product, newProduct, "manual");

  return newProduct;
}
