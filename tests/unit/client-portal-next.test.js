import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../../js/core/router.js", import.meta.url), "utf8");
const portal = await readFile(new URL("../../js/features/client-portal.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

test("index.html ganha a view portal (menu + seletor + preview)", () => {
  assert.match(html, /data-view=["']portal["']/);
  assert.match(html, /<section id=["']portalView["'][^>]*class=["'][^"']*flowops-next-commercial/);
  assert.match(html, /id=["']portalOrderSelect["']/);
  assert.match(html, /id=["']portalPreview["']/);
});

test("router habilita a rota portal", () => {
  assert.match(router, /from ["']\.\.\/features\/client-portal\.js["']/);
  assert.match(router, /renderClientPortal/);
  assert.match(router, /"portal"/);
  assert.match(router, /portal:\s*"Portal do cliente"/);
  assert.match(router, /case "portal":/);
});

test("client-portal.js usa buildPortalPreview e o contrato público de tracking", () => {
  assert.match(portal, /from ["']\.\/commercial-presentation\.js["']/);
  assert.match(portal, /buildPortalPreview/);
  assert.match(portal, /function renderClientPortal\(/);
  // reusa o link público existente, sem inventar contrato novo
  assert.match(portal, /data-action=["']copy-public-tracking["']/);
  assert.match(portal, /Percentual pago/);
  assert.doesNotMatch(portal, />Progresso</);
  assert.match(portal, /money\.format\(/);
});

test("CSS portal-next concatenado sob o escopo comercial", () => {
  assert.match(css, /\.flowops-next-commercial \.portal-next-card/);
});
