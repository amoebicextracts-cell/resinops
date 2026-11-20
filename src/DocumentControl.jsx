// ============================================================
// Document Control — GMP Hub "Documents" tab
// Versioned library of batch record templates, issued batch records,
// R&D records and forms. Every version carries a required changelog,
// its SHA-256 and who uploaded it; older versions stay downloadable.
// Uploads/downloads go through api/controlled-documents.js.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./lib/db";
import { authenticatedApiFetch, formatApiError } from "./lib/api";
import { supabase, isSupabaseEnabled, getCurrentFacility, getCurrentFacilityRole } from "./lib/supabase";
import { canEditFacilityData } from "./lib/roles";
import {
  DOC_CATEGORIES, CATEGORY_LABEL, PRODUCT_TYPES,
  groupDocuments, visibleVersions, nextVersionLabel, fmtBytes,
} from "./lib/documentControl";

const MAX_MB = 25;
const STATUS_PILL = { current: "sop-active", superseded: "sop-retired" };
const fmtDate = s => (s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

async function postApi(body, fallback) {
  const res = await authenticatedApiFetch("/api/controlled-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatApiError(res, data, fallback));
  return data.data;
}

// create-upload-url -> direct upload to Storage -> confirm (hash + promote)
async function uploadVersion({ documentId, newDocument, versionLabel, changelog, effectiveDate, file }) {
  const facilityId = getCurrentFacility();
  const start = await postApi({
    action: "create-upload-url", facilityId,
    ...(documentId ? { documentId } : { newDocument }),
    versionLabel, changelog, effectiveDate: effectiveDate || undefined,
    fileName: file.name, mimeType: file.type || undefined, fileSize: file.size,
  }, "Could not start the upload");
  const { error } = await supabase.storage.from("controlled-documents").uploadToSignedUrl(start.path, start.token, file);
  if (error) throw new Error("Upload failed: " + error.message);
  const version = await postApi({ action: "confirm", facilityId, versionId: start.versionId }, "Could not confirm the upload");
  return { documentId: start.documentId, version };
}

const EMPTY_NEW = { title: "", docKey: "", category: "batch_record", productType: "", rdDosed: "", versionLabel: "1.0", changelog: "Initial version.", effectiveDate: "" };

export default function DocumentControl() {
  const [documents, setDocuments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [newForm, setNewForm] = useState(null);
  const [versionForm, setVersionForm] = useState(null);
  const newFileRef = useRef(null);
  const versionFileRef = useRef(null);
  const canEdit = canEditFacilityData(getCurrentFacilityRole());

  async function reload() {
    const [docs, vers] = await Promise.all([db.controlled_documents.list(), db.controlled_document_versions.list()]);
    setDocuments(docs); setVersions(vers);
  }

  useEffect(() => {
    if (!isSupabaseEnabled) { setLoading(false); return; }
    let active = true;
    reload().catch(e => active && setErr(e.message || "Could not load documents.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => groupDocuments(documents, versions, { search, category, showRetired }), [documents, versions, search, category, showRetired]);
  const selected = documents.find(d => d.id === selectedId) || null;
  const selectedVersions = selected ? visibleVersions(versions, selected.id) : [];

  async function download(v) {
    setErr("");
    try {
      const { url } = await postApi({ action: "get-url", facilityId: getCurrentFacility(), versionId: v.id }, "Could not open the file");
      window.open(url, "_blank", "noopener");
    } catch (e) { setErr(e.message); }
  }

  async function submitNew() {
    const file = newFileRef.current?.files?.[0];
    if (!newForm.title.trim() || !newForm.docKey.trim()) return setErr("Enter a title and a document key (batch # or template code).");
    if (!newForm.changelog.trim()) return setErr("Describe this version in the changelog.");
    if (!file) return setErr("Choose the file to upload.");
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`File is over ${MAX_MB} MB.`);
    setBusy(true); setErr("");
    try {
      const { documentId } = await uploadVersion({
        newDocument: {
          docKey: newForm.docKey.trim(), title: newForm.title.trim(), category: newForm.category,
          productType: newForm.productType || null,
          rdDosed: newForm.category === "rd_record" && newForm.rdDosed !== "" ? newForm.rdDosed === "yes" : null,
        },
        versionLabel: newForm.versionLabel, changelog: newForm.changelog, effectiveDate: newForm.effectiveDate, file,
      });
      await reload();
      setSelectedId(documentId); setNewForm(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function submitVersion() {
    const file = versionFileRef.current?.files?.[0];
    if (!versionForm.changelog.trim()) return setErr("A new version needs a changelog: what changed and why.");
    if (!file) return setErr("Choose the file to upload.");
    if (file.size > MAX_MB * 1024 * 1024) return setErr(`File is over ${MAX_MB} MB.`);
    setBusy(true); setErr("");
    try {
      await uploadVersion({ documentId: selected.id, versionLabel: versionForm.versionLabel, changelog: versionForm.changelog, effectiveDate: versionForm.effectiveDate, file });
      await reload(); setVersionForm(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function setRetired(doc, retired) {
    setErr("");
    try {
      const saved = await db.controlled_documents.update(doc.id, { status: retired ? "retired" : "active" });
      setDocuments(ds => ds.map(d => (d.id === saved.id ? saved : d)));
    } catch (e) { setErr(e.message || "Could not update the document."); }
  }

  if (!isSupabaseEnabled) {
    return <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>Document Control stores files in your ResinOps cloud account. Sign in to a facility to use it.</div>;
  }
  if (loading) return <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>Loading documents…</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input className="gh-inp" style={{ maxWidth: 260 }} placeholder="Search title, batch #, product…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="gh-sel" style={{ maxWidth: 220 }} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {DOC_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
        <label style={{ fontSize: 12, color: "var(--text-3)", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Show retired
        </label>
        <div style={{ flex: 1 }} />
        {canEdit && !newForm && <button className="gh-btn gh-primary" onClick={() => { setNewForm({ ...EMPTY_NEW }); setErr(""); }}>+ New document</button>}
      </div>
      {err && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}

      {newForm && (
        <div className="gh-card" style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>New controlled document</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <div><label className="gh-lbl">Title</label><input className="gh-inp" value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Tropicana Cookies 1 g Pre-Roll" /></div>
            <div><label className="gh-lbl">Document key (batch # or template code)</label><input className="gh-inp" value={newForm.docKey} onChange={e => setNewForm(f => ({ ...f, docKey: e.target.value }))} placeholder="GCCNY-TCOOK-1GRPR-111826-B01" /></div>
            <div><label className="gh-lbl">Category</label><select className="gh-sel" value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}>{DOC_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div><label className="gh-lbl">Product type</label><select className="gh-sel" value={newForm.productType} onChange={e => setNewForm(f => ({ ...f, productType: e.target.value }))}><option value="">—</option>{PRODUCT_TYPES.map(p => <option key={p}>{p}</option>)}</select></div>
            {newForm.category === "rd_record" && (
              <div><label className="gh-lbl">Dosed with cannabis input?</label><select className="gh-sel" value={newForm.rdDosed} onChange={e => setNewForm(f => ({ ...f, rdDosed: e.target.value }))}><option value="">Not recorded</option><option value="no">No: undosed R&D</option><option value="yes">Yes: dosed R&D</option></select></div>
            )}
            <div><label className="gh-lbl">Version</label><input className="gh-inp" value={newForm.versionLabel} onChange={e => setNewForm(f => ({ ...f, versionLabel: e.target.value }))} /></div>
            <div><label className="gh-lbl">Effective date</label><input type="date" className="gh-inp" value={newForm.effectiveDate} onChange={e => setNewForm(f => ({ ...f, effectiveDate: e.target.value }))} /></div>
          </div>
          <div style={{ marginTop: 10 }}><label className="gh-lbl">Changelog</label><textarea className="gh-inp" rows={3} value={newForm.changelog} onChange={e => setNewForm(f => ({ ...f, changelog: e.target.value }))} /></div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input ref={newFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.md,.txt" disabled={busy} />
            <button className="gh-btn gh-primary" disabled={busy} onClick={submitNew}>{busy ? "Uploading…" : "Upload"}</button>
            <button className="gh-btn" disabled={busy} onClick={() => setNewForm(null)}>Cancel</button>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>PDF, PNG, JPEG, CSV, Markdown or text · max {MAX_MB} MB</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(320px,1.4fr)", gap: 14, alignItems: "start" }}>
        <div>
          {groups.length === 0 && <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>No documents yet. Upload a batch record or template to start its version history.</div>}
          {groups.map(g => (
            <div key={g.category} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-3)", fontWeight: 600, margin: "4px 0 6px" }}>{g.label} · {g.docs.length}</div>
              {g.docs.map(d => (
                <button key={d.id} onClick={() => { setSelectedId(d.id); setVersionForm(null); setErr(""); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, borderRadius: 6, cursor: "pointer",
                    border: "1px solid " + (d.id === selectedId ? "var(--accent-2)" : "var(--border-2)"), background: d.id === selectedId ? "var(--surface-2)" : "transparent", color: "var(--text)" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.title}{d.status === "retired" && <span style={{ fontSize: 10, color: "var(--text-3)" }}> · retired</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {d.doc_key} · v{d.current?.version_label || "—"} · {d.versions.length} version{d.versions.length === 1 ? "" : "s"}
                    {d.category === "rd_record" && d.rd_dosed !== null && d.rd_dosed !== undefined && (d.rd_dosed ? " · dosed" : " · undosed")}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div>
          {!selected && <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>Pick a document to see its version history.</div>}
          {selected && (
            <div style={{ border: "1px solid var(--border-2)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {selected.doc_key} · {CATEGORY_LABEL[selected.category]}{selected.product_type ? " · " + selected.product_type : ""}
                    {selected.category === "rd_record" && selected.rd_dosed !== null && selected.rd_dosed !== undefined && (selected.rd_dosed ? " · dosed R&D" : " · undosed R&D: no cannabis input, not for testing or sale")}
                  </div>
                  {selected.notes && <div style={{ fontSize: 12, marginTop: 4 }}>{selected.notes}</div>}
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6, alignItems: "start" }}>
                    {!versionForm && selected.status !== "retired" && (
                      <button className="gh-btn gh-primary" onClick={() => setVersionForm({ versionLabel: nextVersionLabel(selectedVersions.map(v => v.version_label)), changelog: "", effectiveDate: "" })}>+ New version</button>
                    )}
                    <button className="gh-sm" onClick={() => setRetired(selected, selected.status !== "retired")}>{selected.status === "retired" ? "Reactivate" : "Retire"}</button>
                  </div>
                )}
              </div>

              {versionForm && (
                <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: 10, margin: "10px 0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 160px", gap: 10 }}>
                    <div><label className="gh-lbl">Version</label><input className="gh-inp" value={versionForm.versionLabel} onChange={e => setVersionForm(f => ({ ...f, versionLabel: e.target.value }))} /></div>
                    <div><label className="gh-lbl">Effective date</label><input type="date" className="gh-inp" value={versionForm.effectiveDate} onChange={e => setVersionForm(f => ({ ...f, effectiveDate: e.target.value }))} /></div>
                  </div>
                  <div style={{ marginTop: 8 }}><label className="gh-lbl">Changelog (required): what changed and why</label><textarea className="gh-inp" rows={4} value={versionForm.changelog} onChange={e => setVersionForm(f => ({ ...f, changelog: e.target.value }))} placeholder="e.g. Added Step B vibratory sifter section; new stem % line in yield." /></div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input ref={versionFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,.md,.txt" disabled={busy} />
                    <button className="gh-btn gh-primary" disabled={busy} onClick={submitVersion}>{busy ? "Uploading…" : "Upload version"}</button>
                    <button className="gh-btn" disabled={busy} onClick={() => setVersionForm(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-3)", fontWeight: 600, margin: "12px 0 6px" }}>Version history</div>
              {selectedVersions.length === 0 && <div style={{ fontSize: 12, color: "var(--text-3)" }}>No confirmed versions yet.</div>}
              {selectedVersions.map(v => (
                <div key={v.id} style={{ borderLeft: "3px solid " + (v.status === "current" ? "var(--accent-2)" : "var(--border-2)"), padding: "6px 10px", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>v{v.version_label}</b>
                    <span className={"gh-pill " + (STATUS_PILL[v.status] || "")}>{v.status}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                      {v.effective_date ? "effective " + fmtDate(v.effective_date) + " · " : ""}uploaded {fmtDate(v.created_at)} · {fmtBytes(v.file_size)}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button className="gh-sm" onClick={() => download(v)}>Download</button>
                  </div>
                  <div style={{ fontSize: 12, whiteSpace: "pre-wrap", marginTop: 4 }}>{v.changelog}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, fontFamily: "monospace" }} title="SHA-256 of the stored file">{v.file_name} · sha256 {v.sha256 ? v.sha256.slice(0, 16) + "…" : "—"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
