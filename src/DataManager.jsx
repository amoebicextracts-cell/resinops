import { useState, useRef } from "react";
import * as XLSX from "xlsx";

// All localStorage keys that belong to ResinOps
const ALL_KEYS = [
  "resinops_spaces","resinops_grow_map","resinops_clone_sched",
  "resinops_harvest_batches","resinops_prod","resinops_remediation",
  "resinops_inventory","resinops_vendors","resinops_pos",
  "resinops_boms","resinops_cogs","resinops_skus","resinops_cult_costs",
  "resinops_equipment","resinops_equipment_service",
  "resinops_workorders","resinops_loto",
  "resinops_employees","resinops_shifts","resinops_signoffs",
  "resinops_sops","resinops_deviations",
  "resinops_cult_inputs","resinops_qc_tests","resinops_qc_holds",
  "resinops_pheno_hunts","resinops_strains",
  "resinops_presell","resinops_orders",
  "resinops_labor_types","resinops_facility","resinops_facility_settings",
  "resinops_facility_root_days","resinops_facility_veg_weeks",
  "resinops_presell_default",
];

function bytesToSize(b){ return b>1048576?(b/1048576).toFixed(1)+"MB":b>1024?(b/1024).toFixed(0)+"KB":b+"B"; }
function countRecords(data){
  let n=0;
  Object.values(data).forEach(v=>{ try{ const p=JSON.parse(v); if(Array.isArray(p)) n+=p.length; else if(p&&typeof p==="object") n+=1; }catch{} });
  return n;
}

// ── Import-target schemas for the AI to map to ──────────────────────────────
const IMPORT_TARGETS = {
  employees:{ label:"Employee Roster", icon:"👥", key:"resinops_employees",
    schema:"[{name, role, department, status, hireDate, phone, email, pestLicenseNum, pestLicenseCategory, pestLicenseExpiry}]" },
  equipment:{ label:"Equipment Registry", icon:"🔧", key:"resinops_equipment",
    schema:"[{name, cat, make, model, serial, assetTag, location, purchaseDate, purchasePrice, warrantyExpires, pmFreqDays, status}]" },
  inventory:{ label:"Inventory Items", icon:"📦", key:"resinops_inventory",
    schema:"[{n, cat, uom, reorderAt, reorderQty, vm, notes}]" },
  vendors:{ label:"Vendors", icon:"🏭", key:"resinops_vendors",
    schema:"[{n, vendorType, contact, phone, email, leadDays, notes}]" },
  strains:{ label:"Strain Database", icon:"🧬", key:"resinops_strains",
    schema:"[{name, type, parentage, breeder, thcaAvg, thcAvg, cbdAvg, terpsAvg, dominantTerpenes, avgYieldGPerSqft, avgFlowerWeeks, aroma, flavor, effectProfile, notes}]" },
  spaces:{ label:"Grow Spaces / Rooms", icon:"🗺️", key:"resinops_grow_map",
    schema:"[{name, type, sqft, canopy, maxPlants, lightType, lightCount, lightWatts, resetDays, status, sensorId}]" },
  qc_tests:{ label:"QC / Lab Test Results (COA)", icon:"🔬", key:"resinops_qc_tests",
    schema:"[{strainName, sampleId, labName, submittedDate, receivedDate, thca, thc, cbd, cbg, cbn, totalCannabinoids, totalTerpenes, myrcene, limonene, caryophyllene, tyam, tab, microbialPass, pesticidesPass, heavyMetalsPass, waterActivity, moistureContent, overallPass}]" },
  cult_inputs:{ label:"Cultivation Inputs / Spray Log", icon:"🌱", key:"resinops_cult_inputs",
    schema:"[{spaceName, date, type, product, manufacturer, epaRegNum, rate, rateUnit, volumeApplied, volumeUnit, areaApplied, rei, phi, applicationMethod, targetPest, weatherTemp, weatherWind, weatherHumidity, applicatorName}]" },
};

