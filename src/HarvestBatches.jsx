import { useState, useEffect } from "react";
import { autoPopulateStrains } from "./strainUtils.js";
import StrainCombo from "./StrainCombo.jsx";
const LBS_TO_G = 453.592;


const BUCKERS = {
  centp_hp_mini:  {l:"CenturionPro HP Mini Bucker (single)",         t:125},
  centp_hp1:      {l:"CenturionPro HP1 (single workstation)",        t:175},
  centp_hp3:      {l:"CenturionPro HP3 (triple workstation)",        t:500},
  centp_gc1:      {l:"CenturionPro GC1 (single, gentle cut)",        t:40},
  centp_gc3:      {l:"CenturionPro GC3 (triple, gentle cut)",        t:120},
  centp_xl_mega:  {l:"CenturionPro XL MegaBucker (12-16 operator)",  t:2400},
  mobius_mbx:     {l:"Mobius MBX",                                   t:150},
  twister_b4:     {l:"Twister B4",                                   t:150},
  buckmaster:     {l:"BuckMaster (single)",                          t:150},
  buckmaster_pro: {l:"BuckMaster Pro (double)",                      t:300},
  hand_single:    {l:"Hand bucking — single operator",               t:50},
  custom:         {l:"Custom / Other",                               t:100},
};

const TRIMMERS = {
  greenboz_215:{l:"GreenBroz 215",t:215},
  twister_t4:{l:"Twister T4",t:100},
  twister_t6:{l:"Twister T6",t:150},
  mobius_m108:{l:"Mobius M108S",t:400},
  dbt_twister:{l:"Twister DBT (BatchOne)",t:200},
  dbt_centurion:{l:"Centurion Pro DBT",t:250},
  custom:{l:"Custom / Other",t:100},
};

const GRADES = [
  {k:"a", l:"A-Bud (Top Shelf)"},
  {k:"b", l:"B-Bud (Mid Shelf)"},
  {k:"c", l:"C-Bud (Value / Smalls)"},
  {k:"trim",l:"Trim"},
];

const STEPS_DEFAULT = [
  {n:"Drying",days:12},
  {n:"Bucking",days:2},
  {n:"Trimming",days:3},
  {n:"Curing",days:10},
];

