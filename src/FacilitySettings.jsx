import { useState, useEffect } from "react";

const LICENSE_TYPES = [
  "Adult-Use Cultivator","Adult-Use Processor","Adult-Use Distributor",
  "Adult-Use Retailer","Adult-Use Microbusiness","Adult-Use Nursery",
  "Medical Cultivator","Medical Processor","Medical Distributor","Medical Retailer",
  "Registered Organization (RO)","Hemp Processor","Hemp Cultivator","Other",
];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
const TIMEZONES = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage","Pacific/Honolulu"];

const CSS = `
  .fs-wrap{padding:24px;flex:1;overflow-y:auto;}
  .fs-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:22px;margin-bottom:16px;}
  .fs-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .fs-inp:focus{outline:none;border-color:var(--accent);}
  .fs-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .fs-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .fs-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:8px 18px;}
  .fs-btn:hover{opacity:0.85;}
  .fs-primary{background:var(--accent);color:#fff;}
  .fs-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .fs-section{font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em;margin:18px 0 10px;}
  .fs-saved{font-size:12px;color:var(--accent-2);font-weight:500;}
`;

const DEFAULTS = {
  facilityName:"",dbaName:"",licenseNumber:"",licenseType:"Adult-Use Processor",
  state:"NY",address:"",city:"",zip:"",phone:"",email:"",website:"",
  ownerName:"",ownerEmail:"",ownerPhone:"",
  timezone:"America/New_York",metrcApiKey:"",
  fiscalYearStart:"01",tagSystem:"METRC",
};

export default function FacilitySettings(){
  const [settings,setSettings] = useState(() => {
    try{ return {...DEFAULTS,...JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}")}; }catch{ return DEFAULTS; }
  });
  const [saved,setSaved] = useState(false);
  const setF = (k,v) => setSettings(s=>({...s,[k]:v}));

  function save(){
    localStorage.setItem("resinops_facility_settings",JSON.stringify(settings));
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  }

  return(
    <>
      <style>{CSS}</style>
      <div className="fs-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Facility Settings</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Your facility's identity — appears on all exports, batch records, and spray logs</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            {saved&&<span className="fs-saved">✓ Saved</span>}
            <button className="fs-btn fs-primary" onClick={save}>Save settings</button>
          </div>
        </div>

        <div className="fs-card">
          <div className="fs-section">Facility Identity</div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
            <div><label className="fs-lbl">Licensed facility name</label><input className="fs-inp" value={settings.facilityName} onChange={e=>setF("facilityName",e.target.value)} placeholder="Green Wells Venture LLC" /></div>
            <div><label className="fs-lbl">DBA name (if different)</label><input className="fs-inp" value={settings.dbaName} onChange={e=>setF("dbaName",e.target.value)} placeholder="Casa Verde Farms" /></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:10,marginBottom:10}}>
            <div><label className="fs-lbl">License type</label><select className="fs-sel" value={settings.licenseType} onChange={e=>setF("licenseType",e.target.value)}>{LICENSE_TYPES.map(l=><option key={l}>{l}</option>)}</select></div>
            <div><label className="fs-lbl">License number</label><input className="fs-inp" value={settings.licenseNumber} onChange={e=>setF("licenseNumber",e.target.value)} placeholder="OCM-AUPR-000000" /></div>
            <div><label className="fs-lbl">State</label><select className="fs-sel" value={settings.state} onChange={e=>setF("state",e.target.value)}>{US_STATES.map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
            <div><label className="fs-lbl">Street address</label><input className="fs-inp" value={settings.address} onChange={e=>setF("address",e.target.value)} /></div>
            <div><label className="fs-lbl">City</label><input className="fs-inp" value={settings.city} onChange={e=>setF("city",e.target.value)} /></div>
            <div><label className="fs-lbl">ZIP</label><input className="fs-inp" value={settings.zip} onChange={e=>setF("zip",e.target.value)} /></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><label className="fs-lbl">Facility phone</label><input className="fs-inp" value={settings.phone} onChange={e=>setF("phone",e.target.value)} /></div>
            <div><label className="fs-lbl">Facility email</label><input className="fs-inp" value={settings.email} onChange={e=>setF("email",e.target.value)} /></div>
            <div><label className="fs-lbl">Website</label><input className="fs-inp" value={settings.website} onChange={e=>setF("website",e.target.value)} /></div>
          </div>

          <div className="fs-section">Responsible Party / Owner</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><label className="fs-lbl">Owner / responsible party name</label><input className="fs-inp" value={settings.ownerName} onChange={e=>setF("ownerName",e.target.value)} /></div>
            <div><label className="fs-lbl">Owner email</label><input className="fs-inp" value={settings.ownerEmail} onChange={e=>setF("ownerEmail",e.target.value)} /></div>
            <div><label className="fs-lbl">Owner phone</label><input className="fs-inp" value={settings.ownerPhone} onChange={e=>setF("ownerPhone",e.target.value)} /></div>
          </div>

          <div className="fs-section">System Settings</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><label className="fs-lbl">Timezone</label><select className="fs-sel" value={settings.timezone} onChange={e=>setF("timezone",e.target.value)}>{TIMEZONES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label className="fs-lbl">Seed-to-sale system</label><select className="fs-sel" value={settings.tagSystem} onChange={e=>setF("tagSystem",e.target.value)}><option>METRC</option><option>BioTrackTHC</option><option>Leaf Data Systems</option><option>MJ Freeway</option><option>Flourish</option><option>COVA</option><option>Other</option></select></div>
            <div><label className="fs-lbl">Fiscal year start month</label><select className="fs-sel" value={settings.fiscalYearStart} onChange={e=>setF("fiscalYearStart",e.target.value)}>{["01","02","03","04","05","06","07","08","09","10","11","12"].map((m,i)=><option key={m} value={m}>{new Date(2024,i,1).toLocaleString("en-US",{month:"long"})}</option>)}</select></div>
          </div>

          <div className="fs-section">V2 API Bridge — Reserved Fields</div>
          <div style={{background:"rgba(74,124,89,0.06)",border:"1px solid rgba(74,124,89,0.2)",borderRadius:8,padding:"10px 14px"}}>
            <div style={{fontSize:12,color:"var(--text-2)",marginBottom:8}}>These fields will activate when the V2 backend is live. Store them now so your setup is complete when you flip the switch.</div>
            <div><label className="fs-lbl">METRC API key (stored locally, not transmitted until V2)</label><input className="fs-inp" value={settings.metrcApiKey} onChange={e=>setF("metrcApiKey",e.target.value)} placeholder="Paste your METRC software API key here" /></div>
          </div>
        </div>
      </div>
    </>
  );
}