async function callClaude(prompt){
  const resp = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:4000,
      system:`You are a data import assistant for ResinOps, a cannabis operations platform. 
When given file contents, you must:
1. Identify what type of cannabis operations data it contains
2. Map and extract the data into the specified JSON schema
3. Return ONLY valid JSON - no markdown, no explanation, no backticks
Always return an object: { "detectedType": "employees|equipment|inventory|vendors|strains|spaces|qc_tests|cult_inputs|unknown", "confidence": 0-100, "summary": "one line description of what you found", "records": [...mapped array of objects...] }
If a field is not found in the source, omit it rather than using null.
For COA PDFs: extract all cannabinoid percentages (as numbers without % sign), terpene percentages, microbial results (as true/false for pass), sample ID, lab name, and dates.
For employee lists: map job titles to roles, departments based on context.
For spray logs: extract EPA reg numbers, rates, applicator names, dates, and target pests.`,
      messages:[{role:"user",content:prompt}]
    })
  });
  const data = await resp.json();
  const text = data.content?.map(b=>b.text||"").join("").trim();
  return JSON.parse(text);
}

const CSS=`
  .dm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .dm-tabs{display:flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:3px;margin-bottom:18px;}
  .dm-tab{flex:1;padding:7px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;}
  .dm-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.15);}
  .dm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:20px;margin-bottom:16px;}
  .dm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .dm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:8px 16px;}
  .dm-btn:hover{opacity:0.85;}
  .dm-primary{background:var(--accent);color:#fff;}
  .dm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .dm-danger{background:rgba(200,74,74,0.85);color:#fff;}
  .dm-ai{background:linear-gradient(135deg,#5a3fa0,#2d5a8a);color:#fff;}
  .dm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .dm-drop{border:2px dashed var(--border-2);border-radius:12px;padding:40px 24px;text-align:center;cursor:pointer;transition:border-color 0.15s;}
  .dm-drop:hover,.dm-drop.over{border-color:var(--accent);background:rgba(74,124,89,0.04);}
  .dm-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .dm-tbl th{text-align:left;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .dm-tbl td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-2);}
  .dm-tbl tr:last-child td{border-bottom:none;}
  .dm-step{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;margin-bottom:8px;}
  .dm-step-done{background:rgba(74,124,89,0.1);border:1px solid rgba(74,124,89,0.3);}
  .dm-step-active{background:rgba(90,60,160,0.1);border:1px solid rgba(90,60,160,0.3);}
  .dm-step-wait{background:var(--surface-2);border:1px solid var(--border);}
  .dm-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .conf-high{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .conf-mid{background:rgba(200,150,58,0.15);color:var(--amber);}
  .conf-low{background:rgba(200,74,74,0.15);color:var(--danger);}
`;

