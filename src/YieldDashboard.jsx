import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { matchesStrain, splitStrains } from "./strainUtils.js";

const LBS_TO_G = 453.592;
function n(v){const f=parseFloat(v);return isNaN(f)?0:f;}
function avg(arr){return arr.length?arr.reduce((a,v)=>a+v,0)/arr.length:null;}

const CSS=`
  .yd-wrap{padding:24px;flex:1;overflow-y:auto;}
  .yd-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .yd-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .yd-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .yd-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .yd-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .yd-tbl th{text-align:left;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .yd-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .yd-tbl tr:last-child td{border-bottom:none;}
  .yd-tbl tr{cursor:pointer;}
  .yd-tbl tr:hover td{background:rgba(74,124,89,0.05);}
  .yd-box{background:var(--surface-2);border-radius:8px;padding:14px;margin-bottom:12px;}
  .yd-box-t{font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;}
  .yd-mat-tbl{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;}
  .yd-mat-tbl th{text-align:left;padding:5px 8px;color:var(--text-3);font-weight:700;text-transform:uppercase;font-size:9px;border-bottom:1px solid var(--border);}
  .yd-mat-tbl td{padding:5px 8px;color:var(--text-2);border-bottom:1px solid var(--border);}
`;

const MATERIAL_TYPES=["Fresh Frozen","Dry Bud","Dry Trim","Unspecified"];

function normalizeMaterial(mt){ return mt && MATERIAL_TYPES.includes(mt) ? mt : "Unspecified"; }

function collect(pbs, extractFn){
  const records=[];
  pbs.forEach(p=>extractFn(p).forEach(pct=>{
    if(pct!=null) records.push({materialType:normalizeMaterial(p.inputMaterialType), pct});
  }));
  if(!records.length) return null;
  const overall=avg(records.map(r=>r.pct));
  const byMat={};
  MATERIAL_TYPES.forEach(mt=>{
    const vals=records.filter(r=>r.materialType===mt).map(r=>r.pct);
    if(vals.length) byMat[mt]={avg:avg(vals),count:vals.length};
  });
  return {overall,count:records.length,byMat};
}

function aggregateStrainYields(harvestBatches, prodBatches){
  const names=new Set();
  harvestBatches.forEach(h=>{ if(h.strainName) names.add(h.strainName); });
  prodBatches.forEach(p=>{ splitStrains(p.strains).forEach(n=>names.add(n)); });

  return Array.from(names).sort().map(strainName=>{
    const lc=strainName.toLowerCase();
    const hbs=harvestBatches.filter(h=>h.strainName?.toLowerCase()===lc && !h.isFreshFrozen);
    const ffHbs=harvestBatches.filter(h=>h.strainName?.toLowerCase()===lc && h.isFreshFrozen);
    const pbs=prodBatches.filter(p=>matchesStrain(p.strains, strainName));

    const wetWeights=hbs.map(h=>n(h.wetWeightG)).filter(Boolean);
    const dryWeights=hbs.map(h=>n(h.totalDryWeight)).filter(Boolean);
    const avgWetG=avg(wetWeights);
    const avgDryG=avg(dryWeights);
    const dryRatePct=(avgWetG&&avgDryG)?(avgDryG/avgWetG*100):null;
    const ffTotalG=ffHbs.reduce((a,h)=>a+n(h.wetWeightG),0);

    const wetHash=collect(pbs,p=>(p.washEvents||[]).map(w=>{
      const input=n(w.inputWeightG);const total=(w.grades||[]).reduce((s,g)=>s+n(g.wetWeightG),0);
      return (input>0&&total>0)?total/input*100:null;
    }));
    const freezeDry=collect(pbs,p=>(p.freezeDryCycles||[]).map(c=>{
      const wet=n(c.batchSizeG),dry=n(c.finalDryWeightG);
      return (wet>0&&dry>0)?dry/wet*100:null;
    }));
    const flowerRosin=collect(pbs.filter(p=>p.sub==="rosin_fl"),p=>(p.pressRuns||[]).map(pr=>{
      const pre=n(pr.prePressWeightG),post=n(pr.postPressYieldG);
      return (pre>0&&post>0)?post/pre*100:null;
    }));
    const hashRosin=collect(pbs.filter(p=>p.sub==="rosin_hash"),p=>(p.pressRuns||[]).map(pr=>{
      const pre=n(pr.prePressWeightG),post=n(pr.postPressYieldG);
      return (pre>0&&post>0)?post/pre*100:null;
    }));
    const diamondSauce=collect(pbs,p=>(p.diamondSauceBatches||[]).map(d=>{
      const input=n(d.inputCrudeWeightG),out=n(d.diamondYieldG)+n(d.sauceYieldG);
      return (input>0&&out>0)?out/input*100:null;
    }));
    const purge=collect(pbs,p=>(p.purgeRuns||[]).map(pu=>{
      const pre=n(pu.prePurgeWeightG),post=n(pu.postPurgeWeightG);
      return (pre>0&&post>0)?post/pre*100:null;
    }));
    const dewax=collect(pbs,p=>(p.dewaxPasses||[]).map(d=>{
      const pre=n(d.prePassWeightG),post=n(d.postPassWeightG);
      return (pre>0&&post>0)?((pre-post)/pre*100):null; // % mass removed
    }));

    return {strainName,harvestBatchCount:hbs.length,prodBatchCount:pbs.length,ffTotalG,avgWetG,avgDryG,dryRatePct,
      wetHash,freezeDry,flowerRosin,hashRosin,diamondSauce,purge,dewax};
  }).filter(s=>s.harvestBatchCount>0||s.prodBatchCount>0||s.ffTotalG>0);
}

