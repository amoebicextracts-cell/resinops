import { useState, useEffect } from "react";
import { db } from "../lib/db";
import { AgendaView, MonthView } from "../SchedulerCalendarViews.jsx";
import { todayLocalISO } from "../lib/dateUtils";

const PX = 12; // px per day
// Left label column width is 220px, set in ResinExApp.jsx's .rx-gantt-left
// CSS rule (can't share a JS constant across files into a template-literal
// stylesheet) -- keep both in sync if this ever changes.
const RH = 44; // row height (single bar per task, no multi-phase sub-bars)
const HH = 40; // header height

const CATEGORIES = [
  { v: "permitting", l: "Permitting" },
  { v: "construction", l: "Construction" },
  { v: "procurement", l: "Procurement" },
  { v: "inspection", l: "Inspection" },
  { v: "other", l: "Other" },
];
const STATUSES = [
  { v: "not_started", l: "Not started" },
  { v: "in_progress", l: "In progress" },
  { v: "complete", l: "Complete" },
  { v: "blocked", l: "Blocked" },
];
const STATUS_COLOR = { not_started: "#6a6a6a", in_progress: "#c8922a", complete: "#4a7c59", blocked: "#a04a4a" };

const EMPTY_TASK = { name: "", category: "other", start_date: todayLocalISO(), duration_days: "7", status: "not_started", depends_on_task_id: "", notes: "" };

