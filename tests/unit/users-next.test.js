import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  USER_MANAGEMENT_SECTIONS,
  userManagementSectionForKey,
  paginateUserManagementRows,
} from "../../js/features/users-navigation.js";

const root = new URL("../../", import.meta.url);

test("user management exposes the three FlowOps Next operational sections", () => {
  assert.deepEqual(USER_MANAGEMENT_SECTIONS, ["users", "responsibles", "approvals"]);
  assert.equal(userManagementSectionForKey("users", "ArrowRight"), "responsibles");
  assert.equal(userManagementSectionForKey("users", "End"), "approvals");
  assert.equal(userManagementSectionForKey("approvals", "ArrowRight"), "users");
});

test("user management pagination keeps extensive lists bounded", () => {
  const rows = Array.from({ length: 13 }, (_, index) => index + 1);
  assert.deepEqual(paginateUserManagementRows(rows, 2, 5), {
    items: [6, 7, 8, 9, 10],
    page: 2,
    pages: 3,
    total: 13,
  });
  assert.equal(paginateUserManagementRows(rows, 99, 5).page, 3);
});

test("approvals view follows the FlowOps Next accessible layout contract", async () => {
  const html = await fs.readFile(new URL("../../index.html", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");
  assert.match(html, /id="userManagementTabs"[^>]*role="tablist"/);
  assert.match(html, /role="tab"[^>]*data-user-management-section="users"/);
  assert.match(html, /id="userManagementUsersPanel"[^>]*role="tabpanel"/);
  assert.match(html, /id="userManagementResponsiblesPanel"[^>]*role="tabpanel"/);
  assert.match(html, /id="userManagementApprovalsPanel"[^>]*role="tabpanel"/);
  assert.match(html, /id="userManagementSummary"/);
  assert.match(html, /id="activeUsersPagination"/);
  assert.match(html, /id="userManagementResponsiblesPanel"[^>]*aria-hidden="true"/);
  assert.match(html, /name="email"[^>]*aria-label="E-mail para liberar acesso"/);
  assert.match(css, /\.user-management-state/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)[\s\S]*\.user-management-next/);
});
