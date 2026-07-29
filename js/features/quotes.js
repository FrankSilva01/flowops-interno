// FlowOps Next — view Orçamentos. Deriva de state.data.orders com quoteStage
// (buildQuotesModel, puro). Cada linha reusa o drawer de encomenda existente
// (data-action="open-order-drawer") — sem tabela nova nem estado paralelo.
import { state, money } from "../core/state.js";
import { byId, html } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { buildQuotesModel } from "./commercial-presentation.js";

function fmtDate(value) {
  if (!value || value === "—") return "—";
  const iso = String(value).slice(0, 10);
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(value);
}

export function renderQuotes() {
  const tableBody = byId("quotesTableBody");
  if (!tableBody) return;

  const searchInput = byId("quoteSearchInput");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    searchInput.addEventListener("input", (event) => {
      state.filters.quoteSearch = event.target.value.trim().toLowerCase();
      renderQuotes();
    });
  }

  const search = state.filters?.quoteSearch || "";
  const { summary, rows } = buildQuotesModel(state.data.orders || [], { search });

  const summaryEl = byId("quotesNextSummary");
  if (summaryEl) {
    const kpis = [
      ["Em aberto", String(summary.emAberto), money.format(summary.emAbertoValor)],
      ["Aguardando cliente", String(summary.aguardandoCliente), "resposta pendente"],
      ["Aprovados", `${summary.aprovadosPct}%`, "do total de orçamentos"],
    ];
    summaryEl.innerHTML = kpis.map(([label, value, hint]) => `
      <div class="commercial-next-kpi">
        <span class="kpi-label">${html(label)}</span>
        <strong class="kpi-value">${html(value)}</strong>
        <small class="kpi-hint">${html(hint)}</small>
      </div>`).join("");
  }

  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="6" class="quotes-next-empty">Nenhum orçamento em andamento. Encomendas com estágio de orçamento aparecem aqui.</td></tr>`;
    return;
  }

  tableBody.innerHTML = rows.map((row) => `
    <tr class="quotes-next-row" data-action="open-order-drawer" data-id="${html(row.id)}" tabindex="0" role="button" aria-label="Abrir orçamento ${html(row.orderCode)}">
      <td data-label="Orçamento"><strong>${html(row.orderCode)}</strong></td>
      <td data-label="Cliente">${html(row.client)}</td>
      <td data-label="Versão">${html(String(row.version))}</td>
      <td data-label="Validade">${html(fmtDate(row.validade))}</td>
      <td data-label="Valor">${money.format(row.valor)}</td>
      <td data-label="Status"><span class="quotes-next-status" data-stage="${html(row.status)}">${html(row.status)}</span></td>
    </tr>`).join("");

  bindActions();
  tableBody.querySelectorAll(".quotes-next-row").forEach((row) => {
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        row.click();
      }
    });
  });
}
