import { state, money, saveData } from "../core/state.js";
import { byId, html, formatDate, nextId, number, filterRows, showAppMessage } from "../core/dom.js";
import { bindActions, render } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { persist } from "../data/remote.js";
import { ensureOperationalNotifications } from "./notifications.js";
import { buildMaterialsModel } from "./materials-presentation.js";

const MATERIALS_TABS = ["inventory", "purchases", "suppliers"];

export function setMaterialsTab(tab) {
  const selected = MATERIALS_TABS.includes(tab) ? tab : "inventory";
  document.querySelectorAll("[data-materials-tab]").forEach((button) => {
    const active = button.dataset.materialsTab === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  for (const name of MATERIALS_TABS) {
    const pane = byId(`materials${name[0].toUpperCase()}${name.slice(1)}Pane`);
    const active = name === selected;
    pane.classList.toggle("active", active);
    pane.hidden = !active;
  }
}

export function bindMaterialsTabs() {
  const tabs = [...document.querySelectorAll("[data-materials-tab]")];
  for (const button of tabs) {
    button.addEventListener("click", () => setMaterialsTab(button.dataset.materialsTab));
    button.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(button);
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      setMaterialsTab(tabs[next].dataset.materialsTab);
      tabs[next].focus();
    });
  }
}

export function formatMaterialsAmount(value) {
  return typeof value === "number" && Number.isFinite(value) ? money.format(value) : "Não informado";
}

export function buildMaterialsNextModel({ purchases = state.data.materials, inventory = state.inventoryItems } = {}) {
  return buildMaterialsModel({ purchases, inventory });
}

function renderMaterialsChrome() {
  const model = buildMaterialsNextModel();
  const low = model.summary.lowStockCount;
  const healthy = low === null ? null : model.summary.inventoryCount - low;
  const kpis = [
    ["Itens em estoque", model.summary.inventoryCount, "insumos cadastrados", "teal"],
    ["Estoque saudável", healthy ?? "Não informado", "acima do mínimo", "green"],
    ["Atenção", low ?? "Não informado", "no mínimo ou abaixo", "amber"],
    ["Valor estimado", formatMaterialsAmount(model.summary.estimatedStockValue), "quantidade × custo informado", "blue"],
  ];
  byId("materialsNextKpis").innerHTML = kpis.map(([label, value, detail, tone]) => `
    <article class="materials-next-kpi ${tone}"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(detail)}</small></article>
  `).join("");
  byId("newMaterialPurchaseBtn").hidden = !state.canEdit;
  byId("newInventoryItemBtn").hidden = !state.canEdit;
  byId("materialsSuppliersList").innerHTML = model.suppliers.length ? model.suppliers.map((supplier) => `
    <article class="materials-next-supplier">
      <div><strong>${html(supplier.supplier)}</strong><small>${supplier.purchaseCount} compra${supplier.purchaseCount === 1 ? "" : "s"}</small></div>
      <span>${formatMaterialsAmount(supplier.total)}</span>
    </article>
  `).join("") : `<div class="empty-state"><strong>Nenhum fornecedor encontrado</strong><span>Registre uma compra para formar este resumo.</span></div>`;
}

export function clearMaterialFilters() {
  for (const id of ["materialSearchFilter", "materialSupplierFilter", "materialDateFromFilter", "materialDateToFilter"]) {
    byId(id).value = "";
  }
  byId("materialTypeFilter").value = "all";
  Object.assign(state.filters, {
    materialSearch: "",
    materialSupplier: "",
    materialDateFrom: "",
    materialDateTo: "",
    materialType: "all",
  });
  renderMaterials();
}

export function clearInventoryFilters() {
  for (const id of ["inventorySearchFilter", "inventorySupplierFilter"]) byId(id).value = "";
  byId("inventoryStatusFilter").value = "all";
  Object.assign(state.filters, {
    inventorySearch: "",
    inventorySupplier: "",
    inventoryStatus: "all",
  });
  renderInventory();
}

