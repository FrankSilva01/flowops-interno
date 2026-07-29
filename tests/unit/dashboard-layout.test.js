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
});
