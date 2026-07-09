import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthScreen from './AuthScreen.jsx'
import { auth } from './lib/db.js'
import { isSupabaseEnabled, setCurrentFacility } from './lib/supabase.js'

function Root() {
  const [user, setUser] = useState(undefined); // undefined=loading

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setUser(null); // localStorage mode — skip auth
      return;
    }
    // Check for existing session
    auth.getSession().then(session => {
      setUser(session?.user || null);
    });
    // Listen for future auth changes
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
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