export function renderMaterials() {
  const rows = sortMaterials(filterMaterials(filterRows(state.data.materials, ["supplier", "type", "spec"])));
  renderMaterialsChrome();
  byId("materialsTable").innerHTML = rows.map((item) => {
    const total = Number(item.quantity || 0) * Number(item.unitCost || 0);
    return `
      <tr>
        <td data-label="Data">${formatDate(item.date)}</td>
        <td data-label="Fornecedor">${html(item.supplier)}</td>
        <td data-label="Material">${html(item.type)}</td>
        <td data-label="Especificação">${html(item.spec || "-")}</td>
        <td data-label="Quantidade">${Number(item.quantity || 0).toLocaleString("pt-BR")}</td>
        <td data-label="Total">${money.format(total)}</td>
        <td data-label="Ações">
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-material" data-id="${item.id}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-material" data-id="${item.id}">Excluir</button>` : "-"}
        </td>
      </tr>
    `;
  }).join("");
  bindActions();
}

export function renderInventory() {
  const table = byId("inventoryTable");
  if (!table) return;
  renderMaterialsChrome();
  const rows = state.inventoryItems.filter((item) => {
    const text = `${item.name || ""} ${item.category || ""} ${item.supplier || ""} ${item.notes || ""}`.toLowerCase();
    const isLow = Number(item.quantity || 0) <= Number(item.minimum_quantity || 0);
    return (!state.filters.inventorySearch || text.includes(state.filters.inventorySearch))
      && (!state.filters.inventorySupplier || String(item.supplier || "").toLowerCase().includes(state.filters.inventorySupplier))
      && (state.filters.inventoryStatus === "all"
        || (state.filters.inventoryStatus === "low" && isLow)
        || (state.filters.inventoryStatus === "ok" && !isLow));
  }).sort((left, right) => {
    const leftLow = Number(left.quantity || 0) <= Number(left.minimum_quantity || 0);
    const rightLow = Number(right.quantity || 0) <= Number(right.minimum_quantity || 0);
    return Number(rightLow) - Number(leftLow) || String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
  });
  const lowStock = rows.filter((item) => Number(item.quantity || 0) <= Number(item.minimum_quantity || 0));
  const summary = byId("lowStockSummary");
  if (summary) {
    summary.className = `inventory-summary ${lowStock.length ? "low" : "ok"}`;
    summary.textContent = lowStock.length ?
       `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} com estoque baixo`
      : "Estoque dentro dos níveis configurados";
  }
  table.innerHTML = rows.length ? rows.map((item) => {
    const isLow = Number(item.quantity || 0) <= Number(item.minimum_quantity || 0);
    const estimated = Number(item.quantity || 0) * Number(item.unit_cost || 0);
    return `
      <tr class="${isLow ? "low-stock-row" : ""}">
        <td data-label="Item"><strong>${html(item.name)}</strong><small>${html(item.supplier || item.notes || "")}</small></td>
        <td data-label="Categoria">${html(item.category || "Insumo")}</td>
        <td data-label="Quantidade">${formatInventoryNumber(item.quantity)} ${html(item.unit || "un.")}</td>
        <td data-label="Mínimo">${formatInventoryNumber(item.minimum_quantity)} ${html(item.unit || "un.")}</td>
        <td data-label="Custo estimado">${money.format(estimated)}</td>
        <td data-label="Status"><span class="badge ${isLow ? "danger-badge" : "done"}">${isLow ? "Estoque baixo" : "Normal"}</span></td>
        <td data-label="Ações">${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-inventory" data-id="${html(item.id)}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-inventory" data-id="${html(item.id)}">Excluir</button>` : "-"}</td>
      </tr>`;
  }).join("") : `<tr><td colspan="7">Nenhum insumo cadastrado.</td></tr>`;
  bindActions();
}

export function formatInventoryNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export async function saveMaterial(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const existingId = form.get("id");
  const item = {
    id: existingId || nextId("MAT", state.data.materials),
    date: form.get("date"),
    supplier: form.get("supplier").trim(),
    type: form.get("type"),
    spec: form.get("spec").trim(),
    quantity: number(form.get("quantity")),
    unitCost: number(form.get("unitCost"))
  };
  const index = state.data.materials.findIndex((material) => material.id === item.id);
  if (index >= 0) {
    state.data.materials[index] = item;
  } else {
    state.data.materials.push(item);
  }
  await persist("materials", item);
  const cashEntry = materialToCashEntry(item);
  const cashIndex = state.data.cash.findIndex((entry) => entry.id === cashEntry.id);
  if (cashIndex >= 0) {
    state.data.cash[cashIndex] = cashEntry;
  } else {
    state.data.cash.push(cashEntry);
  }
  await persist("cash", cashEntry);
  resetMaterialForm();
  saveData();
  render();
}

export function startMaterialEdit(id) {
  const item = state.data.materials.find((material) => material.id === id);
  if (!item) return;
  const form = byId("materialForm");
  form.elements.id.value = item.id;
  form.elements.date.value = item.date || "";
  form.elements.supplier.value = item.supplier || "";
  form.elements.type.value = item.type || "Resina";
  form.elements.spec.value = item.spec || "";
  form.elements.quantity.value = item.quantity || "";
  form.elements.unitCost.value = item.unitCost || "";
  state.editingMaterialId = id;
  form.classList.add("editing");
  byId("materialSubmitBtn").textContent = "Atualizar material";
  byId("cancelMaterialEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.supplier.focus();
}

export function cancelMaterialEdit() {
  resetMaterialForm();
}

export function resetMaterialForm() {
  const form = byId("materialForm");
  form.reset();
  form.elements.id.value = "";
  form.classList.remove("editing");
  state.editingMaterialId = null;
  byId("materialSubmitBtn").textContent = "Salvar material";
  byId("cancelMaterialEditBtn").hidden = true;
}

export async function saveInventoryItem(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const payload = {
    organization_id: state.organizationId,
    name: String(values.name || "").trim(),
    category: String(values.category || "Insumo").trim(),
    unit: String(values.unit || "un.").trim(),
    quantity: number(values.quantity),
    minimum_quantity: number(values.minimum_quantity),
    unit_cost: number(values.unit_cost),
    supplier: String(values.supplier || "").trim() || null,
    notes: String(values.notes || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  let query = state.supabase.from("inventory_items");
  const response = values.id ?
     await query.update(payload).eq("id", values.id).select().single()
    : await query.insert(payload).select().single();
  if (response.error) {
    showAppMessage("Não foi possível salvar o insumo", response.error.message, "error");
    return;
  }
  const index = state.inventoryItems.findIndex((item) => item.id === response.data.id);
  if (index >= 0) state.inventoryItems[index] = response.data;
  else state.inventoryItems.push(response.data);
  resetInventoryForm();
  renderInventory();
  await ensureOperationalNotifications();
}

export function startInventoryEdit(id) {
  const item = state.inventoryItems.find((entry) => entry.id === id);
  if (!item) return;
  const form = byId("inventoryForm");
  for (const field of ["id", "name", "category", "unit", "quantity", "minimum_quantity", "unit_cost", "supplier", "notes"]) {
    if (form.elements[field]) form.elements[field].value = item[field] ?? "";
  }
  state.editingInventoryId = id;
  byId("inventorySubmitBtn").textContent = "Atualizar insumo";
  byId("cancelInventoryEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function resetInventoryForm() {
  const form = byId("inventoryForm");
  form.reset();
  form.elements.id.value = "";
  form.elements.category.value = "Insumo";
  form.elements.unit.value = "un.";
  state.editingInventoryId = null;
  byId("inventorySubmitBtn").textContent = "Salvar insumo";
  byId("cancelInventoryEditBtn").hidden = true;
}

export function materialToCashEntry(item) {
  const total = Number(item.quantity || 0) * Number(item.unitCost || 0);
  return {
    id: materialCashId(item.id),
    date: item.date,
    type: "Saída",
    category: "Compra de material",
    description: `${item.id} - ${item.type} - ${item.spec || item.supplier}`,
    method: "",
    income: 0,
    expense: total
  };
}

export function materialCashId(materialId) {
  return `CX-${materialId}`;
}

export function filterMaterials(rows) {
  return rows.filter((item) => {
    const text = `${item.type || ""} ${item.spec || ""} ${item.supplier || ""}`.toLowerCase();
    return (state.filters.materialType === "all" || item.type === state.filters.materialType)
      && (!state.filters.materialSearch || text.includes(state.filters.materialSearch))
      && (!state.filters.materialSupplier || String(item.supplier || "").toLowerCase().includes(state.filters.materialSupplier))
      && (!state.filters.materialDateFrom || String(item.date || "") >= state.filters.materialDateFrom)
      && (!state.filters.materialDateTo || String(item.date || "") <= state.filters.materialDateTo);
  });
}

export function sortMaterials(rows) {
  const sorted = [...rows];
  if (state.filters.materialSort === "supplier") {
    return sorted.sort((a, b) => (a.supplier || "").localeCompare(b.supplier || "", "pt-BR"));
  }
  if (state.filters.materialSort === "type") {
    return sorted.sort((a, b) => `${a.type || ""} ${a.spec || ""}`.localeCompare(`${b.type || ""} ${b.spec || ""}`, "pt-BR"));
  }
  if (state.filters.materialSort === "total") {
    return sorted.sort((a, b) => (Number(b.quantity || 0) * Number(b.unitCost || 0)) - (Number(a.quantity || 0) * Number(a.unitCost || 0)));
  }
  return sorted.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
