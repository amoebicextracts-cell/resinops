import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { todayLocalISO, parseDateLocal } from "./lib/dateUtils";

// ── Overall rating: likelihood x impact, same 3-point-scale approach as ──
// ResinOps' own docs/risk-assessment.md, just computed instead of
// eyeballed so every entry in a facility's register rates consistently.
// Low=1, Medium=2, High=3; product buckets to Low/Medium/High rather than
// a 9-point scale, since the inputs are already coarse judgment calls.
const SCORE = { low: 1, medium: 2, high: 3 };
function calcOverall(likelihood, impact) {
  const score = (SCORE[likelihood] || 2) * (SCORE[impact] || 2);
  if (score <= 2) return "low";
  if (score <= 4) return "medium";
  return "high";
}

const CATEGORIES = [
  { v: "data_integrity", l: "Data Integrity" },
  { v: "availability", l: "Availability / Continuity" },
  { v: "security", l: "Security" },
  { v: "process", l: "Process / Regulatory" },
  { v: "other", l: "Other" },
];
const STATUSES = [
  { v: "open", l: "Open" },
  { v: "mitigated", l: "Mitigated" },
  { v: "accepted", l: "Accepted" },
  { v: "closed", l: "Closed" },
];
const LEVELS = [{ v: "low", l: "Low" }, { v: "medium", l: "Medium" }, { v: "high", l: "High" }];