export default function DataManager(){
  const [tab,setTab]=useState("import");
  const [dragOver,setDragOver]=useState(false);
  const [importState,setImportState]=useState("idle"); // idle|reading|analyzing|preview|done|error
  const [importResult,setImportResult]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [importTarget,setImportTarget]=useState("");
  const [restoreConfirm,setRestoreConfirm]=useState(false);
  const [statusMsg,setStatusMsg]=useState("");
  const fileRef=useRef();
  const restoreRef=useRef();

  // ── Backup ───────────────────────────────────────────────────────────────
  function backup(){
    const settings=JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}");
    const facilityName=settings.facilityName||"ResinOps";
    const data={};
    ALL_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v) data[k]=v; });
    const payload=JSON.stringify({version:"1.0",exported:new Date().toISOString(),facility:facilityName,data},null,2);
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([payload],{type:"application/json"}));
    a.download=facilityName.replace(/\s+/g,"_")+"_ResinOps_Backup_"+new Date().toISOString().slice(0,10)+".json";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setStatusMsg("Backup downloaded ✓");
    setTimeout(()=>setStatusMsg(""),3000);
  }

  function restoreFromFile(file){
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const payload=JSON.parse(ev.target.result);
        if(!payload.data) throw new Error("Invalid backup file format");
        Object.entries(payload.data).forEach(([k,v])=>{ if(ALL_KEYS.includes(k)) localStorage.setItem(k,v); });
        setStatusMsg("Restore complete — "+Object.keys(payload.data).length+" data keys restored ✓");
        setRestoreConfirm(false);
        setTimeout(()=>{ setStatusMsg(""); window.location.reload(); },1500);
      }catch(e){ setStatusMsg("Restore failed: "+e.message); }
    };
    reader.readAsText(file);
  }

  // ── Storage stats ─────────────────────────────────────────────────────────
  function getStats(){
    let totalBytes=0;
    const keys=[];
    ALL_KEYS.forEach(k=>{
      const v=localStorage.getItem(k);
      if(v){ const b=new Blob([v]).size; totalBytes+=b; try{ const p=JSON.parse(v); keys.push({k,count:Array.isArray(p)?p.length:1,size:b}); }catch{} }
    });
    return{totalBytes,keys:keys.filter(x=>x.count>0).sort((a,b)=>b.count-a.count)};
  }
  const stats=getStats();

  // ── AI Import ─────────────────────────────────────────────────────────────
  async function processFile(file){
    setImportState("reading");
    setImportErr("");
    setImportResult(null);

    try{
      let content="";
      const ext=file.name.split(".").pop().toLowerCase();

      if(ext==="csv"||ext==="tsv"){
        content=await file.text();
        // Send first 200 rows max
        const lines=content.split("\n");
        content=lines.slice(0,201).join("\n");
      }
      else if(ext==="json"){
        content=await file.text();
        content=content.slice(0,30000);
      }
      else if(ext==="xlsx"||ext==="xls"){
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        content="EXCEL FILE — Sheet: "+wb.SheetNames[0]+"\n"+XLSX.utils.sheet_to_csv(ws).slice(0,20000);
      }
      else if(ext==="docx"){
        // Dynamically load mammoth browser build to avoid Vercel native-dep issues
        const mammoth=(await import("mammoth/mammoth.browser.js")).default;
        const buf=await file.arrayBuffer();
        const result=await mammoth.extractRawText({arrayBuffer:buf});
        content="WORD DOCUMENT:\n"+result.value.slice(0,20000);
      }
      else if(ext==="pdf"){
        // Extract text via pdfjs loaded from CDN
        if(!window.pdfjsLib){
          const script=document.createElement("script");
          script.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          await new Promise((res,rej)=>{ script.onload=res; script.onerror=rej; document.head.appendChild(script); });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const buf=await file.arrayBuffer();
        const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
        const pages=Math.min(pdf.numPages,15);
        let text="PDF DOCUMENT ("+pdf.numPages+" pages):\n";
        for(let i=1;i<=pages;i++){
          const page=await pdf.getPage(i);
          const tc=await page.getTextContent();
          text+=tc.items.map(it=>it.str).join(" ")+"\n";
        }
        content=text.slice(0,25000);
      }
      else{
        content=await file.text();
        content=content.slice(0,20000);
      }

      setImportState("analyzing");
      const targetSchema=importTarget?IMPORT_TARGETS[importTarget]?.schema:"auto-detect";
      const prompt=`File name: "${file.name}"
${importTarget?`User specified data type: ${IMPORT_TARGETS[importTarget]?.label}\nTarget schema: ${targetSchema}`:"Auto-detect the data type from the content."}

File contents:
---
${content}
---

Extract and map all records to the appropriate ResinOps schema. For cannabis COA lab reports, extract every cannabinoid and terpene percentage you can find. For employee/staff lists, extract all people. For spray logs or pesticide records, extract each application event as a separate record.`;

      const result=await callClaude(prompt);
      setImportResult({...result,fileName:file.name,fileType:ext});
      setImportState("preview");
    }catch(e){
      console.error(e);
      setImportErr("Import failed: "+e.message);
      setImportState("error");
    }
  }

  function confirmImport(){
    if(!importResult?.records?.length) return;
    const target=importTarget||importResult.detectedType;
    const tgt=IMPORT_TARGETS[target];
    if(!tgt){ setImportErr("Cannot identify where to save this data. Please select a data type above and re-analyze."); return; }
    try{
      const existing=JSON.parse(localStorage.getItem(tgt.key)||"[]");
      const newRecords=importResult.records.map(r=>({...r,id:r.id||"imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7)}));
      localStorage.setItem(tgt.key,JSON.stringify([...existing,...newRecords]));
      // Also populate strain database from COA imports
      if(target==="qc_tests"){
        const strains=JSON.parse(localStorage.getItem("resinops_strains")||"[]");
        const strainNames=new Set(strains.map(s=>s.name.toLowerCase()));
        const newStrains=newRecords.filter(r=>r.strainName&&!strainNames.has(r.strainName.toLowerCase())).map(r=>({id:"str_auto_"+Date.now()+Math.random(),name:r.strainName,type:"Hybrid",parentage:"",breeder:"",thcaAvg:r.thca||"",thcAvg:r.thc||"",cbdAvg:r.cbd||"",terpsAvg:r.totalTerpenes||"",dominantTerpenes:"",notes:"Auto-added from COA import",status:"active",salesDescription:""}));
        if(newStrains.length) localStorage.setItem("resinops_strains",JSON.stringify([...strains,...newStrains]));
      }
      setImportState("done");
      setStatusMsg(newRecords.length+" record"+(newRecords.length!==1?"s":"")+" imported to "+tgt.label+" ✓");
    }catch(e){ setImportErr("Save failed: "+e.message); }
  }

  function reset(){ setImportState("idle");setImportResult(null);setImportErr("");setImportTarget(""); }

  const stepStatus=(step)=>{
    const order=["idle","reading","analyzing","preview","done"];
    const cur=order.indexOf(importState);
    const s=order.indexOf(step);
    if(s<cur) return "done";
    if(s===cur) return "active";
    return "wait";
  };

  return(
    <>
      <style>{CSS}</style>
      <div className="dm-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Data & Imports</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>AI-powered universal import, data backup, and restore — onboard any facility in minutes</div>
        </div>
        {statusMsg&&<div style={{background:"rgba(74,124,89,0.1)",border:"1px solid rgba(74,124,89,0.3)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--accent-2)",fontWeight:500}}>{statusMsg}</div>}

        <div className="dm-tabs">
          {[["import","✨ AI Import"],["backup","💾 Backup & Restore"],["storage","📊 Storage"]].map(([v,l])=>(
            <button key={v} className={"dm-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── AI IMPORT ── */}
        {tab==="import"&&(
          <div className="dm-card">
            <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>Drop any file — CSV, Excel, PDF, Word</div>
            <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16}}>Claude reads your existing spreadsheets, lab COA PDFs, and documents and maps the data into ResinOps automatically. Works with Smartsheet exports, METRC reports, lab PDFs, staff lists — anything.</div>

            {/* Progress steps */}
            {importState!=="idle"&&(
              <div style={{marginBottom:16}}>
                {[["reading","📂 Reading file"],["analyzing","✨ AI analyzing & mapping"],["preview","👁 Preview — confirm before saving"],["done","✅ Import complete"]].map(([s,l])=>(
                  <div key={s} className={"dm-step dm-step-"+(stepStatus(s))}>
                    <span style={{fontSize:16}}>{stepStatus(s)==="done"?"✓":stepStatus(s)==="active"?"⏳":"○"}</span>
                    <span style={{fontSize:12,fontWeight:stepStatus(s)==="active"?600:400,color:stepStatus(s)==="active"?"var(--text)":"var(--text-3)"}}>{l}</span>
                    {stepStatus(s)==="active"&&s==="analyzing"&&<span style={{fontSize:11,color:"#9080f0",marginLeft:"auto"}}>Claude is reading your file...</span>}
                  </div>
                ))}
              </div>
            )}

            {importState==="idle"&&(
              <>
                <div style={{marginBottom:10}}>
                  <label className="dm-lbl">Data type (optional — leave blank for auto-detect)</label>
                  <select className="dm-inp" style={{cursor:"pointer"}} value={importTarget} onChange={e=>setImportTarget(e.target.value)}>
                    <option value="">Auto-detect from file content</option>
                    {Object.entries(IMPORT_TARGETS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div className={"dm-drop"+(dragOver?" over":"")}
                  onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
                  onClick={()=>fileRef.current.click()}>
                  <div style={{fontSize:36,marginBottom:8}}>📂</div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Drop your file here, or click to browse</div>
                  <div style={{fontSize:11,color:"var(--text-3)"}}>Supports: CSV, Excel (.xlsx), PDF (COAs, reports), Word (.docx), JSON</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginTop:4}}>Common imports: employee lists, COA PDFs, spray logs, strain databases, equipment lists, Smartsheet exports</div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.docx,.json,.txt" style={{display:"none"}} onChange={e=>{if(e.target.files[0])processFile(e.target.files[0]);e.target.value="";}} />
                </div>
              </>
            )}

            {importState==="error"&&(
              <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{importErr}</div>
                <button className="dm-btn dm-secondary" onClick={reset}>Try again</button>
              </div>
            )}

            {importState==="preview"&&importResult&&(
              <div>
                <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Detected type</div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{IMPORT_TARGETS[importResult.detectedType]?.label||importResult.detectedType}</div>
                  </div>
                  <div style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Records found</div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>{importResult.records?.length||0}</div>
                  </div>
                  <div style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Confidence</div>
                    <span className={"dm-pill "+(importResult.confidence>=75?"conf-high":importResult.confidence>=50?"conf-mid":"conf-low")}>{importResult.confidence}%</span>
                  </div>
                  <div style={{flex:1,fontSize:12,color:"var(--text-2)",fontStyle:"italic"}}>{importResult.summary}</div>
                </div>

                {importResult.records?.length>0&&(
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:14,maxHeight:320,overflowY:"auto"}}>
                    <table className="dm-tbl">
                      <thead><tr>{Object.keys(importResult.records[0]||{}).slice(0,8).map(k=><th key={k}>{k}</th>)}</tr></thead>
                      <tbody>
                        {importResult.records.slice(0,20).map((r,i)=>(
                          <tr key={i}>{Object.values(r).slice(0,8).map((v,j)=><td key={j} style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(v||"")}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                    {importResult.records.length>20&&<div style={{padding:"6px 10px",fontSize:11,color:"var(--text-3)"}}>Showing 20 of {importResult.records.length} records</div>}
                  </div>
                )}

                {importResult.confidence<60&&(
                  <div style={{background:"rgba(200,150,58,0.1)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"var(--amber)"}}>
                    Low confidence mapping. Review the preview carefully before importing. You can still import — just verify the data looks right in the table above.
                  </div>
                )}

                <div style={{display:"flex",gap:8}}>
                  <button className="dm-btn dm-primary" onClick={confirmImport}>Import {importResult.records?.length||0} records</button>
                  <button className="dm-btn dm-secondary" onClick={reset}>Cancel / start over</button>
                </div>
              </div>
            )}

            {importState==="done"&&(
              <div style={{textAlign:"center",padding:32}}>
                <div style={{fontSize:40,marginBottom:10}}>✅</div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Import complete</div>
                <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16}}>{statusMsg}</div>
                <button className="dm-btn dm-primary" onClick={reset}>Import another file</button>
              </div>
            )}
          </div>
        )}

        {/* ── BACKUP & RESTORE ── */}
        {tab==="backup"&&(
          <>
            <div className="dm-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Export full data backup</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>Downloads all ResinOps data as a single JSON file. Store it somewhere safe — this is your only protection against browser data loss until the V2 cloud backend is live.</div>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
                <div style={{flex:1,background:"var(--surface-2)",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Total data size</div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{bytesToSize(stats.totalBytes)}</div>
                </div>
                <div style={{flex:1,background:"var(--surface-2)",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Total records</div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{stats.keys.reduce((a,k)=>a+k.count,0)}</div>
                </div>
              </div>
              <button className="dm-btn dm-primary" onClick={backup}>↓ Download backup now</button>
              <div style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>⚠ Recommended: back up before every major import or after a heavy data-entry session.</div>
            </div>

            <div className="dm-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Restore from backup</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>Uploads a previously downloaded backup file and restores all data. <strong>This will merge with existing data</strong> — it will not delete records that are already there.</div>
              {!restoreConfirm?(
                <button className="dm-btn dm-secondary" onClick={()=>setRestoreConfirm(true)}>Restore from backup file…</button>
              ):(
                <div style={{background:"rgba(200,150,58,0.08)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:12,color:"var(--amber)",marginBottom:10}}>Select your backup JSON file. Data will be merged with what's currently in the app.</div>
                  <div style={{display:"flex",gap:8}}>
                    <label className="dm-btn dm-primary" style={{cursor:"pointer"}}>
                      Choose backup file
                      <input ref={restoreRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>{if(e.target.files[0])restoreFromFile(e.target.files[0]);e.target.value="";}} />
                    </label>
                    <button className="dm-btn dm-secondary" onClick={()=>setRestoreConfirm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── STORAGE ── */}
        {tab==="storage"&&(
          <div className="dm-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Data storage breakdown</div>
            <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
              <table className="dm-tbl">
                <thead><tr><th>Module / data store</th><th>Records</th><th>Size</th></tr></thead>
                <tbody>{stats.keys.map(k=>(
                  <tr key={k.k}>
                    <td style={{fontFamily:"monospace",fontSize:11}}>{k.k.replace("resinops_","")}</td>
                    <td>{k.count}</td>
                    <td>{bytesToSize(k.size)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{marginTop:12,fontSize:11,color:"var(--text-3)"}}>Total: {bytesToSize(stats.totalBytes)} across {stats.keys.length} data stores. localStorage limit is typically 5–10MB per browser.</div>
          </div>
        )}
      </div>
    </>
  );
}
