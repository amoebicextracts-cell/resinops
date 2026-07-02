import { useState, useEffect } from "react";
import StrainCombo from "./StrainCombo.jsx";

const LBS_TO_G=453.592;
function addDays(dt,n){const d=new Date(dt);d.setDate(d.getDate()+n);return d;}
function fmtD(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function daysFromNow(dt){return Math.round((new Date(dt)-new Date())/86400000);}
function isoDate(dt){return new Date(dt).toISOString().split("T")[0];}

// Given a room's harvest date + reset days + veg weeks + rootDays, back-calc clone cut date
function calcCloneCutDate(harvestDate,resetDays,vegWeeks,rootDays){
  if(!harvestDate) return null;
  const transplantReady=addDays(harvestDate,parseInt(resetDays)||7);
  const cloneTransplant=addDays(transplantReady,-(parseInt(vegWeeks||4)*7));
  const cutDate=addDays(cloneTransplant,-parseInt(rootDays||14));
  return{transplantReady,cloneTransplant,cutDate};
}

const CSS=`
  .cs-wrap{padding:24px;flex:1;overflow-y:auto;}
  .cs-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .cs-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .cs-inp:focus{outline:none;border-color:var(--accent);}
  .cs-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .cs-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .cs-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .cs-btn:hover{opacity:0.85;}
  .cs-primary{background:var(--accent);color:#fff;}
  .cs-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .cs-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .cs-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .cs-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .cs-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .cs-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .cs-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .cs-tbl tr:last-child td{border-bottom:none;}
  .cs-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .cs-urgent{background:rgba(200,74,74,0.15);color:var(--danger);}
  .cs-soon{background:rgba(200,150,58,0.15);color:var(--amber);}
  .cs-ok{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .cs-done{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .cs-timeline{display:flex;align-items:center;gap:0;margin:12px 0;}
  .cs-tstep{flex:1;background:var(--surface-2);border:1px solid var(--border);padding:8px 10px;font-size:10px;position:relative;}
  .cs-tstep:first-child{border-radius:6px 0 0 6px;}
  .cs-tstep:last-child{border-radius:0 6px 6px 0;}
  .cs-tstep-l{font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;}
  .cs-tstep-v{font-size:11px;color:var(--text);font-weight:600;margin-top:2px;}
  .cs-arrow{color:var(--text-3);font-size:14px;padding:0 4px;flex-shrink:0;}
`;

const EMPTY_SCHEDULE={spaceId:"",strainName:"",plannedPlants:"",vegWeeks:"4",rootDays:"14",harvestDate:"",status:"upcoming",notes:""};

export default function CloneScheduler(){
  const growMap=JSON.parse(localStorage.getItem("resinops_grow_map")||"[]");
  const cultSpaces=JSON.parse(localStorage.getItem("resinops_spaces")||"[]");
  const [schedules,setSchedules]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_clone_sched")||"[]");}catch{return[];}});
  const [facilityRootDays,setFacilityRootDays]=useState(()=>parseInt(localStorage.getItem("resinops_facility_root_days")||"14"));
  const [facilityVegWeeks,setFacilityVegWeeks]=useState(()=>parseInt(localStorage.getItem("resinops_facility_veg_weeks")||"4"));
  const [form,setForm]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_clone_sched",JSON.stringify(schedules));},[schedules]);
  useEffect(()=>{localStorage.setItem("resinops_facility_root_days",facilityRootDays);},[facilityRootDays]);
  useEffect(()=>{localStorage.setItem("resinops_facility_veg_weeks",facilityVegWeeks);},[facilityVegWeeks]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  // Derive upcoming clone cuts from Grow Map (rooms in cleaning) + Cultivation Scheduler
  const derivedFromGrowMap=growMap.filter(s=>s.lastHarvestDate&&s.resetDays).map(s=>{
    const calc=calcCloneCutDate(s.lastHarvestDate,s.resetDays,facilityVegWeeks,facilityRootDays);
    return{...s,_source:"growmap",_calc:calc};
  });
  const derivedFromCult=cultSpaces.map(s=>{
    // build harvest date from schedule milestones
    const vegMs=parseInt(s.veg||4)*7, flwMs=parseInt(s.flw||9)*7;
    const cut=new Date(s.d+"T12:00:00");
    const harvestDate=addDays(cut,vegMs+flwMs);
    const resetDays=growMap.find(g=>g.name===s.name)?.resetDays||7;
    const calc=calcCloneCutDate(isoDate(harvestDate),resetDays,facilityVegWeeks,facilityRootDays);
    return{id:"cult_"+s.id,name:s.name,strains:s.strains,_source:"cultivation",_calc:calc,_harvestDate:harvestDate};
  });

  function openAdd(){setForm({...EMPTY_SCHEDULE,vegWeeks:String(facilityVegWeeks),rootDays:String(facilityRootDays)});setErr("");}
  function save(){
    if(!form.strainName.trim()){setErr("Enter a strain.");return;}
    const rec={...form,id:form.id||"cs"+Date.now()};
    if(form.id) setSchedules(p=>p.map(x=>x.id===rec.id?rec:x));
    else setSchedules(p=>[...p,rec]);
    setForm(null);setErr("");
  }
  function remove(id){setSchedules(p=>p.filter(x=>x.id!==id));}
  function setStatus(id,st){setSchedules(p=>p.map(x=>x.id===id?{...x,status:st}:x));}

  function urgencyClass(cutDate){
    if(!cutDate) return "cs-ok";
    const d=daysFromNow(cutDate);
    if(d<0) return "cs-done";
    if(d<=3) return "cs-urgent";
    if(d<=10) return "cs-soon";
    return "cs-ok";
  }
  function urgencyLabel(cutDate){
    if(!cutDate) return "—";
    const d=daysFromNow(cutDate);
    if(d<0) return "Cut date passed";
    if(d===0) return "CUT TODAY";
    if(d===1) return "CUT TOMORROW";
    return`In ${d} days`;
  }

  // Manual schedules with calc
  const manualWithCalc=schedules.map(sc=>{
    const space=growMap.find(g=>g.id===sc.spaceId);
    const harvestDate=sc.harvestDate;
    const resetDays=space?.resetDays||7;
    const calc=harvestDate?calcCloneCutDate(harvestDate,resetDays,sc.vegWeeks||facilityVegWeeks,sc.rootDays||facilityRootDays):null;
    return{...sc,_calc:calc,_spaceName:space?.name||""};
  });

  const urgentCount=[...manualWithCalc,...derivedFromCult,...derivedFromGrowMap].filter(s=>{
    const d=s._calc?.cutDate;
    return d&&daysFromNow(d)<=7&&daysFromNow(d)>=0;
  }).length;

  return(
    <>
      <style>{CSS}</style>
      <div className="cs-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Clone Scheduler</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Back-calculates clone cut dates from harvest dates, room reset time, and veg lead</div>
          </div>
          {!form&&<button className="cs-btn cs-primary" onClick={openAdd}>+ Add clone schedule</button>}
        </div>

        {urgentCount>0&&(
          <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"var(--danger)",fontWeight:500}}>
            ✂️ {urgentCount} clone cut{urgentCount>1?"s":""} due within 7 days
          </div>
        )}

        {/* Facility defaults */}
        <div className="cs-card">
          <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:10}}>Facility defaults — override per schedule</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><label className="cs-lbl">Default veg weeks</label><input type="number" min="1" max="16" className="cs-inp" value={facilityVegWeeks} onChange={e=>setFacilityVegWeeks(parseInt(e.target.value)||4)} /></div>
            <div><label className="cs-lbl">Default clone rooting days</label><input type="number" min="7" max="30" className="cs-inp" value={facilityRootDays} onChange={e=>setFacilityRootDays(parseInt(e.target.value)||14)} /></div>
          </div>
        </div>

        {form&&(
          <div className="cs-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>{form.id?"Edit Clone Schedule":"New Clone Schedule"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="cs-lbl">Strain</label><StrainCombo className="cs-inp" value={form.strainName} onChange={(name,obj)=>{ setF("strainName",name); if(obj&&obj.avgFlowerWeeks) setF("rootDays",String(Math.round((parseFloat(obj.avgFlowerWeeks)||8)*7))); }} placeholder="Select or type strain" /></div>
              <div><label className="cs-lbl">Target grow space (from Grow Map)</label>
                <select className="cs-sel" value={form.spaceId} onChange={e=>setF("spaceId",e.target.value)}>
                  <option value="">— Select space —</option>
                  {growMap.map(s=><option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="cs-lbl">Plant count needed</label><input type="number" className="cs-inp" value={form.plannedPlants} onChange={e=>setF("plannedPlants",e.target.value)} /></div>
              <div><label className="cs-lbl">Expected harvest date</label><input type="date" className="cs-inp" value={form.harvestDate} onChange={e=>setF("harvestDate",e.target.value)} /></div>
              <div><label className="cs-lbl">Veg weeks (this run)</label><input type="number" min="1" max="16" className="cs-inp" value={form.vegWeeks} onChange={e=>setF("vegWeeks",e.target.value)} /></div>
              <div><label className="cs-lbl">Rooting days (this strain)</label><input type="number" min="7" max="30" className="cs-inp" value={form.rootDays} onChange={e=>setF("rootDays",e.target.value)} /></div>
            </div>
            <div style={{marginBottom:10}}><label className="cs-lbl">Notes (mother plant location, clone count buffer, etc.)</label><input className="cs-inp" value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {form.harvestDate&&(()=>{
              const space=growMap.find(g=>g.id===form.spaceId);
              const calc=calcCloneCutDate(form.harvestDate,space?.resetDays||7,form.vegWeeks,form.rootDays);
              if(!calc) return null;
              return(
                <div className="cs-timeline">
                  {[["✂️ Clone cut",fmtD(calc.cutDate)],["🌱 Transplant to veg",fmtD(calc.cloneTransplant)],["🏠 Room ready",fmtD(calc.transplantReady)],["🌿 Harvest",fmtD(form.harvestDate)]].map(([l,v],i,arr)=>(
                    <>{i>0&&<div className="cs-arrow">→</div>}
                    <div className="cs-tstep"><div className="cs-tstep-l">{l}</div><div className="cs-tstep-v">{v}</div></div></>
                  ))}
                </div>
              );
            })()}
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="cs-btn cs-primary" onClick={save}>{form.id?"Save changes":"Save schedule"}</button>
              <button className="cs-btn cs-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Derived from Cultivation Scheduler */}
        {derivedFromCult.length>0&&(
          <div className="cs-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>From Cultivation Scheduler — auto-derived cut dates</div>
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="cs-tbl">
                <thead><tr><th>Space</th><th>Strains</th><th>Expected Harvest</th><th>Room Ready</th><th>Clone Cut Date</th><th>Lead Time</th></tr></thead>
                <tbody>
                  {derivedFromCult.map(s=>{
                    const calc=s._calc;
                    const strainNames=(s.strains||[]).map(x=>x.name).join(", ")||"—";
                    const uc=urgencyClass(calc?.cutDate);
                    return(
                      <tr key={s.id}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{s.name}</td>
                        <td style={{fontSize:11}}>{strainNames}</td>
                        <td>{fmtD(s._harvestDate)}</td>
                        <td>{calc?fmtD(calc.transplantReady):"—"}</td>
                        <td style={{fontWeight:600}}>{calc?fmtD(calc.cutDate):"—"}</td>
                        <td><span className={"cs-pill "+uc}>{urgencyLabel(calc?.cutDate)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Manual clone schedules */}
        {manualWithCalc.length>0&&(
          <div className="cs-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Manual clone schedules</div>
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="cs-tbl">
                <thead><tr><th>Strain</th><th>Space</th><th>Plants</th><th>Clone Cut</th><th>Transplant to Veg</th><th>Room Ready</th><th>Harvest</th><th>Lead</th><th></th></tr></thead>
                <tbody>
                  {manualWithCalc.map(sc=>{
                    const c=sc._calc;
                    const uc=urgencyClass(c?.cutDate);
                    return(
                      <tr key={sc.id}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{sc.strainName}</td>
                        <td style={{fontSize:11}}>{sc._spaceName||"—"}</td>
                        <td>{sc.plannedPlants||"—"}</td>
                        <td style={{fontWeight:600,color:"var(--accent-2)"}}>{c?fmtD(c.cutDate):"—"}</td>
                        <td>{c?fmtD(c.cloneTransplant):"—"}</td>
                        <td>{c?fmtD(c.transplantReady):"—"}</td>
                        <td>{sc.harvestDate?fmtD(sc.harvestDate):"—"}</td>
                        <td><span className={"cs-pill "+uc}>{urgencyLabel(c?.cutDate)}</span></td>
                        <td><div style={{display:"flex",gap:5}}>
                          <button className="cs-sm cs-edit" onClick={()=>setForm({...sc})}>Edit</button>
                          <button className="cs-sm cs-del" onClick={()=>remove(sc.id)}>✕</button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {schedules.length===0&&derivedFromCult.length===0&&(
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"40px 24px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:10}}>✂️</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No clone schedules yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Add spaces to the Grow Map and batches to the Cultivation Scheduler — cut dates will derive automatically</div>
          </div>
        )}
      </div>
    </>
  );
}
