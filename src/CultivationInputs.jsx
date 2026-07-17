import { useState, useEffect } from "react";
import { db } from "./lib/db";

const INPUT_TYPES=[
  {v:"nutrient",l:"Nutrient Application"},
  {v:"amendment",l:"Soil / Media Amendment"},
  {v:"beneficial",l:"Beneficial Insect Release"},
  {v:"flush",l:"Flush / Plain Water"},
  {v:"other",l:"Other"},
];
const APP_METHODS=["Backpack sprayer","Boom sprayer","Hand sprayer","Drench / Irrigation injection","Fogger / ULV","Broadcast","Top dress / incorporation","Seed drench","Other"];
const VOL_UNITS=["gal","L","ml","oz","qt","fl oz"];
const RATE_UNITS=["oz/gal","ml/L","tsp/gal","tbsp/gal","fl oz/gal","lb/acre","g/plant","ml/plant","oz/plant","as labeled"];

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function fmtC(n){return n?("$"+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})):"—";}

const CSS=`
  .ci-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ci-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .ci-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .ci-inp:focus{outline:none;border-color:var(--accent);}
  .ci-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .ci-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .ci-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .ci-btn:hover{opacity:0.85;}
  .ci-primary{background:var(--accent);color:#fff;}
  .ci-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .ci-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .ci-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .ci-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .ci-box{background:var(--surface-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;}
  .ci-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .ci-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .ci-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .ci-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:top;}
  .ci-pill{font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;}
  .t-nutrient{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .t-ipm_spray,.t-ipm_foliar{background:rgba(200,80,50,0.15);color:#e06040;}
  .t-beneficial{background:rgba(90,120,200,0.15);color:#7090f0;}
  .t-amendment{background:rgba(200,150,58,0.15);color:var(--amber);}
  .t-flush{background:rgba(80,140,200,0.12);color:#6090d0;}
  .t-other{background:rgba(100,100,100,0.15);color:var(--text-3);}
`;

const EMPTY={spaceId:"",date:new Date().toISOString().split("T")[0],type:"nutrient",
  product:"",manufacturer:"",epaRegNum:"",rate:"",rateUnit:"oz/gal",
  volumeApplied:"",volumeUnit:"gal",areaApplied:"",costPerUnit:"",totalCost:"",
  rei:"",phi:"",applicationMethod:"Backpack sprayer",targetPest:"",
  weatherTemp:"",weatherWind:"",weatherHumidity:"",applicatorId:"",
  species:"",supplier:"",releaseRate:"",releaseUnit:"insects/plant",notes:""};

