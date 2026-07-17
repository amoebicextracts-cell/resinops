import { useState, useEffect, useRef } from "react";
import { db } from "./lib/db";

const fmtC = n => "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtN = n => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
const pct  = (a,b) => b>0?(a/b*100).toFixed(1)+"%":"—";

// ── Default BOMs per product type ──────────────────────────────────────────
// qty_type: "per_batch" | "per_lb_input" | "per_unit_output"
const DEFAULT_BOMS = [
  { id:"bom_wf", name:"Whole Flower", catSub:"whole_flower|",
    items:[
      {itemId:"i1", qty:1, qtyType:"per_unit_output", note:"Jar per unit"},
      {itemId:"i5", qty:1, qtyType:"per_unit_output", note:"Label per unit"},
      {itemId:"i6", qty:0.1,qtyType:"per_unit_output",note:"Exit bag (1 per 10 units)"},
    ], testFee:350 },
  { id:"bom_pr", name:"Pre-Roll", catSub:"pre_roll|",
    items:[
      {itemId:"i12",qty:1, qtyType:"per_unit_output", note:"Cone per unit"},
      {itemId:"i14",qty:1, qtyType:"per_unit_output", note:"Tube per unit"},
      {itemId:"i15",qty:1, qtyType:"per_unit_output", note:"Filter tip per unit"},
    ], testFee:350 },
  { id:"bom_bho",name:"BHO Extract",catSub:"extract|shatter",
    items:[
      {itemId:"i7", qty:1.5,qtyType:"per_lb_input",   note:"Butane: 1.5 lbs per lb biomass"},
      {itemId:"i11",qty:2,  qtyType:"per_lb_input",   note:"Filter papers per lb"},
      {itemId:"i2", qty:1,  qtyType:"per_unit_output", note:"Jar per unit"},
    ], testFee:450 },
  { id:"bom_vape",name:"Vape Cartridge",catSub:"vape|cartridge",
    items:[
      {itemId:"i16",qty:1, qtyType:"per_unit_output", note:"510 cart hardware per unit"},
      {itemId:"i5", qty:1, qtyType:"per_unit_output", note:"Label per unit"},
    ], testFee:400 },
  { id:"bom_dist",name:"Distillate",catSub:"extract|distillate",
    items:[
      {itemId:"i9", qty:0.5,qtyType:"per_lb_input",   note:"Ethanol: 0.5 gal per lb biomass"},
      {itemId:"i11",qty:3,  qtyType:"per_lb_input",   note:"Filter papers per lb"},
    ], testFee:500 },
];

const DEDUCT_OPTS = [
  {v:"creation",  l:"At batch creation  — reserves stock immediately"},
  {v:"completion",l:"At batch completion — deducts when marked done"},
  {v:"manual",    l:"Manual trigger      — I confirm deduction myself"},
];

const CSS = `
  .fin-wrap{padding:24px;flex:1;overflow-y:auto;}
  .fin-tabs{display:flex;gap:2px;margin-bottom:18px;background:var(--surface-2);border-radius:8px;padding:3px;}
  .fin-tab{flex:1;padding:7px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;transition:all 0.15s;}
  .fin-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.2);}
  .fin-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .fin-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .fin-inp:focus{outline:none;border-color:var(--accent);}
  .fin-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .fin-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .fin-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .fin-btn:hover{opacity:0.85;}
  .fin-primary{background:var(--accent);color:#fff;}
  .fin-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .fin-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .fin-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .fin-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .fin-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .fin-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .fin-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .fin-tbl tr:last-child td{border-bottom:none;}
  .fin-stat{background:var(--surface-2);border-radius:8px;padding:12px 14px;}
  .fin-stat-lbl{font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;}
  .fin-stat-val{font-size:18px;font-weight:700;color:var(--accent-2);}
  .margin-good{color:var(--accent-2);}
  .margin-warn{color:var(--amber);}
  .margin-bad{color:var(--danger);}
  .pill{font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;}
  .pill-green{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .pill-amber{background:rgba(200,150,58,0.15);color:var(--amber);}
  .pill-red{background:rgba(200,74,74,0.15);color:var(--danger);}
  .pill-blue{background:rgba(90,120,200,0.15);color:#7090f0;}
`;

