import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarEventRows, calendarRowsToBuckets, shouldRunLegacyMigration } from "../../js/features/calendar-event-core.js";

test("builds a tenant-scoped monthly calendar series", () => {
  const rows = buildCalendarEventRows({
    date: "2026-01-31",
    title: "Fechamento mensal",
    recurring: true,
    organizationId: "00000000-0000-0000-0000-000000000001",
    createdBy: "owner@example.com",
    seriesId: "series-1",
  });
  assert.equal(rows.length, 12);
  assert.equal(rows[0].organization_id, "00000000-0000-0000-0000-000000000001");
  assert.equal(rows[1].due_date, "2026-02-28");
  assert.equal(rows[2].due_date, "2026-03-31");
  assert.equal(rows[0].recurrence_rule.series_id, "series-1");
});

test("maps Supabase calendar rows to the existing calendar view", () => {
  const buckets = calendarRowsToBuckets([
    { id: "one", due_date: "2026-07-16", title: "Evento simples", source: "manual" },
    { id: "two", due_date: "2026-07-16", title: "Evento mensal", source: "recurring", recurrence_rule: { frequency: "monthly" } },
  ]);
  assert.deepEqual(buckets.events["2026-07-16"], ["Evento simples", "Evento mensal |RECURRING_MONTHLY"]);
  assert.deepEqual(buckets.records["2026-07-16"].map((row) => row.id), ["one", "two"]);
});

test("migra uma unica vez a partir da chave global antiga", () => {
  assert.equal(shouldRunLegacyMigration({ remoteCount: 0, migrationDone: false, legacyUnscopedKeys: 1 }), true);
});

test("nao ressuscita evento: remoto vazio apos migracao concluida nao remigra", () => {
  // Cenario do bug: usuario excluiu o ultimo evento (remoto vazio), mas o
  // espelho scoped ainda tem dados. Como ja migramos (flag), NAO reinsere.
  assert.equal(shouldRunLegacyMigration({ remoteCount: 0, migrationDone: true, legacyUnscopedKeys: 1 }), false);
});

test("espelho scoped sozinho (sem chave global) nunca dispara migracao", () => {
  assert.equal(shouldRunLegacyMigration({ remoteCount: 0, migrationDone: false, legacyUnscopedKeys: 0 }), false);
});

test("remoto com eventos nunca dispara migracao", () => {
  assert.equal(shouldRunLegacyMigration({ remoteCount: 3, migrationDone: false, legacyUnscopedKeys: 5 }), false);
});
