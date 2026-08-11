// ============================================================
// ResinOps — Compliance Data Moat: source freshness review (platform-admin only)
// src/ComplianceSources.jsx
//
// The AI Assistant cites real excerpts from this table (compliance_sources)
// for state cannabis regulatory questions -- citation-only, never
// independent interpretation. Regulations change; nothing previously
// tracked when an excerpt might be stale. This page surfaces every
// excerpt sorted oldest-verified-first, flags anything past the review
// threshold, and lets a platform admin bump last_verified_at once
// they've re-checked the source text is still accurate -- it does not
// re-fetch or re-verify content itself, that's still a manual step.
// ============================================================

import { useState, useEffect } from "react";
import { db } from "./lib/db";

const STALE_DAYS = 180; // ~6 months -- regulatory text doesn't usually need tighter review than this

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const CATEGORY_LABELS = {
  testing: "Testing",
  packaging_labeling: "Packaging & Labeling",
  licensing: "Licensing",
  cultivation: "Cultivation",
  processing: "Processing",
  security: "Security",
  transport: "Transport",
  general: "General",
};

export default function ComplianceSources() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");

  async function load() {
    setLoading(true);
    setLoadErr("");
    try {
      const all = await db.compliance_sources.list();
      setSources(all);
    } catch (e) {
      setLoadErr("Could not load: " + (e.message || e));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markVerified(row) {
    setBusyId(row.id);
    setActionErr("");
    try {
      const saved = await db.compliance_sources.upsert({ ...row, last_verified_at: new Date().toISOString() });
      setSources(prev => prev.map(s => s.id === row.id ? saved : s));
    } catch (e) {
      setActionErr("Could not update: " + (e.message || e));
    }
    setBusyId(null);
  }

  const sorted = [...sources].sort((a, b) => new Date(a.last_verified_at) - new Date(b.last_verified_at));
  const staleCount = sorted.filter(s => daysSince(s.last_verified_at) > STALE_DAYS).length;

  const byState = {};
  sorted.forEach(s => { (byState[s.state] ||= []).push(s); });
  const states = Object.keys(byState).sort();

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
      <h2 style={{ marginBottom: 4 }}>Compliance Sources — Freshness Review</h2>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
        Regulatory excerpts the AI Assistant cites for state compliance questions. Review the source text against the official rule periodically and mark it verified — this list doesn't re-fetch anything automatically.
      </p>

      {loading ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : loadErr ? (
        <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{loadErr}</div>
      ) : (
        <>
          <div style={{
            background: staleCount > 0 ? "var(--surface-2)" : "var(--surface)",
            border: `1px solid ${staleCount > 0 ? "var(--danger)" : "var(--border-2)"}`,
            borderRadius: 8, padding: 12, marginBottom: 18, fontSize: 13,
          }}>
            {staleCount > 0
              ? <>⚠ <strong>{staleCount}</strong> of {sorted.length} sources haven't been re-verified in over {STALE_DAYS} days.</>
              : <>✓ All {sorted.length} sources verified within the last {STALE_DAYS} days.</>}
          </div>

          {actionErr && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>{actionErr}</div>}

          {states.map(state => (
            <div key={state} style={{ marginBottom: 22 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{state}</div>
              {byState[state].map(row => {
                const stale = daysSince(row.last_verified_at) > STALE_DAYS;
                return (
                  <div key={row.id} style={{
                    background: "var(--surface)", border: `1px solid ${stale ? "var(--danger)" : "var(--border-2)"}`,
                    borderRadius: 8, padding: 12, marginBottom: 8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}>
                          {CATEGORY_LABELS[row.category] || row.category}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{row.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                          <a href={row.source_url} target="_blank" rel="noreferrer" style={{ color: "var(--text-3)" }}>{row.source_name}</a>
                          {row.effective_date && <> &middot; effective {row.effective_date}</>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: stale ? "var(--danger)" : "var(--text-3)", marginBottom: 6 }}>
                          {stale ? "⚠ " : ""}verified {daysSince(row.last_verified_at)}d ago
                        </div>
                        <button className="clear-btn" disabled={busyId === row.id} onClick={() => markVerified(row)}>
                          {busyId === row.id ? "Saving…" : "Mark verified today"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
