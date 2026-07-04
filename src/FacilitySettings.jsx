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
  timezone:"America/New_York",metrcApiKey:"",flourishApiKey:"",biotrackApiKey:"",kaychaApiKey:"",distruApiKey:"",
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

          <div className="fs-section">V2 Integrations — API Bridge</div>
          <div style={{background:"rgba(90,63,160,0.06)",border:"1px solid rgba(90,63,160,0.2)",borderRadius:8,padding:"14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:16}}>🔌</span>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>V2 Integration Hub</div>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(90,63,160,0.15)",color:"#9080f0"}}>COMING IN V2</span>
            </div>
            <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>Store your API credentials now. When V2 launches, flip one switch and ResinOps connects to your existing compliance and seed-to-sale systems automatically — no re-entry, no migration.</div>

            {[
              {name:"METRC",logo:"🌿",desc:"NY OCM compliant seed-to-sale tracking — plant tags, harvest lots, inventory transfers",field:"metrcApiKey",placeholder:"Paste your METRC Software API key"},
              {name:"Flourish",logo:"🌱",desc:"Cannabis ERP — inventory, POS, compliance reporting integration",field:"flourishApiKey",placeholder:"Paste your Flourish API key"},
              {name:"BioTrack",logo:"🔬",desc:"State-mandated tracking for WA, NM, and other BioTrack states",field:"biotrackApiKey",placeholder:"Paste your BioTrack API key"},
              {name:"Kaycha Labs",logo:"🧪",desc:"Auto-pull COA results when samples are released — no manual CSV upload",field:"kaychaApiKey",placeholder:"Paste your Kaycha Labs API key (when available)"},
              {name:"Distru",logo:"📦",desc:"Distribution platform — pull confirmed orders directly into ResinOps sales pipeline",field:"distruApiKey",placeholder:"Paste your Distru API key"},
            ].map(({name,logo,desc,field,placeholder})=>(
              <div key={field} style={{background:"var(--surface)",borderRadius:8,padding:"10px 12px",marginBottom:8,border:"1px solid var(--border-2)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:16}}>{logo}</span>
                  <div style={{fontWeight:600,fontSize:12,color:"var(--text)"}}>{name}</div>
                  <div style={{fontSize:10,color:"var(--text-3)",flex:1}}>{desc}</div>
                  <div style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:8,
                    background:settings[field]?"rgba(74,124,89,0.15)":"rgba(100,100,100,0.1)",
                    color:settings[field]?"var(--accent-2)":"var(--text-3)"}}>
                    {settings[field]?"Key stored ✓":"Not configured"}
                  </div>
                </div>
                <input className="fs-inp" value={settings[field]||""} onChange={e=>setF(field,e.target.value)} placeholder={placeholder} style={{fontSize:11}} />
              </div>
            ))}

            <div style={{marginTop:10,padding:"8px 12px",background:"rgba(90,63,160,0.08)",borderRadius:7,fontSize:11,color:"var(--text-2)"}}>
              🔒 API keys are stored locally in your browser and are never transmitted to any server. V2 will use encrypted cloud storage with zero-knowledge architecture.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
