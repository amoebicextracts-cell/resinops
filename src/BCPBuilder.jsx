import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { todayLocalISO, parseDateLocal } from "./lib/dateUtils";

const CATEGORIES = [
  { v: "utility", l: "Utility / Power" },
  { v: "equipment", l: "Equipment Failure" },
  { v: "security", l: "Security" },
  { v: "personnel", l: "Key Personnel" },
  { v: "regulatory", l: "Regulatory / License" },
  { v: "supply_chain", l: "Supply Chain" },
  { v: "natural_disaster", l: "Natural Disaster" },
  { v: "other", l: "Other" },
];
const STATUSES = [
  { v: "draft", l: "Draft" },
  { v: "active", l: "Active" },
  { v: "needs_review", l: "Needs Review" },
];

function categoryLabel(v) { return CATEGORIES.find(c => c.v === v)?.l || v; }
function statusLabel(v) { return STATUSES.find(s => s.v === v)?.l || v; }
function fmtD(dt) { return dt ? parseDateLocal(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"; }

const CSS = `
  .bcp-wrap{padding:24px;flex:1;overflow-y:auto;}
  .bcp-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .bcp-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .bcp-inp:focus{outline:none;border-color:var(--accent);}
  .bcp-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .bcp-txt{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;resize:vertical;min-height:56px;}
  .bcp-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .bcp-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .bcp-btn:hover{opacity:0.85;}
  .bcp-primary{background:var(--accent);color:#fff;}
  .bcp-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .bcp-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .bcp-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .bcp-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .bcp-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .bcp-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .bcp-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .bcp-tbl tr:last-child td{border-bottom:none;}
  .bcp-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .status-draft{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .status-needs_review{background:rgba(200,74,74,0.15);color:var(--danger);}
  .bcp-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .bcp-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;}
`;

function emptyForm() {
  return {
    title: "", category: "other",
    impactDescription: "", responsePlan: "", recoveryTimeTarget: "",
    status: "draft", owner: "",
    lastReviewedDate: "", nextReviewDate: "",
    notes: "",
  };
}

export default function BCPBuilder() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setRecords(await db.bcp_scenarios.list());
      } catch (e) { console.error("BCP builder load error:", e); }
      setLoading(false);
    }
    load();
  }, []);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openAdd() { setForm(emptyForm()); setErr(""); }
  // Optional fields come back from the DB as null once saved blank, but
  // these are controlled inputs/textareas -- binding value={null} trips
  // React's controlled/uncontrolled warning and can desync the field from
  // state on a later update, so blank optional fields are re-guarded to ""
  // here the same way the rest of the form already treats them.
  function openEdit(r) {
    setForm({
      ...r,
      impactDescription: r.impactDescription || "",
      responsePlan: r.responsePlan || "",
      recoveryTimeTarget: r.recoveryTimeTarget || "",
      owner: r.owner || "",
      lastReviewedDate: r.lastReviewedDate || "",
      nextReviewDate: r.nextReviewDate || "",
      notes: r.notes || "",
    });
    setErr("");
  }
  function closeForm() { setForm(null); setErr(""); }

  function validate() {
    if (!form.title.trim()) { setErr("Enter a short title for this scenario."); return false; }
    return true;
  }

  async function save() {
    if (!validate() || saving) return;
    setSaving(true);
    const rec = { ...form, id: form.id || crypto.randomUUID(), lastReviewedDate: form.lastReviewedDate || null, nextReviewDate: form.nextReviewDate || null };
    try {
      const saved = form.id ? await db.bcp_scenarios.update(form.id, rec) : await db.bcp_scenarios.upsert(rec);
      if (form.id) setRecords(p => p.map(x => x.id === saved.id ? saved : x));
      else setRecords(p => [...p, saved]);
      closeForm();
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
    finally { setSaving(false); }
  }

  async function remove(id) {
    try {
      await db.bcp_scenarios.delete(id);
      setRecords(p => p.filter(x => x.id !== id));
    } catch (e) { setErr("Could not delete: " + (e.message || e)); }
  }

  const today = todayLocalISO();
  const isOverdue = r => !!(r.nextReviewDate && r.nextReviewDate < today);
  const needsReviewCount = records.filter(r => r.status === "needs_review").length;
  const overdueCount = records.filter(isOverdue).length;
  const visible = records.filter(r => statusFilter === "all" || r.status === statusFilter);
  // Urgency-first ordering, matching RiskRegister's severity sort: an
  // overdue scenario (regardless of status) surfaces before one merely
  // flagged needs_review, which surfaces before active, then draft.
  const urgencyRank = r => isOverdue(r) ? 0 : r.status === "needs_review" ? 1 : r.status === "active" ? 2 : 3;
  const sortedVisible = [...visible].sort((a, b) => urgencyRank(a) - urgencyRank(b));

  if (loading) return (<div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>Loading business continuity plan…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="bcp-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Business Continuity Plan</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>This facility's own continuity plan — what could take you down, and how you'd respond to each</div>
          </div>
          {!form && <button className="bcp-btn bcp-primary" onClick={openAdd}>+ Add scenario</button>}
        </div>

        {(needsReviewCount > 0 || overdueCount > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: needsReviewCount > 0 && overdueCount > 0 ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 16 }}>
            {needsReviewCount > 0 && (
              <div style={{ background: "rgba(200,74,74,0.08)", border: "1px solid rgba(200,74,74,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--danger)", fontWeight: 500 }}>
                ⚠ {needsReviewCount} scenario{needsReviewCount > 1 ? "s" : ""} flagged as needing review
              </div>
            )}
            {overdueCount > 0 && (
              <div style={{ background: "rgba(200,150,58,0.08)", border: "1px solid rgba(200,150,58,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--amber)", fontWeight: 500 }}>
                ⏳ {overdueCount} scenario{overdueCount > 1 ? "s" : ""} past its scheduled review date
              </div>
            )}
          </div>
        )}

        {form && (
          <div className="bcp-card">
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>{form.id ? "Edit Scenario" : "New Continuity Scenario"}</div>

            <div className="bcp-box">
              <div className="bcp-box-t">Scenario</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
                <div><label className="bcp-lbl">Title</label><input className="bcp-inp" value={form.title} onChange={e => setF("title", e.target.value)} placeholder="e.g. Extraction room power loss during a run" /></div>
                <div><label className="bcp-lbl">Category</label>
                  <select className="bcp-sel" value={form.category} onChange={e => setF("category", e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                </div>
              </div>
              <label className="bcp-lbl">Impact if this happens</label>
              <textarea className="bcp-txt" value={form.impactDescription} onChange={e => setF("impactDescription", e.target.value)} placeholder="What actually breaks, and how badly?" />
            </div>

            <div className="bcp-box">
              <div className="bcp-box-t">Response</div>
              <div style={{ marginBottom: 10 }}><label className="bcp-lbl">Response plan</label><textarea className="bcp-txt" value={form.responsePlan} onChange={e => setF("responsePlan", e.target.value)} placeholder="What do you actually do, step by step, and who does it?" /></div>
              <div><label className="bcp-lbl">Recovery time target</label><input className="bcp-inp" value={form.recoveryTimeTarget} onChange={e => setF("recoveryTimeTarget", e.target.value)} placeholder="e.g. 4 hours, same day, next business day" /></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, margin: "14px 0" }}>
              <div><label className="bcp-lbl">Status</label>
                <select className="bcp-sel" value={form.status} onChange={e => setF("status", e.target.value)}>
                  {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div><label className="bcp-lbl">Owner</label><input className="bcp-inp" value={form.owner} onChange={e => setF("owner", e.target.value)} placeholder="Who's responsible" /></div>
              <div><label className="bcp-lbl">Last reviewed</label><input type="date" className="bcp-inp" value={form.lastReviewedDate} onChange={e => setF("lastReviewedDate", e.target.value)} /></div>
              <div><label className="bcp-lbl">Next review due</label><input type="date" className="bcp-inp" value={form.nextReviewDate} onChange={e => setF("nextReviewDate", e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label className="bcp-lbl">Notes</label><input className="bcp-inp" value={form.notes} onChange={e => setF("notes", e.target.value)} /></div>

            {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="bcp-btn bcp-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : (form.id ? "Save changes" : "Save scenario")}</button>
              <button className="bcp-btn bcp-secondary" disabled={saving} onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {!form && records.length === 0 && (
          <div style={{ border: "1px dashed var(--border-2)", borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🧯</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>No continuity scenarios documented yet</div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>Document what could take your operation down — a power loss, a key employee out, a failed piece of equipment — and how you'd respond</div>
          </div>
        )}

        {!form && records.length > 0 && (
          <div className="bcp-card">
            <div style={{ marginBottom: 12 }}>
              <select className="bcp-sel" style={{ width: 200 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              <table className="bcp-tbl">
                <thead><tr><th>Title</th><th>Category</th><th>Recovery Target</th><th>Status</th><th>Owner</th><th>Next Review</th><th></th></tr></thead>
                <tbody>
                  {sortedVisible.map(r => {
                    const overdue = isOverdue(r);
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500, color: "var(--text)" }}>{r.title}</td>
                        <td style={{ fontSize: 11 }}>{categoryLabel(r.category)}</td>
                        <td style={{ fontSize: 11 }}>{r.recoveryTimeTarget || "—"}</td>
                        <td><span className={"bcp-pill status-" + r.status}>{statusLabel(r.status)}</span></td>
                        <td style={{ fontSize: 11 }}>{r.owner || "—"}</td>
                        <td style={{ fontSize: 11 }}>
                          {fmtD(r.nextReviewDate)}
                          {overdue && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 2 }}>⚠ Review overdue</div>}
                        </td>
                        <td><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button className="bcp-sm bcp-edit" onClick={() => openEdit(r)}>Edit</button>
                          <button className="bcp-sm bcp-del" onClick={() => remove(r.id)}>✕</button>
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
