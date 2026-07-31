// ============================================================
// ResinOps — Shared Agenda/Month calendar views for scheduler modules
// src/SchedulerCalendarViews.jsx
//
// Purely presentational, shared by Scheduler.jsx (cultivation milestones)
// and ProductionScheduler.jsx (production batch steps). Each caller builds
// its own normalized `actions` array —
// { id, date: 'YYYY-MM-DD', label, sublabel?, colorBg?, colorText?, onClick }
// — from its own domain data; all cultivation/production-specific logic
// stays in the caller, these components only render.
// ============================================================

import { useEffect } from "react";
import { buildMonthGrid, groupActionsByDay } from "./lib/dailyActions";
import { todayLocalISO } from "./lib/dateUtils";

const CAL_CSS = `
  .cal-agenda-day { margin-bottom: 20px; }
  .cal-agenda-date { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .cal-agenda-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; margin-bottom: 3px; }
  .cal-agenda-item:hover { background: var(--surface-2); }
  .cal-agenda-swatch { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .cal-agenda-label { font-size: 12px; font-weight: 600; color: var(--text); }
  .cal-agenda-sublabel { font-size: 11px; color: var(--text-3); margin-left: 6px; }
  .cal-month-nav { display: flex; align-items: center; gap: 10px; justify-content: space-between; margin-bottom: 12px; }
  .cal-month-nav-btns { display: flex; gap: 6px; align-items: center; }
  .cal-month-label { font-size: 14px; font-weight: 700; color: var(--text); }
  .cal-month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .cal-dow { padding: 6px; text-align: center; font-size: 10px; font-weight: 700; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; background: var(--surface-2); }
  .cal-day-cell { background: var(--surface); min-height: 92px; padding: 6px; box-sizing: border-box; }
  .cal-day-cell.out { background: var(--surface-2); opacity: 0.5; }
  .cal-day-num { font-size: 11px; color: var(--text-3); margin-bottom: 4px; }
  .cal-day-num.today { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; }
  .cal-chip { font-size: 10px; padding: 2px 5px; border-radius: 3px; color: #fff; margin-bottom: 2px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cal-empty { border: 1px dashed var(--border-2); border-radius: 10px; padding: 48px 24px; text-align: center; }
`;

function EmptyState({ label }) {
  return (
    <div className="cal-empty">
      <div style={{ fontSize: 32, marginBottom: 10 }}>🗓️</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)" }}>{label}</div>
    </div>
  );
}

export function AgendaView({ actions, emptyLabel, outerClassName }) {
  const grouped = groupActionsByDay(actions);
  const todayISO = todayLocalISO();

  useEffect(() => {
    const el = document.getElementById("agenda-day-" + todayISO);
    if (el) el.scrollIntoView({ block: "start" });
  }, [todayISO]);

  if (grouped.length === 0) {
    return (
      <>
        <style>{CAL_CSS}</style>
        <EmptyState label={emptyLabel} />
      </>
    );
  }

  return (
    <>
      <style>{CAL_CSS}</style>
      <div className={outerClassName} style={{ padding: 16 }}>
        {grouped.map(({ date, items }) => (
          <div key={date} id={"agenda-day-" + date} className="cal-agenda-day">
            <div className="cal-agenda-date">
              {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              {date === todayISO && <span style={{ color: "var(--accent-2)", marginLeft: 8, fontSize: 11 }}>Today</span>}
            </div>
            {items.map(item => (
              <div key={item.id} className="cal-agenda-item" onClick={item.onClick}>
                {item.colorBg && <div className="cal-agenda-swatch" style={{ background: item.colorBg }} />}
                <span className="cal-agenda-label">{item.label}</span>
                {item.sublabel && <span className="cal-agenda-sublabel">{item.sublabel}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function MonthView({ actions, cursor, onCursorChange, emptyLabel, buttonClassName }) {
  const todayISO = todayLocalISO();
  const grouped = groupActionsByDay(actions);
  const { weeks, monthLabel } = buildMonthGrid(cursor.year, cursor.month, grouped, todayISO);

  function shiftMonth(delta) {
    let { year, month } = cursor;
    month += delta;
    if (month < 0) { month = 11; year -= 1; }
    else if (month > 11) { month = 0; year += 1; }
    onCursorChange({ year, month });
  }

  function goToday() {
    const d = new Date();
    onCursorChange({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <>
      <style>{CAL_CSS}</style>
      <div>
        <div className="cal-month-nav">
          <div className="cal-month-label">{monthLabel}</div>
          <div className="cal-month-nav-btns">
            <button className={buttonClassName} onClick={() => shiftMonth(-1)}>◀ Prev</button>
            <button className={buttonClassName} onClick={goToday}>Today</button>
            <button className={buttonClassName} onClick={() => shiftMonth(1)}>Next ▶</button>
          </div>
        </div>
        {actions.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <div className="cal-month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="cal-dow">{d}</div>)}
            {weeks.flat().map((cell, i) => (
              <div key={i} className={"cal-day-cell" + (cell.inMonth ? "" : " out")}>
                {cell.inMonth && (
                  <>
                    <div className={"cal-day-num" + (cell.isToday ? " today" : "")}>{parseInt(cell.date.slice(-2), 10)}</div>
                    {cell.items.map(item => (
                      <div key={item.id} className="cal-chip" style={{ background: item.colorBg || "#333", color: item.colorText || "#fff" }}
                        title={item.sublabel ? item.label + " — " + item.sublabel : item.label} onClick={item.onClick}>
                        {item.label}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
