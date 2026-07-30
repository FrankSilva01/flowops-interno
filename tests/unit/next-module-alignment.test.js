import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const customers = readFileSync(new URL("../../js/features/customers.js", import.meta.url), "utf8");
const logistics = readFileSync(new URL("../../js/features/logistics.js", import.meta.url), "utf8");
const production = readFileSync(new URL("../../js/features/production.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");

test("Clientes e Leads possui somente uma faixa de indicadores", () => {
  assert.doesNotMatch(customers, /renderOperationalSummary\("leadsView", "leadsPageSummary"/);
  assert.match(page, /id="leadsNextSummary" class="commercial-next-summary"/);
});

test("Clientes e Leads sao rotas comerciais distintas como no prototipo", () => {
  assert.match(page, /data-view="customers"[^>]*>[\s\S]*?Clientes<\/span>/);
  assert.match(page, /data-view="leads"[^>]*>[\s\S]*?Leads<\/span>/);
  assert.match(page, /id="customersView"[^>]*class="view[^\"]*flowops-next-commercial/);
  assert.match(router, /case "customers":[\s\S]*renderCustomersPage\(\)/);
});

test("cards de producao reservam linhas completas para metadados e controles", () => {
  assert.match(styles, /\.production-next-card > strong,[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.production-next-card \.kanban-inline-fields[\s\S]*grid-column:\s*1\s*\/\s*-1/);
});

test("Producao segue o resumo compacto e edita pelo drawer", () => {
  const summary = production.match(/renderProductionSummary\(presentation\)[\s\S]*?target\.innerHTML = `[\s\S]*?\$\{\[([\s\S]*?)\]\.map/)?.[1] || "";
  assert.equal((summary.match(/^      \[/gm) || []).length, 4);
  const card = production.match(/export function renderKanbanCard[\s\S]*?return `([\s\S]*?)`;\n}/)?.[1] || "";
  assert.doesNotMatch(card, /renderInlineSelect/);
});

test("Logistica prioriza quatro KPIs e recolhe alertas secundarios", () => {
  assert.match(page, /<details class="logistics-attention-details">/);
  const summaryCall = logistics.match(/renderOperationalSummary\("logisticsView", "logisticsPageSummary", \[([\s\S]*?)\n  \]\);/)?.[1] || "";
  assert.equal((summaryCall.match(/^    \[/gm) || []).length, 4);
});

test("Logistica apresenta as quatro areas do prototipo", () => {
  for (const label of ["Expedições", "Rastreamento", "Ocorrências", "Transportadoras"]) {
    assert.match(page, new RegExp(`data-logistics-tab="[^"]+"[^>]*>${label}`));
  }
});

test("cabecalho e menu identificam o grupo funcional de cada rota", () => {
  assert.match(page, /id="viewGroup" class="eyebrow">Início/);
  for (const group of ["Comercial", "Operação", "Gestão", "Administração", "Plataforma"]) {
    assert.match(router, new RegExp(`: "${group}"`));
  }
  assert.match(styles, /\.flowops-next-shell:not\(\.sidebar-collapsed\) \.flowops-next-sidebar \.sidebar-group-label[\s\S]*overflow:\s*visible !important/);
});

test("shell final segue as dimensoes e tokens do prototipo aprovado", () => {
  assert.match(styles, /FlowOps Next prototype fidelity/);
  assert.match(styles, /--fo-sidebar:\s*248px/);
  assert.match(styles, /--fo-accent:\s*#27c7b8/);
  assert.match(styles, /\.topbar\s*\{[^}]*height:\s*64px/s);
  assert.match(styles, /\.workspace\s*\{[^}]*padding:\s*0\s*!important/s);
  assert.match(styles, /\.view\s*\{[^}]*padding:\s*20px 24px 40px/s);
  assert.match(styles, /@media \(max-width:\s*720px\)[\s\S]*\.sidebar\s*\{[^}]*bottom:\s*0/s);
});
