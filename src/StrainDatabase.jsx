import { useState, useEffect } from "react";
import { db } from "./lib/db";

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

async function callDescriptionAPI(messages, systemPrompt){
  const resp=await fetch("/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:systemPrompt,prompt:messages[messages.length-1].content,history:messages.slice(0,-1)})});
  const data=await resp.json();
  return data.content?.map(b=>b.text).join("")||"";
}

const VALID_TYPES = ["Indica","Sativa","Hybrid","Indica-dominant","Sativa-dominant","Ruderalis"];
function normalizeStrainType(raw){
  if(!raw) return "Hybrid";
  if(VALID_TYPES.includes(raw)) return raw;
  const l = raw.toLowerCase();
  if(l.includes("indica")&&l.includes("dom")) return "Indica-dominant";
  if(l.includes("sativa")&&l.includes("dom")) return "Sativa-dominant";
  if(l.includes("indica")) return "Indica";
  if(l.includes("sativa")) return "Sativa";
  if(l.includes("hybrid")) return "Hybrid";
  return "Hybrid";
}

function normalizeStrain(r){
  return {
    ...r,
    id: r.id || "str_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
    name: r.name || r.cultivar_name || r.strain_name || r.strain || r["Cultivar Name"] || r["Strain Name"] || "",
    type: normalizeStrainType(r.type || r.strain_type || r["Strain Type"] || r["Type"] || ""),
    parentage: r.parentage || r.genetic_cross || r.genetic_cross_lineage || r.lineage || r["Genetic Cross / Lineage"] || r["Lineage"] || r["Genetics"] || "",
    breeder: r.breeder || r.original_breeder || r["Original Breeder"] || r["Breeder"] || r["Seed Company"] || "",
    thcaAvg: r.thcaAvg || r.avg_thca || r.avg_thca_pct || r["Avg THCa %"] || r["Avg THCa"] || "",
    thcAvg: r.thcAvg || r.avg_thc || r.avg_thc_pct || r["Avg THC %"] || r["Avg THC"] || "",
    cbdAvg: r.cbdAvg || r.avg_cbd || r.avg_cbd_pct || r["Avg CBD %"] || r["Avg CBD"] || "",
    terpsAvg: r.terpsAvg || r.avg_total_terpenes || r.avg_terpenes || r.avg_total_terpenes_pct || r["Avg Total Terpenes %"] || r["Avg Total Terpenes"] || "",
    dominantTerpenes: r.dominantTerpenes || r.dominant_terpenes || r["Dominant Terpenes"] || r["Top Terpenes"] || "",
    avgYieldGPerSqft: r.avgYieldGPerSqft || r.avg_yield || r.avg_yield_g_sqft || r["Avg Yield (g/sqft canopy)"] || r["Avg Yield"] || "",
    avgFlowerWeeks: r.avgFlowerWeeks || r.flower_time_weeks || r.flower_time || r.flower_weeks || r["Flower Time (weeks)"] || r["Flower Weeks"] || "",
    avgVegWeeks: r.avgVegWeeks || r.veg_time_weeks || r.veg_time || r["Veg Time (weeks)"] || r["Veg Weeks"] || "",
    aroma: r.aroma || r.aroma_notes || r["Aroma Notes"] || r["Aroma"] || "",
    flavor: r.flavor || r.flavor_profile || r["Flavor Profile"] || r["Flavor"] || "",
    effectProfile: r.effectProfile || r.effect_description || r.effects || r["Effect Description"] || r["Effects"] || "",
    notes: r.notes || r.internal_notes || r["Internal Notes"] || r["Notes"] || "",
    status: r.status || "active",
    salesDescription: r.salesDescription || r.sales_description || r["Sales Description"] || "",
    linkedPhenoHuntId: r.linkedPhenoHuntId || "",
  };
}

// Transform app format → Supabase column names for saving
function toSupabase(s){
  return {
    id: s.id,
    name: s.name || "",
    type: s.type || "Hybrid",
    lineage: s.parentage || "",
    breeder: s.breeder || "",
    thca_avg: s.thcaAvg || null,
    thc_avg: s.thcAvg || null,
    cbd_avg: s.cbdAvg || null,
    terps_avg: s.terpsAvg || null,
    dominant_terps: s.dominantTerpenes || "",
    veg_weeks: s.avgVegWeeks || null,
    flower_weeks: s.avgFlowerWeeks || null,
    yield_g_sqft: s.avgYieldGPerSqft || null,
    aroma: s.aroma || "",
    flavor: s.flavor || "",
    effects: s.effectProfile || "",
    ai_description: s.salesDescription || "",
    notes: s.notes || "",
  };
}

// Transform Supabase row → app format for loading
function fromSupabase(r){
  return normalizeStrain({
    ...r,
    parentage: r.lineage || r.parentage || "",
    thcaAvg: r.thca_avg || r.thcaAvg || "",
    thcAvg: r.thc_avg || r.thcAvg || "",
    cbdAvg: r.cbd_avg || r.cbdAvg || "",
    terpsAvg: r.terps_avg || r.terpsAvg || "",
    dominantTerpenes: r.dominant_terps || r.dominantTerpenes || "",
    avgVegWeeks: r.veg_weeks || r.avgVegWeeks || "",
    avgFlowerWeeks: r.flower_weeks || r.avgFlowerWeeks || "",
    avgYieldGPerSqft: r.yield_g_sqft || r.avgYieldGPerSqft || "",
    effectProfile: r.effects || r.effectProfile || "",
    salesDescription: r.ai_description || r.salesDescription || "",
  });
}

export default function StrainDatabase(){
  const [harvestBatches,setHarvestBatches]=useState([]);
  const [prodBatches,setProdBatches]=useState([]);
  const [phenoHunts,setPhenoHunts]=useState([]);

  const [strains,setStrains]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [activeId,setActiveId]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [search,setSearch]=useState("");
  const [err,setErr]=useState("");
  const [descChat,setDescChat]=useState([]);
  const [descInput,setDescInput]=useState("");
  const [showDescChat,setShowDescChat]=useState(false);

  // Load all data from db layer on mount
  useEffect(()=>{
    async function load(){
      try{
        const [s, hb, pb]=await Promise.all([
          db.strains.list(),
          db.harvest_batches.list(),
          db.production_batches.list(),
        ]);
        setStrains(s.map(fromSupabase));
        setHarvestBatches(hb);
        setProdBatches(pb.filter(b=>!b.isLinked));
        // phenoHunts not in db.js mapping yet — keep localStorage fallback
        try{ setPhenoHunts(JSON.parse(localStorage.getItem("resinops_pheno_hunts")||"[]")); }catch{}
      }catch(e){ console.error("StrainDatabase load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const activeStrain=strains.find(s=>s.id===activeId);

  // Reset chat when switching strains
  useEffect(()=>{ setDescChat([]); setDescInput(""); setShowDescChat(false); },[activeId]);
  function openForm(strain){ setForm(strain?{...strain}:{...EMPTY_STRAIN}); setDescChat([]); setDescInput(""); setShowDescChat(false); setErr(""); }

  // Pull harvest + production data for this strain
  function aggregateData(strainName){
    const hbs=harvestBatches.filter(b=>b.strainName?.toLowerCase()===strainName?.toLowerCase());
    const pbs=prodBatches.filter(b=>b.strains?.toLowerCase()?.includes(strainName?.toLowerCase()));
    const dryWeights=hbs.map(b=>b.totalDryWeight||0).filter(Boolean);
    const avgDryG=dryWeights.length?Math.round(dryWeights.reduce((a,v)=>a+v)/dryWeights.length):null;
    return{harvestBatchCount:hbs.length,prodBatchCount:pbs.length,avgDryWeightG:avgDryG};
  }

  const strainSystemPrompt = (strain) => `You are an expert cannabis copywriter and strain analyst working collaboratively with a licensed cannabis operator to craft the perfect strain description.

Strain data on file:
- Name: ${strain?.name||""}
- Type: ${strain?.type||""}
- Parentage / Genetics: ${strain?.parentage||"Unknown"}
- Breeder: ${strain?.breeder||"Unknown"}
- Average THCa: ${strain?.thcaAvg||"N/A"}%
- Average THC: ${strain?.thcAvg||"N/A"}%
- Average CBD: ${strain?.cbdAvg||"N/A"}%
- Average Total Terpenes: ${strain?.terpsAvg||"N/A"}%
- Dominant Terpenes: ${strain?.dominantTerpenes||"Not specified"}
- Average Yield (g/sqft): ${strain?.avgYieldGPerSqft||"N/A"}
- Average Flower Time: ${strain?.avgFlowerWeeks||"N/A"} weeks
- Aroma: ${strain?.aroma||"Not specified"}
- Flavor: ${strain?.flavor||"Not specified"}
- Effects: ${strain?.effectProfile||"Not specified"}
- Notes: ${strain?.notes||"None"}

Rules:
- Never invent cannabinoid percentages, genetics, or breeder info not provided above
- Keep descriptions under 200 words unless asked for more
- When the operator asks for revisions, apply them and return only the updated description
- If genetics or lineage seems wrong, flag it and ask the operator to confirm before using it`;

  async function handleGenerateDescription(){
    if(!form) return;
    setGenerating(true);
    setShowDescChat(true);
    const initialPrompt=`Write a compelling, professional strain description for ${form.name} for sales and marketing use. Base it only on the data provided.`;
    const newChat=[{role:"user",content:initialPrompt}];
    setDescChat(newChat);
    try{
      const reply=await callDescriptionAPI(newChat, strainSystemPrompt(form));
      const updated=[...newChat,{role:"assistant",content:reply}];
      setDescChat(updated);
      setForm(f=>({...f,salesDescription:reply}));
    }catch(e){setErr("AI generation failed — check API connection.");}
    finally{setGenerating(false);}
  }

  async function handleDescChatSend(){
    if(!descInput.trim()||generating) return;
    const userMsg={role:"user",content:descInput.trim()};
    const newChat=[...descChat,userMsg];
    setDescChat(newChat);
    setDescInput("");
    setGenerating(true);
    try{
      const reply=await callDescriptionAPI(newChat, strainSystemPrompt(form));
      const updated=[...newChat,{role:"assistant",content:reply}];
      setDescChat(updated);
      // Auto-update the description field with the latest AI output
      setForm(f=>({...f,salesDescription:reply}));
    }catch(e){setErr("AI generation failed.");}
    finally{setGenerating(false);}
  }

  async function save(){
    if(!form.name.trim()){setErr("Enter a strain name.");return;}
    const s={...form,id:form.id||"str"+Date.now()};
    try{
      const saved=await db.strains.upsert(toSupabase(s));
      const normalized=fromSupabase(saved);
      if(form.id) setStrains(p=>p.map(x=>x.id===normalized.id?normalized:x));
      else setStrains(p=>[...p,normalized]);
      setForm(null);setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }
  async function remove(id){
    try{
      await db.strains.delete(id);
      setStrains(p=>p.filter(x=>x.id!==id));
      if(activeId===id)setActiveId(null);
    }catch(e){ setErr("Delete failed: "+e.message); }
  }

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

  const filtered=strains
    .filter(s=>!search||s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      const aAuto=a.notes?.startsWith("Auto-added from")?1:0;
      const bAuto=b.notes?.startsWith("Auto-added from")?1:0;
      if(aAuto!==bAuto) return aAuto-bAuto;
      return a.name.localeCompare(b.name);
    });
  const keeperPhenos=phenoHunts.flatMap(h=>(h.seeds||[]).filter(s=>s.isKeeper).map(s=>({hunt:h,seed:s})));

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading strains…</div>);

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
            {!form&&!activeId&&<button className="sd-btn sd-primary" onClick={()=>openForm(null)}>+ Add strain</button>}
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
              {generating&&<div className="sd-ai-generating">Generating description…</div>}
              <textarea className="sd-inp" rows={5} style={{resize:"vertical"}} value={form.salesDescription} onChange={e=>setF("salesDescription",e.target.value)} placeholder="Enter manually or click Generate with AI to draft from your strain data" />

              {/* Collaborative refinement chat */}
              {showDescChat&&descChat.length>0&&(
                <div style={{marginTop:10,border:"1px solid rgba(90,63,160,0.3)",borderRadius:10,overflow:"hidden"}}>
                  <div style={{background:"rgba(90,63,160,0.08)",padding:"8px 12px",fontSize:11,fontWeight:600,color:"#9080f0",borderBottom:"1px solid rgba(90,63,160,0.2)"}}>
                    ✨ AI Description Workshop — refine with follow-up instructions
                  </div>
                  <div style={{maxHeight:220,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                    {descChat.map((m,i)=>(
                      <div key={i} style={{
                        alignSelf:m.role==="user"?"flex-end":"flex-start",
                        maxWidth:"85%",
                        background:m.role==="user"?"rgba(90,63,160,0.15)":"var(--surface-2)",
                        border:`1px solid ${m.role==="user"?"rgba(90,63,160,0.3)":"var(--border-2)"}`,
                        borderRadius:8,padding:"7px 10px",
                        fontSize:12,color:"var(--text)",lineHeight:1.5,
                      }}>
                        {m.role==="assistant"&&<div style={{fontSize:9,fontWeight:700,color:"#9080f0",textTransform:"uppercase",marginBottom:3}}>AI Draft</div>}
                        {m.role==="user"&&<div style={{fontSize:9,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",marginBottom:3}}>You</div>}
                        <div style={{whiteSpace:"pre-wrap"}}>{m.content}</div>
                        {m.role==="assistant"&&(
                          <button onClick={()=>setForm(f=>({...f,salesDescription:m.content}))}
                            style={{marginTop:6,fontSize:10,padding:"2px 8px",borderRadius:5,border:"1px solid var(--accent)",background:"rgba(74,124,89,0.1)",color:"var(--accent-2)",cursor:"pointer",fontWeight:600}}>
                            Use this version
                          </button>
                        )}
                      </div>
                    ))}
                    {generating&&<div className="sd-ai-generating" style={{alignSelf:"flex-start"}}>✨ Writing…</div>}
                  </div>
                  <div style={{borderTop:"1px solid var(--border-2)",padding:"8px 10px",display:"flex",gap:6}}>
                    <input
                      className="sd-inp"
                      style={{flex:1,fontSize:12}}
                      placeholder="e.g. Make it shorter · Fix the genetics · Add more about the terpene profile"
                      value={descInput}
                      onChange={e=>setDescInput(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleDescChatSend()}
                      disabled={generating}
                    />
                    <button className="sd-btn sd-ai" style={{fontSize:11,whiteSpace:"nowrap"}} onClick={handleDescChatSend} disabled={generating||!descInput.trim()}>
                      Send
                    </button>
                  </div>
                </div>
              )}
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
                      <span className={"sd-pill type-"+((s.type||"hybrid").toLowerCase().split("-")[0])}>{s.type||"Hybrid"}</span>
                    </div>
                    <div style={{fontSize:11,color:"var(--text-3)",marginBottom:8}}>{s.breeder||"Unknown breeder"}{s.parentage?" · "+s.parentage:""}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      {s.thcaAvg&&<div><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>THCa</div><div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>{s.thcaAvg}%</div></div>}
                      {s.terpsAvg&&<div><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Terps</div><div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>{s.terpsAvg}%</div></div>}
                      {agg.harvestBatchCount>0&&<div><div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Harvests</div><div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{agg.harvestBatchCount}</div></div>}
                    </div>
                    {s.dominantTerpenes&&<div style={{fontSize:10,color:"var(--text-3)",marginTop:6}}>{s.dominantTerpenes}</div>}
                    {s.notes?.startsWith("Auto-added from")&&<div style={{fontSize:9,color:"var(--text-3)",fontStyle:"italic",marginTop:4}}>{s.notes}</div>}
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
                  <div style={{fontSize:18,fontWeight:700,color:"var(--text)"}}>{activeStrain.name} <span className={"sd-pill type-"+((activeStrain.type||"hybrid").toLowerCase().split("-")[0])} style={{verticalAlign:"middle"}}>{activeStrain.type||"Hybrid"}</span></div>
                  <div style={{fontSize:12,color:"var(--text-3)",marginTop:2}}>{activeStrain.breeder||"Unknown breeder"}{activeStrain.parentage?" · "+activeStrain.parentage:""}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="sd-sm sd-edit" onClick={()=>openForm(activeStrain)}>Edit</button>
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
                <button className="sd-btn sd-ai" onClick={()=>{openForm(activeStrain);setTimeout(handleGenerateDescription,100);}}>✨ Generate description with AI</button>
              )}
              {linkedHunt&&<div style={{fontSize:11,color:"var(--text-3)",marginTop:10}}>Linked pheno hunt: {linkedHunt.strainName} ({linkedHunt.breeder})</div>}
            </div>
          );
        })()}
      </div>
    </>
  );
}
