import { useState, useEffect } from "react";
import { db } from "./lib/db";

const DEPARTMENTS = ["Cultivation","Post-Harvest","Extraction","Processing","Packaging","QC / Lab","Maintenance","Management","Security","Other"];
const ROLES = ["Cultivation Tech","Lead Grower","Master Grower","Trim Tech","Post-Harvest Lead","Extraction Tech","Extraction Lead","Processing Tech","Production Manager","QC Tech","QC Manager","Maintenance Tech","Shift Supervisor","Department Manager","Director of Operations","VP of Processing","CEO / Owner","Other"];
const PEST_CATS = ["Category 1A — Commercial Pesticide Technician","Category 3A — Ornamental & Turf","Category 7A — Industrial, Institutional & Structural","Category 7B — Wood Preserving & Treatment","Category 24 — Private Pesticide Applicator","Category 27 — Nitrogen Stabilizers","Certified Pesticide Applicator (other state)","None / Not Licensed"];
const GMP_CERTS = ["ServSafe / Food Handler","OSHA 10","OSHA 30","GMP Fundamentals","Cannabis GMP","HACCP","Forklift / Scissor Lift","First Aid / CPR","Other"];

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
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
  certs:[],trainings:[],notes:""};

export default function Employees(){
  const [employees,setEmployees]=useState([]);
  const [laborTypes,setLaborTypes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [detailId,setDetailId]=useState(null);
  const [formTab,setFormTab]=useState("basic");
  const [err,setErr]=useState("");
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
              {[["basic","👤 Basic Info"],["pest","🌿 Pest. License"],["certs","🏅 GMP Certs"],["training","📋 Training"]].map(([v,l])=>(
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
                      <div style={{fontSize:11,color:"var(--text-3)"}}>{e.role} · {e.department}</div>
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
