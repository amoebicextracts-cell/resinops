import { useState, useEffect } from "react";
import { db } from "./lib/db";

const FACILITY_ROOM_TYPES = [
  "Processing Room","Dry / Cure Room","Packaging Room","Extraction Lab",
  "Trim Room","Pre-Roll Room","Storage — Finished Goods","Storage — Raw Material",
  "Cold Storage","Compliance Office","Receiving / Shipping","Waste Storage",
  "Break Room","Maintenance Shop","Loading Dock","Other",
];

const CLEAN_TYPES = ["Full Sanitation","Equipment Clean","Surface Wipe-Down","Deep Clean","Inspection Clean"];

function fmtD(dt){ return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"; }
function daysAgo(dt){ return dt?Math.round((new Date()-new Date(dt))/86400000):null; }

const CSS = `
  .fm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .fm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:14px;}
  .fm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .fm-inp:focus{outline:none;border-color:var(--accent);}
  .fm-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .fm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .fm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .fm-primary{background:var(--accent);color:#fff;}
  .fm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .fm-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .fm-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .fm-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .fm-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .fm-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .fm-stat{background:var(--surface-2);border-radius:8px;padding:10px 14px;text-align:center;}
  .fm-stat-v{font-size:22px;font-weight:700;color:var(--accent-2);}
  .fm-stat-l{font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;}
  .fm-room{background:var(--surface);border:1px solid var(--border-2);border-radius:8px;padding:14px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;}
  .fm-room:hover{border-color:var(--accent);}
  .fm-room.selected{border-color:var(--accent);background:rgba(74,124,89,0.04);}
  .fm-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .pill-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .pill-cleaning{background:rgba(200,150,58,0.2);color:var(--amber);}
  .pill-inactive{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .fm-clean-row{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:7px;margin-bottom:6px;font-size:12px;}
  .fm-warn{background:rgba(200,150,58,0.1);border:1px solid rgba(200,150,58,0.3);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:12px;}
  .fm-tab{padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:'Inter',sans-serif;}
  .fm-tab.active{background:var(--accent);color:#fff;}
  .fm-tab:not(.active){background:var(--surface-2);color:var(--text-2);}
  .fm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
`;

const EMPTY_ROOM = {
  id:"", name:"", type:"Processing Room", sqft:"", status:"active",
  assignedBatchIds:[], cleanIntervalDays:7, notes:"", cleanLog:[],
};

const EMPTY_CLEAN = {
  date: new Date().toISOString().split("T")[0],
  type:"Full Sanitation", by:"", notes:"", batchId:"",
};

export default function FacilityMap(){
  const [prodBatches, setProdBatches] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [rooms, setRooms] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem("resinops_facility_map")||"[]"); }catch{ return []; }
  });
  const [tab, setTab] = useState("rooms");
  const [form, setForm] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [cleanForm, setCleanForm] = useState(null);
  const [err, setErr] = useState("");


  const setF = (k,v) => setForm(f=>({...f,[k]:v}));
  const selected = rooms.find(r=>r.id===selectedId);

  // Rooms that need cleaning soon
  const cleanAlerts = rooms.filter(r=>{
    if(!r.cleanIntervalDays||r.status!=="active") return false;
    const lastClean = r.cleanLog?.slice(-1)[0]?.date;
    if(!lastClean) return true;
    return daysAgo(lastClean) >= parseInt(r.cleanIntervalDays)-1;
  });

  function saveRoom(){
    if(!form.name.trim()){ setErr("Room name is required."); return; }
    const rec = {...form, id: form.id||"fac_"+Date.now(), cleanLog: form.cleanLog||[]};
    if(form.id) setRooms(p=>p.map(r=>r.id===rec.id?rec:r));
    else setRooms(p=>[...p,rec]);
    setForm(null); setErr("");
  }

  function logClean(){
    if(!cleanForm.by.trim()){ setErr("Enter who performed the cleaning."); return; }
    const entry = {...cleanForm, id:"cl_"+Date.now()};
    setRooms(p=>p.map(r=>r.id===selectedId?{...r,cleanLog:[...(r.cleanLog||[]),entry]}:r));
    setCleanForm(null); setErr("");
  }

  function toggleBatch(roomId, batchId){
    setRooms(p=>p.map(r=>{
      if(r.id!==roomId) return r;
      const has = (r.assignedBatchIds||[]).includes(batchId);
      return {...r, assignedBatchIds: has
        ? r.assignedBatchIds.filter(id=>id!==batchId)
        : [...(r.assignedBatchIds||[]), batchId]};
    }));
  }

  const allCleanLogs = rooms.flatMap(r=>(r.cleanLog||[]).map(c=>({...c,roomName:r.name,roomId:r.id}))).sort((a,b)=>new Date(b.date)-new Date(a.date));

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading facility map…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="fm-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <!-- title removed - shown in app header -->
          </div>
          {!form&&tab==="rooms"&&<button className="fm-btn fm-primary" onClick={()=>setForm({...EMPTY_ROOM})}>+ Add space</button>}
        </div>

        {/* Stats */}
        {!form&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            <div className="fm-stat"><div className="fm-stat-v">{rooms.filter(r=>r.status==="active").length}</div><div className="fm-stat-l">Active spaces</div></div>
            <div className="fm-stat"><div className="fm-stat-v">{rooms.reduce((a,r)=>a+(parseFloat(r.sqft)||0),0).toLocaleString()}</div><div className="fm-stat-l">Total sq ft</div></div>
            <div className="fm-stat"><div className="fm-stat-v" style={{color:cleanAlerts.length>0?"var(--amber)":"var(--accent-2)"}}>{cleanAlerts.length}</div><div className="fm-stat-l">Cleaning due</div></div>
            <div className="fm-stat"><div className="fm-stat-v">{rooms.filter(r=>(r.assignedBatchIds||[]).length>0).length}</div><div className="fm-stat-l">Spaces in use</div></div>
          </div>
        )}

        {/* Cleaning alerts */}
        {!form&&cleanAlerts.length>0&&(
          <div className="fm-warn">
            🧹 <strong>{cleanAlerts.length} space{cleanAlerts.length!==1?"s":""} due for cleaning:</strong> {cleanAlerts.map(r=>r.name).join(", ")}
          </div>
        )}

        {/* Add/Edit form */}
        {form&&(
          <div className="fm-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit space":"Add facility space"}</div>
            <div className="fm-box">
              <div className="fm-box-t">Space details</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="fm-lbl">Space name</label>
                  <input className="fm-inp" value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="e.g. Processing Room A" />
                </div>
                <div><label className="fm-lbl">Space type</label>
                  <select className="fm-sel" value={form.type} onChange={e=>setF("type",e.target.value)}>
                    {FACILITY_ROOM_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="fm-lbl">Status</label>
                  <select className="fm-sel" value={form.status} onChange={e=>setF("status",e.target.value)}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Under Maintenance</option>
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label className="fm-lbl">Total sq ft</label>
                  <input type="number" className="fm-inp" value={form.sqft} onChange={e=>setF("sqft",e.target.value)} />
                </div>
                <div><label className="fm-lbl">Cleaning interval (days)</label>
                  <input type="number" min="1" className="fm-inp" value={form.cleanIntervalDays} onChange={e=>setF("cleanIntervalDays",parseInt(e.target.value)||7)} />
                </div>
              </div>
            </div>

            <div className="fm-box">
              <div className="fm-box-t">Assigned production batches</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:8}}>Select which production batches are currently using this space</div>
              {prodBatches.length===0?(
                <div style={{fontSize:12,color:"var(--text-3)"}}>No active production batches — import production batches first</div>
              ):prodBatches.map(b=>(
                <label key={b.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer"}}>
                  <input type="checkbox"
                    checked={(form.assignedBatchIds||[]).includes(b.id)}
                    onChange={()=>setF("assignedBatchIds",(form.assignedBatchIds||[]).includes(b.id)
                      ?(form.assignedBatchIds||[]).filter(id=>id!==b.id)
                      :[...(form.assignedBatchIds||[]),b.id])} />
                  <span style={{fontSize:12,color:"var(--text)"}}>{b.name}</span>
                  <span style={{fontSize:11,color:"var(--text-3)"}}>{b.status==="in_progress"?"🟡 In Progress":"🟢 Scheduled"}</span>
                </label>
              ))}
            </div>

            <div><label className="fm-lbl">Notes</label>
              <textarea className="fm-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} />
            </div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",margin:"8px 0"}}>{err}</div>}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button className="fm-btn fm-primary" onClick={saveRoom}>{form.id?"Save":"Add space"}</button>
              <button className="fm-btn fm-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Tab bar */}
        {!form&&(
          <>
            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[["rooms","Spaces"],["cleaning","Cleaning Log"]].map(([v,l])=>(
                <button key={v} className={"fm-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
              ))}
            </div>

            {/* Spaces tab */}
            {tab==="rooms"&&(
              <div className="fm-grid2">
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--text-2)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Facility Spaces</div>
                  {rooms.length===0&&(
                    <div style={{textAlign:"center",padding:32,color:"var(--text-3)",background:"var(--surface)",borderRadius:10,border:"1px solid var(--border-2)"}}>
                      <div style={{fontSize:28,marginBottom:8}}>🏭</div>
                      <div>No facility spaces added yet</div>
                    </div>
                  )}
                  {rooms.map(room=>{
                    const lastClean = room.cleanLog?.slice(-1)[0]?.date;
                    const daysSince = daysAgo(lastClean);
                    const isDue = !lastClean||(daysSince>=(parseInt(room.cleanIntervalDays)||7)-1);
                    const assignedBatches = prodBatches.filter(b=>(room.assignedBatchIds||[]).includes(b.id));
                    return(
                      <div key={room.id}
                        className={"fm-room"+(selectedId===room.id?" selected":"")}
                        style={{opacity:room.status==="inactive"?0.6:1}}
                        onClick={()=>setSelectedId(selectedId===room.id?null:room.id)}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{room.name}</div>
                          <div style={{display:"flex",gap:4}}>
                            {isDue&&<span className="fm-pill pill-cleaning">🧹 CLEAN DUE</span>}
                            <span className={"fm-pill "+(room.status==="active"?"pill-active":"pill-inactive")}>{room.status.toUpperCase()}</span>
                          </div>
                        </div>
                        <div style={{fontSize:11,color:"var(--text-3)",marginBottom:4}}>
                          {room.type} · {room.sqft?room.sqft+" sq ft":"—"}
                        </div>
                        {assignedBatches.length>0&&(
                          <div style={{fontSize:11,color:"var(--accent-2)"}}>
                            📦 {assignedBatches.map(b=>b.name).join(", ")}
                          </div>
                        )}
                        {lastClean&&<div style={{fontSize:10,color:isDue?"var(--amber)":"var(--text-3)",marginTop:3}}>Last cleaned: {fmtD(lastClean)} ({daysSince}d ago)</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Detail panel */}
                <div>
                  {!selected&&(
                    <div style={{textAlign:"center",padding:32,color:"var(--text-3)",background:"var(--surface)",borderRadius:10,border:"1px solid var(--border-2)"}}>
                      <div style={{fontSize:20,marginBottom:8}}>👈</div>
                      <div>Select a space to view details and log cleaning</div>
                    </div>
                  )}
                  {selected&&(
                    <div>
                      <div className="fm-card" style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                          <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{selected.name}</div>
                          <div style={{display:"flex",gap:6}}>
                            <button className="fm-sm fm-edit" onClick={()=>setForm({...selected})}>Edit</button>
                          </div>
                        </div>

                        {/* Assigned batches */}
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Active production batches</div>
                          {(selected.assignedBatchIds||[]).length===0?(
                            <div style={{fontSize:12,color:"var(--text-3)"}}>No batches assigned to this space</div>
                          ):prodBatches.filter(b=>(selected.assignedBatchIds||[]).includes(b.id)).map(b=>(
                            <div key={b.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 8px",background:"var(--surface-2)",borderRadius:6,marginBottom:4,fontSize:12}}>
                              <span style={{color:"var(--text)"}}>{b.name}</span>
                              <span style={{color:"var(--accent-2)",fontSize:10,fontWeight:600}}>{b.status?.replace("_"," ").toUpperCase()}</span>
                            </div>
                          ))}
                        </div>

                        {/* Log cleaning button */}
                        {cleanForm?(
                          <div className="fm-box">
                            <div className="fm-box-t">Log cleaning event</div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                              <div><label className="fm-lbl">Date</label>
                                <input type="date" className="fm-inp" value={cleanForm.date} onChange={e=>setCleanForm(f=>({...f,date:e.target.value}))} />
                              </div>
                              <div><label className="fm-lbl">Clean type</label>
                                <select className="fm-sel" value={cleanForm.type} onChange={e=>setCleanForm(f=>({...f,type:e.target.value}))}>
                                  {CLEAN_TYPES.map(t=><option key={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{marginBottom:8}}><label className="fm-lbl">Performed by</label>
                              <select className="fm-sel" value={cleanForm.by} onChange={e=>setCleanForm(f=>({...f,by:e.target.value}))}>
                                <option value="">— Select employee —</option>
                                {employees.map(e=><option key={e.id} value={e.name}>{e.name}</option>)}
                                <option value="__other">Other / type below</option>
                              </select>
                              {cleanForm.by==="__other"&&<input className="fm-inp" style={{marginTop:4}} placeholder="Enter name" onChange={e=>setCleanForm(f=>({...f,by:e.target.value}))} />}
                            </div>
                            <div style={{marginBottom:8}}><label className="fm-lbl">Notes</label>
                              <input className="fm-inp" value={cleanForm.notes} onChange={e=>setCleanForm(f=>({...f,notes:e.target.value}))} placeholder="Chemicals used, observations..." />
                            </div>
                            {err&&<div style={{fontSize:11,color:"var(--danger)",marginBottom:6}}>{err}</div>}
                            <div style={{display:"flex",gap:6}}>
                              <button className="fm-btn fm-primary" style={{fontSize:11,padding:"5px 12px"}} onClick={logClean}>Log cleaning</button>
                              <button className="fm-btn fm-secondary" style={{fontSize:11,padding:"5px 12px"}} onClick={()=>{setCleanForm(null);setErr("");}}>Cancel</button>
                            </div>
                          </div>
                        ):(
                          <button className="fm-btn fm-primary" style={{width:"100%"}} onClick={()=>setCleanForm({...EMPTY_CLEAN})}>
                            🧹 Log cleaning event
                          </button>
                        )}
                      </div>

                      {/* Clean history */}
                      {(selected.cleanLog||[]).length>0&&(
                        <div className="fm-card">
                          <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:10}}>Cleaning History</div>
                          {[...selected.cleanLog].reverse().slice(0,8).map((c,i)=>(
                            <div key={c.id||i} className="fm-clean-row">
                              <div>
                                <div style={{fontWeight:500,color:"var(--text)"}}>{fmtD(c.date)} — {c.type}</div>
                                <div style={{fontSize:10,color:"var(--text-3)"}}>{c.by}{c.notes?` · ${c.notes}`:""}</div>
                              </div>
                              <span style={{fontSize:10,color:"var(--accent-2)",fontWeight:600}}>✓</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cleaning Log tab — full facility view */}
            {tab==="cleaning"&&(
              <div className="fm-card">
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Full Facility Cleaning Log</div>
                {allCleanLogs.length===0?(
                  <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>
                    <div style={{fontSize:24,marginBottom:8}}>🧹</div>
                    <div>No cleaning events logged yet — select a space and log a cleaning event</div>
                  </div>
                ):(
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr>
                        {["Date","Space","Clean Type","Performed By","Notes"].map(h=>(
                          <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",color:"var(--text-3)",borderBottom:"1px solid var(--border)",background:"var(--surface-2)"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {allCleanLogs.map((c,i)=>(
                          <tr key={c.id||i} style={{borderBottom:"1px solid var(--border)"}}>
                            <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}>{fmtD(c.date)}</td>
                            <td style={{padding:"7px 10px",fontWeight:500,color:"var(--text)"}}>{c.roomName}</td>
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
            )}
          </>
        )}
      </div>
    </>
  );
}
