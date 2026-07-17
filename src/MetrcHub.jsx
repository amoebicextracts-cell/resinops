import { useState, useEffect } from "react";
import { db } from "./lib/db";
import {
  testMetrcConnection, syncAll, syncRooms, syncStrains,
  syncHarvests, syncLabResults, syncPackages, syncEmployees,
  syncTransfers, getMetrcStateOptions, METRC_STATES,
  createMetrcPackage, createMetrcHarvest, recordLabTest, createMetrcOutgoingTransfer,
} from "./lib/metrc";

const CANNABINOID_FIELDS = [
  { k: "thca", t: "THCA" }, { k: "thc", t: "Delta 9 THC" }, { k: "cbd", t: "CBD" },
  { k: "cbda", t: "CBDA" }, { k: "cbg", t: "CBG" }, { k: "cbn", t: "CBN" },
  { k: "cbc", t: "CBC" }, { k: "thcv", t: "THCV" },
];
const TERPENE_FIELDS = [
  { k: "myrcene", t: "Myrcene" }, { k: "caryophyllene", t: "Caryophyllene" },
  { k: "limonene", t: "Limonene" }, { k: "linalool", t: "Linalool" },
  { k: "humulene", t: "Humulene" }, { k: "ocimene", t: "Ocimene" },
  { k: "terpinolene", t: "Terpinolene" }, { k: "pinene", t: "Pinene" },
  { k: "bisabolol", t: "Bisabolol" }, { k: "valencene", t: "Valencene" },
];
const EMPTY_MANIFEST = {
  destinationFacilityName: "", destinationLicenseNumber: "", transferType: "Wholesale Manifest",
  plannedRoute: "", estimatedDeparture: "", estimatedArrival: "",
  driverName: "", driverLicenseNumber: "", vehicleMake: "", vehicleModel: "", vehicleLicensePlate: "",
  phoneForQuestions: "", packages: [], notes: "",
};

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
  .metrc-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;}
  .metrc-modal-card{background:var(--surface);border:1px solid var(--border-2);border-radius:12px;padding:24px;width:520px;max-width:100%;max-height:85vh;overflow-y:auto;}
  .metrc-modal-title{font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px;}
  .metrc-modal-sub{font-size:12px;color:var(--text-3);margin-bottom:16px;}
  .metrc-preview{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-2);white-space:pre-wrap;word-break:break-word;max-height:260px;overflow-y:auto;margin:10px 0;}
  .metrc-callout{font-size:11px;color:var(--text-2);background:rgba(74,100,180,0.06);border:1px solid rgba(74,100,180,0.15);border-radius:7px;padding:8px 12px;margin-bottom:12px;line-height:1.5;}
  .metrc-warn{font-size:11px;color:var(--amber);background:rgba(200,150,58,0.08);border:1px solid rgba(200,150,58,0.25);border-radius:7px;padding:8px 12px;margin-bottom:12px;line-height:1.5;}
  .manifest-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .manifest-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface);}
  .manifest-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .manifest-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;}
  .manifest-pill.draft{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .manifest-pill.pushed{background:rgba(74,124,89,0.15);color:var(--accent-2);}
  .manifest-pill.failed{background:rgba(200,74,74,0.1);color:var(--danger);}
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

  const [prodBatches, setProdBatches] = useState([]);
  const [harvestBatches, setHarvestBatches] = useState([]);
  const [qcTests, setQcTests] = useState([]);
  const [growRoomsList, setGrowRoomsList] = useState([]);
  const [manifests, setManifests] = useState([]);
  const [pushModal, setPushModal] = useState(null); // {type, step:'pick'|'preview', sourceId, form, err}
  const [manifestForm, setManifestForm] = useState(null);
  const [manifestErr, setManifestErr] = useState("");
  const [manifestPreview, setManifestPreview] = useState(null); // manifest being confirmed for push

  useEffect(() => {
    async function load() {
      try {
        const [pb, hb, qc, gr, mf] = await Promise.all([
          db.production_batches.list(),
          db.harvest_batches.list(),
          db.qc_tests.list(),
          db.grow_rooms.list(),
          db.metrc_transfer_manifests.list(),
        ]);
        setProdBatches(pb.filter(b => !b.isLinked));
        setHarvestBatches(hb);
        setQcTests(qc);
        setGrowRoomsList(gr);
        setManifests(mf);
      } catch (e) { console.error("MetrcHub load error:", e); }
    }
    load();
  }, []);

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

  // ── Push to METRC ──────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  function emptyPushForm(type) {
    if (type === "package") return { metrcTag: "", location: "", item: "", quantity: "", unitOfMeasure: "Grams", notes: "", date: today };
    if (type === "harvest") return { metrcPlantTag: "", wetWeightOz: "", dryingLocation: "", harvestDate: today };
    if (type === "labResult") return { packageLabel: "", testDate: today };
    return {};
  }

  function openPushModal(type) {
    setPushModal({ type, step: "pick", sourceId: "", form: emptyPushForm(type), err: "" });
  }

  function pushSourceList(type) {
    if (type === "package") return prodBatches;
    if (type === "harvest") return harvestBatches;
    if (type === "labResult") return qcTests;
    return [];
  }

  function selectPushSource(id) {
    if (!pushModal) return;
    const source = pushSourceList(pushModal.type).find(x => String(x.id) === id);
    let form = { ...pushModal.form };
    if (pushModal.type === "package" && source) {
      form = { ...form, notes: source.name || "", quantity: source.actualYield ? String(source.actualYield) : "" };
    } else if (pushModal.type === "harvest" && source) {
      form = {
        ...form,
        dryingLocation: source.spaceName || "",
        harvestDate: source.harvestDate || source.d || today,
        wetWeightOz: source.wetWeightG ? (parseFloat(source.wetWeightG) / 28.3495).toFixed(2) : "",
      };
    } else if (pushModal.type === "labResult" && source) {
      form = { ...form, testDate: source.dateReported || source.receivedDate || source.dateSubmitted || today };
    }
    setPushModal({ ...pushModal, sourceId: id, form, err: "" });
  }

  function setPushField(k, v) { setPushModal(m => ({ ...m, form: { ...m.form, [k]: v } })); }

  // Mirrors the exact body each lib/metrc.js create*/record* function
  // builds internally — kept in sync by hand since the preview's whole
  // purpose is to show precisely what will be sent (no live METRC account
  // exists to verify against otherwise).
  function buildPushPayload() {
    if (!pushModal) return null;
    const { type, form, sourceId } = pushModal;
    if (type === "package") {
      const source = prodBatches.find(x => String(x.id) === sourceId) || {};
      return [{
        Tag: form.metrcTag, Location: form.location, Item: form.item,
        Quantity: parseFloat(form.quantity) || 0, UnitOfMeasure: form.unitOfMeasure,
        PatientLicenseNumber: null, Note: form.notes,
        IsProductionBatch: true, ProductionBatchNumber: source.name || "",
        IsTradeSample: false, ActualDate: form.date,
      }];
    }
    if (type === "harvest") {
      return [{
        Plant: form.metrcPlantTag, Weight: parseFloat(form.wetWeightOz) || 0, UnitOfWeight: "Ounces",
        DryingLocation: form.dryingLocation, PatientLicenseNumber: null, ActualDate: form.harvestDate,
      }];
    }
    if (type === "labResult") {
      const source = qcTests.find(x => String(x.id) === sourceId) || {};
      const cannabinoids = CANNABINOID_FIELDS.filter(f => source[f.k]).map(f => ({ Type: f.t, Value: parseFloat(source[f.k]) }));
      const terpenes = TERPENE_FIELDS.filter(f => source[f.k]).map(f => ({ Type: f.t, Value: parseFloat(source[f.k]) }));
      return [{
        Label: form.packageLabel, ResultDate: form.testDate,
        Cannabinoids: cannabinoids, Terpenes: terpenes,
        Pesticides: [], HeavyMetals: [], Mycotoxins: [], Microbials: [],
      }];
    }
    return null;
  }

  function goToPreview() {
    if (!pushModal.sourceId) { setPushModal(m => ({ ...m, err: "Select a source record first." })); return; }
    if (pushModal.type === "package" && !pushModal.form.metrcTag.trim()) { setPushModal(m => ({ ...m, err: "Enter the METRC package tag you're assigning." })); return; }
    if (pushModal.type === "harvest" && !pushModal.form.metrcPlantTag.trim()) { setPushModal(m => ({ ...m, err: "Enter the METRC plant tag being harvested." })); return; }
    if (pushModal.type === "labResult" && !pushModal.form.packageLabel.trim()) { setPushModal(m => ({ ...m, err: "Enter the METRC package label this result attaches to." })); return; }
    setPushModal(m => ({ ...m, step: "preview", err: "" }));
  }

  async function confirmPush() {
    const { type, form, sourceId } = pushModal;
    addLog(`Pushing ${type}...`);
    try {
      let result;
      if (type === "package") result = await createMetrcPackage(state, licenseNumber, {
        metrcTag: form.metrcTag, locationName: form.location, itemName: form.item,
        quantity: parseFloat(form.quantity) || 0, unitOfMeasure: form.unitOfMeasure,
        notes: form.notes, isProductionBatch: true,
        batchNumber: prodBatches.find(b => String(b.id) === sourceId)?.name || "",
        date: form.date,
      });
      else if (type === "harvest") result = await createMetrcHarvest(state, licenseNumber, {
        metrcPlantTag: form.metrcPlantTag, wetWeightOz: parseFloat(form.wetWeightOz) || 0,
        dryingLocation: form.dryingLocation, harvestDate: form.harvestDate,
      });
      else if (type === "labResult") {
        const labSource = qcTests.find(x => String(x.id) === sourceId) || {};
        result = await recordLabTest(state, licenseNumber, {
          packageLabel: form.packageLabel, testDate: form.testDate,
          cannabinoids: CANNABINOID_FIELDS.filter(f => labSource[f.k]).map(f => ({ type: f.t, value: parseFloat(labSource[f.k]) })),
          terpenes: TERPENE_FIELDS.filter(f => labSource[f.k]).map(f => ({ type: f.t, value: parseFloat(labSource[f.k]) })),
        });
      }

      addLog(`✓ ${type} pushed to METRC`, "ok");

      if (type === "package") {
        const source = prodBatches.find(b => String(b.id) === sourceId);
        if (source) {
          const saved = await db.production_batches.upsert({ ...source, metrcTag: form.metrcTag });
          setProdBatches(p => p.map(b => b.id === saved.id ? saved : b));
        }
      } else if (type === "harvest") {
        const source = harvestBatches.find(b => String(b.id) === sourceId);
        if (source) {
          const saved = await db.harvest_batches.upsert({ ...source, metrcTag: form.metrcPlantTag });
          setHarvestBatches(p => p.map(b => b.id === saved.id ? saved : b));
        }
      }
      setPushModal(null);
    } catch (e) {
      addLog(`✗ Push failed: ${e.message}`, "err");
      setPushModal(m => ({ ...m, err: "Push failed: " + e.message }));
    }
  }

  // ── Transfer Manifests ──────────────────────────────────────────
  function openNewManifest() { setManifestForm({ ...EMPTY_MANIFEST, id: crypto.randomUUID() }); setManifestErr(""); }
  function setManifestField(k, v) { setManifestForm(f => ({ ...f, [k]: v })); }
  function addManifestPackage() {
    setManifestForm(f => ({ ...f, packages: [...(f.packages || []), { packageLabel: "", grossWeight: "", grossUnitOfWeight: "Grams", wholesalePrice: "" }] }));
  }
  function updateManifestPackage(idx, k, v) {
    setManifestForm(f => { const pkgs = [...f.packages]; pkgs[idx] = { ...pkgs[idx], [k]: v }; return { ...f, packages: pkgs }; });
  }
  function removeManifestPackage(idx) {
    setManifestForm(f => ({ ...f, packages: f.packages.filter((_, i) => i !== idx) }));
  }
  async function saveManifestDraft() {
    if (!manifestForm.destinationFacilityName.trim()) { setManifestErr("Enter the destination facility name."); return; }
    try {
      const saved = await db.metrc_transfer_manifests.upsert({ ...manifestForm, status: manifestForm.status || "draft" });
      setManifests(p => { const i = p.findIndex(m => m.id === saved.id); return i >= 0 ? p.map(m => m.id === saved.id ? saved : m) : [...p, saved]; });
      setManifestForm(null); setManifestErr("");
    } catch (e) { setManifestErr("Save failed: " + e.message); }
  }
  async function removeManifest(id) {
    try { await db.metrc_transfer_manifests.delete(id); setManifests(p => p.filter(m => m.id !== id)); }
    catch (e) { console.error("Delete failed:", e); }
  }
  async function confirmPushManifest() {
    const m = manifestPreview;
    addLog("Pushing transfer manifest...");
    try {
      const result = await createMetrcOutgoingTransfer(state, licenseNumber, m);
      const saved = await db.metrc_transfer_manifests.upsert({ ...m, status: "pushed", metrcTransferId: result?.Id ? String(result.Id) : "" });
      setManifests(p => p.map(x => x.id === saved.id ? saved : x));
      addLog("✓ Transfer manifest pushed to METRC", "ok");
      setManifestPreview(null);
    } catch (e) {
      addLog(`✗ Manifest push failed: ${e.message}`, "err");
      try {
        const saved = await db.metrc_transfer_manifests.upsert({ ...m, status: "failed" });
        setManifests(p => p.map(x => x.id === saved.id ? saved : x));
      } catch {}
      setManifestPreview(null);
    }
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
          <div className="metrc-warn">
            ⚠ Write operations are gated behind the <strong>METRC_WRITES_ENABLED</strong> server flag and real <strong>METRC_SOFTWARE_KEY</strong>/<strong>METRC_USER_KEY</strong> credentials — neither is set up yet, so nothing here can actually reach METRC until you configure them. Every push shows the exact payload before sending. Test Push Package with one low-stakes record first once you have real credentials, before relying on Record Harvest or Transfer Manifests.
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button className="metrc-btn secondary" onClick={() => openPushModal("package")}>📦 Push Package</button>
            <button className="metrc-btn secondary" onClick={() => openPushModal("harvest")}>✂️ Record Harvest</button>
            <button className="metrc-btn secondary" onClick={() => openPushModal("labResult")}>🔬 Record Lab Result</button>
          </div>
        </div>

        {/* Transfer Manifests */}
        <div className="metrc-card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div className="metrc-card-title" style={{margin:0}}>🚚 Transfer Manifests</div>
            {!manifestForm && <button className="metrc-btn primary" style={{fontSize:12}} onClick={openNewManifest}>+ New Manifest</button>}
          </div>
          <div style={{fontSize:11,color:"var(--text-3)",marginBottom:12}}>
            Draft an outbound transfer manifest here first — destination, transporter, vehicle, and packages — then push it once you're ready.
          </div>
          <div className="metrc-warn">
            ⚠ This endpoint (<code>/transfers/v1/outgoing</code>) hasn't been verified against live METRC API documentation — confirm the exact path and payload against your state's official docs before enabling writes for this specific action.
          </div>

          {manifestForm && (
            <div style={{border:"1px solid var(--border-2)",borderRadius:8,padding:14,marginBottom:12}}>
              <div className="metrc-grid" style={{marginBottom:10}}>
                <div className="metrc-field"><label className="metrc-lbl">Destination facility name</label><input className="metrc-inp" value={manifestForm.destinationFacilityName} onChange={e=>setManifestField("destinationFacilityName",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Destination license #</label><input className="metrc-inp" value={manifestForm.destinationLicenseNumber} onChange={e=>setManifestField("destinationLicenseNumber",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Transfer type</label><input className="metrc-inp" value={manifestForm.transferType} onChange={e=>setManifestField("transferType",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Planned route</label><input className="metrc-inp" value={manifestForm.plannedRoute} onChange={e=>setManifestField("plannedRoute",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Est. departure</label><input type="datetime-local" className="metrc-inp" value={manifestForm.estimatedDeparture} onChange={e=>setManifestField("estimatedDeparture",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Est. arrival</label><input type="datetime-local" className="metrc-inp" value={manifestForm.estimatedArrival} onChange={e=>setManifestField("estimatedArrival",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Driver name</label><input className="metrc-inp" value={manifestForm.driverName} onChange={e=>setManifestField("driverName",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Driver license #</label><input className="metrc-inp" value={manifestForm.driverLicenseNumber} onChange={e=>setManifestField("driverLicenseNumber",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Vehicle make</label><input className="metrc-inp" value={manifestForm.vehicleMake} onChange={e=>setManifestField("vehicleMake",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Vehicle model</label><input className="metrc-inp" value={manifestForm.vehicleModel} onChange={e=>setManifestField("vehicleModel",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Vehicle license plate</label><input className="metrc-inp" value={manifestForm.vehicleLicensePlate} onChange={e=>setManifestField("vehicleLicensePlate",e.target.value)} /></div>
                <div className="metrc-field"><label className="metrc-lbl">Phone for questions</label><input className="metrc-inp" value={manifestForm.phoneForQuestions} onChange={e=>setManifestField("phoneForQuestions",e.target.value)} /></div>
              </div>

              <div style={{fontSize:11,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Packages</div>
              {(manifestForm.packages||[]).map((p,idx)=>(
                <div key={idx} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:8,marginBottom:8,alignItems:"center"}}>
                  <input className="metrc-inp" placeholder="Package label" value={p.packageLabel} onChange={e=>updateManifestPackage(idx,"packageLabel",e.target.value)} />
                  <input type="number" className="metrc-inp" placeholder="Gross weight" value={p.grossWeight} onChange={e=>updateManifestPackage(idx,"grossWeight",e.target.value)} />
                  <select className="metrc-sel" value={p.grossUnitOfWeight} onChange={e=>updateManifestPackage(idx,"grossUnitOfWeight",e.target.value)}>
                    <option>Grams</option><option>Ounces</option><option>Pounds</option>
                  </select>
                  <input type="number" className="metrc-inp" placeholder="Wholesale $" value={p.wholesalePrice} onChange={e=>updateManifestPackage(idx,"wholesalePrice",e.target.value)} />
                  <button className="metrc-btn danger" style={{fontSize:11,padding:"6px 10px"}} onClick={()=>removeManifestPackage(idx)}>✕</button>
                </div>
              ))}
              <button className="metrc-btn secondary" style={{fontSize:12,marginBottom:12}} onClick={addManifestPackage}>+ Add package</button>

              <div className="metrc-field" style={{marginBottom:10}}><label className="metrc-lbl">Notes</label><input className="metrc-inp" value={manifestForm.notes} onChange={e=>setManifestField("notes",e.target.value)} /></div>

              {manifestErr && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{manifestErr}</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="metrc-btn primary" onClick={saveManifestDraft}>Save Draft</button>
                <button className="metrc-btn secondary" onClick={()=>{setManifestForm(null);setManifestErr("");}}>Cancel</button>
              </div>
            </div>
          )}

          {manifests.length === 0 ? (
            <div style={{textAlign:"center",padding:20,color:"var(--text-3)",fontSize:12}}>No transfer manifests drafted yet.</div>
          ) : (
            <table className="manifest-tbl">
              <thead><tr><th>Destination</th><th>Packages</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {manifests.map(m=>(
                  <tr key={m.id}>
                    <td style={{fontWeight:500,color:"var(--text)"}}>{m.destinationFacilityName||"—"}</td>
                    <td>{(m.packages||[]).length}</td>
                    <td><span className={`manifest-pill ${m.status}`}>{m.status}</span></td>
                    <td><div style={{display:"flex",gap:6}}>
                      {m.status!=="pushed" && <button className="metrc-btn secondary" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>setManifestForm(m)}>Edit</button>}
                      {m.status!=="pushed" && <button className="metrc-btn primary" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>setManifestPreview(m)}>Push</button>}
                      <button className="metrc-btn danger" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>removeManifest(m.id)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Push modal (Package / Harvest / Lab Result) */}
      {pushModal && (
        <div className="metrc-modal-overlay">
          <div className="metrc-modal-card">
            <div className="metrc-modal-title">
              {pushModal.type==="package"?"📦 Push Package":pushModal.type==="harvest"?"✂️ Record Harvest":"🔬 Record Lab Result"}
            </div>
            <div className="metrc-modal-sub">
              {pushModal.step==="pick" ? "Step 1 — select the ResinOps record to push" : "Step 2 — review the exact payload before sending"}
            </div>

            {pushModal.step==="pick" && (
              <>
                <div className="metrc-field" style={{marginBottom:12}}>
                  <label className="metrc-lbl">Source record</label>
                  <select className="metrc-sel" value={pushModal.sourceId} onChange={e=>selectPushSource(e.target.value)}>
                    <option value="">— Select —</option>
                    {pushSourceList(pushModal.type).map(r=>(
                      <option key={r.id} value={r.id}>{r.name||r.strainName||r.sampleId||r.batchName||r.id}</option>
                    ))}
                  </select>
                </div>

                {pushModal.sourceId && pushModal.type==="package" && (
                  <div className="metrc-grid" style={{marginBottom:12}}>
                    <div className="metrc-field"><label className="metrc-lbl">METRC package tag</label><input className="metrc-inp" value={pushModal.form.metrcTag} onChange={e=>setPushField("metrcTag",e.target.value)} placeholder="must be an available tag in METRC" /></div>
                    <div className="metrc-field"><label className="metrc-lbl">Location</label>
                      <input className="metrc-inp" list="metrc-locations" value={pushModal.form.location} onChange={e=>setPushField("location",e.target.value)} placeholder="must exactly match METRC" />
                      <datalist id="metrc-locations">{growRoomsList.map(r=><option key={r.id} value={r.name} />)}</datalist>
                    </div>
                    <div className="metrc-field"><label className="metrc-lbl">Item</label><input className="metrc-inp" value={pushModal.form.item} onChange={e=>setPushField("item",e.target.value)} placeholder="must exactly match METRC" /></div>
                    <div className="metrc-field"><label className="metrc-lbl">Quantity</label><input type="number" className="metrc-inp" value={pushModal.form.quantity} onChange={e=>setPushField("quantity",e.target.value)} /></div>
                    <div className="metrc-field"><label className="metrc-lbl">Unit of measure</label>
                      <select className="metrc-sel" value={pushModal.form.unitOfMeasure} onChange={e=>setPushField("unitOfMeasure",e.target.value)}>
                        <option>Grams</option><option>Ounces</option><option>Pounds</option><option>Each</option>
                      </select>
                    </div>
                    <div className="metrc-field"><label className="metrc-lbl">Date</label><input type="date" className="metrc-inp" value={pushModal.form.date} onChange={e=>setPushField("date",e.target.value)} /></div>
                  </div>
                )}
                {pushModal.sourceId && pushModal.type==="harvest" && (
                  <div className="metrc-grid" style={{marginBottom:12}}>
                    <div className="metrc-field"><label className="metrc-lbl">METRC plant tag</label><input className="metrc-inp" value={pushModal.form.metrcPlantTag} onChange={e=>setPushField("metrcPlantTag",e.target.value)} placeholder="from METRC's own UI" /></div>
                    <div className="metrc-field"><label className="metrc-lbl">Wet weight (oz)</label><input type="number" className="metrc-inp" value={pushModal.form.wetWeightOz} onChange={e=>setPushField("wetWeightOz",e.target.value)} /></div>
                    <div className="metrc-field"><label className="metrc-lbl">Drying location</label>
                      <input className="metrc-inp" list="metrc-locations" value={pushModal.form.dryingLocation} onChange={e=>setPushField("dryingLocation",e.target.value)} placeholder="must exactly match METRC" />
                      <datalist id="metrc-locations">{growRoomsList.map(r=><option key={r.id} value={r.name} />)}</datalist>
                    </div>
                    <div className="metrc-field"><label className="metrc-lbl">Date</label><input type="date" className="metrc-inp" value={pushModal.form.harvestDate} onChange={e=>setPushField("harvestDate",e.target.value)} /></div>
                  </div>
                )}
                {pushModal.sourceId && pushModal.type==="labResult" && (
                  <>
                    <div className="metrc-grid" style={{marginBottom:12}}>
                      <div className="metrc-field"><label className="metrc-lbl">METRC package label</label><input className="metrc-inp" value={pushModal.form.packageLabel} onChange={e=>setPushField("packageLabel",e.target.value)} placeholder="the package this result attaches to" /></div>
                      <div className="metrc-field"><label className="metrc-lbl">Test date</label><input type="date" className="metrc-inp" value={pushModal.form.testDate} onChange={e=>setPushField("testDate",e.target.value)} /></div>
                    </div>
                    <div className="metrc-callout">Sends numeric cannabinoid/terpene values from this QC record. ResinOps only tracks pesticide/heavy-metal/microbial results at the pass/fail panel level, not per-analyte, so those aren't included — record them directly in METRC if required.</div>
                  </>
                )}

                {pushModal.err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{pushModal.err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="metrc-btn primary" onClick={goToPreview} disabled={!pushModal.sourceId}>Next: Preview</button>
                  <button className="metrc-btn secondary" onClick={()=>setPushModal(null)}>Cancel</button>
                </div>
              </>
            )}

            {pushModal.step==="preview" && (
              <>
                <div className="metrc-callout">This is the exact request body that will be sent to METRC. Review it carefully before confirming.</div>
                <div className="metrc-preview">{JSON.stringify(buildPushPayload(), null, 2)}</div>
                {pushModal.err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{pushModal.err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="metrc-btn primary" onClick={confirmPush} disabled={!connected}>Confirm & Send</button>
                  <button className="metrc-btn secondary" onClick={()=>setPushModal(m=>({...m,step:"pick"}))}>Back</button>
                </div>
                {!connected && <div style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>Test the connection first — see Connection Settings above.</div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Manifest push preview modal */}
      {manifestPreview && (
        <div className="metrc-modal-overlay">
          <div className="metrc-modal-card">
            <div className="metrc-modal-title">🚚 Push Transfer Manifest</div>
            <div className="metrc-modal-sub">To {manifestPreview.destinationFacilityName}</div>
            <div className="metrc-callout">This is the exact request body that will be sent to METRC. Review it carefully before confirming.</div>
            <div className="metrc-preview">{JSON.stringify([{
              TransporterFacilityLicenseNumber: licenseNumber,
              RecipientLicenseNumber: manifestPreview.destinationLicenseNumber,
              TransferTypeName: manifestPreview.transferType,
              PlannedRoute: manifestPreview.plannedRoute,
              EstimatedDepartureDateTime: manifestPreview.estimatedDeparture,
              EstimatedArrivalDateTime: manifestPreview.estimatedArrival,
              Transporters: [{
                DriverName: manifestPreview.driverName,
                DriverOccupationalLicenseNumber: manifestPreview.driverLicenseNumber,
                VehicleMake: manifestPreview.vehicleMake,
                VehicleModel: manifestPreview.vehicleModel,
                VehicleLicensePlateNumber: manifestPreview.vehicleLicensePlate,
                PhoneNumberForQuestions: manifestPreview.phoneForQuestions,
              }],
              Packages: (manifestPreview.packages||[]).map(p=>({
                PackageLabel: p.packageLabel, GrossWeight: p.grossWeight,
                GrossUnitOfWeightName: p.grossUnitOfWeight, WholesalePrice: p.wholesalePrice||null,
              })),
            }], null, 2)}</div>
            <div style={{display:"flex",gap:8}}>
              <button className="metrc-btn primary" onClick={confirmPushManifest} disabled={!connected}>Confirm & Send</button>
              <button className="metrc-btn secondary" onClick={()=>setManifestPreview(null)}>Cancel</button>
            </div>
            {!connected && <div style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>Test the connection first — see Connection Settings above.</div>}
          </div>
        </div>
      )}
    </>
  );
}
