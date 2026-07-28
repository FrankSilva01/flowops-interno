import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

globalThis.window = globalThis.window || { location: { hash: "" } };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };

const { state } = await import("../../js/core/state.js");
const { renderProduction } = await import("../../js/features/production.js");

const indexHtml = new URL("../../index.html", import.meta.url);
const productionSource = new URL("../../js/features/production.js", import.meta.url);
const productionCss = new URL("../../css/flowops.css", import.meta.url);

function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing ${selector} rule`);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("Production keeps the FlowOps Next board structure and stable filter contracts", async () => {
  const markup = await readFile(indexHtml, "utf8");

  assert.match(markup, /id=["']productionView["'][^>]*\bflowops-next-production\b/);
  assert.match(markup, /id=["']productionStageSummary["'][^>]*\bproduction-next-summary\b/);
  assert.match(markup, /id=["']kanbanFilters["']/);
  assert.match(markup, /class=["'][^"']*\bproduction-next-board\b/);
  assert.match(markup, /class=["'][^"']*\bproduction-next-board-scroll\b/);
  assert.match(markup, /id=["']kanbanBoard["']/);
});

test("Production renders the presentation model with its local operational date", async () => {
  const source = await readFile(productionSource, "utf8");

  assert.match(source, /import\s*\{\s*buildProductionPresentation\s*,\s*isProductionEligible\s*\}/);
  assert.match(source, /export\s*\{\s*isProductionEligible\s*\}/);
  assert.match(source, /buildProductionPresentation\([\s\S]*?stages:\s*PRODUCTION_STAGES[\s\S]*?now:\s*new Date\(\)/);
  assert.match(source, /filterProductionOrders\(/);
  assert.match(source, /updateOrderInline\(/);
});

test("Production cards retain drawer, edit, copy, and inline update controls", async () => {
  const source = await readFile(productionSource, "utf8");

  for (const action of ["open-order-drawer", "edit-order-modal", "copy-marketplace-code"]) {
    assert.match(source, new RegExp(`data-action=\\"${action}\\"`));
  }
  assert.match(source, /renderInlineSelect\("status"/);
  assert.match(source, /renderInlineSelect\("priority"/);
  assert.match(source, /renderInlineSelect\("responsible"/);
});

test("Only the production board scroll container owns horizontal overflow", async () => {
  const css = await readFile(productionCss, "utf8");

  assert.match(cssBlock(css, ".production-next-board-scroll"), /overflow-x:\s*auto/);
  assert.match(cssBlock(css, ".production-next-board"), /min-width:\s*0/);
  assert.doesNotMatch(cssBlock(css, ".production-next-board"), /overflow-x:\s*auto/);
});

test("approved quotes remain pending while converted quotes enter the production render", () => {
  const originalDocument = globalThis.document;
  const originalData = state.data;
  const originalQuery = state.query;
  const originalFilters = structuredClone(state.filters);
  const elements = Object.fromEntries([
    "kanbanFilters",
    "kanbanBoard",
    "productionStageSummary",
    "productionQuoteSummary",
  ].map((id) => [id, { innerHTML: "", querySelectorAll: () => [] }]));
  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => [],
  };
  state.data = {
    ...state.data,
    orders: [
      { id: "PED-APPROVED", orderCode: "PED-APPROVED", description: "Approved quote", productionStage: "Em fila", status: "A preparar", quoteStage: "Aprovado" },
      { id: "PED-CONVERTED", orderCode: "PED-CONVERTED", description: "Converted quote", productionStage: "Em fila", status: "A preparar", quoteStage: "Convertido em encomenda" },
    ],
  };
  state.query = "";
  Object.assign(state.filters, {
    productionMaterial: "all",
    productionStatus: "all",
    productionMarketplace: "all",
  });

  try {
    renderProduction();

    assert.match(elements.productionQuoteSummary.innerHTML, /1 orçamento/);
    assert.doesNotMatch(elements.kanbanBoard.innerHTML, /PED-APPROVED/);
    assert.match(elements.kanbanBoard.innerHTML, /PED-CONVERTED/);
    assert.match(elements.productionStageSummary.innerHTML, /Pedidos<\/span><strong>1<\/strong>/);
  } finally {
    globalThis.document = originalDocument;
    state.data = originalData;
    state.query = originalQuery;
    Object.assign(state.filters, originalFilters);
  }
});
