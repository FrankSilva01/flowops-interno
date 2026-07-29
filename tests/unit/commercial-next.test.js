import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const customers = await readFile(new URL("../../js/features/customers.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("leadsView adota o shell FlowOps Next e ganha a aba Pipeline + resumo", () => {
  assert.match(html, /id=["']leadsView["'][^>]*class=["'][^"']*flowops-next-commercial/);
  assert.match(html, /data-leads-tab=["']pipeline["']/);
  assert.match(html, /id=["']leadsPipelinePanel["']/);
  assert.match(html, /id=["']leadsNextSummary["']/);
});

test("customers.js consome os helpers puros e adiciona renderers Next", () => {
  assert.match(customers, /from ["']\.\/commercial-presentation\.js["']/);
  assert.match(customers, /buildLeadsPipeline/);
  assert.match(customers, /buildCustomersModel/);
  assert.match(customers, /function renderLeadsPipeline\(/);
  assert.match(customers, /function renderLeadsNextSummary\(/);
});

test("preserva os contratos data-action existentes dos leads", () => {
  for (const action of ["select-lead", "edit-lead", "open-lead-order"]) {
    assert.match(customers, new RegExp(`data-action=["']${action}["']`));
  }
});

test("CSS Next comercial concatenado com escopo próprio", () => {
  assert.match(css, /===== SOURCE: 23-flowops-next-commercial\.css =====/);
  assert.match(css, /\.flowops-next-commercial \.leads-next-pipeline/);
  assert.match(css, /\.flowops-next-commercial \.commercial-next-summary/);
});
