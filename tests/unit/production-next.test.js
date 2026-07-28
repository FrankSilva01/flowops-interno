import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

  assert.match(source, /import\s*\{\s*buildProductionPresentation\s*\}/);
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
