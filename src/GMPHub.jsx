import { useState, useEffect } from "react";
import { db, auth } from "./lib/db";
import { supabase, getCurrentFacility } from "./lib/supabase";
import { parseDateLocal, todayLocalISO } from "./lib/dateUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import SignToConfirmModal from "./SignToConfirmModal.jsx";

function fmtD(dt){return dt?parseDateLocal(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function fmtDT(dt){return dt?parseDateLocal(dt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"—";}

// DI-6 mitigation: the unsigned "Print Batch Record" export below is a
// plain point-in-time snapshot with no sign-and-lock behind it (unlike
// buildBatchRecordPdf, which only ever runs inside the Sign & Release
// flow). A record edited after its original entry would otherwise show
// up in this export with no indication it isn't what was true when the
// work was originally performed. 120s tolerance absorbs the same-request
// created_at/updated_at skew a fresh insert can have, so a never-edited
// row doesn't get flagged just from clock jitter.
function wasEditedAfterEntry(rec){
  const created=rec?.created_at||rec?.createdAt;
  const updated=rec?.updated_at||rec?.updatedAt;
  if(!created||!updated) return false;
  return (new Date(updated).getTime()-new Date(created).getTime())>120000;
}
const DEPT=["Cultivation","Post-Harvest","Extraction","Processing","Packaging","QC / Lab","Maintenance","All"];
const DEV_TYPES=["Process Deviation","Equipment Failure","Contamination / Environmental","Documentation Error","Personnel / Training","Material / Input Issue","Other"];
const DEV_SEVERITIES=["minor","major","critical"];

// Tiered step sign-offs — worker/supervisor/manager/qc_head, matching
// Employees.jsx's SIGNOFF_TIERS. Which tiers a given step needs is
// facility-configurable (facilities.step_signoff_requirements, a
// {stepName: tier[]} map edited in Facility Settings); these keyword
// defaults only apply when a step has no explicit facility config, so
// a fresh facility isn't stuck with zero requirements everywhere.
const TIER_ORDER=["worker","supervisor","manager","qc_head"];
const TIER_LABELS={worker:"Worker",supervisor:"Supervisor",manager:"Manager",qc_head:"QC/Production Head"};
function getRequiredTiers(stepName,facility){
  const configured=facility?.step_signoff_requirements?.[stepName];
  if(Array.isArray(configured)) return configured.filter(t=>TIER_ORDER.includes(t));
  const l=(stepName||"").toLowerCase();
  if(l.includes("qc")||l.includes("test")||l.includes("packag")||l.includes("releas")) return ["worker","supervisor","qc_head"];
  if(l.includes("extraction")||l.includes("purge")||l.includes("dewax")||l.includes("crystall")||l.includes("distill")) return ["worker","supervisor"];
  return ["worker"];
}

// Inline "sign off as [tier]" control, used both in the outstanding-
// sign-offs dashboard and the batch record. Resolves the signer from the
// caller's OWN linked employee record (Employees → Login Access) rather
// than a free picker of every employee at that tier — the database now
// enforces this identity match too (enforce_gmp_signoff_identity), so a
// picker that could select someone else would just fail on submit.
// Module-level (not a nested function) so it doesn't remount and lose
// state on every parent render.
function TierSignoffPicker({tier,employees,currentUserId,onSign,buttonLabel="Sign"}){
  const pool=employees.filter(e=>e.tier===tier);
  const myEmployee=pool.find(e=>e.user_id&&e.user_id===currentUserId);
  if(!pool.length) return (
    <div style={{fontSize:11,color:"var(--amber)",background:"rgba(200,150,58,0.1)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:6,padding:"4px 8px"}}>
      {TIER_LABELS[tier]} — no employees set to this tier yet
    </div>
  );
  if(!myEmployee) return (
    <div style={{fontSize:11,color:"var(--amber)",background:"rgba(200,150,58,0.1)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:6,padding:"4px 8px"}}>
      Your login isn't linked to a {TIER_LABELS[tier]} employee record — see Employees → Login Access
    </div>
  );
  return (
    <button className="gh-sm gh-edit" onClick={()=>onSign(myEmployee.id)}>{buttonLabel} as {myEmployee.name}</button>
  );
}

const CSS=`
  .gh-wrap{padding:24px;flex:1;overflow-y:auto;}
  .gh-tabs{display:flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:3px;margin-bottom:18px;}
  .gh-tab{flex:1;padding:7px 6px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:11px;font-weight:500;color:var(--text-2);background:none;}
  .gh-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.15);}
  .gh-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .gh-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .gh-inp:focus{outline:none;border-color:var(--accent);}
  .gh-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .gh-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .gh-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .gh-btn:hover{opacity:0.85;}
  .gh-primary{background:var(--accent);color:#fff;}
  .gh-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .gh-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .gh-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .gh-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .gh-box{background:var(--surface-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;}
  .gh-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .gh-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .gh-tbl th{text-align:left;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .gh-tbl td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:top;}
  .gh-tbl tr:last-child td{border-bottom:none;}
  .gh-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .dev-open{background:rgba(200,74,74,0.15);color:var(--danger);}
  .dev-closed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sop-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sop-draft{background:rgba(200,150,58,0.15);color:var(--amber);}
  .sop-retired{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .signoff-row{display:flex;align-items:center;gap:10;background:var(--surface-2);border-radius:6px;padding:8px 10px;margin-bottom:6px;}
  .batch-section{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:12px;}
  .batch-section-t{font-size:11px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;}
`;

const EMPTY_SOP={title:"",version:"1.0",department:"Cultivation",effectiveDate:"",approvedBy:"",status:"draft",linkedStepTypes:"",content:"",lockedAt:null};
// Best-effort "X.Y" -> "X.(Y+1)" bump; falls back to appending ".1" for
// anything that isn't a plain two-part version string. Not a strict
// semver parser -- the user can always edit the suggestion.
function bumpSopVersion(v){
  const m=/^(\d+)\.(\d+)$/.exec((v||"").trim());
  return m?`${m[1]}.${parseInt(m[2],10)+1}`:(v||"1.0")+".1";
}
const EMPTY_DEV={batchType:"harvest",batchId:"",batchName:"",stepName:"",date:todayLocalISO(),type:"Process Deviation",title:"",severity:"minor",description:"",rootCause:"",correctiveAction:"",preventiveAction:"",reportedById:"",closedById:"",status:"open",sopId:"",resolvedAt:null};
const EMPTY_SHIFT={date:todayLocalISO(),department:"Cultivation",supervisorId:"",notes:""};

export default function GMPHub(){
  const [tab,setTab]=useState("shifts");
  const [employees,setEmployees]=useState([]);
  const [harvestBatches,setHarvestBatches]=useState([]);
  const [prodBatches,setProdBatches]=useState([]);

  const [sops,setSops]=useState([]);
  const [deviations,setDeviations]=useState([]);
  const [shifts,setShifts]=useState([]);
  const [signoffs,setSignoffs]=useState([]);
  const [qcTests,setQcTests]=useState([]);
  const [cultInputs,setCultInputs]=useState([]);
  const [facility,setFacility]=useState({});
  const [facilityRooms,setFacilityRooms]=useState([]);
  const [growRooms,setGrowRooms]=useState([]);
  const [loading,setLoading]=useState(true);

  // Who's actually logged in -- tier sign-offs are resolved from this
  // rather than a free employee picker (see TierSignoffPicker), and the
  // database enforces the same match via enforce_gmp_signoff_identity.
  const [currentUserId,setCurrentUserId]=useState(null);
  useEffect(()=>{ auth.getUser().then(u=>setCurrentUserId(u?.id||null)); },[]);

  useEffect(()=>{
    async function load(){
      try{
        const facilityId=getCurrentFacility();
        const [so,dv,sh,sig,qc,ci,emp,hb,pb,facRes,fm,gr]=await Promise.all([
          db.gmp_sops.list(),
          db.gmp_deviations.list(),
          db.gmp_shifts.list(),
          db.gmp_signoffs.list(),
          db.qc_tests.list(),
          db.cultivation_inputs.list(),
          db.employees.list(),
          db.harvest_batches.list(),
          db.production_batches.list(),
          facilityId?supabase.from('facilities').select('*').eq('id',facilityId).single():Promise.resolve({data:null}),
          db.facility_map_spaces.list(),
          db.grow_rooms.list(),
        ]);
        setSops(so);
        setDeviations(dv);
        setShifts(sh);
        setSignoffs(sig);
        setQcTests(qc.map(t=>({...t,batchId:t.batchType==="harvest"?t.harvestBatchId:t.productionBatchId})));
        setCultInputs(ci);
        setFacility(facRes?.data||{});
        setEmployees(emp);
        setHarvestBatches(hb);
        setProdBatches(pb.filter(b=>!b.isLinked));
        setFacilityRooms(fm);
        setGrowRooms(gr);
      }catch(e){ console.error("GMPHub load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const [sopForm,setSopForm]=useState(null);
  const [devForm,setDevForm]=useState(null);
  const [shiftForm,setShiftForm]=useState(null);
  const [soView,setSoView]=useState("outstanding"); // outstanding | history
  const [shiftEntries,setShiftEntries]=useState([]);
  const [batchRecordId,setBatchRecordId]=useState({type:"harvest",id:""});
  const [err,setErr]=useState("");
  const [signingModal,setSigningModal]=useState(null);

  // Reason-for-change prompt — a lightweight, generic overlay (not a
  // whole new component like SignToConfirmModal, which is specifically
  // for the password-reverified e-signature flow) used anywhere
  // reversing a previously-finalized GMP state needs a documented
  // justification: un-signing a tier sign-off, reopening a closed
  // deviation. Written once, immutable, into gmp_change_reasons.
  const [reasonPrompt,setReasonPrompt]=useState(null); // {title, description, onConfirm(reason)}
  const [reasonText,setReasonText]=useState("");
  const [reasonBusy,setReasonBusy]=useState(false);
  function promptForReason(title,description,onConfirm){ setReasonPrompt({title,description,onConfirm}); setReasonText(""); }
  async function confirmReasonPrompt(){
    if(!reasonText.trim()||!reasonPrompt) return;
    setReasonBusy(true);
    try{
      await reasonPrompt.onConfirm(reasonText.trim());
      setReasonPrompt(null); setReasonText("");
    }catch(e){ setErr(e.message); }
    setReasonBusy(false);
  }

  function empName(id){return employees.find(e=>e.id===id)?.name||"—";}

  // ── SOPs ──
  async function saveSop(){
    if(!sopForm.title.trim()){setErr("Enter SOP title.");return;}
    // A signed (locked) SOP must not be silently editable -- the signature
    // would no longer mean anything. Any edit to a locked SOP clones into a
    // brand-new, unsigned row instead of overwriting the signed original.
    const original=sopForm.id?sops.find(x=>x.id===sopForm.id):null;
    if(original?.lockedAt){
      const cloned={...sopForm,id:crypto.randomUUID(),version:bumpSopVersion(sopForm.version),lockedAt:null};
      try{
        const saved=await db.gmp_sops.upsert(cloned);
        setSops(p=>[...p,saved]);
        setSopForm(null);setErr("");
      }catch(e){ setErr("Save failed: "+e.message); }
      return;
    }
    const s={...sopForm,id:sopForm.id||crypto.randomUUID()};
    try{
      const saved=await db.gmp_sops.upsert(s);
      if(sopForm.id) setSops(p=>p.map(x=>x.id===saved.id?saved:x));
      else setSops(p=>[...p,saved]);
      setSopForm(null);setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }

  // ── Sign & Activate an SOP ── locks the version by stamping lockedAt;
  // editing a locked SOP afterward always clones (see saveSop above).
  function buildSopPdf(sop){
    const doc=new jsPDF();
    let y=16;
    doc.setFontSize(15); doc.setFont(undefined,"bold");
    doc.text("Standard Operating Procedure",14,y);
    y+=8;
    doc.setFont(undefined,"bold"); doc.text(sop.title||"Untitled SOP",14,y); doc.setFont(undefined,"normal");
    y+=6;
    doc.setFontSize(10);
    doc.text(`Version ${sop.version||"1.0"} · ${sop.department||""} · Effective ${sop.effectiveDate?fmtD(sop.effectiveDate):"—"}`,14,y);
    y+=8;
    if(sop.linkedStepTypes){ doc.text(`Governs: ${sop.linkedStepTypes}`,14,y); y+=8; }
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(sop.content||"(no content entered)",180),14,y);
    return doc;
  }
  function openSopActivation(){
    if(!sopForm.title.trim()){setErr("Enter SOP title.");return;}
    const original=sopForm.id?sops.find(x=>x.id===sopForm.id):null;
    const isLockedEdit=!!original?.lockedAt;
    const sopId=isLockedEdit?crypto.randomUUID():(sopForm.id||crypto.randomUUID());
    const version=isLockedEdit?bumpSopVersion(sopForm.version):sopForm.version;
    setSigningModal({
      title:"Sign & Activate SOP",
      description:`Signing locks "${sopForm.title}" v${version} as the active procedure. Future edits will create a new version rather than changing this signed record.`,
      documentType:"sop",
      documentId:sopId,
      documentLabel:`${sopForm.title} v${version}`,
      buildPdf:()=>buildSopPdf({...sopForm,version}),
      onSigned:async()=>{
        const lockedAt=new Date().toISOString();
        const s={...sopForm,id:sopId,version,status:"active",lockedAt};
        try{
          const saved=await db.gmp_sops.upsert(s);
          if(isLockedEdit||!sopForm.id) setSops(p=>[...p,saved]);
          else setSops(p=>p.map(x=>x.id===saved.id?saved:x));
          setSopForm(null);setErr("");
        }catch(e){ setErr("Save failed: "+e.message); }
      },
    });
  }

  // ── Deviations ──
  async function saveDev(){
    if(!devForm.description.trim()){setErr("Describe the deviation.");return;}
    const d={...devForm,id:devForm.id||crypto.randomUUID()};
    try{
      const saved=await db.gmp_deviations.upsert(d);
      if(devForm.id) setDeviations(p=>p.map(x=>x.id===saved.id?saved:x));
      else setDeviations(p=>[...p,saved]);
      setDevForm(null);setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }

  // ── Sign & Close a deviation ──
  function buildDeviationPdf(dev){
    const doc=new jsPDF();
    let y=16;
    doc.setFontSize(15); doc.setFont(undefined,"bold");
    doc.text("GMP Deviation Report",14,y);
    y+=8;
    doc.setFont(undefined,"bold"); doc.text(dev.title||dev.type||"Deviation",14,y); doc.setFont(undefined,"normal");
    y+=6;
    doc.setFontSize(10);
    doc.text(`${dev.type||""} · ${(dev.severity||"").toUpperCase()} · ${fmtD(dev.date)}`,14,y);
    y+=8;
    doc.setFontSize(9);
    [["Description",dev.description],["Root Cause",dev.rootCause],["Corrective Action",dev.correctiveAction],["Preventive Action",dev.preventiveAction]].forEach(([label,text])=>{
      doc.setFont(undefined,"bold"); doc.text(label,14,y); doc.setFont(undefined,"normal");
      y+=5;
      const lines=doc.splitTextToSize(text||"—",180);
      doc.text(lines,14,y);
      y+=lines.length*4.5+5;
    });
    return doc;
  }
  function openDeviationClosure(){
    if(!devForm.rootCause?.trim()||!devForm.correctiveAction?.trim()) return;
    const devId=devForm.id||crypto.randomUUID();
    setSigningModal({
      title:"Sign & Close Deviation",
      description:`Signing closes "${devForm.title||devForm.type}" as resolved, with the root cause and corrective action on record.`,
      documentType:"deviation",
      documentId:devId,
      documentLabel:devForm.title||devForm.type||"Deviation",
      buildPdf:()=>buildDeviationPdf(devForm),
      onSigned:async()=>{
        const resolvedAt=new Date().toISOString();
        const d={...devForm,id:devId,status:"closed",resolvedAt};
        try{
          const saved=await db.gmp_deviations.upsert(d);
          if(devForm.id) setDeviations(p=>p.map(x=>x.id===saved.id?saved:x));
          else setDeviations(p=>[...p,saved]);
          setDevForm(null);setErr("");
        }catch(e){ setErr("Save failed: "+e.message); }
      },
    });
  }

  // Reopening is deliberately a status-only update, not a whole-record
  // save: lock_closed_deviation blocks any UPDATE that changes a closed
  // deviation's substantive fields in the SAME statement that reopens
  // it, so this can never accidentally slip a content edit through
  // alongside the reopen. Editing content is a separate step afterward,
  // its own ordinary save, its own audit_logs entry.
  async function reopenDeviation(dev,reason){
    try{
      await db.gmp_change_reasons.upsert({
        id:crypto.randomUUID(), facilityId:getCurrentFacility(),
        tableName:"gmp_deviations", recordId:dev.id, action:"reopen_deviation", reason,
      });
      const saved=await db.gmp_deviations.update(dev.id,{status:"open"});
      setDeviations(p=>p.map(x=>x.id===saved.id?saved:x));
      if(devForm?.id===dev.id) setDevForm(f=>({...f,status:"open"}));
    }catch(e){ setErr("Could not reopen: "+e.message); }
  }

  // ── Shifts ──
  async function saveShift(){
    const validEntries=shiftEntries.filter(e=>e.employeeId&&(e.timeIn||e.timeOut));
    const s={...shiftForm,id:shiftForm.id||crypto.randomUUID(),entries:validEntries};
    try{
      const saved=await db.gmp_shifts.upsert(s);
      if(shiftForm.id) setShifts(p=>p.map(x=>x.id===saved.id?saved:x));
      else setShifts(p=>[...p,saved]);
      setShiftForm(null);setShiftEntries([]);setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }
  function addShiftEntry(){setShiftEntries(p=>[...p,{id:"se"+Date.now(),employeeId:"",timeIn:"",timeOut:"",batchType:"harvest",batchId:"",hoursWorked:"",taskNotes:""}]);}
  function setEntry(i,k,v){setShiftEntries(p=>p.map((e,idx)=>idx===i?{...e,[k]:v}:e));}
  function calcHours(tin,tout){if(!tin||!tout)return "";const d=(new Date("1970-01-01T"+tout)-new Date("1970-01-01T"+tin))/3600000;return d>0?d.toFixed(2):"";}

  // ── Sign-offs ── one gmp_signoffs row per batch+step (see the unique
  // index added in 20260803090000), with up to 4 tier id/timestamp pairs
  // on it rather than one row per approval.
  function findSignoff(type,batchId,stepName){
    return signoffs.find(s=>s.batchType===type&&String(s.batchId)===String(batchId)&&s.stepName===stepName);
  }
  async function signOffTier(type,batchId,stepName,tier,employeeId){
    if(!employeeId) return;
    const existing=findSignoff(type,batchId,stepName);
    const patch={[tier+"Id"]:employeeId,[tier+"At"]:new Date().toISOString()};
    try{
      // A tier signing onto a row that already exists is a real UPDATE,
      // not an upsert — see the migration comment on
      // enforce_gmp_signoff_identity for why upsert()'s INSERT-path
      // firing would otherwise re-validate an earlier tier's already-
      // legitimate sign-off against whoever's signing now.
      const saved=existing
        ? await db.gmp_signoffs.update(existing.id,patch)
        : await db.gmp_signoffs.upsert({id:crypto.randomUUID(),batchType:type,batchId,stepName,notes:"",...patch});
      setSignoffs(p=>existing?p.map(x=>x.id===saved.id?saved:x):[...p,saved]);
      setErr("");
    }catch(e){ setErr("Sign-off failed: "+e.message); }
  }
  async function unsignTier(type,batchId,stepName,tier,reason){
    const existing=findSignoff(type,batchId,stepName);
    if(!existing) return;
    try{
      // Written before the actual undo, not after — if the reason
      // insert fails (e.g. a blank reason RLS would reject), the
      // sign-off itself is never touched.
      await db.gmp_change_reasons.upsert({
        id:crypto.randomUUID(), facilityId:getCurrentFacility(),
        tableName:"gmp_signoffs", recordId:existing.id, action:`unsign_${tier}`, reason,
      });
      const saved=await db.gmp_signoffs.update(existing.id,{[tier+"Id"]:null,[tier+"At"]:null});
      setSignoffs(p=>p.map(x=>x.id===saved.id?saved:x));
    }catch(e){ setErr("Could not undo: "+e.message); }
  }

  // ── Signed Batch Record PDF ── built for the QC Head "Sign & Release"
  // flow. Sources the sign-off table from TIER_ORDER/TIER_LABELS reading
  // so[tier+"Id"]/so[tier+"At"] -- unlike the older "🖨 Print Batch
  // Record" HTML export below, which reads a legacy performed_by_id/
  // verified_by_id/timestamp triad that signOffTier() never writes.
  function buildBatchRecordPdf(batch,type,batchSignoffs,batchDevs,batchQcTests,batchShiftEntries,batchCultInputs){
    const doc=new jsPDF();
    let y=16;

    doc.setFontSize(15); doc.setFont(undefined,"bold");
    doc.text("GMP Batch Record",14,y);
    doc.setFontSize(10); doc.setFont(undefined,"normal");
    y+=7;
    doc.text(type==="harvest"?(batch.strainName||"Unknown strain"):(batch.name||"Unnamed batch"),14,y);
    y+=6;
    doc.setFontSize(9); doc.setTextColor(90);
    doc.text(`${facility.facility_name||""} ${facility.license_number?"— "+facility.license_number:""} · Batch ID ${batch.id} · Generated ${todayLocalISO()}`,14,y);
    doc.setTextColor(0);
    y+=10;

    autoTable(doc,{
      startY:y,
      head:[["Step","Tier","Signed By","Signed At"]],
      body:batchSignoffs.flatMap(so=>TIER_ORDER.filter(t=>so[t+"Id"]).map(t=>[so.stepName||"",TIER_LABELS[t],empName(so[t+"Id"]),fmtDT(so[t+"At"])])),
      theme:"striped",
      headStyles:{fillColor:[74,124,89]},
    });
    y=(batchSignoffs.some(so=>TIER_ORDER.some(t=>so[t+"Id"]))?doc.lastAutoTable.finalY:y)+4;
    if(!batchSignoffs.some(so=>TIER_ORDER.some(t=>so[t+"Id"]))){ doc.setFontSize(9); doc.text("No sign-offs recorded for this batch.",14,y); y+=8; }

    if(batchQcTests.length){
      autoTable(doc,{
        startY:y+4,
        head:[["Lab","Sample ID","THCa %","Total Terps %","Result"]],
        body:batchQcTests.map(t=>[t.labName||"",t.sampleId||"",t.thca||"—",t.totalTerpenes||"—",t.overallPass===true?"PASS":t.overallPass===false?"FAIL":"Pending"]),
        theme:"striped",
        headStyles:{fillColor:[74,124,89]},
      });
      y=doc.lastAutoTable.finalY+4;
    }

    if(batchDevs.length){
      autoTable(doc,{
        startY:y+4,
        head:[["Type","Severity","Title","Status","Corrective Action"]],
        body:batchDevs.map(d=>[d.type||"",d.severity||"",d.title||"",d.status||"",d.correctiveAction||"—"]),
        theme:"striped",
        headStyles:{fillColor:[180,74,74]},
      });
      y=doc.lastAutoTable.finalY+4;
    }

    if(batchShiftEntries.length){
      autoTable(doc,{
        startY:y+4,
        head:[["Date","Employee","Time In","Time Out","Hours","Task"]],
        body:batchShiftEntries.map(e=>[fmtD(e.shiftDate),empName(e.employeeId),e.timeIn||"—",e.timeOut||"—",e.hoursWorked||"—",e.taskNotes||"—"]),
        theme:"striped",
        headStyles:{fillColor:[74,124,89]},
      });
      y=doc.lastAutoTable.finalY+4;
    }

    if(batchCultInputs.length){
      autoTable(doc,{
        startY:y+4,
        head:[["Date","Type","Product","Rate","Applicator"]],
        body:batchCultInputs.map(ci=>[fmtD(ci.date),ci.type||"",ci.product||ci.species||"",`${ci.rate||""} ${ci.rateUnit||""}`,ci.applicatorName||"In-house"]),
        theme:"striped",
        headStyles:{fillColor:[74,124,89]},
      });
    }

    return doc;
  }

  // ── Batch Record ──
  function BatchRecord(){
    const {type,id}=batchRecordId;
    if(!id) return <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>Select a batch above to view its GMP record.</div>;
    const batch=type==="harvest"?harvestBatches.find(b=>String(b.id)===id):prodBatches.find(b=>String(b.id)===id);
    if(!batch) return <div style={{color:"var(--text-3)",padding:16}}>Batch not found.</div>;
    const batchSignoffs=signoffs.filter(s=>s.batchType===type&&String(s.batchId)===id);
    const batchDevs=deviations.filter(d=>d.batchType===type&&String(d.batchId)===id);
    const batchQcTests=qcTests.filter(t=>t.batchType===type&&String(t.batchId)===id);
    const batchShiftEntries=shifts.flatMap(sh=>(sh.entries||[]).filter(e=>e.batchType===type&&String(e.batchId)===id).map(e=>({...e,shiftDate:sh.date,department:sh.department})));
    const batchCultInputs=type==="harvest"&&batch.spaceName
      ?cultInputs.filter(ci=>ci.spaceName===batch.spaceName)
      :[];
    return(
      <div>
        <div style={{background:"var(--surface-2)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:700,color:"var(--text)",marginBottom:4}}>{type==="harvest"?batch.strainName:batch.name}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,auto)",gap:16,width:"fit-content"}}>
            {[["Type",type==="harvest"?"Harvest Batch":"Production Batch"],["Date",fmtD(batch.d)],["Space",batch.spaceName||"—"],["Status",batch.status||"—"]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div><div style={{fontSize:12,color:"var(--text)",fontWeight:500}}>{v}</div></div>
            ))}
          </div>
        </div>

        {Array.isArray(batch.steps)&&batch.steps.length>0&&(()=>{
          const missingSteps=batch.steps.filter(step=>{
            const so=batchSignoffs.find(s=>s.stepName===step.n);
            const required=getRequiredTiers(step.n,facility);
            return !required.every(t=>so?.[t+"Id"]);
          });
          return(
          <div className="batch-section">
            <div className="batch-section-t">✅ Step Sign-Offs</div>
            {facility.signoff_enforcement==="hard_block"&&missingSteps.length>0&&(
              <div style={{background:"rgba(200,74,74,0.1)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"var(--danger)",fontWeight:500}}>
                ⚠ {missingSteps.length} step{missingSteps.length>1?"s":""} missing required sign-off{missingSteps.length>1?"s":""}: {missingSteps.map(s=>s.n).join(", ")}
              </div>
            )}
            {batch.steps.map(step=>{
              const so=batchSignoffs.find(s=>s.stepName===step.n);
              const required=getRequiredTiers(step.n,facility);
              const allSigned=required.every(t=>so?.[t+"Id"]);
              return(
                <div key={step.n} style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:8,padding:"8px 12px",marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontWeight:500,color:"var(--text)",fontSize:12}}>{step.n}</span>
                    <span className="gh-pill" style={{background:allSigned?"rgba(74,124,89,0.2)":"rgba(200,150,58,0.15)",color:allSigned?"var(--accent-2)":"var(--amber)"}}>
                      {allSigned?"Fully signed off":`${required.filter(t=>so?.[t+"Id"]).length}/${required.length} signed`}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {required.map(tier=>{
                      const signedId=so?.[tier+"Id"];
                      const signedAt=so?.[tier+"At"];
                      return signedId?(
                        <div key={tier} style={{fontSize:11,background:"var(--surface-2)",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:6}}>
                          <span style={{color:"var(--text-3)"}}>{TIER_LABELS[tier]}:</span>
                          <span style={{color:"var(--text)"}}>{empName(signedId)}</span>
                          <span style={{color:"var(--text-3)"}}>{fmtDT(signedAt)}</span>
                          <button className="gh-sm gh-del" style={{padding:"1px 5px"}} onClick={()=>promptForReason(
                            `Unsign ${TIER_LABELS[tier]}`,
                            `Removing ${empName(signedId)}'s ${TIER_LABELS[tier]} sign-off for "${step.n}". This is recorded permanently with your reason.`,
                            reason=>unsignTier(type,id,step.n,tier,reason)
                          )}>✕</button>
                        </div>
                      ):(
                        <TierSignoffPicker key={tier} tier={tier} employees={employees} currentUserId={currentUserId}
                          buttonLabel={tier==="qc_head"?"Sign & Release":"Sign"}
                          onSign={empId=>{
                            if(tier!=="qc_head"){ signOffTier(type,id,step.n,tier,empId); return; }
                            setSigningModal({
                              title:"Sign & Release Batch",
                              description:`Signing releases "${step.n}" on ${type==="harvest"?batch.strainName:batch.name} as QC Head. This freezes the current batch record as a signed PDF.`,
                              documentType:"batch_record",
                              documentId:String(batch.id),
                              documentLabel:`${type==="harvest"?batch.strainName:batch.name} — ${step.n} QC Head release`,
                              buildPdf:()=>buildBatchRecordPdf(batch,type,batchSignoffs,batchDevs,batchQcTests,batchShiftEntries,batchCultInputs),
                              onSigned:()=>signOffTier(type,id,step.n,"qc_head",empId),
                            });
                          }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}

        {batchShiftEntries.length>0&&(
          <div className="batch-section"><div className="batch-section-t">👥 Labor Entries ({batchShiftEntries.length})</div>
            <table className="gh-tbl"><thead><tr><th>Date</th><th>Employee</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>Task</th></tr></thead>
              <tbody>{batchShiftEntries.map((e,i)=><tr key={i}><td>{fmtD(e.shiftDate)}</td><td>{empName(e.employeeId)}</td><td>{e.timeIn||"—"}</td><td>{e.timeOut||"—"}</td><td>{e.hoursWorked||"—"}</td><td style={{fontSize:11,color:"var(--text-3)"}}>{e.taskNotes||"—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {batchCultInputs.length>0&&(
          <div className="batch-section"><div className="batch-section-t">🌿 Cultivation Inputs ({batchCultInputs.length})</div>
            <table className="gh-tbl"><thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Rate</th><th>Applicator</th></tr></thead>
              <tbody>{batchCultInputs.map(ci=><tr key={ci.id}><td style={{whiteSpace:"nowrap"}}>{fmtD(ci.date)}</td><td style={{fontSize:11}}>{ci.type}</td><td>{ci.product||ci.species}</td><td style={{fontSize:11}}>{ci.rate} {ci.rateUnit}</td><td style={{fontSize:11}}>{ci.applicatorName||"In-house"}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        {batchQcTests.length>0&&(
          <div className="batch-section"><div className="batch-section-t">🔬 QC / Lab Tests ({batchQcTests.length})</div>
            {batchQcTests.map(t=>(
              <div key={t.id} style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,marginBottom:6}}>
                <span style={{fontWeight:500}}>{t.labName}</span>
                <span>{t.sampleId}</span>
                <span style={{color:"var(--accent-2)"}}>{t.thca&&t.thca+"%  THCa"}</span>
                <span>{t.totalTerpenes&&t.totalTerpenes+"% terps"}</span>
                <span style={{color:t.overallPass?"var(--accent-2)":"var(--danger)",fontWeight:600}}>{t.overallPass===true?"PASS":t.overallPass===false?"FAIL":"Pending"}</span>
              </div>
            ))}
          </div>
        )}

        {batchDevs.length>0&&(
          <div className="batch-section" style={{borderLeft:"3px solid var(--danger)"}}><div className="batch-section-t" style={{color:"var(--danger)"}}>⚠ Deviations ({batchDevs.length})</div>
            {batchDevs.map(d=>(
              <div key={d.id} style={{marginBottom:10,fontSize:12}}>
                <div style={{fontWeight:600}}>{d.title||d.type} — {fmtD(d.date)} <span className={"gh-pill dev-"+d.status} style={{marginLeft:6}}>{d.status}</span>{d.severity&&<span style={{marginLeft:6,fontSize:10,textTransform:"uppercase",color:d.severity==="critical"?"var(--danger)":"var(--text-3)"}}>{d.severity}</span>}</div>
                <div style={{color:"var(--text-2)",marginTop:2}}>{d.description}</div>
                {d.correctiveAction&&<div style={{color:"var(--text-3)",marginTop:2}}>CA: {d.correctiveAction}</div>}
              </div>
            ))}
          </div>
        )}

        {[batchSignoffs,batchShiftEntries,batchCultInputs,batchQcTests,batchDevs].every(a=>!a.length)&&(
          <div style={{color:"var(--text-3)",fontSize:12,padding:16,textAlign:"center"}}>No GMP records attached to this batch yet. Add sign-offs, log inputs, and enter QC results to build the batch record.</div>
        )}
      </div>
    );
  }

  const openDevs=deviations.filter(d=>d.status==="open").length;

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading GMP hub…</div>);

  return(
    <>
      <style>{CSS}</style>
      <div className="gh-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>GMP Hub</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>SOP library, deviation register, shift log, step sign-offs, and digital batch records</div>
        </div>
        {openDevs>0&&<div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--danger)",fontWeight:500}}>⚠ {openDevs} open deviation{openDevs>1?"s":""} require CAPA sign-off</div>}

        <div className="gh-tabs">
          {[["shifts","🕐 Shift Log"],["signoffs","✅ Step Sign-Offs"],["record","📄 Batch Record"],["cleaning","🧹 Cleaning Log"],["deviations","⚠ Deviations"],["sops","📚 SOP Library"]].map(([v,l])=>(
            <button key={v} className={"gh-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── SHIFT LOG ── */}
        {tab==="shifts"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!shiftForm&&<button className="gh-btn gh-primary" onClick={()=>{setShiftForm({...EMPTY_SHIFT});setShiftEntries([]);}}>+ Log shift</button>}
            </div>
            {shiftForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Shift date</label><input type="date" className="gh-inp" value={shiftForm.date} onChange={e=>setShiftForm(f=>({...f,date:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Department</label><select className="gh-sel" value={shiftForm.department} onChange={e=>setShiftForm(f=>({...f,department:e.target.value}))}>{DEPT.map(d=><option key={d}>{d}</option>)}</select></div>
                  <div><label className="gh-lbl">Shift supervisor</label><select className="gh-sel" value={shiftForm.supervisorId} onChange={e=>setShiftForm(f=>({...f,supervisorId:e.target.value}))}><option value="">— Select —</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                </div>
                <div className="gh-box">
                  <div className="gh-box-t">Employee entries</div>
                  {shiftEntries.map((entry,i)=>(
                    <div key={entry.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 2fr auto",gap:8,marginBottom:8,alignItems:"flex-end"}}>
                      <div><label className="gh-lbl">Employee</label><select className="gh-sel" value={entry.employeeId} onChange={e=>{setEntry(i,"employeeId",e.target.value);}}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                      <div><label className="gh-lbl">Time in</label><input type="time" className="gh-inp" value={entry.timeIn} onChange={e=>{const h=calcHours(e.target.value,entry.timeOut);setEntry(i,"timeIn",e.target.value);setEntry(i,"hoursWorked",h);}} /></div>
                      <div><label className="gh-lbl">Time out</label><input type="time" className="gh-inp" value={entry.timeOut} onChange={e=>{const h=calcHours(entry.timeIn,e.target.value);setEntry(i,"timeOut",e.target.value);setEntry(i,"hoursWorked",h);}} /></div>
                      <div><label className="gh-lbl">Hrs</label><input className="gh-inp" value={entry.hoursWorked} readOnly style={{textAlign:"center"}} /></div>
                      <div><label className="gh-lbl">Batch</label><select className="gh-sel" value={entry.batchId} onChange={e=>setEntry(i,"batchId",e.target.value)}><option value="">—</option>{harvestBatches.map(b=><option key={"h"+b.id} value={b.id}>{b.strainName}</option>)}{prodBatches.map(b=><option key={"p"+b.id} value={b.id}>{b.name}</option>)}</select></div>
                      <div><label className="gh-lbl">Tasks performed</label><input className="gh-inp" value={entry.taskNotes} onChange={e=>setEntry(i,"taskNotes",e.target.value)} /></div>
                      <button className="gh-sm" style={{background:"rgba(200,74,74,0.1)",color:"var(--danger)",border:"none",cursor:"pointer",borderRadius:4,padding:"0 8px",alignSelf:"flex-end",height:32}} onClick={()=>setShiftEntries(p=>p.filter((_,idx)=>idx!==i))}>✕</button>
                    </div>
                  ))}
                  <button className="gh-btn gh-secondary" style={{fontSize:11,padding:"4px 10px"}} onClick={addShiftEntry}>+ Add employee</button>
                </div>
                <div style={{marginBottom:10}}><label className="gh-lbl">Shift notes</label><textarea className="gh-inp" rows={2} style={{resize:"vertical"}} value={shiftForm.notes} onChange={e=>setShiftForm(f=>({...f,notes:e.target.value}))} /></div>
                <div style={{display:"flex",gap:8}}>
                  <button className="gh-btn gh-primary" onClick={saveShift}>Save shift</button>
                  <button className="gh-btn gh-secondary" onClick={()=>{setShiftForm(null);setShiftEntries([]);}}>Cancel</button>
                </div>
              </div>
            )}
            {shifts.length===0&&!shiftForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No shifts logged yet.</div>}
            {shifts.length>0&&<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="gh-tbl">
                <thead><tr><th>Date</th><th>Dept</th><th>Supervisor</th><th>Staff</th><th>Notes</th><th></th></tr></thead>
                <tbody>{[...shifts].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=>(
                  <tr key={s.id}><td>{fmtD(s.date)}</td><td>{s.department}</td><td>{empName(s.supervisorId)}</td>
                    <td style={{fontSize:11}}>{(s.entries||[]).map(e=>empName(e.employeeId)).filter(Boolean).join(", ")||"—"}</td>
                    <td style={{fontSize:11,color:"var(--text-3)"}}>{s.notes||"—"}</td>
                    <td><button className="gh-sm gh-del" onClick={async()=>{try{await db.gmp_shifts.delete(s.id);setShifts(p=>p.filter(x=>x.id!==s.id));}catch(e){console.error(e);}}}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          </div>
        )}

        {/* ── STEP SIGN-OFFS ── */}
        {tab==="signoffs"&&(()=>{
          // Build one row per (batch, step) across both batch types, using
          // each batch's real scheduled step list -- not a free-text log,
          // so this always reflects what's actually on the schedule.
          const allStepRows=[
            ...harvestBatches.flatMap(b=>(Array.isArray(b.steps)?b.steps:[]).map(step=>({type:"harvest",batch:b,stepName:step.n}))),
            ...prodBatches.flatMap(b=>(Array.isArray(b.steps)?b.steps:[]).map(step=>({type:"production",batch:b,stepName:step.n}))),
          ].map(r=>{
            const so=findSignoff(r.type,r.batch.id,r.stepName);
            const required=getRequiredTiers(r.stepName,facility);
            const missing=required.filter(t=>!so?.[t+"Id"]);
            return {...r,so,required,missing};
          });
          const outstanding=allStepRows.filter(r=>r.missing.length>0);
          const grouped={};
          outstanding.forEach(r=>{
            const key=r.type+":"+r.batch.id;
            (grouped[key]=grouped[key]||{type:r.type,batch:r.batch,rows:[]}).rows.push(r);
          });
          const historyRows=allStepRows.filter(r=>r.so&&TIER_ORDER.some(t=>r.so[t+"Id"]))
            .sort((a,b)=>{
              const latest=r=>Math.max(...TIER_ORDER.map(t=>r.so[t+"At"]?new Date(r.so[t+"At"]).getTime():0));
              return latest(b)-latest(a);
            });
          return (
          <div className="gh-card">
            <div className="gh-tabs" style={{maxWidth:360,marginBottom:14}}>
              <button className={"gh-tab "+(soView==="outstanding"?"active":"")} onClick={()=>setSoView("outstanding")}>Outstanding ({outstanding.length})</button>
              <button className={"gh-tab "+(soView==="history"?"active":"")} onClick={()=>setSoView("history")}>History</button>
            </div>

            {soView==="outstanding"&&(
              Object.keys(grouped).length===0
                ?<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>✅ Nothing outstanding — every tracked step across scheduled batches has its required sign-offs.</div>
                :Object.values(grouped).map(g=>(
                  <div key={g.type+g.batch.id} className="batch-section">
                    <div className="batch-section-t">{g.type==="harvest"?g.batch.strainName:g.batch.name} — {g.type==="harvest"?"Harvest":"Production"}</div>
                    {g.rows.map(r=>(
                      <div key={r.stepName} className="signoff-row" style={{flexWrap:"wrap",alignItems:"flex-start"}}>
                        <div style={{minWidth:140,fontWeight:500,color:"var(--text)",paddingTop:4}}>{r.stepName}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",flex:1}}>
                          {r.required.map(tier=>{
                            const signedId=r.so?.[tier+"Id"];
                            return signedId?(
                              <span key={tier} style={{fontSize:11,color:"var(--accent-2)",background:"rgba(74,124,89,0.15)",borderRadius:6,padding:"3px 8px"}}>✓ {TIER_LABELS[tier]}: {empName(signedId)}</span>
                            ):tier==="qc_head"?(
                              <button key={tier} className="gh-sm gh-edit" onClick={()=>{setTab("record");setBatchRecordId({type:r.type,id:String(r.batch.id)});}}>
                                → Sign in Batch Record
                              </button>
                            ):(
                              <TierSignoffPicker key={tier} tier={tier} employees={employees} currentUserId={currentUserId} onSign={empId=>signOffTier(r.type,r.batch.id,r.stepName,tier,empId)} />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
            )}

            {soView==="history"&&(
              historyRows.length===0
                ?<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No sign-offs recorded yet.</div>
                :<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                  <table className="gh-tbl">
                    <thead><tr><th>Batch</th><th>Step</th>{TIER_ORDER.map(t=><th key={t}>{TIER_LABELS[t]}</th>)}</tr></thead>
                    <tbody>{historyRows.map(r=>(
                      <tr key={r.type+r.batch.id+r.stepName}>
                        <td style={{fontSize:11}}>{r.type==="harvest"?r.batch.strainName:r.batch.name}</td>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{r.stepName}</td>
                        {TIER_ORDER.map(t=>{
                          const id=r.so?.[t+"Id"];
                          return <td key={t} style={{fontSize:11}}>{id?<>{empName(id)}<br/><span style={{color:"var(--text-3)"}}>{fmtDT(r.so[t+"At"])}</span></>:<span style={{color:"var(--text-3)"}}>—</span>}</td>;
                        })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
            )}
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginTop:10}}>{err}</div>}
          </div>
          );
        })()}

        {/* ── BATCH RECORD ── */}
        {tab==="record"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,flex:1,marginRight:12}}>
                <div><label className="gh-lbl">Batch type</label><select className="gh-sel" value={batchRecordId.type} onChange={e=>setBatchRecordId(b=>({...b,type:e.target.value,id:""}))}>
                  <option value="harvest">Harvest Batch</option><option value="production">Production Batch</option>
                </select></div>
                <div><label className="gh-lbl">Select batch to view GMP record</label><select className="gh-sel" value={batchRecordId.id} onChange={e=>setBatchRecordId(b=>({...b,id:e.target.value}))}>
                  <option value="">— Select batch —</option>
                  {(batchRecordId.type==="harvest"?harvestBatches:prodBatches).map(b=><option key={b.id} value={String(b.id)}>{batchRecordId.type==="harvest"?(b.strainName||"Unknown")+" ("+(b.d?fmtD(b.d):"no date")+")":b.name||"Unnamed batch"}</option>)}
                </select></div>
              </div>
              {batchRecordId.id&&(
                <button className="gh-btn gh-secondary" style={{whiteSpace:"nowrap"}} onClick={()=>{
                  const {type,id}=batchRecordId;
                  const batch=type==="harvest"?harvestBatches.find(b=>String(b.id)===id):prodBatches.find(b=>String(b.id)===id);
                  if(!batch) return;
                  const batchSignoffs=signoffs.filter(s=>s.batchType===type&&String(s.batchId)===id);
                  const batchDevs=deviations.filter(d=>d.batchType===type&&String(d.batchId)===id);
                  const qcRecs=qcTests.filter(t=>t.batchType===type&&String(t.batchId)===id);
                  const editedMark=rec=>wasEditedAfterEntry(rec)?` <span class="edited-mark" title="Edited after original entry">✎</span>`:"";
                  const editedCount=[...batchSignoffs,...batchDevs,...qcRecs].filter(wasEditedAfterEntry).length;
                  const signoffRows=batchSignoffs.map(s=>`<tr><td>${s.stepName||""}${editedMark(s)}</td><td>${s.performedById||""}</td><td>${s.verifiedById||"—"}</td><td>${s.timestamp?new Date(s.timestamp).toLocaleString():"—"}</td><td>${s.notes||"—"}</td></tr>`).join("");
                  const devRows=batchDevs.map(d=>`<tr><td>${d.type||""}${editedMark(d)}</td><td>${d.severity||""}</td><td>${d.title||""}</td><td>${d.status||""}</td><td>${d.correctiveAction||"—"}</td></tr>`).join("");
                  const qcRow=qcRecs.map(t=>`<tr><td>${t.labName||""}${editedMark(t)}</td><td>${t.sampleId||""}</td><td>${t.thca||"—"}%</td><td>${t.totalTerpenes||"—"}%</td><td style="color:${t.overallPass?"#2d5a3d":"#c04040"};font-weight:600;">${t.overallPass===true?"PASS":t.overallPass===false?"FAIL":"Pending"}</td></tr>`).join("");
                  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>GMP Batch Record</title><style>
                    body{font-family:Arial,sans-serif;font-size:10px;margin:24px;color:#222;}
                    h1{font-size:16px;margin:0 0 4px;color:#1a3a28;}h2{font-size:12px;margin:16px 0 6px;color:#2d5a3d;border-bottom:2px solid #2d5a3d;padding-bottom:3px;}
                    .meta{display:flex;gap:40px;margin-bottom:16px;padding:10px 14px;background:#f5f5f5;border-radius:6px;}
                    .meta-item{}.meta-label{font-size:8px;text-transform:uppercase;letter-spacing:0.06em;color:#888;font-weight:700;margin-bottom:2px;}
                    .meta-value{font-size:11px;font-weight:600;}
                    table{width:100%;border-collapse:collapse;margin-bottom:12px;}
                    th{background:#2d5a3d;color:#fff;padding:5px 8px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:0.05em;}
                    td{padding:5px 8px;border-bottom:1px solid #e8e8e8;font-size:10px;vertical-align:top;}tr:nth-child(even){background:#f9f9f9;}
                    .footer{margin-top:24px;border-top:1px solid #ccc;padding-top:8px;font-size:8px;color:#888;display:flex;justify-content:space-between;}
                    .empty{color:#999;font-style:italic;padding:8px 0;}
                    .disclosure{margin-bottom:16px;padding:8px 12px;border-radius:6px;font-size:9px;}
                    .disclosure.neutral{background:#f0f0f0;color:#666;border:1px solid #ddd;}
                    .disclosure.warn{background:#fdf2e3;color:#8a5a00;border:1px solid #e8c27a;font-weight:600;}
                    .edited-mark{color:#8a5a00;font-weight:700;}
                  </style></head><body>
                  <h1>GMP Batch Record — ${type==="harvest"?batch.strainName:batch.name}</h1>
                  <div class="meta">
                    <div class="meta-item"><div class="meta-label">Facility</div><div class="meta-value">${facility.facility_name||"—"}</div></div>
                    <div class="meta-item"><div class="meta-label">License</div><div class="meta-value">${facility.license_number||"—"}</div></div>
                    <div class="meta-item"><div class="meta-label">Batch ID</div><div class="meta-value">${batch.id||"—"}</div></div>
                    <div class="meta-item"><div class="meta-label">Date</div><div class="meta-value">${batch.d||"—"}</div></div>
                    <div class="meta-item"><div class="meta-label">Space</div><div class="meta-value">${batch.spaceName||batch.strains||"—"}</div></div>
                    <div class="meta-item"><div class="meta-label">Status</div><div class="meta-value">${batch.status||"—"}</div></div>
                  </div>
                  ${editedCount>0
                    ?`<div class="disclosure warn">⚠ Unsigned, point-in-time export generated ${new Date().toLocaleString()}. ${editedCount} record${editedCount>1?"s":""} marked ✎ below ${editedCount>1?"were":"was"} edited after their original entry — this export reflects the latest edit, not necessarily what was true when the work was performed. For a tamper-evident record, use Sign &amp; Release instead.</div>`
                    :`<div class="disclosure neutral">This is an unsigned, point-in-time export generated ${new Date().toLocaleString()}. For a tamper-evident record, use Sign &amp; Release instead.</div>`}
                  <h2>Step Sign-Offs (${batchSignoffs.length})</h2>
                  ${batchSignoffs.length?`<table><thead><tr><th>Step</th><th>Performed By</th><th>Verified By</th><th>Timestamp</th><th>Notes</th></tr></thead><tbody>${signoffRows}</tbody></table>`:`<div class="empty">No sign-offs recorded for this batch.</div>`}
                  <h2>QC / Lab Results (${qcRecs.length})</h2>
                  ${qcRecs.length?`<table><thead><tr><th>Lab</th><th>Sample ID</th><th>THCa %</th><th>Total Terps %</th><th>Result</th></tr></thead><tbody>${qcRow}</tbody></table>`:`<div class="empty">No COA results linked to this batch.</div>`}
                  <h2>Deviations (${batchDevs.length})</h2>
                  ${batchDevs.length?`<table><thead><tr><th>Type</th><th>Severity</th><th>Title</th><th>Status</th><th>Corrective Action</th></tr></thead><tbody>${devRows}</tbody></table>`:`<div class="empty">No deviations recorded for this batch.</div>`}
                  <div class="footer">
                    <span>${facility.facility_name||""} · ${facility.license_number||""}</span>
                    <span>GMP Batch Record — Generated ${new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</span>
                    <span>Page 1 of 1</span>
                  </div>
                  <script>window.onload=()=>window.print();</script>
                  </body></html>`;
                  const w=window.open("","_blank");
                  w.document.write(html);w.document.close();
                }}>🖨 Print Batch Record</button>
              )}
            </div>
            <BatchRecord />
          </div>
        )}

        {/* ── CLEANING LOG ── */}
        {tab==="cleaning"&&(()=>{
          // Read cleaning logs from both Facility Map and Grow Map rooms
          const allRooms=[...facilityRooms,...growRooms];
          const allCleanLogs=allRooms.flatMap(r=>(r.cleanLog||[]).map(c=>({...c,roomName:r.name,roomType:r.type||""})))
            .sort((a,b)=>new Date(b.date)-new Date(a.date));
          const overdueFacility=facilityRooms.filter(r=>{
            if(r.status==="inactive") return false;
            const last=r.cleanLog?.slice(-1)[0]?.date;
            return !last||Math.round((new Date()-new Date(last))/86400000)>=(parseInt(r.cleanIntervalDays)||7);
          });
          return(
            <div className="gh-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Facility & Room Cleaning Log</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>Cross-facility cleaning records — log cleaning events in the Facility Map module per room</div>
                </div>
                {overdueFacility.length>0&&(
                  <div style={{background:"rgba(200,150,58,0.12)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"6px 12px",fontSize:12,color:"var(--amber)"}}>
                    ⚠ {overdueFacility.length} space{overdueFacility.length!==1?"s":""} overdue: {overdueFacility.map(r=>r.name).join(", ")}
                  </div>
                )}
              </div>
              {allCleanLogs.length===0?(
                <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>
                  <div style={{fontSize:24,marginBottom:8}}>🧹</div>
                  <div style={{fontWeight:500,marginBottom:4}}>No cleaning events logged</div>
                  <div style={{fontSize:12}}>Go to Facility Map → select a space → Log cleaning event</div>
                </div>
              ):(
                <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr>
                      {["Date","Room / Space","Type","Clean Type","Performed By","Notes"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--text-3)",borderBottom:"1px solid var(--border)",background:"var(--surface-2)"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {allCleanLogs.map((c,i)=>(
                        <tr key={c.id||i} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"transparent":"var(--surface-2)"}}>
                          <td style={{padding:"7px 10px",whiteSpace:"nowrap",color:"var(--text-2)"}}>{c.date}</td>
                          <td style={{padding:"7px 10px",fontWeight:500,color:"var(--text)"}}>{c.roomName}</td>
                          <td style={{padding:"7px 10px",fontSize:11,color:"var(--text-3)"}}>{c.roomType}</td>
                          <td style={{padding:"7px 10px"}}>{c.type}</td>
                          <td style={{padding:"7px 10px"}}>{c.by}</td>
                          <td style={{padding:"7px 10px",color:"var(--text-3)",fontSize:11}}>{c.notes||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── DEVIATIONS ── */}
        {tab==="deviations"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!devForm&&<button className="gh-btn gh-primary" onClick={()=>setDevForm({...EMPTY_DEV})}>+ Log deviation</button>}
            </div>
            {devForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{marginBottom:10}}><label className="gh-lbl">Title</label><input className="gh-inp" value={devForm.title} onChange={e=>setDevForm(f=>({...f,title:e.target.value}))} placeholder="Short summary for the batch record and printouts" /></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Deviation type</label><select className="gh-sel" value={devForm.type} onChange={e=>setDevForm(f=>({...f,type:e.target.value}))}>{DEV_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label className="gh-lbl">Severity</label><select className="gh-sel" value={devForm.severity} onChange={e=>setDevForm(f=>({...f,severity:e.target.value}))}>{DEV_SEVERITIES.map(s=><option key={s} value={s}>{s[0].toUpperCase()+s.slice(1)}</option>)}</select></div>
                  <div><label className="gh-lbl">Date</label><input type="date" className="gh-inp" value={devForm.date} onChange={e=>setDevForm(f=>({...f,date:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Status</label>
                    {devForm.status==="closed"?(
                      <div style={{padding:"7px 0"}}><span className="gh-pill dev-closed">Closed / CAPA complete</span></div>
                    ):(
                      <select className="gh-sel" value={devForm.status} onChange={e=>setDevForm(f=>({...f,status:e.target.value}))}><option value="open">Open</option></select>
                    )}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Batch type</label><select className="gh-sel" value={devForm.batchType} onChange={e=>setDevForm(f=>({...f,batchType:e.target.value,batchId:""}))}><option value="harvest">Harvest</option><option value="production">Production</option><option value="cultivation">Cultivation</option></select></div>
                  <div><label className="gh-lbl">Related batch</label><select className="gh-sel" value={devForm.batchId} onChange={e=>setDevForm(f=>({...f,batchId:e.target.value}))}>
                    <option value="">— None / facility-wide —</option>
                    {(devForm.batchType==="harvest"?harvestBatches:prodBatches).map(b=><option key={b.id} value={b.id}>{devForm.batchType==="harvest"?b.strainName:b.name}</option>)}
                  </select></div>
                </div>
                {[["stepName","Step / area where deviation occurred"],["description","Description of what happened"],["rootCause","Root cause analysis"],["correctiveAction","Corrective action (CA) taken"],["preventiveAction","Preventive action (PA) — how to prevent recurrence"]].map(([k,l])=>(
                  <div key={k} style={{marginBottom:10}}><label className="gh-lbl">{l}</label><textarea className="gh-inp" rows={2} style={{resize:"vertical"}} value={devForm[k]} onChange={e=>setDevForm(f=>({...f,[k]:e.target.value}))} /></div>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Reported by</label><select className="gh-sel" value={devForm.reportedById} onChange={e=>setDevForm(f=>({...f,reportedById:e.target.value}))}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                  <div><label className="gh-lbl">Closed / verified by</label><select className="gh-sel" value={devForm.closedById} onChange={e=>setDevForm(f=>({...f,closedById:e.target.value}))}><option value="">—</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                </div>
                {devForm.status==="closed"&&(
                  <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10}}>
                    Closed and signed — fields are locked. Reopen (with a documented reason) before editing.
                  </div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <button className="gh-btn gh-primary" disabled={devForm.status==="closed"} onClick={saveDev}>{devForm.id?"Save changes":"Log deviation"}</button>
                  {devForm.status!=="closed"&&(
                    <button className="gh-btn gh-edit" disabled={!devForm.rootCause?.trim()||!devForm.correctiveAction?.trim()} onClick={openDeviationClosure}>Sign &amp; Close</button>
                  )}
                  {devForm.status==="closed"&&(
                    <button className="gh-btn gh-edit" onClick={()=>promptForReason(
                      "Reopen Deviation",
                      `Reopening "${devForm.title||devForm.type}" so it can be edited again. This is recorded permanently with your reason, and it will need to be re-closed (signed) afterward.`,
                      reason=>reopenDeviation(devForm,reason)
                    )}>Reopen</button>
                  )}
                  <button className="gh-btn gh-secondary" onClick={()=>{setDevForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}
            {deviations.length===0&&!devForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No deviations logged. Good.</div>}
            {deviations.length>1&&!devForm&&(()=>{
              const byType=DEV_TYPES.map(type=>({type,items:deviations.filter(d=>d.type===type)}))
                .filter(t=>t.items.length>0).sort((a,b)=>b.items.length-a.items.length);
              const maxCount=byType[0]?.items.length||1;
              return(
                <div style={{background:"var(--surface-2)",borderRadius:8,padding:"14px 16px",marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>Recurring Root Causes</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginBottom:12}}>Grouped by deviation type — a repeated type is the system-level pattern, not the one-off incident.</div>
                  {byType.map(({type,items})=>(
                    <div key={type} style={{marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text)",minWidth:190}}>{type}{items.length>=3&&<span className="gh-pill dev-open" style={{marginLeft:8,fontSize:9}}>recurring</span>}</div>
                        <div style={{flex:1,height:6,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:(items.length/maxCount*100)+"%",height:"100%",background:items.length>=3?"var(--danger)":"var(--accent)"}} />
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text-2)",width:20,textAlign:"right"}}>{items.length}</div>
                      </div>
                      {items.length>1&&(
                        <div style={{marginLeft:0,paddingLeft:2,fontSize:11,color:"var(--text-3)"}}>
                          {items.filter(d=>d.rootCause?.trim()).slice(0,4).map(d=>(
                            <div key={d.id} style={{padding:"2px 0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                              &ndash; {fmtD(d.date)}: {d.rootCause.length>90?d.rootCause.slice(0,90)+"…":d.rootCause}
                            </div>
                          ))}
                          {items.filter(d=>!d.rootCause?.trim()).length>0&&<div style={{padding:"2px 0",fontStyle:"italic"}}>{items.filter(d=>!d.rootCause?.trim()).length} of {items.length} logged without a root cause entered</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            {deviations.length>0&&<div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="gh-tbl">
                <thead><tr><th>Date</th><th>Type</th><th>Batch</th><th>Description</th><th>CA Summary</th><th>Reported</th><th>Status</th><th></th></tr></thead>
                <tbody>{[...deviations].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(d=>(
                  <tr key={d.id}>
                    <td style={{whiteSpace:"nowrap"}}>{fmtD(d.date)}</td>
                    <td style={{fontSize:11}}>{d.type}</td>
                    <td style={{fontSize:11}}>{d.batchId?((d.batchType==="harvest"?harvestBatches:prodBatches).find(b=>String(b.id)===d.batchId)?.[d.batchType==="harvest"?"strainName":"name"]||"—"):"—"}</td>
                    <td style={{maxWidth:200,fontSize:11}}>{d.description?.slice(0,80)}{d.description?.length>80?"…":""}</td>
                    <td style={{maxWidth:160,fontSize:11,color:"var(--text-3)"}}>{d.correctiveAction?.slice(0,60)||"—"}</td>
                    <td style={{fontSize:11}}>{empName(d.reportedById)}</td>
                    <td><span className={"gh-pill dev-"+d.status}>{d.status}</span></td>
                    <td><div style={{display:"flex",gap:5}}>
                      <button className="gh-sm gh-edit" onClick={()=>setDevForm({...d})}>Edit</button>
                      <button className="gh-sm gh-del" onClick={async()=>{try{await db.gmp_deviations.delete(d.id);setDeviations(p=>p.filter(x=>x.id!==d.id));}catch(e){console.error(e);}}}>✕</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
          </div>
        )}

        {/* ── SOP LIBRARY ── */}
        {tab==="sops"&&(
          <div className="gh-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              {!sopForm&&<button className="gh-btn gh-primary" onClick={()=>setSopForm({...EMPTY_SOP})}>+ Add SOP</button>}
            </div>
            {sopForm&&(
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">SOP title</label><input className="gh-inp" value={sopForm.title} onChange={e=>setSopForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Harvest & Bucking Procedure" /></div>
                  <div><label className="gh-lbl">Version</label><input className="gh-inp" value={sopForm.version} onChange={e=>setSopForm(f=>({...f,version:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Department</label><select className="gh-sel" value={sopForm.department} onChange={e=>setSopForm(f=>({...f,department:e.target.value}))}>{DEPT.map(d=><option key={d}>{d}</option>)}</select></div>
                  <div><label className="gh-lbl">Status</label><select className="gh-sel" value={sopForm.status} onChange={e=>setSopForm(f=>({...f,status:e.target.value}))}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="gh-lbl">Effective date</label><input type="date" className="gh-inp" value={sopForm.effectiveDate} onChange={e=>setSopForm(f=>({...f,effectiveDate:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Approved by</label><input className="gh-inp" value={sopForm.approvedBy} onChange={e=>setSopForm(f=>({...f,approvedBy:e.target.value}))} /></div>
                  <div><label className="gh-lbl">Governs steps (comma-separated)</label><input className="gh-inp" value={sopForm.linkedStepTypes} onChange={e=>setSopForm(f=>({...f,linkedStepTypes:e.target.value}))} placeholder="Bucking, Trimming, Packaging…" /></div>
                </div>
                <div style={{marginBottom:10}}><label className="gh-lbl">SOP content / procedure summary</label><textarea className="gh-inp" rows={6} style={{resize:"vertical"}} value={sopForm.content} onChange={e=>setSopForm(f=>({...f,content:e.target.value}))} placeholder="Describe the procedure, required PPE, critical control points, and acceptance criteria…" /></div>
                {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  {sopForm.status==="active"?(
                    <button className="gh-btn gh-primary" onClick={openSopActivation}>Sign &amp; Activate</button>
                  ):(
                    <button className="gh-btn gh-primary" onClick={saveSop}>{sopForm.id?"Save changes":"Add SOP"}</button>
                  )}
                  <button className="gh-btn gh-secondary" onClick={()=>{setSopForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}
            {sops.length===0&&!sopForm&&<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No SOPs yet. Add your facility procedures here — each SOP can be linked to batch steps.</div>}
            {sops.length>0&&sops.map(s=>(
              <div key={s.id} style={{border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:600,color:"var(--text)",fontSize:13}}>{s.title} <span style={{fontSize:10,color:"var(--text-3)",fontWeight:400}}>v{s.version}</span></div>
                    <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>{s.department} · Effective {fmtD(s.effectiveDate)} · Approved by {s.approvedBy||"—"}{s.lockedAt&&<> · 🔒 Signed {fmtD(s.lockedAt)}</>}</div>
                    {s.linkedStepTypes&&<div style={{fontSize:10,color:"var(--accent-2)",marginTop:3}}>Governs: {s.linkedStepTypes}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span className={"gh-pill sop-"+s.status}>{s.status}</span>
                    <button className="gh-sm gh-edit" onClick={()=>setSopForm({...s})}>{s.lockedAt?"Edit → New Version":"Edit"}</button>
                    <button className="gh-sm gh-del" onClick={async()=>{try{await db.gmp_sops.delete(s.id);setSops(p=>p.filter(x=>x.id!==s.id));}catch(e){console.error(e);}}}>✕</button>
                  </div>
                </div>
                {s.content&&<div style={{fontSize:11,color:"var(--text-2)",marginTop:8,borderTop:"1px solid var(--border)",paddingTop:8,whiteSpace:"pre-wrap"}}>{s.content.slice(0,300)}{s.content.length>300?"…":""}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {signingModal&&(
        <SignToConfirmModal
          title={signingModal.title}
          description={signingModal.description}
          documentType={signingModal.documentType}
          documentId={signingModal.documentId}
          documentLabel={signingModal.documentLabel}
          facilityId={getCurrentFacility()}
          buildPdf={signingModal.buildPdf}
          onSigned={async(record)=>{ await signingModal.onSigned(record); setSigningModal(null); }}
          onCancel={()=>setSigningModal(null)}
        />
      )}
      {reasonPrompt&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>{if(!reasonBusy){setReasonPrompt(null);setReasonText("");}}}>
          <div className="gh-card" style={{width:420,maxWidth:"90vw",margin:0}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:8}}>{reasonPrompt.title}</div>
            <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>{reasonPrompt.description}</div>
            <form onSubmit={e=>{e.preventDefault(); if(!reasonBusy) confirmReasonPrompt();}}>
              <label className="gh-lbl" htmlFor="reason-prompt-text">Reason</label>
              <textarea id="reason-prompt-text" className="gh-inp" rows={3} style={{resize:"vertical"}} autoFocus
                value={reasonText} onChange={e=>setReasonText(e.target.value)} />
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <button type="submit" className="gh-btn gh-primary" disabled={reasonBusy||!reasonText.trim()}>{reasonBusy?"Saving…":"Confirm"}</button>
                <button type="button" className="gh-btn gh-secondary" disabled={reasonBusy} onClick={()=>{setReasonPrompt(null);setReasonText("");}}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
