import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = new URL("../../index.html", import.meta.url);
const shellCss = new URL("../../css/20-flowops-next-shell.css", import.meta.url);

test("shell keeps stable navigation contracts", async () => {
  const html = await readFile(indexHtml, "utf8");
  for (const view of ["dashboard", "orders", "production", "logistics", "marketplace"]) {
    assert.match(html, new RegExp(`data-view=["']${view}["']`));
  }
  assert.match(html, /id=["']sidebarToggle["']/);
});

test("FlowOps Next shell exposes stable structure and shared tokens", async () => {
  const html = await readFile(indexHtml, "utf8");

  for (const className of [
    "flowops-next-shell",
    "flowops-next-sidebar",
    "flowops-next-nav",
    "flowops-next-workspace",
    "flowops-next-topbar"
  ]) {
    assert.match(html, new RegExp(`class=["'][^"']*\\b${className}\\b`));
  }

  const css = await readFile(shellCss, "utf8");
  for (const token of ["--next-bg", "--next-surface", "--next-line", "--next-text", "--next-muted", "--next-accent"]) {
    assert.match(css, new RegExp(`${token}\\s*:`));
  }
});
