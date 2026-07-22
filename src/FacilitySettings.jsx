import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { supabase, getCurrentFacility, getCurrentFacilityRole } from "./lib/supabase";
import { canAdministerFacility, FACILITY_ROLES } from "./lib/roles";
import { MODULES } from "./lib/modules";
import { isModuleVisible } from "./lib/moduleVisibility";
import { authenticatedApiFetch, formatApiError } from "./lib/api";

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
  .fs-member-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border-radius:8px;margin-bottom:8px;flex-wrap:wrap;}
  .fs-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:0.04em;}
  .fs-pill-pending{background:rgba(200,150,58,0.2);color:var(--amber);}
  .fs-pill-accepted{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .fs-danger{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
`;

const DEFAULTS = {
  facilityName:"",dbaName:"",licenseNumber:"",licenseType:"Adult-Use Processor",
  state:"NY",address:"",city:"",zip:"",phone:"",email:"",website:"",
  ownerName:"",ownerEmail:"",ownerPhone:"",
  timezone:"America/New_York",
  fiscalYearStart:"01",tagSystem:"METRC",
  productTier:"commercial",moduleOverrides:{},
  defaultCultivationAllocationBasis:"batch_weight",qbAccountMap:{},
};

const QB_ACCOUNT_FIELDS = [
  ["materialsDebit","Materials — debit","COGS:Materials"],["materialsCredit","Materials — credit","Inventory Asset"],
  ["laborDebit","Direct Labor — debit","COGS:Direct Labor"],["laborCredit","Direct Labor — credit","Wages Payable"],
  ["testingDebit","Lab Testing — debit","COGS:Lab Testing"],["testingCredit","Lab Testing — credit","Accounts Payable"],
  ["cultivationDebit","Cultivation — debit","COGS:Cultivation"],["cultivationCredit","Cultivation — credit","Overhead Clearing"],
  ["overheadDebit","Allocated Overhead — debit","COGS:Allocated Overhead"],["overheadCredit","Allocated Overhead — credit","Overhead Clearing"],
];

// Toggleable modules, grouped for the Modules card — excludes "core"
// modules (always on, not shown as a toggle) and preserves nav order.
const TOGGLEABLE_SECTIONS = (()=>{
  const sections = [];
  let current = null;
  for (const mod of MODULES) {
    if (mod.tier === "core") continue;
    if (mod.sectionBreak || !current) {
      current = { name: mod.sectionBreak || "Other", mods: [] };
      sections.push(current);
    }
    current.mods.push(mod);
  }
  return sections;
})();

// Matches supabase/migrations/20260723150000_add_section_scoped_permissions.sql's
// table_scopes values — keep in sync if a scope is ever added/renamed there.
const PERMISSION_SCOPES = [
  ["cultivation","Cultivation"],["processing","Processing"],["compliance","Compliance"],
  ["people_labor","People & Labor"],["business","Business"],["facility","Facility"],
];
const ROLE_OPTIONS = [FACILITY_ROLES.VIEWER, FACILITY_ROLES.MEMBER, FACILITY_ROLES.MANAGER, FACILITY_ROLES.ADMIN];
// Scope overrides can additionally be "none" — no access to that section at
// all, unlike the global role above which must always be a real role.
const SCOPE_ROLE_OPTIONS = ["none", ...ROLE_OPTIONS];
const EMPTY_INVITE = { email:"", role:FACILITY_ROLES.MEMBER, scopeRoles:{} };

export default function FacilitySettings(){
  const [settings,setSettings] = useState(DEFAULTS);
  const [saved,setSaved] = useState(false);
  const [loading,setLoading] = useState(true);
  const [err,setErr] = useState("");
  const setF = (k,v) => setSettings(s=>({...s,[k]:v}));

  const [members,setMembers] = useState([]);
  const [membersLoading,setMembersLoading] = useState(false);
  const [teamErr,setTeamErr] = useState("");
  const [teamMsg,setTeamMsg] = useState("");
  const [inviteForm,setInviteForm] = useState(EMPTY_INVITE);
  const [inviting,setInviting] = useState(false);
  const isAdmin = canAdministerFacility(getCurrentFacilityRole());

  useEffect(()=>{
    async function load(){
      const fid = getCurrentFacility();
      if(fid && supabase){
        try{
          const { data } = await supabase.from('facilities').select('*').eq('id', fid).single();
          if(data){
            setSettings({...DEFAULTS,
              facilityName: data.facility_name||"",
              dbaName: data.dba_name||"",
              licenseNumber: data.license_number||"",
              licenseType: data.license_type||"Adult-Use Processor",
              state: data.state||"NY",
              address: data.address||"",
              city: data.city||"",
              zip: data.zip||"",
              phone: data.phone||"",
              email: data.email||"",
              website: data.website||"",
              ownerName: data.owner_name||"",
              ownerEmail: data.owner_email||"",
              ownerPhone: data.owner_phone||"",
              timezone: data.timezone||"America/New_York",
              fiscalYearStart: data.fiscal_year_start ? String(data.fiscal_year_start).padStart(2,'0') : "01",
              tagSystem: data.tag_system||"METRC",
              productTier: data.product_tier||"commercial",
              moduleOverrides: data.module_overrides||{},
              defaultCultivationAllocationBasis: data.default_cultivation_allocation_basis||"batch_weight",
              qbAccountMap: data.qb_account_map||{},
            });
          }
        }catch(e){ console.error("FacilitySettings load error:",e); }
      } else {
        try{ setSettings({...DEFAULTS,...JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}")}); }catch{}
      }
      setLoading(false);
    }
    load();
  },[]);

  async function loadMembers(){
    const fid = getCurrentFacility();
    if(!fid || !supabase || !isAdmin) return;
    setMembersLoading(true);
    try{
      // Two separate queries rather than a PostgREST embed (facility_members
      // -> profiles) — that requires an explicit FK PostgREST's schema cache
      // can detect, which isn't guaranteed to exist between these two
      // tables. Fetching both and merging client-side works regardless.
      const { data: rows, error } = await supabase
        .from('facility_members')
        .select('id, user_id, role, scope_roles, accepted_at, created_at')
        .eq('facility_id', fid)
        .order('created_at');
      if(error) throw error;
      const userIds = [...new Set((rows||[]).map(r=>r.user_id))];
      let profileById = {};
      if(userIds.length){
        const { data: profiles, error: profileErr } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);
        if(profileErr) throw profileErr;
        profileById = Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      }
      setMembers((rows||[]).map(r=>({...r, profile: profileById[r.user_id]||null})));
    }catch(e){ setTeamErr("Could not load team: "+e.message); }
    setMembersLoading(false);
  }

  useEffect(()=>{ loadMembers(); },[]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendInvite(){
    if(!inviteForm.email.trim()){ setTeamErr("Enter an email address."); return; }
    setInviting(true); setTeamErr(""); setTeamMsg("");
    try{
      const res = await authenticatedApiFetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteForm.email.trim(), role: inviteForm.role, scopeRoles: inviteForm.scopeRoles }),
      }, { includeFacility: true });
      const json = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(json.error || `Invite failed (${res.status})`);
      setTeamMsg(`Invited ${inviteForm.email.trim()}.`);
      setInviteForm(EMPTY_INVITE);
      await loadMembers();
    }catch(e){ setTeamErr(formatApiError ? formatApiError(e) : e.message); }
    setInviting(false);
  }

  async function updateMember(member, patch){
    try{
      const { error } = await supabase.from('facility_members').update(patch).eq('id', member.id);
      if(error) throw error;
      setMembers(prev=>prev.map(m=>m.id===member.id?{...m,...patch}:m));
    }catch(e){ setTeamErr("Update failed: "+e.message); }
  }

  async function removeMember(member){
    try{
      const { error } = await supabase.from('facility_members').delete().eq('id', member.id);
      if(error) throw error;
      setMembers(prev=>prev.filter(m=>m.id!==member.id));
    }catch(e){ setTeamErr("Remove failed: "+e.message); }
  }

  async function save(){
    const fid = getCurrentFacility();
    if(fid && supabase){
      if(!canAdministerFacility(getCurrentFacilityRole())){
        setErr("Only facility owners and admins can change these settings.");
        setTimeout(()=>setErr(""),4000);
        return;
      }
      try{
        const { error } = await supabase.from('facilities').update({
          facility_name: settings.facilityName,
          dba_name: settings.dbaName,
          license_number: settings.licenseNumber,
          license_type: settings.licenseType,
          state: settings.state,
          address: settings.address,
          city: settings.city,
          zip: settings.zip,
          phone: settings.phone,
          email: settings.email,
          website: settings.website,
          owner_name: settings.ownerName,
          owner_email: settings.ownerEmail,
          owner_phone: settings.ownerPhone,
          timezone: settings.timezone,
          fiscal_year_start: parseInt(settings.fiscalYearStart)||1,
          tag_system: settings.tagSystem,
          product_tier: settings.productTier,
          module_overrides: settings.moduleOverrides,
          default_cultivation_allocation_basis: settings.defaultCultivationAllocationBasis,
          qb_account_map: settings.qbAccountMap,
          updated_at: new Date().toISOString(),
        }).eq('id', fid);
        if(error) throw error;
        setSaved(true);
        setTimeout(()=>setSaved(false),2500);
      }catch(e){ setErr("Save failed: "+e.message); setTimeout(()=>setErr(""),4000); }
    } else {
      localStorage.setItem("resinops_facility_settings",JSON.stringify(settings));
      setSaved(true);
      setTimeout(()=>setSaved(false),2500);
    }
  }

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading facility settings…</div>);

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
            <button className="fs-btn fs-primary" onClick={save} disabled={!!supabase&&!canAdministerFacility(getCurrentFacilityRole())}>Save settings</button>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
            <div><label className="fs-lbl">Timezone</label><select className="fs-sel" value={settings.timezone} onChange={e=>setF("timezone",e.target.value)}>{TIMEZONES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label className="fs-lbl">Seed-to-sale system</label><select className="fs-sel" value={settings.tagSystem} onChange={e=>setF("tagSystem",e.target.value)}><option>METRC</option><option>BioTrackTHC</option><option>Leaf Data Systems</option><option>MJ Freeway</option><option>Flourish</option><option>COVA</option><option>Other</option></select></div>
            <div><label className="fs-lbl">Fiscal year start month</label><select className="fs-sel" value={settings.fiscalYearStart} onChange={e=>setF("fiscalYearStart",e.target.value)}>{["01","02","03","04","05","06","07","08","09","10","11","12"].map((m,i)=><option key={m} value={m}>{new Date(2024,i,1).toLocaleString("en-US",{month:"long"})}</option>)}</select></div>
            <div><label className="fs-lbl">Default cultivation cost allocation</label><select className="fs-sel" value={settings.defaultCultivationAllocationBasis} onChange={e=>setF("defaultCultivationAllocationBasis",e.target.value)}><option value="batch_weight">By weight</option><option value="time_occupied">By time occupied</option></select></div>
          </div>

          <div className="fs-section">V2 Integrations — API Bridge</div>
          <div style={{background:"rgba(90,63,160,0.06)",border:"1px solid rgba(90,63,160,0.2)",borderRadius:8,padding:"14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:16}}>🔌</span>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>V2 Integration Hub</div>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(90,63,160,0.15)",color:"#9080f0"}}>COMING IN V2</span>
            </div>
            <div style={{fontSize:12,color:"var(--text-3)",marginBottom:10}}>Integration credentials are never collected in the browser or stored in facility records.</div>
            <div style={{padding:"10px 12px",background:"rgba(90,63,160,0.08)",borderRadius:7,fontSize:11,color:"var(--text-2)"}}>
              During private beta, approved integrations are configured by ResinOps administrators as server-only deployment secrets. METRC remains disabled until vendor credentials are available and verified.
            </div>
          </div>
        </div>

        <div className="fs-card">
          <div className="fs-section" style={{marginTop:0}}>QuickBooks Account Mapping</div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
            Account names used by the "Export to QuickBooks" button on the Cost & P&L page (journal-entry CSV import). Type the account names exactly as they appear in your QuickBooks chart of accounts — sub-accounts as "Parent:Sub". Leave any field blank to use the generic default shown as a placeholder.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {QB_ACCOUNT_FIELDS.map(([key,label,placeholder])=>(
              <div key={key}>
                <label className="fs-lbl">{label}</label>
                <input className="fs-inp" value={settings.qbAccountMap[key]||""} placeholder={placeholder}
                  onChange={e=>setF("qbAccountMap",{...settings.qbAccountMap,[key]:e.target.value})} />
              </div>
            ))}
          </div>
        </div>

        <div className="fs-card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div className="fs-section" style={{margin:0}}>Modules</div>
            <button className="fs-btn fs-secondary" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setF("moduleOverrides",{})}>Reset to tier defaults</button>
          </div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
            Choose a product tier, then hide/show individual modules to declutter the sidebar. This only controls visibility — it isn't a paywall, and doesn't affect your data.
          </div>

          <div style={{display:"flex",gap:8,marginBottom:16}}>
            {[["home","🌱 Home"],["commercial","🏭 Commercial"]].map(([v,l])=>(
              <button key={v} onClick={()=>setF("productTier",v)} style={{flex:1,padding:"10px 14px",borderRadius:8,border:"1px solid var(--border-2)",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,background:settings.productTier===v?"var(--accent)":"var(--surface-2)",color:settings.productTier===v?"#fff":"var(--text-2)"}}>{l}</button>
            ))}
          </div>

          {TOGGLEABLE_SECTIONS.map(section=>(
            <div key={section.name} style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{section.name}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {section.mods.map(mod=>{
                  const enabled = isModuleVisible(mod, settings.productTier, settings.moduleOverrides);
                  const isOverridden = Object.prototype.hasOwnProperty.call(settings.moduleOverrides||{}, mod.id);
                  return(
                    <label key={mod.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:"var(--surface-2)",cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                      <input type="checkbox" checked={enabled} onChange={e=>setF("moduleOverrides",{...settings.moduleOverrides,[mod.id]:e.target.checked})} />
                      <span>{mod.icon} {mod.label}</span>
                      {isOverridden&&<span style={{marginLeft:"auto",fontSize:9,color:"var(--accent-2)",fontWeight:600}}>custom</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {supabase && isAdmin && (
          <div className="fs-card">
            <div className="fs-section" style={{margin:0,marginBottom:4}}>Team</div>
            <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
              Invite people to this facility and control which sections of the app their access covers. This is enforced by the database, not just hidden in the sidebar.
            </div>

            {teamErr && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{teamErr}</div>}
            {teamMsg && <div style={{fontSize:12,color:"var(--accent-2)",marginBottom:10}}>{teamMsg}</div>}

            {membersLoading ? (
              <div style={{fontSize:12,color:"var(--text-3)"}}>Loading team…</div>
            ) : (
              members.map(m=>(
                <div key={m.id} className="fs-member-row">
                  <div style={{minWidth:160}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{m.profile?.full_name || m.profile?.email || m.user_id}</div>
                    {m.profile?.full_name && <div style={{fontSize:11,color:"var(--text-3)"}}>{m.profile?.email}</div>}
                  </div>
                  <span className={"fs-pill "+(m.accepted_at?"fs-pill-accepted":"fs-pill-pending")}>{m.accepted_at?"Active":"Pending"}</span>
                  <select className="fs-sel" style={{width:120}} value={m.role} onChange={e=>updateMember(m,{role:e.target.value})}>
                    {ROLE_OPTIONS.concat(m.role==="owner"?["owner"]:[]).map(r=><option key={r} value={r} disabled={r==="owner"}>{r}</option>)}
                  </select>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {PERMISSION_SCOPES.map(([scope,label])=>{
                      const override = m.scope_roles?.[scope];
                      return (
                        <select key={scope} className="fs-sel" style={{width:"auto",fontSize:11,padding:"4px 6px"}}
                          value={override||""}
                          onChange={e=>{
                            const next = {...(m.scope_roles||{})};
                            if(e.target.value) next[scope]=e.target.value; else delete next[scope];
                            updateMember(m,{scope_roles:next});
                          }}
                          title={label}>
                          <option value="">{label}: default ({m.role})</option>
                          {SCOPE_ROLE_OPTIONS.map(r=><option key={r} value={r}>{label}: {r}</option>)}
                        </select>
                      );
                    })}
                  </div>
                  {m.role!=="owner" && (
                    <button className="fs-btn fs-danger" style={{fontSize:11,padding:"5px 10px",marginLeft:"auto"}} onClick={()=>removeMember(m)}>Remove</button>
                  )}
                </div>
              ))
            )}

            <div className="fs-section">Invite someone</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="fs-lbl">Email</label>
                <input className="fs-inp" type="email" value={inviteForm.email} placeholder="teammate@example.com"
                  onChange={e=>setInviteForm(f=>({...f,email:e.target.value}))} />
              </div>
              <div><label className="fs-lbl">Global role</label>
                <select className="fs-sel" value={inviteForm.role} onChange={e=>setInviteForm(f=>({...f,role:e.target.value}))}>
                  {ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <label className="fs-lbl">Per-section overrides (optional — blank uses the global role above)</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {PERMISSION_SCOPES.map(([scope,label])=>(
                  <select key={scope} className="fs-sel" style={{fontSize:12}}
                    value={inviteForm.scopeRoles[scope]||""}
                    onChange={e=>{
                      const next = {...inviteForm.scopeRoles};
                      if(e.target.value) next[scope]=e.target.value; else delete next[scope];
                      setInviteForm(f=>({...f,scopeRoles:next}));
                    }}>
                    <option value="">{label}: default</option>
                    {SCOPE_ROLE_OPTIONS.map(r=><option key={r} value={r}>{label}: {r}</option>)}
                  </select>
                ))}
              </div>
            </div>
            <button className="fs-btn fs-primary" disabled={inviting||!inviteForm.email.trim()} onClick={sendInvite}>
              {inviting?"Sending invite…":"+ Send Invite"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
