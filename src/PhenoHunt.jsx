import { useState, useEffect } from "react";
import { autoPopulateStrains } from "./strainUtils.js";
import StrainCombo from "./StrainCombo.jsx";

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function pct(n,t){return t?Math.round(n/t*100):0;}

const SCORE_MARKERS=[
  {k:"vigor",l:"Vigor / Growth Rate"},
  {k:"structure",l:"Structure / Architecture"},
  {k:"flowerDensity",l:"Flower Density / Bud Set"},
  {k:"trichomeDensity",l:"Trichome Density"},
  {k:"aroma",l:"Aroma Intensity & Quality"},
  {k:"flavor",l:"Flavor (smoke/vapor)"},
  {k:"effect",l:"Effect Profile"},
  {k:"yield",l:"Yield vs. Expectation"},
  {k:"potency",l:"Potency (COA THC/THCa %)"},
  {k:"terpenes",l:"Terpene Breadth (COA)"},
  {k:"stability",l:"Phenotypic Stability"},
  {k:"resistance",l:"Pest / Mold Resistance"},
];

const STAGES=["Germination","Sexing","Keeper Selection","Clone Cut","Propagation","Test Run","COA / Scoring","Archived","Keeper"];

const CSS=`
  .ph-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ph-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .ph-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .ph-inp:focus{outline:none;border-color:var(--accent);}
  .ph-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .ph-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .ph-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .ph-btn:hover{opacity:0.85;}
  .ph-primary{background:var(--accent);color:#fff;}
  .ph-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .ph-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .ph-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .ph-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .ph-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .ph-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .ph-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .ph-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .sex-m{background:rgba(90,120,200,0.15);color:#7090f0;}
  .sex-f{background:rgba(200,74,120,0.15);color:#e07090;}
  .sex-u{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .stage-pill{background:rgba(74,124,89,0.15);color:var(--accent-2);}
  .keeper-pill{background:rgba(200,150,58,0.2);color:var(--amber);font-weight:700;}
  .score-bar{height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden;}
  .score-fill{height:6px;border-radius:3px;background:var(--accent);}
`;

const EMPTY_HUNT={strainName:"",breeder:"",seedSource:"",seedCount:"",germDate:"",notes:""};
const EMPTY_SEED={phenoNum:"",sex:"unknown",germinated:true,isKeeper:false,stage:"Germination",cloneCutDate:"",testRunLinked:"",coaTHC:"",coaTHCa:"",coaCBD:"",coaTerps:"",scores:{},observations:"",archived:false};

