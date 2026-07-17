import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { autoPopulateStrains } from "./strainUtils.js";
import StrainCombo from "./StrainCombo.jsx";
import { SUBS } from "./ProductionScheduler.jsx";

const LBS_TO_G = 453.592;

// ── Core dose math, ported directly from the lab's Aspergillus-adjusted dose calculator ──
// roundsNeeded(cfu) = MAX(0, 420 * (LOG10(cfu) - 4) / 1000)   →  "rounds" of 1000 Gy
function roundsNeeded(cfu) {
  const c = parseFloat(cfu);
  if (!c || c <= 0) return 0;
  return Math.max(0, 420 * (Math.log10(c) - 4) / 1000);
}
function calcDose(tyamCfu, tabCfu, aspergillus, gyPerHour, turnRequired, weightG) {
  const rTyam = roundsNeeded(tyamCfu);
  const rTab = roundsNeeded(tabCfu);
  const higher = rTyam === rTab ? "Equal" : (rTyam > rTab ? "TYAM (Yeast & Mold)" : "TAB (Aerobic Bacteria)");
  const totalRuns1000 = Math.max(rTyam, rTab) + (aspergillus ? 0.5 : 0);
  const totalDoseGy = totalRuns1000 * 1000;
  const rate = parseFloat(gyPerHour) || 0;
  const totalHours = rate > 0 ? (totalDoseGy / rate) : 0;
  const perPassHours = turnRequired ? totalHours / 2 : totalHours;
  const lbs = (parseFloat(weightG) || 0) / LBS_TO_G;
  return { rTyam, rTab, higher, totalRuns1000, totalDoseGy, totalHours, perPassHours, lbs };
}

function fmtN(n,d=2){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:d});}
function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}

const CSS = `
  .rm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .rm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .rm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .rm-inp:focus{outline:none;border-color:var(--accent);}
  .rm-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .rm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .rm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .rm-btn:hover{opacity:0.85;}
  .rm-primary{background:var(--accent);color:#fff;}
  .rm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .rm-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .rm-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .rm-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .rm-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .rm-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .rm-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .rm-tbl tr:last-child td{border-bottom:none;}
  .rm-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .status-flagged{background:rgba(200,74,74,0.15);color:var(--danger);}
  .status-scheduled{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-irradiated{background:rgba(90,120,200,0.15);color:#7090f0;}
  .status-passed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .status-failed{background:rgba(140,30,30,0.2);color:#c84a4a;}
  .rm-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .rm-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;}
  .rm-result{background:rgba(200,150,58,0.1);border:1px solid rgba(200,150,58,0.4);border-radius:8px;padding:12px 14px;margin-top:10px;}
`;

function emptyForm() {
  return {
    sourceType: "harvest", sourceId: "", strainName: "", weightG: "",
    labName: "", labReportRef: "", testDate: new Date().toISOString().split("T")[0],
    tyamCfu: "", tabCfu: "", aspergillus: false,
    gyPerHour: "1000", turnRequired: true,
    status: "flagged", retestResult: "", notes: "",
  };
}

