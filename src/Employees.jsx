import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { parseDateLocal } from "./lib/dateUtils";
import { supabase, getCurrentFacility, getCurrentFacilityRole } from "./lib/supabase";
import { authenticatedApiFetch, formatApiError } from "./lib/api";
import { canAdministerFacility, FACILITY_ROLES } from "./lib/roles";

const DEPARTMENTS = ["Cultivation","Post-Harvest","Extraction","Processing","Packaging","QC / Lab","Maintenance","Management","Security","Other"];
const ROLES = ["Cultivation Tech","Lead Grower","Master Grower","Trim Tech","Post-Harvest Lead","Extraction Tech","Extraction Lead","Processing Tech","Production Manager","QC Tech","QC Manager","Maintenance Tech","Shift Supervisor","Department Manager","Director of Operations","VP of Processing","CEO / Owner","Other"];
const PEST_CATS = ["Category 1A — Commercial Pesticide Technician","Category 3A — Ornamental & Turf","Category 7A — Industrial, Institutional & Structural","Category 7B — Wood Preserving & Treatment","Category 24 — Private Pesticide Applicator","Category 27 — Nitrogen Stabilizers","Certified Pesticide Applicator (other state)","None / Not Licensed"];
const GMP_CERTS = ["ServSafe / Food Handler","OSHA 10","OSHA 30","GMP Fundamentals","Cannabis GMP","HACCP","Forklift / Scissor Lift","First Aid / CPR","Other"];

