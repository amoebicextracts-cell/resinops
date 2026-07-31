// ============================================================
// ResinOps — Local-date helpers
//
// ResinOps stores dates as bare "YYYY-MM-DD" strings. `new Date("YYYY-MM-DD")`
// parses that as UTC midnight (per the ECMAScript spec), so formatting it
// with toLocaleDateString() in any timezone behind UTC (all of the US)
// displays the day BEFORE the one that was actually stored. Use these
// helpers anywhere a stored date string is parsed for display, or a
// default "today" value is generated for a date input.
// ============================================================

// Parses a date for display. Bare "YYYY-MM-DD" strings are parsed as local
// calendar dates; anything else (full timestamps with time/zone info)
// parses normally, since those aren't ambiguous the way a bare date is.
export function parseDateLocal(dt) {
  if (!dt) return new Date(NaN);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(dt);
}

// Today's date as a local "YYYY-MM-DD" string, for date-input defaults.
// new Date().toISOString() is UTC — near midnight in timezones behind UTC
// it returns tomorrow's date instead of today's.
export function todayLocalISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole calendar days from `today` to `dateStr` (negative if in the past,
// 0 if today, positive if upcoming). Used to flag overdue/due-today
// follow-ups without caring about time-of-day.
export function daysUntil(dateStr, today = todayLocalISO()) {
  const a = parseDateLocal(today);
  const b = parseDateLocal(dateStr);
  return Math.round((b - a) / 86400000);
}
