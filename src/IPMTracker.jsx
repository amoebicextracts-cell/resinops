import { useState, useEffect } from "react";
import { db } from "./lib/db";

const ENTRY_TYPES=[
  {v:"scouting",l:"Pest Scouting"},
  {v:"beneficial_release",l:"Beneficial Insect Release"},
  {v:"threshold_action",l:"Threshold Action"},
  {v:"note",l:"General IPM Note"},
];

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}

const CSS=`
  .ipm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ipm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .ipm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .ipm-inp:focus{outline:none;border-color:var(--accent);}
  .ipm-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .ipm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .ipm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .ipm-btn:hover{opacity:0.85;}
  .ipm-primary{background:var(--accent);color:#fff;}
  .ipm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .ipm-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .ipm-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .ipm-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .ipm-box{background:var(--surface-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;}
  .ipm-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .ipm-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .ipm-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .ipm-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:top;}
  .ipm-pill{font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;}
  .t-scouting{background:rgba(90,120,200,0.15);color:#7090f0;}
  .t-beneficial_release{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .t-threshold_action{background:rgba(200,74,74,0.15);color:var(--danger);}
  .t-note{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .st-planned{background:rgba(200,150,58,0.15);color:var(--amber);}
  .st-completed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .ipm-batch-list{max-height:140px;overflow-y:auto;border:1px solid var(--border-2);border-radius:8px;padding:8px;background:var(--surface);}
  .ipm-batch-row{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;color:var(--text-2);}
`;

const EMPTY={entryType:"scouting",spaceId:"",batchIds:[],status:"completed",
  scheduledDate:"",performedDate:new Date().toISOString().split("T")[0],
  targetPest:"",species:"",releaseRate:"",releaseUnit:"insects/plant",
  pestCount:"",thresholdExceeded:false,actionTaken:"",performedBy:"",notes:""};

