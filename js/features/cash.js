import { state, money, saveData } from "../core/state.js";
import { roundMoney } from "../core/money.js";
import { byId, html, formatDate, nextId, number, filterRows, renderOperationalSummary } from "../core/dom.js";
import { bindActions, render } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { persist } from "../data/remote.js";

export function renderCash() {
  let running = 0;
  const rows = filterCash(filterRows([...state.data.cash].sort((a, b) => a.date.localeCompare(b.date)), ["description", "category", "type"]));
  const income = roundMoney(rows.reduce((sum, item) => sum + Number(item.income || 0), 0));
  const expense = roundMoney(rows.reduce((sum, item) => sum + Number(item.expense || 0), 0));
  const receivable = roundMoney(state.data.orders.reduce((sum, item) => sum + Math.max(0, Number(item.charged || 0) - Number(item.received || 0)), 0));
  renderOperationalSummary("cashView", "cashPageSummary", [
    ["Saldo atual", money.format(income - expense), "resultado acumulado", "teal"],
    ["Entradas", money.format(income), "recebimentos e vendas", "green"],
    ["Saídas", money.format(expense), "custos e despesas", "red"],
    ["A receber", money.format(receivable), "títulos pendentes", "amber"],
    ["Lucro líquido", money.format(income - expense), "resultado do período", "blue"],
  ]);
  byId("cashTable").innerHTML = rows.map((entry) => {
    running = roundMoney(running + Number(entry.income || 0) - Number(entry.expense || 0));
    return `
      <tr>
        <td>${formatDate(entry.date)}</td>
        <td>${html(entry.type)}</td>
        <td>${html(entry.category)}</td>
        <td><strong>${html(entry.description)}</strong><small>${html(entry.method || "")}</small></td>
        <td class="money-in">${entry.income ? money.format(entry.income) : "-"}</td>
        <td class="money-out">${entry.expense ? money.format(entry.expense) : "-"}</td>
        <td>${money.format(running)}</td>
        <td>
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-cash" data-id="${entry.id}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-cash" data-id="${entry.id}">Excluir</button>` : "-"}
        </td>
      </tr>
    `;
  }).join("");
  bindActions();
}

export async function saveCash(event) {
  event.preventDefault();
  if (!ensureCanEdit()) return;
  const form = new FormData(event.currentTarget);
  const type = form.get("type");
  const amount = number(form.get("amount"));
  const existingId = form.get("id");
  const item = {
    id: existingId || nextId("CX", state.data.cash),
    date: form.get("date"),
    type,
    category: form.get("category").trim(),
    description: form.get("description").trim(),
    method: form.get("method").trim(),
    income: type === "Entrada" ? amount : 0,
    expense: type === "Saída" ? amount : 0
  };
  const index = state.data.cash.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    state.data.cash[index] = item;
  } else {
    state.data.cash.push(item);
  }
  await persist("cash", item);
  resetCashForm();
  saveData();
  render();
}

export function startCashEdit(id) {
  const item = state.data.cash.find((entry) => entry.id === id);
  if (!item) return;
  const form = byId("cashForm");
  form.elements.id.value = item.id;
  form.elements.date.value = item.date || "";
  form.elements.type.value = item.type || "Entrada";
  form.elements.category.value = item.category || "";
  form.elements.description.value = item.description || "";
  form.elements.amount.value = item.type === "Saída" ? item.expense || "" : item.income || "";
  form.elements.method.value = item.method || "";
  state.editingCashId = id;
  form.classList.add("editing");
  byId("cashSubmitBtn").textContent = "Atualizar lançamento";
  byId("cancelCashEditBtn").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.date.focus();
}

export function cancelCashEdit() {
  resetCashForm();
}

export function resetCashForm() {
  const form = byId("cashForm");
  form.reset();
  form.elements.id.value = "";
  form.classList.remove("editing");
  state.editingCashId = null;
  byId("cashSubmitBtn").textContent = "Salvar lançamento";
  byId("cancelCashEditBtn").hidden = true;
}

export function filterCash(rows) {
  if (state.filters.cashType === "all") return rows;
  return rows.filter((item) => item.type === state.filters.cashType);
}
