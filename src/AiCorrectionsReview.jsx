// ============================================================
// ResinOps — AI Corrections Review (platform-admin only)
// src/AiCorrectionsReview.jsx
//
// Lists corrections flagged by clients across every facility. Approving
// a correction (with tags) makes it eligible for retrieval by
// api/_corrections.js on every future matching chat, for every client —
// this is the one page that actually curates the shared knowledge base,
// so tags are required before Approve is enabled.
// ============================================================

import { useState, useEffect } from "react";
import { db } from "./lib/db";

const MODULE_LABELS = {
  "ai-assistant": "AI Assistant",
  "ops-analyst": "AI Operations Analyst",
  cultivation: "Cultivation",
  "post-harvest": "Post-Harvest",
  extraction: "Extraction",
  facility: "Facility",
  all: "All modules",
};

function CorrectionCard({ c, facilityName, onDecide }) {
  const [tags, setTags] = useState((c.tags || []).join(", "));
  const [busy, setBusy] = useState(false);
  const parsedTags = tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);

  async function decide(status) {
    setBusy(true);
    try {
      await db.ai_corrections.upsert({ ...c, status, tags: parsedTags });
      onDecide(c.id);
    } catch (e) {
      alert("Couldn't update: " + (e.message || e));
    }
    setBusy(false);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>
        <span>{MODULE_LABELS[c.module] || c.module} &middot; {facilityName || "Unknown facility"}</span>
        <span>{new Date(c.created_at).toLocaleDateString()}</span>
      </div>
      {c.questionContext && (
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>
          <strong>Question context:</strong> {c.questionContext}
        </div>
      )}
      <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 10, whiteSpace: "pre-wrap" }}>
        {c.correctionText}
      </div>
      <input
        value={tags}
        onChange={e => setTags(e.target.value)}
        placeholder="Tags required before approving (comma-separated)"
        style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 5, color: "var(--text)", fontSize: 12, padding: 6, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="clear-btn" disabled={busy || parsedTags.length === 0} onClick={() => decide("approved")}>
          Approve
        </button>
        <button className="clear-btn" disabled={busy} onClick={() => decide("rejected")}>
          Reject
        </button>
      </div>
    </div>
  );
}

export default function AiCorrectionsReview() {
  const [corrections, setCorrections] = useState([]);
  const [facilityNames, setFacilityNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [all, facilities] = await Promise.all([
        db.ai_corrections.list(),
        db.facilities.list().catch(() => []),
      ]);
      setCorrections(all);
      const names = {};
      facilities.forEach(f => { names[f.id] = f.facility_name || f.id; });
      setFacilityNames(names);
    } catch (e) {
      console.error("Load corrections failed:", e);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function removeById(id) {
    setCorrections(prev => prev.filter(c => c.id !== id));
  }

  const pending = corrections.filter(c => c.status === "pending").sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const decided = corrections.filter(c => c.status !== "pending").sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
      <h2 style={{ marginBottom: 4 }}>AI Corrections Review</h2>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20 }}>
        Approved corrections become visible to every facility's AI chat — review tags carefully before approving.
      </p>

      {loading ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : pending.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>No pending corrections.</div>
      ) : (
        pending.map(c => (
          <CorrectionCard key={c.id} c={c} facilityName={facilityNames[c.submittedByFacilityId]} onDecide={removeById} />
        ))
      )}

      {decided.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button className="clear-btn" onClick={() => setShowHistory(s => !s)} style={{ fontSize: 12, marginBottom: 10 }}>
            {showHistory ? "Hide" : "Show"} decided corrections ({decided.length})
          </button>
          {showHistory && decided.map(c => (
            <div key={c.id} style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, padding: 12, marginBottom: 8, opacity: 0.75 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
                <span>{MODULE_LABELS[c.module] || c.module} &middot; {facilityNames[c.submittedByFacilityId] || "Unknown facility"} &middot; {c.status}</span>
                <span>{(c.tags || []).join(", ")}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>{c.correctionText}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
