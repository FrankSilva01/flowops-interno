import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { paginateItems } from "../../js/features/platform-modules.js";

const index = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("platform modules preserve operational contracts", () => {
  for (const id of [
    "notificationsPageMarkAllBtn", "notificationsPageClearBtn", "notificationsPageFilters",
    "notificationsPageList", "notificationsPagePagination", "supportTicketForm",
    "supportTicketsList", "announcementsList", "changelogList", "logTypeFilter",
    "historyDateFrom", "historyDateTo", "logsList", "loadMoreHistoryBtn",
  ]) assert.match(index, new RegExp(`id="${id}"`));
});

test("notification pagination clamps pages and reports totals", () => {
  const items = Array.from({ length: 23 }, (_, index) => index + 1);
  assert.deepEqual(paginateItems(items, 2, 10), {
    items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], page: 2, pageSize: 10, total: 23, totalPages: 3,
  });
  assert.equal(paginateItems(items, 99, 10).page, 3);
  assert.equal(paginateItems([], 1, 10).totalPages, 1);
});

test("platform modules expose FlowOps Next responsive shells", () => {
  for (const className of ["flowops-next-notifications", "flowops-next-support", "flowops-next-whatsnew", "flowops-next-history"]) {
    assert.match(index, new RegExp(className));
  }
  assert.match(css, /\.platform-next-pagination/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*flowops-next-support/);
});