function fmtD(dt){return dt?parseDateLocal(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function daysUntil(dt){return dt?Math.round((new Date(dt)-new Date())/86400000):null;}

const CSS=`
  .em-wrap{padding:24px;flex:1;overflow-y:auto;}
  .em-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .em-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .em-inp:focus{outline:none;border-color:var(--accent);}
  .em-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .em-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .em-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .em-btn:hover{opacity:0.85;}
  .em-primary{background:var(--accent);color:#fff;}
  .em-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .em-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .em-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .em-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .em-tabs{display:flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:3px;margin-bottom:14px;}
  .em-tab{flex:1;padding:6px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;}
  .em-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.15);}
  .em-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}
  .em-emp-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:14px;}
  .em-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .s-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .s-inactive{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .em-box{background:var(--surface-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;}
  .em-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .em-warn{color:var(--danger);font-size:10px;font-weight:600;}
  .em-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .em-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .em-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
`;

const EMPTY={name:"",role:"Cultivation Tech",department:"Cultivation",status:"active",hireDate:"",phone:"",email:"",
  pestLicenseNum:"",pestLicenseCategory:"None / Not Licensed",pestLicenseState:"NY",pestLicenseExpiry:"",
  certs:[],trainings:[],notes:"",tier:""};

// Sign-off tier — separate from `role` (a free-text job title like
// "Cultivation Tech") and separate from the app's own permission role
// (owner/admin/manager/member/viewer). This is specifically "who is
// allowed to sign off at which tier of a GMP step approval," which
// needs a controlled vocabulary to be checkable — free-text role can't
// reliably answer "is this person a supervisor?".
const SIGNOFF_TIERS=[
  {v:"",l:"— None —"},
  {v:"worker",l:"Worker"},
  {v:"supervisor",l:"Supervisor"},
  {v:"manager",l:"Manager"},
  {v:"qc_head",l:"Head of QC / Production"},
];

// Global app-permission roles a linked login can hold — matches
// FacilitySettings.jsx's Team card exactly (owner is never assignable here,
// same as there). Kept separate from SIGNOFF_TIERS above (GMP sign-off
// authority) and from `role` (free-text job title) — three different,
// deliberately independent concepts this app tracks per person.
const LOGIN_ROLE_OPTIONS=[FACILITY_ROLES.VIEWER, FACILITY_ROLES.MEMBER, FACILITY_ROLES.MANAGER, FACILITY_ROLES.ADMIN];
const EMPTY_INVITE={email:"",role:FACILITY_ROLES.MEMBER};

export default function Employees(){
  const [employees,setEmployees]=useState([]);
  const [laborTypes,setLaborTypes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [detailId,setDetailId]=useState(null);
  const [formTab,setFormTab]=useState("basic");
  const [err,setErr]=useState("");

  // Login Access tab state
  const isAccountOwner=canAdministerFacility(getCurrentFacilityRole());
  const [members,setMembers]=useState([]);
  const [membersLoading,setMembersLoading]=useState(false);
  const [linkExistingId,setLinkExistingId]=useState("");
  const [inviteForm,setInviteForm]=useState({...EMPTY_INVITE});
  const [linkBusy,setLinkBusy]=useState(false);
  const [linkMsg,setLinkMsg]=useState("");
  const [newCert,setNewCert]=useState({cert:"GMP Fundamentals",issuedBy:"",date:"",expiryDate:""});
  const [newTraining,setNewTraining]=useState({title:"",date:"",trainer:"",notes:""});

  function normalizeEmployee(e){
    return {
      ...e,
      name: e.name||e.full_name||e["Full Name"]||e["Employee Name"]||"",
      role: e.role||e.job_title||e["Job Title"]||"Other",
      department: e.department||e["Department"]||"Other",
      status: ["active","inactive"].includes((e.status||"").toLowerCase()) ? (e.status||"").toLowerCase() : "active",
      hireDate: e.hireDate||e.hire_date||e["Hire Date"]||"",
      phone: e.phone||e["Phone"]||"",
      email: e.email||e["Email"]||"",
      pestLicenseNum: e.pestLicenseNum||e.pest_license_number||e["Pesticide Cert #"]||"",
      pestLicenseCategory: e.pestLicenseCategory||e["Cert Category"]||"None / Not Licensed",
      pestLicenseExpiry: e.pestLicenseExpiry||e.pest_license_expiry||e["Cert Expiry Date"]||"",
      certs: Array.isArray(e.certs) ? e.certs : [],
      trainings: Array.isArray(e.trainings) ? e.trainings : [],
      notes: e.notes||"",
    };
  }

  useEffect(()=>{
    async function load(){
      try{
        const [raw,lt]=await Promise.all([db.employees.list(),db.labor_types.list()]);
        setEmployees(raw.map(normalizeEmployee));
        setLaborTypes(lt);
      }catch(e){ console.error("Employees load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  // Facility login accounts, for the Login Access tab -- only account
  // owners/admins can see or touch this (mirrors FacilitySettings.jsx's
  // Team card gate exactly), and only loaded for them since it's an extra
  // pair of queries nobody else needs.
  async function loadMembers(){
    const fid=getCurrentFacility();
    if(!fid||!supabase||!isAccountOwner) return;
    setMembersLoading(true);
    try{
      const {data:rows,error}=await supabase.from('facility_members')
        .select('id,user_id,role,accepted_at').eq('facility_id',fid).order('created_at');
      if(error) throw error;
      const userIds=[...new Set((rows||[]).map(r=>r.user_id))];
      let profileById={};
      if(userIds.length){
        const {data:profiles,error:profileErr}=await supabase.from('profiles').select('id,email,full_name').in('id',userIds);
        if(profileErr) throw profileErr;
        profileById=Object.fromEntries((profiles||[]).map(p=>[p.id,p]));
      }
      setMembers((rows||[]).map(r=>({...r,profile:profileById[r.user_id]||null})));
    }catch(e){ console.error("Load team members error:",e); }
    setMembersLoading(false);
  }
  useEffect(()=>{ loadMembers(); },[]); // eslint-disable-line react-hooks/exhaustive-deps

  // Role dropdown pulls live from Labor Setup's roster (labor_types.name)
  // so the two stay linked — falls back to the static list only when no
  // labor types have been defined yet (e.g. a brand-new facility).
  const roleOptions=(()=>{
    const names=[...new Set(laborTypes.map(t=>t.name||t.n).filter(Boolean))];
    return names.length?names:ROLES;
  })();

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const detail=employees.find(e=>e.id===detailId);

  async function save(){
    if(!form.name.trim()){setErr("Enter employee name.");return;}
    const emp={...form,id:form.id||crypto.randomUUID()};
    try{
      const saved=await db.employees.upsert(emp);
      const normalized=normalizeEmployee(saved);
      if(form.id) setEmployees(p=>p.map(x=>x.id===normalized.id?normalized:x));
      else setEmployees(p=>[...p,normalized]);
      setForm(null);setFormTab("basic");setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }
  async function remove(id){
    try{ await db.employees.delete(id); setEmployees(p=>p.filter(x=>x.id!==id)); if(detailId===id)setDetailId(null); }
    catch(e){ setErr("Delete failed: "+e.message); }
  }

  // Employees already linked to some login -- used to filter the "link
  // existing" picker down to members not already claimed by someone else's
  // roster row (a member can only ever be linked to one employee here).
  const linkedUserIds=new Set(employees.filter(e=>e.user_id).map(e=>e.user_id));

  async function linkExistingMember(){
    if(!linkExistingId||!form?.id) return;
    setLinkBusy(true); setLinkMsg("");
    try{
      const {error}=await supabase.from('employees').update({user_id:linkExistingId}).eq('id',form.id);
      if(error) throw error;
      setForm(f=>({...f,user_id:linkExistingId}));
      setEmployees(p=>p.map(x=>x.id===form.id?{...x,user_id:linkExistingId}:x));
      setLinkExistingId("");
      setLinkMsg("Linked.");
    }catch(e){ setLinkMsg("Link failed: "+e.message); }
    setLinkBusy(false);
  }

  async function unlinkMember(){
    if(!form?.id) return;
    if(!window.confirm("Unlink this employee from their login? They'll keep their account, just won't be tied to this roster row (or able to approve trim entries as this employee) anymore.")) return;
    setLinkBusy(true); setLinkMsg("");
    try{
      const {error}=await supabase.from('employees').update({user_id:null}).eq('id',form.id);
      if(error) throw error;
      setForm(f=>({...f,user_id:null}));
      setEmployees(p=>p.map(x=>x.id===form.id?{...x,user_id:null}:x));
      setLinkMsg("Unlinked.");
    }catch(e){ setLinkMsg("Unlink failed: "+e.message); }
    setLinkBusy(false);
  }

  async function inviteForEmployee(){
    if(!inviteForm.email.trim()||!form?.id) return;
    setLinkBusy(true); setLinkMsg("");
    try{
      const res=await authenticatedApiFetch('/api/invite',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:inviteForm.email.trim(),role:inviteForm.role,scopeRoles:{},employeeId:form.id}),
      },{includeFacility:true});
      const json=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(json.error||`Invite failed (${res.status})`);
      if(json.data?.employeeLinkFailed){
        setLinkMsg(`Invited ${inviteForm.email.trim()}, but linking it to this employee failed automatically — use "Link an existing team member" below once they show up in that list.`);
      }else{
        setLinkMsg(`Invited ${inviteForm.email.trim()} and linked.`);
      }
      setInviteForm({...EMPTY_INVITE});
      await loadMembers();
      // The employees row itself was updated server-side; re-read it so the
      // form/list reflect the new link without a full page reload.
      const fresh=await db.employees.list();
      setEmployees(fresh.map(normalizeEmployee));
      const updated=fresh.map(normalizeEmployee).find(x=>x.id===form.id);
      if(updated) setForm(f=>({...f,user_id:updated.user_id}));
    }catch(e){ setLinkMsg(formatApiError?formatApiError(e):e.message); }
    setLinkBusy(false);
  }

  async function changeMemberRole(member,role){
    try{
      const {error}=await supabase.from('facility_members').update({role}).eq('id',member.id);
      if(error) throw error;
      setMembers(p=>p.map(m=>m.id===member.id?{...m,role}:m));
    }catch(e){ setLinkMsg("Role update failed: "+e.message); }
  }
  function addCert(){if(!newCert.cert)return;setForm(f=>({...f,certs:[...(f.certs||[]),{...newCert,id:"c"+Date.now()}]}));setNewCert({cert:"GMP Fundamentals",issuedBy:"",date:"",expiryDate:""});}
  function removeCert(id){setForm(f=>({...f,certs:f.certs.filter(c=>c.id!==id)}));}
  function addTraining(){if(!newTraining.title)return;setForm(f=>({...f,trainings:[...(f.trainings||[]),{...newTraining,id:"t"+Date.now()}]}));setNewTraining({title:"",date:"",trainer:"",notes:""});}
  function removeTraining(id){setForm(f=>({...f,trainings:f.trainings.filter(t=>t.id!==id)}));}

  const expiringSoon=employees.filter(e=>{
    const d=daysUntil(e.pestLicenseExpiry);
    return d!==null&&d<=60&&d>=0&&e.pestLicenseCategory!=="None / Not Licensed";
  });

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading employees…</div>);

  return(
    <>
      <style>{CSS}</style>
      <div className="em-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Employee Roster</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Staff profiles, pesticide licenses, GMP certifications, and training records</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {detailId&&<button className="em-btn em-secondary" onClick={()=>setDetailId(null)}>← All staff</button>}
            {!form&&!detailId&&<button className="em-btn em-primary" onClick={()=>setForm({...EMPTY})}>+ Add employee</button>}
          </div>
        </div>

        {expiringSoon.length>0&&(
          <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--danger)",marginBottom:4}}>⚠ Pesticide licenses expiring soon</div>
            {expiringSoon.map(e=><div key={e.id} style={{fontSize:11,color:"var(--text-2)"}}>{e.name} — {e.pestLicenseCategory} expires {fmtD(e.pestLicenseExpiry)} ({daysUntil(e.pestLicenseExpiry)} days)</div>)}
          </div>
        )}

        {form&&(
          <div className="em-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit Employee":"New Employee"}</div>
            <div className="em-tabs">
              {[["basic","👤 Basic Info"],["pest","🌿 Pest. License"],["certs","🏅 GMP Certs"],["training","📋 Training"],...(isAccountOwner?[["login","🔑 Login Access"]]:[])].map(([v,l])=>(
                <button key={v} className={"em-tab"+(formTab===v?" active":"")} onClick={()=>setFormTab(v)}>{l}</button>
              ))}
            </div>

            {formTab==="basic"&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="em-lbl">Full name</label><input className="em-inp" value={form.name} onChange={e=>setF("name",e.target.value)} /></div>
                  <div><label className="em-lbl">Role</label><select className="em-sel" value={form.role} onChange={e=>setF("role",e.target.value)}>{!roleOptions.includes(form.role)&&form.role&&<option key={form.role}>{form.role}</option>}{roleOptions.map(r=><option key={r}>{r}</option>)}</select></div>
                  <div><label className="em-lbl">Department</label><select className="em-sel" value={form.department} onChange={e=>setF("department",e.target.value)}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:10}}>
                  <div>
                    <label className="em-lbl">Sign-off tier</label>
                    <select className="em-sel" value={form.tier||""} onChange={e=>setF("tier",e.target.value)}>{SIGNOFF_TIERS.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}</select>
                    <div style={{fontSize:11,color:"var(--text-3)",marginTop:3}}>Which level of GMP step sign-off this person can perform — separate from their job title above and from their app login permissions.</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="em-lbl">Status</label><select className="em-sel" value={form.status} onChange={e=>setF("status",e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="leave">On Leave</option></select></div>
                  <div><label className="em-lbl">Hire date</label><input type="date" className="em-inp" value={form.hireDate} onChange={e=>setF("hireDate",e.target.value)} /></div>
                  <div><label className="em-lbl">Phone</label><input className="em-inp" value={form.phone} onChange={e=>setF("phone",e.target.value)} /></div>
                  <div><label className="em-lbl">Email</label><input className="em-inp" value={form.email} onChange={e=>setF("email",e.target.value)} /></div>
                </div>
                <div><label className="em-lbl">Notes</label><input className="em-inp" value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
              </>
            )}

            {formTab==="pest"&&(
              <div className="em-box">
                <div className="em-box-t">Pesticide Applicator License</div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="em-lbl">License category</label><select className="em-sel" value={form.pestLicenseCategory} onChange={e=>setF("pestLicenseCategory",e.target.value)}>{PEST_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                  <div><label className="em-lbl">Issuing state</label><input className="em-inp" value={form.pestLicenseState} onChange={e=>setF("pestLicenseState",e.target.value)} placeholder="NY" /></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><label className="em-lbl">License number</label><input className="em-inp" value={form.pestLicenseNum} onChange={e=>setF("pestLicenseNum",e.target.value)} placeholder="e.g. 24-12345" /></div>
                  <div><label className="em-lbl">Expiration date</label><input type="date" className="em-inp" value={form.pestLicenseExpiry} onChange={e=>setF("pestLicenseExpiry",e.target.value)} /></div>
                </div>
                {form.pestLicenseExpiry&&daysUntil(form.pestLicenseExpiry)<=30&&<div className="em-warn" style={{marginTop:8}}>⚠ Expires in {daysUntil(form.pestLicenseExpiry)} days</div>}
              </div>
            )}

            {formTab==="certs"&&(
              <>
                {(form.certs||[]).length>0&&(
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:12}}>
                    <table className="em-tbl">
                      <thead><tr><th>Certification</th><th>Issued By</th><th>Date</th><th>Expires</th><th></th></tr></thead>
                      <tbody>{form.certs.map(c=>(
                        <tr key={c.id}><td>{c.cert}</td><td>{c.issuedBy||"—"}</td><td>{fmtD(c.date)}</td>
                          <td style={{color:c.expiryDate&&daysUntil(c.expiryDate)<=30?"var(--danger)":""}}>{c.expiryDate?fmtD(c.expiryDate):"No expiry"}</td>
                          <td><button className="em-sm em-del" onClick={()=>removeCert(c.id)}>✕</button></td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <div className="em-box">
                  <div className="em-box-t">Add certification</div>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:8,alignItems:"flex-end"}}>
                    <div><label className="em-lbl">Certification</label><select className="em-sel" value={newCert.cert} onChange={e=>setNewCert(n=>({...n,cert:e.target.value}))}>{GMP_CERTS.map(c=><option key={c}>{c}</option>)}</select></div>
                    <div><label className="em-lbl">Issued by</label><input className="em-inp" value={newCert.issuedBy} onChange={e=>setNewCert(n=>({...n,issuedBy:e.target.value}))} /></div>
                    <div><label className="em-lbl">Date</label><input type="date" className="em-inp" value={newCert.date} onChange={e=>setNewCert(n=>({...n,date:e.target.value}))} /></div>
                    <div><label className="em-lbl">Expires</label><input type="date" className="em-inp" value={newCert.expiryDate} onChange={e=>setNewCert(n=>({...n,expiryDate:e.target.value}))} /></div>
                    <button className="em-btn em-primary" style={{padding:"7px 12px"}} onClick={addCert}>Add</button>
                  </div>
                </div>
              </>
            )}

            {formTab==="training"&&(
              <>
                {(form.trainings||[]).length>0&&(
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:12}}>
                    <table className="em-tbl">
                      <thead><tr><th>Training</th><th>Date</th><th>Trainer / Provider</th><th>Notes</th><th></th></tr></thead>
                      <tbody>{form.trainings.map(t=>(
                        <tr key={t.id}><td style={{fontWeight:500}}>{t.title}</td><td>{fmtD(t.date)}</td><td>{t.trainer||"—"}</td>
                          <td style={{fontSize:11,color:"var(--text-3)"}}>{t.notes||"—"}</td>
                          <td><button className="em-sm em-del" onClick={()=>removeTraining(t.id)}>✕</button></td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <div className="em-box">
                  <div className="em-box-t">Add training record</div>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 2fr auto",gap:8,alignItems:"flex-end"}}>
                    <div><label className="em-lbl">Training title</label><input className="em-inp" value={newTraining.title} onChange={e=>setNewTraining(n=>({...n,title:e.target.value}))} placeholder="GMP Awareness, SOP Review…" /></div>
                    <div><label className="em-lbl">Date</label><input type="date" className="em-inp" value={newTraining.date} onChange={e=>setNewTraining(n=>({...n,date:e.target.value}))} /></div>
                    <div><label className="em-lbl">Trainer / provider</label><input className="em-inp" value={newTraining.trainer} onChange={e=>setNewTraining(n=>({...n,trainer:e.target.value}))} /></div>
                    <div><label className="em-lbl">Notes</label><input className="em-inp" value={newTraining.notes} onChange={e=>setNewTraining(n=>({...n,notes:e.target.value}))} /></div>
                    <button className="em-btn em-primary" style={{padding:"7px 12px"}} onClick={addTraining}>Add</button>
                  </div>
                </div>
              </>
            )}

            {formTab==="login"&&isAccountOwner&&(
              !form.id?(
                <div style={{fontSize:12,color:"var(--text-3)",padding:"12px 0"}}>Save this employee first — a login can only be linked or invited once the roster row exists.</div>
              ):(()=>{
                const linkedMember=form.user_id?members.find(m=>m.user_id===form.user_id):null;
                const linkable=members.filter(m=>!linkedUserIds.has(m.user_id));
                return(
                  <>
                    <div style={{fontSize:11,color:"var(--text-3)",marginBottom:12}}>
                      Ties this roster row to a real ResinOps login, so approvals (like Trim Log sign-offs) can be checked against who's actually signed in — not just a name picked from a dropdown. Only an account owner/admin can change this link.
                    </div>
                    {form.user_id?(
                      <div className="em-box">
                        <div className="em-box-t">Linked account</div>
                        {membersLoading?(
                          <div style={{fontSize:12,color:"var(--text-3)"}}>Loading…</div>
                        ):linkedMember?(
                          <>
                            <div style={{fontSize:13,color:"var(--text)",marginBottom:8}}>
                              {linkedMember.profile?.email||linkedMember.profile?.full_name||"(unknown email)"}
                              {!linkedMember.accepted_at&&<span style={{marginLeft:8,fontSize:10,color:"var(--text-3)"}}>(invite pending)</span>}
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"flex-end"}}>
                              <div>
                                <label className="em-lbl">Access role</label>
                                <select className="em-sel" value={linkedMember.role} onChange={e=>changeMemberRole(linkedMember,e.target.value)}>
                                  {LOGIN_ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
                                </select>
                              </div>
                              <button className="em-btn em-secondary" disabled={linkBusy} onClick={unlinkMember}>Unlink</button>
                            </div>
                          </>
                        ):(
                          <div style={{fontSize:12,color:"var(--text-3)"}}>
                            Linked to a login not visible in the current Team list.
                            <button className="em-btn em-secondary" style={{marginLeft:8}} disabled={linkBusy} onClick={unlinkMember}>Unlink</button>
                          </div>
                        )}
                      </div>
                    ):(
                      <>
                        <div className="em-box">
                          <div className="em-box-t">Link an existing team member</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,alignItems:"flex-end"}}>
                            <div>
                              <label className="em-lbl">Team member</label>
                              <select className="em-sel" value={linkExistingId} onChange={e=>setLinkExistingId(e.target.value)}>
                                <option value="">— Select —</option>
                                {linkable.map(m=><option key={m.id} value={m.user_id}>{m.profile?.email||m.profile?.full_name||m.user_id}{!m.accepted_at?" (pending)":""}</option>)}
                              </select>
                            </div>
                            <button className="em-btn em-primary" disabled={!linkExistingId||linkBusy} onClick={linkExistingMember}>Link</button>
                          </div>
                          {linkable.length===0&&!membersLoading&&<div style={{fontSize:11,color:"var(--text-3)",marginTop:6}}>No unlinked team members available.</div>}
                        </div>
                        <div className="em-box">
                          <div className="em-box-t">Invite a new login for this person</div>
                          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr auto",gap:8,alignItems:"flex-end"}}>
                            <div><label className="em-lbl">Email</label><input className="em-inp" value={inviteForm.email} onChange={e=>setInviteForm(f=>({...f,email:e.target.value}))} placeholder="name@example.com" /></div>
                            <div>
                              <label className="em-lbl">Access role</label>
                              <select className="em-sel" value={inviteForm.role} onChange={e=>setInviteForm(f=>({...f,role:e.target.value}))}>
                                {LOGIN_ROLE_OPTIONS.map(r=><option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <button className="em-btn em-primary" disabled={!inviteForm.email.trim()||linkBusy} onClick={inviteForEmployee}>Send invite</button>
                          </div>
                        </div>
                      </>
                    )}
                    {linkMsg&&<div style={{fontSize:12,color:"var(--text-2)",marginTop:4}}>{linkMsg}</div>}
                  </>
                );
              })()
            )}

            {err&&<div style={{fontSize:12,color:"var(--danger)",margin:"8px 0"}}>{err}</div>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="em-btn em-primary" onClick={save}>{form.id?"Save changes":"Add employee"}</button>
              <button className="em-btn em-secondary" onClick={()=>{setForm(null);setErr("");setFormTab("basic");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&!detailId&&(
          employees.length===0?(
            <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:10}}>👥</div>
              <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No employees yet</div>
              <div style={{fontSize:12,color:"var(--text-3)"}}>Add staff here — they appear in shift logs, batch records, and spray log sign-offs</div>
            </div>
          ):(()=>{
            function empCard(e){
              const pestExp=e.pestLicenseExpiry?daysUntil(e.pestLicenseExpiry):null;
              return(
                <div key={e.id} className="em-emp-card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div>
                      <div style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{e.name}</div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>{e.role} · {e.department}{e.tier?" · "+(SIGNOFF_TIERS.find(t=>t.v===e.tier)?.l||e.tier):""}</div>
                    </div>
                    <span className={"em-pill s-"+e.status}>{e.status}</span>
                  </div>
                  {e.pestLicenseCategory!=="None / Not Licensed"&&(
                    <div style={{fontSize:10,color:pestExp!==null&&pestExp<=30?"var(--danger)":"var(--text-3)",marginBottom:4}}>
                      🌿 {e.pestLicenseCategory.split("—")[0].trim()} #{e.pestLicenseNum||"—"}
                      {e.pestLicenseExpiry&&` · Exp ${fmtD(e.pestLicenseExpiry)}`}
                      {pestExp!==null&&pestExp<=30&&` ⚠`}
                    </div>
                  )}
                  {(e.certs||[]).length>0&&<div style={{fontSize:10,color:"var(--text-3)",marginBottom:4}}>🏅 {e.certs.length} cert{e.certs.length!==1?"s":""}</div>}
                  {(e.trainings||[]).length>0&&<div style={{fontSize:10,color:"var(--text-3)",marginBottom:6}}>📋 {e.trainings.length} training record{e.trainings.length!==1?"s":""}</div>}
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    <button className="em-sm em-edit" onClick={()=>setForm({...e})}>Edit</button>
                    <button className="em-sm em-del" onClick={()=>remove(e.id)}>✕</button>
                  </div>
                </div>
              );
            }
            const active=employees.filter(e=>e.status!=="inactive");
            const inactive=employees.filter(e=>e.status==="inactive");
            // Employees whose department doesn't match any known DEPARTMENTS
            // entry (e.g. imported free text) still need a home — fold them
            // into "Other" rather than silently dropping them from the view.
            const unrecognized=active.filter(e=>!DEPARTMENTS.includes(e.department));
            return(
              <>
                {DEPARTMENTS.map(dept=>{
                  const deptEmps=active.filter(e=>e.department===dept).concat(dept==="Other"?unrecognized:[]);
                  if(!deptEmps.length) return null;
                  return(
                    <div key={dept} style={{marginBottom:18}}>
                      <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{dept} <span style={{fontWeight:500,color:"var(--text-3)",textTransform:"none",letterSpacing:"normal"}}>({deptEmps.length})</span></div>
                      <div className="em-grid">{deptEmps.map(empCard)}</div>
                    </div>
                  );
                })}
                {inactive.length>0&&(
                  <div style={{marginBottom:18}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>Inactive <span style={{fontWeight:500,color:"var(--text-3)",textTransform:"none",letterSpacing:"normal"}}>({inactive.length})</span></div>
                    <div className="em-grid">{inactive.map(empCard)}</div>
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    </>
  );
}
