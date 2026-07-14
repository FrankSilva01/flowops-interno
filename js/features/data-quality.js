import { state } from "../core/state.js";
import { html } from "../core/dom.js";

const SEVERITY_WEIGHT = { critical: 3, warning: 2, review: 1 };

export function analyzeDataQuality() {
  const issues = [];
  const add = (module, id, label, problems, severity = "warning", meta = {}) => {
    if (problems.length) issues.push({ module, id, label: label || "Registro sem nome", problems, severity, ...meta });
  };

  const orderDuplicates = duplicateKeys(state.data.orders, (item) => [item.client, item.description, item.charged]);
  state.data.orders.forEach((item) => {
    const problems = [];
    if (!clean(item.description)) problems.push("Nome da encomenda não informado");
    if (!clean(item.client)) problems.push("Cliente não informado");
    if (!clean(item.material)) problems.push("Material não informado");
    if (!item.deliveryDate && item.status !== "Entregue" && !item.quoteStage) problems.push("Prazo de entrega não definido");
    if (Number(item.charged || 0) <= 0 && !item.quoteStage) problems.push("Valor da encomenda não informado");
    if (!clean(item.responsible) && item.status !== "Entregue" && !item.quoteStage) problems.push("Responsável não definido");
    if (orderDuplicates.has(recordKey([item.client, item.description, item.charged]))) problems.push("Possível encomenda duplicada");
    add("orders", item.id, item.description || item.orderCode || item.id, problems, problems.some((value) => value.includes("duplicada")) ? "critical" : "warning", { code: item.orderCode || item.id });
  });

  const leadDuplicates = duplicateKeys(state.leads, (item) => [item.email || "", phoneKey(item.whatsapp || item.phone)]);
  state.leads.forEach((item) => {
    const problems = [];
    if (!clean(item.name)) problems.push("Nome do contato não informado");
    if (!clean(item.email) && !phoneKey(item.whatsapp || item.phone)) problems.push("Contato sem e-mail ou WhatsApp");
    if (leadDuplicates.has(recordKey([item.email || "", phoneKey(item.whatsapp || item.phone)]))) problems.push("Possível cliente ou lead duplicado");
    if (!clean(item.status)) problems.push("Status comercial não definido");
    add("leads", item.id, item.name || item.email || item.whatsapp, problems, problems.some((value) => value.includes("duplicado")) ? "critical" : "warning");
  });

  const materialDuplicates = duplicateKeys(state.data.materials, (item) => [item.date, item.supplier, item.type, item.spec, item.quantity, item.unitCost]);
  state.data.materials.forEach((item) => {
    const problems = [];
    if (!clean(item.type)) problems.push("Material não informado");
    if (!clean(item.supplier)) problems.push("Fornecedor não informado");
    if (!item.date) problems.push("Data da compra não informada");
    if (Number(item.quantity || 0) <= 0) problems.push("Quantidade inválida ou zerada");
    if (Number(item.unitCost || 0) <= 0) problems.push("Custo unitário não informado");
    if (materialDuplicates.has(recordKey([item.date, item.supplier, item.type, item.spec, item.quantity, item.unitCost]))) problems.push("Possível compra duplicada");
    add("materials", item.id, [item.type, item.spec].filter(Boolean).join(" - ") || item.id, problems, problems.some((value) => value.includes("duplicada")) ? "critical" : "warning");
  });

  const inventoryDuplicates = duplicateKeys(state.inventoryItems, (item) => [item.name || item.description || item.material]);
  state.inventoryItems.forEach((item) => {
    const label = item.name || item.description || item.material;
    const problems = [];
    if (!clean(label)) problems.push("Nome do item não informado");
    if (!clean(item.unit)) problems.push("Unidade de medida não definida");
    if (Number(item.quantity || 0) < 0) problems.push("Saldo de estoque negativo");
    if (item.minimum_quantity === null || item.minimum_quantity === undefined || item.minimum_quantity === "") problems.push("Estoque mínimo não definido");
    if (inventoryDuplicates.has(recordKey([label]))) problems.push("Possível item de estoque duplicado");
    add("inventory", item.id, label || item.id, problems, problems.some((value) => value.includes("duplicado") || value.includes("negativo")) ? "critical" : "review");
  });

  const listingDuplicates = duplicateKeys(state.marketplaceListings, (item) => [item.marketplace, item.external_id || item.id]);
  state.marketplaceListings.forEach((item) => {
    const problems = [];
    if (!clean(item.title || item.name)) problems.push("Título do anúncio não informado");
    if (Number(item.price || 0) <= 0) problems.push("Preço do anúncio não informado");
    if (item.stock === null || item.stock === undefined || Number(item.stock) < 0) problems.push("Estoque do anúncio inválido");
    if (!clean(item.external_id || item.id)) problems.push("Código externo não informado");
    if (listingDuplicates.has(recordKey([item.marketplace, item.external_id || item.id]))) problems.push("Possível anúncio duplicado");
    add("marketplace", item.external_id || item.id, item.title || item.name || item.external_id, problems, problems.some((value) => value.includes("duplicado")) ? "critical" : "warning", { marketplace: item.marketplace });
  });

  issues.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.module.localeCompare(b.module) || a.label.localeCompare(b.label, "pt-BR"));
  const totalRecords = state.data.orders.length + state.leads.length + state.data.materials.length + state.inventoryItems.length + state.marketplaceListings.length;
  const affectedRecords = issues.length;
  return {
    issues,
    totalRecords,
    affectedRecords,
    score: totalRecords ? Math.max(0, Math.round((1 - affectedRecords / totalRecords) * 100)) : 100,
    critical: issues.filter((item) => item.severity === "critical").length,
    duplicates: issues.filter((item) => item.problems.some((problem) => problem.toLowerCase().includes("duplicad"))).length,
  };
}

