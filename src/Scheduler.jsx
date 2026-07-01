import { useState, useEffect, useRef } from "react";

const ROOTING   = 14;
const DRYING    = 12;
const TESTING   = 10;
const PACKAGING =  9;
const PX        = 12;
const LW        = 280;
const RH        = 100;
const HH        = 56;

const PHASES = [
  { name: "Clone",        bg: "#1a4a28", text: "#7ee89a" },
  { name: "Veg",          bg: "#145c28", text: "#96f0aa" },
  { name: "Flower",       bg: "#603808", text: "#ffc050" },
  { name: "Post-harvest", bg: "#0c1e52", text: "#7ab8ff" },
];

const MS = [
  { k: "cut",  ab: "CUT", la: "Cut clones",             co: "#3ab85a", alt: 0 },
  { k: "tx",   ab: "TX",  la: "Transplant to veg",      co: "#28a050", alt: 1 },
  { k: "fl",   ab: "FL",  la: "Flip to flower",         co: "#d08800", alt: 0 },
  { k: "d1",   ab: "D1",  la: "1st defoliation",        co: "#b87010", alt: 1 },
  { k: "d2",   ab: "D2",  la: "2nd defoliation",        co: "#a86010", alt: 0 },
  { k: "fd",   ab: "FD",  la: "Fade begins",            co: "#906010", alt: 1 },
  { k: "ph",   ab: "PH",  la: "Pre-harv defol + flush", co: "#7c4a10", alt: 0 },
  { k: "hv",   ab: "HV",  la: "Harvest",                co: "#cc3030", alt: 1 },
  { k: "dr",   ab: "DR",  la: "Dry complete",           co: "#2860cc", alt: 0 },
  { k: "ts",   ab: "TS",  la: "Testing sent",           co: "#6040cc", alt: 1 },
  { k: "pk",   ab: "PK",  la: "Package + results",      co: "#3870cc", alt: 0 },
  { k: "inv",  ab: "IN",  la: "Live inventory",         co: "#1888a0", alt: 1 },
];

