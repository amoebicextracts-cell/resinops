import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import { db } from "./lib/db";
import { getCurrentFacility } from "./lib/supabase";
import { autoPopulateStrains } from "./strainUtils.js";
import { parseDateLocal, todayLocalISO } from "./lib/dateUtils";
import SignToConfirmModal from "./SignToConfirmModal.jsx";

function fmtD(dt){return dt?parseDateLocal(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function daysUntil(dt){return dt?Math.round((new Date(dt)-new Date())/86400000):null;}
function pf(v){return v===true?"PASS":v===false?"FAIL":"—";}
function pfColor(v){return v===true?"var(--accent-2)":v===false?"var(--danger)":"var(--text-3)";}

const CANNABINOIDS=["thca","thc","cbda","cbd","cbg","cbn","thcv","cbc","totalCannabinoids"];
const CANNABINOID_LABELS={thca:"THCa %",thc:"THC %",cbda:"CBDa %",cbd:"CBD %",cbg:"CBG %",cbn:"CBN %",thcv:"THCv %",cbc:"CBC %",totalCannabinoids:"Total Cannabinoids %"};
const TERPENES=["totalTerpenes","myrcene","limonene","caryophyllene","linalool","pinene","ocimene","terpinolene","humulene","bisabolol","valencene","other_terps"];
const TERP_LABELS={totalTerpenes:"Total Terpenes %",myrcene:"Myrcene %",limonene:"Limonene %",caryophyllene:"Caryophyllene %",linalool:"Linalool %",pinene:"Pinene %",ocimene:"Ocimene %",terpinolene:"Terpinolene %",humulene:"Humulene %",bisabolol:"Bisabolol %",valencene:"Valencene %",other_terps:"Other Terpenes %"};

const CSS=`
  .qc-wrap{padding:24px;flex:1;overflow-y:auto;}
  .qc-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .qc-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .qc-inp:focus{outline:none;border-color:var(--accent);}
  .qc-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .qc-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .qc-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .qc-btn:hover{opacity:0.85;}
  .qc-primary{background:var(--accent);color:#fff;}
  .qc-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .qc-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .qc-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .qc-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .qc-box{background:var(--surface-2);border-radius:8px;padding:10px 12px;margin-bottom:10px;}
  .qc-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;}
  .qc-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .qc-tbl th{text-align:left;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .qc-tbl td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .qc-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .qc-pass{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .qc-fail{background:rgba(200,74,74,0.15);color:var(--danger);}
  .qc-pending{background:rgba(200,150,58,0.15);color:var(--amber);}
  .pf-radio{display:flex;gap:10px;align-items:center;}
  .pf-radio label{display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;}

  /* SignToConfirmModal is styled with these gh- classes, defined in
     GMPHub.jsx's own scoped <style> tag -- which isn't mounted here
     since only the active module renders. Duplicated verbatim rather
     than importing GMPHub.jsx just for its CSS string. */
  .gh-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .gh-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .gh-inp:focus{outline:none;border-color:var(--accent);}
  .gh-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .gh-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .gh-btn:hover{opacity:0.85;}
  .gh-primary{background:var(--accent);color:#fff;}
  .gh-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
`;

function PFField({label,value,onChange}){
  return(
    <div>
      <div className="qc-lbl">{label}</div>
      <div className="pf-radio">
        <label><input type="radio" checked={value===true} onChange={()=>onChange(true)} />Pass</label>
        <label><input type="radio" checked={value===false} onChange={()=>onChange(false)} />Fail</label>
        <label><input type="radio" checked={value===null||value===undefined} onChange={()=>onChange(null)} />N/T</label>
      </div>
    </div>
  );
}

const EMPTY={
  batchType:"harvest",batchId:"",batchName:"",strainName:"",
  sampleId:"",labName:"",submittedDate:"",expectedDate:"",receivedDate:"",
  thca:"",thc:"",cbda:"",cbd:"",cbg:"",cbn:"",thcv:"",cbc:"",totalCannabinoids:"",
  totalTerpenes:"",myrcene:"",limonene:"",caryophyllene:"",linalool:"",pinene:"",ocimene:"",terpinolene:"",humulene:"",bisabolol:"",valencene:"",other_terps:"",
  tyam:"",tab:"",aspergillus:null,salmonella:null,stec:null,ecoli:null,microbialPass:null,
  pesticidesPass:null,heavyMetalsPass:null,waterActivity:"",moistureContent:"",foreignMatterPass:null,
  overallPass:null,notes:"",status:"pending"
};

export default function QCTesting(){
  const [harvestBatches,setHarvestBatches]=useState([]);
  const [prodBatches,setProdBatches]=useState([]);
  const [tests,setTests]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [formSection,setFormSection]=useState("meta");
  const [err,setErr]=useState("");
  const [signingModal,setSigningModal]=useState(null);
  const [confirmModal,setConfirmModal]=useState(null);

  useEffect(()=>{
    async function load(){
      try{
        const [qc,hb,pb]=await Promise.all([
          db.qc_tests.list(),
          db.harvest_batches.list(),
          db.production_batches.list(),
        ]);
        setTests(qc.map(t=>({...t,batchId:t.batchType==="harvest"?t.harvestBatchId:t.productionBatchId})));
        setHarvestBatches(hb);
        setProdBatches(pb.filter(b=>!b.isLinked));
      }catch(e){ console.error("QCTesting load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  const batchOptions=form?.batchType==="harvest"
    ?harvestBatches.map(b=>({id:b.id,label:b.strainName+" ("+fmtD(b.d)+")",strain:b.strainName}))
    :prodBatches.map(b=>({id:b.id,label:b.name+" — "+b.catLabel,strain:b.strains||""}));

  function selectBatch(id){
    const src=batchOptions.find(b=>String(b.id)===String(id));
    setForm(f=>({...f,batchId:id,batchName:src?.label||"",strainName:src?.strain||""}));
  }

  function calcOverall(f){
    const panels=[f.microbialPass,f.pesticidesPass,f.heavyMetalsPass,f.foreignMatterPass,f.aspergillus,f.salmonella,f.stec,f.ecoli];
    if(panels.some(v=>v===false)) return false;
    if(panels.every(v=>v===true)) return true;
    return null; // any panel still untested (N/T) — hold at pending, don't auto-pass
  }

  // DI-3 mitigation: a fat-fingered digit or misclicked radio here can
  // silently release a bad batch (if a fail gets entered as pass) or
  // silently block a good one (if a pass gets entered as fail) -- and
  // until now nothing in the app asked the submitter to double-check
  // the exact values before they took effect. Any save that resolves to
  // a determinate overall result (true or false, not still-pending)
  // routes through a review step showing exactly what was entered for
  // the panels that actually decide it, requiring an explicit second
  // look before it commits. A still-pending/interim save (overall
  // stays null because some panel is N/T) skips this -- nothing
  // release-critical has been decided yet.
  function save(){
    const hasIdentity = form.batchId || form.batchName || form.strainName || form.sampleId;
    if(!hasIdentity){setErr("Provide at least a strain name or sample ID to save this record.");return;}
    const overall=form.overallPass??calcOverall(form);
    if(overall===null){ commitSave(form,overall); return; }
    setConfirmModal({form,overall});
  }

  async function commitSave(f,overall){
    const isHarvest=f.batchType==="harvest";
    const rec={...f,id:f.id||crypto.randomUUID(),overallPass:overall,
      onHold:overall===false,
      harvestBatchId:isHarvest?(f.batchId||null):null,
      productionBatchId:isHarvest?null:(f.batchId||null)};
    try{
      const saved=await db.qc_tests.upsert(rec);
      saved.batchId=isHarvest?saved.harvestBatchId:saved.productionBatchId;
      if(f.id) setTests(p=>p.map(x=>x.id===saved.id?saved:x));
      else setTests(p=>[...p,saved]);

      // Auto-create harvest batch from passing COA
      if(overall===true&&!f.batchId){
        const alreadyExists=harvestBatches.some(b=>b.coaSampleId===f.sampleId||b.coa_sample_id===f.sampleId);
        if(!alreadyExists){
          try{
            const newBatch={id:crypto.randomUUID(),strainName:f.strainName||"Unknown",
              d:f.receivedDate||f.submittedDate||todayLocalISO(),
              status:"complete",coaSampleId:f.sampleId,labName:f.labName,
              thca:f.thca,notes:"Auto-created from passing COA import"};
            const savedHb=await db.harvest_batches.upsert(newBatch);
            setHarvestBatches(p=>[...p,savedHb]);
          }catch(e){ console.error("Auto harvest batch failed:",e); }
        }
      } else if(overall===true&&f.batchId&&isHarvest){
        // Mark linked harvest batch complete
        const hb=harvestBatches.find(b=>String(b.id)===String(f.batchId));
        if(hb){
          try{
            await db.harvest_batches.upsert({...hb,status:"complete",coaSampleId:f.sampleId,thca:f.thca||hb.thca});
            setHarvestBatches(p=>p.map(b=>String(b.id)===String(f.batchId)?{...b,status:"complete"}:b));
          }catch(e){ console.error("Harvest batch update failed:",e); }
        }
      } else if(overall===true&&f.batchId&&!isHarvest){
        // Mark linked production batch complete
        const pb=prodBatches.find(b=>String(b.id)===String(f.batchId));
        if(pb){
          try{
            const savedPb=await db.production_batches.upsert({...pb,status:"complete"});
            setProdBatches(p=>p.map(b=>String(b.id)===String(f.batchId)?savedPb:b));
          }catch(e){ console.error("Production batch update failed:",e); }
        }
      }

      // Auto-flag a failed microbial panel for remediation
      if(f.microbialPass===false){
        try{
          const sourceId=f.batchId||saved.id;
          const sourceType=isHarvest?"harvest":"production";
          const already=(await db.remediation.list()).some(r=>String(r.sourceId)===String(sourceId)&&r.sourceType===sourceType);
          if(!already){
            await db.remediation.upsert({
              id:crypto.randomUUID(),
              sourceType, sourceId,
              strainName:f.strainName||"Unknown",
              labName:f.labName,
              labReportRef:f.sampleId,
              testDate:f.receivedDate||f.submittedDate||todayLocalISO(),
              tyamCfu:f.tyam,
              tabCfu:f.tab,
              aspergillus:f.aspergillus===true,
              status:"flagged",
              notes:"Auto-flagged from failed microbial panel on QC test "+(f.sampleId||"(no sample ID)"),
            });
          }
        }catch(e){ console.error("Auto remediation flag failed:",e); }
      }

      // Update strain catalogue with COA averages
      if(overall===true&&f.strainName){
        try{
          const allStrains=await db.strains.list();
          const existing=allStrains.find(s=>s.name&&s.name.toLowerCase()===f.strainName.toLowerCase());
          if(existing){
            await db.strains.upsert({...existing,thcaAvg:f.thca||existing.thcaAvg,thcAvg:f.thc||existing.thcAvg,cbdAvg:f.cbd||existing.cbdAvg,terpsAvg:f.totalTerpenes||existing.terpsAvg});
          }
        }catch(e){ console.error("Strain update failed:",e); }
      }

      autoPopulateStrains(f.strainName,{source:"QC Testing"});
      setForm(null);setFormSection("meta");setErr("");setConfirmModal(null);
    }catch(e){ setErr("Save failed: "+e.message); setConfirmModal(m=>m?{...m,busy:false}:null); }
  }
  async function remove(id){
    try{ await db.qc_tests.delete(id); setTests(p=>p.filter(x=>x.id!==id)); }
    catch(e){ setErr("Delete failed: "+e.message); }
  }

  // ── Sign & Finalize a COA ──
  // Durably archives the result data used to justify a release decision --
  // the source data, not just the decision -- mirroring GMPHub.jsx's
  // sop/deviation signing (see SignToConfirmModal.jsx). Once signed,
  // private.lock_finalized_qc_test blocks further edits to the row.
  function buildQcTestPdf(t){
    const doc=new jsPDF();
    let y=16;
    doc.setFontSize(15); doc.setFont(undefined,"bold");
    doc.text("Certificate of Analysis — Result Record",14,y);
    y+=8;
    doc.setFont(undefined,"bold"); doc.text(t.strainName||t.batchName||"Untitled sample",14,y); doc.setFont(undefined,"normal");
    y+=6;
    doc.setFontSize(10);
    doc.text(`Sample ${t.sampleId||"—"} · ${t.labName||"lab not recorded"} · Received ${fmtD(t.receivedDate)}`,14,y);
    y+=8;
    doc.setFontSize(9);
    const section=(label,pairs)=>{
      doc.setFont(undefined,"bold"); doc.text(label,14,y); doc.setFont(undefined,"normal");
      y+=5;
      doc.text(pairs.map(([k,v])=>`${k}: ${v}`).join("   "),14,y);
      y+=8;
    };
    section("Cannabinoids",[["THCa",t.thca],["THC",t.thc],["CBDa",t.cbda],["CBD",t.cbd],["Total Cannabinoids",t.totalCannabinoids]].map(([k,v])=>[k,v!=null&&v!==""?v+"%":"—"]));
    section("Terpenes",[["Total Terpenes",t.totalTerpenes]].map(([k,v])=>[k,v!=null&&v!==""?v+"%":"—"]));
    section("Microbial panel",[["TYAM",t.tyam],["TAB",t.tab],["Aspergillus",pf(t.aspergillus)],["Salmonella",pf(t.salmonella)],["STEC",pf(t.stec)],["E. coli",pf(t.ecoli)],["Overall microbial",pf(t.microbialPass)]]);
    section("Other panels",[["Pesticides",pf(t.pesticidesPass)],["Heavy metals",pf(t.heavyMetalsPass)],["Foreign matter",pf(t.foreignMatterPass)],["Water activity",t.waterActivity||"—"],["Moisture %",t.moistureContent||"—"]]);
    doc.setFont(undefined,"bold"); doc.text("Overall result: "+pf(t.overallPass),14,y); doc.setFont(undefined,"normal");
    y+=8;
    if(t.notes){ doc.text("Notes:",14,y); y+=5; doc.text(doc.splitTextToSize(t.notes,180),14,y); }
    return doc;
  }
  function openQcTestFinalization(t){
    setSigningModal({
      title:"Sign & Finalize COA",
      description:`Signing locks the result data for "${t.strainName||t.batchName||t.sampleId||"this sample"}" as final. It can no longer be edited afterward.`,
      documentType:"qc_test",
      documentId:t.id,
      documentLabel:(t.strainName||t.batchName||"Sample")+(t.sampleId?" ("+t.sampleId+")":""),
      buildPdf:()=>buildQcTestPdf(t),
      onSigned:async()=>{
        try{
          const lockedAt=new Date().toISOString();
          const saved=await db.qc_tests.update(t.id,{lockedAt});
          saved.batchId=t.batchId;
          setTests(p=>p.map(x=>x.id===t.id?{...x,...saved}:x));
          if(form?.id===t.id) setForm(f=>({...f,lockedAt}));
          setErr("");
        }catch(e){ setErr("Finalize failed: "+e.message); }
      },
    });
  }

  const failedCount=tests.filter(t=>t.overallPass===false).length;
  // No status column exists on qc_tests — derive directly from the real
  // persisted date fields rather than a value that never survives a save.
  const pendingCount=tests.filter(t=>!t.receivedDate).length;

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading QC tests…</div>);

  return(
    <>
      <style>{CSS}</style>
      <div className="qc-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>QC & Lab Testing</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Full COA panel tracking — failed microbial tests auto-flag to Remediation and hold Sales availability</div>
          </div>
          {!form&&<button className="qc-btn qc-primary" onClick={()=>setForm({...EMPTY})}>+ New test submission</button>}
        </div>

        {(failedCount>0||pendingCount>0)&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {failedCount>0&&<div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--danger)",fontWeight:500}}>⛔ {failedCount} batch{failedCount>1?"es":""} failed — on hold from sales & flagged for remediation</div>}
            {pendingCount>0&&<div style={{background:"rgba(200,150,58,0.08)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"10px 14px",fontSize:12,color:"var(--amber)",fontWeight:500}}>⏳ {pendingCount} sample{pendingCount>1?"s":""} awaiting lab results</div>}
          </div>
        )}

        {form&&(
          <div className="qc-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit Test Record":"New COA / Lab Test Record"}</div>
            <div style={{display:"flex",gap:2,background:"var(--surface-2)",borderRadius:8,padding:3,marginBottom:14}}>
              {[["meta","📋 Sample Info"],["cannabinoids","🔬 Cannabinoids"],["terpenes","🌿 Terpenes"],["microbial","🦠 Microbial"],["other","⚗️ Other Panels"]].map(([v,l])=>(
                <button key={v} style={{flex:1,padding:"6px 4px",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:500,color:formSection===v?"var(--text)":"var(--text-2)",background:formSection===v?"var(--surface)":"none",boxShadow:formSection===v?"0 1px 3px rgba(0,0,0,0.15)":"none"}} onClick={()=>setFormSection(v)}>{l}</button>
              ))}
            </div>

            {formSection==="meta"&&(
              <>
                {form.id&&!form.batchId&&(
                  <div style={{background:"rgba(90,63,160,0.08)",border:"1px solid rgba(90,63,160,0.3)",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#9080f0"}}>
                    📥 <strong>COA Import</strong> — This record was imported from a lab PDF. Batch linkage is optional; cannabinoid and terpene data is on the next tabs. If a passing result is saved, a harvest batch will be auto-created and the strain catalogue updated.
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="qc-lbl">Source type</label><select className="qc-sel" value={form.batchType} onChange={e=>setForm(f=>({...f,batchType:e.target.value,batchId:"",batchName:"",strainName:""}))}>
                    <option value="harvest">Harvest Batch</option><option value="production">Production Batch</option>
                  </select></div>
                  <div><label className="qc-lbl">Batch</label><select className="qc-sel" value={form.batchId} onChange={e=>selectBatch(e.target.value)}>
                    <option value="">— Select batch —</option>
                    {batchOptions.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
                  </select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="qc-lbl">Strain</label><input className="qc-inp" value={form.strainName} onChange={e=>setF("strainName",e.target.value)} /></div>
                  <div><label className="qc-lbl">Sample ID / CoC #</label><input className="qc-inp" value={form.sampleId} onChange={e=>setF("sampleId",e.target.value)} placeholder="Lab sample reference" /></div>
                  <div><label className="qc-lbl">Lab name</label><input className="qc-inp" value={form.labName} onChange={e=>setF("labName",e.target.value)} placeholder="e.g. Green Analytics, Kaycha Labs NY" /></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div><label className="qc-lbl">Sample submitted</label><input type="date" className="qc-inp" value={form.submittedDate} onChange={e=>setF("submittedDate",e.target.value)} /></div>
                  <div><label className="qc-lbl">Expected return</label><input type="date" className="qc-inp" value={form.expectedDate} onChange={e=>setF("expectedDate",e.target.value)} /></div>
                  <div><label className="qc-lbl">COA received</label><input type="date" className="qc-inp" value={form.receivedDate} onChange={e=>setF("receivedDate",e.target.value)} /></div>
                </div>
              </>
            )}

            {formSection==="cannabinoids"&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {CANNABINOIDS.map(k=>(
                  <div key={k}><label className="qc-lbl">{CANNABINOID_LABELS[k]}</label><input type="number" step="0.01" className="qc-inp" value={form[k]} onChange={e=>setF(k,e.target.value)} /></div>
                ))}
              </div>
            )}

            {formSection==="terpenes"&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {TERPENES.map(k=>(
                  <div key={k}><label className="qc-lbl">{TERP_LABELS[k]}</label><input type="number" step="0.001" className="qc-inp" value={form[k]} onChange={e=>setF(k,e.target.value)} /></div>
                ))}
              </div>
            )}

            {formSection==="microbial"&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="qc-lbl">TYAM CFU/g (Total Yeast & Mold)</label><input type="number" className="qc-inp" value={form.tyam} onChange={e=>setF("tyam",e.target.value)} /></div>
                  <div><label className="qc-lbl">TAB CFU/g (Total Aerobic Bacteria)</label><input type="number" className="qc-inp" value={form.tab} onChange={e=>setF("tab",e.target.value)} /></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
                  <PFField label="Aspergillus" value={form.aspergillus} onChange={v=>setF("aspergillus",v)} />
                  <PFField label="Salmonella" value={form.salmonella} onChange={v=>setF("salmonella",v)} />
                  <PFField label="STEC (E. coli O157)" value={form.stec} onChange={v=>setF("stec",v)} />
                  <PFField label="E. coli" value={form.ecoli} onChange={v=>setF("ecoli",v)} />
                </div>
                <PFField label="Overall microbial panel result" value={form.microbialPass} onChange={v=>setF("microbialPass",v)} />
                {form.microbialPass===false&&<div style={{marginTop:8,fontSize:12,color:"var(--danger)",fontWeight:500}}>⚠ Microbial fail will auto-flag this batch for radiation remediation and hold it from sales.</div>}
              </>
            )}

            {formSection==="other"&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <PFField label="Pesticide residues" value={form.pesticidesPass} onChange={v=>setF("pesticidesPass",v)} />
                  <PFField label="Heavy metals" value={form.heavyMetalsPass} onChange={v=>setF("heavyMetalsPass",v)} />
                  <PFField label="Foreign matter" value={form.foreignMatterPass} onChange={v=>setF("foreignMatterPass",v)} />
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="qc-lbl">Water activity (Aw)</label><input type="number" step="0.001" className="qc-inp" value={form.waterActivity} onChange={e=>setF("waterActivity",e.target.value)} placeholder="e.g. 0.58" /></div>
                  <div><label className="qc-lbl">Moisture content %</label><input type="number" step="0.1" className="qc-inp" value={form.moistureContent} onChange={e=>setF("moistureContent",e.target.value)} /></div>
                </div>
                <PFField label="Overall result (auto-calculated if left as N/T)" value={form.overallPass} onChange={v=>setF("overallPass",v)} />
                <div style={{marginTop:10}}><label className="qc-lbl">Notes</label><textarea className="qc-inp" rows={3} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
              </>
            )}

            {form.lockedAt&&(
              <div style={{fontSize:11,color:"var(--text-3)",margin:"8px 0"}}>
                🔒 Signed & finalized {fmtD(form.lockedAt)} — result data is locked and cannot be edited.
              </div>
            )}
            {err&&<div style={{fontSize:12,color:"var(--danger)",margin:"8px 0"}}>{err}</div>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="qc-btn qc-primary" disabled={!!form.lockedAt} onClick={save}>{form.id?"Save changes":"Save test record"}</button>
              {form.id&&!form.lockedAt&&(
                <button className="qc-btn qc-edit" disabled={form.overallPass===null||form.overallPass===undefined} onClick={()=>openQcTestFinalization(form)} title={form.overallPass===null||form.overallPass===undefined?"Set an overall result before signing":undefined}>Sign & Finalize COA</button>
              )}
              <button className="qc-btn qc-secondary" onClick={()=>{setForm(null);setFormSection("meta");setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&(
          <div className="qc-card">
            {tests.length===0?(
              <div style={{textAlign:"center",padding:"40px",color:"var(--text-3)"}}>
                <div style={{fontSize:28,marginBottom:8}}>🔬</div>
                <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>No test submissions yet</div>
                <div style={{fontSize:11}}>Create a record when you send a sample to the lab — update it when COA results come back</div>
              </div>
            ):(
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="qc-tbl">
                  <thead><tr><th>Batch / Strain</th><th>Sample ID</th><th>Lab</th><th>Submitted</th><th>Received</th><th>THCa %</th><th>Total Terps %</th><th>Microbial</th><th>Pesticides</th><th>Overall</th><th></th></tr></thead>
                  <tbody>
                    {[...tests].sort((a,b)=>new Date(b.submittedDate)-new Date(a.submittedDate)).map(t=>(
                      <tr key={t.id}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{t.strainName||t.batchName}<br/><span style={{fontSize:10,color:"var(--text-3)",fontWeight:400}}>{t.batchType}</span></td>
                        <td style={{fontFamily:"monospace",fontSize:11}}>{t.sampleId||"—"}</td>
                        <td style={{fontSize:11}}>{t.labName||"—"}</td>
                        <td>{fmtD(t.submittedDate)}</td>
                        <td>{t.receivedDate?fmtD(t.receivedDate):<span style={{color:"var(--amber)",fontSize:11}}>Pending</span>}</td>
                        <td style={{fontWeight:500,color:"var(--accent-2)"}}>{t.thca?t.thca+"%":"—"}</td>
                        <td>{t.totalTerpenes?t.totalTerpenes+"%":"—"}</td>
                        <td style={{color:pfColor(t.microbialPass)}}>{pf(t.microbialPass)}</td>
                        <td style={{color:pfColor(t.pesticidesPass)}}>{pf(t.pesticidesPass)}</td>
                        <td><span className={"qc-pill "+(t.overallPass===true?"qc-pass":t.overallPass===false?"qc-fail":"qc-pending")}>{t.overallPass===true?"PASS":t.overallPass===false?"FAIL":"Pending"}</span>{t.lockedAt&&<span title={"Signed & finalized "+fmtD(t.lockedAt)} style={{marginLeft:5}}>🔒</span>}</td>
                        <td><div style={{display:"flex",gap:5}}>
                          <button className="qc-sm qc-edit" onClick={()=>{setForm({...t});setFormSection(t.batchId?"meta":"cannabinoids");}}>Edit</button>
                          <button className="qc-sm qc-del" onClick={()=>remove(t.id)}>✕</button>
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
      {confirmModal&&(()=>{
        const f=confirmModal.form;
        const panelRows=[
          ["Microbial panel",f.microbialPass],
          ["Pesticides",f.pesticidesPass],
          ["Heavy metals",f.heavyMetalsPass],
          ["Foreign matter",f.foreignMatterPass],
          ["Aspergillus",f.aspergillus],
          ["Salmonella",f.salmonella],
          ["STEC",f.stec],
          ["E. coli",f.ecoli],
        ].filter(([,v])=>v!==null&&v!==undefined);
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>{if(!confirmModal.busy) setConfirmModal(null);}}>
            <div className="qc-card" style={{width:480,maxWidth:"92vw",margin:0,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text)",marginBottom:4}}>Confirm before saving</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
                {f.strainName||f.batchName||f.sampleId||"This sample"} — double-check these entered values before they take effect. A wrong result here can release a bad batch or block a good one.
              </div>
              <div className="qc-box">
                <div className="qc-box-t">Overall result</div>
                <span className="qc-pill" style={{background:confirmModal.overall?"rgba(74,124,89,0.2)":"rgba(200,74,74,0.15)",color:confirmModal.overall?"var(--accent-2)":"var(--danger)",fontSize:13,padding:"5px 12px"}}>
                  {confirmModal.overall?"PASS":"FAIL"}
                </span>
                {confirmModal.overall===false&&<div style={{fontSize:11,color:"var(--danger)",marginTop:8}}>This will place the batch on hold and block it from sale.</div>}
              </div>
              {panelRows.length>0&&(
                <div className="qc-box">
                  <div className="qc-box-t">Panel results entered</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {panelRows.map(([label,v])=>(
                      <div key={label} style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                        <span style={{color:"var(--text-2)"}}>{label}</span>
                        <span style={{color:pfColor(v),fontWeight:600}}>{pf(v)}</span>
                      </div>
                    ))}
                  </div>
                  {(f.tyam||f.tab)&&(
                    <div style={{display:"flex",gap:16,marginTop:8,paddingTop:8,borderTop:"1px solid var(--border)",fontSize:12}}>
                      {f.tyam&&<span style={{color:"var(--text-2)"}}>TYAM: <strong style={{color:"var(--text)"}}>{f.tyam}</strong></span>}
                      {f.tab&&<span style={{color:"var(--text-2)"}}>TAB: <strong style={{color:"var(--text)"}}>{f.tab}</strong></span>}
                    </div>
                  )}
                </div>
              )}
              {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{err}</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="qc-btn qc-primary" disabled={confirmModal.busy} onClick={async()=>{setConfirmModal(m=>({...m,busy:true})); await commitSave(f,confirmModal.overall);}}>{confirmModal.busy?"Saving…":"Confirm & save"}</button>
                <button className="qc-btn qc-secondary" disabled={confirmModal.busy} onClick={()=>setConfirmModal(null)}>Go back and review</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