function dAdd(dt, n) { const r = new Date(dt); r.setDate(r.getDate() + n); return r; }
function dDiff(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function fmtShort(dt) { return new Date(dt + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

export default function ProjectTimeline({ project }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [viewMode, setViewMode] = useState("gantt");
  const [ganttExpanded, setGanttExpanded] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });

  useEffect(() => {
    db.resinex_expansion_tasks.list().then(all => {
      setTasks(all.filter(t => t.project_id === project.id));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [project.id]);

  function openAdd() { setForm({ ...EMPTY_TASK }); setErr(""); }
  function openEdit(t) { setForm({ ...t }); setErr(""); }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) { setErr("Enter a task name."); return; }
    try {
      const rec = {
        ...form,
        id: form.id || crypto.randomUUID(),
        project_id: project.id,
        duration_days: Math.max(1, Number(form.duration_days) || 1),
        depends_on_task_id: form.depends_on_task_id || null,
      };
      const saved = await db.resinex_expansion_tasks.upsert(rec);
      setTasks(t => form.id ? t.map(x => x.id === saved.id ? saved : x) : [...t, saved]);
      setForm(null); setErr("");
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
  }

  async function remove(id) {
    try {
      await db.resinex_expansion_tasks.delete(id);
      setTasks(t => t.filter(x => x.id !== id));
    } catch (e) { setErr("Could not delete: " + (e.message || e)); }
  }

  const tasksById = new Map(tasks.map(t => [t.id, t]));

  // Gantt layout math -- same PX-pixels-per-day approach as Scheduler.jsx/
  // ProductionScheduler.jsx, simplified to one bar per task row.
  let gStart, total, twPx, todayOff, months, weeks;
  if (tasks.length) {
    gStart = new Date(Math.min(...tasks.map(t => new Date(t.start_date))));
    const gEnd = new Date(Math.max(...tasks.map(t => dAdd(t.start_date, Number(t.duration_days) || 1))));
    total = dDiff(gStart, gEnd) + 7;
    twPx = total * PX;
    todayOff = dDiff(gStart, new Date());

    months = [];
    let mo = "", moX = 0;
    for (let day = 0; day <= total; day++) {
      const ml = dAdd(gStart, day).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (ml !== mo) {
        if (mo) months.push({ label: mo, x: moX, w: day * PX - moX });
        mo = ml; moX = day * PX;
      }
    }
    months.push({ label: mo, x: moX, w: total * PX - moX });

    weeks = [];
    for (let day = 0; day <= total; day += 7) weeks.push({ x: day * PX });
  }

  const actions = tasks.map(t => ({
    id: t.id,
    date: t.start_date,
    label: t.name,
    sublabel: `${CATEGORIES.find(c => c.v === t.category)?.l || t.category} · ${t.duration_days}d`,
    colorBg: STATUS_COLOR[t.status] || STATUS_COLOR.not_started,
    onClick: () => openEdit(t),
  }));

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Loading timeline…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button className={"rx-btn rx-sm " + (viewMode === "gantt" ? "rx-primary" : "rx-secondary")} onClick={() => setViewMode("gantt")}>Gantt</button>
          <button className={"rx-btn rx-sm " + (viewMode === "agenda" ? "rx-primary" : "rx-secondary")} onClick={() => setViewMode("agenda")}>Agenda</button>
          <button className={"rx-btn rx-sm " + (viewMode === "month" ? "rx-primary" : "rx-secondary")} onClick={() => setViewMode("month")}>Month</button>
        </div>
        {!form && <button className="rx-btn rx-primary" onClick={openAdd}>+ Add task</button>}
      </div>

      {form && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ marginBottom: 8 }}><label className="rx-lbl">Task name</label><input className="rx-inp" value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Submit building permit application" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
            <div><label className="rx-lbl">Category</label><select className="rx-sel" value={form.category} onChange={e => setF("category", e.target.value)}>{CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div><label className="rx-lbl">Status</label><select className="rx-sel" value={form.status} onChange={e => setF("status", e.target.value)}>{STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
            <div><label className="rx-lbl">Start date</label><input type="date" className="rx-inp" value={form.start_date} onChange={e => setF("start_date", e.target.value)} /></div>
            <div><label className="rx-lbl">Duration (days)</label><input type="number" min="1" className="rx-inp" value={form.duration_days} onChange={e => setF("duration_days", e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="rx-lbl">Depends on (optional)</label>
            <select className="rx-sel" value={form.depends_on_task_id || ""} onChange={e => setF("depends_on_task_id", e.target.value)}>
              <option value="">— None —</option>
              {tasks.filter(t => t.id !== form.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}><label className="rx-lbl">Notes</label><input className="rx-inp" value={form.notes || ""} onChange={e => setF("notes", e.target.value)} /></div>
          {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="rx-btn rx-primary" onClick={save}>{form.id ? "Save" : "Add"}</button>
            <button className="rx-btn rx-del" onClick={() => remove(form.id)} style={form.id ? {} : { display: "none" }}>Delete</button>
            <button className="rx-btn rx-secondary" onClick={() => { setForm(null); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !form ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13 }}>No expansion tasks yet.</div>
      ) : viewMode === "agenda" ? (
        <AgendaView actions={actions} emptyLabel="No expansion tasks yet." />
      ) : viewMode === "month" ? (
        <MonthView actions={actions} cursor={monthCursor} onCursorChange={setMonthCursor} emptyLabel="No expansion tasks yet." buttonClassName="rx-btn rx-sm rx-secondary" />
      ) : (
        <div className={ganttExpanded ? "rx-gantt-full" : undefined}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="rx-btn rx-sm rx-secondary" onClick={() => setGanttExpanded(x => !x)}>{ganttExpanded ? "✕ Collapse" : "⛶ Expand"}</button>
          </div>
          <div className="rx-gantt-outer">
            <div className="rx-gantt-row" style={{ height: HH, background: "var(--surface-2)", position: "sticky", top: 0, zIndex: 5 }}>
              <div className="rx-gantt-left" style={{ height: HH, justifyContent: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Task</span>
              </div>
              <div className="rx-gantt-tl" style={{ minWidth: twPx, height: HH, overflow: "hidden" }}>
                {months.map((m, i) => (
                  <div key={i} style={{ position: "absolute", left: m.x, top: 0, width: m.w, height: HH, borderRight: "1px solid var(--border)", padding: "0 8px", display: "flex", alignItems: "center", overflow: "hidden" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {tasks.map(t => {
              const x = dDiff(gStart, t.start_date) * PX;
              const w = Math.max(Number(t.duration_days) * PX, 4);
              const dep = t.depends_on_task_id ? tasksById.get(t.depends_on_task_id) : null;
              return (
                <div key={t.id} className="rx-gantt-row" style={{ minHeight: RH }}>
                  <div className="rx-gantt-left" style={{ minHeight: RH, cursor: "pointer" }} onClick={() => openEdit(t)}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{t.name}</div>
                    {dep && <div style={{ fontSize: 10, color: "var(--text-3)" }}>↳ after {dep.name}</div>}
                  </div>
                  <div className="rx-gantt-tl" style={{ minWidth: twPx, minHeight: RH }}>
                    {weeks.map((w2, i) => (
                      <div key={i} style={{ position: "absolute", left: w2.x, top: 0, bottom: 0, width: 1, background: "var(--border)", opacity: 0.4 }} />
                    ))}
                    <div
                      style={{ position: "absolute", left: x, top: 8, width: w, height: RH - 16, background: STATUS_COLOR[t.status] || STATUS_COLOR.not_started, borderRadius: 5, display: "flex", alignItems: "center", padding: "0 8px", overflow: "hidden", cursor: "pointer" }}
                      title={`${t.name} — ${fmtShort(t.start_date)} (${t.duration_days}d)`}
                      onClick={() => openEdit(t)}
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{t.name}</span>
                    </div>
                    {todayOff >= 0 && todayOff <= total && (
                      <div style={{ position: "absolute", left: todayOff * PX, top: 0, bottom: 0, width: 2, background: "var(--danger)", zIndex: 3, opacity: 0.9 }} title="Today" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
            {STATUSES.map(s => (
              <div key={s.v} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLOR[s.v] }} />
                <span style={{ fontSize: 11, color: "var(--text-2)" }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
