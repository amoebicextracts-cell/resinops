import { useState } from "react";
import { auth, facilities } from "./lib/db";
import { isSupabaseEnabled } from "./lib/supabase";

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
  .auth-btn.secondary{background:transparent;border:1px solid #2d5a3d;color:#7a9a7a;margin-top:8px;}
  .auth-btn.secondary:hover{border-color:#4a7c59;color:#ffffff;}
  .auth-divider{text-align:center;color:#3a5a3a;font-size:12px;margin:16px 0;position:relative;}
  .auth-divider::before{content:'';position:absolute;top:50%;left:0;right:0;height:1px;background:#2d5a3d;}
  .auth-divider span{background:#1a2e1a;padding:0 12px;position:relative;}
  .auth-error{background:rgba(200,74,74,0.15);border:1px solid rgba(200,74,74,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#e05555;margin-bottom:14px;}
  .auth-success{background:rgba(74,124,89,0.15);border:1px solid rgba(74,124,89,0.4);border-radius:8px;padding:10px 14px;font-size:12px;color:#4a7c59;margin-bottom:14px;}
  .auth-field{margin-bottom:16px;}
  .auth-toggle{text-align:center;font-size:13px;color:#7a9a7a;margin-top:20px;}
  .auth-toggle a{color:#4a7c59;cursor:pointer;font-weight:600;text-decoration:underline;}
  .auth-toggle a:hover{color:#97bc62;}
`;

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignIn() {
    setLoading(true); setError("");
    const { data, error } = await auth.signIn(email, password);
    if (error) { setError(error.message); setLoading(false); return; }
    onAuth(data.user);
    setLoading(false);
  }

  async function handleSignUp() {
    if (!fullName.trim()) { setError("Full name is required"); return; }
    if (!facilityName.trim()) { setError("Facility name is required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");

    const { data, error: signUpError } = await auth.signUp(email, password, fullName);
    console.log("Signup result:", { data, error: signUpError });
    if (signUpError) {
      setError(signUpError.message || signUpError.msg || JSON.stringify(signUpError));
      setLoading(false);
      return;
    }
    if (!data?.user) {
      setError("No user returned — check Supabase Authentication settings");
      setLoading(false);
      return;
    }

    // Store facility name locally for now — will sync to Supabase after first login
    localStorage.setItem("resinops_pending_facility_name", facilityName);
    setSuccess("Account created! You can now sign in.");
    setMode("signin");
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError("Enter your email first, then click Forgot password."); return; }
    setLoading(true); setError("");
    const { error } = await auth.resetPassword ? await auth.resetPassword(email) : await (async()=>{
      const { data: sb } = await import("./lib/supabase");
      if (!sb.supabase) return { error: { message: "Supabase not configured" } };
      return await sb.supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://app.resinops.com" });
    })();
    if (error) { setError(error.message); }
    else { setSuccess("Password reset email sent. Check your inbox."); }
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === "Enter") {
      if (mode === "signin") handleSignIn();
      else if (mode === "signup") handleSignUp();
    }
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

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          {mode === "signin" && <>
            <div className="auth-title">Sign in</div>
            <div className="auth-sub">Access your facility dashboard</div>
            <div className="auth-field">
              <label className="auth-lbl">Email</label>
              <input className="auth-inp" type="email" value={email}
                onChange={e=>setEmail(e.target.value)} onKeyDown={handleKey}
                placeholder="you@example.com" autoFocus />
            </div>
            <div className="auth-field">
              <label className="auth-lbl">Password</label>
              <input className="auth-inp" type="password" value={password}
                onChange={e=>setPassword(e.target.value)} onKeyDown={handleKey}
                placeholder="••••••••" />
            </div>
            <button className="auth-btn" onClick={handleSignIn} disabled={loading || !email || !password}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <div style={{textAlign:"center",marginTop:10}}>
              <a onClick={handleForgotPassword} style={{fontSize:12,color:"#4a7c59",cursor:"pointer",textDecoration:"underline"}}>Forgot password?</a>
            </div>
            <div className="auth-toggle">
              Need an account? <a href="https://resinops.com/#waitlist" target="_blank" rel="noopener">Request access</a>
            </div>
          </>}

          {/* Sign-up disabled — accounts created by admin via Supabase dashboard */}

          {/* Local mode disabled for production */}
        </div>
      </div>
    </>
  );
}
