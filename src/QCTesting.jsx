import { useState, useEffect } from "react";
import { autoPopulateStrains } from "./strainUtils.js";

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
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
  const harvestBatches=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
  const prodBatches=JSON.parse(localStorage.getItem("resinops_prod")||"[]").filter(b=>!b.isLinked);

  const [tests,setTests]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_qc_tests")||"[]");}catch{return[];}});
  const [form,setForm]=useState(null);
  const [formSection,setFormSection]=useState("meta");
  const [err,setErr]=useState("");

  useEffect(()=>{
    localStorage.setItem("resinops_qc_tests",JSON.stringify(tests));
    // Sync pass/fail status to sales availability
    const fails=tests.filter(t=>t.overallPass===false).map(t=>t.batchId);
    localStorage.setItem("resinops_qc_holds",JSON.stringify(fails));
  },[tests]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  const batchOptions=form?.batchType==="harvest"
    ?harvestBatches.map(b=>({id:b.id,label:b.strainName+" ("+fmtD(b.d)+")",strain:b.strainName}))
    :prodBatches.map(b=>({id:b.id,label:b.name+" — "+b.catLabel,strain:b.strains||""}));

  function selectBatch(id){
    const src=batchOptions.find(b=>String(b.id)===String(id));
    setForm(f=>({...f,batchId:id,batchName:src?.label||"",strainName:src?.strain||""}));
  }

  function calcOverall(f){
    if(f.microbialPass===false||f.pesticidesPass===false||f.heavyMetalsPass===false||f.foreignMatterPass===false) return false;
    if(f.aspergillus===false||f.salmonella===false||f.stec===false||f.ecoli===false) return false;
    if(f.microbialPass===true&&f.pesticidesPass!==false&&f.heavyMetalsPass!==false) return true;
    return null;
  }

  function save(){
    // Allow imported COA records that have no linked batch — they use strainName + sampleId as identity
    const hasIdentity = form.batchId || form.batchName || form.strainName || form.sampleId;
    if(!hasIdentity){setErr("Provide at least a strain name or sample ID to save this record.");return;}
    const overall=form.overallPass??calcOverall(form);
    const rec={...form,id:form.id||"qc"+Date.now(),overallPass:overall,
      status:form.receivedDate?"complete":form.submittedDate?"submitted":"pending"};
    if(form.id) setTests(p=>p.map(x=>x.id===rec.id?rec:x));
    else setTests(p=>[...p,rec]);

    // Auto-trigger remediation flag if microbial fail
    if(overall===false&&(form.microbialPass===false||form.aspergillus===false)){
      const existingRem=JSON.parse(localStorage.getItem("resinops_remediation")||"[]");
      const alreadyFlagged=existingRem.some(r=>r.sourceId===String(form.batchId||form.sampleId));
      if(!alreadyFlagged){
        const newRem={id:"rm_auto_"+Date.now(),sourceType:form.batchType||"harvest",sourceId:String(form.batchId||form.sampleId||rec.id),strainName:form.strainName,weightG:"",labName:form.labName,labReportRef:form.sampleId,testDate:form.receivedDate||form.submittedDate||new Date().toISOString().split("T")[0],tyamCfu:form.tyam||"",tabCfu:form.tab||"",aspergillus:form.aspergillus===false,gyPerHour:"1000",turnRequired:true,status:"flagged",notes:"Auto-flagged from QC Testing — COA fail",dose:null};
        localStorage.setItem("resinops_remediation",JSON.stringify([...existingRem,newRem]));
      }
    }

    // ── Passing COA: auto-create completed harvest batch + update strain catalogue ──
    if(overall===true){
      // 1. Create a completed harvest batch if no existing batch is linked
      if(!form.batchId){
        const hb=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
        const alreadyExists=hb.some(b=>b.coaSampleId===form.sampleId);
        if(!alreadyExists){
          const newBatch={
            id:"hb_coa_"+Date.now(),
            strainName:form.strainName||"Unknown",
            d:form.receivedDate||form.submittedDate||new Date().toISOString().split("T")[0],
            status:"complete",
            coaSampleId:form.sampleId,
            labName:form.labName,
            thca:form.thca,
            thc:form.thc,
            totalTerpenes:form.totalTerpenes,
            notes:"Auto-created from passing COA import ("+( form.sampleId||"no sample ID")+")",
            source:"coa_import",
          };
          localStorage.setItem("resinops_harvest_batches",JSON.stringify([...hb,newBatch]));
        }
      } else {
        // Mark the linked harvest batch as complete
        const hb=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
        const updated=hb.map(b=>String(b.id)===String(form.batchId)?{...b,status:"complete",coaSampleId:form.sampleId,thca:form.thca||b.thca,thc:form.thc||b.thc,totalTerpenes:form.totalTerpenes||b.totalTerpenes}:b);
        localStorage.setItem("resinops_harvest_batches",JSON.stringify(updated));
      }

      // 2. Update strain catalogue with COA averages
      if(form.strainName){
        const strains=JSON.parse(localStorage.getItem("resinops_strains")||"[]");
        const idx=strains.findIndex(s=>s.name.toLowerCase()===form.strainName.toLowerCase());
        if(idx>=0){
          // Update averages on existing strain
          const s=strains[idx];
          strains[idx]={...s,
            thcaAvg:form.thca||s.thcaAvg,
            thcAvg:form.thc||s.thcAvg,
            cbdAvg:form.cbd||s.cbdAvg,
            terpsAvg:form.totalTerpenes||s.terpsAvg,
            lastCoaDate:form.receivedDate||form.submittedDate,
            lastCoaSampleId:form.sampleId,
          };
        } else {
          // Add new strain entry from COA data
          strains.push({
            id:"str_coa_"+Date.now(),
            name:form.strainName,
            type:"Unknown",parentage:"",breeder:"",
            thcaAvg:form.thca||"",thcAvg:form.thc||"",cbdAvg:form.cbd||"",
            terpsAvg:form.totalTerpenes||"",
            dominantTerpenes:[form.myrcene&&"Myrcene",form.limonene&&"Limonene",form.caryophyllene&&"Caryophyllene"].filter(Boolean).join(", "),
            lastCoaDate:form.receivedDate||form.submittedDate,
            lastCoaSampleId:form.sampleId,
            notes:"Auto-added from passing COA import",
            status:"active",salesDescription:"",
          });
        }
        localStorage.setItem("resinops_strains",JSON.stringify(strains));
      }
    }

    autoPopulateStrains(form.strainName,{source:"QC Testing"});
    setForm(null);setFormSection("meta");setErr("");
  }
  function remove(id){setTests(p=>p.filter(x=>x.id!==id));}

  const failedCount=tests.filter(t=>t.overallPass===false).length;
  const pendingCount=tests.filter(t=>t.status==="pending"||t.status==="submitted").length;

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

            {err&&<div style={{fontSize:12,color:"var(--danger)",margin:"8px 0"}}>{err}</div>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button className="qc-btn qc-primary" onClick={save}>{form.id?"Save changes":"Save test record"}</button>
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
                        <td><span className={"qc-pill "+(t.overallPass===true?"qc-pass":t.overallPass===false?"qc-fail":"qc-pending")}>{t.overallPass===true?"PASS":t.overallPass===false?"FAIL":"Pending"}</span></td>
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
    </>
  );
}
