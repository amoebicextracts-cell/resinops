import { useState, useEffect } from "react";
import { db } from "../lib/db";

const CATEGORIES = [
  { v: "equipment", l: "Equipment" },
  { v: "labor", l: "Labor" },
  { v: "permit", l: "Permit" },
  { v: "construction", l: "Construction" },
  { v: "other", l: "Other" },
];
const STATUSES = [
  { v: "estimated", l: "Estimated" },
  { v: "quoted", l: "Quoted" },
  { v: "confirmed", l: "Confirmed" },
  { v: "paid", l: "Paid" },
];
const EMPTY_ACTUAL = { description: "", category: "other", estimated_amount: "", actual_amount: "", status: "estimated", linked_document_id: "", notes: "" };

export default function ProjectActuals({ project }) {
  const [actuals, setActuals] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    // Guard against a stale response landing after the user has already
    // switched to a different project (same fix as ProjectTimeline.jsx,
    // flagged by Greptile review there and applied here too).
    let active = true;
    setLoading(true);
    Promise.all([
      db.resinex_project_actuals.list(),
      db.resinex_project_documents.list(),
    ]).then(([a, d]) => {
      if (!active) return;
      setActuals(a.filter(x => x.project_id === project.id));
      setDocuments(d.filter(x => x.project_id === project.id && x.status === "confirmed"));
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.id]);

  function openAdd() { setForm({ ...EMPTY_ACTUAL }); setErr(""); }
  function openEdit(a) { setForm({ ...a }); setErr(""); }
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.description.trim()) { setErr("Enter a description."); return; }
    try {
      const rec = {
        ...form,
        id: form.id || crypto.randomUUID(),
        project_id: project.id,
        estimated_amount: form.estimated_amount === "" ? null : Number(form.estimated_amount),
        actual_amount: form.actual_amount === "" ? null : Number(form.actual_amount),
        linked_document_id: form.linked_document_id || null,
      };
      const saved = await db.resinex_project_actuals.upsert(rec);
      setActuals(a => form.id ? a.map(x => x.id === saved.id ? saved : x) : [saved, ...a]);
      setForm(null); setErr("");
    } catch (e) { setErr("Could not save: " + (e.message || e)); }
  }

  async function remove(id) {
    try {
      await db.resinex_project_actuals.delete(id);
      setActuals(a => a.filter(x => x.id !== id));
    } catch (e) { setErr("Could not delete: " + (e.message || e)); }
  }

  const totalEstimated = actuals.reduce((sum, a) => sum + (Number(a.estimated_amount) || 0), 0);
  const totalActual = actuals.reduce((sum, a) => sum + (Number(a.actual_amount) || 0), 0);

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Loading actuals…</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <span className="rx-pill">Estimated: ${totalEstimated.toLocaleString()}</span>
        <span className="rx-pill">Actual: ${totalActual.toLocaleString()}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        {!form && <button className="rx-btn rx-primary" onClick={openAdd}>+ Add line item</button>}
      </div>

      {form && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ marginBottom: 8 }}><label className="rx-lbl">Description</label><input className="rx-inp" value={form.description} onChange={e => setF("description", e.target.value)} placeholder="HVAC contractor bid" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
            <div><label className="rx-lbl">Category</label><select className="rx-sel" value={form.category} onChange={e => setF("category", e.target.value)}>{CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div><label className="rx-lbl">Status</label><select className="rx-sel" value={form.status} onChange={e => setF("status", e.target.value)}>{STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
            <div><label className="rx-lbl">Estimated ($)</label><input type="number" step="0.01" className="rx-inp" value={form.estimated_amount} onChange={e => setF("estimated_amount", e.target.value)} /></div>
            <div><label className="rx-lbl">Actual ($)</label><input type="number" step="0.01" className="rx-inp" value={form.actual_amount} onChange={e => setF("actual_amount", e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 8 }}><label className="rx-lbl">Linked document (optional)</label><select className="rx-sel" value={form.linked_document_id || ""} onChange={e => setF("linked_document_id", e.target.value)}><option value="">— None —</option>{documents.map(d => <option key={d.id} value={d.id}>{d.file_name}</option>)}</select></div>
          <div style={{ marginBottom: 10 }}><label className="rx-lbl">Notes</label><input className="rx-inp" value={form.notes || ""} onChange={e => setF("notes", e.target.value)} /></div>
          {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="rx-btn rx-primary" onClick={save}>{form.id ? "Save" : "Add"}</button>
            <button className="rx-btn rx-secondary" onClick={() => { setForm(null); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {actuals.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13 }}>No actuals logged yet.</div>
      ) : (
        <table className="rx-tbl">
          <thead><tr><th>Description</th><th>Category</th><th>Status</th><th>Estimated</th><th>Actual</th><th>Document</th><th></th></tr></thead>
          <tbody>
            {actuals.map(a => {
              const doc = documents.find(d => d.id === a.linked_document_id);
              return (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500, color: "var(--text)" }}>{a.description}</td>
                  <td style={{ fontSize: 11 }}>{a.category}</td>
                  <td><span className="rx-pill">{a.status}</span></td>
                  <td style={{ fontSize: 11 }}>{a.estimated_amount != null ? `$${Number(a.estimated_amount).toLocaleString()}` : "—"}</td>
                  <td style={{ fontSize: 11 }}>{a.actual_amount != null ? `$${Number(a.actual_amount).toLocaleString()}` : "—"}</td>
                  <td style={{ fontSize: 11 }}>{doc ? doc.file_name : "—"}</td>
                  <td><div style={{ display: "flex", gap: 5 }}>
                    <button className="rx-sm rx-edit" onClick={() => openEdit(a)}>Edit</button>
                    <button className="rx-sm rx-del" onClick={() => remove(a.id)}>✕</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
