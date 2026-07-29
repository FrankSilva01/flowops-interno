// FlowOps Next — modelo de apresentação da Agenda (puro, sem mutar estado).
// Consome eventos de calendar_events. `now` é obrigatório e validado.

const SUMMARY_TYPES = ["sales", "delivery", "logistics", "cash", "feriado", "custom"];

function toValidDate(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError("now precisa ser uma data válida");
  }
  return d;
}

function isoDay(value) {
  return String(value == null ? "" : value).slice(0, 10);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function buildCalendarModel(events = [], options = {}) {
  const now = toValidDate(options.now);
  const year = Number(options.year);
  const month = Number(options.month); // 1-12
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  // Grade do mês (domingo a sábado), células fora do mês = null.
  const startDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    const dayEvents = events.filter((e) => isoDay(e.date) === iso).map((e) => ({ ...e }));
    cells.push({ day, inMonth: true, iso, events: dayEvents });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // Próximos eventos: data >= hoje, ordenados.
  const floor = startOfDay(now);
  const upcoming = events
    .filter((e) => {
      const d = new Date(`${isoDay(e.date)}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= floor;
    })
    .slice()
    .sort((a, b) => (isoDay(a.date) < isoDay(b.date) ? -1 : 1))
    .map((e) => ({ ...e }));

  // Resumo por tipo, apenas eventos do mês visualizado.
  const summary = Object.fromEntries(SUMMARY_TYPES.map((t) => [t, 0]));
  for (const e of events) {
    if (isoDay(e.date).startsWith(monthPrefix) && e.type in summary) {
      summary[e.type] += 1;
    }
  }

  return { weeks, upcoming, summary };
}
