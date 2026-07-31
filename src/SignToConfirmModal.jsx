// ============================================================
// ResinOps — Shared "sign to confirm" e-signature modal
// src/SignToConfirmModal.jsx
//
// Used by src/GMPHub.jsx's three closing actions (QC Head batch release,
// SOP activation, deviation closure). Builds a jsPDF snapshot, hashes it,
// and posts to api/sign-document.js, which re-verifies the caller's
// password before freezing the PDF and recording an immutable signature.
// This component never mutates domain state itself -- on success it calls
// onSigned(record) and the caller performs the actual db.<table>.upsert().
// ============================================================

import { useState } from "react";
import { authenticatedApiFetch, formatApiError } from "./lib/api";

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function SignToConfirmModal({ title, description, documentType, documentId, documentLabel, facilityId, buildPdf, onSigned, onCancel }) {
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [err, setErr] = useState("");

  async function handleSign() {
    if (!password) { setErr("Enter your password to sign."); return; }
    setSigning(true); setErr("");
    try {
      const doc = buildPdf();
      const buffer = doc.output("arraybuffer");
      const sha256 = await sha256Hex(buffer);
      const pdfBase64 = bufferToBase64(buffer);

      const res = await authenticatedApiFetch("/api/sign-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, documentType, documentId, documentLabel, facilityId, pdfBase64, sha256 }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(formatApiError(res, data, "Signing failed")); setSigning(false); return; }
      onSigned(data.data);
    } catch (e) {
      setErr("Signing failed: " + e.message);
      setSigning(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onCancel}>
      <div className="gh-card" style={{ width: 420, maxWidth: "90vw", margin: 0 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>{description}</div>
        <label className="gh-lbl">Your password</label>
        <input
          className="gh-inp"
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !signing) handleSign(); }}
        />
        {err && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="gh-btn gh-primary" disabled={signing || !password} onClick={handleSign}>{signing ? "Signing…" : "Sign"}</button>
          <button className="gh-btn gh-secondary" disabled={signing} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
