import { useState, useEffect } from "react";

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}

const CSS=`
  .sd-wrap{padding:24px;flex:1;overflow-y:auto;}
  .sd-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .sd-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .sd-inp:focus{outline:none;border-color:var(--accent);}
  .sd-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .sd-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .sd-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .sd-btn:hover{opacity:0.85;}
  .sd-primary{background:var(--accent);color:#fff;}
  .sd-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .sd-ai{background:linear-gradient(135deg,#5a3fa0,#2d5a8a);color:#fff;}
  .sd-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .sd-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .sd-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .sd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:14px;}
  .sd-strain-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:16px;cursor:pointer;transition:border-color 0.15s;}
  .sd-strain-card:hover{border-color:var(--accent);}
  .sd-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;display:inline-block;}
  .type-indica{background:rgba(90,60,180,0.2);color:#9080f0;}
  .type-sativa{background:rgba(200,140,40,0.2);color:var(--amber);}
  .type-hybrid{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sd-desc{font-size:12px;color:var(--text-2);line-height:1.6;white-space:pre-wrap;background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-top:8px;}
  .sd-ai-generating{font-size:12px;color:#9080f0;font-style:italic;padding:12px 0;}
`;

const EMPTY_STRAIN={
  name:"",type:"Hybrid",parentage:"",breeder:"",
  thcaAvg:"",thcAvg:"",cbdAvg:"",terpsAvg:"",dominantTerpenes:"",
  avgYieldGPerSqft:"",avgFlowerWeeks:"",
  aroma:"",flavor:"",effectProfile:"",
  notes:"",salesDescription:"",
  linkedPhenoHuntId:"",status:"active",
};

async function generateDescription(strain){
  const prompt=`You are an expert cannabis copywriter and strain analyst. Using the following data, write a compelling, professional strain description for sales and marketing use. Keep it accurate, evocative, and under 200 words. Do not invent data — only describe what is provided.

Strain: ${strain.name}
Type: ${strain.type}
Parentage: ${strain.parentage||"Unknown"}
Breeder: ${strain.breeder||"Unknown"}
Average THCa: ${strain.thcaAvg||"N/A"}%
Average THC: ${strain.thcAvg||"N/A"}%
Average CBD: ${strain.cbdAvg||"N/A"}%
Average Total Terpenes: ${strain.terpsAvg||"N/A"}%
Dominant Terpenes: ${strain.dominantTerpenes||"Not specified"}
Average Yield (g/sqft): ${strain.avgYieldGPerSqft||"N/A"}
Average Flower Time: ${strain.avgFlowerWeeks||"N/A"} weeks
Aroma Profile: ${strain.aroma||"Not specified"}
Flavor Profile: ${strain.flavor||"Not specified"}
Effect Profile: ${strain.effectProfile||"Not specified"}
Additional Notes: ${strain.notes||"None"}

Write the strain description now:`;

  const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:400,messages:[{role:"user",content:prompt}]})});
  const data=await resp.json();
  return data.content?.map(b=>b.text).join("")||"";
}