// ── COGS calculator for a batch ────────────────────────────────────────────
function calcBatchCOGS(batch, boms, cogsRecords, items, laborTypes, facility) {
  const record = cogsRecords.find(r => r.batchId === batch.id) || {};
  const bom = boms.find(b => batch.cat && b.catSub === batch.cat + "|" + (batch.sub || "")) || null;
  const inputLbs = (parseFloat(batch.inputAmt)||0) * (batch.unit==="lb"||batch.unit==="lbs"?1:batch.unit==="kg"?2.205:1/453.592);
  // Extract unit count from yieldEst string
  const unitMatch = batch.yieldEst?.match(/[\d,]+(?=\s*×|units|cones|carts|AIOs|bottles)/);
  const estUnits  = unitMatch ? parseInt(unitMatch[0].replace(/,/g,"")) : 0;
  const actualUnits = parseInt(record.actualUnits||0) || estUnits;

  // Materials from BOM
  let materialCost = 0;
  const materialLines = [];
  if (bom && !record.overrideMaterials) {
    bom.items.forEach(line => {
      const item = items.find(x=>x.id===line.itemId);
      if (!item) return;
      // unit cost
      const uc = item.lastCost || 0;
      let qty = 0;
      if (line.qtyType==="per_unit_output") qty = line.qty * (actualUnits||estUnits);
      else if (line.qtyType==="per_lb_input") qty = line.qty * inputLbs;
      else qty = line.qty;
      const cost = qty * uc;
      materialCost += cost;
      materialLines.push({ name:item.n, qty:fmtN(qty), uom:item.uom, uc:fmtC(uc), cost });
    });
  } else if (record.manualMaterials) {
    (record.manualMaterials||[]).forEach(m => { materialCost += parseFloat(m.cost)||0; materialLines.push(m); });
  }

  // Override from record
  if (record.materialCostOverride !== undefined) materialCost = parseFloat(record.materialCostOverride)||0;

  // Testing fee
  const testFee = parseFloat(record.testFee !== undefined ? record.testFee : (bom?.testFee||350));

  // Labor cost — from batch steps if available
  let laborCost = parseFloat(record.laborCostOverride||0);
  if (!record.laborCostOverride && batch.steps) {
    const sh = parseFloat(facility?.shiftHours||8);
    batch.steps.forEach(step => {
      if (step.laborTypeId) {
        const lt = laborTypes.find(x=>x.id===step.laborTypeId);
        if (lt) {
          const hrs = step.isPassive
            ? (step.monitorHrsPerDay||0.25)*(step.calDays||step.days||1)
            : parseFloat(step.hours||sh);
          laborCost += hrs * lt.rate;
        }
      }
    });
  }

  // Cultivation cost if linked
  const cultCost = parseFloat(record.cultCost||0);

  const totalCOGS = materialCost + testFee + laborCost + cultCost;
  const units = actualUnits || estUnits || 1;
  const cogsPerUnit = units > 0 ? totalCOGS / units : 0;

  return { materialCost, materialLines, testFee, laborCost, cultCost, totalCOGS, cogsPerUnit, estUnits, actualUnits, bom };
}