export default function PhenoHunt(){
  const [hunts,setHunts]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_pheno_hunts")||"[]");}catch{return[];}});
  const [activeHuntId,setActiveHuntId]=useState(null);
  const [huntForm,setHuntForm]=useState(null);
  const [seedForm,setSeedForm]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_pheno_hunts",JSON.stringify(hunts));},[hunts]);

  const activeHunt=hunts.find(h=>h.id===activeHuntId);

  function saveHunt(){
    if(!huntForm.strainName.trim()){setErr("Enter a strain name.");return;}
    const seeds=huntForm.id?undefined:Array.from({length:parseInt(huntForm.seedCount)||0},(_,i)=>({...EMPTY_SEED,id:"s"+Date.now()+i,phenoNum:String(i+1)}));
    const h={...huntForm,id:huntForm.id||"ph"+Date.now(),seeds:huntForm.seeds||seeds||[]};
    if(huntForm.id) setHunts(p=>p.map(x=>x.id===h.id?h:x));
    else setHunts(p=>[...p,h]);
    autoPopulateStrains(huntForm.strainName, { breeder: huntForm.breeder, source: "Pheno Hunt Tracker" });
    setHuntForm(null);setErr("");
  }
  function removeHunt(id){setHunts(p=>p.filter(x=>x.id!==id));if(activeHuntId===id)setActiveHuntId(null);}

  function openSeedForm(seed){setSeedForm(seed?{...seed}:{...EMPTY_SEED,id:"s"+Date.now(),phenoNum:String((activeHunt?.seeds?.length||0)+1)});setErr("");}
  function saveSeed(){
    if(!seedForm.phenoNum){setErr("Enter a pheno number.");return;}
    setHunts(p=>p.map(h=>{
      if(h.id!==activeHuntId)return h;
      const seeds=seedForm._isNew!==false&&!h.seeds.find(s=>s.id===seedForm.id)?[...h.seeds,seedForm]:h.seeds.map(s=>s.id===seedForm.id?seedForm:s);
      return{...h,seeds};
    }));
    setSeedForm(null);setErr("");
  }
  function removeSeed(seedId){setHunts(p=>p.map(h=>h.id===activeHuntId?{...h,seeds:h.seeds.filter(s=>s.id!==seedId)}:h));}
  function toggleKeeper(seedId){setHunts(p=>p.map(h=>h.id!==activeHuntId?h:{...h,seeds:h.seeds.map(s=>s.id===seedId?{...s,isKeeper:!s.isKeeper,stage:!s.isKeeper?"Keeper":s.stage}:s)}));}

  function totalScore(seed){
    const vals=Object.values(seed.scores||{}).filter(v=>v>0);
    return vals.length?Math.round(vals.reduce((a,v)=>a+parseFloat(v),0)/vals.length*10)/10:null;
  }

  const setScore=(k,v)=>setSeedForm(f=>({...f,scores:{...f.scores,[k]:v}}));

  return(
    <>
      <style>{CSS}</style>
      <div className="ph-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Pheno Hunt Tracker</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Seed-by-seed tracking from germination through COA scoring to keeper selection</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {activeHuntId&&<button className="ph-btn ph-secondary" onClick={()=>setActiveHuntId(null)}>← All hunts</button>}
            {!huntForm&&!activeHuntId&&<button className="ph-btn ph-primary" onClick={()=>setHuntForm({...EMPTY_HUNT})}>+ New pheno hunt</button>}
            {activeHunt&&!seedForm&&<button className="ph-btn ph-primary" onClick={()=>openSeedForm(null)}>+ Add pheno</button>}
          </div>
        </div>

        {/* Hunt form */}
        {huntForm&&!activeHuntId&&(
          <div className="ph-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{huntForm.id?"Edit hunt":"New Pheno Hunt"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="ph-lbl">Strain name</label><StrainCombo className="ph-inp" value={huntForm.strainName} onChange={(name)=>setHuntForm(f=>({...f,strainName:name}))} placeholder="Select or type strain" /></div>
              <div><label className="ph-lbl">Breeder / seed bank</label><input className="ph-inp" value={huntForm.breeder} onChange={e=>setHuntForm(f=>({...f,breeder:e.target.value}))} /></div>
              <div><label className="ph-lbl">Seed source / lot</label><input className="ph-inp" value={huntForm.seedSource} onChange={e=>setHuntForm(f=>({...f,seedSource:e.target.value}))} /></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="ph-lbl">Number of seeds</label><input type="number" min="1" className="ph-inp" value={huntForm.seedCount} onChange={e=>setHuntForm(f=>({...f,seedCount:e.target.value}))} /></div>
              <div><label className="ph-lbl">Germination date</label><input type="date" className="ph-inp" value={huntForm.germDate} onChange={e=>setHuntForm(f=>({...f,germDate:e.target.value}))} /></div>
            </div>
            <div style={{marginBottom:10}}><label className="ph-lbl">Notes</label><input className="ph-inp" value={huntForm.notes} onChange={e=>setHuntForm(f=>({...f,notes:e.target.value}))} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="ph-btn ph-primary" onClick={saveHunt}>{huntForm.id?"Save":"Start hunt"}</button>
              <button className="ph-btn ph-secondary" onClick={()=>{setHuntForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Hunt list */}
        {!activeHuntId&&hunts.length>0&&!huntForm&&(
          <div className="ph-card">
            {hunts.map(h=>{
              const keepers=h.seeds?.filter(s=>s.isKeeper)||[];
              const females=h.seeds?.filter(s=>s.sex==="female")||[];
              return(
                <div key={h.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
                  <div>
                    <div style={{fontWeight:600,color:"var(--text)"}}>{h.strainName} <span style={{fontWeight:400,color:"var(--text-3)",fontSize:11}}>— {h.breeder||"no breeder"}</span></div>
                    <div style={{fontSize:11,color:"var(--text-3)"}}>{h.seeds?.length||0} seeds · {females.length} female · {keepers.length} keeper{keepers.length!==1?"s":""} · Germinated {fmtD(h.germDate)}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button className="ph-sm ph-edit" onClick={()=>setActiveHuntId(h.id)}>Open</button>
                    <button className="ph-sm ph-edit" onClick={()=>setHuntForm({...h})}>Edit</button>
                    <button className="ph-sm ph-del" onClick={()=>removeHunt(h.id)}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!activeHuntId&&hunts.length===0&&!huntForm&&(
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🌱</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No pheno hunts yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Start a hunt to track each seed from germination through sexing, cloning, test run, and COA scoring</div>
          </div>
        )}

        {/* Active hunt detail */}
        {activeHunt&&(
          <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--text)"}}>{activeHunt.strainName}</div>
              <div style={{fontSize:12,color:"var(--text-3)"}}>{activeHunt.breeder} · {activeHunt.seedSource} · Germinated {fmtD(activeHunt.germDate)}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,auto)",gap:12,marginTop:10,width:"fit-content"}}>
                {[
                  {l:"Seeds",v:activeHunt.seeds?.length||0},
                  {l:"Germinated",v:(activeHunt.seeds||[]).filter(s=>s.germinated).length},
                  {l:"Female",v:(activeHunt.seeds||[]).filter(s=>s.sex==="female").length},
                  {l:"Keepers",v:(activeHunt.seeds||[]).filter(s=>s.isKeeper).length},
                  {l:"Scored",v:(activeHunt.seeds||[]).filter(s=>s.coaTHCa||s.coaTHC).length},
                ].map((st,i)=>(
                  <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{st.l}</div>
                    <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{st.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Seed / pheno edit form */}
            {seedForm&&(
              <div className="ph-card" style={{border:"1px solid var(--accent)"}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Pheno #{seedForm.phenoNum}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ph-lbl">Pheno #</label><input className="ph-inp" value={seedForm.phenoNum} onChange={e=>setSeedForm(f=>({...f,phenoNum:e.target.value}))} /></div>
                  <div><label className="ph-lbl">Sex</label><select className="ph-sel" value={seedForm.sex} onChange={e=>setSeedForm(f=>({...f,sex:e.target.value}))}><option value="unknown">Unknown</option><option value="female">Female</option><option value="male">Male</option><option value="hermaphrodite">Hermaphrodite</option></select></div>
                  <div><label className="ph-lbl">Stage</label><select className="ph-sel" value={seedForm.stage} onChange={e=>setSeedForm(f=>({...f,stage:e.target.value}))}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:12,paddingBottom:6}}>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={seedForm.germinated} onChange={e=>setSeedForm(f=>({...f,germinated:e.target.checked}))} />Germinated</label>
                    <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={seedForm.isKeeper} onChange={e=>setSeedForm(f=>({...f,isKeeper:e.target.checked}))} />🏆 Keeper</label>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="ph-lbl">Clone cut date</label><input type="date" className="ph-inp" value={seedForm.cloneCutDate} onChange={e=>setSeedForm(f=>({...f,cloneCutDate:e.target.value}))} /></div>
                  <div><label className="ph-lbl">Test run / linked batch</label><input className="ph-inp" value={seedForm.testRunLinked} onChange={e=>setSeedForm(f=>({...f,testRunLinked:e.target.value}))} placeholder="Batch name or ID" /></div>
                </div>

                {/* COA data */}
                <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>COA Data (from 3rd-party lab)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
                    <div><label className="ph-lbl">THCa %</label><input type="number" step="0.01" className="ph-inp" value={seedForm.coaTHCa} onChange={e=>setSeedForm(f=>({...f,coaTHCa:e.target.value}))} /></div>
                    <div><label className="ph-lbl">THC %</label><input type="number" step="0.01" className="ph-inp" value={seedForm.coaTHC} onChange={e=>setSeedForm(f=>({...f,coaTHC:e.target.value}))} /></div>
                    <div><label className="ph-lbl">CBD %</label><input type="number" step="0.01" className="ph-inp" value={seedForm.coaCBD} onChange={e=>setSeedForm(f=>({...f,coaCBD:e.target.value}))} /></div>
                    <div><label className="ph-lbl">Total terpenes %</label><input type="number" step="0.01" className="ph-inp" value={seedForm.coaTerps} onChange={e=>setSeedForm(f=>({...f,coaTerps:e.target.value}))} /></div>
                  </div>
                </div>

                {/* Scoring */}
                <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Scoring — 1 to 10 per marker</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {SCORE_MARKERS.map(m=>(
                      <div key={m.k} style={{display:"flex",alignItems:"center",gap:8}}>
                        <label style={{fontSize:11,color:"var(--text-2)",flex:1,minWidth:0}}>{m.l}</label>
                        <input type="number" min="0" max="10" step="0.5" className="ph-inp" style={{width:56,textAlign:"center"}} value={seedForm.scores?.[m.k]||""} onChange={e=>setScore(m.k,e.target.value)} />
                        <div className="score-bar" style={{width:60}}><div className="score-fill" style={{width:`${((parseFloat(seedForm.scores?.[m.k])||0)/10)*100}%`}} /></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:10}}><label className="ph-lbl">Observations / notes</label><textarea className="ph-inp" rows={2} style={{resize:"vertical"}} value={seedForm.observations} onChange={e=>setSeedForm(f=>({...f,observations:e.target.value}))} /></div>
                {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="ph-btn ph-primary" onClick={saveSeed}>Save pheno</button>
                  <button className="ph-btn ph-secondary" onClick={()=>{setSeedForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Pheno table */}
            {(activeHunt.seeds||[]).length>0&&!seedForm&&(
              <div className="ph-card">
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                  <table className="ph-tbl">
                    <thead><tr><th>#</th><th>Sex</th><th>Stage</th><th>THCa %</th><th>Total Terps %</th><th>Avg Score</th><th>Keeper</th><th></th></tr></thead>
                    <tbody>
                      {(activeHunt.seeds||[]).sort((a,b)=>parseInt(a.phenoNum)-parseInt(b.phenoNum)).map(s=>{
                        const avg=totalScore(s);
                        return(
                          <tr key={s.id} style={{opacity:s.archived?0.5:1}}>
                            <td style={{fontWeight:600,color:"var(--text)"}}>{s.phenoNum}</td>
                            <td><span className={"ph-pill sex-"+(s.sex==="female"?"f":s.sex==="male"?"m":"u")}>{s.sex}</span></td>
                            <td style={{fontSize:11}}><span className="ph-pill stage-pill">{s.stage}</span></td>
                            <td>{s.coaTHCa?s.coaTHCa+"%":"—"}</td>
                            <td>{s.coaTerps?s.coaTerps+"%":"—"}</td>
                            <td>{avg!==null?<><span style={{fontWeight:600,color:"var(--accent-2)"}}>{avg}</span><span style={{fontSize:10,color:"var(--text-3)"}}>/10</span></>:"—"}</td>
                            <td>{s.isKeeper?<span className="ph-pill keeper-pill">🏆 Keeper</span>:"—"}</td>
                            <td><div style={{display:"flex",gap:5}}>
                              <button className="ph-sm ph-edit" onClick={()=>setSeedForm({...s})}>Edit</button>
                              <button className="ph-sm" style={{background:"rgba(200,150,58,0.15)",color:"var(--amber)",border:"1px solid rgba(200,150,58,0.3)"}} onClick={()=>toggleKeeper(s.id)}>{s.isKeeper?"Un-keep":"Keep"}</button>
                              <button className="ph-sm ph-del" onClick={()=>removeSeed(s.id)}>✕</button>
                            </div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
