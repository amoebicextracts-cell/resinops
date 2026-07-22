import { useState, useEffect } from "react";
import { db } from "./lib/db";

const EQUIP_CATS = [
  "Extraction","Trimming & Bucking","Drying & Curing","Pre-Roll & Packaging",
  "HVAC & Dehumidification","Fertigation & Irrigation","Lighting","Lab & Testing Instruments",
  "Vehicles & Material Handling","Facility Systems","Other",
];
const PM_FREQ = [
  {v:"30",l:"Every 30 days"},{v:"90",l:"Every 90 days"},{v:"180",l:"Every 6 months"},
  {v:"365",l:"Annually"},{v:"none",l:"No scheduled PM"},
];

function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function dAdd(dt,n){const r=new Date(dt);r.setDate(r.getDate()+n);return r;}
function fmtD(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function daysUntil(dt){return Math.round((new Date(dt)-new Date())/86400000);}

function nextPMDate(eq) {
  if (!eq.pmFreqDays || eq.pmFreqDays==="none") return null;
  const lastDate = eq.lastServiceDate || eq.purchaseDate || new Date().toISOString().split("T")[0];
  return dAdd(lastDate, parseInt(eq.pmFreqDays));
}

const CSS = `
  .eq-wrap{padding:24px;flex:1;overflow-y:auto;}
  .eq-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .eq-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .eq-inp:focus{outline:none;border-color:var(--accent);}
  .eq-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .eq-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .eq-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .eq-btn:hover{opacity:0.85;}
  .eq-primary{background:var(--accent);color:#fff;}
  .eq-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .eq-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .eq-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .eq-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .eq-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .eq-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .eq-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .eq-tbl tr:last-child td{border-bottom:none;}
  .eq-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .status-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .status-down{background:rgba(200,74,74,0.15);color:var(--danger);}
  .status-service{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-planned{background:rgba(150,100,200,0.15);color:#9060c0;}
  .pm-overdue{background:rgba(200,74,74,0.15);color:var(--danger);}
  .pm-soon{background:rgba(200,150,58,0.15);color:var(--amber);}
  .pm-ok{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .pm-none{background:rgba(100,100,100,0.15);color:var(--text-3);}
`;

const EMPTY = {
  name:"", cat:"Extraction", make:"", model:"", serial:"", assetTag:"",
  location:"", purchaseDate:"", purchasePrice:"", vendorId:"",
  warrantyExpires:"", pmFreqDays:"90", lastServiceDate:"",
  status:"active", notes:"",
  usefulLifeMonths:"", salvageValue:"0", depreciationMethod:"straight_line",
};

const CAT_MAP = {
  "extraction":"Extraction","co2":"Extraction","bho":"Extraction","ethanol":"Extraction","solventless":"Extraction","rosin":"Extraction",
  "trim":"Trimming & Bucking","bucking":"Trimming & Bucking","trimming":"Trimming & Bucking",
  "dry":"Drying & Curing","cure":"Drying & Curing","drying":"Drying & Curing","curing":"Drying & Curing",
  "pre-roll":"Pre-Roll & Packaging","packaging":"Pre-Roll & Packaging","preroll":"Pre-Roll & Packaging","filling":"Pre-Roll & Packaging",
  "hvac":"HVAC & Dehumidification","dehumid":"HVAC & Dehumidification","climate":"HVAC & Dehumidification","air":"HVAC & Dehumidification",
  "fertigation":"Fertigation & Irrigation","irrigation":"Fertigation & Irrigation","dosing":"Fertigation & Irrigation",
  "light":"Lighting","lighting":"Lighting","fixture":"Lighting",
  "lab":"Lab & Testing Instruments","testing":"Lab & Testing Instruments","instrument":"Lab & Testing Instruments","scale":"Lab & Testing Instruments","meter":"Lab & Testing Instruments",
  "vehicle":"Vehicles & Material Handling","forklift":"Vehicles & Material Handling","lift":"Vehicles & Material Handling","transport":"Vehicles & Material Handling",
  "facility":"Facility Systems","electrical":"Facility Systems","plumbing":"Facility Systems","security":"Facility Systems","generator":"Facility Systems",
};

function normalizeEquipCat(raw){
  if(!raw) return "Other";
  if(EQUIP_CATS.includes(raw)) return raw;
  const lower = raw.toLowerCase();
  for(const [k,v] of Object.entries(CAT_MAP)){ if(lower.includes(k)) return v; }
  return "Other";
}

export default function Equipment() {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceLog, setServiceLog] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(null);
  const [serviceForm, setServiceForm] = useState(null); // {equipId}
  const [historyFor, setHistoryFor] = useState(null);
  const [err, setErr] = useState("");

  useEffect(()=>{
    async function load(){
      try{
        const [eq, sl, vd] = await Promise.all([
          db.equipment.list(),
          db.equipment_service_log.list(),
          db.vendors.list(),
        ]);
        setEquipment(eq);
        setServiceLog(sl);
        setVendors(vd);
      }catch(e){ console.error("Equipment load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  function openAdd() { setForm({...EMPTY}); setErr(""); }
  function openEdit(eq) { setForm({...eq}); setErr(""); }
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  async function save() {
    if (!form.name.trim()) { setErr("Enter equipment name."); return; }
    const eq = { ...form, id: form.id || crypto.randomUUID() };
    try{
      const saved = await db.equipment.upsert(eq);
      if (form.id) setEquipment(p=>p.map(x=>x.id===saved.id?saved:x));
      else setEquipment(p=>[...p,saved]);
      setForm(null); setErr("");
    }catch(e){ setErr("Could not save: "+(e.message||e)); }
  }
  async function remove(id) {
    try{
      await db.equipment.delete(id);
      setEquipment(p=>p.filter(x=>x.id!==id));
      setServiceLog(p=>p.filter(x=>x.equipId!==id));
    }catch(e){ setErr("Could not delete: "+(e.message||e)); }
  }

  function openService(eq) { setServiceForm({ equipId:eq.id, date:new Date().toISOString().split("T")[0], type:"pm", tech:"", vendorId:"", cost:"", notes:"" }); }
  async function saveService() {
    const rec = {...serviceForm, id:crypto.randomUUID()};
    try{
      const [savedLog, savedEquip] = await Promise.all([
        db.equipment_service_log.upsert(rec),
        db.equipment.upsert({...equipment.find(x=>x.id===serviceForm.equipId), lastServiceDate:serviceForm.date}),
      ]);
      setServiceLog(p=>[...p, savedLog]);
      setEquipment(p=>p.map(x=>x.id===savedEquip.id?savedEquip:x));
      setServiceForm(null);
    }catch(e){ setErr("Could not save service record: "+(e.message||e)); }
  }

  const today = new Date();

  function pmStatus(eq) {
    const next = nextPMDate(eq);
    if (!next) return {label:"No PM scheduled", cls:"pm-none"};
    const d = daysUntil(next);
    if (d < 0) return {label:"Overdue "+Math.abs(d)+"d", cls:"pm-overdue", date:next};
    if (d <= 14) return {label:"Due in "+d+"d", cls:"pm-soon", date:next};
    return {label:"OK — "+fmtD(next), cls:"pm-ok", date:next};
  }

  const upcomingPM = equipment.map(eq=>({eq,st:pmStatus(eq)})).filter(({st})=>st.cls==="pm-overdue"||st.cls==="pm-soon").sort((a,b)=>(a.st.date||0)-(b.st.date||0));

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading equipment…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="eq-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Equipment Registry</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>Company-wide asset list with PM schedules, warranty, and service history</div>
        </div>

        {upcomingPM.length>0 && (
          <div style={{background:"rgba(200,150,58,0.08)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--amber)",marginBottom:4}}>⚠ {upcomingPM.length} item{upcomingPM.length>1?"s":""} due or overdue for PM/calibration</div>
            <div style={{fontSize:11,color:"var(--text-2)"}}>{upcomingPM.map(({eq,st})=>eq.name+" ("+st.label+")").join(" · ")}</div>
          </div>
        )}

        <div className="eq-card">
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
            {!form && <button className="eq-btn eq-primary" onClick={openAdd}>+ Add equipment</button>}
          </div>

          {form && (
            <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="eq-lbl">Equipment name</label><input className="eq-inp" value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="CenturionPro HP3 Bucker" /></div>
                <div><label className="eq-lbl">Category</label><select className="eq-sel" value={form.cat} onChange={e=>setF("cat",e.target.value)}>{EQUIP_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label className="eq-lbl">Status</label><select className="eq-sel" value={form.status} onChange={e=>setF("status",e.target.value)}><option value="active">Active</option><option value="service">In Service</option><option value="down">Down</option><option value="retired">Retired</option><option value="planned">Planned — future purchase</option></select></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="eq-lbl">Make</label><input className="eq-inp" value={form.make} onChange={e=>setF("make",e.target.value)} /></div>
                <div><label className="eq-lbl">Model</label><input className="eq-inp" value={form.model} onChange={e=>setF("model",e.target.value)} /></div>
                <div><label className="eq-lbl">Serial number</label><input className="eq-inp" value={form.serial} onChange={e=>setF("serial",e.target.value)} /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="eq-lbl">Asset tag / ID</label><input className="eq-inp" value={form.assetTag} onChange={e=>setF("assetTag",e.target.value)} placeholder="EQ-0042" /></div>
                <div><label className="eq-lbl">Location / room</label><input className="eq-inp" value={form.location} onChange={e=>setF("location",e.target.value)} placeholder="Extraction Lab B" /></div>
                <div><label className="eq-lbl">Vendor / servicer</label><select className="eq-sel" value={form.vendorId} onChange={e=>setF("vendorId",e.target.value)}><option value="">— None —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.n}</option>)}</select></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="eq-lbl">{form.status==="planned"?"Planned purchase date":"Purchase date"}</label><input type="date" className="eq-inp" value={form.purchaseDate} onChange={e=>setF("purchaseDate",e.target.value)} /></div>
                <div><label className="eq-lbl">Purchase price ($)</label><input type="number" step="0.01" className="eq-inp" value={form.purchasePrice} onChange={e=>setF("purchasePrice",e.target.value)} /></div>
                <div><label className="eq-lbl">Warranty expires</label><input type="date" className="eq-inp" value={form.warrantyExpires} onChange={e=>setF("warrantyExpires",e.target.value)} /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="eq-lbl">Useful life (months)</label><input type="number" step="1" className="eq-inp" value={form.usefulLifeMonths} onChange={e=>setF("usefulLifeMonths",e.target.value)} placeholder="e.g. 60" /></div>
                <div><label className="eq-lbl">Salvage value ($)</label><input type="number" step="0.01" className="eq-inp" value={form.salvageValue} onChange={e=>setF("salvageValue",e.target.value)} /></div>
                <div><label className="eq-lbl">Depreciation method</label><input className="eq-inp" value="Straight-line" disabled style={{opacity:0.6,cursor:"not-allowed"}} /></div>
              </div>
              <div style={{fontSize:11,color:"var(--text-3)",marginTop:-4,marginBottom:10}}>Leave useful life blank to exclude this asset from the Equipment Depreciation cost pool.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="eq-lbl">PM / calibration frequency</label><select className="eq-sel" value={form.pmFreqDays} onChange={e=>setF("pmFreqDays",e.target.value)}>{PM_FREQ.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
                <div><label className="eq-lbl">Last service date</label><input type="date" className="eq-inp" value={form.lastServiceDate} onChange={e=>setF("lastServiceDate",e.target.value)} /></div>
              </div>
              <div style={{marginBottom:10}}><label className="eq-lbl">Notes</label><input className="eq-inp" value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
              {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="eq-btn eq-primary" onClick={save}>{form.id?"Save changes":"Add equipment"}</button>
                <button className="eq-btn eq-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
              </div>
            </div>
          )}

          {equipment.length===0 ? (
            <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No equipment registered yet.</div>
          ) : (
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="eq-tbl">
                <thead><tr><th>Equipment</th><th>Category</th><th>Location</th><th>Status</th><th>PM Status</th><th>Warranty</th><th></th></tr></thead>
                <tbody>
                  {EQUIP_CATS.map(cat => {
                    const catEq = equipment.filter(e=>e.cat===cat);
                    if (!catEq.length) return null;
                    return [
                      <tr key={"h-"+cat}><td colSpan={7} style={{background:"var(--surface-2)",fontSize:10,fontWeight:700,color:"var(--text-3)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"5px 10px"}}>{cat}</td></tr>,
                      ...catEq.map(eq => {
                        const st = pmStatus(eq);
                        const warrantyActive = eq.warrantyExpires && new Date(eq.warrantyExpires) > today;
                        return (
                          <tr key={eq.id}>
                            <td style={{fontWeight:500,color:"var(--text)"}}>{eq.name}{eq.assetTag&&<span style={{fontSize:10,color:"var(--text-3)",marginLeft:6,fontFamily:"monospace"}}>{eq.assetTag}</span>}<div style={{fontSize:10,color:"var(--text-3)"}}>{eq.make} {eq.model}</div></td>
                            <td style={{fontSize:11}}>{eq.cat}</td>
                            <td>{eq.location||"—"}</td>
                            <td><span className={"eq-pill status-"+(eq.status==="active"?"active":eq.status==="down"?"down":eq.status==="planned"?"planned":"service")}>{eq.status}</span></td>
                            <td><span className={"eq-pill "+st.cls}>{st.label}</span></td>
                            <td style={{fontSize:11,color:warrantyActive?"var(--accent-2)":"var(--text-3)"}}>{eq.warrantyExpires?fmtD(eq.warrantyExpires):"—"}</td>
                            <td><div style={{display:"flex",gap:5}}>
                              <button className="eq-sm eq-edit" onClick={()=>openService(eq)}>Log Service</button>
                              <button className="eq-sm eq-secondary" onClick={()=>setHistoryFor(historyFor===eq.id?null:eq.id)}>History</button>
                              <button className="eq-sm eq-edit" onClick={()=>openEdit(eq)}>Edit</button>
                              <button className="eq-sm eq-del" onClick={()=>remove(eq.id)}>✕</button>
                            </div></td>
                          </tr>
                        );
                      })
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Service log entry modal */}
        {serviceForm && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:12,padding:24,width:420}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:14}}>Log Service / Maintenance</div>
              <div style={{display:"grid",gap:10,marginBottom:14}}>
                <div><label className="eq-lbl">Service date</label><input type="date" className="eq-inp" value={serviceForm.date} onChange={e=>setServiceForm(f=>({...f,date:e.target.value}))} /></div>
                <div><label className="eq-lbl">Type</label><select className="eq-sel" value={serviceForm.type} onChange={e=>setServiceForm(f=>({...f,type:e.target.value}))}><option value="pm">Preventive Maintenance</option><option value="calibration">Calibration</option><option value="repair">Repair</option><option value="inspection">Inspection</option></select></div>
                <div><label className="eq-lbl">Technician / performed by</label><input className="eq-inp" value={serviceForm.tech} onChange={e=>setServiceForm(f=>({...f,tech:e.target.value}))} /></div>
                <div><label className="eq-lbl">Vendor used (if outside service)</label><select className="eq-sel" value={serviceForm.vendorId} onChange={e=>setServiceForm(f=>({...f,vendorId:e.target.value}))}><option value="">— In-house —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.n}</option>)}</select></div>
                <div><label className="eq-lbl">Cost ($)</label><input type="number" step="0.01" className="eq-inp" value={serviceForm.cost} onChange={e=>setServiceForm(f=>({...f,cost:e.target.value}))} /></div>
                <div><label className="eq-lbl">Notes</label><input className="eq-inp" value={serviceForm.notes} onChange={e=>setServiceForm(f=>({...f,notes:e.target.value}))} /></div>
              </div>
              {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="eq-btn eq-primary" onClick={saveService}>Save</button>
                <button className="eq-btn eq-secondary" onClick={()=>setServiceForm(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Service history panel */}
        {historyFor && (() => {
          const eq = equipment.find(e=>e.id===historyFor);
          const hist = serviceLog.filter(s=>s.equipId===historyFor).sort((a,b)=>new Date(b.date)-new Date(a.date));
          return (
            <div className="eq-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Service History — {eq?.name}</div>
              {hist.length===0 ? <div style={{fontSize:12,color:"var(--text-3)"}}>No service recorded yet.</div> : (
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                  <table className="eq-tbl">
                    <thead><tr><th>Date</th><th>Type</th><th>Tech / Vendor</th><th>Cost</th><th>Notes</th></tr></thead>
                    <tbody>
                      {hist.map(h=>{
                        const v = vendors.find(x=>x.id===h.vendorId);
                        return (
                          <tr key={h.id}>
                            <td>{fmtD(h.date)}</td>
                            <td style={{textTransform:"capitalize"}}>{h.type}</td>
                            <td>{h.tech||v?.n||"—"}</td>
                            <td>{h.cost?fmtC(h.cost):"—"}</td>
                            <td style={{fontSize:11,color:"var(--text-3)"}}>{h.notes||"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
}
