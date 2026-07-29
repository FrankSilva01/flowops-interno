import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const customers = readFileSync(new URL("../../js/features/customers.js", import.meta.url), "utf8");
const logistics = readFileSync(new URL("../../js/features/logistics.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");

test("Clientes e Leads possui somente uma faixa de indicadores", () => {
  assert.doesNotMatch(customers, /renderOperationalSummary\("leadsView", "leadsPageSummary"/);
  assert.match(page, /id="leadsNextSummary" class="commercial-next-summary"/);
});

test("cards de producao reservam linhas completas para metadados e controles", () => {
  assert.match(styles, /\.production-next-card > strong,[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.production-next-card \.kanban-inline-fields[\s\S]*grid-column:\s*1\s*\/\s*-1/);
});

test("Logistica prioriza quatro KPIs e recolhe alertas secundarios", () => {
  assert.match(page, /<details class="logistics-attention-details">/);
  const summaryCall = logistics.match(/renderOperationalSummary\("logisticsView", "logisticsPageSummary", \[([\s\S]*?)\n  \]\);/)?.[1] || "";
  assert.equal((summaryCall.match(/^    \[/gm) || []).length, 4);
});

test("cabecalho e menu identificam o grupo funcional de cada rota", () => {
  assert.match(page, /id="viewGroup" class="eyebrow">Início/);
  for (const group of ["Comercial", "Operação", "Gestão", "Administração", "Plataforma"]) {
    assert.match(router, new RegExp(`: "${group}"`));
  }
  assert.match(styles, /\.flowops-next-shell:not\(\.sidebar-collapsed\) \.flowops-next-sidebar \.sidebar-group-label[\s\S]*overflow:\s*visible !important/);
});
