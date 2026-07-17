import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { autoPopulateStrains } from "./strainUtils.js";
import StrainCombo from "./StrainCombo.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const TC_STAGES = [
  { id:"explant",      label:"Explant Selection",     short:"Explant",   color:"#7090f0", media:"None / Pre-sterilization" },
  { id:"stage1",       label:"Stage 1 — Establishment", short:"S1",      color:"#9060d0", media:"Athena Shoots (or MS + BAP 0.5mg/L)" },
  { id:"stage2",       label:"Stage 2 — Multiplication", short:"S2",     color:"#b050b0", media:"Athena Shoots (or MS + BAP 1.0–2.0mg/L)" },
  { id:"stage3",       label:"Stage 3 — Rooting",     short:"S3",        color:"#50a070", media:"Athena Roots (or MS + IBA 0.5–1.0mg/L, no BAP)" },
  { id:"acclim",       label:"Acclimatization",        short:"Acclim",   color:"#80a030", media:"Soil / soilless mix, humidity dome" },
  { id:"transferred",  label:"Transferred to Mother Room", short:"Done", color:"#40a050", media:"—" },
  { id:"failed",       label:"Failed / Discarded",    short:"Failed",    color:"#c04040", media:"—" },
];

const CONTAM_TYPES = ["Bacterial (cloudy media)","Fungal — white/grey (Aspergillus/Penicillium)","Fungal — black (Cladosporium/Alternaria)","Viral / HLV suspected","Unknown contamination"];
const MEDIA_BASES  = ["Athena Shoots","Athena Roots","MS (Murashige & Skoog)","WPM (Woody Plant Medium)","Custom"];
const HEALTH_OPTS  = ["Excellent","Good","Fair","Poor — consider discard"];