function dAdd(dt,n){const r=new Date(dt);r.setDate(r.getDate()+n);return r;}
function dDiff(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
function fmtS(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function fmtF(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function buildTimeline(d,steps){let c=new Date(d+"T12:00:00");return steps.map(s=>{const s0=new Date(c),e=dAdd(c,s.days);c=e;return{...s,start:s0,end:e};});}

function calcBuckDays(wetWeightLbs, throughput) {
  const t = parseFloat(throughput) || 100;
  return Math.max(1, Math.ceil((parseFloat(wetWeightLbs)||0) / t / 8)); // throughput is lbs/hr, 8hr shift -> days
}

function calcTrimDays(inputG,trimType,throughput,trimmerCount,gramsPerDay){
  const lbs=inputG/LBS_TO_G;
  if(trimType==="machine"){const t=parseFloat(throughput)||100;return Math.max(1,Math.ceil(lbs/t));}
  const tc=parseInt(trimmerCount)||1;const gpd=parseFloat(gramsPerDay)||350;
  return Math.max(1,Math.ceil(inputG/(tc*gpd)));
}

const CSS = `
  .hb-wrap{padding:24px;flex:1;overflow-y:auto;}
  .hb-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .hb-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .hb-inp:focus{outline:none;border-color:var(--accent);}
  .hb-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .hb-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .hb-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .hb-btn:hover{opacity:0.85;}
  .hb-primary{background:var(--accent);color:#fff;}
  .hb-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .hb-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .hb-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .hb-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .hb-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .hb-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;}
  .hb-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .hb-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .hb-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .hb-tbl tr:last-child td{border-bottom:none;}
  .hb-grade-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;}
  .grade-a{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .grade-b{background:rgba(200,150,58,0.15);color:var(--amber);}
  .grade-c{background:rgba(90,120,200,0.15);color:#7090f0;}
  .grade-trim{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .hb-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .hb-status-open{background:rgba(200,150,58,0.15);color:var(--amber);}
  .hb-status-done{background:rgba(74,124,89,0.2);color:var(--accent-2);}
`;

export default function HarvestBatches() {
  const spaces = (() => { try { return JSON.parse(localStorage.getItem("resinops_spaces")||"[]"); } catch { return []; } })();
  const [batches, setBatches] = useState(() => { try { return JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]"); } catch { return []; } });
  const [form, setForm] = useState(null);
  const [formMode, setFormMode] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { localStorage.setItem("resinops_harvest_batches", JSON.stringify(batches)); }, [batches]);

  function emptyForm() {
    return {
      spaceId:"", strainName:"", plants:"", d:new Date().toISOString().split("T")[0],
      wetWeightG:"",
      buckMachine:"centp_hp1", buckThroughput:"175",
      steps: STEPS_DEFAULT.map(s=>({...s})),
      trimType:"machine", trimMachine:"greenboz_215", trimThroughput:"215",
      trimmerCount:"4", gramsPerTrimmerDay:"350",
      grades: { a:{weight:"",s2s:""}, b:{weight:"",s2s:""}, c:{weight:"",s2s:""}, trim:{weight:"",s2s:""} },
      status:"open",
    };
  }

  function openAdd() { setForm(emptyForm()); setFormMode("add"); setErr(""); }
  function openEdit(b) { setForm(JSON.parse(JSON.stringify(b))); setFormMode("edit"); setErr(""); }
  function closeForm() { setForm(null); setFormMode(null); setErr(""); }

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));
  const setGrade = (g,k,v) => setForm(f=>({...f, grades:{...f.grades, [g]:{...f.grades[g], [k]:v}}}));
  const updateStep = (i,v) => setForm(f=>({...f, steps:f.steps.map((s,idx)=>idx===i?{...s,days:parseInt(v)||0}:s)}));

  // when a grow space is selected, pull strain list as quick-fill options
  const selSpace = spaces.find(s=>s.id===parseInt(form?.spaceId));
  const spaceStrains = selSpace ? (selSpace.strains||[]) : [];

  function applySpaceStrain(strainObj) {
    setForm(f=>({...f, strainName: strainObj.name, plants: String(strainObj.plants) }));
  }

  const inputG = form ? (parseFloat(form.wetWeightG)||0) : 0;
  const buckCalc = inputG>0 ? calcBuckDays(inputG/LBS_TO_G, form.buckThroughput) : null;
  function applyBuckDays() { if(!buckCalc) return; setForm(f=>({...f, steps:f.steps.map(s=>s.n==="Bucking"?{...s,days:buckCalc}:s)})); }
  const trimCalc = inputG>0 ? calcTrimDays(inputG, form.trimType, form.trimThroughput, form.trimmerCount, form.gramsPerTrimmerDay) : null;
  function applyTrimDays() { if(!trimCalc) return; setForm(f=>({...f, steps:f.steps.map(s=>s.n==="Trimming"?{...s,days:trimCalc}:s)})); }

  const totalDryWeight = form ? GRADES.reduce((a,g)=>a+(parseFloat(form.grades[g.k]?.weight)||0),0) : 0;

  function validate() {
    if (!form.strainName.trim()) { setErr("Enter or select a strain."); return false; }
    if (!form.d) { setErr("Select a harvest date."); return false; }
    if (!form.wetWeightG || parseFloat(form.wetWeightG)<=0) { setErr("Enter wet weight."); return false; }
    return true;
  }

  function saveBatch() {
    if (!validate()) return;
    const batch = { ...form, id: formMode==="edit" ? form.id : Date.now(),
      plants: parseInt(form.plants)||0, wetWeightG: parseFloat(form.wetWeightG)||0,
      spaceName: selSpace?.name||"", totalDryWeight,
      status: totalDryWeight>0 ? "done" : "open" };
    if (formMode==="edit") setBatches(p=>p.map(b=>b.id===batch.id?batch:b));
    else setBatches(p=>[...p,batch]);
    autoPopulateStrains(form.strainName, { source: "Harvest Batches" });
    closeForm();
  }
  function removeBatch(id) { setBatches(p=>p.filter(b=>b.id!==id)); }

  const timelines = batches.map(b=>buildTimeline(b.d,b.steps));
  const today = new Date();

  function exportHarvest() {
    if (!batches.length) return;
    const date = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    const rows = batches.map((b,idx)=>{
      const tl = timelines[idx]; const end = tl[tl.length-1]?.end;
      const stepRows = tl.map(s=>'<tr><td style="padding:4px 12px 4px 0;color:#555;font-size:13px;">'+s.n+'</td><td style="font-size:13px;">'+fmtF(s.start)+' \u2192 '+fmtF(s.end)+'</td><td style="color:#666;font-size:13px;">'+s.days+' days</td></tr>').join("");
      const gradeRows = GRADES.map(g=>{const gd=b.grades[g.k];return gd.weight?'<tr><td style="padding:3px 12px 3px 0;font-size:13px;">'+g.l+'</td><td style="font-size:13px;">'+gd.weight+'g</td><td style="font-size:12px;color:#666;">'+(gd.s2s||"—")+'</td></tr>':'';}).join("");
      return '<div style="margin-bottom:28px;border-left:4px solid #2d5a3d;padding-left:14px;"><h2 style="font-size:15px;font-weight:700;margin:0 0 2px;">'+b.strainName+' — '+b.spaceName+'</h2><p style="font-size:12px;color:#555;margin:0 0 10px;">'+b.plants+' plants \u00b7 '+b.wetWeightG+'g wet \u00b7 Harvested '+fmtF(new Date(b.d+"T12:00:00"))+'</p><table style="border-collapse:collapse;">'+stepRows+'</table><p style="font-size:12px;font-weight:700;margin:10px 0 4px;">Final Grade Weights</p><table style="border-collapse:collapse;">'+gradeRows+'</table><p style="font-size:13px;font-weight:600;margin-top:6px;">Total dry weight: '+b.totalDryWeight.toFixed(1)+'g</p></div>';
    }).join('<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;">');
    const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ResinOps Harvest Batches</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:48px auto;padding:0 24px;color:#1a1a1a;}h1{font-size:22px;color:#2d5a3d;}</style></head><body><h1>ResinOps — Harvest Batches</h1><p style="color:#666;font-size:13px;">Exported '+date+'</p>'+rows+'</body></html>';
    const blob=new Blob([html],{type:"text/html"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ResinOps-Harvest-"+new Date().toISOString().slice(0,10)+".html";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="hb-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Harvest Batches</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Post-harvest tracking — drying, trimming, curing, and graded final weights per strain</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {batches.length>0 && <button className="hb-btn hb-secondary" onClick={exportHarvest}>↓ Export</button>}
            {!form && <button className="hb-btn hb-primary" onClick={openAdd}>+ New Harvest Batch</button>}
          </div>
        </div>

        {form && (
          <div className="hb-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>{formMode==="edit"?"Edit Harvest Batch":"New Harvest Batch"}</div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label className="hb-lbl">Source grow space (optional)</label>
                <select className="hb-sel" value={form.spaceId} onChange={e=>setF("spaceId",e.target.value)}>
                  <option value="">— Manual entry (no linked space) —</option>
                  {spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {spaceStrains.length>0 && (
                <div>
                  <label className="hb-lbl">Quick-fill from space strain</label>
                  <select className="hb-sel" value="" onChange={e=>{const s=spaceStrains.find(x=>String(x.id)===e.target.value);if(s)applySpaceStrain(s);}}>
                    <option value="">— Select strain —</option>
                    {spaceStrains.map(s=><option key={s.id} value={s.id}>{s.name} ({s.plants} plants)</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="hb-lbl">Strain name</label><StrainCombo className="hb-inp" value={form.strainName} onChange={(name,obj)=>{ setF("strainName",name); if(obj){ if(obj.avgFlowerWeeks) setF("flowerWeeks",obj.avgFlowerWeeks); } }} placeholder="Select or type strain name" /></div>
              <div><label className="hb-lbl">Plant count</label><input type="number" min="1" className="hb-inp" value={form.plants} onChange={e=>setF("plants",e.target.value)} /></div>
              <div><label className="hb-lbl">Harvest date</label><input type="date" className="hb-inp" value={form.d} onChange={e=>setF("d",e.target.value)} /></div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:10}}>
              <div><label className="hb-lbl">Wet weight at harvest (grams)</label><input type="number" min="0" step="1" className="hb-inp" value={form.wetWeightG} onChange={e=>setF("wetWeightG",e.target.value)} placeholder="22700" /><div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>{form.wetWeightG?((parseFloat(form.wetWeightG)||0)/LBS_TO_G).toFixed(1)+" lbs":""}</div></div>
            </div>

            {/* Bucking machine */}
            <div className="hb-box">
              <div className="hb-box-t">Bucking Machine</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                <div><label className="hb-lbl">Machine</label><select className="hb-sel" value={form.buckMachine} onChange={e=>{setF("buckMachine",e.target.value);setF("buckThroughput",String(BUCKERS[e.target.value]?.t||100));}}>{Object.entries(BUCKERS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
                <div><label className="hb-lbl">Throughput (lbs/hr wet) — editable</label><input type="number" min="1" className="hb-inp" value={form.buckThroughput} onChange={e=>setF("buckThroughput",e.target.value)} /></div>
              </div>
              {buckCalc && (
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:11,color:"var(--accent-2)",background:"rgba(74,124,89,0.1)",borderRadius:5,padding:"4px 8px"}}>Calculated bucking time: {buckCalc} day{buckCalc>1?"s":""} (8-hr shifts)</div>
                  <button className="hb-btn hb-secondary" style={{fontSize:11,padding:"3px 10px"}} onClick={applyBuckDays}>Apply to step</button>
                </div>
              )}
            </div>

            {/* Trim method */}
            <div className="hb-box">
              <div className="hb-box-t">Trim Method</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="hb-lbl">Trim type</label><select className="hb-sel" value={form.trimType} onChange={e=>setF("trimType",e.target.value)}><option value="machine">Machine Trim</option><option value="hand">Hand Trim</option></select></div>
                {form.trimType==="machine" ? (
                  <div><label className="hb-lbl">Machine</label><select className="hb-sel" value={form.trimMachine} onChange={e=>{setF("trimMachine",e.target.value);setF("trimThroughput",String(TRIMMERS[e.target.value]?.t||100));}}>{Object.entries(TRIMMERS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
                ) : (
                  <div><label className="hb-lbl">Number of trimmers</label><input type="number" min="1" className="hb-inp" value={form.trimmerCount} onChange={e=>setF("trimmerCount",e.target.value)} /></div>
                )}
              </div>
              {form.trimType==="machine" ? (
                <div style={{maxWidth:240,marginBottom:8}}><label className="hb-lbl">Throughput (lbs/day) — editable</label><input type="number" min="1" className="hb-inp" value={form.trimThroughput} onChange={e=>setF("trimThroughput",e.target.value)} /></div>
              ) : (
                <div style={{maxWidth:240,marginBottom:8}}><label className="hb-lbl">Grams per trimmer per day</label><input type="number" min="1" className="hb-inp" value={form.gramsPerTrimmerDay} onChange={e=>setF("gramsPerTrimmerDay",e.target.value)} /></div>
              )}
              {trimCalc && (
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{fontSize:11,color:"var(--accent-2)",background:"rgba(74,124,89,0.1)",borderRadius:5,padding:"4px 8px"}}>Calculated trim time: {trimCalc} day{trimCalc>1?"s":""}</div>
                  <button className="hb-btn hb-secondary" style={{fontSize:11,padding:"3px 10px"}} onClick={applyTrimDays}>Apply to step</button>
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="hb-box">
              <div className="hb-box-t">Post-Harvest Steps</div>
              <div style={{display:"grid",gap:6}}>
                {form.steps.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:12,color:"var(--text-2)",flex:1}}>{s.n}</span>
                    <input type="number" min="1" max="60" className="hb-inp" style={{width:60,textAlign:"center"}} value={s.days} onChange={e=>updateStep(i,e.target.value)} />
                    <span style={{fontSize:11,color:"var(--text-3)",width:30}}>days</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Grades */}
            <div className="hb-box">
              <div className="hb-box-t">Final Grade Weights & S2S Tags</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10}}>Enter once curing is complete. Each grade gets its own seed-to-sale package tag.</div>
              {GRADES.map(g=>(
                <div key={g.k} style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,marginBottom:8,alignItems:"center"}}>
                  <span className={"hb-grade-pill grade-"+g.k}>{g.l}</span>
                  <input type="number" min="0" step="0.1" className="hb-inp" placeholder="Weight (g)" value={form.grades[g.k].weight} onChange={e=>setGrade(g.k,"weight",e.target.value)} />
                  <input className="hb-inp" placeholder="S2S package tag" value={form.grades[g.k].s2s} onChange={e=>setGrade(g.k,"s2s",e.target.value)} />
                </div>
              ))}
              {totalDryWeight>0 && <div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)",marginTop:6}}>Total dry weight: {totalDryWeight.toFixed(1)}g ({(totalDryWeight/LBS_TO_G).toFixed(2)} lbs)</div>}
            </div>

            {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="hb-btn hb-primary" onClick={saveBatch}>{formMode==="edit"?"Save Changes":"Create Harvest Batch"}</button>
              <button className="hb-btn hb-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {!form && batches.length===0 && (
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🌿</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No harvest batches yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Create one per strain at harvest to track drying, trimming, curing, and final graded weights</div>
          </div>
        )}

        {!form && batches.length>0 && (
          <div className="hb-card">
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="hb-tbl">
                <thead><tr><th>Strain</th><th>Space</th><th>Plants</th><th>Wet Wt</th><th>A</th><th>B</th><th>C</th><th>Trim</th><th>Total Dry</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {batches.map(b=>(
                    <tr key={b.id}>
                      <td style={{fontWeight:500,color:"var(--text)"}}>{b.strainName}</td>
                      <td>{b.spaceName||"—"}</td>
                      <td>{b.plants}</td>
                      <td>{b.wetWeightG}g <span style={{fontSize:10,color:"var(--text-3)"}}>({(b.wetWeightG/LBS_TO_G).toFixed(1)} lbs)</span></td>
                      <td>{b.grades.a.weight?b.grades.a.weight+"g":"—"}</td>
                      <td>{b.grades.b.weight?b.grades.b.weight+"g":"—"}</td>
                      <td>{b.grades.c.weight?b.grades.c.weight+"g":"—"}</td>
                      <td>{b.grades.trim.weight?b.grades.trim.weight+"g":"—"}</td>
                      <td style={{fontWeight:600,color:"var(--accent-2)"}}>{b.totalDryWeight?b.totalDryWeight.toFixed(0)+"g":"—"}</td>
                      <td><span className={"hb-pill hb-status-"+(b.status==="done"?"done":"open")}>{b.status==="done"?"Complete":"In Progress"}</span></td>
                      <td><div style={{display:"flex",gap:6}}>
                        <button className="hb-sm hb-edit" onClick={()=>openEdit(b)}>Edit</button>
                        <button className="hb-sm hb-del" onClick={()=>removeBatch(b.id)}>✕</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:11,color:"var(--text-3)",marginTop:10}}>
              Once a grade has a weight entered, select it as an input source in Production Scheduler batches.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
