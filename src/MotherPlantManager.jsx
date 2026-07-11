import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { autoPopulateStrains } from "./strainUtils.js";
import StrainCombo from "./StrainCombo.jsx";

const DEFAULT_CYCLE_WEEKS = 9;

function fmtD(dt){ return dt ? new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—"; }
function addWeeks(dateStr, weeks){
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}
function daysUntil(dateStr){
  if(!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date()) / 86400000);
}

const CSS = `
  .mm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .mm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .mm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .mm-inp:focus{outline:none;border-color:var(--accent);}
  .mm-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .mm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .mm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .mm-btn:hover{opacity:0.85;}
  .mm-primary{background:var(--accent);color:#fff;}
  .mm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .mm-danger{background:rgba(200,74,74,0.12);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .mm-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .mm-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .mm-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .mm-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .mm-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .mm-grid{display:grid;gap:12px;}
  .mm-mom-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:16px;cursor:pointer;transition:border-color 0.15s;}
  .mm-mom-card:hover{border-color:var(--accent);}
  .mm-mom-card.selected{border-color:var(--accent);background:rgba(74,124,89,0.04);}
  .mm-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .pill-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .pill-retired{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .pill-due{background:rgba(200,150,58,0.2);color:var(--amber);}
  .pill-overdue{background:rgba(200,74,74,0.15);color:var(--danger);}
  .mm-stat{background:var(--surface-2);border-radius:8px;padding:10px 14px;text-align:center;}
  .mm-stat-v{font-size:22px;font-weight:700;color:var(--accent-2);}
  .mm-stat-l{font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;}
  .mm-cut-row{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:7px;margin-bottom:6px;font-size:12px;}
  .mm-timeline{position:relative;padding-left:20px;border-left:2px solid var(--border-2);}
  .mm-timeline-dot{position:absolute;left:-7px;width:12px;height:12px;border-radius:50%;background:var(--accent);border:2px solid var(--surface);}
  .mm-warn{background:rgba(200,150,58,0.1);border:1px solid rgba(200,150,58,0.3);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:12px;}
`;

const EMPTY_MOM = {
  id:"", strainName:"", roomId:"", plantCount:1,
  introducedDate: new Date().toISOString().split("T")[0],
  cycleWeeks: DEFAULT_CYCLE_WEEKS,
  status:"active",
  cutsPerPlantPerCycle: 8,
  notes:"",
  // Cut history
  cutLog:[],
};

