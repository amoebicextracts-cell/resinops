import { useState, useEffect } from "react";
import {
  testMetrcConnection, syncAll, syncRooms, syncStrains,
  syncHarvests, syncLabResults, syncPackages, syncEmployees,
  syncTransfers, getMetrcStateOptions, METRC_STATES,
} from "./lib/metrc";

const CSS = `
  .metrc-wrap{padding:24px;max-width:900px;}
  .metrc-header{margin-bottom:24px;}
  .metrc-title{font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;}
  .metrc-sub{font-size:12px;color:var(--text-3);}
  .metrc-card{background:var(--surface-2);border:1px solid var(--border-2);border-radius:10px;padding:18px 20px;margin-bottom:14px;}
  .metrc-card-title{font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px;}
  .metrc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .metrc-field{display:flex;flex-direction:column;gap:5px;}
  .metrc-lbl{font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;}
  .metrc-inp{background:var(--surface);border:1px solid var(--border-2);border-radius:7px;padding:9px 12px;color:var(--text);font-size:13px;font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;}
  .metrc-inp:focus{border-color:var(--accent);}
  .metrc-sel{background:var(--surface);border:1px solid var(--border-2);border-radius:7px;padding:9px 12px;color:var(--text);font-size:13px;width:100%;box-sizing:border-box;}
  .metrc-btn{padding:9px 18px;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:opacity 0.15s;}
  .metrc-btn:disabled{opacity:0.5;cursor:not-allowed;}
  .metrc-btn.primary{background:var(--accent);color:#fff;}
  .metrc-btn.secondary{background:var(--surface-2);border:1px solid var(--border-2);color:var(--text-2);}
  .metrc-btn.danger{background:rgba(200,74,74,0.1);border:1px solid rgba(200,74,74,0.3);color:var(--danger);}
  .metrc-status{font-size:12px;padding:8px 12px;border-radius:7px;margin-top:8px;}
  .metrc-status.success{background:rgba(74,124,89,0.1);color:var(--accent-2);border:1px solid rgba(74,124,89,0.25);}
  .metrc-status.error{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.25);}
  .metrc-status.info{background:rgba(74,100,180,0.1);color:#8090e0;border:1px solid rgba(74,100,180,0.25);}
  .sync-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;}
  .sync-item{background:var(--surface);border:1px solid var(--border-2);border-radius:8px;padding:12px 14px;cursor:pointer;transition:all 0.15s;}
  .sync-item:hover{border-color:var(--accent);}
  .sync-item.syncing{border-color:var(--amber);animation:pulse 1.5s ease-in-out infinite;}
  .sync-item.done{border-color:var(--accent-2);}
  .sync-item.error{border-color:var(--danger);}
  .sync-icon{font-size:20px;margin-bottom:6px;}
  .sync-name{font-size:12px;font-weight:700;color:var(--text);margin-bottom:3px;}
  .sync-status{font-size:11px;color:var(--text-3);}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
  .log-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;height:120px;overflow-y:auto;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-3);margin-top:10px;}
  .log-entry{margin-bottom:3px;line-height:1.4;}
  .log-entry.ok{color:var(--accent-2);}
  .log-entry.err{color:var(--danger);}
  .log-entry.info{color:var(--text-2);}
  .metrc-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;}
  .metrc-badge.connected{background:rgba(74,124,89,0.15);color:var(--accent-2);}
  .metrc-badge.disconnected{background:rgba(200,74,74,0.1);color:var(--danger);}
`;

const SYNC_MODULES = [
  { key: 'rooms',       name: 'Grow Rooms',    icon: '🗺️',  fn: syncRooms },
  { key: 'strains',     name: 'Strains',        icon: '🌿',  fn: syncStrains },
  { key: 'harvests',    name: 'Harvests',       icon: '✂️',  fn: syncHarvests },
  { key: 'lab_results', name: 'Lab Results',    icon: '🔬',  fn: syncLabResults },
  { key: 'packages',    name: 'Packages',       icon: '📦',  fn: syncPackages },
  { key: 'employees',   name: 'Employees',      icon: '👥',  fn: syncEmployees },
  { key: 'transfers',   name: 'Transfers',      icon: '🚚',  fn: syncTransfers },
];

