import { state, money, saveData } from "../core/state.js";
import { byId, html, formatDate, countBy, nextId, number, filterRows, showAppMessage } from "../core/dom.js";
import { bindActions, render } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { persist } from "../data/remote.js";
import { ensureOperationalNotifications } from "./notifications.js";

export function setMaterialsTab(tab) {
  document.querySelectorAll("[data-materials-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.materialsTab === tab);
  });
  byId("materialsPurchasesPane").classList.toggle("active", tab === "purchases");
  byId("materialsInventoryPane").classList.toggle("active", tab === "inventory");
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
  const total = rows.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
  const suppliers = countBy(rows, (item) => item.supplier || "Não informado");
  const topSupplier = Object.entries(suppliers).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  renderOperationalSummary("materialsView", "materialsPageSummary", [
    ["Gastos no período", money.format(total), "compras registradas", "teal"],
    ["Compras realizadas", rows.length, "itens cadastrados", "blue"],
    ["Ticket médio", money.format(rows.length ? total / rows.length : 0), "por compra", "purple"],
    ["Fornecedor principal", topSupplier, "maior frequência", "amber"],
    ["Previsão de gastos", money.format(total), "baseada no histórico", "teal"],
  ]);
  byId("materialsTable").innerHTML = rows.map((item) => {
    const total = Number(item.quantity || 0) * Number(item.unitCost || 0);
    return `
      <tr>
        <td>${formatDate(item.date)}</td>
        <td>${html(item.supplier)}</td>
        <td>${html(item.type)}</td>
        <td>${html(item.spec || "-")}</td>
        <td>${Number(item.quantity || 0).toLocaleString("pt-BR")}</td>
        <td>${money.format(total)}</td>
        <td>
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
        <td><strong>${html(item.name)}</strong><small>${html(item.supplier || item.notes || "")}</small></td>
        <td>${html(item.category || "Insumo")}</td>
        <td>${formatInventoryNumber(item.quantity)} ${html(item.unit || "un.")}</td>
        <td>${formatInventoryNumber(item.minimum_quantity)} ${html(item.unit || "un.")}</td>
        <td>${money.format(estimated)}</td>
        <td><span class="badge ${isLow ? "danger-badge" : "done"}">${isLow ? "Estoque baixo" : "Normal"}</span></td>
        <td>${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-inventory" data-id="${html(item.id)}">Editar</button>
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
