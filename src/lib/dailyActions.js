// ============================================================
// ResinOps — Day-bucketed schedule actions
// src/lib/dailyActions.js
//
// Shared by Scheduler.jsx's Agenda/Month views (cultivation milestones) and
// ProductionScheduler.jsx's Agenda/Month views (production batch steps).
// Pure, no React/DOM — each scheduler builds its own flat array of
// normalized actions ({id, date, label, sublabel?, colorBg?, colorText?,
// onClick}) from its own domain data, then hands it to these shared
// grouping/grid functions and to SchedulerCalendarViews.jsx's components.
// ============================================================

// Safe here specifically because every caller's dates are constructed from
// a "T12:00:00"-anchored base (both Scheduler.jsx's getSched() and
// ProductionScheduler.jsx's buildTimeline() do this) -- local noon is far
// enough from a UTC midnight boundary that toISOString() never rolls the
// calendar day over in any real-world timezone.
export function toISODate(date) {
  return date.toISOString().split('T')[0];
}

export function groupActionsByDay(actions) {
  const byDate = new Map();
  for (const action of actions) {
    if (!action.date) continue;
    if (!byDate.has(action.date)) byDate.set(action.date, []);
    byDate.get(action.date).push(action);
  }
  return [...byDate.keys()].sort().map(date => ({ date, items: byDate.get(date) }));
}

export function buildMonthGrid(year, month, groupedByDate, todayISO) {
  const lookup = new Map(groupedByDate.map(g => [g.date, g.items]));
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, inMonth: false, isToday: false, items: [] });
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toISODate(new Date(year, month, day, 12));
    cells.push({ date, inMonth: true, isToday: date === todayISO, items: lookup.get(date) || [] });
  }
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push({ date: null, inMonth: false, isToday: false, items: [] });

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { weeks, monthLabel };
}
