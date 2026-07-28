// ============================================================
// ResinOps — Two-Factor Authentication settings
// src/TwoFactorSettings.jsx
//
// Self-serve TOTP enrollment/removal using Supabase Auth's native MFA
// API. Optional per-user, not enforced -- mandating it for specific
// roles is a separate future decision. Rendered as a tab inside the
// Account Settings modal in App.jsx.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

export default function TwoFactorSettings() {
  const [factors, setFactors] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [enrolling, setEnrolling] = useState(null); // { factorId, qrCode, secret }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadFactors() {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) setMsg({ text: "Could not load 2FA status: " + error.message, type: "err" });
    else setFactors(data);
    setLoading(false);
  }

  useEffect(() => { loadFactors(); }, []);

  const activeFactor = factors?.totp?.[0] || null;

  async function startEnroll() {
    setMsg({ text: "", type: "" });
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setBusy(false);
    if (error) { setMsg({ text: "Could not start setup: " + error.message, type: "err" }); return; }
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function cancelEnroll() {
    if (enrolling) {
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    }
    setEnrolling(null);
    setCode("");
    setMsg({ text: "", type: "" });
  }

  async function verifyEnroll() {
    if (!code.trim()) return;
    setBusy(true);
    setMsg({ text: "", type: "" });
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code: code.trim() });
    setBusy(false);
    if (error) { setMsg({ text: "That code didn't work: " + error.message, type: "err" }); return; }
    setEnrolling(null);
    setCode("");
    setMsg({ text: "Two-factor authentication is now on.", type: "ok" });
    loadFactors();
  }

  async function disable() {
    if (!activeFactor) return;
    if (!window.confirm("Turn off two-factor authentication? Your account will only need a password to sign in.")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactor.id });
    setBusy(false);
    if (error) { setMsg({ text: "Could not disable: " + error.message, type: "err" }); return; }
    setMsg({ text: "Two-factor authentication is now off.", type: "ok" });
    loadFactors();
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--text-3)" }}>Loading…</div>;

  return (
    <div>
      {!enrolling && activeFactor && (
        <>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 4 }}>
            <span style={{ color: "var(--accent-2)", fontWeight: 700 }}>● On</span> — an authenticator app code is required at sign-in.
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>
            Enabled {activeFactor.created_at ? new Date(activeFactor.created_at).toLocaleDateString() : ""}
          </div>
          <button className="acct-btn secondary" onClick={disable} disabled={busy}>
            {busy ? "Working…" : "Turn off two-factor authentication"}
          </button>
        </>
      )}

      {!enrolling && !activeFactor && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14 }}>
            <span style={{ color: "var(--text-3)", fontWeight: 700 }}>○ Off</span> — add an authenticator app code as a second step at sign-in, on top of your password.
          </div>
          <button className="acct-btn primary" onClick={startEnroll} disabled={busy}>
            {busy ? "Starting…" : "Set up two-factor authentication"}
          </button>
        </>
      )}

      {enrolling && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
            Scan this with an authenticator app (Google Authenticator, Authy, 1Password, etc.), or enter the code manually.
          </div>
          <div style={{ background: "#fff", padding: 12, borderRadius: 8, width: "fit-content", marginBottom: 12 }}>
            <img src={enrolling.qrCode} alt="Scan with your authenticator app" width={180} height={180} />
          </div>
          <div className="acct-field">
            <label className="acct-lbl">Manual entry code</label>
            <input className="acct-inp" value={enrolling.secret} readOnly onFocus={e => e.target.select()} style={{ fontFamily: "monospace" }} />
          </div>
          <div className="acct-field">
            <label className="acct-lbl">Enter the 6-digit code from the app</label>
            <input className="acct-inp" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456" inputMode="numeric" autoFocus style={{ fontFamily: "monospace", letterSpacing: 2 }}
              onKeyDown={e => { if (e.key === "Enter") verifyEnroll(); }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="acct-btn primary" onClick={verifyEnroll} disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify & turn on"}
            </button>
            <button className="acct-btn secondary" onClick={cancelEnroll} disabled={busy}>Cancel</button>
          </div>
        </>
      )}

      {msg.text && <div className={`acct-msg ${msg.type}`}>{msg.text}</div>}
    </div>
  );
}
