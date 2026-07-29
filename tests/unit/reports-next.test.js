import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../../css/27-flowops-next-reports.css", import.meta.url), "utf8");
const cssBundle = readFileSync(new URL("../../css/flowops.css", import.meta.url), "utf8");
const router = readFileSync(new URL("../../js/core/router.js", import.meta.url), "utf8");
const reports = readFileSync(new URL("../../js/features/reports.js", import.meta.url), "utf8");

test("reports view exposes five primary groups and a secondary report selector", () => {
  assert.match(html, /id="reportsView"[^>]*flowops-next-reports/);
  assert.equal((html.match(/data-report-group=/g) || []).length, 5);
  assert.match(html, /data-report-group="overview"/);
  assert.match(html, /data-report-group="commercial"/);
  assert.match(html, /data-report-group="operation"/);
  assert.match(html, /data-report-group="finance"/);
  assert.match(html, /data-report-group="stock"/);
  assert.match(html, /id="reportSecondaryTabs"/);
});

test("reports preserve filters, content, pagination and export contracts", () => {
  for (const id of [
    "reportPeriodFilter",
    "reportGroupFilter",
    "clearReportFiltersBtn",
    "applyReportFiltersBtn",
    "reportsContent",
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(router, /state\.reportTablePage\s*=\s*1/);
  assert.match(router, /renderReports\(\)/);
});

test("reports navigation provides ARIA keyboard behavior", () => {
  const navigationSource = `${router}\n${reports}`;
  assert.match(html, /role="tablist"[^>]*aria-label="Grupos de relatórios"/);
  assert.match(router, /ArrowRight/);
  assert.match(router, /ArrowLeft/);
  assert.match(router, /Home/);
  assert.match(router, /End/);
  assert.match(navigationSource, /aria-selected/);
  assert.match(navigationSource, /tabIndex/);
});

test("reports CSS is scoped, bundled once and prevents page-level overflow", () => {
  assert.match(cssSource, /#reportsView\.flowops-next-reports/);
  assert.match(cssSource, /\.report-table-card\s+\.table-scroll/);
  assert.match(cssSource, /overflow-x:\s*auto/);
  assert.match(cssSource, /max-width:\s*100%/);
  assert.equal((cssBundle.match(/SOURCE: css\/27-flowops-next-reports\.css/g) || []).length, 1);
});
