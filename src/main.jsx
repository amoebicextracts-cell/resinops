import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthScreen from './AuthScreen.jsx'
import { auth } from './lib/db.js'
import { isSupabaseEnabled, setCurrentFacility, supabase } from './lib/supabase.js'

async function fetchAndSetFacility(userId) {
  if (!supabase || !userId) return;
  try {
    const { data } = await supabase
      .from('facility_members')
      .select('facility_id')
      .eq('user_id', userId)
      .limit(1)
      .single();
    if (data?.facility_id) {
      setCurrentFacility(data.facility_id);
      console.log('Facility set:', data.facility_id);
    }
  } catch (e) {
    console.warn('Could not fetch facility:', e.message);
  }
}

function Root() {
  const [user, setUser] = useState(undefined); // undefined=loading

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
    const { data: { subscription } } = auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user || null;
      if (u) await fetchAndSetFacility(u.id);
      setUser(u);
    });
    return () => subscription.unsubscribe();
  }, []);

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
    return <AuthScreen onAuth={u => setUser(u)} />;
  }

  // Logged in or localStorage mode — show app
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
