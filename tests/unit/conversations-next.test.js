import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../../js/core/router.js", import.meta.url), "utf8");
const conversations = await readFile(new URL("../../js/features/conversations.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("index.html ganha a view conversas (menu + shell inbox/thread)", () => {
  assert.match(html, /data-view=["']conversas["']/);
  assert.match(html, /<section id=["']conversasView["'][^>]*class=["'][^"']*flowops-next-commercial/);
  assert.match(html, /id=["']conversasInbox["']/);
  assert.match(html, /id=["']conversasThread["']/);
});

test("router habilita a rota conversas", () => {
  assert.match(router, /from ["']\.\.\/features\/conversations\.js["']/);
  assert.match(router, /renderConversations/);
  assert.match(router, /"conversas"/);
  assert.match(router, /conversas:\s*"Conversas"/);
  assert.match(router, /case "conversas":/);
});

test("conversations.js consome o helper e tem estado vazio (nada fabricado)", () => {
  assert.match(conversations, /from ["']\.\/commercial-presentation\.js["']/);
  assert.match(conversations, /buildConversationsModel/);
  assert.match(conversations, /function renderConversations\(/);
  assert.match(conversations, /empty-state/);
});

test("CSS conversas-next concatenado sob o escopo comercial", () => {
  assert.match(css, /\.flowops-next-commercial \.conversas-next-shell/);
});
