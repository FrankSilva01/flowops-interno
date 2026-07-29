import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../../js/core/router.js", import.meta.url), "utf8");
const quotes = await readFile(new URL("../../js/features/quotes.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("index.html ganha a view quotes (menu + section + tabela real)", () => {
  assert.match(html, /data-view=["']quotes["']/);
  assert.match(html, /<section id=["']quotesView["'][^>]*class=["'][^"']*flowops-next-commercial/);
  assert.match(html, /id=["']quotesNextSummary["']/);
  assert.match(html, /id=["']quotesTableBody["']/);
  // colunas reais do orçamento
  for (const col of ["Orçamento", "Cliente", "Versão", "Validade", "Valor", "Status"]) {
    assert.match(html, new RegExp(`<th>${col}</th>`));
  }
});

test("router habilita a rota quotes (allowlist + título + case)", () => {
  assert.match(router, /from ["']\.\.\/features\/quotes\.js["']/);
  assert.match(router, /renderQuotes/);
  assert.match(router, /"quotes"/);
  assert.match(router, /quotes:\s*"Orçamentos"/);
  assert.match(router, /case "quotes":/);
});

test("quotes.js deriva de orders com quoteStage e reusa o drawer de encomenda", () => {
  assert.match(quotes, /from ["']\.\/commercial-presentation\.js["']/);
  assert.match(quotes, /buildQuotesModel/);
  assert.match(quotes, /function renderQuotes\(/);
  assert.match(quotes, /data-action=["']open-order-drawer["']/);
  assert.match(quotes, /money\.format\(/);
  assert.doesNotMatch(quotes, /\bmoney\(/);
  assert.match(quotes, /addEventListener\(["']keydown["']/);
  assert.match(quotes, /event\.key === ["']Enter["']/);
  assert.match(quotes, /event\.key === ["'] ["']/);
});

test("CSS quotes-next concatenado sob o escopo comercial", () => {
  assert.match(css, /\.flowops-next-commercial \.quotes-next-table/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.quotes-next-table[\s\S]*min-width:\s*0/);
  assert.match(css, /\.quotes-next-table thead[\s\S]*display:\s*none/);
});
