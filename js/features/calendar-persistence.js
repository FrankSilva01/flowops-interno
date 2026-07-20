import { state } from "../core/state.js";
import { RECURRING_SUFFIX, buildCalendarEventRows, calendarRowsToBuckets, shouldRunLegacyMigration } from "./calendar-event-core.js";

const LEGACY_STORAGE_KEY = "calendarCustomEvents";

function storageKey() {
  return state.organizationId ? `${LEGACY_STORAGE_KEY}:${state.organizationId}` : LEGACY_STORAGE_KEY;
}

function migrationFlagKey() {
  return state.organizationId ? `calendarMigrationDone:${state.organizationId}` : "calendarMigrationDone";
}

// Le apenas a chave GLOBAL pre-multi-tenant (fonte legitima de migracao unica).
// NAO usa o espelho scoped, que applyBuckets reescreve a cada load - usa-lo aqui
// faz um evento excluido "ressuscitar" (remoto vazio + espelho cheio -> reinsercao).
function readUnscopedLegacy() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return {};
  }
}

export function saveCalendarEventsCache(events = window.calendarEvents || {}) {
  if (!state.organizationId) return;
  localStorage.setItem(storageKey(), JSON.stringify(events));
}

function readLegacyEvents() {
  try {
    const stored = localStorage.getItem(storageKey()) || localStorage.getItem(LEGACY_STORAGE_KEY) || "{}";
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return {};
  }
}

function legacyRows(events) {
  const rows = [];
  const recurringStarts = new Map();
  Object.entries(events).sort(([left], [right]) => left.localeCompare(right)).forEach(([date, values]) => {
    (Array.isArray(values) ? values : []).forEach((value) => {
      const text = String(value);
      const recurring = text.includes(RECURRING_SUFFIX);
      const title = text.replace(RECURRING_SUFFIX, "");
      if (recurring) {
        if (!recurringStarts.has(title)) recurringStarts.set(title, date);
        return;
      }
      rows.push(...buildCalendarEventRows({ date, title, organizationId: state.organizationId, createdBy: state.activeUserEmail }));
    });
  });
  recurringStarts.forEach((date, title) => rows.push(...buildCalendarEventRows({
    date,
    title,
    recurring: true,
    organizationId: state.organizationId,
    createdBy: state.activeUserEmail,
  })));
  return rows;
}

function applyBuckets(rows) {
  const buckets = calendarRowsToBuckets(rows);
  window.calendarEvents = buckets.events;
  window.calendarEventRecords = buckets.records;
  saveCalendarEventsCache(buckets.events);
}

export async function loadCalendarEvents() {
  const legacy = readLegacyEvents();
  if (!state.online || !state.supabase || !state.organizationId) {
    applyBuckets(Object.entries(legacy).flatMap(([date, values]) => (Array.isArray(values) ? values : []).map((value) => ({
      due_date: date,
      title: String(value).replace(RECURRING_SUFFIX, ""),
      source: String(value).includes(RECURRING_SUFFIX) ? "recurring" : "manual",
      recurrence_rule: String(value).includes(RECURRING_SUFFIX) ? { frequency: "monthly" } : null,
    }))));
    return;
  }

  const { data, error } = await state.supabase
    .from("calendar_events")
    .select("id,title,due_date,source,recurrence_rule,created_by,created_at,updated_at")
    .eq("organization_id", state.organizationId)
    .eq("kind", "reminder")
    .in("source", ["manual", "recurring"])
    .order("due_date");
  if (error) throw error;

  let rows = data || [];
  // Migracao unica: so a partir da chave global antiga e so se ainda nao migramos.
  // Assim, remoto vazio (ex.: usuario excluiu o ultimo evento) nunca reinsere nada.
  const migrationDone = localStorage.getItem(migrationFlagKey()) === "1";
  const legacyUnscoped = readUnscopedLegacy();
  if (shouldRunLegacyMigration({ remoteCount: rows.length, migrationDone, legacyUnscopedKeys: Object.keys(legacyUnscoped).length })) {
    const migrationRows = legacyRows(legacyUnscoped);
    const result = await state.supabase.from("calendar_events").insert(migrationRows).select("id,title,due_date,source,recurrence_rule,created_by,created_at,updated_at");
    if (result.error) throw result.error;
    rows = result.data || [];
  }
  localStorage.setItem(migrationFlagKey(), "1");
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  applyBuckets(rows);
}

export function calendarRecord(date, index) {
  return window.calendarEventRecords?.[date]?.[index] || null;
}

export async function createCalendarEvent({ date, title, recurring }) {
  const rows = buildCalendarEventRows({
    date,
    title,
    recurring,
    organizationId: state.organizationId,
    createdBy: state.activeUserEmail,
  });
  if (!state.online || !state.supabase) return false;
  const { error } = await state.supabase.from("calendar_events").insert(rows);
  if (error) throw error;
  await loadCalendarEvents();
  return true;
}

export async function replaceCalendarEvent(record, { date, title, recurring }) {
  if (!record?.id || !state.online || !state.supabase) return false;
  const seriesId = record.recurrence_rule?.series_id;
  let ids = [record.id];
  if (seriesId) {
    ids = Object.values(window.calendarEventRecords || {}).flat().filter((item) => item.recurrence_rule?.series_id === seriesId).map((item) => item.id);
  }
  const replacement = await state.supabase.from("calendar_events").insert(buildCalendarEventRows({
    date,
    title,
    recurring,
    organizationId: state.organizationId,
    createdBy: state.activeUserEmail,
  })).select("id");
  if (replacement.error) throw replacement.error;
  const { error: deleteError } = await state.supabase.from("calendar_events").delete().in("id", ids).eq("organization_id", state.organizationId);
  if (deleteError) {
    const replacementIds = (replacement.data || []).map((item) => item.id);
    if (replacementIds.length) {
      await state.supabase.from("calendar_events").delete().in("id", replacementIds).eq("organization_id", state.organizationId);
    }
    throw deleteError;
  }
  await loadCalendarEvents();
  return true;
}

export async function removeCalendarEvent(record) {
  if (!record?.id || !state.online || !state.supabase) return false;
  const { error } = await state.supabase.from("calendar_events").delete().eq("id", record.id).eq("organization_id", state.organizationId);
  if (error) throw error;
  await loadCalendarEvents();
  return true;
}

export { RECURRING_SUFFIX } from "./calendar-event-core.js";
