import { useState } from "react";

function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtN(n,d=1){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:d});}
function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function pct(a,b){return b?((a/b)*100).toFixed(1)+"%":"—";}

const CSS=`
  .bd-wrap{padding:24px;flex:1;overflow-y:auto;}
  .bd-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .bd-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .bd-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .bd-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .bd-tbl tr:last-child td{border-bottom:none;}
  .bd-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .margin-good{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .margin-mid{background:rgba(200,150,58,0.15);color:var(--amber);}
  .margin-low{background:rgba(200,74,74,0.15);color:var(--danger);}
  .bd-stat{background:var(--surface-2);border-radius:8px;padding:10px 14px;}
  .bd-stat-l{font-size:9px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;}
  .bd-stat-v{font-size:20px;font-weight:700;color:var(--accent-2);}
  .bd-bar{height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden;width:80px;display:inline-block;vertical-align:middle;margin-left:6px;}
  .bd-bar-fill{height:6px;border-radius:3px;}
`;

export default function BatchDashboard(){
  const prodBatches=JSON.parse(localStorage.getItem("resinops_prod")||"[]").filter(b=>!b.isLinked);
  const harvestBatches=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
  const skus=JSON.parse(localStorage.getItem("resinops_skus")||"[]");
  const boms=JSON.parse(localStorage.getItem("resinops_boms")||"[]");
  const laborTypes=JSON.parse(localStorage.getItem("resinops_labor_types")||"[]");
  const qcHolds=JSON.parse(localStorage.getItem("resinops_qc_holds")||"[]");
  const cultivationCosts=JSON.parse(localStorage.getItem("resinops_cult_costs")||"[]");
  const cultInputs=JSON.parse(localStorage.getItem("resinops_cult_inputs")||"[]");
  const [filter,setFilter]=useState("all");

  function getSkuPrice(catLabel, subLabel) {
    if(!catLabel) return 0;
    const cat = catLabel.toLowerCase();
    const sub = (subLabel||"").toLowerCase();
    // Try exact cat match first, then partial
    const sku = skus.find(s => {
      const sp = (s.product||"").toLowerCase();
      const sc = (s.cat||"").toLowerCase();
      if(sc && cat.includes(sc)) return true;
      if(sc && sc.includes(cat.split(" ")[0])) return true;
      if(sp.includes("flower") && cat.includes("flower")) return true;
      if(sp.includes("pre-roll") && (cat.includes("pre_roll")||cat.includes("pre-roll"))) return true;
      if(sp.includes("rosin") && (cat.includes("extract")||cat.includes("concentrate"))) return true;
      if(sp.includes("vape") && cat.includes("vape")) return true;
      if(sp.includes("pre-roll") && cat.includes("pre")) return true;
      return sp.includes(cat.split(" ")[0]);
    });
    return sku ? parseFloat(sku.price)||0 : 0;
  }

  function getBomCost(catLabel) {
    if(!catLabel) return 0;
    const cat = catLabel.toLowerCase();
    const bom = boms.find(b => {
      const bp = (b.product||"").toLowerCase();
      const bc = (b.cat||"").toLowerCase();
      if(bc && cat.includes(bc)) return true;
      if(bc && bc.includes(cat.split(" ")[0])) return true;
      if(bp.includes("flower") && cat.includes("flower")) return true;
      if(bp.includes("pre-roll") && (cat.includes("pre_roll")||cat.includes("pre-roll")||cat.includes("pre"))) return true;
      if(bp.includes("rosin") && (cat.includes("extract")||cat.includes("concentrate"))) return true;
      if(bp.includes("vape") && cat.includes("vape")) return true;
      return bp.includes(cat.split(" ")[0]);
    });
    return bom ? (bom.items||[]).reduce((a,i)=>a+(parseFloat(i.unitCost)||0)*(parseFloat(i.qty)||0),0) : 0;
  }
  function extractUnits(yieldEst){
    if(!yieldEst) return 0;
    const m=yieldEst.match(/([\d,]+)\s*(?:×|units|cones|carts|AIOs|bottles)/);
    return m?parseInt(m[1].replace(/,/g,"")):0;
  }
  function extractGrams(yieldEst){
    if(!yieldEst) return 0;
    const m=yieldEst.match(/([\d,]+(?:\.\d+)?)\s*g\b/);
    return m?parseFloat(m[1]):0;
  }

  // Build enriched batch rows
  const rows=prodBatches.map(b=>{
    const units=extractUnits(b.yieldEst)||extractGrams(b.yieldEst)/1000;
    const price=getSkuPrice(b.catLabel,b.subLabel);
    const bomCost=getBomCost(b.catLabel);
    const estimatedRevenue=units*price;
    const materialCost=bomCost*units;
    const laborCost=0; // future: pull from shift log hours × labor type rates
    const testingCost=100; // flat estimate; will be replaced by QC module in V2
    const totalCOGS=materialCost+laborCost+testingCost;
    const grossProfit=estimatedRevenue-totalCOGS;
    const margin=estimatedRevenue>0?(grossProfit/estimatedRevenue)*100:null;
    const onHold=qcHolds.includes(String(b.id));
    const hasActual=!!b.actual_yield;
    return{...b,units,price,estimatedRevenue,materialCost,totalCOGS,grossProfit,margin,onHold,hasActual};
  });

  const harvestRows=harvestBatches.map(b=>{
    // Gather cultivation inputs for this space
    const spaceInputsCost=cultInputs.filter(ci=>ci.spaceName===b.spaceName).reduce((a,ci)=>a+(parseFloat(ci.totalCost)||0),0);
    const approxDryLbs=(b.totalDryWeight||0)/453.592;
    const costPerLb=approxDryLbs>0?spaceInputsCost/approxDryLbs:0;
    const onHold=qcHolds.includes(String(b.id));
    return{...b,spaceInputsCost,approxDryLbs,costPerLb,onHold};
  });

  const filtered=filter==="all"?rows:filter==="hold"?rows.filter(r=>r.onHold):rows.filter(r=>r.catLabel?.toLowerCase().includes(filter));

  const totalRev=rows.reduce((a,r)=>a+r.estimatedRevenue,0);
  const totalCOGS=rows.reduce((a,r)=>a+r.totalCOGS,0);
  const totalGP=totalRev-totalCOGS;
  const holdCount=rows.filter(r=>r.onHold).length;

  function marginClass(m){return m===null?"":m>=50?"margin-good":m>=25?"margin-mid":"margin-low";}

  return(
    <>
      <style>{CSS}</style>
      <div className="bd-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Batch Cost & Margin Dashboard</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>Estimated revenue, COGS, and gross margin across all production batches</div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          <div className="bd-stat"><div className="bd-stat-l">Est. total revenue</div><div className="bd-stat-v">{fmtC(totalRev)}</div></div>
          <div className="bd-stat"><div className="bd-stat-l">Est. total COGS</div><div className="bd-stat-v">{fmtC(totalCOGS)}</div></div>
          <div className="bd-stat"><div className="bd-stat-l">Est. gross profit</div><div className="bd-stat-v" style={{color:totalGP>=0?"var(--accent-2)":"var(--danger)"}}>{fmtC(totalGP)}</div></div>
          <div className="bd-stat"><div className="bd-stat-l">QC-held batches</div><div className="bd-stat-v" style={{color:holdCount>0?"var(--danger)":"var(--accent-2)"}}>{holdCount}</div></div>
        </div>

        {/* Production batches */}
        <div className="bd-card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Production Batches</div>
            <div style={{display:"flex",gap:6}}>
              {[["all","All"],["flower","Flower"],["extract","Extract"],["pre_roll","Pre-Roll"],["vape","Vape"],["hold","QC Hold"]].map(([v,l])=>(
                <button key={v} onClick={()=>setFilter(v)} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid var(--border-2)",background:filter===v?"var(--accent)":"var(--surface-2)",color:filter===v?"#fff":"var(--text-2)",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:500}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10}}>COGS estimates are based on BOMs and SKU pricing. Set up your BOMs and SKU pricing in the Cost & P&L module for accurate figures. Labor from shift log will feed in automatically in V2.</div>
          {filtered.length===0?(<div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>No production batches. Create batches in the Production Scheduler to see margin data here.</div>):(
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="bd-tbl">
                <thead><tr><th>Batch</th><th>Product</th><th>Est. Units / Qty</th><th>Unit Price</th><th>Est. Revenue</th><th>Est. COGS</th><th>Gross Profit</th><th>Margin</th><th>Status</th></tr></thead>
                <tbody>
                  {filtered.map(r=>(
                    <tr key={r.id} style={{opacity:r.onHold?0.7:1}}>
                      <td style={{fontWeight:500,color:"var(--text)"}}>{r.name}<br/><span style={{fontSize:10,color:"var(--text-3)",fontWeight:400}}>{fmtD(r.d)}</span></td>
                      <td style={{fontSize:11}}>{r.catLabel}{r.subLabel?" / "+r.subLabel:""}</td>
                      <td>{r.units?fmtN(r.units,0):"—"}</td>
                      <td>{r.price?fmtC(r.price):<span style={{color:"var(--text-3)",fontSize:11}}>Set SKU price</span>}</td>
                      <td style={{fontWeight:500,color:"var(--accent-2)"}}>{r.estimatedRevenue>0?fmtC(r.estimatedRevenue):"—"}</td>
                      <td>{r.totalCOGS>0?fmtC(r.totalCOGS):<span style={{color:"var(--text-3)",fontSize:11}}>Set BOM</span>}</td>
                      <td style={{color:r.grossProfit>=0?"var(--accent-2)":"var(--danger)",fontWeight:500}}>{r.estimatedRevenue>0?fmtC(r.grossProfit):"—"}</td>
                      <td>
                        {r.margin!==null?<><span className={"bd-pill "+marginClass(r.margin)}>{r.margin.toFixed(1)}%</span>
                        <div className="bd-bar"><div className="bd-bar-fill" style={{width:Math.min(r.margin,100)+"%",background:r.margin>=50?"var(--accent)":r.margin>=25?"var(--amber)":"var(--danger)"}}/></div></>:"—"}
                      </td>
                      <td>{r.onHold?<span className="bd-pill margin-low">QC HOLD</span>:r.hasActual?<span className="bd-pill margin-good">Actual</span>:<span className="bd-pill" style={{background:"rgba(100,100,100,0.12)",color:"var(--text-3)"}}>Estimated</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Harvest batch cost summary */}
        {harvestRows.length>0&&(
          <div className="bd-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Harvest Batch — Input Cost Summary</div>
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="bd-tbl">
                <thead><tr><th>Strain</th><th>Space</th><th>Dry Weight (lbs)</th><th>Cultivation Input Cost</th><th>Cost per lb</th><th>QC Status</th></tr></thead>
                <tbody>
                  {harvestRows.map(b=>(
                    <tr key={b.id}>
                      <td style={{fontWeight:500,color:"var(--text)"}}>{b.strainName}</td>
                      <td style={{fontSize:11}}>{b.spaceName||"—"}</td>
                      <td>{b.approxDryLbs?fmtN(b.approxDryLbs)+" lbs":"—"}</td>
                      <td>{b.spaceInputsCost?fmtC(b.spaceInputsCost):<span style={{color:"var(--text-3)",fontSize:11}}>Log cultivation inputs</span>}</td>
                      <td style={{fontWeight:500,color:"var(--accent-2)"}}>{b.costPerLb?fmtC(b.costPerLb)+"/lb":"—"}</td>
                      <td>{b.onHold?<span className="bd-pill margin-low">QC HOLD</span>:<span className="bd-pill margin-good">Clear</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
