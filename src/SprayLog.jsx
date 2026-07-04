import { useState, useEffect } from "react";

const APP_METHODS = ["Backpack sprayer","Boom sprayer","Hand sprayer","Drench / Irrigation injection","Fogger / ULV","Broadcast","Other"];
const VOL_UNITS = ["gal","L","ml","oz","qt"];
const RATE_UNITS = ["oz/gal","ml/L","tsp/gal","tbsp/gal","fl oz/gal","lb/acre","g/plant","ml/plant","as labeled"];
const SPRAY_TYPES = [
  {v:"ipm_spray", l:"IPM Pesticide Application"},
  {v:"ipm_foliar", l:"Foliar Spray (non-pesticidal)"},
  {v:"fungicide", l:"Fungicide Application"},
  {v:"insecticide", l:"Insecticide Application"},
  {v:"herbicide", l:"Herbicide Application"},
];

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}

const CSS=`
  .sl-wrap{padding:24px;flex:1;overflow-y:auto;}
  .sl-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .sl-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .sl-inp:focus{outline:none;border-color:var(--accent);}
  .sl-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .sl-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .sl-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .sl-btn:hover{opacity:0.85;}
  .sl-primary{background:var(--accent);color:#fff;}
  .sl-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .sl-danger{background:rgba(200,74,74,0.15);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .sl-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .sl-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .sl-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .sl-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .sl-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .sl-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .sl-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .sl-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:top;}
  .sl-pill{font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:rgba(200,80,50,0.15);color:#e06040;}
  .sl-warn{background:rgba(200,150,58,0.12);border:1px solid rgba(200,150,58,0.3);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:10px;}
  .sl-dec-badge{background:rgba(74,124,89,0.1);border:1px solid rgba(74,124,89,0.25);border-radius:6px;padding:4px 10px;font-size:10px;font-weight:700;color:var(--accent-2);letter-spacing:0.05em;}
`;

const EMPTY={
  date:new Date().toISOString().split("T")[0],
  type:"ipm_spray",
  spaceId:"",spaceName:"",
  product:"",manufacturer:"",
  epaRegNum:"",
  rate:"",rateUnit:"oz/gal",
  volumeApplied:"",volumeUnit:"gal",
  areaApplied:"",
  applicationMethod:"Backpack sprayer",
  targetPest:"",
  weatherTemp:"",weatherWind:"",weatherHumidity:"",
  rei:"",phi:"",
  applicatorId:"",applicatorName:"",applicatorLicenseNum:"",
  notes:"",
};

