import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthScreen from './AuthScreen.jsx'
import { auth } from './lib/db.js'
import { isSupabaseEnabled, passwordRecoveryFromInitialUrl, inviteFromInitialUrl, setCurrentFacility, setCurrentFacilityRole, setCurrentFacilityScopeRoles, supabase } from './lib/supabase.js'
import { isPasswordRecoveryEvent } from './lib/auth.js'

async function fetchAndSetFacility(userId) {
  if (!supabase || !userId) return;
  setCurrentFacility(null);
  setCurrentFacilityRole(null);
  setCurrentFacilityScopeRoles({});
  try {
    const { data } = await supabase
      .from('facility_members')
      .select('facility_id, role, scope_roles')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();
    if (data?.facility_id) {
      setCurrentFacility(data.facility_id);
      setCurrentFacilityRole(data.role);
      setCurrentFacilityScopeRoles(data.scope_roles || {});
      console.log('Facility set:', data.facility_id);
    }
  } catch (e) {
    console.warn('Could not fetch facility:', e.message);
  }
}

function Root() {
  const [user, setUser] = useState(undefined); // undefined=loading
  const [passwordRecovery, setPasswordRecovery] = useState(passwordRecoveryFromInitialUrl);
  const [invitePending, setInvitePending] = useState(inviteFromInitialUrl && !passwordRecoveryFromInitialUrl);
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setUser(null); // localStorage mode — skip auth
      return;
    }
    // Check for existing session
    auth.getSession().then(async session => {
      const u = session?.user || null;
      if (u) await fetchAndSetFacility(u.id);
      setUser(u);
    });
    // Listen for future auth changes
    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      if (isPasswordRecoveryEvent(event)) {
        setPasswordRecovery(true);
        setUser(session?.user || null);
        return;
      }
      const u = session?.user || null;
      if (u) await fetchAndSetFacility(u.id);
      else {
        setCurrentFacility(null);
        setCurrentFacilityRole(null);
      }
      setUser(u);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (passwordRecovery) {
    return <AuthScreen initialMode="recovery" onRecoveryComplete={notice => {
      window.history.replaceState({}, '', '/');
      setAuthNotice(notice);
      setPasswordRecovery(false);
      setUser(null);
    }} />;
  }

  if (invitePending) {
    // Unlike password recovery, a brand-new invited account has no other
    // sessions anywhere to invalidate — log them straight in instead of
    // forcing a sign-out + fresh sign-in.
    return <AuthScreen initialMode="accept-invite" onAuth={u => {
      window.history.replaceState({}, '', '/');
      setInvitePending(false);
      setUser(u);
    }} />;
  }

  // Loading
  if (user === undefined) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1a0f",fontFamily:"Inter,sans-serif"}}>
        <div style={{color:"#4a7c59",fontSize:14}}>Loading...</div>
      </div>
    );
  }

  // Not logged in — show auth screen
  if (isSupabaseEnabled && !user) {
    return <AuthScreen initialNotice={authNotice} onAuth={u => setUser(u)} />;
  }

  // Logged in or localStorage mode — show app
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
