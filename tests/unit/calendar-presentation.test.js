import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarModel } from "../../js/features/calendar-presentation.js";

const EVENTS = [
  { id: "e1", date: "2026-07-08", type: "sales", title: "Follow-up Orion" },
  { id: "e2", date: "2026-07-16", type: "delivery", title: "Entrega PED-0256" },
  { id: "e3", date: "2026-07-25", type: "logistics", title: "Coleta Jadlog" },
  { id: "e4", date: "2026-08-02", type: "cash", title: "Recebimento" },
];

test("buildCalendarModel monta semanas do mês e exige now válido", () => {
  const model = buildCalendarModel(EVENTS, { year: 2026, month: 7, now: new Date("2026-07-28T00:00:00Z") });
  assert.equal(Array.isArray(model.weeks), true);
  assert.equal(model.weeks.flat().filter((d) => d && d.inMonth).length, 31); // julho tem 31 dias
  const dia8 = model.weeks.flat().find((d) => d && d.day === 8 && d.inMonth);
  assert.equal(dia8.events.length, 1);
  assert.throws(() => buildCalendarModel(EVENTS, { year: 2026, month: 7, now: "x" }), TypeError);
});

test("buildCalendarModel: upcoming a partir de now e summary por tipo do mês", () => {
  const model = buildCalendarModel(EVENTS, { year: 2026, month: 7, now: new Date("2026-07-20T00:00:00Z") });
  // eventos do mês corrente com data >= now
  assert.equal(model.upcoming.some((e) => e.id === "e3"), true); // 25/07
  assert.equal(model.upcoming.some((e) => e.id === "e1"), false); // 08/07 já passou
  assert.equal(model.summary.sales, 1);
  assert.equal(model.summary.delivery, 1);
  assert.equal(model.summary.logistics, 1);
});

test("buildCalendarModel não muta a entrada e é seguro vazio", () => {
  const snapshot = structuredClone(EVENTS);
  buildCalendarModel(EVENTS, { year: 2026, month: 7, now: new Date("2026-07-20") });
  assert.deepEqual(EVENTS, snapshot);
  const vazio = buildCalendarModel([], { year: 2026, month: 7, now: new Date("2026-07-20") });
  assert.equal(vazio.upcoming.length, 0);
  assert.equal(vazio.summary.sales, 0);
});