export default function Finance() {
  const [tab, setTab] = useState("cogs");

  const [boms, setBoms] = useState([]);
  const [cogsRecs, setCogsRecs] = useState([]);
  const [skus, setSkus] = useState([]);
  const [cultCosts, setCultCosts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [b, sk, pb, sp, inv, lt, cr, cc]=await Promise.all([
          db.boms.list(),
          db.skus.list(),
          db.production_batches.list(),
          db.grow_spaces.list(),
          db.inventory_items.list(),
          db.labor_types.list(),
          db.cogs_records.list(),
          db.cultivation_costs.list(),
        ]);
        setBoms(b);
        setSkus(sk);
        setBatches(pb);
        setSpaces(sp);
        setItems(inv);
        setLaborTypes(lt);
        setCogsRecs(cr);
        setCultCosts(cc);
      }catch(e){ console.error("Finance load error:",e); }
      setLoading(false);
    }
    load();
  },[]);
  const [laborTypes, setLaborTypes] = useState([]);
  const [facility, setFacility] = useState({});


  const [editCogs, setEditCogs] = useState(null); // batchId being edited
  const [editSku, setEditSku]   = useState(null);
  const [editCult, setEditCult] = useState(null);

  // Debounced persistence: keep UI updates instant (every keystroke updates
  // local state so COGS/P&L figures recalculate live) while collapsing the
  // actual db.upsert() calls to one per ~600ms pause in typing.
  const saveTimers = useRef({});
  function scheduleSave(timerKey, table, record) {
    clearTimeout(saveTimers.current[timerKey]);
    saveTimers.current[timerKey] = setTimeout(async () => {
      try { await db[table].upsert(record); }
      catch(e){ console.error(table+" save failed:", e); }
    }, 600);
  }

  function getRecord(batchId) { return cogsRecs.find(r=>r.batchId===batchId)||{}; }
  function setRecord(batchId, updates) {
    setCogsRecs(p => {
      const idx = p.findIndex(r=>r.batchId===batchId);
      const merged = idx>=0 ? {...p[idx],...updates} : {id:crypto.randomUUID(),batchId,...updates};
      scheduleSave("cogs_"+batchId, "cogs_records", merged);
      return idx>=0 ? p.map(r=>r.batchId===batchId?merged:r) : [...p, merged];
    });
  }

  function setCultCost(spaceId, updates) {
    setCultCosts(p => {
      const idx = p.findIndex(c=>c.spaceId===spaceId);
      const merged = idx>=0 ? {...p[idx],...updates} : {id:crypto.randomUUID(),spaceId,...updates};
      scheduleSave("cult_"+spaceId, "cultivation_costs", merged);
      return idx>=0 ? p.map(c=>c.spaceId===spaceId?merged:c) : [...p, merged];
    });
  }

  const allBoms = boms.length ? boms : DEFAULT_BOMS;
  const mainBatches = batches.filter(b=>!b.isLinked);

  // ── P&L calculation per batch ────────────────────────────────────────────
  function batchPnL(batch) {
    const cogs = calcBatchCOGS(batch, allBoms, cogsRecs, items, laborTypes, facility);
    const rec  = getRecord(batch.id);
    const unitsSold = parseInt(rec.unitsSold||0);
    const skuPriceId = rec.skuPriceId;
    const sku   = skus.find(s=>s.id===skuPriceId);
    const revPerUnit = parseFloat(rec.revPerUnit || sku?.price || 0);
    const totalRevOverride = parseFloat(rec.totalRevOverride||0);
    const totalRev = totalRevOverride || (revPerUnit * unitsSold);
    const grossProfit = totalRev - cogs.totalCOGS;
    const grossMargin = totalRev > 0 ? (grossProfit/totalRev*100) : 0;
    return { ...cogs, unitsSold, revPerUnit, totalRev, totalRevOverride, grossProfit, grossMargin, sku };
  }

  // ── Summary totals ────────────────────────────────────────────────────────
  const summary = mainBatches.reduce((acc, b) => {
    const p = batchPnL(b);
    acc.totalCOGS += p.totalCOGS;
    acc.totalRev  += p.totalRev;
    acc.materialCost += p.materialCost;
    acc.laborCost += p.laborCost;
    acc.testFee += p.testFee;
    acc.cultCost += p.cultCost;
    return acc;
  }, {totalCOGS:0,totalRev:0,materialCost:0,laborCost:0,testFee:0,cultCost:0});
  const totalGrossProfit = summary.totalRev - summary.totalCOGS;
  const totalGrossMargin = summary.totalRev > 0 ? totalGrossProfit/summary.totalRev*100 : 0;

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading finance…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="fin-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Cost & P&L</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>COGS per batch · 280E-structured · P&L summary</div>
        </div>

        <div className="fin-tabs">
          {[["cogs","📊 Batch COGS"],["pnl","💰 P&L Summary"],["bom","🧾 Bill of Materials"],["cult","🌿 Cultivation Costs"],["sku","🏷️ SKU Pricing"]].map(([v,l])=>(
            <button key={v} className={"fin-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── BATCH COGS ── */}
        {tab==="cogs" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Total COGS (all batches)",v:fmtC(summary.totalCOGS)},
                {l:"Materials",v:fmtC(summary.materialCost)},
                {l:"Labor",v:fmtC(summary.laborCost)},
                {l:"Testing fees",v:fmtC(summary.testFee)},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className="fin-stat-val">{s.v}</div></div>)}
            </div>

            {mainBatches.length===0 ? (
              <div className="fin-card" style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No production batches yet.</div>
            ) : mainBatches.map(batch => {
              const cogs = calcBatchCOGS(batch, allBoms, cogsRecs, items, laborTypes, facility);
              const rec  = getRecord(batch.id);
              const isEditing = editCogs===batch.id;
              return (
                <div key={batch.id} className="fin-card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{batch.name}</div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>{batch.catLabel}{batch.subLabel?" — "+batch.subLabel:""} · {batch.inputAmt}{batch.unit} input · {cogs.estUnits.toLocaleString()} est. units</div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--accent-2)"}}>{fmtC(cogs.totalCOGS)}</div>
                        <div style={{fontSize:11,color:"var(--text-3)"}}>{fmtC(cogs.cogsPerUnit)}/unit</div>
                      </div>
                      <button className={"fin-btn fin-sm "+(isEditing?"fin-secondary":"fin-edit")} onClick={()=>setEditCogs(isEditing?null:batch.id)}>
                        {isEditing?"Close":"Edit COGS"}
                      </button>
                    </div>
                  </div>

                  {/* COGS breakdown */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
                    {[
                      {l:"Materials",v:fmtC(cogs.materialCost)},
                      {l:"Labor",v:fmtC(cogs.laborCost)},
                      {l:"Testing",v:fmtC(cogs.testFee)},
                      {l:"Cultivation",v:fmtC(cogs.cultCost)},
                    ].map((s,i)=>(
                      <div key={i} style={{background:"var(--surface-2)",borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l}</div>
                        <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  {isEditing && (
                    <div style={{borderTop:"1px solid var(--border)",paddingTop:14,marginTop:4}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Override COGS</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
                        <div>
                          <label className="fin-lbl">Material cost override ($) — leave blank to use BOM</label>
                          <input type="number" className="fin-inp" step="0.01"
                            value={rec.materialCostOverride??""} placeholder={fmtN(cogs.materialCost)+" (BOM est.)"}
                            onChange={e=>setRecord(batch.id,{materialCostOverride:e.target.value||undefined})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Labor cost override ($) — leave blank to auto-calculate</label>
                          <input type="number" className="fin-inp" step="0.01"
                            value={rec.laborCostOverride??""} placeholder={fmtN(cogs.laborCost)+" (est.)"}
                            onChange={e=>setRecord(batch.id,{laborCostOverride:e.target.value||undefined})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Lab testing fee ($)</label>
                          <input type="number" className="fin-inp" step="1"
                            value={rec.testFee??""} placeholder="350"
                            onChange={e=>setRecord(batch.id,{testFee:e.target.value})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Cultivation cost allocation ($)</label>
                          <input type="number" className="fin-inp" step="0.01"
                            value={rec.cultCost??""} placeholder="0"
                            onChange={e=>setRecord(batch.id,{cultCost:e.target.value})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Actual units produced</label>
                          <input type="number" className="fin-inp"
                            value={rec.actualUnits??""} placeholder={String(cogs.estUnits)+" (estimated)"}
                            onChange={e=>setRecord(batch.id,{actualUnits:e.target.value})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Inventory deduction trigger</label>
                          <select className="fin-sel"
                            value={rec.deductTrigger||"creation"}
                            onChange={e=>setRecord(batch.id,{deductTrigger:e.target.value})}>
                            {DEDUCT_OPTS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* BOM material lines */}
                      {cogs.materialLines.length > 0 && (
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:11,fontWeight:700,color:"var(--text-3)",marginBottom:6}}>BOM Material Breakdown</div>
                          <div style={{border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
                            <table className="fin-tbl">
                              <thead><tr><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th></tr></thead>
                              <tbody>
                                {cogs.materialLines.map((ml,i)=>(
                                  <tr key={i}>
                                    <td>{ml.name}</td>
                                    <td>{ml.qty} {ml.uom}</td>
                                    <td>{ml.uc}</td>
                                    <td style={{color:"var(--accent-2)"}}>{fmtC(ml.cost)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {items.some(x=>x.lastCost===0) && (
                            <div style={{fontSize:11,color:"var(--amber)",marginTop:6}}>⚠ Some items have $0 cost — receive a PO in Inventory to set purchase prices.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ── P&L SUMMARY ── */}
        {tab==="pnl" && (
          <>
            {/* 280E callout */}
            <div style={{background:"rgba(90,120,200,0.08)",border:"1px solid rgba(90,120,200,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#7090f0"}}>
              <strong>280E Note:</strong> Under IRS 280E, cannabis businesses may only deduct Cost of Goods Sold federally. All COGS figures below are structured for 280E compliance. Share the COGS column directly with your accountant or tax advisor.
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Total Revenue",v:fmtC(summary.totalRev)},
                {l:"Total COGS (280E deductible)",v:fmtC(summary.totalCOGS)},
                {l:"Gross Profit",v:fmtC(totalGrossProfit),cls:totalGrossProfit>0?"margin-good":totalGrossProfit<0?"margin-bad":""},
                {l:"Gross Margin",v:pct(totalGrossProfit,summary.totalRev),cls:totalGrossMargin>50?"margin-good":totalGrossMargin>25?"margin-warn":"margin-bad"},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>

            {/* Per batch P&L */}
            <div className="fin-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Batch P&L</div>
                <div style={{fontSize:11,color:"var(--text-3)"}}>Enter units sold and revenue to calculate margin</div>
              </div>
              {mainBatches.length===0 ? (
                <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No batches yet.</div>
              ) : (
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                  <table className="fin-tbl">
                    <thead>
                      <tr><th>Batch</th><th>Product</th><th>Units Sold</th><th>Rev/Unit ($)</th><th>Total Rev</th><th>COGS</th><th>Gross Profit</th><th>Margin</th></tr>
                    </thead>
                    <tbody>
                      {mainBatches.map(batch => {
                        const p = batchPnL(batch);
                        const rec = getRecord(batch.id);
                        const cls = p.grossMargin>=50?"pill-green":p.grossMargin>=25?"pill-amber":"pill-red";
                        return (
                          <tr key={batch.id}>
                            <td style={{fontWeight:500,color:"var(--text)",whiteSpace:"nowrap"}}>{batch.name}</td>
                            <td style={{fontSize:11,whiteSpace:"nowrap"}}>{batch.catLabel}{batch.subLabel?" — "+batch.subLabel:""}</td>
                            <td>
                              <input type="number" min="0" style={{width:70,background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:5,color:"var(--text)",fontSize:12,padding:"2px 6px",fontFamily:"monospace"}}
                                value={rec.unitsSold||""}
                                placeholder={String(p.estUnits)}
                                onChange={e=>setRecord(batch.id,{unitsSold:e.target.value})} />
                            </td>
                            <td>
                              <input type="number" min="0" step="0.01" style={{width:70,background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:5,color:"var(--text)",fontSize:12,padding:"2px 6px",fontFamily:"monospace"}}
                                value={rec.revPerUnit||""}
                                placeholder="0.00"
                                onChange={e=>setRecord(batch.id,{revPerUnit:e.target.value})} />
                            </td>
                            <td>
                              {p.totalRevOverride ? (
                                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                  <input type="number" min="0" step="0.01" style={{width:85,background:"var(--surface-2)",border:"1px solid var(--accent)",borderRadius:5,color:"var(--text)",fontSize:12,padding:"2px 6px",fontFamily:"monospace"}}
                                    value={rec.totalRevOverride||""}
                                    onChange={e=>setRecord(batch.id,{totalRevOverride:e.target.value})} />
                                </div>
                              ) : (
                                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                  <span style={{fontWeight:500,color:"var(--accent-2)"}}>{fmtC(p.totalRev)}</span>
                                  <button className="fin-btn fin-sm fin-edit" style={{fontSize:9,padding:"2px 5px"}} onClick={()=>setRecord(batch.id,{totalRevOverride:String(p.totalRev)})}>Override</button>
                                </div>
                              )}
                            </td>
                            <td style={{color:"var(--text-2)"}}>{fmtC(p.totalCOGS)}</td>
                            <td style={{fontWeight:500,color:p.grossProfit>0?"var(--accent-2)":p.grossProfit<0?"var(--danger)":"var(--text-2)"}}>{fmtC(p.grossProfit)}</td>
                            <td>{p.totalRev>0?<span className={"pill "+cls}>{p.grossMargin.toFixed(1)}%</span>:<span style={{color:"var(--text-3)"}}>—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* COGS breakdown for 280E */}
            <div className="fin-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>COGS Components — 280E Reference</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {[
                  {l:"Raw Materials",v:fmtC(summary.materialCost),pct:pct(summary.materialCost,summary.totalCOGS)},
                  {l:"Direct Labor",v:fmtC(summary.laborCost),pct:pct(summary.laborCost,summary.totalCOGS)},
                  {l:"Lab Testing",v:fmtC(summary.testFee),pct:pct(summary.testFee,summary.totalCOGS)},
                  {l:"Cultivation Costs",v:fmtC(summary.cultCost),pct:pct(summary.cultCost,summary.totalCOGS)},
                ].map((s,i)=>(
                  <div key={i} className="fin-stat">
                    <div className="fin-stat-lbl">{s.l}</div>
                    <div className="fin-stat-val">{s.v}</div>
                    <div style={{fontSize:11,color:"var(--text-3)"}}>{s.pct} of COGS</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── BOM ── */}
        {tab==="bom" && (
          <div className="fin-card">
            <div style={{fontSize:12,color:"var(--text-2)",marginBottom:14}}>
              Bill of Materials defines what inventory is consumed per batch. Default BOMs are pre-loaded — edit to match your actual usage. Quantities can be per batch, per lb of input, or per unit of output.
            </div>
            {allBoms.map((bom,bi) => (
              <div key={bom.id} style={{border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{bom.name}</div>
                  <div style={{fontSize:11,color:"var(--text-3)"}}>Default testing fee: {fmtC(bom.testFee)}</div>
                </div>
                {bom.items.length===0 ? (
                  <div style={{fontSize:12,color:"var(--text-3)"}}>No BOM lines defined.</div>
                ) : (
                  <div style={{border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
                    <table className="fin-tbl">
                      <thead><tr><th>Item</th><th>Qty</th><th>Per</th><th>Note</th></tr></thead>
                      <tbody>
                        {bom.items.map((line,li)=>{
                          const item = items.find(x=>x.id===line.itemId);
                          return (
                            <tr key={li}>
                              <td style={{color:"var(--text)"}}>{item?.n||line.itemId}</td>
                              <td>{fmtN(line.qty)} {item?.uom}</td>
                              <td style={{fontSize:11,color:"var(--text-3)"}}>{line.qtyType==="per_unit_output"?"per output unit":line.qtyType==="per_lb_input"?"per lb input":"per batch"}</td>
                              <td style={{fontSize:11,color:"var(--text-3)"}}>{line.note}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <div style={{fontSize:12,color:"var(--text-3)",marginTop:8}}>
              Full BOM editing (add/remove lines, custom BOMs per product type) coming in the next update.
            </div>
          </div>
        )}

        {/* ── CULTIVATION COSTS ── */}
        {tab==="cult" && (
          <div className="fin-card">
            <div style={{fontSize:12,color:"var(--text-2)",marginBottom:14}}>
              Track cultivation supply costs per grow space. These costs can be allocated to production batches as COGS when the harvest batch is created.
            </div>
            {spaces.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No grow spaces scheduled yet.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="fin-tbl">
                  <thead><tr><th>Grow Space</th><th>Strain</th><th>Plants</th><th>Media / Setup</th><th>Nutrients (est.)</th><th>IPM (est.)</th><th>Total Cult. Cost</th><th></th></tr></thead>
                  <tbody>
                    {spaces.map(sp => {
                      const cc = cultCosts.find(c=>c.spaceId===sp.id)||{};
                      const isEditing = editCult===sp.id;
                      const total = (parseFloat(cc.media)||0)+(parseFloat(cc.nutrients)||0)+(parseFloat(cc.ipm)||0)+(parseFloat(cc.other)||0);
                      return (
                        <tr key={sp.id}>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{sp.name}</td>
                          <td>{sp.strain||"—"}</td>
                          <td>{sp.plants||"—"}</td>
                          <td>
                            {isEditing ? <input type="number" step="0.01" className="fin-inp" value={cc.media||""} placeholder="0.00" style={{width:90}} onChange={e=>setCultCost(sp.id,{media:e.target.value})} /> : fmtC(cc.media||0)}
                          </td>
                          <td>
                            {isEditing ? <input type="number" step="0.01" className="fin-inp" value={cc.nutrients||""} placeholder="0.00" style={{width:90}} onChange={e=>setCultCost(sp.id,{nutrients:e.target.value})} /> : fmtC(cc.nutrients||0)}
                          </td>
                          <td>
                            {isEditing ? <input type="number" step="0.01" className="fin-inp" value={cc.ipm||""} placeholder="0.00" style={{width:90}} onChange={e=>setCultCost(sp.id,{ipm:e.target.value})} /> : fmtC(cc.ipm||0)}
                          </td>
                          <td style={{fontWeight:500,color:"var(--accent-2)"}}>{fmtC(total)}</td>
                          <td><button className={"fin-btn fin-sm "+(isEditing?"fin-secondary":"fin-edit")} onClick={()=>setEditCult(isEditing?null:sp.id)}>{isEditing?"Done":"Edit"}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SKU PRICING ── */}
        {tab==="sku" && (
          <div className="fin-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text-2)"}}>Set selling prices per product and package size. Used to calculate revenue in the P&L view.</div>
              {!editSku && <button className="fin-btn fin-primary" onClick={()=>setEditSku({id:"sku"+Date.now(),product:"",size:"",channel:"retail",price:""})}>+ Add SKU</button>}
            </div>

            {editSku && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="fin-lbl">Product / SKU name</label><input className="fin-inp" value={editSku.product} onChange={e=>setEditSku(s=>({...s,product:e.target.value}))} placeholder="Whole Flower — 3.5g" /></div>
                  <div><label className="fin-lbl">Package size</label><input className="fin-inp" value={editSku.size} onChange={e=>setEditSku(s=>({...s,size:e.target.value}))} placeholder="3.5g" /></div>
                  <div><label className="fin-lbl">Channel</label><select className="fin-sel" value={editSku.channel} onChange={e=>setEditSku(s=>({...s,channel:e.target.value}))}><option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="direct">Direct</option></select></div>
                  <div><label className="fin-lbl">Price per unit ($)</label><input type="number" step="0.01" className="fin-inp" value={editSku.price} onChange={e=>setEditSku(s=>({...s,price:e.target.value}))} placeholder="15.00" /></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button className="fin-btn fin-primary" onClick={async()=>{if(!editSku.product){return;}try{const s={...editSku,id:editSku.id||crypto.randomUUID()};const saved=await db.skus.upsert(s);setSkus(p=>{const i=p.findIndex(x=>x.id===saved.id);return i>=0?p.map(x=>x.id===saved.id?saved:x):[...p,saved];});setEditSku(null);}catch(e){console.error("SKU save failed:",e);}}}>Save</button>
                  <button className="fin-btn fin-secondary" onClick={()=>setEditSku(null)}>Cancel</button>
                </div>
              </div>
            )}

            {skus.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No SKUs defined. Add selling prices to calculate P&L margins.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="fin-tbl">
                  <thead><tr><th>Product</th><th>Package</th><th>Channel</th><th>Price/Unit</th><th></th></tr></thead>
                  <tbody>
                    {skus.map(sku=>(
                      <tr key={sku.id}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{sku.product}</td>
                        <td>{sku.size}</td>
                        <td><span className={"pill "+(sku.channel==="retail"?"pill-green":sku.channel==="wholesale"?"pill-amber":"pill-blue")}>{sku.channel}</span></td>
                        <td style={{color:"var(--accent-2)",fontWeight:600}}>{fmtC(sku.price)}</td>
                        <td><div style={{display:"flex",gap:6}}>
                          <button className="fin-btn fin-sm fin-edit" onClick={()=>setEditSku(sku)}>Edit</button>
                          <button className="fin-btn fin-sm fin-del" onClick={async()=>{try{await db.skus.delete(sku.id);setSkus(p=>p.filter(x=>x.id!==sku.id));}catch(e){console.error(e);}}}>✕</button>
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
