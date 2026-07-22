import { useState } from "react";
import { auth } from "./lib/db";
import { supabase, setCurrentFacility, setCurrentFacilityRole, setCurrentFacilityScopeRoles } from "./lib/supabase";
import { MIN_PASSWORD_LENGTH, passwordResetRedirect, passwordValidationError } from "./lib/auth";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  .auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1a0f;font-family:'Inter',sans-serif;}
  .auth-card{background:#1a2e1a;border:1px solid #2d5a3d;border-radius:16px;padding:40px;width:100%;max-width:400px;box-shadow:0 8px 40px rgba(0,0,0,0.4);}
  .auth-logo{text-align:center;margin-bottom:28px;}
  .auth-logo-text{font-size:36px;font-weight:800;color:#4a7c59;letter-spacing:-0.5px;}
  .auth-logo-sub{font-size:12px;color:#6b8c6b;margin-top:4px;}
  .auth-title{font-size:20px;font-weight:700;color:#ffffff;margin-bottom:4px;}
  .auth-sub{font-size:13px;color:#7a9a7a;margin-bottom:24px;}
  .auth-lbl{display:block;font-size:11px;font-weight:700;color:#7a9a7a;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.06em;}
  .auth-inp{width:100%;padding:11px 14px;background:#0f1a0f;border:1px solid #2d5a3d;border-radius:8px;color:#ffffff;font-size:14px;font-family:'Inter',sans-serif;box-sizing:border-box;outline:none;transition:border-color 0.15s;}
  .auth-inp:focus{border-color:#4a7c59;}
  .auth-inp::placeholder{color:#3a5a3a;}
  .auth-btn{width:100%;padding:12px;background:#2d5a3d;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;margin-top:8px;transition:background 0.15s;}
  .auth-btn:hover{background:#4a7c59;}
  .auth-btn:disabled{opacity:0.5;cursor:not-allowed;}
  .auth-btn.secondary{background:transparent;border:1px solid #2d5a3d;color:#7a9a7a;}
  .auth-btn.secondary:hover{border-color:#4a7c59;color:#ffffff;}
  .auth-error{background:rgba(200,74,74,0.15);border:1px solid rgba(200,74,74,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#e05555;margin-bottom:14px;}
  .auth-success{background:rgba(74,124,89,0.15);border:1px solid rgba(74,124,89,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#86b795;margin-bottom:14px;}
  .auth-field{margin-bottom:16px;}
  .auth-toggle{text-align:center;font-size:13px;color:#7a9a7a;margin-top:20px;}
  .auth-toggle a,.auth-link{color:#4a7c59;cursor:pointer;font-weight:600;text-decoration:underline;}
`;

export default function AuthScreen({ onAuth, initialMode = "signin", initialNotice = "", onRecoveryComplete }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(initialNotice);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
  }

  async function handleSignIn() {
    setLoading(true); setError("");
    const { data, error: signInError } = await auth.signIn(email.trim(), password);
    if (signInError) { setError(signInError.message); setLoading(false); return; }
    onAuth?.(data.user);
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError("Enter your email address."); return; }
    setLoading(true); setError("");
    const { error: resetError } = await auth.resetPassword(
      email.trim(),
      passwordResetRedirect(window.location.origin),
    );
    if (resetError) setError(resetError.message);
    else setSuccess("If an account exists for that address, a password reset email is on its way.");
    setLoading(false);
  }

  async function handleRecovery() {
    const validationError = passwordValidationError(password, passwordConfirmation);
    if (validationError) { setError(validationError); return; }
    setLoading(true); setError("");
    const { error: updateError } = await auth.updatePassword(password);
    if (updateError) {
      setError(updateError.message || "This reset link is invalid or expired. Request a new one.");
      setLoading(false);
      return;
    }
    await auth.signOut('global');
    onRecoveryComplete?.("Password updated. Sign in with your new password.");
    setLoading(false);
  }

  async function handleAcceptInvite() {
    const validationError = passwordValidationError(password, passwordConfirmation);
    if (validationError) { setError(validationError); return; }
    setLoading(true); setError("");
    const { data, error: updateError } = await auth.updatePassword(password);
    if (updateError) {
      setError(updateError.message || "This invite link is invalid or expired. Ask for a new one.");
      setLoading(false);
      return;
    }
    const { error: acceptError } = await supabase.rpc('accept_facility_invite');
    if (acceptError) {
      setError("Password set, but activating your invite failed: " + acceptError.message);
      setLoading(false);
      return;
    }
    // Load facility context directly here rather than relying on the
    // onAuthStateChange listener elsewhere — that fires off the password
    // update itself, which can race ahead of accept_facility_invite above
    // and find no accepted row yet.
    try {
      const { data: membership } = await supabase
        .from('facility_members')
        .select('facility_id, role, scope_roles')
        .eq('user_id', data.user.id)
        .not('accepted_at', 'is', null)
        .limit(1)
        .single();
      if (membership) {
        setCurrentFacility(membership.facility_id);
        setCurrentFacilityRole(membership.role);
        setCurrentFacilityScopeRoles(membership.scope_roles || {});
      }
    } catch { /* best-effort — worst case the sidebar just shows no facility until a reload */ }
    onAuth?.(data.user);
    setLoading(false);
  }

  function handleKey(event) {
    if (event.key !== "Enter") return;
    if (mode === "signin") handleSignIn();
    else if (mode === "forgot") handleForgotPassword();
    else if (mode === "recovery") handleRecovery();
    else if (mode === "accept-invite") handleAcceptInvite();
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-text">ResinOps</div>
            <div className="auth-logo-sub">Cannabis Operations Platform</div>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {success && <div className="auth-success" role="status">{success}</div>}

          {mode === "signin" && <>
            <div className="auth-title">Sign in</div>
            <div className="auth-sub">Access your facility dashboard</div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="signin-email">Email</label>
              <input id="signin-email" className="auth-inp" type="email" value={email}
                onChange={event=>setEmail(event.target.value)} onKeyDown={handleKey}
                placeholder="you@example.com" autoComplete="email" autoFocus />
            </div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="signin-password">Password</label>
              <input id="signin-password" className="auth-inp" type="password" value={password}
                onChange={event=>setPassword(event.target.value)} onKeyDown={handleKey}
                autoComplete="current-password" />
            </div>
            <button className="auth-btn" onClick={handleSignIn} disabled={loading || !email || !password}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <div style={{textAlign:"center",marginTop:10}}>
              <button className="auth-link" onClick={()=>changeMode("forgot")} style={{fontSize:12,background:"none",border:"none"}}>Forgot password?</button>
            </div>
            <div className="auth-toggle">
              Need an account? <a href="https://resinops.com/#waitlist" target="_blank" rel="noopener noreferrer">Request access</a>
            </div>
          </>}

          {mode === "forgot" && <>
            <div className="auth-title">Reset your password</div>
            <div className="auth-sub">We'll email you a secure link to choose a new password.</div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="reset-email">Email</label>
              <input id="reset-email" className="auth-inp" type="email" value={email}
                onChange={event=>setEmail(event.target.value)} onKeyDown={handleKey}
                placeholder="you@example.com" autoComplete="email" autoFocus />
            </div>
            <button className="auth-btn" onClick={handleForgotPassword} disabled={loading || !email}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <button className="auth-btn secondary" onClick={()=>changeMode("signin")} disabled={loading}>Back to Sign In</button>
          </>}

          {mode === "recovery" && <>
            <div className="auth-title">Choose a new password</div>
            <div className="auth-sub">Use at least {MIN_PASSWORD_LENGTH} characters. Afterward, you'll sign in again on all devices.</div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="new-password">New Password</label>
              <input id="new-password" className="auth-inp" type="password" value={password}
                onChange={event=>setPassword(event.target.value)} onKeyDown={handleKey}
                autoComplete="new-password" autoFocus />
            </div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="confirm-password">Confirm New Password</label>
              <input id="confirm-password" className="auth-inp" type="password" value={passwordConfirmation}
                onChange={event=>setPasswordConfirmation(event.target.value)} onKeyDown={handleKey}
                autoComplete="new-password" />
            </div>
            <button className="auth-btn" onClick={handleRecovery} disabled={loading || !password || !passwordConfirmation}>
              {loading ? "Updating..." : "Update Password"}
            </button>
          </>}

          {mode === "accept-invite" && <>
            <div className="auth-title">Welcome to ResinOps</div>
            <div className="auth-sub">Set a password to activate your account. Use at least {MIN_PASSWORD_LENGTH} characters.</div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="invite-password">Password</label>
              <input id="invite-password" className="auth-inp" type="password" value={password}
                onChange={event=>setPassword(event.target.value)} onKeyDown={handleKey}
                autoComplete="new-password" autoFocus />
            </div>
            <div className="auth-field">
              <label className="auth-lbl" htmlFor="invite-confirm-password">Confirm Password</label>
              <input id="invite-confirm-password" className="auth-inp" type="password" value={passwordConfirmation}
                onChange={event=>setPasswordConfirmation(event.target.value)} onKeyDown={handleKey}
                autoComplete="new-password" />
            </div>
            <button className="auth-btn" onClick={handleAcceptInvite} disabled={loading || !password || !passwordConfirmation}>
              {loading ? "Activating..." : "Activate Account"}
            </button>
          </>}
        </div>
      </div>
    </>
  );
}