export default function IPMTracker(){
  const [spaces,setSpaces]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [batches,setBatches]=useState([]);
  const [records,setRecords]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [filterStatus,setFilterStatus]=useState("");
  const [err,setErr]=useState("");

  useEffect(()=>{
    async function load(){
      try{
        const [ipm, sp, gm, emp, pb]=await Promise.all([
          db.ipm_log.list(),
          db.grow_spaces.list(),
          db.grow_rooms.list(),
          db.employees.list(),
          db.production_batches.list(),
        ]);
        setRecords(ipm);
        const combined=[...sp,...gm.filter(g=>!sp.some(s=>s.name===g.name))];
        setSpaces(combined);
        setEmployees(emp);
        setBatches(pb);
      }catch(e){ console.error("IPMTracker load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const isBeneficial=form?.entryType==="beneficial_release";
  const isScouting=form?.entryType==="scouting";
  const isPlanned=form?.status==="planned";

  function toggleBatch(id){
    setForm(f=>({...f,batchIds:(f.batchIds||[]).includes(id)?f.batchIds.filter(x=>x!==id):[...(f.batchIds||[]),id]}));
  }

  async function save(){
    if(!form.spaceId){setErr("Select a room / grow space.");return;}
    if(isPlanned&&!form.scheduledDate){setErr("Enter a scheduled date for a planned entry.");return;}
    if(!isPlanned&&!form.performedDate){setErr("Enter the date performed.");return;}
    const space=spaces.find(s=>String(s.id)===String(form.spaceId));
    const rec={...form,id:form.id||crypto.randomUUID(),roomName:space?.name||""};
    try{
      const saved=await db.ipm_log.upsert(rec);
      if(form.id) setRecords(p=>p.map(x=>x.id===saved.id?saved:x));
      else setRecords(p=>[...p,saved]);
      setForm(null);setErr("");
    }catch(e){ console.error("IPM log save failed:",e); setErr("Save failed: "+e.message); }
  }
  async function remove(id){
    try{ await db.ipm_log.delete(id); setRecords(p=>p.filter(x=>x.id!==id)); }
    catch(e){ console.error("IPM log delete failed:",e); }
  }
  async function markCompleted(r){
    try{
      const saved=await db.ipm_log.upsert({...r,status:"completed",performedDate:r.performedDate||new Date().toISOString().split("T")[0]});
      setRecords(p=>p.map(x=>x.id===saved.id?saved:x));
    }catch(e){ console.error("IPM log complete failed:",e); }
  }

  const linkableBatches=batches.filter(b=>b.status==="scheduled"||b.status==="in_progress");
  const filtered=records.filter(r=>!filterStatus||r.status===filterStatus)
    .sort((a,b)=>new Date(b.scheduledDate||b.performedDate||0)-new Date(a.scheduledDate||a.performedDate||0));

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading IPM tracker…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="ipm-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>IPM Tracker</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Pest scouting, beneficial releases, and IPM scheduling — separate from the regulated Pesticide Spray Log and Cultivation Inputs cost log</div>
          </div>
          {!form&&<button className="ipm-btn ipm-primary" onClick={()=>setForm({...EMPTY})}>+ Log IPM entry</button>}
        </div>

        {form&&(
          <div className="ipm-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit IPM Entry":"Log IPM Entry"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="ipm-lbl">Entry type</label>
                <select className="ipm-sel" value={form.entryType} onChange={e=>setF("entryType",e.target.value)}>
                  {ENTRY_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </div>
              <div><label className="ipm-lbl">Room / grow space</label>
                <select className="ipm-sel" value={form.spaceId} onChange={e=>setF("spaceId",e.target.value)}>
                  <option value="">— Select space —</option>
                  {spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label className="ipm-lbl">Target pest</label><input className="ipm-inp" value={form.targetPest} onChange={e=>setF("targetPest",e.target.value)} placeholder="e.g. Thrips, Russet mites" /></div>
            </div>

            <div className="ipm-box">
              <div className="ipm-box-t">Scheduling</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <button type="button" className="ipm-btn" style={{fontSize:11,padding:"5px 12px",background:form.status==="planned"?"var(--accent)":"var(--surface)",color:form.status==="planned"?"#fff":"var(--text-2)",border:form.status==="planned"?"none":"1px solid var(--border-2)"}} onClick={()=>setF("status","planned")}>Planned (future)</button>
                <button type="button" className="ipm-btn" style={{fontSize:11,padding:"5px 12px",background:form.status==="completed"?"var(--accent)":"var(--surface)",color:form.status==="completed"?"#fff":"var(--text-2)",border:form.status==="completed"?"none":"1px solid var(--border-2)"}} onClick={()=>setF("status","completed")}>Completed</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {isPlanned?(
                  <div><label className="ipm-lbl">Scheduled date</label><input type="date" className="ipm-inp" value={form.scheduledDate} onChange={e=>setF("scheduledDate",e.target.value)} /></div>
                ):(
                  <div><label className="ipm-lbl">Date performed</label><input type="date" className="ipm-inp" value={form.performedDate} onChange={e=>setF("performedDate",e.target.value)} /></div>
                )}
                <div><label className="ipm-lbl">Performed / assigned to</label>
                  <select className="ipm-sel" value={form.performedBy} onChange={e=>setF("performedBy",e.target.value)}>
                    <option value="">— Select employee —</option>
                    {employees.filter(e=>e.status==="active").map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="ipm-box">
              <div className="ipm-box-t">Linked batches ({(form.batchIds||[]).length} selected)</div>
              <div className="ipm-batch-list">
                {linkableBatches.length===0?(
                  <div style={{fontSize:11,color:"var(--text-3)"}}>No active/scheduled production batches to link.</div>
                ):linkableBatches.map(b=>(
                  <label key={b.id} className="ipm-batch-row">
                    <input type="checkbox" checked={(form.batchIds||[]).includes(b.id)} onChange={()=>toggleBatch(b.id)} />
                    {b.name} <span style={{fontSize:10,color:"var(--text-3)"}}>({b.status==="scheduled"?"scheduled "+fmtD(b.d):"in progress"})</span>
                  </label>
                ))}
              </div>
            </div>

            {isBeneficial&&(
              <div className="ipm-box">
                <div className="ipm-box-t">Beneficial Insect Release</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div><label className="ipm-lbl">Species</label><input className="ipm-inp" value={form.species} onChange={e=>setF("species",e.target.value)} placeholder="e.g. Amblyseius cucumeris" /></div>
                  <div><label className="ipm-lbl">Release rate</label><input className="ipm-inp" value={form.releaseRate} onChange={e=>setF("releaseRate",e.target.value)} /></div>
                  <div><label className="ipm-lbl">Unit</label><input className="ipm-inp" value={form.releaseUnit} onChange={e=>setF("releaseUnit",e.target.value)} placeholder="insects/plant" /></div>
                </div>
              </div>
            )}

            {isScouting&&(
              <div className="ipm-box">
                <div className="ipm-box-t">Scouting Counts</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:10,alignItems:"end"}}>
                  <div><label className="ipm-lbl">Pest count observed</label><input type="number" className="ipm-inp" value={form.pestCount} onChange={e=>setF("pestCount",e.target.value)} /></div>
                  <div style={{display:"flex",alignItems:"center",gap:6,paddingBottom:8}}>
                    <input type="checkbox" checked={form.thresholdExceeded} onChange={e=>setF("thresholdExceeded",e.target.checked)} />
                    <label className="ipm-lbl" style={{margin:0}}>Threshold exceeded</label>
                  </div>
                  {form.thresholdExceeded&&<div><label className="ipm-lbl">Action taken</label><input className="ipm-inp" value={form.actionTaken} onChange={e=>setF("actionTaken",e.target.value)} placeholder="e.g. Scheduled beneficial release" /></div>}
                </div>
              </div>
            )}

            <div style={{marginBottom:10}}><label className="ipm-lbl">Notes</label><textarea className="ipm-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="ipm-btn ipm-primary" onClick={save}>{form.id?"Save changes":"Log entry"}</button>
              <button className="ipm-btn ipm-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&(
          <div className="ipm-card">
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <select className="ipm-sel" style={{maxWidth:200}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
              </select>
              <div style={{marginLeft:"auto",fontSize:12,color:"var(--text-3)",alignSelf:"center"}}>{filtered.length} record{filtered.length!==1?"s":""}</div>
            </div>
            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No IPM entries yet. Log a scouting round, beneficial release, or planned action above.</div>
            ):(
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="ipm-tbl">
                  <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Room</th><th>Target Pest</th><th>Linked Batches</th><th>Details</th><th></th></tr></thead>
                  <tbody>
                    {filtered.map(r=>(
                      <tr key={r.id}>
                        <td style={{whiteSpace:"nowrap"}}>{fmtD(r.scheduledDate||r.performedDate)}</td>
                        <td><span className={"ipm-pill t-"+r.entryType}>{ENTRY_TYPES.find(t=>t.v===r.entryType)?.l||r.entryType}</span></td>
                        <td><span className={"ipm-pill st-"+r.status}>{r.status}</span></td>
                        <td>{r.roomName}</td>
                        <td>{r.targetPest||"—"}</td>
                        <td style={{fontSize:11}}>{(r.batchIds||[]).length ? (r.batchIds||[]).map(id=>batches.find(b=>b.id===id)?.name||id).join(", ") : "—"}</td>
                        <td style={{fontSize:11}}>{r.entryType==="beneficial_release"?`${r.species||""} ${r.releaseRate||""}${r.releaseUnit?" "+r.releaseUnit:""}`:r.entryType==="scouting"?`${r.pestCount||0} observed${r.thresholdExceeded?" ⚠ threshold":""}`:"—"}</td>
                        <td><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                          {r.status==="planned"&&<button className="ipm-sm ipm-edit" onClick={()=>markCompleted(r)}>Mark done</button>}
                          <button className="ipm-sm ipm-edit" onClick={()=>setForm({...r})}>Edit</button>
                          <button className="ipm-sm ipm-del" onClick={()=>remove(r.id)}>✕</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
