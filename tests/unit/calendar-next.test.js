import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../css/flowops.css", import.meta.url), "utf8");

// Recorta só a section da Agenda para checar a ausência de estilos inline hardcoded.
const calendarSection = html.slice(
  html.indexOf('id="calendarView"'),
  html.indexOf('id="subscriptionView"'),
);

test("Agenda adota o shell FlowOps Next (tokens, sem cores inline hardcoded)", () => {
  assert.match(html, /<section id=["']calendarView["'][^>]*class=["'][^"']*flowops-next-calendar/);
  assert.match(calendarSection, /class=["']calendar-next-layout["']/);
  assert.match(calendarSection, /class=["']calendar-next-side["']/);
  // reskin: sem os backgrounds/hex cravados no HTML da Agenda
  assert.doesNotMatch(calendarSection, /background:\s*#0f1419/);
  assert.doesNotMatch(calendarSection, /grid-template-columns:\s*1fr 350px/);
});

test("Agenda preserva os IDs que o calendar-navigation.js alimenta", () => {
  for (const id of ["calendarWidget", "upcomingEvents", "monthSummarySales", "monthSummaryDeliveries", "monthSummaryLogistics", "monthSummaryCash", "monthTotal"]) {
    assert.match(calendarSection, new RegExp(`id=["']${id}["']`));
  }
});

test("CSS 24 da Agenda concatenado com escopo próprio", () => {
  assert.match(css, /===== SOURCE: 24-flowops-next-calendar\.css =====/);
  assert.match(css, /\.flowops-next-calendar \.calendar-next-panel/);
});