export function renderDataQualityReport(content) {
  const report = analyzeDataQuality();
  const groups = groupIssues(report.issues);
  content.innerHTML = `
    <div class="report-section-heading data-quality-heading">
      <div><p class="eyebrow">Organização</p><h2>Qualidade dos dados</h2><small>Revise cadastros incompletos e possíveis duplicidades antes que afetem relatórios e automações.</small></div>
      <span class="data-quality-score ${scoreTone(report.score)}"><strong>${report.score}%</strong><small>qualidade geral</small></span>
    </div>
    <div class="report-kpi-grid report-kpi-grid-compact data-quality-kpis">
      ${qualityKpi("Registros analisados", report.totalRecords, "Base operacional atual", "teal", "ti-database")}
      ${qualityKpi("Precisam de revisão", report.affectedRecords, "Abra e complete o cadastro", report.affectedRecords ? "amber" : "green", "ti-clipboard-check")}
      ${qualityKpi("Possíveis duplicados", report.duplicates, "Confirmar antes de excluir", report.duplicates ? "red" : "green", "ti-copy")}
      ${qualityKpi("Críticos", report.critical, "Podem distorcer a operação", report.critical ? "red" : "green", "ti-alert-triangle")}
    </div>
    ${report.issues.length ? `<div class="data-quality-groups">${Object.entries(groups).map(([module, items]) => renderIssueGroup(module, items)).join("")}</div>` : `<section class="panel data-quality-empty"><i class="ti ti-circle-check"></i><div><h3>Base organizada</h3><p>Nenhum cadastro incompleto ou possível duplicidade foi encontrado.</p></div></section>`}
  `;
}

function renderIssueGroup(module, items) {
  const info = moduleInfo(module);
  return `<section class="panel data-quality-group">
    <div class="panel-head"><div><h3><i class="ti ${info.icon}"></i>${info.label}</h3><small>${items.length} registro(s) para revisar</small></div><span class="badge ${items.some((item) => item.severity === "critical") ? "danger" : "queue"}">${items.length}</span></div>
    <div class="data-quality-list">${items.map((item) => `<article class="data-quality-item ${item.severity}">
      <span class="data-quality-indicator" aria-hidden="true"></span>
      <div class="data-quality-item-copy"><strong>${html(item.label)}</strong>${item.code ? `<small>${html(item.code)}</small>` : ""}<ul>${item.problems.map((problem) => `<li>${html(problem)}</li>`).join("")}</ul></div>
      <button class="secondary-btn compact" type="button" data-quality-open="${html(item.module)}" data-id="${html(item.id)}" data-marketplace="${html(item.marketplace || "")}"><i class="ti ti-edit"></i>Corrigir</button>
    </article>`).join("")}</div>
  </section>`;
}

function qualityKpi(label, value, detail, tone, icon) {
  return `<article class="report-kpi ${tone}"><i class="ti ${icon}"></i><span>${html(label)}</span><strong>${html(String(value))}</strong><small>${html(detail)}</small></article>`;
}

function groupIssues(issues) {
  return issues.reduce((groups, item) => { (groups[item.module] ||= []).push(item); return groups; }, {});
}

function duplicateKeys(rows, keyGetter) {
  const counts = new Map();
  rows.forEach((item) => {
    const key = recordKey(keyGetter(item));
    if (!key || !key.replaceAll("|", "")) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function recordKey(values) { return values.map(clean).join("|"); }
function clean(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " "); }
function phoneKey(value) { return String(value || "").replace(/\D/g, ""); }
function scoreTone(score) { return score >= 90 ? "good" : score >= 70 ? "attention" : "critical"; }
function moduleInfo(module) {
  return ({
    orders: { label: "Encomendas", icon: "ti-package" }, leads: { label: "Clientes e Leads", icon: "ti-users" },
    materials: { label: "Compras de materiais", icon: "ti-receipt" }, inventory: { label: "Estoque e insumos", icon: "ti-box" },
    marketplace: { label: "Anúncios do marketplace", icon: "ti-building-store" },
  })[module] || { label: module, icon: "ti-file" };
}