export default function MetrcHub() {
  const [settings, setSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("resinops_facility_settings") || "{}"); } catch { return {}; }
  });
  const [state, setState_] = useState(settings.metrcState || "NY");
  const [licenseNumber, setLicenseNumber] = useState(settings.licenseNumber || "");
  const [connected, setConnected] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncStatus, setSyncStatus] = useState({}); // {key: 'idle'|'syncing'|'done'|'error'}
  const [syncCounts, setSyncCounts] = useState({});
  const [log, setLog] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(settings.metrcLastSync || null);

  function addLog(msg, type = 'info') {
    setLog(prev => [...prev.slice(-50), { msg, type, ts: new Date().toLocaleTimeString() }]);
  }

  async function testConnection() {
    if (!licenseNumber.trim()) { addLog('Enter your license number first', 'err'); return; }
    setTesting(true);
    addLog(`Testing connection to METRC ${state}...`);
    const result = await testMetrcConnection(state, licenseNumber.trim());
    if (result.success) {
      setConnected(true);
      addLog(`✓ Connected to METRC ${METRC_STATES[state]?.name}`, 'ok');
      // Save to settings
      const updated = { ...settings, metrcState: state, metrcConnected: true };
      localStorage.setItem("resinops_facility_settings", JSON.stringify(updated));
      setSettings(updated);
    } else {
      setConnected(false);
      addLog(`✗ Connection failed: ${result.error}`, 'err');
    }
    setTesting(false);
  }

  async function runSync(moduleKey) {
    if (!connected) { addLog('Test connection first', 'err'); return; }
    const mod = SYNC_MODULES.find(m => m.key === moduleKey);
    if (!mod) return;
    setSyncStatus(prev => ({ ...prev, [moduleKey]: 'syncing' }));
    addLog(`Syncing ${mod.name}...`);
    try {
      const result = await mod.fn(state, licenseNumber, addLog);
      setSyncStatus(prev => ({ ...prev, [moduleKey]: 'done' }));
      setSyncCounts(prev => ({ ...prev, [moduleKey]: result.synced || 0 }));
      addLog(`✓ ${mod.name}: ${result.synced || 0} records synced`, 'ok');
    } catch (err) {
      setSyncStatus(prev => ({ ...prev, [moduleKey]: 'error' }));
      addLog(`✗ ${mod.name} failed: ${err.message}`, 'err');
    }
  }

  async function runFullSync() {
    if (!connected) { addLog('Test connection first', 'err'); return; }
    setSyncing(true);
    addLog('Starting full METRC sync...');
    for (const mod of SYNC_MODULES) {
      await runSync(mod.key);
      await new Promise(r => setTimeout(r, 300)); // small delay between modules
    }
    const now = new Date().toISOString();
    setLastSync(now);
    const updated = { ...settings, metrcLastSync: now };
    localStorage.setItem("resinops_facility_settings", JSON.stringify(updated));
    addLog('✓ Full sync complete', 'ok');
    setSyncing(false);
  }

  const stateOptions = getMetrcStateOptions();

  return (
    <>
      <style>{CSS}</style>
      <div className="metrc-wrap">
        <div className="metrc-header">
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
            <div className="metrc-title">METRC Integration</div>
            <span className={`metrc-badge ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Connected' : '○ Not connected'}
            </span>
          </div>
          <div className="metrc-sub">Sync plants, harvests, packages, lab results, transfers, and employees directly from METRC.</div>
        </div>

        {/* Connection Settings */}
        <div className="metrc-card">
          <div className="metrc-card-title">Connection Settings</div>
          <div className="metrc-grid" style={{marginBottom:12}}>
            <div className="metrc-field">
              <label className="metrc-lbl">State</label>
              <select className="metrc-sel" value={state} onChange={e => setState_(e.target.value)}>
                {stateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="metrc-field">
              <label className="metrc-lbl">License Number</label>
              <input className="metrc-inp" value={licenseNumber}
                onChange={e => setLicenseNumber(e.target.value)}
                placeholder="e.g. OCM-AUPR-007891" />
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--text-3)",marginBottom:12,padding:"8px 12px",background:"rgba(74,100,180,0.06)",borderRadius:7,border:"1px solid rgba(74,100,180,0.15)"}}>
            ℹ Your METRC API keys are stored as Vercel environment variables and never exposed to the browser. 
            Set <strong>METRC_SOFTWARE_KEY</strong> and <strong>METRC_USER_KEY</strong> in your Vercel project settings.
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button className="metrc-btn primary" onClick={testConnection} disabled={testing || !licenseNumber}>
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {lastSync && (
              <div style={{fontSize:11,color:"var(--text-3)"}}>
                Last sync: {new Date(lastSync).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Sync Modules */}
        <div className="metrc-card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div className="metrc-card-title" style={{margin:0}}>Sync Data</div>
            <button className="metrc-btn primary" onClick={runFullSync}
              disabled={!connected || syncing} style={{fontSize:12}}>
              {syncing ? "Syncing..." : "⟳ Sync All"}
            </button>
          </div>
          <div style={{fontSize:11,color:"var(--text-3)",marginBottom:12}}>
            Click individual modules to sync specific data, or use Sync All to refresh everything.
          </div>
          <div className="sync-grid">
            {SYNC_MODULES.map(mod => {
              const status = syncStatus[mod.key] || 'idle';
              const count = syncCounts[mod.key];
              return (
                <div key={mod.key}
                  className={`sync-item ${status}`}
                  onClick={() => !syncing && runSync(mod.key)}>
                  <div className="sync-icon">{mod.icon}</div>
                  <div className="sync-name">{mod.name}</div>
                  <div className="sync-status">
                    {status === 'idle' && 'Click to sync'}
                    {status === 'syncing' && 'Syncing...'}
                    {status === 'done' && `✓ ${count ?? 0} synced`}
                    {status === 'error' && '✗ Error — see log'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Log */}
        <div className="metrc-card">
          <div className="metrc-card-title">Activity Log</div>
          <div className="log-box" id="metrc-log">
            {log.length === 0 && (
              <div className="log-entry">No activity yet — test connection to begin.</div>
            )}
            {log.map((entry, i) => (
              <div key={i} className={`log-entry ${entry.type}`}>
                <span style={{opacity:0.5}}>[{entry.ts}]</span> {entry.msg}
              </div>
            ))}
          </div>
        </div>

        {/* Write Operations */}
        <div className="metrc-card">
          <div className="metrc-card-title">Push to METRC</div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:12}}>
            Send data from ResinOps back to METRC. Use these after creating records in ResinOps that need to appear in your state tracking system.
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button className="metrc-btn secondary" disabled={!connected}>
              📦 Push Package
            </button>
            <button className="metrc-btn secondary" disabled={!connected}>
              ✂️ Record Harvest
            </button>
            <button className="metrc-btn secondary" disabled={!connected}>
              🚚 Create Transfer
            </button>
            <button className="metrc-btn secondary" disabled={!connected}>
              🔬 Record Lab Result
            </button>
          </div>
          <div style={{fontSize:11,color:"var(--text-3)",marginTop:10}}>
            Push operations are available after a successful connection. They create records in METRC from your ResinOps data.
          </div>
        </div>
      </div>
    </>
  );
}
