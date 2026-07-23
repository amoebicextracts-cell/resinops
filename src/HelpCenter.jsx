// ============================================================
// ResinOps — Help Center (read-only "how to use ResinOps" reference)
// src/HelpCenter.jsx
//
// Shows only the preloaded, ResinOps-authored how-to entries
// (gmp_sops rows with source='resinops-default') seeded into every
// facility by the seed_default_sops trigger. Deliberately read-only —
// editing/adding real facility SOPs still happens in Compliance >
// GMP Hub > SOP Library, which also shows these same rows alongside
// the facility's own procedures.
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { db } from "./lib/db";

export default function HelpCenter() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    db.gmp_sops.list()
      .then(rows => setEntries((rows || []).filter(r => r.source === "resinops-default")))
      .catch(e => console.error("Load help entries failed:", e))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q ? entries : entries.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.category || "").toLowerCase().includes(q) ||
      (e.content || "").toLowerCase().includes(q)
    );
    const byCategory = {};
    for (const e of filtered) {
      const cat = e.category || "General";
      (byCategory[cat] = byCategory[cat] || []).push(e);
    }
    return Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b));
  }, [entries, query]);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px" }}>
      <h2 style={{ marginBottom: 4 }}>Help</h2>
      <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20 }}>
        How to use each ResinOps module, in plain language — a reference to come back to after training. For your facility's own operating procedures, see Compliance &rarr; SOP Library.
      </p>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search help topics…"
        style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 6, color: "var(--text)", fontSize: 13, padding: "8px 10px", marginBottom: 20 }}
      />

      {loading ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>No help topics available yet.</div>
      ) : grouped.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>No topics match "{query}".</div>
      ) : (
        grouped.map(([category, items]) => (
          <div key={category} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{category}</div>
            {items.map(e => {
              const open = openId === e.id;
              return (
                <div key={e.id} style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
                  <button
                    onClick={() => setOpenId(open ? null : e.id)}
                    style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text)", fontSize: 14, fontWeight: 500 }}
                  >
                    {e.title}
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
                  </button>
                  {open && (
                    <div style={{ padding: "0 14px 14px", fontSize: 13, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
                      {e.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
