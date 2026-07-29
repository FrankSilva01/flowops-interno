import test from "node:test";
import assert from "node:assert/strict";

import {
  REPORT_GROUPS,
  groupForReport,
  reportsForGroup,
} from "../../js/features/reports-navigation.js";

const EXISTING_REPORTS = [
  "overview",
  "financial",
  "production",
  "commercial",
  "marketplaces",
  "logistics",
  "pricing",
  "products",
  "materials",
  "clients",
  "stock",
  "quality",
];

test("organizes every existing report exactly once across five approved groups", () => {
  assert.deepEqual(Object.keys(REPORT_GROUPS), ["overview", "commercial", "operation", "finance", "stock"]);

  const groupedReports = Object.values(REPORT_GROUPS).flatMap((group) => group.reports.map((report) => report.key));
  assert.deepEqual(groupedReports.slice().sort(), EXISTING_REPORTS.slice().sort());
  assert.equal(new Set(groupedReports).size, EXISTING_REPORTS.length);
});

test("resolves a primary group and returns defensive report lists", () => {
  assert.equal(groupForReport("clients"), "commercial");
  assert.equal(groupForReport("logistics"), "operation");
  assert.equal(groupForReport("pricing"), "finance");
  assert.equal(groupForReport("quality"), "stock");
  assert.equal(groupForReport("unknown"), "overview");

  const reports = reportsForGroup("commercial");
  assert.deepEqual(reports.map((report) => report.key), ["commercial", "clients", "marketplaces"]);
  reports.pop();
  assert.equal(reportsForGroup("commercial").length, 3);
});

