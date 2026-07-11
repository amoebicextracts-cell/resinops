import { useState, useEffect } from "react";
import { db } from "./lib/db";

function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtD(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function fmtDT(dt){return dt?new Date(dt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"";}
function hoursBetween(a,b){ if(!a||!b) return null; return ((new Date(b)-new Date(a))/3600000).toFixed(1); }

const CATEGORIES = ["Equipment Repair","Building / Facility","Electrical","Plumbing","HVAC","Pest / IPM","Safety Hazard","Other"];
const SEVERITIES = [
  {v:"low",l:"Low — routine"},
  {v:"medium",l:"Medium — needs attention"},
  {v:"high",l:"High — safety or production impact"},
  {v:"critical",l:"Critical — stop work / safety risk"},
];

const CSS = `
  .mx-wrap{padding:24px;flex:1;overflow-y:auto;}
  .mx-tabs{display:flex;gap:2px;margin-bottom:18px;background:var(--surface-2);border-radius:8px;padding:3px;}
  .mx-tab{flex:1;padding:7px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;transition:all 0.15s;}
  .mx-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.2);}
  .mx-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .mx-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .mx-inp:focus{outline:none;border-color:var(--accent);}
  .mx-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .mx-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .mx-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .mx-btn:hover{opacity:0.85;}
  .mx-primary{background:var(--accent);color:#fff;}
  .mx-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .mx-danger{background:rgba(200,74,74,0.85);color:#fff;}
  .mx-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .mx-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .mx-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .mx-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .mx-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .mx-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .mx-tbl tr:last-child td{border-bottom:none;}
  .mx-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .status-open{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-progress{background:rgba(90,120,200,0.15);color:#7090f0;}
  .status-resolved{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sev-low{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .sev-medium{background:rgba(200,150,58,0.15);color:var(--amber);}
  .sev-high{background:rgba(230,120,50,0.18);color:#e67832;}
  .sev-critical{background:rgba(200,74,74,0.18);color:var(--danger);}
  .loto-open{background:rgba(200,74,74,0.18);color:var(--danger);}
  .loto-closed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
`;

const EMPTY_WO = {
  title:"", cat:"Equipment Repair", equipId:"", severity:"medium",
  reportedBy:"", reportedDate:new Date().toISOString().slice(0,16),
  status:"open", assignedTo:"", downStart:"", downEnd:"",
  laborTypeId:"", laborHours:"", partsCost:"", vendorId:"",
  description:"", resolutionNotes:"",
};

const EMPTY_LOTO = {
  equipId:"", date:new Date().toISOString().split("T")[0], reason:"",
  lockedBy:"", lockTime:"", reenergizedBy:"", reenergizeTime:"",
  verifiedSafe:false, notes:"", status:"open",
};

export default function Maintenance() {
  const [tab, setTab] = useState("workorders");
  const [workOrders, setWorkOrders] = useState([]);
  const [lotoLog, setLotoLog] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [laborTypes, setLaborTypes] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [eq, lt]=await Promise.all([
          db.equipment.list(),
          db.labor_types.list(),
        ]);
        setEquipment(eq);
        setLaborTypes(lt);
      }catch(e){ console.error("Maintenance load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const [form, setForm] = useState(null);
  const [lotoForm, setLotoForm] = useState(null);
  const [err, setErr] = useState("");


  const setF = (k,v) => setForm(f=>({...f,[k]:v}));
  const setLF = (k,v) => setLotoForm(f=>({...f,[k]:v}));

  function openAddWO() { setForm({...EMPTY_WO}); setErr(""); }
  function openEditWO(wo) { setForm({...wo}); setErr(""); }
  function saveWO() {
    if (!form.title.trim()) { setErr("Enter a title."); return; }
    const lt = laborTypes.find(x=>x.id===form.laborTypeId);
    const laborCost = (parseFloat(form.laborHours)||0) * (lt?.rate||0);
    const totalCost = laborCost + (parseFloat(form.partsCost)||0);
    const wo = { ...form, id: form.id || "wo"+Date.now(), laborCost, totalCost };
    if (form.id) setWorkOrders(p=>p.map(x=>x.id===wo.id?wo:x));
    else setWorkOrders(p=>[...p,wo]);
    setForm(null); setErr("");
  }
  function removeWO(id) { setWorkOrders(p=>p.filter(x=>x.id!==id)); }

  function openAddLoto() { setLotoForm({...EMPTY_LOTO}); setErr(""); }
  function openEditLoto(l) { setLotoForm({...l}); setErr(""); }
  function saveLoto() {
    if (!lotoForm.equipId) { setErr("Select the equipment being locked out."); return; }
    if (!lotoForm.lockedBy.trim()) { setErr("Enter the technician applying lockout."); return; }
    const status = lotoForm.verifiedSafe && lotoForm.reenergizedBy ? "closed" : "open";
    const rec = { ...lotoForm, id: lotoForm.id || "loto"+Date.now(), status };
    if (lotoForm.id) setLotoLog(p=>p.map(x=>x.id===rec.id?rec:x));
    else setLotoLog(p=>[...p,rec]);
    setLotoForm(null); setErr("");
  }
  function removeLoto(id) { setLotoLog(p=>p.filter(x=>x.id!==id)); }

  const openWOs = workOrders.filter(w=>w.status!=="resolved");
  const openLOTOs = lotoLog.filter(l=>l.status==="open");

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading maintenance…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="mx-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Maintenance & Facilities</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>Work orders, downtime tracking, and lockout/tagout safety log</div>
        </div>

        {openLOTOs.length>0 && (
          <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--danger)"}}>🔒 {openLOTOs.length} equipment item{openLOTOs.length>1?"s":""} currently locked out — not safe to re-energize without sign-off</div>
          </div>
        )}

        <div className="mx-tabs">
          {[["workorders","🛠️ Work Orders"],["loto","🔒 LOTO Log"]].map(([v,l])=>(
            <button key={v} className={"mx-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── WORK ORDERS ── */}
        {tab==="workorders" && (
          <div className="mx-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
              {!form && <button className="mx-btn mx-primary" onClick={openAddWO}>+ New work order</button>}
            </div>

            {form && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="mx-lbl">Title</label><input className="mx-inp" value={form.title} onChange={e=>setF("title",e.target.value)} placeholder="Extraction chiller leaking coolant" /></div>
                  <div><label className="mx-lbl">Category</label><select className="mx-sel" value={form.cat} onChange={e=>setF("cat",e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
                  <div><label className="mx-lbl">Severity</label><select className="mx-sel" value={form.severity} onChange={e=>setF("severity",e.target.value)}>{SEVERITIES.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="mx-lbl">Related equipment (optional)</label><select className="mx-sel" value={form.equipId} onChange={e=>setF("equipId",e.target.value)}><option value="">— None / facility-wide —</option>{equipment.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></div>
                  <div><label className="mx-lbl">Status</label><select className="mx-sel" value={form.status} onChange={e=>setF("status",e.target.value)}><option value="open">Open</option><option value="progress">In Progress</option><option value="resolved">Resolved</option></select></div>
                  <div><label className="mx-lbl">Assigned to</label><input className="mx-inp" value={form.assignedTo} onChange={e=>setF("assignedTo",e.target.value)} /></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="mx-lbl">Reported by</label><input className="mx-inp" value={form.reportedBy} onChange={e=>setF("reportedBy",e.target.value)} /></div>
                  <div><label className="mx-lbl">Reported date/time</label><input type="datetime-local" className="mx-inp" value={form.reportedDate} onChange={e=>setF("reportedDate",e.target.value)} /></div>
                </div>

                {/* Downtime tracking */}
                <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Downtime Tracking</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div><label className="mx-lbl">Equipment/area down — start</label><input type="datetime-local" className="mx-inp" value={form.downStart} onChange={e=>setF("downStart",e.target.value)} /></div>
                    <div><label className="mx-lbl">Back online — end</label><input type="datetime-local" className="mx-inp" value={form.downEnd} onChange={e=>setF("downEnd",e.target.value)} /></div>
                  </div>
                  {form.downStart && form.downEnd && (
                    <div style={{fontSize:11,color:"var(--amber)",marginTop:8}}>Total downtime: {hoursBetween(form.downStart,form.downEnd)} hours</div>
                  )}
                </div>

                {/* Cost tracking */}
                <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Cost</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div><label className="mx-lbl">Labor type</label><select className="mx-sel" value={form.laborTypeId} onChange={e=>setF("laborTypeId",e.target.value)}><option value="">— None —</option>{laborTypes.map(lt=><option key={lt.id} value={lt.id}>{lt.n} (${lt.rate}/hr)</option>)}</select></div>
                    <div><label className="mx-lbl">Labor hours</label><input type="number" step="0.25" className="mx-inp" value={form.laborHours} onChange={e=>setF("laborHours",e.target.value)} /></div>
                    <div><label className="mx-lbl">Parts / materials cost ($)</label><input type="number" step="0.01" className="mx-inp" value={form.partsCost} onChange={e=>setF("partsCost",e.target.value)} /></div>
                  </div>
                  <div style={{marginTop:8}}><label className="mx-lbl">Outside vendor used (if any)</label><select className="mx-sel" value={form.vendorId} onChange={e=>setF("vendorId",e.target.value)}><option value="">— In-house —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.n}</option>)}</select></div>
                </div>

                <div style={{marginBottom:10}}><label className="mx-lbl">Description</label><textarea className="mx-inp" rows={2} style={{resize:"vertical"}} value={form.description} onChange={e=>setF("description",e.target.value)} /></div>
                <div style={{marginBottom:10}}><label className="mx-lbl">Resolution notes (once resolved)</label><textarea className="mx-inp" rows={2} style={{resize:"vertical"}} value={form.resolutionNotes} onChange={e=>setF("resolutionNotes",e.target.value)} /></div>

                {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="mx-btn mx-primary" onClick={saveWO}>{form.id?"Save changes":"Create work order"}</button>
                  <button className="mx-btn mx-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}

            {workOrders.length===0 ? (
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No work orders yet.</div>
            ) : (
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="mx-tbl">
                  <thead><tr><th>Title</th><th>Category</th><th>Equipment</th><th>Severity</th><th>Downtime</th><th>Cost</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {[...workOrders].sort((a,b)=>new Date(b.reportedDate)-new Date(a.reportedDate)).map(wo => {
                      const eq = equipment.find(e=>e.id===wo.equipId);
                      const dt = hoursBetween(wo.downStart,wo.downEnd);
                      return (
                        <tr key={wo.id}>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{wo.title}</td>
                          <td style={{fontSize:11}}>{wo.cat}</td>
                          <td style={{fontSize:11}}>{eq?.name||"—"}</td>
                          <td><span className={"mx-pill sev-"+wo.severity}>{wo.severity}</span></td>
                          <td style={{fontSize:11}}>{dt?dt+" hrs":"—"}</td>
                          <td style={{fontSize:11,color:"var(--accent-2)"}}>{wo.totalCost?fmtC(wo.totalCost):"—"}</td>
                          <td><span className={"mx-pill status-"+(wo.status==="open"?"open":wo.status==="progress"?"progress":"resolved")}>{wo.status==="progress"?"In Progress":wo.status}</span></td>
                          <td><div style={{display:"flex",gap:5}}>
                            <button className="mx-sm mx-edit" onClick={()=>openEditWO(wo)}>Edit</button>
                            <button className="mx-sm mx-del" onClick={()=>removeWO(wo.id)}>✕</button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Summary */}
            {workOrders.length>0 && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:14}}>
                {[
                  {l:"Open work orders",v:String(openWOs.length)},
                  {l:"Total maintenance cost",v:fmtC(workOrders.reduce((a,w)=>a+(w.totalCost||0),0))},
                  {l:"Critical / high severity open",v:String(openWOs.filter(w=>w.severity==="critical"||w.severity==="high").length)},
                  {l:"Total recorded downtime (hrs)",v:workOrders.reduce((a,w)=>a+(parseFloat(hoursBetween(w.downStart,w.downEnd))||0),0).toFixed(1)},
                ].map((s,i)=>(
                  <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{s.l}</div>
                    <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{s.v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LOTO LOG ── */}
        {tab==="loto" && (
          <div className="mx-card">
            <div style={{fontSize:12,color:"var(--text-2)",marginBottom:14}}>
              Dedicated lockout/tagout record. Every lockout requires a sign-off before re-energizing — track who applied lockout, why, and who verified it was safe to restore power.
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
              {!lotoForm && <button className="mx-btn mx-primary" onClick={openAddLoto}>+ New LOTO entry</button>}
            </div>

            {lotoForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="mx-lbl">Equipment locked out</label><select className="mx-sel" value={lotoForm.equipId} onChange={e=>setLF("equipId",e.target.value)}><option value="">— Select —</option>{equipment.map(eq=><option key={eq.id} value={eq.id}>{eq.name}</option>)}</select></div>
                  <div><label className="mx-lbl">Date</label><input type="date" className="mx-inp" value={lotoForm.date} onChange={e=>setLF("date",e.target.value)} /></div>
                </div>
                <div style={{marginBottom:10}}><label className="mx-lbl">Reason for lockout</label><input className="mx-inp" value={lotoForm.reason} onChange={e=>setLF("reason",e.target.value)} placeholder="Replacing chiller compressor" /></div>

                <div style={{background:"rgba(200,74,74,0.06)",border:"1px solid rgba(200,74,74,0.25)",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--danger)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Lockout Applied</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div><label className="mx-lbl">Locked by (technician)</label><input className="mx-inp" value={lotoForm.lockedBy} onChange={e=>setLF("lockedBy",e.target.value)} /></div>
                    <div><label className="mx-lbl">Lock applied time</label><input type="datetime-local" className="mx-inp" value={lotoForm.lockTime} onChange={e=>setLF("lockTime",e.target.value)} /></div>
                  </div>
                </div>

                <div style={{background:"rgba(74,124,89,0.06)",border:"1px solid rgba(74,124,89,0.25)",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--accent-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Re-Energize Sign-Off</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
                    <div><label className="mx-lbl">Re-energized by</label><input className="mx-inp" value={lotoForm.reenergizedBy} onChange={e=>setLF("reenergizedBy",e.target.value)} /></div>
                    <div><label className="mx-lbl">Re-energize time</label><input type="datetime-local" className="mx-inp" value={lotoForm.reenergizeTime} onChange={e=>setLF("reenergizeTime",e.target.value)} /></div>
                  </div>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                    <input type="checkbox" checked={lotoForm.verifiedSafe} onChange={e=>setLF("verifiedSafe",e.target.checked)} />
                    Verified safe to re-energize — all personnel clear, all tools removed, all guards reinstalled
                  </label>
                </div>

                <div style={{marginBottom:10}}><label className="mx-lbl">Notes</label><input className="mx-inp" value={lotoForm.notes} onChange={e=>setLF("notes",e.target.value)} /></div>

                {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="mx-btn mx-primary" onClick={saveLoto}>{lotoForm.id?"Save changes":"Save LOTO entry"}</button>
                  <button className="mx-btn mx-secondary" onClick={()=>{setLotoForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}

            {lotoLog.length===0 ? (
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No LOTO entries logged yet.</div>
            ) : (
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="mx-tbl">
                  <thead><tr><th>Equipment</th><th>Date</th><th>Reason</th><th>Locked By</th><th>Lock Time</th><th>Re-energized By</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {[...lotoLog].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(l => {
                      const eq = equipment.find(e=>e.id===l.equipId);
                      return (
                        <tr key={l.id}>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{eq?.name||"—"}</td>
                          <td>{fmtD(l.date)}</td>
                          <td style={{fontSize:11}}>{l.reason||"—"}</td>
                          <td>{l.lockedBy}</td>
                          <td style={{fontSize:11}}>{fmtDT(l.lockTime)}</td>
                          <td>{l.reenergizedBy||"—"}</td>
                          <td><span className={"mx-pill loto-"+l.status}>{l.status==="open"?"🔒 LOCKED":"✓ Cleared"}</span></td>
                          <td><div style={{display:"flex",gap:5}}>
                            <button className="mx-sm mx-edit" onClick={()=>openEditLoto(l)}>Edit</button>
                            <button className="mx-sm mx-del" onClick={()=>removeLoto(l.id)}>✕</button>
                          </div></td>
                        </tr>
                      );
                    })}
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
