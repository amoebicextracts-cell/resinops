import { useState, useEffect } from "react";

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function fmtDT(dt){return dt?new Date(dt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—";}
const DEPT=["Cultivation","Post-Harvest","Extraction","Processing","Packaging","QC / Lab","Maintenance","All"];
const DEV_TYPES=["Process Deviation","Equipment Failure","Contamination / Environmental","Documentation Error","Personnel / Training","Material / Input Issue","Other"];

const CSS=`
  .gh-wrap{padding:24px;flex:1;overflow-y:auto;}
  .gh-tabs{display:flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:3px;margin-bottom:18px;}
  .gh-tab{flex:1;padding:7px 6px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:11px;font-weight:500;color:var(--text-2);background:none;}
  .gh-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.15);}
  .gh-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .gh-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .gh-inp:focus{outline:none;border-color:var(--accent);}
  .gh-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .gh-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .gh-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .gh-btn:hover{opacity:0.85;}
  .gh-primary{background:var(--accent);color:#fff;}
  .gh-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .gh-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .gh-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .gh-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .gh-box{background:var(--surface-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;}
  .gh-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .gh-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .gh-tbl th{text-align:left;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .gh-tbl td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:top;}
  .gh-tbl tr:last-child td{border-bottom:none;}
  .gh-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .dev-open{background:rgba(200,74,74,0.15);color:var(--danger);}
  .dev-closed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sop-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sop-draft{background:rgba(200,150,58,0.15);color:var(--amber);}
  .sop-retired{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .signoff-row{display:flex;align-items:center;gap:10;background:var(--surface-2);border-radius:6px;padding:8px 10px;margin-bottom:6px;}
  .batch-section{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:12px;}
  .batch-section-t{font-size:11px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;}
`;

const EMPTY_SOP={title:"",version:"1.0",department:"Cultivation",effectiveDate:"",approvedBy:"",status:"draft",linkedStepTypes:"",content:""};
const EMPTY_DEV={batchType:"harvest",batchId:"",batchName:"",stepName:"",date:new Date().toISOString().split("T")[0],type:"Process Deviation",description:"",rootCause:"",correctiveAction:"",preventiveAction:"",reportedById:"",closedById:"",status:"open",sopId:""};
const EMPTY_SHIFT={date:new Date().toISOString().split("T")[0],department:"Cultivation",supervisorId:"",notes:""};
const EMPTY_SIGNOFF={batchType:"harvest",batchId:"",stepName:"",performedById:"",verifiedById:"",timestamp:new Date().toISOString().slice(0,16),notes:""};

export default function GMPHub(){
  const [tab,setTab]=useState("shifts");
  const employees=JSON.parse(localStorage.getItem("resinops_employees")||"[]");
  const harvestBatches=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
  const prodBatches=JSON.parse(localStorage.getItem("resinops_prod")||"[]").filter(b=>!b.isLinked);

  const [sops,setSops]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_sops")||"[]");}catch{return[];}});
  const [deviations,setDeviations]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_deviations")||"[]");}catch{return[];}});
  const [shifts,setShifts]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_shifts")||"[]");}catch{return[];}});
  const [signoffs,setSignoffs]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_signoffs")||"[]");}catch{return[];}});

  const [sopForm,setSopForm]=useState(null);
  const [devForm,setDevForm]=useState(null);
  const [shiftForm,setShiftForm]=useState(null);
  const [soForm,setSoForm]=useState(null); // sign-off form
  const [shiftEntries,setShiftEntries]=useState([]);
  const [batchRecordId,setBatchRecordId]=useState({type:"harvest",id:""});
  const [err,setErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_sops",JSON.stringify(sops));},[sops]);
  useEffect(()=>{localStorage.setItem("resinops_deviations",JSON.stringify(deviations));},[deviations]);
  useEffect(()=>{localStorage.setItem("resinops_shifts",JSON.stringify(shifts));},[shifts]);
  useEffect(()=>{localStorage.setItem("resinops_signoffs",JSON.stringify(signoffs));},[signoffs]);

  function empName(id){return employees.find(e=>e.id===id)?.name||"—";}

  // ── SOPs ──
  function saveSop(){
    if(!sopForm.title.trim()){setErr("Enter SOP title.");return;}
    const s={...sopForm,id:sopForm.id||"sop"+Date.now()};
    if(sopForm.id) setSops(p=>p.map(x=>x.id===s.id?s:x));
    else setSops(p=>[...p,s]);
    setSopForm(null);setErr("");
  }

  // ── Deviations ──
  function saveDev(){
    if(!devForm.description.trim()){setErr("Describe the deviation.");return;}
    const d={...devForm,id:devForm.id||"dev"+Date.now()};
    if(devForm.id) setDeviations(p=>p.map(x=>x.id===d.id?x:x));
    else setDeviations(p=>[...p,d]);
    setDevForm(null);setErr("");
  }

  // ── Shifts ──
  function saveShift(){
    const validEntries=shiftEntries.filter(e=>e.employeeId&&(e.timeIn||e.timeOut));
    const s={...shiftForm,id:shiftForm.id||"sh"+Date.now(),entries:validEntries};
    if(shiftForm.id) setShifts(p=>p.map(x=>x.id===s.id?s:x));
    else setShifts(p=>[...p,s]);
    setShiftForm(null);setShiftEntries([]);setErr("");
  }
  function addShiftEntry(){setShiftEntries(p=>[...p,{id:"se"+Date.now(),employeeId:"",timeIn:"",timeOut:"",batchType:"harvest",batchId:"",hoursWorked:"",taskNotes:""}]);}
  function setEntry(i,k,v){setShiftEntries(p=>p.map((e,idx)=>idx===i?{...e,[k]:v}:e));}
  function calcHours(tin,tout){if(!tin||!tout)return "";const d=(new Date("1970-01-01T"+tout)-new Date("1970-01-01T"+tin))/3600000;return d>0?d.toFixed(2):"";}

  // ── Sign-offs ──
  function saveSo(){
    if(!soForm.stepName.trim()||!soForm.performedById){setErr("Step name and performed-by are required.");return;}
    const s={...soForm,id:soForm.id||"so"+Date.now()};
    if(soForm.id) setSignoffs(p=>p.map(x=>x.id===s.id?s:x));
    else setSignoffs(p=>[...p,s]);
    setSoForm(null);setErr("");
  }

  // ── Batch Record ──
  function BatchRecord(){
    const {type,id}=batchRecordId;
    if(!id) return <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>Select a batch above to view its GMP record.</div>;
    const batch=type==="harvest"?harvestBatches.find(b=>String(b.id)===id):prodBatches.find(b=>String(b.id)===id);
    if(!batch) return <div style={{color:"var(--text-3)",padding:16}}>Batch not found.</div>;
    const batchSignoffs=signoffs.filter(s=>s.batchType===type&&String(s.batchId)===id);
    const batchDevs=deviations.filter(d=>d.batchType===type&&String(d.batchId)===id);
    const qcTests=JSON.parse(localStorage.getItem("resinops_qc_tests")||"[]").filter(t=>t.batchType===type&&String(t.batchId)===id);
    const batchShiftEntries=shifts.flatMap(sh=>sh.entries.filter(e=>e.batchType===type&&String(e.batchId)===id).map(e=>({...e,shiftDate:sh.date,department:sh.department})));
    const cultivationInputs=type==="harvest"?JSON.parse(localStorage.getItem("resinops_cult_inputs")||"[]").filter(ci=>{
      const sp=JSON.parse(localStorage.getItem("resinops_spaces")||"[]").find(s=>String(s.id)===String(ci.spaceId));
      return sp&&batch.spaceName&&sp.name===batch.spaceName;
    }):[];
    return(
      <div>
        <div style={{background:"var(--surface-2)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:700,color:"var(--text)",marginBottom:4}}>{type==="harvest"?batch.strainName:batch.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,auto)",gap:16,width:"fit-content"}}>
            {[["Type",type==="harvest"?"Harvest Batch":"Production Batch"],["Date",fmtD(batch.d)],["Space",batch.spaceName||"—"],["Status",batch.status||"—"]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div><div style={{fontSize:12,color:"var(--text)",fontWeight:500}}>{v}</div></div>
            ))}
          </div>
        </div>

        {batchSignoffs.length>0&&(
          <div className="batch-section"><div className="batch-section-t">✅ Step Sign-Offs ({batchSignoffs.length})</div>
            <table className="gh-tbl"><thead><tr><th>Step</th><th>Performed By</th><th>Verified By</th><th>Timestamp</th><th>Notes</th></tr></thead>
              <tbody>{batchSignoffs.map(s=><tr key={s.id}><td style={{fontWeight:500}}>{s.stepName}</td><td>{empName(s.performedById)}</td><td>{s.verifiedById?empName(s.verifiedById):"Not required"}</td><td style={{fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(s.timestamp)}</td><td style={{fontSize:11,color:"var(--text-3)"}}>{s.notes||"—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {batchShiftEntries.length>0&&(
          <div className="batch-section"><div className="batch-section-t">👥 Labor Entries ({batchShiftEntries.length})</div>
            <table className="gh-tbl"><thead><tr><th>Date</th><th>Employee</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>Task</th></tr></thead>
              <tbody>{batchShiftEntries.map((e,i)=><tr key={i}><td>{fmtD(e.shiftDate)}</td><td>{empName(e.employeeId)}</td><td>{e.timeIn||"—"}</td><td>{e.timeOut||"—"}</td><td>{e.hoursWorked||"—"}</td><td style={{fontSize:11,color:"var(--text-3)"}}>{e.taskNotes||"—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {cultivationInputs.length>0&&(
          <div className="batch-section"><div className="batch-section-t">🌿 Cultivation Inputs ({cultivationInputs.length})</div>
            <table className="gh-tbl"><thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Rate</th><th>Applicator</th></tr></thead>
              <tbody>{cultivationInputs.map(ci=><tr key={ci.id}><td style={{whiteSpace:"nowrap"}}>{fmtD(ci.date)}</td><td style={{fontSize:11}}>{ci.type}</td><td>{ci.product||ci.species}</td><td style={{fontSize:11}}>{ci.rate} {ci.rateUnit}</td><td style={{fontSize:11}}>{ci.applicatorName||"In-house"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {qcTests.length>0&&(
          <div className="batch-section"><div className="batch-section-t">🔬 QC / Lab Tests ({qcTests.length})</div>
            {qcTests.map(t=>(
              <div key={t.id} style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,marginBottom:6}}>
                <span style={{fontWeight:500}}>{t.labName}</span>
                <span>{t.sampleId}</span>
                <span style={{color:"var(--accent-2)"}}>{t.thca&&t.thca+"%  THCa"}</span>
                <span>{t.totalTerpenes&&t.totalTerpenes+"% terps"}</span>
                <span style={{color:t.overallPass?"var(--accent-2)":"var(--danger)",fontWeight:600}}>{t.overallPass===true?"PASS":t.overallPass===false?"FAIL":"Pending"}</span>
              </div>
            ))}
          </div>
        )}

        {batchDevs.length>0&&(
          <div className="batch-section" style={{borderLeft:"3px solid var(--danger)"}}><div className="batch-section-t" style={{color:"var(--danger)"}}>⚠ Deviations ({batchDevs.length})</div>
            {batchDevs.map(d=>(
              <div key={d.id} style={{marginBottom:10,fontSize:12}}>
                <div style={{fontWeight:600}}>{d.type} — {fmtD(d.date)} <span className={"gh-pill dev-"+d.status} style={{marginLeft:6}}>{d.status}</span></div>
                <div style={{color:"var(--text-2)",marginTop:2}}>{d.description}</div>
                {d.correctiveAction&&<div style={{color:"var(--text-3)",marginTop:2}}>CA: {d.correctiveAction}</div>}
              </div>
            ))}
          </div>
        )}

        {[batchSignoffs,batchShiftEntries,cultivationInputs,qcTests,batchDevs].every(a=>!a.length)&&(
          <div style={{color:"var(--text-3)",fontSize:12,padding:16,textAlign:"center"}}>No GMP records attached to this batch yet. Add sign-offs, log inputs, and enter QC results to build the batch record.</div>
        )}
      </div>
    );
  }

  const openDevs=deviations.filter(d=>d.status==="open").length;

  return(
    <>
      <style>{CSS}</style>
      <div className="gh-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>GMP Hub</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>SOP library, deviation register, shift log, step sign-offs, and digital batch records</div>
        </div>
        {openDevs>0&&<div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--danger)",fontWeight:500}}>⚠ {openDevs} open deviation{openDevs>1?"s":""} require CAPA sign-off</div>}

        <div className="gh-tabs">
          {[["shifts","🕐 Shift Log"],["signoffs","✅ Step Sign-Offs"],["record","📄 Batch Record"],["cleaning","🧹 Cleaning Log"],["deviations","⚠ Deviations"],["sops","📚 SOP Library"]].map(([v,l])=>(
            <button key={v} className={"gh-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── SHIFT LOG ── */}
        {tab==="shifts"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!shiftForm&&<button className="gh-btn gh-primary" onClick={()=>{setShiftForm({...EMPTY_SHIFT});setShiftEntries([]);}}>+ Log shift</button>}
            </div>
            {shiftForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Shift date</label><input type="date" className="gh-inp" value={shiftForm.date} onChange={e=>setShiftForm(f=>({...f,date:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Department</label><select className="gh-sel" value={shiftForm.department} onChange={e=>setShiftForm(f=>({...f,department:e.target.value}))}>{DEPT.map(d=><option key={d}>{d}</option>)}</select></div>
                  <div><label className="gh-lbl">Shift supervisor</label><select className="gh-sel" value={shiftForm.supervisorId} onChange={e=>setShiftForm(f=>({...f,supervisorId:e.target.value}))}><option value="">— Select —</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                </div>
                <div className="gh-box">
                  <div className="gh-box-t">Employee entries</div>
                  {shiftEntries.map((entry,i)=>(
                    <div key={entry.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 2fr auto",gap:8,marginBottom:8,alignItems:"flex-end"}}>
                      <div><label className="gh-lbl">Employee</label><select className="gh-sel" value={entry.employeeId} onChange={e=>{setEntry(i,"employeeId",e.target.value);}}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                      <div><label className="gh-lbl">Time in</label><input type="time" className="gh-inp" value={entry.timeIn} onChange={e=>{const h=calcHours(e.target.value,entry.timeOut);setEntry(i,"timeIn",e.target.value);setEntry(i,"hoursWorked",h);}} /></div>
                      <div><label className="gh-lbl">Time out</label><input type="time" className="gh-inp" value={entry.timeOut} onChange={e=>{const h=calcHours(entry.timeIn,e.target.value);setEntry(i,"timeOut",e.target.value);setEntry(i,"hoursWorked",h);}} /></div>
                      <div><label className="gh-lbl">Hrs</label><input className="gh-inp" value={entry.hoursWorked} readOnly style={{textAlign:"center"}} /></div>
                      <div><label className="gh-lbl">Batch</label><select className="gh-sel" value={entry.batchId} onChange={e=>setEntry(i,"batchId",e.target.value)}><option value="">—</option>{harvestBatches.map(b=><option key={"h"+b.id} value={b.id}>{b.strainName}</option>)}{prodBatches.map(b=><option key={"p"+b.id} value={b.id}>{b.name}</option>)}</select></div>
                      <div><label className="gh-lbl">Tasks performed</label><input className="gh-inp" value={entry.taskNotes} onChange={e=>setEntry(i,"taskNotes",e.target.value)} /></div>
                      <button className="gh-sm" style={{background:"rgba(200,74,74,0.1)",color:"var(--danger)",border:"none",cursor:"pointer",borderRadius:4,padding:"0 8px",alignSelf:"flex-end",height:32}} onClick={()=>setShiftEntries(p=>p.filter((_,idx)=>idx!==i))}>✕</button>
                    </div>
                  ))}
                  <button className="gh-btn gh-secondary" style={{fontSize:11,padding:"4px 10px"}} onClick={addShiftEntry}>+ Add employee</button>
                </div>
                <div style={{marginBottom:10}}><label className="gh-lbl">Shift notes</label><textarea className="gh-inp" rows={2} style={{resize:"vertical"}} value={shiftForm.notes} onChange={e=>setShiftForm(f=>({...f,notes:e.target.value}))} /></div>
                <div style={{display:"flex",gap:8}}>
                  <button className="gh-btn gh-primary" onClick={saveShift}>Save shift</button>
                  <button className="gh-btn gh-secondary" onClick={()=>{setShiftForm(null);setShiftEntries([]);}}>Cancel</button>
                </div>
              </div>
            )}
            {shifts.length===0&&!shiftForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No shifts logged yet.</div>}
            {shifts.length>0&&<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="gh-tbl">
                <thead><tr><th>Date</th><th>Dept</th><th>Supervisor</th><th>Staff</th><th>Notes</th><th></th></tr></thead>
                <tbody>{[...shifts].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=>(
                  <tr key={s.id}><td>{fmtD(s.date)}</td><td>{s.department}</td><td>{empName(s.supervisorId)}</td>
                    <td style={{fontSize:11}}>{(s.entries||[]).map(e=>empName(e.employeeId)).filter(Boolean).join(", ")||"—"}</td>
                    <td style={{fontSize:11,color:"var(--text-3)"}}>{s.notes||"—"}</td>
                    <td><button className="gh-sm gh-del" onClick={()=>setShifts(p=>p.filter(x=>x.id!==s.id))}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          </div>
        )}

        {/* ── STEP SIGN-OFFS ── */}
        {tab==="signoffs"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!soForm&&<button className="gh-btn gh-primary" onClick={()=>setSoForm({...EMPTY_SIGNOFF})}>+ Record sign-off</button>}
            </div>
            {soForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Batch type</label><select className="gh-sel" value={soForm.batchType} onChange={e=>setSoForm(f=>({...f,batchType:e.target.value,batchId:""}))}><option value="harvest">Harvest Batch</option><option value="production">Production Batch</option></select></div>
                  <div><label className="gh-lbl">Batch</label><select className="gh-sel" value={soForm.batchId} onChange={e=>setSoForm(f=>({...f,batchId:e.target.value}))}>
                    <option value="">— Select batch —</option>
                    {(soForm.batchType==="harvest"?harvestBatches:prodBatches).map(b=><option key={b.id} value={b.id}>{soForm.batchType==="harvest"?b.strainName:b.name}</option>)}
                  </select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Step / operation name</label><input className="gh-inp" value={soForm.stepName} onChange={e=>setSoForm(f=>({...f,stepName:e.target.value}))} placeholder="e.g. Bucking, Trim, Pack, Extraction start…" /></div>
                  <div><label className="gh-lbl">Date / time completed</label><input type="datetime-local" className="gh-inp" value={soForm.timestamp} onChange={e=>setSoForm(f=>({...f,timestamp:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Performed by</label><select className="gh-sel" value={soForm.performedById} onChange={e=>setSoForm(f=>({...f,performedById:e.target.value}))}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Verified by (supervisor)</label><select className="gh-sel" value={soForm.verifiedById} onChange={e=>setSoForm(f=>({...f,verifiedById:e.target.value}))}><option value="">— Optional —</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div><label className="gh-lbl">Notes</label><input className="gh-inp" value={soForm.notes} onChange={e=>setSoForm(f=>({...f,notes:e.target.value}))} /></div>
                </div>
                {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="gh-btn gh-primary" onClick={saveSo}>Save sign-off</button>
                  <button className="gh-btn gh-secondary" onClick={()=>{setSoForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}
            {signoffs.length===0&&!soForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No step sign-offs yet. Record each completed step for the GMP batch record.</div>}
            {signoffs.length>0&&<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="gh-tbl">
                <thead><tr><th>Batch</th><th>Step</th><th>Performed By</th><th>Verified By</th><th>Date/Time</th><th>Notes</th><th></th></tr></thead>
                <tbody>{[...signoffs].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(s=>{
                  const batch=s.batchType==="harvest"?harvestBatches.find(b=>String(b.id)===String(s.batchId)):prodBatches.find(b=>String(b.id)===String(s.batchId));
                  return(<tr key={s.id}>
                    <td style={{fontSize:11}}>{batch?s.batchType==="harvest"?batch.strainName:batch.name:s.batchId}</td>
                    <td style={{fontWeight:500,color:"var(--text)"}}>{s.stepName}</td>
                    <td>{empName(s.performedById)}</td><td>{s.verifiedById?empName(s.verifiedById):"—"}</td>
                    <td style={{fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(s.timestamp)}</td>
                    <td style={{fontSize:11,color:"var(--text-3)"}}>{s.notes||"—"}</td>
                    <td><button className="gh-sm gh-del" onClick={()=>setSignoffs(p=>p.filter(x=>x.id!==s.id))}>✕</button></td>
                  </tr>);
                })}</tbody>
              </table>
            </div>}
          </div>
        )}

        {/* ── BATCH RECORD ── */}
        {tab==="record"&&(
          <div className="gh-card">
            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:16}}>
              <div><label className="gh-lbl">Batch type</label><select className="gh-sel" value={batchRecordId.type} onChange={e=>setBatchRecordId(b=>({...b,type:e.target.value,id:""}))}>
                <option value="harvest">Harvest Batch</option><option value="production">Production Batch</option>
              </select></div>
              <div><label className="gh-lbl">Select batch to view GMP record</label><select className="gh-sel" value={batchRecordId.id} onChange={e=>setBatchRecordId(b=>({...b,id:e.target.value}))}>
                <option value="">— Select batch —</option>
                {(batchRecordId.type==="harvest"?harvestBatches:prodBatches).map(b=><option key={b.id} value={b.id}>{batchRecordId.type==="harvest"?b.strainName+" ("+fmtD(b.d)+")":b.name}</option>)}
              </select></div>
            </div>
            <BatchRecord />
          </div>
        )}

        )}

        {/* ── CLEANING LOG ── */}
        {tab==="cleaning"&&(()=>{
          // Read cleaning logs from both Facility Map and Grow Map rooms
          const facilityRooms=JSON.parse(localStorage.getItem("resinops_facility_map")||"[]");
          const growRooms=JSON.parse(localStorage.getItem("resinops_grow_map")||"[]");
          const allRooms=[...facilityRooms,...growRooms];
          const allCleanLogs=allRooms.flatMap(r=>(r.cleanLog||[]).map(c=>({...c,roomName:r.name,roomType:r.type||""})))
            .sort((a,b)=>new Date(b.date)-new Date(a.date));
          const overdueFacility=facilityRooms.filter(r=>{
            if(r.status==="inactive") return false;
            const last=r.cleanLog?.slice(-1)[0]?.date;
            return !last||Math.round((new Date()-new Date(last))/86400000)>=(parseInt(r.cleanIntervalDays)||7);
          });
          return(
            <div className="gh-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Facility & Room Cleaning Log</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>Cross-facility cleaning records — log cleaning events in the Facility Map module per room</div>
                </div>
                {overdueFacility.length>0&&(
                  <div style={{background:"rgba(200,150,58,0.12)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--amber)"}}>
                    ⚠ {overdueFacility.length} space{overdueFacility.length!==1?"s":""} overdue: {overdueFacility.map(r=>r.name).join(", ")}
                  </div>
                )}
              </div>
              {allCleanLogs.length===0?(
                <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>
                  <div style={{fontSize:24,marginBottom:8}}>🧹</div>
                  <div style={{fontWeight:500,marginBottom:4}}>No cleaning events logged</div>
                  <div style={{fontSize:12}}>Go to Facility Map → select a space → Log cleaning event</div>
                </div>
              ):(
                <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr>
                      {["Date","Room / Space","Type","Clean Type","Performed By","Notes"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--text-3)",borderBottom:"1px solid var(--border)",background:"var(--surface-2)"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {allCleanLogs.map((c,i)=>(
                        <tr key={c.id||i} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"transparent":"var(--surface-2)"}}>
                          <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:"var(--text-2)"}}>{c.date}</td>
                          <td style={{padding:"7px 10px",fontWeight:500,color:"var(--text)"}}>{c.roomName}</td>
                          <td style={{padding:"7px 10px",fontSize:11,color:"var(--text-3)"}}>{c.roomType}</td>
                          <td style={{padding:"7px 10px"}}>{c.type}</td>
                          <td style={{padding:"7px 10px"}}>{c.by}</td>
                          <td style={{padding:"7px 10px",color:"var(--text-3)",fontSize:11}}>{c.notes||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── DEVIATIONS ── */}
        {tab==="deviations"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!devForm&&<button className="gh-btn gh-primary" onClick={()=>setDevForm({...EMPTY_DEV})}>+ Log deviation</button>}
            </div>
            {devForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Deviation type</label><select className="gh-sel" value={devForm.type} onChange={e=>setDevForm(f=>({...f,type:e.target.value}))}>{DEV_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className="gh-lbl">Date</label><input type="date" className="gh-inp" value={devForm.date} onChange={e=>setDevForm(f=>({...f,date:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Status</label><select className="gh-sel" value={devForm.status} onChange={e=>setDevForm(f=>({...f,status:e.target.value}))}><option value="open">Open</option><option value="closed">Closed / CAPA complete</option></select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Batch type</label><select className="gh-sel" value={devForm.batchType} onChange={e=>setDevForm(f=>({...f,batchType:e.target.value,batchId:""}))}><option value="harvest">Harvest</option><option value="production">Production</option><option value="cultivation">Cultivation</option></select></div>
                  <div><label className="gh-lbl">Related batch</label><select className="gh-sel" value={devForm.batchId} onChange={e=>setDevForm(f=>({...f,batchId:e.target.value}))}>
                    <option value="">— None / facility-wide —</option>
                    {(devForm.batchType==="harvest"?harvestBatches:prodBatches).map(b=><option key={b.id} value={b.id}>{devForm.batchType==="harvest"?b.strainName:b.name}</option>)}
                  </select></div>
                </div>
                {[["stepName","Step / area where deviation occurred"],["description","Description of what happened"],["rootCause","Root cause analysis"],["correctiveAction","Corrective action (CA) taken"],["preventiveAction","Preventive action (PA) — how to prevent recurrence"]].map(([k,l])=>(
                  <div key={k} style={{marginBottom:10}}><label className="gh-lbl">{l}</label><textarea className="gh-inp" rows={2} style={{resize:"vertical"}} value={devForm[k]} onChange={e=>setDevForm(f=>({...f,[k]:e.target.value}))} /></div>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Reported by</label><select className="gh-sel" value={devForm.reportedById} onChange={e=>setDevForm(f=>({...f,reportedById:e.target.value}))}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div><label className="gh-lbl">Closed / verified by</label><select className="gh-sel" value={devForm.closedById} onChange={e=>setDevForm(f=>({...f,closedById:e.target.value}))}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="gh-btn gh-primary" onClick={saveDev}>{devForm.id?"Save changes":"Log deviation"}</button>
                  <button className="gh-btn gh-secondary" onClick={()=>{setDevForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}
            {deviations.length===0&&!devForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No deviations logged. Good.</div>}
            {deviations.length>0&&<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="gh-tbl">
                <thead><tr><th>Date</th><th>Type</th><th>Batch</th><th>Description</th><th>CA Summary</th><th>Reported</th><th>Status</th><th></th></tr></thead>
                <tbody>{[...deviations].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(d=>(
                  <tr key={d.id}>
                    <td style={{whiteSpace:"nowrap"}}>{fmtD(d.date)}</td>
                    <td style={{fontSize:11}}>{d.type}</td>
                    <td style={{fontSize:11}}>{d.batchId?((d.batchType==="harvest"?harvestBatches:prodBatches).find(b=>String(b.id)===d.batchId)?.[d.batchType==="harvest"?"strainName":"name"]||"—"):"—"}</td>
                    <td style={{maxWidth:200,fontSize:11}}>{d.description?.slice(0,80)}{d.description?.length>80?"…":""}</td>
                    <td style={{maxWidth:160,fontSize:11,color:"var(--text-3)"}}>{d.correctiveAction?.slice(0,60)||"—"}</td>
                    <td style={{fontSize:11}}>{empName(d.reportedById)}</td>
                    <td><span className={"gh-pill dev-"+d.status}>{d.status}</span></td>
                    <td><div style={{display:"flex",gap:5}}>
                      <button className="gh-sm gh-edit" onClick={()=>setDevForm({...d})}>Edit</button>
                      <button className="gh-sm gh-del" onClick={()=>setDeviations(p=>p.filter(x=>x.id!==d.id))}>✕</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          </div>
        )}

        {/* ── SOP LIBRARY ── */}
        {tab==="sops"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!sopForm&&<button className="gh-btn gh-primary" onClick={()=>setSopForm({...EMPTY_SOP})}>+ Add SOP</button>}
            </div>
            {sopForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">SOP title</label><input className="gh-inp" value={sopForm.title} onChange={e=>setSopForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Harvest & Bucking Procedure" /></div>
                  <div><label className="gh-lbl">Version</label><input className="gh-inp" value={sopForm.version} onChange={e=>setSopForm(f=>({...f,version:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Department</label><select className="gh-sel" value={sopForm.department} onChange={e=>setSopForm(f=>({...f,department:e.target.value}))}>{DEPT.map(d=><option key={d}>{d}</option>)}</select></div>
                  <div><label className="gh-lbl">Status</label><select className="gh-sel" value={sopForm.status} onChange={e=>setSopForm(f=>({...f,status:e.target.value}))}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Effective date</label><input type="date" className="gh-inp" value={sopForm.effectiveDate} onChange={e=>setSopForm(f=>({...f,effectiveDate:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Approved by</label><input className="gh-inp" value={sopForm.approvedBy} onChange={e=>setSopForm(f=>({...f,approvedBy:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Governs steps (comma-separated)</label><input className="gh-inp" value={sopForm.linkedStepTypes} onChange={e=>setSopForm(f=>({...f,linkedStepTypes:e.target.value}))} placeholder="Bucking, Trimming, Packaging…" /></div>
                </div>
                <div style={{marginBottom:10}}><label className="gh-lbl">SOP content / procedure summary</label><textarea className="gh-inp" rows={6} style={{resize:"vertical"}} value={sopForm.content} onChange={e=>setSopForm(f=>({...f,content:e.target.value}))} placeholder="Describe the procedure, required PPE, critical control points, and acceptance criteria…" /></div>
                {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="gh-btn gh-primary" onClick={saveSop}>{sopForm.id?"Save changes":"Add SOP"}</button>
                  <button className="gh-btn gh-secondary" onClick={()=>{setSopForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}
            {sops.length===0&&!sopForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No SOPs yet. Add your facility procedures here — each SOP can be linked to batch steps.</div>}
            {sops.length>0&&sops.map(s=>(
              <div key={s.id} style={{border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{s.title} <span style={{fontSize:10,color:"var(--text-3)",fontWeight:400}}>v{s.version}</span></div>
                    <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>{s.department} · Effective {fmtD(s.effectiveDate)} · Approved by {s.approvedBy||"—"}</div>
                    {s.linkedStepTypes&&<div style={{fontSize:10,color:"var(--accent-2)",marginTop:3}}>Governs: {s.linkedStepTypes}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span className={"gh-pill sop-"+s.status}>{s.status}</span>
                    <button className="gh-sm gh-edit" onClick={()=>setSopForm({...s})}>Edit</button>
                    <button className="gh-sm gh-del" onClick={()=>setSops(p=>p.filter(x=>x.id!==s.id))}>✕</button>
                  </div>
                </div>
                {s.content&&<div style={{fontSize:11,color:"var(--text-2)",marginTop:8,borderTop:"1px solid var(--border)",paddingTop:8,whiteSpace:"pre-wrap"}}>{s.content.slice(0,300)}{s.content.length>300?"…":""}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