export default function StrainDatabase(){
  const harvestBatches=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
  const prodBatches=JSON.parse(localStorage.getItem("resinops_prod")||"[]").filter(b=>!b.isLinked);
  const phenoHunts=JSON.parse(localStorage.getItem("resinops_pheno_hunts")||"[]");

  const [strains,setStrains]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_strains")||"[]");}catch{return[];}});
  const [form,setForm]=useState(null);
  const [activeId,setActiveId]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [search,setSearch]=useState("");
  const [err,setErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_strains",JSON.stringify(strains));},[strains]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const activeStrain=strains.find(s=>s.id===activeId);

  // Pull harvest + production data for this strain
  function aggregateData(strainName){
    const hbs=harvestBatches.filter(b=>b.strainName?.toLowerCase()===strainName?.toLowerCase());
    const pbs=prodBatches.filter(b=>b.strains?.toLowerCase()?.includes(strainName?.toLowerCase()));
    const dryWeights=hbs.map(b=>b.totalDryWeight||0).filter(Boolean);
    const avgDryG=dryWeights.length?Math.round(dryWeights.reduce((a,v)=>a+v)/dryWeights.length):null;
    return{harvestBatchCount:hbs.length,prodBatchCount:pbs.length,avgDryWeightG:avgDryG};
  }

  async function handleGenerateDescription(){
    if(!form) return;
    setGenerating(true);
    try{
      const desc=await generateDescription(form);
      setForm(f=>({...f,salesDescription:desc}));
    }catch(e){setErr("AI generation failed — check API connection.");}
    finally{setGenerating(false);}
  }

  function save(){
    if(!form.name.trim()){setErr("Enter a strain name.");return;}
    const s={...form,id:form.id||"str"+Date.now()};
    if(form.id) setStrains(p=>p.map(x=>x.id===s.id?s:x));
    else setStrains(p=>[...p,s]);
    setForm(null);setErr("");
  }
  function remove(id){setStrains(p=>p.filter(x=>x.id!==id));if(activeId===id)setActiveId(null);}

  // Import keeper phenos as strains
  function importFromPheno(hunt,seed){
    const existing=strains.find(s=>s.name.toLowerCase()===hunt.strainName.toLowerCase());
    const base=existing||{...EMPTY_STRAIN,name:hunt.strainName,breeder:hunt.breeder||"",id:"str"+Date.now()};
    setForm({...base,
      thcaAvg:seed.coaTHCa||base.thcaAvg,
      thcAvg:seed.coaTHC||base.thcAvg,
      cbdAvg:seed.coaCBD||base.cbdAvg,
      terpsAvg:seed.coaTerps||base.terpsAvg,
      linkedPhenoHuntId:hunt.id,
      notes:base.notes+(seed.observations?"\nPheno #"+seed.phenoNum+" notes: "+seed.observations:""),
    });
  }

  const filtered=strains.filter(s=>!search||s.name.toLowerCase().includes(search.toLowerCase()));
  const keeperPhenos=phenoHunts.flatMap(h=>(h.seeds||[]).filter(s=>s.isKeeper).map(s=>({hunt:h,seed:s})));

  return(
    <>
      <style>{CSS}</style>
      <div className="sd-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Strain Database</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Strain registry with parentage, aggregated cultivation & processing data, and AI-generated descriptions</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {activeId&&<button className="sd-btn sd-secondary" onClick={()=>{setActiveId(null);setForm(null);}}>← All strains</button>}
            {!form&&!activeId&&<button className="sd-btn sd-primary" onClick={()=>setForm({...EMPTY_STRAIN})}>+ Add strain</button>}
          </div>
        </div>

        {/* Import from keeper phenos */}
        {keeperPhenos.length>0&&!activeId&&!form&&(
          <div className="sd-card" style={{background:"rgba(90,63,160,0.06)",border:"1px solid rgba(90,63,160,0.2)"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#9080f0",marginBottom:8}}>🏆 Keeper phenos ready to add to strain database</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {keeperPhenos.map(({hunt,seed})=>(
                <button key={seed.id} className="sd-btn sd-secondary" style={{fontSize:11}} onClick={()=>importFromPheno(hunt,seed)}>
                  {hunt.strainName} #{seed.phenoNum} {seed.coaTHCa?`(${seed.coaTHCa}% THCa)`:""}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Strain form */}
        {form&&(
          <div className="sd-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit strain":"Add strain"}</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="sd-lbl">Strain name</label><input className="sd-inp" value={form.name} onChange={e=>setF("name",e.target.value)} /></div>
              <div><label className="sd-lbl">Type</label><select className="sd-sel" value={form.type} onChange={e=>setF("type",e.target.value)}><option>Indica</option><option>Sativa</option><option>Hybrid</option><option>Indica-dominant</option><option>Sativa-dominant</option></select></div>
              <div><label className="sd-lbl">Status</label><select className="sd-sel" value={form.status} onChange={e=>setF("status",e.target.value)}><option value="active">Active</option><option value="retired">Retired</option><option value="testing">In Testing</option></select></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="sd-lbl">Parentage / genetics</label><input className="sd-inp" value={form.parentage} onChange={e=>setF("parentage",e.target.value)} placeholder="e.g. OG Kush × Girl Scout Cookies" /></div>
              <div><label className="sd-lbl">Breeder / seed bank</label><input className="sd-inp" value={form.breeder} onChange={e=>setF("breeder",e.target.value)} /></div>
            </div>
            <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Average COA Data (from lab results)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 2fr",gap:10}}>
                <div><label className="sd-lbl">THCa %</label><input type="number" step="0.01" className="sd-inp" value={form.thcaAvg} onChange={e=>setF("thcaAvg",e.target.value)} /></div>
                <div><label className="sd-lbl">THC %</label><input type="number" step="0.01" className="sd-inp" value={form.thcAvg} onChange={e=>setF("thcAvg",e.target.value)} /></div>
                <div><label className="sd-lbl">CBD %</label><input type="number" step="0.01" className="sd-inp" value={form.cbdAvg} onChange={e=>setF("cbdAvg",e.target.value)} /></div>
                <div><label className="sd-lbl">Total terps %</label><input type="number" step="0.01" className="sd-inp" value={form.terpsAvg} onChange={e=>setF("terpsAvg",e.target.value)} /></div>
                <div><label className="sd-lbl">Dominant terpenes (comma-separated)</label><input className="sd-inp" value={form.dominantTerpenes} onChange={e=>setF("dominantTerpenes",e.target.value)} placeholder="Myrcene, Limonene, Caryophyllene" /></div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="sd-lbl">Avg yield (g / sq ft canopy)</label><input type="number" step="0.1" className="sd-inp" value={form.avgYieldGPerSqft} onChange={e=>setF("avgYieldGPerSqft",e.target.value)} /></div>
              <div><label className="sd-lbl">Avg flower time (weeks)</label><input type="number" step="0.5" className="sd-inp" value={form.avgFlowerWeeks} onChange={e=>setF("avgFlowerWeeks",e.target.value)} /></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="sd-lbl">Aroma profile</label><input className="sd-inp" value={form.aroma} onChange={e=>setF("aroma",e.target.value)} placeholder="Earthy, diesel, pine…" /></div>
              <div><label className="sd-lbl">Flavor profile</label><input className="sd-inp" value={form.flavor} onChange={e=>setF("flavor",e.target.value)} placeholder="Sweet, citrus, spicy…" /></div>
              <div><label className="sd-lbl">Effect profile</label><input className="sd-inp" value={form.effectProfile} onChange={e=>setF("effectProfile",e.target.value)} placeholder="Relaxing, euphoric, creative…" /></div>
            </div>
            <div style={{marginBottom:10}}><label className="sd-lbl">Notes (cultivation observations, SOPs, etc.)</label><textarea className="sd-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>

            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <label className="sd-lbl" style={{margin:0}}>Sales & marketing description</label>
                <button className="sd-btn sd-ai" style={{fontSize:11,padding:"4px 12px"}} onClick={handleGenerateDescription} disabled={generating}>
                  {generating?"✨ Generating…":"✨ Generate with AI"}
                </button>
              </div>
              {generating&&<div className="sd-ai-generating">Generating description from COA data and strain profile…</div>}
              <textarea className="sd-inp" rows={5} style={{resize:"vertical"}} value={form.salesDescription} onChange={e=>setF("salesDescription",e.target.value)} placeholder="Enter manually or click Generate with AI to draft from your COA data and strain notes" />
            </div>

            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="sd-btn sd-primary" onClick={save}>{form.id?"Save changes":"Add to database"}</button>
              {!generating&&<button className="sd-btn sd-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>}
            </div>
          </div>
        )}

        {/* Strain list */}
        {!form&&!activeId&&(
          <>
            {strains.length>0&&<div style={{marginBottom:12}}><input className="sd-inp" style={{maxWidth:280}} placeholder="Search strains…" value={search} onChange={e=>setSearch(e.target.value)} /></div>}
            {filtered.length===0&&strains.length===0&&(
              <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:10}}>🌿</div>
                <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No strains in database yet</div>
                <div style={{fontSize:12,color:"var(--text-3)"}}>Add strains manually or import keeper phenos from the Pheno Hunt Tracker — all cultivation and production data aggregates here automatically</div>
              </div>
            )}
            <div className="sd-grid">
              {filtered.map(s=>{
                const agg=aggregateData(s.name);
                return(
                  <div key={s.id} className="sd-strain-card" onClick={()=>setActiveId(s.id)}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                      <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{s.name}</div>
                      <span className={"sd-pill type-"+s.type.toLowerCase().split("-")[0]}>{s.type}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--text-3)",marginBottom:8}}>{s.breeder||"Unknown breeder"}{s.parentage?" · "+s.parentage:""}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      {s.thcaAvg&&<div><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>THCa</div><div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>{s.thcaAvg}%</div></div>}
                      {s.terpsAvg&&<div><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Terps</div><div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>{s.terpsAvg}%</div></div>}
                      {agg.harvestBatchCount>0&&<div><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Harvests</div><div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{agg.harvestBatchCount}</div></div>}
                    </div>
                    {s.dominantTerpenes&&<div style={{fontSize:10,color:"var(--text-3)",marginTop:6}}>{s.dominantTerpenes}</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Strain detail */}
        {activeStrain&&!form&&(()=>{
          const agg=aggregateData(activeStrain.name);
          const linkedHunt=phenoHunts.find(h=>h.id===activeStrain.linkedPhenoHuntId);
          return(
            <div className="sd-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--text)"}}>{activeStrain.name} <span className={"sd-pill type-"+activeStrain.type.toLowerCase().split("-")[0]} style={{verticalAlign:"middle"}}>{activeStrain.type}</span></div>
                  <div style={{fontSize:12,color:"var(--text-3)",marginTop:2}}>{activeStrain.breeder||"Unknown breeder"}{activeStrain.parentage?" · "+activeStrain.parentage:""}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="sd-sm sd-edit" onClick={()=>setForm({...activeStrain})}>Edit</button>
                  <button className="sd-sm sd-del" onClick={()=>remove(activeStrain.id)}>Delete</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
                {[{l:"THCa %",v:activeStrain.thcaAvg},{l:"THC %",v:activeStrain.thcAvg},{l:"CBD %",v:activeStrain.cbdAvg},{l:"Total terps %",v:activeStrain.terpsAvg},{l:"Avg yield g/sqft",v:activeStrain.avgYieldGPerSqft},{l:"Flower weeks",v:activeStrain.avgFlowerWeeks},{l:"Harvest batches",v:agg.harvestBatchCount||0},{l:"Prod batches",v:agg.prodBatchCount||0}].map((s,i)=>(
                  <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l}</div>
                    <div style={{fontSize:15,fontWeight:700,color:"var(--accent-2)"}}>{s.v||"—"}</div>
                  </div>
                ))}
              </div>
              {activeStrain.dominantTerpenes&&<div style={{fontSize:12,color:"var(--text-2)",marginBottom:10}}><strong>Dominant terpenes:</strong> {activeStrain.dominantTerpenes}</div>}
              {activeStrain.salesDescription&&(
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Sales & Marketing Description</div>
                  <div className="sd-desc">{activeStrain.salesDescription}</div>
                </div>
              )}
              {!activeStrain.salesDescription&&(
                <button className="sd-btn sd-ai" onClick={()=>{setForm({...activeStrain});setTimeout(handleGenerateDescription,100);}}>✨ Generate description with AI</button>
              )}
              {linkedHunt&&<div style={{fontSize:11,color:"var(--text-3)",marginTop:10}}>Linked pheno hunt: {linkedHunt.strainName} ({linkedHunt.breeder})</div>}
            </div>
          );
        })()}
      </div>
    </>
  );
}