export default function SprayLog(){
  const allSpaces=[
    ...JSON.parse(localStorage.getItem("resinops_spaces")||"[]"),
    ...JSON.parse(localStorage.getItem("resinops_grow_map")||"[]"),
  ];
  const employees=JSON.parse(localStorage.getItem("resinops_employees")||"[]");
  const pestApplicators=employees.filter(e=>e.pestLicenseCategory&&e.pestLicenseCategory!=="None / Not Licensed"&&e.status==="active");

  const [records,setRecords]=useState(()=>{
    try{
      const raw=JSON.parse(localStorage.getItem("resinops_spray_log")||"[]");
      // Only pull from cult_inputs records that are genuinely pesticide applications
      // (have an EPA reg number — nutrients never have EPA reg numbers)
      const oldInputs=JSON.parse(localStorage.getItem("resinops_cult_inputs")||"[]")
        .filter(r=>(r.epaRegNum||r.epa_reg_num||r["EPA Registration Number"]||"").trim().length>0);
      const combined=[...raw,...oldInputs.filter(o=>!raw.some(r=>r.id===o.id))];
      return combined.map(r=>normalizeRecord(r, allSpaces));
    }catch{return[];}
  });

  const [form,setForm]=useState(null);
  const [filterSpace,setFilterSpace]=useState("");
  const [err,setErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_spray_log",JSON.stringify(records));},[records]);
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  function normalizeRecord(r, spaces){
    const spaceName = (()=>{
      const direct = r.spaceName||r.space_name||r.grow_space___room||r.grow_space_room||r.grow_space||r["Grow Space / Room"]||r["Grow Space"]||r["Space"]||r["Room"]||"";
      if(direct) return direct;
      const key = Object.keys(r).find(k=>k.toLowerCase().includes("space")||k.toLowerCase().includes("room")||k.toLowerCase().includes("grow_space"));
      return key ? String(r[key]||"") : "";
    })();
    const spaceId = r.spaceId||(spaces.find(s=>s.name===spaceName)?.id||"");
    const applicatorName = r.applicatorName||r.licensed_applicator||r.applicator_name||r["Licensed Applicator"]||r["Applicator"]||"";
    const applicatorLicenseNum = r.applicatorLicenseNum||r.pesticide_license___||r.pesticide_license||r["Pesticide License #"]||r["Pesticide License Number"]||"";
    return {
      ...EMPTY,
      ...r,
      id: r.id||"sl_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
      type: r.type||"ipm_spray",
      date: r.date||r.application_date||r["Application Date"]||"",
      spaceName,spaceId,
      product: (()=>{
        const direct = r.product||r.product___pesticide_name||r.product_pesticide_name||r.pesticide_name||r["Product / Pesticide Name"]||r["Product"]||r["Pesticide Name"]||r["Chemical"]||"";
        if(direct) return direct;
        const key = Object.keys(r).find(k=>k.toLowerCase().includes("product")||k.toLowerCase().includes("pesticide")||k.toLowerCase().includes("chemical"));
        return key ? String(r[key]||"") : "";
      })(),
      manufacturer: r.manufacturer||r["Manufacturer"]||r["Brand"]||"",
      epaRegNum: r.epaRegNum||r.epa_registration_number||r.epa_reg_number||r["EPA Registration Number"]||r["EPA Reg #"]||"",
      rate: (()=>{const raw=String(r.rate||r.label_rate||r["Label Rate"]||"");const m=raw.match(/^([\d.]+)/);return m?m[1]:raw;})(),
      rateUnit: (()=>{const raw=String(r.rate||r.label_rate||r["Label Rate"]||"");const m=raw.match(/^[\d.]+\s*(.*)/);return r.rateUnit||r.rate_unit||(m&&m[1]?m[1]:"oz/gal");})(),
      volumeApplied: String(r.volumeApplied||r.amount_mixed||r.amount_mixed_gallons||r["Amount Mixed (gallons)"]||r["Amount Mixed"]||""),
      volumeUnit: r.volumeUnit||r.volume_unit||"gal",
      areaApplied: String(r.areaApplied||r.area_treated||r.area_treated_sq_ft||r["Area Treated (sq ft)"]||r["Area Treated"]||""),
      applicationMethod: r.applicationMethod||r.application_equipment||r["Application Equipment"]||"Backpack sprayer",
      targetPest: r.targetPest||r.target_pest___disease||r.target_pest_disease||r.target_pest||r["Target Pest / Disease"]||r["Target Pest"]||"",
      weatherTemp: String(r.weatherTemp||r.temp_at_application||r.temp_at_application__f__||r["Temp at Application (F)"]||r["Temp"]||""),
      weatherWind: String(r.weatherWind||r.wind_speed__mph__||r.wind_speed||r["Wind Speed (mph)"]||r["Wind Speed"]||""),
      weatherHumidity: String(r.weatherHumidity||r.relative_humidity____||r.relative_humidity||r["Relative Humidity (%)"]||r["RH"]||""),
      rei: String(r.rei||r.re_entry_interval__hrs__||r.re_entry_interval||r["Re-Entry Interval (hrs)"]||r["REI"]||""),
      phi: String(r.phi||r.pre_harvest_interval__days__||r.pre_harvest_interval||r["Pre-Harvest Interval (days)"]||r["PHI"]||""),
      applicatorName,applicatorLicenseNum,
      applicatorId: r.applicatorId||"",
      notes: r.notes||r["Notes"]||"",
    };
  }

  function save(){
    if(!form.date){setErr("Enter application date.");return;}
    if(!form.product){setErr("Enter the product name.");return;}
    if(!form.epaRegNum){setErr("EPA registration number is required for NY DEC compliance.");return;}
    if(!form.applicatorName&&!form.applicatorId){setErr("Licensed applicator is required.");return;}
    const space=allSpaces.find(s=>String(s.id)===String(form.spaceId));
    const applicator=employees.find(e=>e.id===form.applicatorId);
    const rec={
      ...form,
      id:form.id||"sl_"+Date.now(),
      spaceName:space?.name||form.spaceName||"",
      applicatorName:applicator?.name||form.applicatorName||"",
      applicatorLicenseNum:applicator?.pestLicenseNum||form.applicatorLicenseNum||"",
    };
    if(form.id) setRecords(p=>p.map(x=>x.id===rec.id?rec:x));
    else setRecords(p=>[...p,rec]);
    setForm(null);setErr("");
  }

  function remove(id){setRecords(p=>p.filter(x=>x.id!==id));}

  function exportCSV(){
    const sorted=[...records].sort((a,b)=>new Date(a.date)-new Date(b.date));
    const rows=[
      "Date,Grow Space,Product,EPA Reg #,Label Rate,Amount Mixed,Area Treated (sqft),Application Method,Target Pest/Disease,Temp (F),Wind (mph),RH (%),REI (hrs),PHI (days),Licensed Applicator,Pesticide License #,Notes",
      ...sorted.map(r=>[
        r.date,r.spaceName,r.product,r.epaRegNum,
        r.rate+" "+r.rateUnit,r.volumeApplied+" "+r.volumeUnit,
        r.areaApplied,r.applicationMethod,r.targetPest,
        r.weatherTemp,r.weatherWind,r.weatherHumidity,
        r.rei,r.phi,r.applicatorName,r.applicatorLicenseNum,r.notes
      ].map(v=>`"${v||""}"`).join(","))
    ].join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([rows],{type:"text/csv"}));
    a.download="SprayLog-NY-DEC-"+new Date().toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
  }

  const sorted=[...records].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const filtered=sorted.filter(r=>!filterSpace||r.spaceId===filterSpace||r.spaceName===filterSpace);

  // Active PHI warnings — applications within PHI window
  const phiWarnings=records.filter(r=>{
    if(!r.phi||!r.date) return false;
    const appDate=new Date(r.date);
    const phiEnd=new Date(appDate);
    phiEnd.setDate(phiEnd.getDate()+parseInt(r.phi));
    return phiEnd>new Date();
  });

  return(
    <>
      <style>{CSS}</style>
      <div className="sl-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
              <div style={{fontSize:16,fontWeight:600,color:"var(--text)"}}>Pesticide Spray Log</div>
              <span className="sl-dec-badge">NY DEC COMPLIANT</span>
            </div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Regulatory pesticide application records — EPA reg #, REI, PHI, licensed applicator, and weather conditions required</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="sl-btn sl-secondary" onClick={exportCSV}>⬇ Export NY DEC CSV</button>
            <button className="sl-btn sl-primary" onClick={()=>setForm({...EMPTY})}>+ Log application</button>
          </div>
        </div>

        {/* Active PHI warnings */}
        {phiWarnings.length>0&&(
          <div className="sl-warn">
            ⚠ <strong>{phiWarnings.length} active PHI restriction{phiWarnings.length!==1?"s":""}</strong> — the following spaces have harvest restrictions in effect:
            {phiWarnings.map((r,i)=>{
              const phiEnd=new Date(r.date);phiEnd.setDate(phiEnd.getDate()+parseInt(r.phi));
              const daysLeft=Math.ceil((phiEnd-new Date())/86400000);
              return <span key={i} style={{display:"block",marginLeft:16,fontSize:11,marginTop:2}}>• {r.spaceName||"Unknown space"} — {r.product} — harvest OK after {phiEnd.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ({daysLeft}d remaining)</span>;
            })}
          </div>
        )}

        {form&&(
          <div className="sl-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit spray record":"Log pesticide application"}</div>

            <div className="sl-box">
              <div className="sl-box-t">Application Details</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="sl-lbl">Application date</label><input type="date" className="sl-inp" value={form.date} onChange={e=>setF("date",e.target.value)} /></div>
                <div><label className="sl-lbl">Application type</label>
                  <select className="sl-sel" value={form.type} onChange={e=>setF("type",e.target.value)}>
                    {SPRAY_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                </div>
                <div><label className="sl-lbl">Grow space / room</label>
                  <select className="sl-sel" value={form.spaceId} onChange={e=>{const sp=allSpaces.find(s=>String(s.id)===e.target.value);setForm(f=>({...f,spaceId:e.target.value,spaceName:sp?.name||""}));}}>
                    <option value="">— Select space —</option>
                    {allSpaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="sl-lbl">Product / pesticide name</label><input className="sl-inp" value={form.product} onChange={e=>setF("product",e.target.value)} placeholder="e.g. Azamax (Azadirachtin 1.2%)" /></div>
                <div><label className="sl-lbl">Manufacturer</label><input className="sl-inp" value={form.manufacturer} onChange={e=>setF("manufacturer",e.target.value)} placeholder="e.g. General Hydroponics" /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <div><label className="sl-lbl">EPA Registration # <span style={{color:"var(--danger)"}}>*required</span></label><input className="sl-inp" value={form.epaRegNum} onChange={e=>setF("epaRegNum",e.target.value)} placeholder="e.g. 71711-7" /></div>
                <div style={{display:"flex",gap:6}}>
                  <div style={{flex:1}}><label className="sl-lbl">Label rate</label><input className="sl-inp" value={form.rate} onChange={e=>setF("rate",e.target.value)} placeholder="2" /></div>
                  <div style={{width:110}}><label className="sl-lbl">Unit</label><select className="sl-sel" value={form.rateUnit} onChange={e=>setF("rateUnit",e.target.value)}>{RATE_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <div style={{flex:1}}><label className="sl-lbl">Amount mixed</label><input className="sl-inp" value={form.volumeApplied} onChange={e=>setF("volumeApplied",e.target.value)} placeholder="4" /></div>
                  <div style={{width:80}}><label className="sl-lbl">Unit</label><select className="sl-sel" value={form.volumeUnit} onChange={e=>setF("volumeUnit",e.target.value)}>{VOL_UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
                </div>
              </div>
            </div>

            <div className="sl-box">
              <div className="sl-box-t">NY DEC Required Fields</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="sl-lbl">Area treated (sq ft)</label><input type="number" className="sl-inp" value={form.areaApplied} onChange={e=>setF("areaApplied",e.target.value)} /></div>
                <div><label className="sl-lbl">Application method</label><select className="sl-sel" value={form.applicationMethod} onChange={e=>setF("applicationMethod",e.target.value)}>{APP_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
                <div><label className="sl-lbl">Target pest / disease</label><input className="sl-inp" value={form.targetPest} onChange={e=>setF("targetPest",e.target.value)} placeholder="e.g. Spider mites" /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="sl-lbl">REI — Re-entry interval (hrs)</label><input type="number" className="sl-inp" value={form.rei} onChange={e=>setF("rei",e.target.value)} placeholder="4" /></div>
                <div><label className="sl-lbl">PHI — Pre-harvest interval (days)</label><input type="number" className="sl-inp" value={form.phi} onChange={e=>setF("phi",e.target.value)} placeholder="0" /></div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                  {form.phi&&parseInt(form.phi)>0&&<div style={{fontSize:11,color:"var(--amber)",fontWeight:600}}>⚠ No harvest within {form.phi} days</div>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="sl-lbl">Temp at application (°F)</label><input type="number" className="sl-inp" value={form.weatherTemp} onChange={e=>setF("weatherTemp",e.target.value)} /></div>
                <div><label className="sl-lbl">Wind speed (mph)</label><input type="number" step="0.1" className="sl-inp" value={form.weatherWind} onChange={e=>setF("weatherWind",e.target.value)} /></div>
                <div><label className="sl-lbl">Relative humidity (%)</label><input type="number" className="sl-inp" value={form.weatherHumidity} onChange={e=>setF("weatherHumidity",e.target.value)} /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label className="sl-lbl">Licensed applicator <span style={{color:"var(--danger)"}}>*required</span></label>
                  <select className="sl-sel" value={form.applicatorId} onChange={e=>{
                    const emp=employees.find(x=>x.id===e.target.value);
                    setForm(f=>({...f,applicatorId:e.target.value,applicatorName:emp?.name||"",applicatorLicenseNum:emp?.pestLicenseNum||""}));
                  }}>
                    <option value="">— Select from employee roster —</option>
                    {pestApplicators.map(e=><option key={e.id} value={e.id}>{e.name} — {(e.pestLicenseCategory||"").split("—")[0].trim()} #{e.pestLicenseNum}</option>)}
                    <option value="__manual">Enter manually below →</option>
                  </select>
                </div>
                {(form.applicatorId==="__manual"||(!form.applicatorId&&form.applicatorName))&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <div><label className="sl-lbl">Applicator name (manual)</label><input className="sl-inp" value={form.applicatorName} onChange={e=>setF("applicatorName",e.target.value)} /></div>
                    <div><label className="sl-lbl">License #</label><input className="sl-inp" value={form.applicatorLicenseNum} onChange={e=>setF("applicatorLicenseNum",e.target.value)} /></div>
                  </div>
                )}
                {form.applicatorId&&form.applicatorId!=="__manual"&&(
                  <div style={{display:"flex",alignItems:"flex-end",paddingBottom:8,fontSize:12,color:"var(--text-3)"}}>
                    License: <strong style={{color:"var(--text)",marginLeft:4}}>{form.applicatorLicenseNum||"—"}</strong>
                  </div>
                )}
              </div>
            </div>

            <div style={{marginBottom:10}}><label className="sl-lbl">Notes</label><textarea className="sl-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="sl-btn sl-primary" onClick={save}>{form.id?"Save changes":"Log application"}</button>
              <button className="sl-btn sl-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&(
          <div className="sl-card">
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <select className="sl-sel" style={{maxWidth:220}} value={filterSpace} onChange={e=>setFilterSpace(e.target.value)}>
                <option value="">All spaces</option>
                {allSpaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div style={{marginLeft:"auto",fontSize:12,color:"var(--text-3)"}}>{filtered.length} application{filtered.length!==1?"s":""}</div>
            </div>

            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>
                <div style={{fontSize:28,marginBottom:8}}>🌿</div>
                <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>No spray records yet</div>
                <div style={{fontSize:12}}>Log a pesticide application above or import from a CSV file via Data & Imports</div>
              </div>
            ):(
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="sl-tbl">
                  <thead><tr><th>Date</th><th>Space</th><th>Product</th><th>EPA Reg #</th><th>Rate</th><th>Amount</th><th>Area (sqft)</th><th>Target Pest</th><th>REI</th><th>PHI</th><th>Applicator</th><th>Weather</th><th></th></tr></thead>
                  <tbody>
                    {filtered.map(r=>{
                      const phiActive=r.phi&&r.date&&(()=>{const e=new Date(r.date);e.setDate(e.getDate()+parseInt(r.phi));return e>new Date();})();
                      return(
                        <tr key={r.id} style={{background:phiActive?"rgba(200,150,58,0.04)":""}}>
                          <td style={{whiteSpace:"nowrap",fontWeight:500,color:"var(--text)"}}>{fmtD(r.date)}</td>
                          <td style={{fontSize:11}}>{r.spaceName||"—"}</td>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{r.product}<br/><span style={{fontSize:10,color:"var(--text-3)"}}>{r.manufacturer}</span></td>
                          <td style={{fontSize:11,fontFamily:"monospace"}}>{r.epaRegNum||"—"}</td>
                          <td style={{fontSize:11}}>{r.rate&&r.rateUnit?r.rate+" "+r.rateUnit:"—"}</td>
                          <td style={{fontSize:11}}>{r.volumeApplied&&r.volumeUnit?r.volumeApplied+" "+r.volumeUnit:"—"}</td>
                          <td style={{fontSize:11}}>{r.areaApplied||"—"}</td>
                          <td style={{fontSize:11}}>{r.targetPest||"—"}</td>
                          <td style={{fontSize:11}}>{r.rei?r.rei+"h":"—"}</td>
                          <td style={{fontSize:11}}>{r.phi?<span style={{color:phiActive?"var(--amber)":"var(--text-3)",fontWeight:phiActive?700:400}}>{r.phi+"d"}{phiActive?" ⚠":""}</span>:"—"}</td>
                          <td style={{fontSize:11}}>{r.applicatorName||"—"}<br/><span style={{fontSize:9,color:"var(--text-3)"}}>{r.applicatorLicenseNum}</span></td>
                          <td style={{fontSize:11}}>{r.weatherTemp?r.weatherTemp+"°F":""}{r.weatherWind?" "+r.weatherWind+"mph":""}{r.weatherHumidity?" "+r.weatherHumidity+"%RH":""}</td>
                          <td><div style={{display:"flex",gap:5}}>
                            <button className="sl-sm sl-edit" onClick={()=>setForm({...r})}>Edit</button>
                            <button className="sl-sm sl-del" onClick={()=>remove(r.id)}>✕</button>
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