function dAdd(dt, n) { const r = new Date(dt); r.setDate(r.getDate() + n); return r; }
function dDiff(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function fmtShort(dt) { return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function fmtFull(dt)  { return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function fmtISO(dt)   { return new Date(dt).toISOString().split("T")[0]; }
function cloneTarget(n) { return Math.ceil(n * 1.1); }

function getSched(sp) {
  const s   = new Date(sp.d + "T12:00:00");
  const tx  = dAdd(s,  ROOTING);
  const fl  = dAdd(tx, sp.veg * 7);
  const hv  = dAdd(fl, sp.flw * 7);
  const dr  = dAdd(hv, DRYING);
  const pk  = dAdd(dr, TESTING);
  const inv = dAdd(pk, PACKAGING);
  return {
    phases: [
      { s, e: tx, ...PHASES[0] },
      { s: tx, e: fl, ...PHASES[1] },
      { s: fl, e: hv, ...PHASES[2] },
      { s: hv, e: inv, ...PHASES[3] },
    ],
    ms: { cut: s, tx, fl, d1: dAdd(fl, 20), d2: dAdd(fl, 42),
          fd: dAdd(hv, -14), ph: dAdd(hv, -3), hv, dr, ts: dr, pk, inv },
    end: inv,
  };
}

const CSS = `
  .sch-wrap { padding: 24px; flex: 1; overflow-y: auto; }
  .sch-outer { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 16px; }
  .sch-row { display: flex; border-bottom: 1px solid var(--border); }
  .sch-row:last-child { border-bottom: none; }
  .sch-left {
    position: sticky; left: 0; z-index: 4;
    width: ${LW}px; min-width: ${LW}px; flex-shrink: 0;
    background: var(--surface); border-right: 1px solid var(--border);
    padding: 10px 14px; display: flex; flex-direction: column;
    justify-content: center; gap: 4px; box-sizing: border-box;
  }
  .sch-tl { position: relative; flex: 1; }
  .sch-pill {
    position: absolute; font-size: 8px; font-weight: 700;
    padding: 2px 4px; border-radius: 3px; color: #fff;
    white-space: nowrap; font-family: 'IBM Plex Mono', monospace;
    line-height: 1.4; cursor: default; letter-spacing: 0.04em;
  }
  .wk-edit {
    width: 36px; font-size: 12px; padding: 2px 4px; text-align: center;
    border-radius: 4px; border: 1px solid var(--border-2);
    background: var(--surface-2); color: var(--text);
    font-family: 'IBM Plex Mono', monospace;
  }
  .wk-edit:focus { outline: none; border-color: var(--accent); }
  .sch-btn {
    border: none; border-radius: 8px; cursor: pointer;
    font-family: 'Inter', sans-serif; font-weight: 600; transition: opacity 0.15s;
  }
  .sch-btn:hover { opacity: 0.85; }
  .sch-btn-primary { background: var(--accent); color: #fff; font-size: 12px; padding: 7px 14px; }
  .sch-btn-secondary { background: var(--surface-2); border: 1px solid var(--border-2) !important; color: var(--text-2); font-size: 12px; padding: 7px 14px; }
  .sch-btn-sm { font-size: 10px; padding: 3px 8px; font-weight: 600; border-radius: 5px; }
  .sch-btn-edit { background: rgba(74,124,89,0.15); color: var(--accent-2); border: 1px solid var(--accent) !important; }
  .sch-btn-del { background: rgba(200,74,74,0.1); color: var(--danger); border: 1px solid rgba(200,74,74,0.3) !important; }
  .sch-input {
    width: 100%; background: var(--surface-2); border: 1px solid var(--border-2);
    border-radius: 8px; color: var(--text); font-family: 'Inter', sans-serif;
    font-size: 13px; padding: 8px 10px; box-sizing: border-box;
  }
  .sch-input:focus { outline: none; border-color: var(--accent); }
  .sch-label { font-size: 11px; color: var(--text-2); display: block; margin-bottom: 4px; }
  .sch-clone-box {
    background: rgba(74,124,89,0.15); border: 1px solid var(--accent);
    border-radius: 8px; padding: 8px 12px; width: 100%; box-sizing: border-box;
  }
  .sch-form-panel {
    background: var(--surface); border: 1px solid var(--border-2);
    border-radius: 10px; padding: 18px; margin-bottom: 20px;
  }
  .sch-space-name {
    font-size: 13px; font-weight: 600; color: var(--text);
    white-space: normal; word-break: break-word; line-height: 1.3;
  }
  .sch-space-strain {
    font-size: 11px; color: var(--text-2);
    white-space: normal; word-break: break-word; line-height: 1.3;
  }
  .sch-export-btn {
    background: var(--surface-2); border: 1px solid var(--border-2);
    border-radius: 8px; color: var(--text-2); font-size: 12px; font-weight: 600;
    padding: 7px 14px; cursor: pointer; font-family: 'Inter', sans-serif;
    display: flex; align-items: center; gap: 6px; transition: border-color 0.15s;
  }
  .sch-export-btn:hover { border-color: var(--accent-2); color: var(--accent-2); }
`;

import { autoPopulateStrains } from "./strainUtils.js";

function totalPlants(sp) { return (sp.strains||[]).reduce((a,s)=>a+(parseInt(s.plants)||0),0) || sp.plants || 0; }
function strainSummary(sp) { return (sp.strains||[]).filter(s=>s.name).map(s=>s.name+" ("+s.plants+")").join(", ") || sp.strain || ""; }
function strainNames(sp) { return (sp.strains||[]).filter(s=>s.name).map(s=>s.name).join(", ") || sp.strain || ""; }

const EMPTY_FORM = { name: "", d: "", veg: "4", flw: "9", strains: [{ id: 1, name: "", plants: "" }], growMapId: "" };

export default function Scheduler() {
  const [spaces, setSpaces] = useState(() => {
    try { return JSON.parse(localStorage.getItem("resinops_spaces") || "[]"); }
    catch { return []; }
  });
  const [growMap, setGrowMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem("resinops_grow_map") || "[]"); }
    catch { return []; }
  });
  const [form, setForm]         = useState(EMPTY_FORM);
  const [formMode, setFormMode] = useState(null); // null | "add" | "edit"
  const [editId, setEditId]     = useState(null);
  const [formErr, setFormErr]   = useState("");

  useEffect(() => {
    localStorage.setItem("resinops_spaces", JSON.stringify(spaces));
  }, [spaces]);

  // Keep a live read of grow map so changes made in GrowMap tab are reflected here
  useEffect(() => {
    function syncGrowMap() {
      try { setGrowMap(JSON.parse(localStorage.getItem("resinops_grow_map") || "[]")); } catch {}
    }
    window.addEventListener("storage", syncGrowMap);
    return () => window.removeEventListener("storage", syncGrowMap);
  }, []);

  // Write a new or updated room back to Grow Map if it doesn't already exist there
  function syncToGrowMap(name, growMapId) {
    const existing = growMap.find(g => g.id === growMapId || g.name === name);
    if (existing) {
      // Update status to active when a batch is scheduled into it
      const updated = growMap.map(g => g.id === existing.id ? { ...g, status: "active" } : g);
      setGrowMap(updated);
      localStorage.setItem("resinops_grow_map", JSON.stringify(updated));
    } else {
      // Create a stub entry so the room appears in Grow Map
      const stub = {
        id: "gm_auto_" + Date.now(), name: name.trim(), type: "Indoor",
        status: "active", sqft: "", canopy: "", maxPlants: "", lightType: "LED",
        lightCount: "", lightWatts: "", resetDays: "7", lastHarvestDate: "",
        sensorId: "", notes: "Auto-created from Cultivation Scheduler",
      };
      const updated = [...growMap, stub];
      setGrowMap(updated);
      localStorage.setItem("resinops_grow_map", JSON.stringify(updated));
    }
  }

  const formTotalPlants = (form.strains||[]).reduce((a,s)=>a+(parseInt(s.plants)||0),0);
  const clones = formTotalPlants > 0 ? cloneTarget(formTotalPlants) : null;
  function setStrainField(i, k, v) { setForm(f => ({ ...f, strains: f.strains.map((s,idx)=>idx===i?{...s,[k]:v}:s) })); }
  function addStrainRow() { setForm(f => ({ ...f, strains: [...f.strains, { id: Date.now(), name: "", plants: "" }] })); }
  function removeStrainRow(i) { setForm(f => ({ ...f, strains: f.strains.filter((_,idx)=>idx!==i) })); }

  function openAdd() {
    const today = new Date().toISOString().split("T")[0];
    setForm({ ...EMPTY_FORM, d: today, strains: [{ id: Date.now(), name: "", plants: "" }], growMapId: "" });
    setFormMode("add");
    setFormErr("");
  }

  function openEdit(sp) {
    const strains = (sp.strains&&sp.strains.length) ? sp.strains.map(s=>({id:s.id,name:s.name,plants:String(s.plants)})) : [{ id: Date.now(), name: sp.strain||"", plants: String(sp.plants||"") }];
    setForm({ name: sp.name, d: sp.d, veg: String(sp.veg), flw: String(sp.flw), strains, growMapId: sp.growMapId||"" });
    setEditId(sp.id);
    setFormMode("edit");
    setFormErr("");
  }

  function closeForm() { setFormMode(null); setEditId(null); setFormErr(""); }

  function validateForm() {
    if (!form.name.trim())   { setFormErr("Enter a space name."); return false; }
    if (!form.d)             { setFormErr("Select a clone cut date."); return false; }
    const validStrains = (form.strains||[]).filter(s=>s.name.trim() && parseInt(s.plants)>0);
    if (!validStrains.length){ setFormErr("Add at least one strain with a plant count."); return false; }
    return true;
  }

  function saveAdd() {
    if (!validateForm()) return;
    const veg = Math.max(1, Math.min(24, parseInt(form.veg) || 4));
    const flw = Math.max(1, Math.min(24, parseInt(form.flw) || 9));
    const strains = form.strains.filter(s=>s.name.trim()&&parseInt(s.plants)>0).map(s=>({id:s.id,name:s.name.trim(),plants:parseInt(s.plants)}));
    const totalP = strains.reduce((a,s)=>a+s.plants,0);
    setSpaces(prev => [...prev, {
      id: Date.now(), name: form.name.trim(), strains, strain: strains.map(s=>s.name).join(", "),
      d: form.d, plants: totalP, veg, flw, harvested: false, growMapId: form.growMapId||""
    }]);
    autoPopulateStrains(strains.map(s => s.name), { source: "Cultivation Scheduler" });
    syncToGrowMap(form.name.trim(), form.growMapId);
    closeForm();
  }

  function saveEdit() {
    if (!validateForm()) return;
    const veg = Math.max(1, Math.min(24, parseInt(form.veg) || 4));
    const flw = Math.max(1, Math.min(24, parseInt(form.flw) || 9));
    const strains = form.strains.filter(s=>s.name.trim()&&parseInt(s.plants)>0).map(s=>({id:s.id,name:s.name.trim(),plants:parseInt(s.plants)}));
    const totalP = strains.reduce((a,s)=>a+s.plants,0);
    setSpaces(prev => prev.map(sp => sp.id === editId
      ? { ...sp, name: form.name.trim(), strains, strain: strains.map(s=>s.name).join(", "),
          d: form.d, plants: totalP, veg, flw, growMapId: form.growMapId||"" }
      : sp
    ));
    autoPopulateStrains(strains.map(s => s.name), { source: "Cultivation Scheduler" });
    syncToGrowMap(form.name.trim(), form.growMapId);
    closeForm();
  }

  function updateWks(id, field, val) {
    const n = Math.max(1, Math.min(24, parseInt(val) || 1));
    setSpaces(prev => prev.map(sp => sp.id === id ? { ...sp, [field]: n } : sp));
  }

  function removeSpace(id) { setSpaces(prev => prev.filter(sp => sp.id !== id)); }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportScheduler() {
    if (spaces.length === 0) return;
    const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const spaceRows = spaces.map(sp => {
      const sc = getSched(sp);
      const msRows = MS.map(m => {
        const dt = sc.ms[m.k];
        return '<tr><td style="padding:5px 12px 5px 0;color:#555;font-size:13px;white-space:nowrap;">'
          + m.la + '</td><td style="padding:5px 0;font-size:13px;font-weight:600;color:#1a1a1a;white-space:nowrap;">'
          + fmtFull(dt) + '</td></tr>';
      }).join("");

      const phaseRows = sc.phases.map(ph => {
        const days = dDiff(ph.s, ph.e);
        return '<tr><td style="padding:4px 12px 4px 0;color:#555;font-size:13px;">' + ph.name
          + '</td><td style="padding:4px 0;font-size:13px;">' + fmtFull(ph.s)
          + ' → ' + fmtFull(ph.e)
          + ' (' + days + ' days)</td></tr>';
      }).join("");

      return '<div style="margin-bottom:36px;page-break-inside:avoid;">'
        + '<div style="background:#f6faf7;border-left:4px solid #2d5a3d;padding:12px 16px;margin-bottom:14px;border-radius:0 6px 6px 0;">'
        + '<h2 style="font-size:17px;font-weight:700;color:#1a1a1a;margin:0 0 2px;">' + sp.name + '</h2>'
        + '<p style="font-size:13px;color:#444;margin:0;">' + strainSummary(sp)
        + ' &nbsp;·&nbsp; ' + sp.plants + ' plants &nbsp;·&nbsp; ' + cloneTarget(sp.plants) + ' clones'
        + ' &nbsp;·&nbsp; ' + sp.veg + ' wk veg / ' + sp.flw + ' wk flower</p>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">'
        + '<div><h3 style="font-size:12px;font-weight:700;color:#2d5a3d;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Milestones</h3>'
        + '<table style="border-collapse:collapse;">' + msRows + '</table></div>'
        + '<div><h3 style="font-size:12px;font-weight:700;color:#2d5a3d;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Phase summary</h3>'
        + '<table style="border-collapse:collapse;">' + phaseRows + '</table></div>'
        + '</div></div>';
    }).join('<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">');

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
      + '<title>ResinOps Cultivation Schedule — ' + date + '</title>'
      + '<style>body{font-family:Arial,sans-serif;max-width:900px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.6;}'
      + 'h1{font-size:22px;color:#2d5a3d;margin:0 0 4px;}'
      + '.meta{font-size:13px;color:#666;margin-bottom:32px;padding-bottom:14px;border-bottom:2px solid #e0e0e0;}'
      + '@media print{body{margin:24px;}@page{margin:2cm;}}</style>'
      + '</head><body>'
      + '<h1>ResinOps — Cultivation Schedule</h1>'
      + '<div class="meta">Exported ' + date + ' &nbsp;·&nbsp; ' + spaces.length + ' grow space' + (spaces.length > 1 ? 's' : '')
      + '<br><small>To save as PDF: Ctrl+P → Save as PDF &nbsp;|&nbsp; To open in Word: File → Open this .html file</small></div>'
      + spaceRows
      + '</body></html>';

    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "ResinOps-Schedule-" + new Date().toISOString().slice(0, 10) + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Gantt render ──────────────────────────────────────────────────────────
  const scheds     = spaces.map(getSched);
  const hasSpaces  = spaces.length > 0;
  let gStart, total, twPx, todayOff, months, weeks;

  if (hasSpaces) {
    gStart   = new Date(Math.min(...scheds.map(sc => sc.phases[0].s)));
    const gEnd = new Date(Math.max(...scheds.map(sc => sc.end)));
    total    = dDiff(gStart, gEnd) + 12;
    twPx     = total * PX;
    todayOff = dDiff(gStart, new Date());

    months = [];
    let mo = "", moX = 0;
    for (let day = 0; day <= total; day++) {
      const ml = dAdd(gStart, day).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (ml !== mo) {
        if (mo) months.push({ label: mo, x: moX, w: day * PX - moX });
        mo = ml; moX = day * PX;
      }
    }
    months.push({ label: mo, x: moX, w: total * PX - moX });

    weeks = [];
    for (let day = 0; day <= total; day += 7)
      weeks.push({ x: day * PX, wn: Math.floor(day / 7) + 1, date: fmtShort(dAdd(gStart, day)) });
  }



  return (
    <>
      <style>{CSS}</style>
      <div className="sch-wrap">

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", marginBottom: "3px" }}>Cultivation Scheduler</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Clone cut to live inventory — every milestone tracked</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {hasSpaces && (
              <button className="sch-export-btn" onClick={exportScheduler}>
                ↓ Export schedule
              </button>
            )}
            {!formMode && (
              <button className="sch-btn sch-btn-primary" onClick={openAdd}>+ Add Grow Space</button>
            )}
          </div>
        </div>

        {/* Form panel — inlined to prevent React unmounting on re-render */}
        {formMode && (
      <div className="sch-form-panel">
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: "14px" }}>
          {formMode === "edit" ? "Edit Grow Space" : "New Grow Space"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label className="sch-label">Space — select from Grow Map or type new</label>
            {growMap.length > 0 ? (
              <>
                <select className="sch-input" style={{cursor:"pointer",marginBottom:6}}
                  value={form.growMapId}
                  onChange={e => {
                    const gm = growMap.find(g => g.id === e.target.value);
                    setForm(f => ({ ...f, growMapId: e.target.value, name: gm ? gm.name : f.name }));
                  }}>
                  <option value="">— Select existing room —</option>
                  {growMap.map(g => <option key={g.id} value={g.id}>{g.name} ({g.type}){g.status==="active"?" 🌱":g.status==="cleaning"?" 🧹":""}</option>)}
                </select>
                <input className="sch-input" placeholder="Or type a new space name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value, growMapId: "" }))} />
              </>
            ) : (
              <>
                <input className="sch-input" placeholder="Indoor Room 1"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <div style={{fontSize:10,color:"var(--text-3)",marginTop:3}}>Add rooms to the Grow Map tab to select from a dropdown here</div>
              </>
            )}
          </div>
          <div>
            <label className="sch-label">Clone cut date</label>
            <input type="date" className="sch-input"
              value={form.d} onChange={e => setForm(f => ({ ...f, d: e.target.value }))} />
          </div>
        </div>

        <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "12px 14px", margin: "12px 0" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
            Strains in this space — {formTotalPlants} total plants
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {form.strains.map((s, i) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
                <input className="sch-input" placeholder="Blue Dream" value={s.name}
                  onChange={e => setStrainField(i, "name", e.target.value)} />
                <input type="number" min="1" className="sch-input" placeholder="Plants"
                  value={s.plants} onChange={e => setStrainField(i, "plants", e.target.value)} />
                {form.strains.length > 1 && (
                  <button type="button" className="sch-icon-btn" onClick={() => removeStrainRow(i)}
                    style={{ background: "rgba(200,74,74,0.1)", border: "1px solid rgba(200,74,74,0.3)", color: "var(--danger)", borderRadius: 6, padding: "0 10px", cursor: "pointer" }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="sch-add-strain-btn" onClick={addStrainRow}
            style={{ marginTop: 8, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "var(--accent-2)", cursor: "pointer", fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>
            + Add another strain to this space
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div>
              <label className="sch-label">Veg weeks</label>
              <input type="number" min="1" max="24" className="sch-input"
                value={form.veg} onChange={e => setForm(f => ({ ...f, veg: e.target.value }))} />
            </div>
            <div>
              <label className="sch-label">Flower weeks</label>
              <input type="number" min="1" max="24" className="sch-input"
                value={form.flw} onChange={e => setForm(f => ({ ...f, flw: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            {clones ? (
              <div className="sch-clone-box">
                <div style={{ fontSize: "10px", color: "var(--accent-2)", fontWeight: 600, marginBottom: "2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Clone Target</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--accent-2)", lineHeight: 1.1 }}>{clones}</div>
                <div style={{ fontSize: "10px", color: "var(--text-2)", marginTop: "2px" }}>{formTotalPlants} plants + 10% buffer</div>
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Enter plant count to see clone target</div>
            )}
          </div>
        </div>
        {formErr && <div style={{ fontSize: "12px", color: "var(--danger)", marginTop: "8px" }}>{formErr}</div>}
        <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
          <button className="sch-btn sch-btn-primary"
            onClick={formMode === "edit" ? saveEdit : saveAdd}>
            {formMode === "edit" ? "Save Changes" : "Add Space"}
          </button>
          <button className="sch-btn sch-btn-secondary" onClick={closeForm}>Cancel</button>
        </div>
      </div>
        )}

        {/* Empty state */}
        {!hasSpaces && !formMode && (
          <div style={{ border: "1px dashed var(--border-2)", borderRadius: "10px", padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "10px" }}>📅</div>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-2)", marginBottom: "4px" }}>No grow spaces yet</div>
            <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Add a grow space to map the full cultivation timeline</div>
          </div>
        )}

        {/* Gantt chart */}
        {hasSpaces && (
          <>
            <div className="sch-outer">

              {/* Header row */}
              <div className="sch-row" style={{ height: HH, background: "var(--surface-2)" }}>
                <div className="sch-left" style={{ height: HH, background: "var(--surface-2)", justifyContent: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Grow Space</span>
                </div>
                <div className="sch-tl" style={{ minWidth: twPx, height: HH, overflow: "hidden" }}>
                  {months.map((m, i) => (
                    <div key={i} style={{ position: "absolute", left: m.x, top: 0, width: m.w, height: 24,
                      borderRight: "1px solid var(--border)", padding: "0 8px",
                      display: "flex", alignItems: "center", overflow: "hidden" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>{m.label}</span>
                    </div>
                  ))}
                  {weeks.map((w, i) => (
                    <div key={i} style={{ position: "absolute", left: w.x, top: 24, bottom: 0,
                      borderLeft: "1px solid var(--border)", paddingLeft: 4,
                      display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-3)", lineHeight: 1.2 }}>W{w.wn}</div>
                      <div style={{ fontSize: "9px", color: "var(--text-3)", lineHeight: 1.2 }}>{w.date}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Space rows */}
              {spaces.map((sp, idx) => {
                const sc = scheds[idx];
                return (
                  <div key={sp.id} className="sch-row" style={{ height: RH }}>

                    {/* Left cell */}
                    <div className="sch-left" style={{ height: RH }}>
                      <div className="sch-space-name">{sp.name}</div>
                      <div className="sch-space-strain">{strainSummary(sp)}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "1px" }}>
                        {sp.plants} plants · {cloneTarget(sp.plants)} clones
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "5px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "10px", color: "var(--text-3)" }}>Veg</span>
                        <input className="wk-edit" type="number" value={sp.veg} min="1" max="24"
                          onChange={e => updateWks(sp.id, "veg", e.target.value)} />
                        <span style={{ fontSize: "10px", color: "var(--text-3)" }}>Flw</span>
                        <input className="wk-edit" type="number" value={sp.flw} min="1" max="24"
                          onChange={e => updateWks(sp.id, "flw", e.target.value)} />
                        <button className="sch-btn sch-btn-sm sch-btn-edit" onClick={() => openEdit(sp)}>Edit</button>
                        <button className="sch-btn sch-btn-sm sch-btn-del" onClick={() => removeSpace(sp.id)}>✕</button>
                      </div>
                    </div>

                    {/* Timeline cell */}
                    <div className="sch-tl" style={{ minWidth: twPx, height: RH }}>
                      {weeks.map((w, i) => (
                        <div key={i} style={{ position: "absolute", left: w.x, top: 0, bottom: 0,
                          width: 1, background: "var(--border)", opacity: 0.4 }} />
                      ))}

                      {/* Phase bars */}
                      {sc.phases.map((ph, i) => {
                        const x = dDiff(gStart, ph.s) * PX;
                        const w = Math.max(dDiff(ph.s, ph.e) * PX, 2);
                        return (
                          <div key={i} style={{ position: "absolute", left: x, top: 14, width: w,
                            height: RH - 28, background: ph.bg, borderRadius: 5,
                            display: "flex", alignItems: "center", padding: "0 10px", overflow: "hidden" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: ph.text, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>{ph.name}</span>
                          </div>
                        );
                      })}

                      {/* Milestone markers */}
                      {MS.map(m => {
                        const dt = sc.ms[m.k];
                        if (!dt) return null;
                        const x    = dDiff(gStart, dt) * PX;
                        const topY = m.alt === 0 ? 2 : RH - 18;
                        return (
                          <div key={m.k} title={m.la + " — " + fmtFull(dt)}
                            style={{ position: "absolute", left: x, top: 0, width: 1, height: RH, zIndex: 2 }}>
                            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 1, background: m.co, opacity: 0.9 }} />
                            <div className="sch-pill" style={{ position: "absolute", left: 2, top: topY, background: m.co }}>{m.ab}</div>
                          </div>
                        );
                      })}

                      {/* Today line */}
                      {todayOff >= 0 && todayOff <= total && (
                        <div style={{ position: "absolute", left: todayOff * PX, top: 0, bottom: 0,
                          width: 2, background: "var(--danger)", zIndex: 3, opacity: 0.9 }} title="Today" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", marginBottom: "8px" }}>
              {MS.map(m => (
                <div key={m.k} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ background: m.co, color: "#fff", fontSize: "8px", fontWeight: 700,
                    padding: "2px 5px", borderRadius: 3, fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.04em" }}>{m.ab}</div>
                  <span style={{ fontSize: "11px", color: "var(--text-2)" }}>{m.la}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
              {PHASES.map((ph, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ width: 16, height: 11, borderRadius: 2, background: ph.bg, border: "1px solid rgba(255,255,255,0.12)" }} />
                  <span style={{ fontSize: "11px", color: "var(--text-2)" }}>{ph.name}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: 2, height: 14, background: "var(--danger)", borderRadius: 1 }} />
                <span style={{ fontSize: "11px", color: "var(--text-2)" }}>Today</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
