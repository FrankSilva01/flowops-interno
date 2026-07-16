export const RECURRING_SUFFIX = " |RECURRING_MONTHLY";

function clampMonthlyDate(dateString, offset) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const resolvedDay = Math.min(day, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(resolvedDay).padStart(2, "0")}`;
}

export function buildCalendarEventRows({ date, title, recurring = false, organizationId, createdBy, seriesId }) {
  const id = seriesId || (recurring ? crypto.randomUUID() : null);
  const occurrences = recurring ? 12 : 1;
  return Array.from({ length: occurrences }, (_, index) => ({
    organization_id: organizationId,
    kind: "reminder",
    title,
    due_date: clampMonthlyDate(date, index),
    status: "pending",
    source: recurring ? "recurring" : "manual",
    recurrence_rule: recurring ? { frequency: "monthly", series_id: id } : null,
    raw_payload: { flowops_calendar: true },
    created_by: createdBy || null,
    updated_at: new Date().toISOString(),
  }));
}

export function calendarRowsToBuckets(rows = []) {
  const events = {};
  const records = {};
  rows.forEach((row) => {
    const date = String(row.due_date || "").slice(0, 10);
    if (!date || !row.title) return;
    if (!events[date]) events[date] = [];
    if (!records[date]) records[date] = [];
    const recurring = row.source === "recurring" || row.recurrence_rule?.frequency === "monthly";
    events[date].push(`${row.title}${recurring ? RECURRING_SUFFIX : ""}`);
    records[date].push(row);
  });
  return { events, records };
}
