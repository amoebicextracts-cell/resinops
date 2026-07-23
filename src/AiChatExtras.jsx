// ============================================================
// ResinOps — Shared AI chat history + correction-flagging UI
// src/AiChatExtras.jsx
//
// Used by both App.jsx's AI Assistant chat and OpsAnalyst.jsx so the
// two don't duplicate this markup. Conversations/messages are already
// persisted server-side (api/import.js / api/chat.js via
// api/_corrections.js); these components just read them back and let a
// user flag a bad answer.
// ============================================================

import { useState } from "react";
import { db } from "./lib/db";
import { getCurrentFacility } from "./lib/supabase";

export function ChatHistoryPanel({ module, onLoad }) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!open) {
      setLoading(true);
      try {
        const all = await db.ai_conversations.list();
        setConversations(
          all.filter(c => c.module === module)
            .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
            .slice(0, 20)
        );
      } catch (e) { console.error("Load conversation history failed:", e); }
      setLoading(false);
    }
    setOpen(o => !o);
  }

  async function pick(conv) {
    try {
      const msgs = await db.ai_messages.list();
      const forConv = msgs
        .filter(m => m.conversationId === conv.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      onLoad(conv.id, forConv.map(m => ({ role: m.role, content: m.content })));
      setOpen(false);
    } catch (e) { console.error("Load conversation failed:", e); }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button className="clear-btn" onClick={toggle}>🕘 History</button>
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, width: 280, maxHeight: 300, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 50, padding: 6 }}>
          {loading ? (
            <div style={{ padding: 10, fontSize: 12, color: "var(--text-3)" }}>Loading…</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: "var(--text-3)" }}>No past conversations yet.</div>
          ) : conversations.map(c => (
            <button key={c.id} onClick={() => pick(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--text)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || "Untitled conversation"}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{new Date(c.updated_at || c.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlagCorrectionButton({ module, questionContext, sourceMessageId }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState("");

  async function submit() {
    if (!text.trim()) return;
    try {
      await db.ai_corrections.upsert({
        id: crypto.randomUUID(),
        module,
        questionContext: questionContext || "",
        correctionText: text.trim(),
        sourceMessageId: sourceMessageId || null,
        submittedByFacilityId: getCurrentFacility() || null,
        tags: tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean),
      });
      setStatus("Submitted — thanks. A ResinOps admin reviews corrections before they go live for other clients.");
      setText(""); setTags("");
      setTimeout(() => { setOpen(false); setStatus(""); }, 3000);
    } catch (e) {
      setStatus("Couldn't submit: " + (e.message || e));
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ fontSize: 10, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", textDecoration: "underline" }}>🚩 Suggest a correction</button>;
  }
  return (
    <div style={{ marginTop: 6, padding: 8, background: "var(--surface-2)", borderRadius: 6, fontSize: 12, maxWidth: 420 }}>
      <div style={{ marginBottom: 4, color: "var(--text-2)" }}>What's the correct answer?</div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 5, color: "var(--text)", fontSize: 12, padding: 6, marginBottom: 6 }} />
      <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Optional tags, comma-separated (e.g. VPD, clone rooting)" style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 5, color: "var(--text)", fontSize: 11, padding: 5, marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={submit} className="clear-btn" style={{ fontSize: 11 }}>Submit</button>
        <button onClick={() => { setOpen(false); setStatus(""); }} className="clear-btn" style={{ fontSize: 11 }}>Cancel</button>
        {status && <span style={{ fontSize: 10, color: "var(--text-3)" }}>{status}</span>}
      </div>
    </div>
  );
}