function fmtD(dt){ return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"; }
function daysAgo(dt){ return dt?Math.round((new Date()-new Date(dt))/86400000):null; }
function daysIn(stage, vessel){ return vessel.stageDate ? daysAgo(vessel.stageDate) : null; }

const CSS = `
  .tc-wrap{padding:24px;flex:1;overflow-y:auto;}
  .tc-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .tc-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .tc-inp:focus{outline:none;border-color:var(--accent);}
  .tc-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .tc-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .tc-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .tc-btn:hover{opacity:0.85;}
  .tc-primary{background:var(--accent);color:#fff;}
  .tc-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .tc-danger{background:rgba(200,74,74,0.12);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .tc-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .tc-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .tc-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .tc-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .tc-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .tc-stat{background:var(--surface-2);border-radius:8px;padding:10px 14px;text-align:center;}
  .tc-stat-v{font-size:22px;font-weight:700;color:var(--accent-2);}
  .tc-stat-l{font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;}
  .tc-vessel{background:var(--surface);border:1px solid var(--border-2);border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;}
  .tc-vessel:hover{border-color:var(--accent);}
  .tc-vessel.contaminated{border-color:var(--danger);background:rgba(200,74,74,0.03);}
  .tc-vessel.failed{opacity:0.5;}
  .tc-stage-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;color:#fff;}
  .tc-pipeline{display:flex;gap:4px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px;}
  .tc-pipe-step{flex:0 0 auto;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid var(--border-2);cursor:pointer;white-space:nowrap;transition:all 0.15s;}
  .tc-pipe-step.active{border-color:var(--accent);background:rgba(74,124,89,0.12);color:var(--accent-2);}
  .tc-media-box{background:rgba(90,63,160,0.06);border:1px solid rgba(90,63,160,0.2);border-radius:8px;padding:8px 12px;font-size:11px;color:var(--text-2);margin-bottom:10px;}
  .tc-warn{background:rgba(200,74,74,0.08);border:1px solid rgba(200,74,74,0.25);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--danger);margin-bottom:10px;}
  .tc-success{background:rgba(74,124,89,0.08);border:1px solid rgba(74,124,89,0.25);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--accent-2);margin-bottom:10px;}
  .tc-tab{padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:'Inter',sans-serif;}
  .tc-tab.active{background:var(--accent);color:#fff;}
  .tc-tab:not(.active){background:var(--surface-2);color:var(--text-2);}
  .tc-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .tc-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .tc-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .tc-hlv-warn{background:rgba(200,74,74,0.12);border:1px solid rgba(200,74,74,0.3);border-radius:8px;padding:10px 14px;margin-bottom:12px;}
`;

// ── Empty templates ───────────────────────────────────────────────────────────

const EMPTY_ACCESSION = {
  id:"", strainName:"", sourceType:"mother_plant", sourceId:"",
  initiatedDate: new Date().toISOString().split("T")[0],
  initiatedBy:"", purpose:"preservation",
  hlvStatus:"unknown", notes:"", status:"active",
};

const EMPTY_VESSEL = {
  id:"", accessionId:"", label:"",
  stage:"explant", stageDate: new Date().toISOString().split("T")[0],
  mediaBase:"Athena Shoots", mediaLotNum:"",
  contaminated:false, contamType:"", contamDate:"",
  health:"Good", transferCount:0,
  explantDate:"", explantSource:"",
  notes:"", log:[],
};

const EMPTY_MEDIA_FORMULA = {
  id:"", name:"", stage:"stage1",
  base:"Athena Shoots", volume:1000,
  agar:7, ph:5.7,
  pgr1name:"BAP", pgr1mg:0.5,
  pgr2name:"IBA", pgr2mg:0,
  notes:"",
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function TCTracker(){
  const [mothers, setMothers] = useState([]);
  const [allRooms, setAllRooms] = useState([]);

  // State
  const [accessions, setAccessions] = useState([]);
  const [vessels,    setVessels]    = useState([]);
  const [formulas,   setFormulas]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [acc, vsl, frm, mom, sp, gm] = await Promise.all([
          db.tc_accessions.list(),
          db.tc_vessels.list(),
          db.tc_formulas.list(),
          db.mother_plants.list(),
          db.grow_spaces.list(),
          db.grow_rooms.list(),
        ]);
        setAccessions(acc);
        setVessels(vsl);
        setFormulas(frm);
        setMothers(mom);
        setAllRooms([...sp, ...gm.filter(g=>!sp.some(s=>s.name===g.name))]);
      }catch(e){ console.error("TCTracker load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const [tab,           setTab]           = useState("vessels");
  const [stageFilter,   setStageFilter]   = useState("all");
  const [accForm,       setAccForm]       = useState(null);
  const [vesselForm,    setVesselForm]    = useState(null);
  const [formulaForm,   setFormulaForm]   = useState(null);
  const [selectedAcc,   setSelectedAcc]   = useState(null);
  const [transferModal, setTransferModal] = useState(null); // vessel being transferred
  const [transferDest,  setTransferDest]  = useState({roomId:"", plantCount:1, notes:""});
  const [err, setErr] = useState("");

  const setAF = (k,v) => setAccForm(f=>({...f,[k]:v}));
  const setVF = (k,v) => setVesselForm(f=>({...f,[k]:v}));
  const setFF = (k,v) => setFormulaForm(f=>({...f,[k]:v}));

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeVessels  = vessels.filter(v=>v.stage!=="failed"&&v.stage!=="transferred");
  const contamVessels  = vessels.filter(v=>v.contaminated&&v.stage!=="failed");
  const hlvSuspected   = accessions.filter(a=>a.hlvStatus==="suspected"||a.hlvStatus==="confirmed");
  const readyToTransfer= vessels.filter(v=>v.stage==="acclim");
  const contamRate     = vessels.length>0 ? Math.round((vessels.filter(v=>v.contaminated).length/vessels.length)*100) : 0;

  // ── Accession save ─────────────────────────────────────────────────────────
  async function saveAccession(){
    if(!accForm.strainName){ setErr("Strain name is required."); return; }
    const rec = {...accForm, id: accForm.id||crypto.randomUUID()};
    try{
      const saved = await db.tc_accessions.upsert(rec);
      if(accForm.id) setAccessions(p=>p.map(a=>a.id===saved.id?saved:a));
      else setAccessions(p=>[...p,saved]);
      autoPopulateStrains(accForm.strainName, {source:"TC Tracker"});
      setAccForm(null); setErr("");
    }catch(e){ console.error("Accession save failed:",e); setErr("Save failed: "+e.message); }
  }

  // ── Vessel save ────────────────────────────────────────────────────────────
  async function saveVessel(){
    if(!vesselForm.accessionId){ setErr("Link this vessel to an accession (strain)."); return; }
    if(!vesselForm.label){ setErr("Enter a vessel label / ID."); return; }
    const rec = {
      ...vesselForm,
      id: vesselForm.id||crypto.randomUUID(),
      log: vesselForm.log||[],
    };
    // Add log entry for new stage if changed
    if(!vesselForm.id || vesselForm._stageChanged){
      rec.log = [...(rec.log||[]), {
        date: new Date().toISOString().split("T")[0],
        event: vesselForm.id?"stage_change":"created",
        stage: rec.stage,
        notes: vesselForm._stageNote||"",
        by: vesselForm._loggedBy||"",
      }];
    }
    try{
      const saved = await db.tc_vessels.upsert(rec);
      if(vesselForm.id) setVessels(p=>p.map(v=>v.id===saved.id?saved:v));
      else setVessels(p=>[...p,saved]);
      setVesselForm(null); setErr("");
    }catch(e){ console.error("Vessel save failed:",e); setErr("Save failed: "+e.message); }
  }

  // ── Mark contaminated ──────────────────────────────────────────────────────
  async function markContaminated(vessel, contamType){
    const updated = {...vessel,
      contaminated:true, contamType,
      contamDate: new Date().toISOString().split("T")[0],
      log:[...(vessel.log||[]),{
        date: new Date().toISOString().split("T")[0],
        event:"contamination",
        stage:vessel.stage,
        notes:"Contamination: "+contamType,
      }],
    };
    try{
      const saved = await db.tc_vessels.upsert(updated);
      setVessels(p=>p.map(v=>v.id===vessel.id?saved:v));
    }catch(e){ console.error("Contamination flag save failed:",e); }
  }

  // ── Advance stage ──────────────────────────────────────────────────────────
  async function advanceStage(vessel){
    const stages = TC_STAGES.map(s=>s.id);
    const activeStages = stages.filter(s=>s!=="failed"&&s!=="transferred");
    const idx = activeStages.indexOf(vessel.stage);
    if(idx>=activeStages.length-1) return;
    const nextStage = activeStages[idx+1];
    const updated = {...vessel,
      stage: nextStage,
      stageDate: new Date().toISOString().split("T")[0],
      transferCount: (vessel.transferCount||0)+1,
      log:[...(vessel.log||[]),{
        date: new Date().toISOString().split("T")[0],
        event:"stage_advance",
        stage:nextStage,
        notes:"Advanced to "+TC_STAGES.find(s=>s.id===nextStage)?.label,
      }],
    };
    try{
      const saved = await db.tc_vessels.upsert(updated);
      setVessels(p=>p.map(v=>v.id===vessel.id?saved:v));
    }catch(e){ console.error("Stage advance save failed:",e); }
  }

  // ── Transfer to Mother Room ────────────────────────────────────────────────
  async function confirmTransfer(){
    if(!transferDest.roomId){ setErr("Select the destination room."); return; }
    const vessel = transferModal;
    const accession = accessions.find(a=>a.id===vessel.accessionId);

    const updatedVessel = {...vessel,
      stage:"transferred",
      stageDate: new Date().toISOString().split("T")[0],
      log:[...(vessel.log||[]),{
        date: new Date().toISOString().split("T")[0],
        event:"transferred",
        stage:"transferred",
        notes:"Transferred to mother room. "+transferDest.notes,
      }],
    };
    const newMom = {
      id: crypto.randomUUID(),
      strainName: accession?.strainName||"Unknown",
      roomId: transferDest.roomId,
      plantCount: parseInt(transferDest.plantCount)||1,
      introducedDate: new Date().toISOString().split("T")[0],
      cycleWeeks: 9,
      cutsPerPlantPerCycle: 8,
      status: "acclimating",
      notes: "TC-originated (vessel "+vessel.label+"). In acclimation dome — not ready for cuts yet. "+transferDest.notes,
      cutLog:[],
    };
    try{
      const [savedVessel, savedMom] = await Promise.all([
        db.tc_vessels.upsert(updatedVessel),
        db.mother_plants.upsert(newMom),
      ]);
      setVessels(p=>p.map(v=>v.id===vessel.id?savedVessel:v));
      setMothers(p=>[...p,savedMom]);
      setTransferModal(null);
      setTransferDest({roomId:"", plantCount:1, notes:""});
      setErr("");
    }catch(e){ console.error("Transfer save failed:",e); setErr("Transfer failed: "+e.message); }
  }

  // ── Formula save ───────────────────────────────────────────────────────────
  async function saveFormula(){
    if(!formulaForm.name){ setErr("Formula name is required."); return; }
    const rec = {...formulaForm, id: formulaForm.id||crypto.randomUUID()};
    try{
      const saved = await db.tc_formulas.upsert(rec);
      if(formulaForm.id) setFormulas(p=>p.map(f=>f.id===saved.id?saved:f));
      else setFormulas(p=>[...p,saved]);
      setFormulaForm(null); setErr("");
    }catch(e){ console.error("Formula save failed:",e); setErr("Save failed: "+e.message); }
  }

  // ── Filtered vessels ───────────────────────────────────────────────────────
  const displayVessels = vessels.filter(v=>{
    if(stageFilter==="all") return v.stage!=="failed"&&v.stage!=="transferred";
    if(stageFilter==="failed") return v.stage==="failed";
    if(stageFilter==="transferred") return v.stage==="transferred";
    if(stageFilter==="contaminated") return v.contaminated&&v.stage!=="failed";
    return v.stage===stageFilter;
  }).sort((a,b)=>new Date(b.stageDate)-new Date(a.stageDate));

  const stageInfo = (id) => TC_STAGES.find(s=>s.id===id)||TC_STAGES[0];

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading TC Tracker…</div>);

  return(
    <>
      <style>{CSS}</style>
      <div className="tc-wrap">

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
              <div style={{fontSize:16,fontWeight:600,color:"var(--text)"}}>TC Tracker</div>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(90,63,160,0.15)",color:"#9080f0"}}>TISSUE CULTURE</span>
            </div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Explant to acclimatization — vessel tracking, contamination logging, and mother room transfer</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="tc-btn tc-secondary" onClick={()=>setFormulaForm({...EMPTY_MEDIA_FORMULA})}>+ Media formula</button>
            <button className="tc-btn tc-secondary" onClick={()=>setAccForm({...EMPTY_ACCESSION})}>+ Accession</button>
            <button className="tc-btn tc-primary" onClick={()=>setVesselForm({...EMPTY_VESSEL})}>+ New vessel</button>
          </div>
        </div>

        {/* Stats */}
        {!accForm&&!vesselForm&&!formulaForm&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
            <div className="tc-stat"><div className="tc-stat-v">{activeVessels.length}</div><div className="tc-stat-l">Active vessels</div></div>
            <div className="tc-stat"><div className="tc-stat-v" style={{color:contamVessels.length>0?"var(--danger)":"var(--accent-2)"}}>{contamVessels.length}</div><div className="tc-stat-l">Contaminated</div></div>
            <div className="tc-stat"><div className="tc-stat-v">{contamRate}%</div><div className="tc-stat-l">Contam rate</div></div>
            <div className="tc-stat"><div className="tc-stat-v" style={{color:readyToTransfer.length>0?"var(--amber)":"var(--accent-2)"}}>{readyToTransfer.length}</div><div className="tc-stat-l">Ready to transfer</div></div>
            <div className="tc-stat"><div className="tc-stat-v" style={{color:hlvSuspected.length>0?"var(--danger)":"var(--accent-2)"}}>{hlvSuspected.length}</div><div className="tc-stat-l">HLV suspect/confirmed</div></div>
          </div>
        )}

        {/* HLV warning */}
        {hlvSuspected.length>0&&!accForm&&!vesselForm&&(
          <div className="tc-hlv-warn">
            <div style={{fontWeight:700,fontSize:12,color:"var(--danger)",marginBottom:4}}>⚠ HLV ALERT — {hlvSuspected.length} accession{hlvSuspected.length!==1?"s":""} with suspected or confirmed Hop Latent Viroid</div>
            {hlvSuspected.map(a=>(
              <div key={a.id} style={{fontSize:11,color:"var(--text-2)",marginLeft:12}}>• {a.strainName} — {a.hlvStatus} — isolate vessels and do not transfer to mother room until cleared</div>
            ))}
          </div>
        )}

        {/* Ready to transfer alert */}
        {readyToTransfer.length>0&&!accForm&&!vesselForm&&(
          <div className="tc-success">
            🌱 <strong>{readyToTransfer.length} vessel{readyToTransfer.length!==1?"s":""} in acclimatization</strong> — ready to transfer to mother room when plants reach clone size
          </div>
        )}

        {/* ── Accession Form ── */}
        {accForm&&(
          <div className="tc-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{accForm.id?"Edit accession":"New TC accession"}</div>
            <div className="tc-box">
              <div className="tc-box-t">Strain & Source</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="tc-lbl">Strain name</label>
                  <StrainCombo className="tc-inp" value={accForm.strainName} onChange={(n)=>setAF("strainName",n)} placeholder="Select or type strain" />
                </div>
                <div><label className="tc-lbl">Source type</label>
                  <select className="tc-sel" value={accForm.sourceType} onChange={e=>setAF("sourceType",e.target.value)}>
                    <option value="mother_plant">Mother plant</option>
                    <option value="flower_plant">Flowering plant</option>
                    <option value="seed">Seed-sourced</option>
                    <option value="external_tc">External TC culture</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div><label className="tc-lbl">Initiated date</label>
                  <input type="date" className="tc-inp" value={accForm.initiatedDate} onChange={e=>setAF("initiatedDate",e.target.value)} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div><label className="tc-lbl">Initiated by</label>
                  <input className="tc-inp" value={accForm.initiatedBy} onChange={e=>setAF("initiatedBy",e.target.value)} placeholder="Technician name" />
                </div>
                <div><label className="tc-lbl">Purpose</label>
                  <select className="tc-sel" value={accForm.purpose} onChange={e=>setAF("purpose",e.target.value)}>
                    <option value="preservation">Genetic preservation</option>
                    <option value="hlv_cleanup">HLV / virus cleanup</option>
                    <option value="multiplication">Rapid multiplication</option>
                    <option value="rejuvenation">Rejuvenation of old genetics</option>
                    <option value="research">Research / pheno development</option>
                  </select>
                </div>
                <div><label className="tc-lbl">HLV status</label>
                  <select className="tc-sel" value={accForm.hlvStatus} onChange={e=>setAF("hlvStatus",e.target.value)}>
                    <option value="unknown">Unknown / not tested</option>
                    <option value="negative">Negative — tested clean</option>
                    <option value="suspected">Suspected — symptoms present</option>
                    <option value="confirmed">Confirmed positive</option>
                    <option value="cleared">Cleared — post-TC clean</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{marginBottom:10}}><label className="tc-lbl">Notes</label>
              <textarea className="tc-inp" rows={2} style={{resize:"vertical"}} value={accForm.notes} onChange={e=>setAF("notes",e.target.value)} />
            </div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="tc-btn tc-primary" onClick={saveAccession}>{accForm.id?"Save":"Create accession"}</button>
              <button className="tc-btn tc-secondary" onClick={()=>{setAccForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Vessel Form ── */}
        {vesselForm&&(
          <div className="tc-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{vesselForm.id?"Edit vessel":"New culture vessel"}</div>

            <div className="tc-box">
              <div className="tc-box-t">Vessel Identity</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="tc-lbl">Accession (strain)</label>
                  <select className="tc-sel" value={vesselForm.accessionId} onChange={e=>setVF("accessionId",e.target.value)}>
                    <option value="">— Select accession —</option>
                    {accessions.filter(a=>a.status==="active").map(a=>(
                      <option key={a.id} value={a.id}>{a.strainName} ({new Date(a.initiatedDate).toLocaleDateString("en-US",{month:"short",year:"numeric"})})</option>
                    ))}
                  </select>
                </div>
                <div><label className="tc-lbl">Vessel label / ID</label>
                  <input className="tc-inp" value={vesselForm.label} onChange={e=>setVF("label",e.target.value)} placeholder="e.g. MH-S1-001" />
                </div>
                <div><label className="tc-lbl">Current stage</label>
                  <select className="tc-sel" value={vesselForm.stage}
                    onChange={e=>setVF("stage",e.target.value)}>
                    {TC_STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div><label className="tc-lbl">Stage date</label>
                  <input type="date" className="tc-inp" value={vesselForm.stageDate} onChange={e=>setVF("stageDate",e.target.value)} />
                </div>
                <div><label className="tc-lbl">Plant health</label>
                  <select className="tc-sel" value={vesselForm.health} onChange={e=>setVF("health",e.target.value)}>
                    {HEALTH_OPTS.map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
                <div><label className="tc-lbl">Transfer / subculture count</label>
                  <input type="number" min="0" className="tc-inp" value={vesselForm.transferCount||0} onChange={e=>setVF("transferCount",parseInt(e.target.value)||0)} />
                </div>
              </div>
            </div>

            <div className="tc-box">
              <div className="tc-box-t">Media</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:8}}>
                <div><label className="tc-lbl">Media base</label>
                  <select className="tc-sel" value={vesselForm.mediaBase} onChange={e=>setVF("mediaBase",e.target.value)}>
                    {MEDIA_BASES.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div><label className="tc-lbl">Media lot / batch #</label>
                  <input className="tc-inp" value={vesselForm.mediaLotNum||""} onChange={e=>setVF("mediaLotNum",e.target.value)} placeholder="e.g. SH-2024-001" />
                </div>
                <div><label className="tc-lbl">Linked formula</label>
                  <select className="tc-sel" value={vesselForm.formulaId||""} onChange={e=>setVF("formulaId",e.target.value)}>
                    <option value="">— None / Athena kit —</option>
                    {formulas.filter(f=>f.stage===vesselForm.stage).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div><label className="tc-lbl">Explant / source date</label>
                  <input type="date" className="tc-inp" value={vesselForm.explantDate||""} onChange={e=>setVF("explantDate",e.target.value)} />
                </div>
              </div>
              <div className="tc-media-box">
                💡 <strong>Recommended for {TC_STAGES.find(s=>s.id===vesselForm.stage)?.label||"this stage"}:</strong> {TC_STAGES.find(s=>s.id===vesselForm.stage)?.media||""}
              </div>
            </div>

            <div className="tc-box">
              <div className="tc-box-t">Contamination</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:16}}>
                  <input type="checkbox" checked={vesselForm.contaminated||false} onChange={e=>setVF("contaminated",e.target.checked)} id="contam-cb" />
                  <label htmlFor="contam-cb" style={{fontSize:12,color:"var(--text-2)",cursor:"pointer"}}>Mark as contaminated</label>
                </div>
                {vesselForm.contaminated&&<>
                  <div><label className="tc-lbl">Contamination type</label>
                    <select className="tc-sel" value={vesselForm.contamType||""} onChange={e=>setVF("contamType",e.target.value)}>
                      <option value="">— Select type —</option>
                      {CONTAM_TYPES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="tc-lbl">Contamination detected</label>
                    <input type="date" className="tc-inp" value={vesselForm.contamDate||""} onChange={e=>setVF("contamDate",e.target.value)} />
                  </div>
                </>}
              </div>
            </div>

            <div style={{marginBottom:10}}><label className="tc-lbl">Notes</label>
              <textarea className="tc-inp" rows={2} style={{resize:"vertical"}} value={vesselForm.notes||""} onChange={e=>setVF("notes",e.target.value)} />
            </div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="tc-btn tc-primary" onClick={saveVessel}>{vesselForm.id?"Save changes":"Create vessel"}</button>
              <button className="tc-btn tc-secondary" onClick={()=>{setVesselForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Media Formula Form ── */}
        {formulaForm&&(
          <div className="tc-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{formulaForm.id?"Edit formula":"New media formula"}</div>
            <div className="tc-box">
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="tc-lbl">Formula name</label>
                  <input className="tc-inp" value={formulaForm.name} onChange={e=>setFF("name",e.target.value)} placeholder="e.g. Stage 1 Shoots — Mango Haze" />
                </div>
                <div><label className="tc-lbl">Stage</label>
                  <select className="tc-sel" value={formulaForm.stage} onChange={e=>setFF("stage",e.target.value)}>
                    {TC_STAGES.filter(s=>!["transferred","failed"].includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="tc-lbl">Media base</label>
                  <select className="tc-sel" value={formulaForm.base} onChange={e=>setFF("base",e.target.value)}>
                    {MEDIA_BASES.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="tc-lbl">Volume per batch (mL)</label>
                  <input type="number" className="tc-inp" value={formulaForm.volume} onChange={e=>setFF("volume",parseFloat(e.target.value)||1000)} />
                </div>
                <div><label className="tc-lbl">Agar concentration (g/L)</label>
                  <input type="number" step="0.1" className="tc-inp" value={formulaForm.agar} onChange={e=>setFF("agar",parseFloat(e.target.value)||7)} />
                </div>
                <div><label className="tc-lbl">Target pH</label>
                  <input type="number" step="0.1" className="tc-inp" value={formulaForm.ph} onChange={e=>setFF("ph",parseFloat(e.target.value)||5.7)} />
                </div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2,fontSize:11,color:"var(--text-3)"}}>
                  pH 5.7–5.8 optimal for most cannabis TC
                </div>
              </div>
              <div className="tc-box-t" style={{marginTop:8}}>Plant Growth Regulators (PGRs)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
                <div><label className="tc-lbl">PGR 1 name</label>
                  <input className="tc-inp" value={formulaForm.pgr1name} onChange={e=>setFF("pgr1name",e.target.value)} placeholder="BAP / 6-BA" />
                </div>
                <div><label className="tc-lbl">PGR 1 concentration (mg/L)</label>
                  <input type="number" step="0.1" className="tc-inp" value={formulaForm.pgr1mg} onChange={e=>setFF("pgr1mg",parseFloat(e.target.value)||0)} />
                </div>
                <div><label className="tc-lbl">PGR 2 name</label>
                  <input className="tc-inp" value={formulaForm.pgr2name} onChange={e=>setFF("pgr2name",e.target.value)} placeholder="IBA / IAA / NAA" />
                </div>
                <div><label className="tc-lbl">PGR 2 concentration (mg/L)</label>
                  <input type="number" step="0.1" className="tc-inp" value={formulaForm.pgr2mg} onChange={e=>setFF("pgr2mg",parseFloat(e.target.value)||0)} />
                </div>
              </div>
              <div style={{marginTop:8,fontSize:11,color:"var(--text-3)",background:"var(--surface)",borderRadius:6,padding:"6px 10px"}}>
                💡 S1/S2: high cytokinin (BAP 0.5–2mg/L), minimal auxin. S3 rooting: high auxin (IBA 0.5–1mg/L), no BAP. pH to 5.7 before autoclaving. Autoclave at 121°C / 15 PSI for 20 min.
              </div>
            </div>
            <div style={{marginTop:10,marginBottom:10}}><label className="tc-lbl">Notes</label>
              <textarea className="tc-inp" rows={2} style={{resize:"vertical"}} value={formulaForm.notes||""} onChange={e=>setFF("notes",e.target.value)} />
            </div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="tc-btn tc-primary" onClick={saveFormula}>{formulaForm.id?"Save":"Create formula"}</button>
              <button className="tc-btn tc-secondary" onClick={()=>{setFormulaForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Transfer modal ── */}
        {transferModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"var(--surface)",borderRadius:12,padding:24,width:420,border:"1px solid var(--border-2)"}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:4}}>Transfer to Mother Room</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16}}>
                Vessel <strong>{transferModal.label}</strong> — {accessions.find(a=>a.id===transferModal.accessionId)?.strainName}
              </div>
              <div style={{marginBottom:10}}>
                <label className="tc-lbl">Destination room</label>
                <select className="tc-sel" value={transferDest.roomId} onChange={e=>setTransferDest(d=>({...d,roomId:e.target.value}))}>
                  <option value="">— Select room —</option>
                  {allRooms.map(r=><option key={r.id} value={r.id}>{r.name} {r.type?"("+r.type+")":""}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}>
                <label className="tc-lbl">Number of plants transferring</label>
                <input type="number" min="1" className="tc-inp" value={transferDest.plantCount} onChange={e=>setTransferDest(d=>({...d,plantCount:e.target.value}))} />
              </div>
              <div style={{marginBottom:12}}>
                <label className="tc-lbl">Notes</label>
                <input className="tc-inp" value={transferDest.notes} onChange={e=>setTransferDest(d=>({...d,notes:e.target.value}))} placeholder="e.g. Plants in dome — check in 3 weeks" />
              </div>
              <div style={{background:"rgba(74,124,89,0.08)",border:"1px solid rgba(74,124,89,0.2)",borderRadius:7,padding:"8px 12px",fontSize:11,color:"var(--text-2)",marginBottom:14}}>
                ✓ An acclimating entry will be created in Mother Plant Manager. Mark it active when plants reach clone size and come off dome.
              </div>
              {err&&<div style={{fontSize:11,color:"var(--danger)",marginBottom:8}}>{err}</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="tc-btn tc-primary" onClick={confirmTransfer}>Confirm transfer</button>
                <button className="tc-btn tc-secondary" onClick={()=>{setTransferModal(null);setErr("");}}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Main vessel/accession view ── */}
        {!accForm&&!vesselForm&&!formulaForm&&(
          <div>
            {/* Tab bar */}
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {["vessels","accessions","formulas"].map(t=>(
                <button key={t} className={"tc-tab"+(tab===t?" active":"")} onClick={()=>setTab(t)}>
                  {t==="vessels"?"Vessels":t==="accessions"?"Accessions":t==="formulas"?"Media Formulas":""}
                  {t==="vessels"&&activeVessels.length>0&&<span style={{marginLeft:6,fontSize:10,background:"rgba(255,255,255,0.2)",padding:"1px 5px",borderRadius:8}}>{activeVessels.length}</span>}
                </button>
              ))}
            </div>

            {/* Vessels tab */}
            {tab==="vessels"&&(
              <>
                {/* Stage pipeline filter */}
                <div className="tc-pipeline">
                  {[{id:"all",label:"All active"},{id:"contaminated",label:"⚠ Contaminated"},...TC_STAGES,].map(s=>(
                    <button key={s.id} className={"tc-pipe-step"+(stageFilter===s.id?" active":"")}
                      onClick={()=>setStageFilter(s.id)}>
                      {s.label||s.id}
                      <span style={{marginLeft:5,opacity:0.7}}>
                        ({s.id==="all"?activeVessels.length:s.id==="contaminated"?contamVessels.length:vessels.filter(v=>v.stage===s.id&&v.stage!=="failed").length})
                      </span>
                    </button>
                  ))}
                </div>

                {displayVessels.length===0&&(
                  <div style={{textAlign:"center",padding:40,color:"var(--text-3)",background:"var(--surface)",borderRadius:10,border:"1px solid var(--border-2)"}}>
                    <div style={{fontSize:28,marginBottom:8}}>🧪</div>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>No vessels in this stage</div>
                    <div style={{fontSize:12}}>Create an accession first, then add vessels to begin tracking</div>
                  </div>
                )}

                {displayVessels.map(vessel=>{
                  const acc = accessions.find(a=>a.id===vessel.accessionId);
                  const stage = stageInfo(vessel.stage);
                  const days = daysIn(vessel.stage, vessel);
                  const isReady = vessel.stage==="acclim";
                  return(
                    <div key={vessel.id} className={"tc-vessel"+(vessel.contaminated?" contaminated":"")+(vessel.stage==="failed"?" failed":"")}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span className="tc-stage-badge" style={{background:stage.color}}>{stage.short}</span>
                          <span style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{vessel.label}</span>
                          <span style={{fontSize:11,color:"var(--text-3)"}}>— {acc?.strainName||"Unknown strain"}</span>
                        </div>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          {vessel.contaminated&&<span style={{fontSize:10,fontWeight:700,color:"var(--danger)",padding:"2px 7px",borderRadius:10,background:"rgba(200,74,74,0.15)"}}>CONTAMINATED</span>}
                          {isReady&&<span style={{fontSize:10,fontWeight:700,color:"var(--amber)",padding:"2px 7px",borderRadius:10,background:"rgba(200,150,58,0.15)"}}>READY TO TRANSFER</span>}
                          <button className="tc-sm tc-edit" onClick={()=>setVesselForm({...vessel})}>Edit</button>
                          {!vessel.contaminated&&vessel.stage!=="transferred"&&vessel.stage!=="failed"&&(
                            <button className="tc-sm" style={{background:"rgba(200,74,74,0.1)",color:"var(--danger)",border:"1px solid rgba(200,74,74,0.3)"}}
                              onClick={()=>{ const t=prompt("Contamination type:\n1. Bacterial\n2. Fungal white/grey\n3. Fungal black\n4. HLV suspected\n5. Unknown"); if(t){ const types={"1":CONTAM_TYPES[0],"2":CONTAM_TYPES[1],"3":CONTAM_TYPES[2],"4":CONTAM_TYPES[3],"5":CONTAM_TYPES[4]}; markContaminated(vessel, types[t]||CONTAM_TYPES[4]); } }}>
                              ⚠ Flag contam
                            </button>
                          )}
                          {vessel.stage!=="transferred"&&vessel.stage!=="failed"&&vessel.stage!=="acclim"&&(
                            <button className="tc-sm tc-primary" style={{background:"var(--accent)",color:"#fff",border:"none"}}
                              onClick={()=>advanceStage(vessel)}>
                              Advance →
                            </button>
                          )}
                          {isReady&&(
                            <button className="tc-sm tc-primary" style={{background:"var(--accent)",color:"#fff",border:"none"}}
                              onClick={()=>{ setTransferModal(vessel); setErr(""); }}>
                              🌱 Transfer to mom room
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,fontSize:11,color:"var(--text-3)"}}>
                        <span>Media: <strong style={{color:"var(--text-2)"}}>{vessel.mediaBase}</strong></span>
                        <span>Health: <strong style={{color:vessel.health?.includes("Poor")?"var(--danger)":vessel.health?.includes("Fair")?"var(--amber)":"var(--accent-2)"}}>{vessel.health}</strong></span>
                        <span>In stage: <strong style={{color:"var(--text-2)"}}>{days!==null?days+"d":"—"}</strong></span>
                        <span>Transfers: <strong style={{color:"var(--text-2)"}}>{vessel.transferCount||0}</strong></span>
                      </div>
                      {vessel.contaminated&&<div style={{marginTop:6,fontSize:11,color:"var(--danger)"}}>⚠ {vessel.contamType} — detected {fmtD(vessel.contamDate)}</div>}
                      {vessel.notes&&<div style={{marginTop:4,fontSize:11,color:"var(--text-3)"}}>{vessel.notes}</div>}
                    </div>
                  );
                })}
              </>
            )}

            {/* Accessions tab */}
            {tab==="accessions"&&(
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                {accessions.length===0?(
                  <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No accessions yet — create one to begin tracking a strain in TC</div>
                ):(
                  <table className="tc-tbl">
                    <thead><tr><th>Strain</th><th>Purpose</th><th>Source</th><th>Initiated</th><th>HLV Status</th><th>Vessels</th><th></th></tr></thead>
                    <tbody>
                      {accessions.map(a=>{
                        const vCount = vessels.filter(v=>v.accessionId===a.id&&v.stage!=="failed").length;
                        return(
                          <tr key={a.id}>
                            <td style={{fontWeight:600,color:"var(--text)"}}>{a.strainName}</td>
                            <td style={{fontSize:11}}>{a.purpose?.replace(/_/g," ")}</td>
                            <td style={{fontSize:11}}>{a.sourceType?.replace(/_/g," ")}</td>
                            <td style={{fontSize:11,whiteSpace:"nowrap"}}>{fmtD(a.initiatedDate)}<br/><span style={{color:"var(--text-3)"}}>{a.initiatedBy}</span></td>
                            <td><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,
                              background:a.hlvStatus==="confirmed"?"rgba(200,74,74,0.15)":a.hlvStatus==="suspected"?"rgba(200,150,58,0.15)":a.hlvStatus==="cleared"?"rgba(74,124,89,0.15)":"rgba(100,100,100,0.12)",
                              color:a.hlvStatus==="confirmed"?"var(--danger)":a.hlvStatus==="suspected"?"var(--amber)":a.hlvStatus==="cleared"?"var(--accent-2)":"var(--text-3)"}}>
                              {a.hlvStatus?.replace(/_/g," ").toUpperCase()||"UNKNOWN"}
                            </span></td>
                            <td style={{fontWeight:600,color:"var(--accent-2)"}}>{vCount}</td>
                            <td><button className="tc-sm tc-edit" onClick={()=>setAccForm({...a})}>Edit</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Formulas tab */}
            {tab==="formulas"&&(
              <div>
                {formulas.length===0&&(
                  <div style={{textAlign:"center",padding:32,color:"var(--text-3)",background:"var(--surface)",borderRadius:10,border:"1px solid var(--border-2)"}}>
                    <div style={{fontSize:24,marginBottom:8}}>🧫</div>
                    <div style={{fontWeight:500,marginBottom:4}}>No custom media formulas yet</div>
                    <div style={{fontSize:12}}>If you use Athena Shoots/Roots kits you don't need custom formulas. Create one to track custom MS/WPM recipes with specific PGR ratios.</div>
                  </div>
                )}
                {formulas.map(f=>(
                  <div key={f.id} className="tc-card" style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{f.name}</div>
                        <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>
                          {TC_STAGES.find(s=>s.id===f.stage)?.label} · {f.base} · {f.volume}mL · Agar {f.agar}g/L · pH {f.ph}
                        </div>
                        <div style={{fontSize:11,color:"var(--text-2)",marginTop:2}}>
                          PGRs: {f.pgr1name} {f.pgr1mg}mg/L{f.pgr2mg>0?" · "+f.pgr2name+" "+f.pgr2mg+"mg/L":""}
                        </div>
                      </div>
                      <button className="tc-sm tc-edit" onClick={()=>setFormulaForm({...f})}>Edit</button>
                    </div>
                    {f.notes&&<div style={{fontSize:11,color:"var(--text-3)"}}>{f.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
