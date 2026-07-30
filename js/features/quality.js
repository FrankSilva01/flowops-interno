import { state } from "../core/state.js";
import { byId, html, safeUrl } from "../core/dom.js";
import { bindActions } from "../core/router.js";
import { buildQualityPresentation } from "./quality-presentation.js";

function inspectionRow(item) {
  const image = safeUrl(item.referenceImageUrl);
  return `
    <button class="quality-queue-row" type="button" data-action="open-order-drawer" data-id="${html(item.id)}">
      <span class="quality-thumb">${image ? `<img src="${html(image)}" alt="" />` : `<i class="ti ti-package" aria-hidden="true"></i>`}</span>
      <span><strong>${html(item.orderCode)} · ${html(item.description)}</strong><small>${html(item.client)} · ${html(item.material)} · ${html(item.quantityLabel)}</small></span>
      <span class="quality-priority">${html(item.priority)}</span>
    </button>`;
}

export function renderQuality() {
  const model = buildQualityPresentation(state.data.orders);
  const summary = byId("qualitySummary");
  const queue = byId("qualityQueue");
  if (!summary || !queue) return;

  summary.innerHTML = [
    ["Aguardando inspeção", model.summary.waiting, "itens na fila"],
    ["Aprovados", model.summary.approved, "registros informados"],
    ["Retrabalho", model.summary.rework, "retornaram à produção"],
    ["Ocorrências", model.summary.occurrences, "exigem análise"],
  ].map(([label, value, note]) => `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");

  queue.innerHTML = model.queue.length
    ? model.queue.map(inspectionRow).join("")
    : `<div class="quality-empty"><i class="ti ti-badge-check" aria-hidden="true"></i><strong>Nenhum item aguardando inspeção</strong><span>Pedidos movidos para Qualidade aparecerão aqui.</span></div>`;
  bindActions();
}