function YieldMethodCard({title,data,unitLabel}){
  if(!data) return null;
  return(
    <div className="yd-box">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div className="yd-box-t" style={{marginBottom:0}}>{title}</div>
        <div style={{fontSize:16,fontWeight:700,color:"var(--accent-2)"}}>{data.overall.toFixed(1)}%</div>
      </div>
      <div style={{fontSize:10,color:"var(--text-3)",marginBottom:4}}>{data.count} record{data.count!==1?"s":""} · {unitLabel}</div>
      {Object.keys(data.byMat).length>1&&(
        <table className="yd-mat-tbl">
          <thead><tr><th>Material</th><th>Avg Yield</th><th>Records</th></tr></thead>
          <tbody>
            {MATERIAL_TYPES.filter(mt=>data.byMat[mt]).map(mt=>(
              <tr key={mt}><td>{mt}</td><td style={{color:"var(--accent-2)",fontWeight:600}}>{data.byMat[mt].avg.toFixed(1)}%</td><td>{data.byMat[mt].count}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function YieldDashboard(){
  const [harvestBatches,setHarvestBatches]=useState([]);
  const [prodBatches,setProdBatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [activeStrain,setActiveStrain]=useState(null);

  useEffect(()=>{
    async function load(){
      try{
        const [hb,pb]=await Promise.all([db.harvest_batches.list(),db.production_batches.list()]);
        setHarvestBatches(hb);
        setProdBatches(pb);
      }catch(e){ console.error("YieldDashboard load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading yield data…</div>);

  const strains=aggregateStrainYields(harvestBatches,prodBatches);
  const filtered=strains.filter(s=>!search||s.strainName.toLowerCase().includes(search.toLowerCase()));
  const active=strains.find(s=>s.strainName===activeStrain);

  return(
    <>
      <style>{CSS}</style>
      <div className="yd-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Yield Dashboard</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Cultivation and extraction yield, per strain, segmented by Fresh Frozen / Dry Bud / Dry Trim input material</div>
          </div>
          {active&&<button className="yd-btn yd-secondary" onClick={()=>setActiveStrain(null)}>← All strains</button>}
        </div>

        {!active&&(
          <>
            {strains.length===0?(
              <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:10}}>📊</div>
                <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No yield data yet</div>
                <div style={{fontSize:12,color:"var(--text-3)"}}>Log harvest batches and production batches with wash/press/dewax data to see yields here</div>
              </div>
            ):(
              <>
                <div style={{marginBottom:12}}><input className="yd-inp" style={{maxWidth:280}} placeholder="Search strains…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
                <div className="yd-card" style={{padding:0,overflowX:"auto"}}>
                  <table className="yd-tbl">
                    <thead><tr><th>Strain</th><th>Harvests</th><th>Dry Rate</th><th>Wet Hash</th><th>Freeze-Dry</th><th>Flower Rosin</th><th>Hash Rosin</th><th>Diamond/Sauce</th></tr></thead>
                    <tbody>
                      {filtered.map(s=>(
                        <tr key={s.strainName} onClick={()=>setActiveStrain(s.strainName)}>
                          <td style={{fontWeight:600,color:"var(--text)"}}>{s.strainName}</td>
                          <td>{s.harvestBatchCount||"—"}</td>
                          <td>{s.dryRatePct?s.dryRatePct.toFixed(1)+"%":"—"}</td>
                          <td>{s.wetHash?s.wetHash.overall.toFixed(1)+"%":"—"}</td>
                          <td>{s.freezeDry?s.freezeDry.overall.toFixed(1)+"%":"—"}</td>
                          <td>{s.flowerRosin?s.flowerRosin.overall.toFixed(1)+"%":"—"}</td>
                          <td>{s.hashRosin?s.hashRosin.overall.toFixed(1)+"%":"—"}</td>
                          <td>{s.diamondSauce?s.diamondSauce.overall.toFixed(1)+"%":"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {active&&(
          <>
            <div className="yd-card">
              <div style={{fontSize:18,fontWeight:700,color:"var(--text)",marginBottom:12}}>{active.strainName}</div>
              <div className="yd-box-t">Cultivation</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:6}}>
                {[
                  {l:"Harvest batches",v:active.harvestBatchCount||0},
                  {l:"Avg wet weight",v:active.avgWetG?active.avgWetG.toFixed(0)+"g ("+(active.avgWetG/LBS_TO_G).toFixed(1)+" lbs)":"—"},
                  {l:"Avg dry weight",v:active.avgDryG?active.avgDryG.toFixed(0)+"g":"—"},
                  {l:"Dry rate",v:active.dryRatePct?active.dryRatePct.toFixed(1)+"%":"—"},
                ].map((s,i)=>(
                  <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l}</div>
                    <div style={{fontSize:14,fontWeight:700,color:"var(--accent-2)"}}>{s.v}</div>
                  </div>
                ))}
              </div>
              {active.ffTotalG>0&&<div style={{fontSize:11,color:"var(--text-3)"}}>Fresh Frozen allocated: {active.ffTotalG.toLocaleString()}g ({(active.ffTotalG/LBS_TO_G).toFixed(1)} lbs) across separate harvest batches</div>}
            </div>

            <div className="yd-card">
              <div className="yd-box-t" style={{marginBottom:12}}>Extraction Yield by Method</div>
              <YieldMethodCard title="Wet Hash (Ice Water Hash Wash)" data={active.wetHash} unitLabel="total wet weight ÷ input weight" />
              <YieldMethodCard title="Freeze-Dry" data={active.freezeDry} unitLabel="final dry weight ÷ wet batch size" />
              <YieldMethodCard title="Flower Rosin Press" data={active.flowerRosin} unitLabel="post-press yield ÷ pre-press weight" />
              <YieldMethodCard title="Hash Rosin Press" data={active.hashRosin} unitLabel="post-press yield ÷ pre-press weight" />
              <YieldMethodCard title="Diamonds & Sauce" data={active.diamondSauce} unitLabel="total output ÷ input crude weight" />
              <YieldMethodCard title="BHO Purge (final yield)" data={active.purge} unitLabel="post-purge weight ÷ pre-purge weight" />
              <YieldMethodCard title="BHO Dewax (mass removed)" data={active.dewax} unitLabel="wax/lipid mass removed as % of pre-pass weight" />
              {!active.wetHash&&!active.freezeDry&&!active.flowerRosin&&!active.hashRosin&&!active.diamondSauce&&!active.purge&&!active.dewax&&(
                <div style={{fontSize:12,color:"var(--text-3)"}}>No extraction records for this strain yet.</div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
