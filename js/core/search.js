import { state } from "./state.js";
import { byId, html, showAppMessage } from "./dom.js";
import { setView } from "./router.js";

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
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
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

  // Buscar em pedidos
  if (state.data.orders) {
    state.data.orders.forEach(order => {
      if (
        order.description?.toLowerCase().includes(query) ||
        order.client?.toLowerCase().includes(query) ||
        order.id?.toLowerCase().includes(query)
      ) {
        items.push({
          title: order.description || "Sem descrição",
          description: `Cliente: ${order.client || "N/A"} | Valor: R$ ${order.charged || 0}`,
          category: "Pedido",
          view: "orders",
          id: order.id,
          meta: order.status || "Sem status",
        });
      }
    });
  }

  // Buscar em materiais
  if (state.data.materials) {
    state.data.materials.forEach(material => {
      if (
        material.type?.toLowerCase().includes(query) ||
        material.supplier?.toLowerCase().includes(query) ||
        material.spec?.toLowerCase().includes(query)
      ) {
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
  }

  // Buscar em transações de caixa
  if (state.data.cash) {
    state.data.cash.forEach(entry => {
      if (
        entry.description?.toLowerCase().includes(query) ||
        entry.category?.toLowerCase().includes(query)
      ) {
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
  }

  // Buscar em leads
  if (state.leads) {
    state.leads.forEach(lead => {
      if (
        lead.name?.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.whatsapp?.toLowerCase().includes(query)
      ) {
        items.push({
          title: lead.name || "Lead",
          description: `${lead.email || lead.whatsapp || "Sem contato"}`,
          category: "Lead",
          view: "leads",
          id: lead.id,
          meta: lead.status || "Novo",
        });
      }
    });
  }

  // Limitar a 10 resultados
  return {
    items: items.slice(0, 10),
    total: items.length,
  };
}

// Aplicar highlight visual temporário
function setupHighlightStyle() {
  if (document.getElementById("searchHighlightStyle")) return;

  const style = document.createElement("style");
  style.id = "searchHighlightStyle";
  style.textContent = `
    #searchDropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 8px;
      background: white;
      border: 1px solid #d7e0e7;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      max-height: 400px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    }

    #globalSearch {
      position: relative;
    }

    .search-header {
      padding: 12px 16px;
      border-bottom: 1px solid #eef4f6;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      background: #fafcfd;
    }

    .search-label {
      font-weight: 600;
      font-size: 12px;
      color: #607181;
      text-transform: uppercase;
    }

    .search-suggestions,
    .search-results {
      display: flex;
      flex-direction: column;
    }

    .search-empty {
      padding: 32px 16px;
      text-align: center;
      color: #607181;
    }

    .search-empty span {
      display: block;
      margin-bottom: 4px;
    }

    .search-empty small {
      display: block;
      font-size: 12px;
    }

    .search-item {
      padding: 12px 16px;
      border: none;
      background: white;
      cursor: pointer;
      text-align: left;
      border-bottom: 1px solid #eef4f6;
      transition: background 0.2s;
    }

    .search-item:last-child {
      border-bottom: none;
    }

    .search-item:hover {
      background: #f7fafb;
    }

    .search-item strong {
      display: block;
      color: #17212b;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .search-item small {
      display: block;
      color: #607181;
      font-size: 12px;
    }

    .search-result strong {
      font-size: 14px;
    }

    .search-result-desc {
      color: #738290;
      margin-top: 4px;
    }

    .search-result-meta {
      color: #14b8a6;
      font-weight: 500;
      margin-top: 2px;
    }

    .search-badge {
      display: inline-block;
      padding: 2px 6px;
      background: #e0f2fe;
      color: #0369a1;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 8px;
    }

    [data-order-id].highlight {
      background-color: #fffbeb !important;
      box-shadow: inset 0 0 0 2px #fbbf24 !important;
    }
  `;

  document.head.appendChild(style);
}

// Inicializar estilos quando o módulo é carregado
setupHighlightStyle();