export default function Remediation() {
  const [harvestBatches, setHarvestBatches] = useState([]);
  const [prodBatches, setProdBatches] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [hb, pb, rm] = await Promise.all([
          db.harvest_batches.list(),
          db.production_batches.list(),
          db.remediation.list(),
        ]);
        setHarvestBatches(hb);
        setProdBatches(pb.filter(x=>!x.isLinked));
        setRecords(rm);
      }catch(e){ console.error("Remediation load error:",e); }
      setLoading(false);
    }
    load();
  },[]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");


  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  function openAdd() { setForm(emptyForm()); setErr(""); }
  function openEdit(r) { setForm({...r}); setErr(""); }
  function closeForm() { setForm(null); setErr(""); }

  // Source list depends on selected sourceType
  const sourceOptions = form?.sourceType === "harvest"
    ? harvestBatches.map(h => ({ id: h.id, label: h.strainName + " — " + (h.spaceName||"manual") + " (" + fmtD(h.d) + ")", strain: h.strainName, weightG: h.totalDryWeight || 0 }))
    : prodBatches.map(b => {
        const m = b.yieldEst?.match(/([\d,]+(?:\.\d+)?)\s*g/);
        const wG = m ? parseFloat(m[1].replace(/,/g,"")) : (b.unit==="g" ? b.inputAmt : b.unit==="lbs" ? b.inputAmt*LBS_TO_G : b.unit==="kg" ? b.inputAmt*1000 : 0);
        const subLabel = SUBS[b.cat]?.find(s=>s.v===b.sub)?.l || "";
        return { id: b.id, label: b.name + " — " + b.catLabel + (subLabel?" / "+subLabel:""), strain: b.strains||"", weightG: wG };
      });

  function selectSource(id) {
    const src = sourceOptions.find(s => String(s.id) === String(id));
    if (!src) { setF("sourceId", id); return; }
    setForm(f => ({ ...f, sourceId: id, strainName: src.strain, weightG: String(Math.round(src.weightG)) }));
  }

  function validate() {
    if (!form.sourceId) { setErr("Select the harvest or production batch that failed testing."); return false; }
    if (!form.weightG || parseFloat(form.weightG) <= 0) { setErr("Enter the batch weight."); return false; }
    if (!form.tyamCfu && !form.tabCfu) { setErr("Enter at least one CFU result from the lab report (TYAM or TAB)."); return false; }
    return true;
  }

  async function save() {
    if (!validate()) return;
    const dose = calcDose(form.tyamCfu, form.tabCfu, form.aspergillus, form.gyPerHour, form.turnRequired, form.weightG);
    const rec = { ...form, id: form.id || crypto.randomUUID(), dose };
    try{
      const saved = await db.remediation.upsert(rec);
      if (form.id) setRecords(p => p.map(x => x.id===saved.id ? saved : x));
      else setRecords(p => [...p, saved]);
      autoPopulateStrains(form.strainName, { source: "Microbial Remediation" });
      closeForm();
    }catch(e){ setErr("Could not save: "+(e.message||e)); }
  }
  async function remove(id) {
    try{
      await db.remediation.delete(id);
      setRecords(p => p.filter(x => x.id !== id));
    }catch(e){ setErr("Could not delete: "+(e.message||e)); }
  }

  const liveDose = form ? calcDose(form.tyamCfu, form.tabCfu, form.aspergillus, form.gyPerHour, form.turnRequired, form.weightG) : null;

  const flaggedCount = records.filter(r => r.status === "flagged").length;
  const totalHoursAll = records.reduce((a,r) => a + (r.dose?.totalHours || 0), 0);

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading remediation…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="rm-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Microbial Remediation</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Radiation dose calculator for total yeast/mold and Aspergillus remediation after a failed lab test</div>
          </div>
          {!form && <button className="rm-btn rm-primary" onClick={openAdd}>+ Flag failed batch</button>}
        </div>

        {flaggedCount > 0 && (
          <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"var(--danger)",fontWeight:500}}>
            ⚠ {flaggedCount} batch{flaggedCount>1?"es":""} flagged and awaiting remediation scheduling
          </div>
        )}

        {form && (
          <div className="rm-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>{form.id ? "Edit Remediation Record" : "New Remediation Record — Failed Microbial Test"}</div>

            <div className="rm-box">
              <div className="rm-box-t">Source Batch</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="rm-lbl">Source type</label>
                  <select className="rm-sel" value={form.sourceType} onChange={e=>setForm(f=>({...f,sourceType:e.target.value,sourceId:"",strainName:"",weightG:""}))}>
                    <option value="harvest">Harvest Batch</option>
                    <option value="production">Production Batch</option>
                  </select>
                </div>
                <div>
                  <label className="rm-lbl">{form.sourceType==="harvest"?"Harvest batch":"Production batch"}</label>
                  <select className="rm-sel" value={form.sourceId} onChange={e=>selectSource(e.target.value)}>
                    <option value="">— Select —</option>
                    {sourceOptions.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label className="rm-lbl">Strain</label><StrainCombo className="rm-inp" value={form.strainName} onChange={(name)=>setF("strainName",name)} placeholder="Select or type strain" /></div>
                <div><label className="rm-lbl">Batch weight (grams)</label><input type="number" min="0" className="rm-inp" value={form.weightG} onChange={e=>setF("weightG",e.target.value)} /></div>
              </div>
            </div>

            <div className="rm-box">
              <div className="rm-box-t">3rd-Party Lab Test Result</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="rm-lbl">Lab name</label><input className="rm-inp" value={form.labName} onChange={e=>setF("labName",e.target.value)} /></div>
                <div><label className="rm-lbl">Report / sample ref #</label><input className="rm-inp" value={form.labReportRef} onChange={e=>setF("labReportRef",e.target.value)} /></div>
                <div><label className="rm-lbl">Test date</label><input type="date" className="rm-inp" value={form.testDate} onChange={e=>setF("testDate",e.target.value)} /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div><label className="rm-lbl">TYAM CFU/g (Total Yeast & Mold)</label><input type="number" min="0" className="rm-inp" value={form.tyamCfu} onChange={e=>setF("tyamCfu",e.target.value)} placeholder="e.g. 74000" /></div>
                <div><label className="rm-lbl">TAB CFU/g (Total Aerobic Bacteria)</label><input type="number" min="0" className="rm-inp" value={form.tabCfu} onChange={e=>setF("tabCfu",e.target.value)} placeholder="e.g. 150000" /></div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:7}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                    <input type="checkbox" checked={form.aspergillus} onChange={e=>setF("aspergillus",e.target.checked)} />
                    Aspergillus detected
                  </label>
                </div>
              </div>
            </div>

            <div className="rm-box">
              <div className="rm-box-t">Irradiation Machine Settings</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label className="rm-lbl">Machine capacity (Gy per hour)</label><input type="number" min="1" className="rm-inp" value={form.gyPerHour} onChange={e=>setF("gyPerHour",e.target.value)} /></div>
                <div><label className="rm-lbl">Machine type</label>
                  <select className="rm-sel" value={form.turnRequired?"turn":"noturn"} onChange={e=>setF("turnRequired",e.target.value==="turn")}>
                    <option value="turn">Turn required — material flipped halfway (2-pass, half dose each side)</option>
                    <option value="noturn">No turn needed — single continuous pass</option>
                  </select>
                </div>
              </div>
            </div>

            {liveDose && (form.tyamCfu || form.tabCfu) && (
              <div className="rm-result">
                <div style={{fontSize:10,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Calculated Dose</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
                  <div><div style={{fontSize:10,color:"var(--text-3)"}}>TYAM rounds (1000 Gy)</div><div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{fmtN(liveDose.rTyam)}</div></div>
                  <div><div style={{fontSize:10,color:"var(--text-3)"}}>TAB rounds (1000 Gy)</div><div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{fmtN(liveDose.rTab)}</div></div>
                  <div><div style={{fontSize:10,color:"var(--text-3)"}}>Driving factor</div><div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{liveDose.higher}</div></div>
                  <div><div style={{fontSize:10,color:"var(--text-3)"}}>Total dose</div><div style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>{fmtN(liveDose.totalDoseGy,0)} Gy</div></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  <div style={{background:"var(--surface)",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Total Run Time</div>
                    <div style={{fontSize:20,fontWeight:700,color:"var(--accent-2)"}}>{fmtN(liveDose.totalHours,2)} hrs</div>
                  </div>
                  <div style={{background:"var(--surface)",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>{form.turnRequired?"Per Side (2 passes)":"Single Pass"}</div>
                    <div style={{fontSize:20,fontWeight:700,color:"var(--text)"}}>{fmtN(liveDose.perPassHours,2)} hrs</div>
                  </div>
                  <div style={{background:"var(--surface)",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Batch Weight</div>
                    <div style={{fontSize:20,fontWeight:700,color:"var(--text)"}}>{fmtN(liveDose.lbs)} lbs</div>
                  </div>
                </div>
                {form.turnRequired && (
                  <div style={{fontSize:11,color:"var(--text-2)",marginTop:8}}>
                    Schedule: Side A — {fmtN(liveDose.perPassHours,2)} hrs → flip material → Side B — {fmtN(liveDose.perPassHours,2)} hrs → {fmtN(liveDose.totalHours,2)} hrs total
                  </div>
                )}
                {form.aspergillus && <div style={{fontSize:11,color:"var(--amber)",marginTop:8}}>+0.5 round added to dose for Aspergillus presence</div>}
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,margin:"14px 0"}}>
              <div><label className="rm-lbl">Status</label>
                <select className="rm-sel" value={form.status} onChange={e=>setF("status",e.target.value)}>
                  <option value="flagged">Flagged — awaiting scheduling</option>
                  <option value="scheduled">Scheduled for irradiation</option>
                  <option value="irradiated">Irradiated — awaiting retest</option>
                  <option value="passed">Retested — Passed</option>
                  <option value="failed">Retested — Failed</option>
                </select>
              </div>
              <div><label className="rm-lbl">Notes</label><input className="rm-inp" value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            </div>

            {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="rm-btn rm-primary" onClick={save}>{form.id ? "Save changes" : "Save remediation record"}</button>
              <button className="rm-btn rm-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {!form && records.length === 0 && (
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>☢️</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No remediation records yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Flag a batch here after a failed total yeast/mold, total aerobic bacteria, or Aspergillus result from your 3rd-party lab</div>
          </div>
        )}

        {!form && records.length > 0 && (
          <div className="rm-card">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
              <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Total records</div><div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{records.length}</div></div>
              <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Awaiting scheduling</div><div style={{fontSize:18,fontWeight:700,color:flaggedCount?"var(--danger)":"var(--accent-2)"}}>{flaggedCount}</div></div>
              <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Total irradiation hours</div><div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{fmtN(totalHoursAll,1)} hrs</div></div>
            </div>

            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="rm-tbl">
                <thead><tr><th>Strain</th><th>Source</th><th>Weight</th><th>TYAM / TAB CFU</th><th>Aspergillus</th><th>Total Dose</th><th>Run Time</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {[...records].sort((a,b)=>new Date(b.testDate)-new Date(a.testDate)).map(r => (
                    <tr key={r.id}>
                      <td style={{fontWeight:500,color:"var(--text)"}}>{r.strainName||"—"}</td>
                      <td style={{fontSize:11}}>{r.sourceType==="harvest"?"Harvest":"Production"}</td>
                      <td>{fmtN(r.weightG,0)}g</td>
                      <td style={{fontSize:11}}>{r.tyamCfu||"—"} / {r.tabCfu||"—"}</td>
                      <td>{r.aspergillus ? <span className="rm-pill status-flagged">Yes</span> : "—"}</td>
                      <td>{fmtN(r.dose?.totalDoseGy,0)} Gy</td>
                      <td style={{color:"var(--accent-2)"}}>{fmtN(r.dose?.totalHours,2)} hrs</td>
                      <td><span className={"rm-pill status-"+r.status}>{r.status}</span></td>
                      <td><div style={{display:"flex",gap:5}}>
                        <button className="rm-sm rm-edit" onClick={()=>openEdit(r)}>Edit</button>
                        <button className="rm-sm rm-del" onClick={()=>remove(r.id)}>✕</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
