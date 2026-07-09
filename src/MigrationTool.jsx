import { useState } from "react";
import { migrateLocalStorageToSupabase } from "./lib/db";
import { isSupabaseEnabled, getCurrentFacility } from "./lib/supabase";

export default function MigrationTool() {
  const [status, setStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  async function runMigration() {
    const fid = getCurrentFacility();
    if (!fid) { setStatus("error: No facility selected"); return; }
    setRunning(true); setStatus("Migrating..."); setResults(null);
    try {
      const res = await migrateLocalStorageToSupabase(fid);
      setResults(res);
      const errors = Object.entries(res).filter(([,v]) => v.error);
      if (errors.length === 0) {
        setStatus("success");
      } else {
        setStatus(`partial: ${errors.length} tables had errors`);
      }
    } catch (e) {
      setStatus("error: " + e.message);
    }
    setRunning(false);
  }

  if (!isSupabaseEnabled) return null;

  return (
    <div style={{background:"rgba(74,124,89,0.06)",border:"1px solid rgba(74,124,89,0.25)",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
      <div style={{fontWeight:700,color:"var(--accent-2)",fontSize:13,marginBottom:6}}>☁️ Migrate to Cloud (V2)</div>
      <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10}}>
        One click copies all your local data to Supabase cloud — enables multi-user access and multi-device sync.
      </div>
      <button onClick={runMigration} disabled={running}
        style={{padding:"8px 16px",background:"var(--accent)",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:running?"not-allowed":"pointer",opacity:running?0.6:1}}>
        {running ? "Migrating..." : "Migrate Local Data → Cloud"}
      </button>

      {status && (
        <div style={{marginTop:10,fontSize:12,color:status.startsWith("success")?"var(--accent-2)":"var(--danger)"}}>
          {status.startsWith("success") ? "✓ Migration complete — all data is now in Supabase" : "⚠ " + status}
        </div>
      )}

      {results && (
        <div style={{marginTop:8,fontSize:11,color:"var(--text-3)"}}>
          {Object.entries(results).map(([table, result]) => (
            <div key={table} style={{display:"flex",gap:8,marginBottom:2}}>
              <span style={{color: result.error ? "var(--danger)" : "var(--accent-2)"}}>
                {result.error ? "✗" : "✓"}
              </span>
              <span>{table}: {result.error || `${result.count} records`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