export default function MotherPlantManager(){
  const [allSpaces, setAllSpaces] = useState([]);
  const [allRooms, setAllRooms] = useState([]);
  const [moms, setMoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [err, setErr] = useState("");
  const [cutForm, setCutForm] = useState(null);

  useEffect(()=>{
    async function load(){
      try{
        const [m, spaces, rooms]=await Promise.all([
          db.mother_plants.list(),
          db.grow_spaces.list(),
          db.grow_rooms.list(),
        ]);
        setMoms(m);
        const combined=[...spaces,...rooms];
        setAllRooms(combined);
        setAllSpaces(combined.filter(s=>s.type==="mother"||s.room_type==="mother"||s.name?.toLowerCase().includes("mother")||s.name?.toLowerCase().includes("mom")));
      }catch(e){ console.error("MotherPlantManager load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const selected = moms.find(m=>m.id===selectedId);

  function nextCutDate(mom){
    const lastCut = mom.cutLog?.slice(-1)[0]?.date || mom.introducedDate;
    return addWeeks(lastCut, mom.cycleWeeks || DEFAULT_CYCLE_WEEKS);
  }

  function cycleStatus(mom){
    const d = daysUntil(nextCutDate(mom));
    if(d === null) return "active";
    if(d < 0) return "overdue";
    if(d <= 7) return "due";
    return "active";
  }

  async function save(){
    if(!form.strainName){ setErr("Strain name is required."); return; }
    if(!form.plantCount||form.plantCount<1){ setErr("Plant count must be at least 1."); return; }
    const rec = {
      ...form,
      id: form.id || "mom_"+Date.now(),
      cutLog: form.cutLog || [],
    };
    if(form.id) setMoms(p=>p.map(m=>m.id===rec.id?rec:m));
    else setMoms(p=>[...p,rec]);
    autoPopulateStrains(form.strainName, {source:"Mother Plant Manager"});
    setForm(null); setErr("");
  }

  function retire(id){
    setMoms(p=>p.map(m=>m.id===id?{...m,status:"retired"}:m));
    if(selectedId===id) setSelectedId(null);
  }

  function logCut(){
    if(!cutForm?.date){ setErr("Enter the cut date."); return; }
    const cutsThisCycle = parseInt(cutForm.cutsTotal) || (selected.plantCount * (selected.cutsPerPlantPerCycle || 8));
    const entry = {
      id: "cut_"+Date.now(),
      date: cutForm.date,
      cutsTotal: cutsThisCycle,
      cutsPerPlant: Math.round(cutsThisCycle / selected.plantCount),
      health: cutForm.health || "good",
      notes: cutForm.notes || "",
    };
    setMoms(p=>p.map(m=>m.id===selectedId?{...m,cutLog:[...(m.cutLog||[]),entry]}:m));

    // Suggest to Clone Scheduler — store as a suggested batch
    const cloneSuggestions = []; // TODO: move to db layer
    cloneSuggestions.push({
      id: "cs_"+Date.now(),
      strainName: selected.strainName,
      sourceMotherIds: [selectedId],
      suggestedCutDate: cutForm.date,
      quantity: cutsThisCycle,
      status: "suggested",
      notes: "From Mother Plant Manager cut log",
    });
    // clone suggestions will be persisted in a future update

    setCutForm(null); setErr("");
  }

  // Stats
  const activeMoms = moms.filter(m=>m.status==="active");
  const totalPlants = activeMoms.reduce((a,m)=>a+(parseInt(m.plantCount)||0),0);
  const totalCutsAvail = activeMoms.reduce((a,m)=>a+(parseInt(m.plantCount)||0)*(parseInt(m.cutsPerPlantPerCycle)||8),0);
  const overdue = activeMoms.filter(m=>cycleStatus(m)==="overdue");

  // Build 12-week cut forecast
  function buildForecast(){
    const today = new Date();
    const weeks = [];
    for(let w=0; w<12; w++){
      const weekStart = new Date(today); weekStart.setDate(today.getDate()+w*7);
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);
      const cuts = activeMoms.filter(m=>{
        const d = new Date(nextCutDate(m));
        return d >= weekStart && d < weekEnd;
      });
      if(cuts.length) weeks.push({
        label: weekStart.toLocaleDateString("en-US",{month:"short",day:"numeric"}),
        moms: cuts,
        totalCuts: cuts.reduce((a,m)=>a+(parseInt(m.plantCount)||0)*(parseInt(m.cutsPerPlantPerCycle)||8),0),
      });
    }
    return weeks;
  }

  return(
    <>
      <style>{CSS}</style>
      <div className="mm-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <!-- title removed - shown in app header -->
          </div>
          {!form&&<button className="mm-btn mm-primary" onClick={()=>setForm({...EMPTY_MOM})}>+ Add mother plant</button>}
        </div>

        {/* Stats row */}
        {!form&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            <div className="mm-stat"><div className="mm-stat-v">{activeMoms.length}</div><div className="mm-stat-l">Active strains</div></div>
            <div className="mm-stat"><div className="mm-stat-v">{totalPlants}</div><div className="mm-stat-l">Total mother plants</div></div>
            <div className="mm-stat"><div className="mm-stat-v">{totalCutsAvail}</div><div className="mm-stat-l">Cuts per cycle</div></div>
            <div className="mm-stat"><div className="mm-stat-v" style={{color:overdue.length>0?"var(--danger)":"var(--accent-2)"}}>{overdue.length}</div><div className="mm-stat-l">Overdue for cuts</div></div>
          </div>
        )}

        {/* Overdue warning */}
        {!form&&overdue.length>0&&(
          <div className="mm-warn">
            ⚠ <strong>{overdue.length} mother plant set{overdue.length!==1?"s":""} overdue for cuts:</strong> {overdue.map(m=>m.strainName).join(", ")}. Log cuts to reset the cycle timer.
          </div>
        )}

        {/* Add/Edit form */}
        {form&&(
          <div className="mm-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit mother plant":"Register mother plant"}</div>

            <div className="mm-box">
              <div className="mm-box-t">Strain & Room</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="mm-lbl">Strain</label>
                  <StrainCombo className="mm-inp" value={form.strainName} onChange={(name)=>setF("strainName",name)} placeholder="Select or type strain" />
                </div>
                <div><label className="mm-lbl">Room / space</label>
                  <select className="mm-sel" value={form.roomId} onChange={e=>setF("roomId",e.target.value)}>
                    <option value="">— Select room —</option>
                    {allRooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div><label className="mm-lbl">Number of mother plants</label>
                  <input type="number" min="1" className="mm-inp" value={form.plantCount} onChange={e=>setF("plantCount",parseInt(e.target.value)||1)} />
                </div>
                <div><label className="mm-lbl">Date introduced</label>
                  <input type="date" className="mm-inp" value={form.introducedDate} onChange={e=>setF("introducedDate",e.target.value)} />
                </div>
                <div><label className="mm-lbl">Status</label>
                  <select className="mm-sel" value={form.status} onChange={e=>setF("status",e.target.value)}>
                    <option value="active">Active</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mm-box">
              <div className="mm-box-t">Cycle Configuration</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                <div>
                  <label className="mm-lbl">Cut cycle — weeks between cuts (default {DEFAULT_CYCLE_WEEKS})</label>
                  <input type="number" min="1" max="52" className="mm-inp" value={form.cycleWeeks} onChange={e=>setF("cycleWeeks",parseInt(e.target.value)||DEFAULT_CYCLE_WEEKS)} />
                </div>
                <div>
                  <label className="mm-lbl">Projected cuts per plant per cycle</label>
                  <input type="number" min="1" className="mm-inp" value={form.cutsPerPlantPerCycle} onChange={e=>setF("cutsPerPlantPerCycle",parseInt(e.target.value)||8)} />
                </div>
              </div>
              <div style={{fontSize:11,color:"var(--text-3)",background:"var(--surface)",borderRadius:6,padding:"6px 10px"}}>
                📊 At these settings: <strong style={{color:"var(--accent-2)"}}>{(parseInt(form.plantCount)||1)*(parseInt(form.cutsPerPlantPerCycle)||8)} cuts</strong> per cycle every <strong style={{color:"var(--accent-2)"}}>{form.cycleWeeks||DEFAULT_CYCLE_WEEKS} weeks</strong> — approximately <strong style={{color:"var(--accent-2)"}}>{Math.round(((parseInt(form.plantCount)||1)*(parseInt(form.cutsPerPlantPerCycle)||8))/(form.cycleWeeks||DEFAULT_CYCLE_WEEKS)*7*7)} cuts</strong> per week projected
              </div>
            </div>

            <div style={{marginBottom:10}}><label className="mm-lbl">Notes</label>
              <textarea className="mm-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} />
            </div>

            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="mm-btn mm-primary" onClick={save}>{form.id?"Save changes":"Register"}</button>
              <button className="mm-btn mm-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Left: mother plant list */}
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--text-2)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Mother Plants</div>
              {moms.length===0&&(
                <div style={{textAlign:"center",padding:32,color:"var(--text-3)",background:"var(--surface)",borderRadius:10,border:"1px solid var(--border-2)"}}>
                  <div style={{fontSize:24,marginBottom:8}}>🌿</div>
                  <div>No mother plants registered yet.</div>
                </div>
              )}
              {[...moms].sort((a,b)=>{
                if(a.status==="retired"&&b.status!=="retired") return 1;
                if(b.status==="retired"&&a.status!=="retired") return -1;
                return 0;
              }).map(mom=>{
                const status = mom.status==="retired"?"retired":cycleStatus(mom);
                const next = nextCutDate(mom);
                const d = daysUntil(next);
                const room = allRooms.find(r=>String(r.id)===String(mom.roomId));
                return(
                  <div key={mom.id}
                    className={"mm-mom-card"+(selectedId===mom.id?" selected":"")}
                    style={{marginBottom:10,opacity:mom.status==="retired"?0.6:1}}
                    onClick={()=>setSelectedId(selectedId===mom.id?null:mom.id)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{mom.strainName}</div>
                      <span className={"mm-pill pill-"+status}>{status==="overdue"?"⚠ OVERDUE":status==="due"?"CUT DUE":status==="retired"?"RETIRED":"ACTIVE"}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--text-3)",marginBottom:6}}>
                      {mom.plantCount} plant{mom.plantCount!==1?"s":""} · {room?.name||"No room assigned"} · {mom.cycleWeeks||DEFAULT_CYCLE_WEEKS}wk cycle
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:"var(--text-2)"}}>~{(parseInt(mom.plantCount)||1)*(parseInt(mom.cutsPerPlantPerCycle)||8)} cuts/cycle</span>
                      {mom.status!=="retired"&&<span style={{color:status==="overdue"?"var(--danger)":status==="due"?"var(--amber)":"var(--text-3)"}}>
                        Next cut: {fmtD(next)} {d!==null&&<>({d<0?`${Math.abs(d)}d overdue`:`${d}d`})</>}
                      </span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: detail panel */}
            <div>
              {!selected&&(
                <div style={{textAlign:"center",padding:32,color:"var(--text-3)",background:"var(--surface)",borderRadius:10,border:"1px solid var(--border-2)"}}>
                  <div style={{fontSize:20,marginBottom:8}}>👈</div>
                  <div>Select a mother plant to see details</div>
                </div>
              )}
              {selected&&(
                <div>
                  <div className="mm-card" style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{selected.strainName}</div>
                      <div style={{display:"flex",gap:6}}>
                        <button className="mm-sm mm-edit" onClick={()=>setForm({...selected})}>Edit</button>
                        {selected.status==="active"&&<button className="mm-sm mm-del" onClick={()=>retire(selected.id)}>Retire</button>}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Plants: <span style={{color:"var(--text)",fontWeight:600}}>{selected.plantCount}</span></div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Cycle: <span style={{color:"var(--text)",fontWeight:600}}>{selected.cycleWeeks||DEFAULT_CYCLE_WEEKS} weeks</span></div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Cuts/cycle: <span style={{color:"var(--accent-2)",fontWeight:600}}>{(parseInt(selected.plantCount)||1)*(parseInt(selected.cutsPerPlantPerCycle)||8)}</span></div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Introduced: <span style={{color:"var(--text)",fontWeight:600}}>{fmtD(selected.introducedDate)}</span></div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Next cut: <span style={{color:(()=>{const s=cycleStatus(selected);return s==="overdue"?"var(--danger)":s==="due"?"var(--amber)":"var(--accent-2)"})(),fontWeight:600}}>{fmtD(nextCutDate(selected))}</span></div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>Total cut cycles: <span style={{color:"var(--text)",fontWeight:600}}>{selected.cutLog?.length||0}</span></div>
                    </div>
                    {selected.status==="active"&&(
                      cutForm ? (
                        <div className="mm-box">
                          <div className="mm-box-t">Log cut event</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                            <div><label className="mm-lbl">Cut date</label>
                              <input type="date" className="mm-inp" value={cutForm.date||""} onChange={e=>setCutForm(f=>({...f,date:e.target.value}))} />
                            </div>
                            <div><label className="mm-lbl">Total cuts taken</label>
                              <input type="number" className="mm-inp" placeholder={(parseInt(selected.plantCount)||1)*(parseInt(selected.cutsPerPlantPerCycle)||8)+" (default)"} value={cutForm.cutsTotal||""} onChange={e=>setCutForm(f=>({...f,cutsTotal:e.target.value}))} />
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                            <div><label className="mm-lbl">Plant health</label>
                              <select className="mm-sel" value={cutForm.health||"good"} onChange={e=>setCutForm(f=>({...f,health:e.target.value}))}>
                                <option value="excellent">Excellent</option>
                                <option value="good">Good</option>
                                <option value="fair">Fair</option>
                                <option value="poor">Poor — consider replacement</option>
                              </select>
                            </div>
                            <div><label className="mm-lbl">Notes</label>
                              <input className="mm-inp" value={cutForm.notes||""} onChange={e=>setCutForm(f=>({...f,notes:e.target.value}))} />
                            </div>
                          </div>
                          {err&&<div style={{fontSize:11,color:"var(--danger)",marginBottom:6}}>{err}</div>}
                          <div style={{display:"flex",gap:6}}>
                            <button className="mm-btn mm-primary" style={{fontSize:11,padding:"5px 12px"}} onClick={logCut}>Log cut & suggest to Clone Scheduler</button>
                            <button className="mm-btn mm-secondary" style={{fontSize:11,padding:"5px 12px"}} onClick={()=>{setCutForm(null);setErr("");}}>Cancel</button>
                          </div>
                        </div>
                      ):(
                        <button className="mm-btn mm-primary" style={{width:"100%",marginTop:4}} onClick={()=>setCutForm({date:new Date().toISOString().split("T")[0]})}>
                          ✂️ Log cut event
                        </button>
                      )
                    )}
                  </div>

                  {/* Cut history */}
                  {selected.cutLog?.length>0&&(
                    <div className="mm-card" style={{marginBottom:12}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:10}}>Cut History</div>
                      <div className="mm-timeline">
                        {[...selected.cutLog].reverse().map((c,i)=>(
                          <div key={c.id} style={{marginBottom:12,position:"relative"}}>
                            <div className="mm-timeline-dot" style={{top:3}}/>
                            <div style={{paddingLeft:12}}>
                              <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>{fmtD(c.date)} — {c.cutsTotal} cuts</div>
                              <div style={{fontSize:11,color:"var(--text-3)"}}>{c.cutsPerPlant} per plant · Health: <span style={{color:c.health==="poor"?"var(--danger)":c.health==="fair"?"var(--amber)":"var(--accent-2)",fontWeight:600}}>{c.health}</span></div>
                              {c.notes&&<div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>{c.notes}</div>}
                              <div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>→ Suggested to Clone Scheduler</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 12-week forecast */}
              {!selected&&(()=>{
                const forecast = buildForecast();
                if(!forecast.length) return null;
                return(
                  <div className="mm-card">
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:10}}>12-Week Cut Forecast</div>
                    {forecast.map((wk,i)=>(
                      <div key={i} className="mm-cut-row">
                        <span style={{color:"var(--text-2)",fontWeight:500}}>Week of {wk.label}</span>
                        <span style={{fontSize:11,color:"var(--text-3)"}}>{wk.moms.map(m=>m.strainName).join(", ")}</span>
                        <span style={{fontWeight:700,color:"var(--accent-2)"}}>{wk.totalCuts} cuts</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
