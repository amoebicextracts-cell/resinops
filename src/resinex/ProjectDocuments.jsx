import { useState, useEffect, useRef } from "react";
import { db } from "../lib/db";
import { authenticatedApiFetch, formatApiError } from "../lib/api";
import { supabase, getCurrentFacility } from "../lib/supabase";

const MAX_FILE_MB = 25;
const CATEGORIES = [
  { v: "quote", l: "Quote" },
  { v: "blueprint", l: "Blueprint" },
  { v: "schematic", l: "Schematic" },
  { v: "invoice", l: "Invoice" },
  { v: "other", l: "Other" },
];

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectDocuments({ project }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("quote");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Guard against a stale response landing after the user has already
    // switched to a different project (same fix as ProjectTimeline.jsx,
    // flagged by Greptile review there and applied here too).
    let active = true;
    setLoading(true);
    db.resinex_project_documents.list().then(all => {
      if (!active) return;
      // "pending" rows are uploads still in flight (or abandoned before
      // confirmation) -- not real documents yet, so keep them out of the list.
      setDocuments(all.filter(d => d.project_id === project.id && d.status === "confirmed"));
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.id]);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setErr(`"${file.name}" is too large — max ${MAX_FILE_MB}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true); setErr("");
    try {
      const facilityId = getCurrentFacility();
      // Writes a "pending" document row before the upload even starts, so
      // an upload that never gets confirmed (tab closed, connectivity
      // lost) leaves a discoverable pending row instead of a completely
      // untracked Storage object.
      const res = await authenticatedApiFetch("/api/resinex-create-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facilityId, projectId: project.id, fileName: file.name, mimeType: file.type, category, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(res, data, "Could not start upload"));

      const { path, token, documentId } = data.data;
      const { error: uploadError } = await supabase.storage.from("resinex-documents").uploadToSignedUrl(path, token, file);
      if (uploadError) throw new Error("Upload failed: " + uploadError.message);

      const confirmRes = await authenticatedApiFetch("/api/resinex-confirm-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facilityId, documentId, fileSize: file.size }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(formatApiError(confirmRes, confirmData, "Could not confirm the document"));

      setDocuments(d => [confirmData.data, ...d]);
      setNotes("");
    } catch (e) {
      setErr(e.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function viewDocument(doc) {
    setErr("");
    try {
      const facilityId = getCurrentFacility();
      const res = await authenticatedApiFetch("/api/resinex-get-document-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, facilityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(res, data, "Could not open document"));
      window.open(data.data.url, "_blank", "noopener");
    } catch (e) {
      setErr(e.message || "Could not open document.");
    }
  }

  async function deleteDocument(doc) {
    setErr("");
    try {
      const facilityId = getCurrentFacility();
      // Removes the Storage object AND the metadata row in one request --
      // no window where one succeeds and the other doesn't.
      const res = await authenticatedApiFetch("/api/resinex-delete-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, facilityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(res, data, "Could not delete document"));
      setDocuments(d => d.filter(x => x.id !== doc.id));
    } catch (e) {
      setErr(e.message || "Could not delete document.");
    }
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Loading documents…</div>;

  return (
    <div>
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label className="rx-lbl">Category</label><select className="rx-sel" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
          <div><label className="rx-lbl">Notes (optional)</label><input className="rx-inp" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <input ref={fileInputRef} type="file" onChange={handleFileChosen} disabled={uploading} />
        {uploading && <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 10 }}>Uploading…</span>}
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>Max {MAX_FILE_MB}MB per file.</div>
        {err && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{err}</div>}
      </div>

      {documents.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13 }}>No documents uploaded yet.</div>
      ) : (
        <table className="rx-tbl">
          <thead><tr><th>File</th><th>Category</th><th>Size</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {documents.map(doc => (
              <tr key={doc.id}>
                <td style={{ fontWeight: 500, color: "var(--text)" }}>{doc.file_name}{doc.notes ? <div style={{ fontSize: 10, color: "var(--text-3)" }}>{doc.notes}</div> : null}</td>
                <td><span className="rx-pill">{doc.category}</span></td>
                <td style={{ fontSize: 11 }}>{fmtSize(doc.file_size)}</td>
                <td style={{ fontSize: 11 }}>{new Date(doc.created_at).toLocaleDateString()}</td>
                <td><div style={{ display: "flex", gap: 5 }}>
                  <button className="rx-sm rx-edit" onClick={() => viewDocument(doc)}>View</button>
                  <button className="rx-sm rx-del" onClick={() => deleteDocument(doc)}>✕</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