export default function CultivationInputs(){
  const [spaces, setSpaces] = useState([]);
  const [employees, setEmployees] = useState([]);
  const pestApplicators=employees.filter(e=>e.pestLicenseCategory!=="None / Not Licensed"&&e.status==="active");

  const [records,setRecords]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [ci, sp, gm, emp]=await Promise.all([
          db.cultivation_inputs.list(),
          db.grow_spaces.list(),
          db.grow_rooms.list(),
          db.employees.list(),
        ]);
        setRecords(ci);
        const combined=[...sp,...gm.filter(g=>!sp.some(s=>s.name===g.name))];
        setSpaces(combined);
        setEmployees(emp);
      }catch(e){ console.error("CultivationInputs load error:",e); }
      setLoading(false);
    }
    load();
  },[]);
  const [form,setForm]=useState(null);
  const [filterSpace,setFilterSpace]=useState("");
  const [filterType,setFilterType]=useState("");
  const [err,setErr]=useState("");

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  const isSpray=form?.type==="ipm_spray"||form?.type==="ipm_foliar";
  const isBeneficial=form?.type==="beneficial";

  async function save(){
    if(!form.spaceId){setErr("Select a grow space.");return;}
    if(!form.product&&!isBeneficial){setErr("Enter a product name.");return;}
    if(isBeneficial&&!form.species){setErr("Enter the insect species.");return;}
    const space=spaces.find(s=>String(s.id)===String(form.spaceId));
    const applicator=employees.find(e=>e.id===form.applicatorId);
    const rec={...form,id:form.id||crypto.randomUUID(),
      spaceName:space?.name||"",
      applicatorName:applicator?.name||"",
      applicatorLicenseNum:applicator?.pestLicenseNum||"",
    };
    try{
      const saved=await db.cultivation_inputs.upsert(rec);
      if(form.id) setRecords(p=>p.map(x=>x.id===saved.id?saved:x));
      else setRecords(p=>[...p,saved]);
      setForm(null);setErr("");
    }catch(e){ console.error("Cultivation input save failed:",e); setErr("Save failed: "+e.message); }
  }
  async function remove(id){
    try{ await db.cultivation_inputs.delete(id); setRecords(p=>p.filter(x=>x.id!==id)); }
    catch(e){ console.error("Cultivation input delete failed:",e); }
  }

  const filtered=records.filter(r=>
    (!filterSpace||r.spaceId===filterSpace)&&
    (!filterType||r.type===filterType)
  ).sort((a,b)=>new Date(b.date)-new Date(a.date));

  function exportSprayLog(){
    const sprays=records.filter(r=>r.type==="ipm_spray"||r.type==="ipm_foliar").sort((a,b)=>new Date(a.date)-new Date(b.date));
    const rows=["Date,Space,Product,EPA Reg #,Rate,Volume,Area,Method,Target Pest,Temp (°F),Wind (mph),Humidity (%),REI (hrs),PHI (days),Applicator,License #,Notes",
      ...sprays.map(r=>[r.date,r.spaceName,r.product,r.epaRegNum,r.rate+" "+r.rateUnit,r.volumeApplied+" "+r.volumeUnit,r.areaApplied,r.applicationMethod,r.targetPest,r.weatherTemp,r.weatherWind,r.weatherHumidity,r.rei,r.phi,r.applicatorName,r.applicatorLicenseNum,r.notes].map(v=>`"${v||""}"`).join(","))
    ].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows],{type:"text/csv"}));a.download="SprayLog-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();document.body.removeChild(a);
  }

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading cultivation inputs…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="ci-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Cultivation Inputs</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Nutrients, amendments, and beneficial insect releases — see Pesticide Spray Log for IPM applications</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Nutrients, IPM spray log, and beneficial insect releases per grow space — regulatory-grade records</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {records.some(r=>r.type==="ipm_spray"||r.type==="ipm_foliar")&&<button className="ci-btn ci-secondary" onClick={exportSprayLog}>↓ Export Spray Log CSV</button>}
            {!form&&<button className="ci-btn ci-primary" onClick={()=>setForm({...EMPTY})}>+ Log application</button>}
          </div>
        </div>

        {form&&(
          <div className="ci-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit Record":"Log Cultivation Input"}</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="ci-lbl">Grow space</label>
                <select className="ci-sel" value={form.spaceId} onChange={e=>setF("spaceId",e.target.value)}>
                  <option value="">— Select space —</option>
                  {spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label className="ci-lbl">Date applied</label><input type="date" className="ci-inp" value={form.date} onChange={e=>setF("date",e.target.value)} /></div>
              <div><label className="ci-lbl">Input type</label><select className="ci-sel" value={form.type} onChange={e=>setF("type",e.target.value)}>{INPUT_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            </div>

            {!isBeneficial&&(
              <div className="ci-box">
                <div className="ci-box-t">Product Details</div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ci-lbl">Product / material name</label><input className="ci-inp" value={form.product} onChange={e=>setF("product",e.target.value)} placeholder="e.g. Azamax, Cali Magic, Mammoth P" /></div>
                  <div><label className="ci-lbl">Manufacturer</label><input className="ci-inp" value={form.manufacturer} onChange={e=>setF("manufacturer",e.target.value)} /></div>
                </div>
                {isSpray&&<div style={{marginBottom:10}}><label className="ci-lbl">EPA Registration number</label><input className="ci-inp" value={form.epaRegNum} onChange={e=>setF("epaRegNum",e.target.value)} placeholder="e.g. 62719-515" /></div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ci-lbl">Rate</label><input className="ci-inp" value={form.rate} onChange={e=>setF("rate",e.target.value)} /></div>
                  <div><label className="ci-lbl">Rate unit</label><select className="ci-sel" value={form.rateUnit} onChange={e=>setF("rateUnit",e.target.value)}>{RATE_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
                  <div><label className="ci-lbl">Volume applied</label><input className="ci-inp" value={form.volumeApplied} onChange={e=>setF("volumeApplied",e.target.value)} /></div>
                  <div><label className="ci-lbl">Unit</label><select className="ci-sel" value={form.volumeUnit} onChange={e=>setF("volumeUnit",e.target.value)}>{VOL_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
                  <div><label className="ci-lbl">Area (sq ft)</label><input className="ci-inp" value={form.areaApplied} onChange={e=>setF("areaApplied",e.target.value)} /></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><label className="ci-lbl">Cost per unit ($)</label><input type="number" step="0.01" className="ci-inp" value={form.costPerUnit} onChange={e=>setF("costPerUnit",e.target.value)} /></div>
                  <div><label className="ci-lbl">Total cost ($)</label><input type="number" step="0.01" className="ci-inp" value={form.totalCost} onChange={e=>setF("totalCost",e.target.value)} /></div>
                </div>
              </div>
            )}

            {isSpray&&(
              <div className="ci-box">
                <div className="ci-box-t">Spray Record — NY DEC Required Fields</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ci-lbl">Application method</label><select className="ci-sel" value={form.applicationMethod} onChange={e=>setF("applicationMethod",e.target.value)}>{APP_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
                  <div><label className="ci-lbl">Target pest / disease</label><input className="ci-inp" value={form.targetPest} onChange={e=>setF("targetPest",e.target.value)} placeholder="e.g. Powdery mildew, Spider mites" /></div>
                  <div><label className="ci-lbl">Applicator (must hold valid license)</label>
                    <select className="ci-sel" value={form.applicatorId} onChange={e=>setF("applicatorId",e.target.value)}>
                      <option value="">— Select applicator —</option>
                      {pestApplicators.map(e=><option key={e.id} value={e.id}>{e.name} — {e.pestLicenseCategory.split("—")[0].trim()} #{e.pestLicenseNum}</option>)}
                      <option value="__manual">Enter manually →</option>
                    </select>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ci-lbl">REI — Re-Entry Interval (hrs)</label><input type="number" className="ci-inp" value={form.rei} onChange={e=>setF("rei",e.target.value)} placeholder="e.g. 4" /></div>
                  <div><label className="ci-lbl">PHI — Pre-Harvest Interval (days)</label><input type="number" className="ci-inp" value={form.phi} onChange={e=>setF("phi",e.target.value)} placeholder="e.g. 7" /></div>
                  <div style={{display:"flex",alignItems:"flex-end"}}>{form.phi&&<div style={{fontSize:11,color:"var(--amber)",fontWeight:600,paddingBottom:8}}>⚠ No harvest within {form.phi} days of this application</div>}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div><label className="ci-lbl">Temp at application (°F)</label><input type="number" className="ci-inp" value={form.weatherTemp} onChange={e=>setF("weatherTemp",e.target.value)} /></div>
                  <div><label className="ci-lbl">Wind speed (mph)</label><input type="number" step="0.1" className="ci-inp" value={form.weatherWind} onChange={e=>setF("weatherWind",e.target.value)} /></div>
                  <div><label className="ci-lbl">Relative humidity (%)</label><input type="number" className="ci-inp" value={form.weatherHumidity} onChange={e=>setF("weatherHumidity",e.target.value)} /></div>
                </div>
              </div>
            )}

            {isBeneficial&&(
              <div className="ci-box">
                <div className="ci-box-t">Beneficial Insect Release</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ci-lbl">Species</label><input className="ci-inp" value={form.species} onChange={e=>setF("species",e.target.value)} placeholder="e.g. Amblyseius cucumeris" /></div>
                  <div><label className="ci-lbl">Supplier</label><input className="ci-inp" value={form.supplier} onChange={e=>setF("supplier",e.target.value)} /></div>
                  <div><label className="ci-lbl">Release rate</label><input className="ci-inp" value={form.releaseRate} onChange={e=>setF("releaseRate",e.target.value)} /></div>
                  <div><label className="ci-lbl">Unit</label><input className="ci-inp" value={form.releaseUnit} onChange={e=>setF("releaseUnit",e.target.value)} placeholder="insects/plant" /></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><label className="ci-lbl">Cost per unit ($)</label><input type="number" step="0.01" className="ci-inp" value={form.costPerUnit} onChange={e=>setF("costPerUnit",e.target.value)} /></div>
                  <div><label className="ci-lbl">Total cost ($)</label><input type="number" step="0.01" className="ci-inp" value={form.totalCost} onChange={e=>setF("totalCost",e.target.value)} /></div>
                </div>
              </div>
            )}

            <div style={{marginBottom:10}}><label className="ci-lbl">Notes</label><textarea className="ci-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="ci-btn ci-primary" onClick={save}>{form.id?"Save changes":"Log input"}</button>
              <button className="ci-btn ci-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&(
          <div className="ci-card">
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <select className="ci-sel" style={{maxWidth:220}} value={filterSpace} onChange={e=>setFilterSpace(e.target.value)}>
                <option value="">All spaces</option>
                {spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="ci-sel" style={{maxWidth:220}} value={filterType} onChange={e=>setFilterType(e.target.value)}>
                <option value="">All types</option>
                {INPUT_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
              <div style={{marginLeft:"auto",fontSize:12,color:"var(--text-3)",alignSelf:"center"}}>{filtered.length} record{filtered.length!==1?"s":""}</div>
            </div>
            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No records yet. Log a nutrient application, spray, or beneficial release above.</div>
            ):(
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="ci-tbl">
                  <thead><tr><th>Date</th><th>Type</th><th>Space</th><th>Product / Species</th><th>Rate</th><th>Volume / Area</th><th>Applicator</th><th>Cost</th><th></th></tr></thead>
                  <tbody>
                    {filtered.map(r=>(
                      <tr key={r.id}>
                        <td style={{whiteSpace:"nowrap"}}>{fmtD(r.date)}</td>
                        <td><span className={"ci-pill t-"+r.type}>{INPUT_TYPES.find(t=>t.v===r.type)?.l.split(" ")[0]||r.type}</span></td>
                        <td>{r.spaceName}</td>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{r.species||r.product}<br/><span style={{fontSize:10,color:"var(--text-3)"}}>{r.epaRegNum?"EPA#"+r.epaRegNum:r.manufacturer}</span></td>
                        <td style={{fontSize:11}}>{r.rate&&(r.rate+" "+r.rateUnit)}</td>
                        <td style={{fontSize:11}}>{r.volumeApplied&&(r.volumeApplied+" "+r.volumeUnit)}{r.areaApplied&&(" / "+r.areaApplied+" sqft")}</td>
                        <td style={{fontSize:11}}>{r.applicatorName||"—"}{r.applicatorLicenseNum&&<br/>}{r.applicatorLicenseNum&&<span style={{fontSize:9,color:"var(--text-3)"}}>{r.applicatorLicenseNum}</span>}</td>
                        <td>{fmtC(r.totalCost)}</td>
                        <td><div style={{display:"flex",gap:5}}>
                          <button className="ci-sm ci-edit" onClick={()=>setForm({...r})}>Edit</button>
                          <button className="ci-sm ci-del" onClick={()=>remove(r.id)}>✕</button>
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