function categoryLabel(v) { return CATEGORIES.find(c => c.v === v)?.l || v; }
function statusLabel(v) { return STATUSES.find(s => s.v === v)?.l || v; }
function fmtD(dt) { return dt ? parseDateLocal(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; }

const CSS = `
  .rr-wrap{padding:24px;flex:1;overflow-y:auto;}
  .rr-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .rr-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .rr-inp:focus{outline:none;border-color:var(--accent);}
  .rr-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .rr-txt{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;resize:vertical;min-height:56px;}
  .rr-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .rr-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .rr-btn:hover{opacity:0.85;}
  .rr-primary{background:var(--accent);color:#fff;}
  .rr-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .rr-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .rr-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .rr-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .rr-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .rr-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .rr-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .rr-tbl tr:last-child td{border-bottom:none;}
  .rr-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .level-low{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .level-medium{background:rgba(200,150,58,0.15);color:var(--amber);}
  .level-high{background:rgba(200,74,74,0.15);color:var(--danger);}
  .status-open{background:rgba(200,74,74,0.15);color:var(--danger);}
  .status-mitigated{background:rgba(90,120,200,0.15);color:#7090f0;}
  .status-accepted{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-closed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .rr-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .rr-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;}
`;

function emptyForm() {
  return {
    title: "", category: "other", description: "",
    likelihood: "medium", impact: "medium",
    mitigation: "", residualNotes: "",
    status: "open", owner: "",
    identifiedDate: todayLocalISO(), nextReviewDate: "",
    notes: "",
  };
}

export default function RiskRegister() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        setRecords(await db.risk_register.list());
      } catch (e) { console.error("Risk register load error:", e); }
      setLoading(false);
    }
    load();
  }, []);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openAdd() { setForm(emptyForm()); setErr(""); }
  function openEdit(r) { setForm({ ...r }); setErr(""); }
  function closeForm() { setForm(null); setErr(""); }

  function validate() {
    if (!form.title.trim()) { setErr("Enter a short title for this risk."); return false; }
    return true;
  }

  async function save() {
    if (!validate()) return;
    const overall = calcOverall(form.likelihood, form.impact);
    const rec = { ...form, overall, id: form.id || crypto.randomUUID(), nextReviewDate: form.nextReviewDate || null };
    try {
      const saved = form.id ? await db.risk_register.update(form.id, rec) : await db.risk_register.upsert(rec);
      if (form.id) setRecords(p => p.map(x => x.id === saved.id ? saved : x));
      else setRecords(p => [...p, saved]);
      closeForm();
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
  }

  async function remove(id) {
    try {
      await db.risk_register.delete(id);
      setRecords(p => p.filter(x => x.id !== id));
    } catch (e) { setErr("Could not delete: " + (e.message || e)); }
  }

  const liveOverall = form ? calcOverall(form.likelihood, form.impact) : null;
  const today = todayLocalISO();
  const openCount = records.filter(r => r.status === "open").length;
  const overdueCount = records.filter(r => r.nextReviewDate && r.nextReviewDate < today && r.status !== "closed").length;
  const visible = records.filter(r => statusFilter === "all" || r.status === statusFilter);

  if (loading) return (<div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading risk register…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="rr-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Risk Register</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>This facility's own living risk log — likelihood, impact, mitigation, and residual risk for anything worth tracking</div>
          </div>
          {!form && <button className="rr-btn rr-primary" onClick={openAdd}>+ Log risk</button>}
        </div>

        {overdueCount > 0 && (
          <div style={{ background: "rgba(200,74,74,0.08)", border: "1px solid rgba(200,74,74,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--danger)", fontWeight: 500 }}>
            ⚠ {overdueCount} risk{overdueCount > 1 ? "s" : ""} past its scheduled review date
          </div>
        )}

        {form && (
          <div className="rr-card">
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>{form.id ? "Edit Risk" : "New Risk"}</div>

            <div className="rr-box">
              <div className="rr-box-t">Risk</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><label className="rr-lbl">Title</label><input className="rr-inp" value={form.title} onChange={e => setF("title", e.target.value)} placeholder="e.g. Manual COGS entry has no second-entry check" /></div>
                <div><label className="rr-lbl">Category</label>
                  <select className="rr-sel" value={form.category} onChange={e => setF("category", e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                </div>
              </div>
              <label className="rr-lbl">Description</label>
              <textarea className="rr-txt" value={form.description} onChange={e => setF("description", e.target.value)} placeholder="What could go wrong, and how would it actually happen here?" />
            </div>

            <div className="rr-box">
              <div className="rr-box-t">Rating</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><label className="rr-lbl">Likelihood</label>
                  <select className="rr-sel" value={form.likelihood} onChange={e => setF("likelihood", e.target.value)}>
                    {LEVELS.map(l => <option key={l.v} value={l.v}>{l.l}</option>)}
                  </select>
                </div>
                <div><label className="rr-lbl">Impact</label>
                  <select className="rr-sel" value={form.impact} onChange={e => setF("impact", e.target.value)}>
                    {LEVELS.map(l => <option key={l.v} value={l.v}>{l.l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="rr-lbl">Overall (computed)</label>
                  <div style={{ padding: "7px 0" }}><span className={"rr-pill level-" + liveOverall}>{LEVELS.find(l => l.v === liveOverall)?.l}</span></div>
                </div>
              </div>
            </div>

            <div className="rr-box">
              <div className="rr-box-t">Mitigation</div>
              <div style={{ marginBottom: 10 }}><label className="rr-lbl">Existing mitigation</label><textarea className="rr-txt" value={form.mitigation} onChange={e => setF("mitigation", e.target.value)} placeholder="What's already in place today?" /></div>
              <div><label className="rr-lbl">Residual risk notes</label><textarea className="rr-txt" value={form.residualNotes} onChange={e => setF("residualNotes", e.target.value)} placeholder="What's left over after the mitigation?" /></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, margin: "14px 0" }}>
              <div><label className="rr-lbl">Status</label>
                <select className="rr-sel" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div><label className="rr-lbl">Owner</label><input className="rr-inp" value={form.owner} onChange={e => setF("owner", e.target.value)} placeholder="Who's responsible" /></div>
              <div><label className="rr-lbl">Identified</label><input type="date" className="rr-inp" value={form.identifiedDate} onChange={e => setF("identifiedDate", e.target.value)} /></div>
              <div><label className="rr-lbl">Next review due</label><input type="date" className="rr-inp" value={form.nextReviewDate} onChange={e => setF("nextReviewDate", e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label className="rr-lbl">Notes</label><input className="rr-inp" value={form.notes} onChange={e => setF("notes", e.target.value)} /></div>

            {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rr-btn rr-primary" onClick={save}>{form.id ? "Save changes" : "Save risk"}</button>
              <button className="rr-btn rr-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {!form && records.length === 0 && (
          <div style={{ border: "1px dashed var(--border-2)", borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>No risks logged yet</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>Log anything worth tracking — a process gap, a single-point-of-failure, an unverified control — and revisit it on a schedule</div>
          </div>
        )}

        {!form && records.length > 0 && (
          <div className="rr-card">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Total risks</div><div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-2)" }}>{records.length}</div></div>
              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Open</div><div style={{ fontSize: 18, fontWeight: 700, color: openCount ? "var(--danger)" : "var(--accent-2)" }}>{openCount}</div></div>
              <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase" }}>Review overdue</div><div style={{ fontSize: 18, fontWeight: 700, color: overdueCount ? "var(--danger)" : "var(--accent-2)" }}>{overdueCount}</div></div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <select className="rr-sel" style={{ width: 200 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              <table className="rr-tbl">
                <thead><tr><th>Title</th><th>Category</th><th>Likelihood</th><th>Impact</th><th>Overall</th><th>Status</th><th>Owner</th><th>Next Review</th><th></th></tr></thead>
                <tbody>
                  {[...visible].sort((a, b) => {
                    const rank = { high: 0, medium: 1, low: 2 };
                    return (rank[a.overall] ?? 1) - (rank[b.overall] ?? 1);
                  }).map(r => {
                    const overdue = r.nextReviewDate && r.nextReviewDate < today && r.status !== "closed";
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500, color: "var(--text)" }}>{r.title}</td>
                        <td style={{ fontSize: 11 }}>{categoryLabel(r.category)}</td>
                        <td><span className={"rr-pill level-" + r.likelihood}>{r.likelihood}</span></td>
                        <td><span className={"rr-pill level-" + r.impact}>{r.impact}</span></td>
                        <td><span className={"rr-pill level-" + r.overall}>{r.overall}</span></td>
                        <td><span className={"rr-pill status-" + r.status}>{statusLabel(r.status)}</span></td>
                        <td style={{ fontSize: 11 }}>{r.owner || "—"}</td>
                        <td style={{ fontSize: 11 }}>
                          {fmtD(r.nextReviewDate)}
                          {overdue && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 2 }}>⚠ Review overdue</div>}
                        </td>
                        <td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button className="rr-sm rr-edit" onClick={() => openEdit(r)}>Edit</button>
                          <button className="rr-sm rr-del" onClick={() => remove(r.id)}>✕</button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
