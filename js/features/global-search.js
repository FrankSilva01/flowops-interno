// Busca global Ctrl+K
export function initGlobalSearch() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openGlobalSearchOverlay();
    }
    if (e.key === "Escape") {
      closeGlobalSearchOverlay();
    }
  });
}

function openGlobalSearchOverlay() {
  const existing = document.querySelector(".global-search-overlay");
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.className = "global-search-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 20vh; z-index: 10000;
  `;

  overlay.innerHTML = `
    <div style="background: var(--panel); border-radius: 12px; width: 90%; max-width: 600px; max-height: 70vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <div style="padding: 16px; border-bottom: 1px solid var(--line); display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🔍</span>
        <input type="text" id="globalSearchInput" placeholder="Buscar pedidos, leads, produtos..." style="flex: 1; border: none; background: transparent; font-size: 14px; color: var(--ink); outline: none;" autocomplete="off">
        <span style="font-size: 11px; color: var(--muted); font-weight: 600;">ESC para sair</span>
      </div>
      <div id="globalSearchResults" style="flex: 1; overflow-y: auto; padding: 12px 0;"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector("#globalSearchInput");
  const results = overlay.querySelector("#globalSearchResults");

  input.focus();

  input.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    performGlobalSearch(query, results);
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeGlobalSearchOverlay();
  });
}

function performGlobalSearch(query, resultsContainer) {
  if (!query) {
    resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12px;">Digite para buscar pedidos, leads, produtos...</div>';
    return;
  }

  const { state } = window.__flowops || {};
  if (!state) {
    resultsContainer.innerHTML = '<div style="padding: 20px; color: var(--muted); font-size: 12px;">Dados não carregados</div>';
    return;
  }

  const results = [];

  // Buscar em pedidos
  if (state.data?.orders) {
    state.data.orders.forEach(order => {
      if (order.code?.toLowerCase().includes(query) || order.client?.toLowerCase().includes(query)) {
        results.push({
          type: "order",
          icon: "📦",
          title: order.code || "Pedido",
          subtitle: order.client || "—",
          id: order.id
        });
      }
    });
  }

  // Buscar em leads
  if (state.data?.leads) {
    state.data.leads.forEach(lead => {
      if (lead.name?.toLowerCase().includes(query) || lead.email?.toLowerCase().includes(query)) {
        results.push({
          type: "lead",
          icon: "👤",
          title: lead.name || "Lead",
          subtitle: lead.email || "—",
          id: lead.id
        });
      }
    });
  }

  // Buscar em produtos
  if (state.data?.products) {
    state.data.products.forEach(product => {
      if (product.name?.toLowerCase().includes(query)) {
        results.push({
          type: "product",
          icon: "📦",
          title: product.name || "Produto",
          subtitle: `SKU: ${product.sku || "—"}`,
          id: product.id
        });
      }
    });
  }

  if (results.length === 0) {
    resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12px;">Nenhum resultado encontrado</div>';
    return;
  }

  resultsContainer.innerHTML = results.slice(0, 20).map(item => `
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--line); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--canvas)'" onmouseout="this.style.background='transparent'" onclick="navigateToSearchResult('${item.type}', '${item.id}')">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 18px;">${item.icon}</span>
        <div style="flex: 1;">
          <div style="font-size: 13px; font-weight: 600; color: var(--ink);">${item.title}</div>
          <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">${item.subtitle}</div>
        </div>
      </div>
    </div>
  `).join("");
}

function closeGlobalSearchOverlay() {
  const overlay = document.querySelector(".global-search-overlay");
  if (overlay) overlay.remove();
}

function navigateToSearchResult(type, id) {
  closeGlobalSearchOverlay();

  // Navegar para o item apropriado
  const navMap = {
    order: () => {
      document.querySelector('[data-view="orders"]')?.click();
      // Filtrar ou scroll para o pedido
      const row = document.querySelector(`[data-order-id="${id}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    lead: () => {
      document.querySelector('[data-view="leads"]')?.click();
      const row = document.querySelector(`[data-lead-id="${id}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    product: () => {
      document.querySelector('[data-view="materials"]')?.click();
      const row = document.querySelector(`[data-product-id="${id}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (navMap[type]) navMap[type]();
}

export function addGlobalSearchShortcutHint() {
  // Adicionar hint de Ctrl+K em algum lugar da UI (opcional)
  // const hint = document.createElement("div");
  // hint.style.cssText = "...";
  // hint.textContent = "Pressione Ctrl+K para buscar";
  // document.body.appendChild(hint);
}
