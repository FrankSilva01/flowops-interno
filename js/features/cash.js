import { state, money, saveData } from "../core/state.js";
import { roundMoney } from "../core/money.js";
import { byId, html, formatDate, nextId, number, filterRows } from "../core/dom.js";
import { bindActions, render } from "../core/router.js";
import { ensureCanEdit } from "../core/permissions.js";
import { persist } from "../data/remote.js";
import { buildFinanceModel } from "./finance-presentation.js";

const CASH_PAGE_SIZE = 10;
let cashPage = 1;

function financeNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatFinanceAmount(value) {
  const amount = financeNumber(value);
  return amount === null ? "Não informado" : money.format(amount);
}

export function buildFinanceNextModel({ cash = [], orders = [] } = {}) {
  const model = buildFinanceModel({ cash, orders });
  return {
    ...model,
    receivables: model.receivables.filter((item) => item.amount !== null && item.amount > 0),
  };
}

export function paginateCashRows(rows, requestedPage = 1, pageSize = CASH_PAGE_SIZE) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), pageCount);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), page, pageCount, total };
}

function renderCashPagination(result) {
  const target = byId("cashPagination");
  if (!target) return;
  target.innerHTML = result.pageCount <= 1 ? "" : `
    <span>${result.total} lançamentos</span>
    <div>
      <button type="button" data-cash-page="${result.page - 1}" ${result.page <= 1 ? "disabled" : ""} aria-label="Página anterior">Anterior</button>
      <span>Página ${result.page} de ${result.pageCount}</span>
      <button type="button" data-cash-page="${result.page + 1}" ${result.page >= result.pageCount ? "disabled" : ""} aria-label="Próxima página">Próxima</button>
    </div>`;
  target.querySelectorAll("[data-cash-page]").forEach((button) => button.addEventListener("click", () => {
    cashPage = Number(button.dataset.cashPage) || 1;
    renderCash();
  }));
}

function renderFinanceKpis(summary) {
  byId("financeKpis").innerHTML = [
    ["Saldo atual", summary.balance, "resultado acumulado"],
    ["Entradas", summary.income, "recebimentos e vendas"],
    ["Saídas", summary.expense, "custos e despesas"],
    ["A receber", summary.receivable, "encomendas pendentes"],
  ].map(([label, value, note]) => `
    <article class="finance-next-kpi">
      <span>${html(label)}</span>
      <strong>${html(formatFinanceAmount(value))}</strong>
      <small>${html(note)}</small>
    </article>
  `).join("");
}

function renderDailySeries(dailySeries) {
  const target = byId("financeDailySeries");
  if (!dailySeries.length) {
    target.innerHTML = '<p class="finance-next-empty">Nenhum lançamento com data informado.</p>';
    return;
  }
  const knownValues = dailySeries.flatMap((item) => [financeNumber(item.income), financeNumber(item.expense)]).filter((value) => value !== null);
  const largest = Math.max(...knownValues, 0);
  const width = (value) => {
    const amount = financeNumber(value);
    return amount === null || largest === 0 ? 0 : Math.round((amount / largest) * 100);
  };
  target.innerHTML = dailySeries.map((item) => `
    <article class="finance-next-day">
      <time datetime="${html(item.date)}">${html(formatDate(item.date))}</time>
      <div class="finance-next-day-values">
        <span class="money-in"><i style="--finance-bar-width: ${width(item.income)}%"></i>${html(formatFinanceAmount(item.income))}</span>
        <span class="money-out"><i style="--finance-bar-width: ${width(item.expense)}%"></i>${html(formatFinanceAmount(item.expense))}</span>
      </div>
    </article>
  `).join("");
}

function receivablesMarkup(receivables) {
  if (!receivables.length) return '<p class="finance-next-empty">Nenhuma encomenda com valor pendente.</p>';
  return receivables.map(({ order, amount }) => `
    <article class="finance-next-receivable">
      <strong>${html(order?.orderCode || order?.id || "Não informado")}</strong>
      <span>${html(formatFinanceAmount(amount))}</span>
    </article>
  `).join("");
}

function renderReceivables(receivables) {
  const markup = receivablesMarkup(receivables);
  byId("financeOverviewReceivables").innerHTML = markup;
  byId("financeReceivablesList").innerHTML = markup;
}

export function renderCash() {
  const model = buildFinanceNextModel({ cash: state.data.cash, orders: state.data.orders });
  let running = 0;
  let runningKnown = true;
  const rows = filterCash(filterRows([...model.rows], ["description", "category", "type"]));
  const rowsWithBalance = rows.map((entry) => {
    const income = financeNumber(entry.income);
    const expense = financeNumber(entry.expense);
    if (income === null || expense === null) runningKnown = false;
    if (runningKnown) running = roundMoney(running + income - expense);
    return { ...entry, runningBalance: runningKnown ? running : null };
  });
  const page = paginateCashRows(rowsWithBalance, cashPage);
  cashPage = page.page;
  renderFinanceKpis(model.summary);
  renderDailySeries(model.dailySeries);
  renderReceivables(model.receivables);
  byId("cashTable").innerHTML = page.rows.map((entry) => {
    const income = financeNumber(entry.income);
    const expense = financeNumber(entry.expense);
    return `
      <tr>
        <td data-label="Data">${html(formatDate(entry.date) || "Não informado")}</td>
        <td data-label="Tipo">${html(entry.type || "Não informado")}</td>
        <td data-label="Categoria">${html(entry.category || "Não informado")}</td>
        <td data-label="Descrição"><strong>${html(entry.description || "Não informado")}</strong><small>${html(entry.method || "")}</small></td>
        <td class="money-in" data-label="Entrada">${html(formatFinanceAmount(income))}</td>
        <td class="money-out" data-label="Saída">${html(formatFinanceAmount(expense))}</td>
        <td data-label="Saldo">${html(formatFinanceAmount(entry.runningBalance))}</td>
        <td data-label="Ações">
          ${state.canEdit ? `<button class="icon-btn" type="button" data-action="edit-cash" data-id="${entry.id}">Editar</button>
          <button class="icon-btn danger" type="button" data-action="delete-cash" data-id="${entry.id}">Excluir</button>` : "-"}
        </td>
      </tr>
    `;
  }).join("");
  renderCashPagination(page);
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
    expense: type === "Saída" ? amount : 0,
  };
  const index = state.data.cash.findIndex((entry) => entry.id === item.id);
  if (index >= 0) state.data.cash[index] = item;
  else state.data.cash.push(item);
  await persist("cash", item);
  resetCashForm();
  saveData();
  render();
}

export function startCashEdit(id) {
  const item = state.data.cash.find((entry) => entry.id === id);
  if (!item) return;
  setFinanceTab("ledger");
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

export function setFinanceTab(tab) {
  const activeTab = ["overview", "ledger", "receivables"].includes(tab) ? tab : "overview";
  document.querySelectorAll("[data-finance-tab]").forEach((button) => {
    const active = button.dataset.financeTab === activeTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  ["overview", "ledger", "receivables"].forEach((name) => {
    byId(`finance${name[0].toUpperCase()}${name.slice(1)}Pane`).hidden = name !== activeTab;
  });
}

export function handleFinanceTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...document.querySelectorAll("[data-finance-tab]")];
  if (!tabs.length) return;
  event.preventDefault();
  const current = Math.max(0, tabs.indexOf(event.currentTarget));
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  const next = tabs[nextIndex];
  setFinanceTab(next.dataset.financeTab);
  next.focus();
}

export function revealCashForm() {
  setFinanceTab("ledger");
  const form = byId("cashForm");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.date.focus();
}
