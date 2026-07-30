import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("dashboard prioriza quatro indicadores e recolhe o resumo financeiro complementar", () => {
  const primary = page.match(/<div class="dashboard-today-grid dashboard-primary-grid">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.equal((primary.match(/class="kpi"/g) || []).length, 4);
  for (const id of ["kpiOpenOrders", "kpiReceivable", "kpiLateOrders", "kpiMonthIncome"]) {
    assert.match(primary, new RegExp(`id="${id}"`));
  }
  assert.match(page, /<details class="dashboard-financial-summary">[\s\S]*id="kpiIncome"[\s\S]*id="kpiExpense"[\s\S]*id="kpiBalance"[\s\S]*id="kpiMonthOrders"/);
  assert.match(page, /<span>Encomendas abertas<\/span>/);
  assert.match(page, /<span>Em risco<\/span>/);
  assert.match(page, /Prioridades da sua operação hoje/);
});

test("menu segue a hierarquia funcional do FlowOps Next", () => {
  for (const group of ["Início", "Comercial", "Operação", "Gestão", "Administração", "Plataforma"]) {
    assert.match(page, new RegExp(`<span class="sidebar-group-label">${group}</span>`));
  }
  assert.ok(page.indexOf(">Comercial</span>") < page.indexOf('data-view="leads"'));
  assert.ok(page.indexOf(">Operação</span>") < page.indexOf('data-view="orders"'));
  assert.ok(page.indexOf(">Gestão</span>") < page.indexOf('data-view="cash"'));
});

test("dashboard possui composicao operacional aprovada do prototipo", () => {
  assert.match(page, /id="dashboardNextContent"/);
  assert.match(page, /class="next-dashboard-grid"/);
  assert.match(page, /Ações necessárias/);
  assert.match(page, /Produção e capacidade/);
  assert.match(page, /Recebimentos da semana/);
  assert.match(page, /Estoque crítico/);
});
