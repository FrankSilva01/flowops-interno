import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

globalThis.window = globalThis.window || { location: { hash: "" } };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };

const { state } = await import("../../js/core/state.js");
const { renderLogistics, openLogisticsDialog } = await import("../../js/features/logistics.js");

const indexHtml = new URL("../../index.html", import.meta.url);
const logisticsSource = new URL("../../js/features/logistics.js", import.meta.url);
const logisticsCss = new URL("../../css/flowops.css", import.meta.url);

function cssBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing ${selector} rule`);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

test("Logistics keeps FlowOps Next summary, attention, and responsive list contracts", async () => {
  const markup = await readFile(indexHtml, "utf8");

  assert.match(markup, /id=["']logisticsView["'][^>]*\bflowops-next-logistics\b/);
  assert.match(markup, /id=["']logisticsPageSummary["'][^>]*\blogistics-next-summary\b/);
  assert.match(markup, /id=["']logisticsActionBoard["'][^>]*\blogistics-next-attention\b/);
  assert.match(markup, /class=["'][^"']*\blogistics-next-list\b/);
  assert.match(markup, /class=["'][^"']*\blogistics-next-table\b/);
  assert.match(markup, /id=["']logisticsTable["']/);
});

test("Logistics retains synchronization, public tracking, and form contracts", async () => {
  const markup = await readFile(indexHtml, "utf8");
  const source = await readFile(logisticsSource, "utf8");

  for (const action of ["sync-all-ml-shipments", "sync-ml-shipment", "copy-public-tracking"]) {
    assert.match(markup, new RegExp(`data-action=["']${action}["']`));
  }
  assert.match(source, /data-action="open-logistics"/);
  for (const name of ["orderId", "carrier", "trackingCode", "status", "estimatedDeliveryDate", "eventStatus", "eventMessage"]) {
    assert.match(markup, new RegExp(`name=["']${name}["']`));
  }
  assert.match(markup, /id=["']logisticsSyncStatus["'][^>]*\blogistics-next-sync-status\b/);
  assert.match(markup, /id=["']logisticsDialog["'][^>]*\blogistics-next-drawer\b/);
  assert.match(markup, /id=["']logisticsTimeline["'][^>]*\blogistics-next-timeline\b/);
});

test("Logistics renders the presentation model with a local operational date and preserves sync paths", async () => {
  const source = await readFile(logisticsSource, "utf8");

  assert.match(source, /import\s*\{\s*buildLogisticsPresentation\s*\}/);
  assert.match(source, /buildLogisticsPresentation\([\s\S]*?state\.data\.orders[\s\S]*?state\.orderLogistics[\s\S]*?now:\s*new Date\(\)/);
  assert.match(source, /maybeAutoSyncMarketplaceLogistics\(/);
  assert.match(source, /applyLogisticsSync\(/);
  assert.match(source, /setLogisticsMutationControlsDisabled\(state\.canEdit\)/);
  assert.match(source, /data-logistics-cell=/);
});

test("Logistics Next source does not introduce mojibake into operational labels", async () => {
  const source = await readFile(logisticsSource, "utf8");

  assert.doesNotMatch(source, /\u00c3/);
});

test("Read-only logistics disables page and drawer marketplace synchronization controls", () => {
  const originalDocument = globalThis.document;
  const originalData = state.data;
  const originalCanEdit = state.canEdit;
  const originalLogistics = state.orderLogistics;
  const originalEvents = state.logisticsEvents;
  const originalSearch = state.logisticsSearch;
  const originalStatusFilter = state.logisticsStatusFilter;
  const syncAllButton = { disabled: false };
  const syncShipmentButton = { disabled: false, dataset: {} };
  const logisticsForm = {
    elements: {
      orderId: { value: "" }, carrier: { value: "" }, trackingCode: { value: "" }, status: { value: "" }, estimatedDeliveryDate: { value: "" },
    },
    querySelectorAll: () => [],
  };
  const eventForm = { elements: { orderId: { value: "" } }, querySelectorAll: () => [] };
  const elements = {
    logisticsView: {},
    logisticsPageSummary: { innerHTML: "" },
    logisticsActionBoard: { innerHTML: "" },
    logisticsTable: { innerHTML: "" },
    syncAllMlShipmentsBtn: syncAllButton,
    logisticsForm,
    logisticsEventForm: eventForm,
    logisticsSyncMlButton: syncShipmentButton,
    copyPublicTrackingLinkButton: { disabled: false, dataset: {} },
    logisticsDialogTitle: { textContent: "" },
    logisticsTimeline: { innerHTML: "" },
    logisticsDialog: { showModal: () => {} },
  };
  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => [],
  };
  state.canEdit = false;
  state.data = { ...state.data, orders: [] };
  state.orderLogistics = [];
  state.logisticsEvents = [];
  state.logisticsSearch = "";
  state.logisticsStatusFilter = "all";

  try {
    renderLogistics();
    assert.equal(syncAllButton.disabled, true);

    state.data = { ...state.data, orders: [{ id: "PED-READ-ONLY", orderCode: "PED-READ-ONLY", status: "Entregue" }] };
    openLogisticsDialog("PED-READ-ONLY");
    assert.equal(syncShipmentButton.disabled, true);
  } finally {
    globalThis.document = originalDocument;
    state.data = originalData;
    state.canEdit = originalCanEdit;
    state.orderLogistics = originalLogistics;
    state.logisticsEvents = originalEvents;
    state.logisticsSearch = originalSearch;
    state.logisticsStatusFilter = originalStatusFilter;
  }
});

test("Logistics stacks table rows on mobile without adding page-level list overflow", async () => {
  const css = await readFile(logisticsCss, "utf8");

  assert.match(cssBlock(css, ".logistics-next-list"), /overflow:\s*hidden/);
  assert.match(cssBlock(css, ".logistics-next-table"), /width:\s*100%/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.logistics-next-table thead\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.logistics-next-table tr\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.logistics-next-table td::before/);
});
