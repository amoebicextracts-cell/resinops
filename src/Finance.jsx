import { useState, useEffect, useRef } from "react";
import { db } from "./lib/db";
import { supabase, getCurrentFacility } from "./lib/supabase";
import { deductForBatch } from "./lib/inventory";
import { calcBatchCOGS, batchPnL as batchPnLCalc, calcEquipmentDepreciationPool, calcNonDeductibleCostPoolRemainder } from "./lib/cogs";
import { exportQuickBooksCsv } from "./lib/quickbooksExport";
import { CATS, SUBS } from "./ProductionScheduler.jsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const QTY_TYPES = [
  {v:"per_unit_output",l:"per output unit"},
  {v:"per_lb_input",l:"per lb input"},
  {v:"per_batch",l:"per batch (flat)"},
];

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

export default function Finance() {
  const [tab, setTab] = useState("cogs");

  const [boms, setBoms] = useState([]);
  const [cogsRecs, setCogsRecs] = useState([]);
  const [skus, setSkus] = useState([]);
  const [cultCosts, setCultCosts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [items, setItems] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [opex, setOpex] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [b, sk, pb, sp, inv, lt, cr, cc, so, hb, cp, eq, oe]=await Promise.all([
          db.boms.list(),
          db.skus.list(),
          db.production_batches.list(),
          db.grow_spaces.list(),
          db.inventory_items.list(),
          db.labor_types.list(),
          db.cogs_records.list(),
          db.cultivation_costs.list(),
          db.sales_orders.list(),
          db.harvest_batches.list(),
          db.cost_pools.list(),
          db.equipment.list(),
          db.operating_expenses.list(),
        ]);
        setBoms(b);
        setSkus(sk);
        setBatches(pb);
        setSpaces(sp);
        setItems(inv);
        setLaborTypes(lt);
        setCogsRecs(cr);
        setCultCosts(cc);
        setSalesOrders(so);
        setHarvestBatches(hb);
        setCostPools(cp);
        setEquipment(eq);
        setOpex(oe);
        const fid = getCurrentFacility();
        if(fid && supabase){
          const { data } = await supabase.from('facilities').select('facility_name,license_number,shift_hours,shifts_per_day,default_cultivation_allocation_basis,qb_account_map').eq('id', fid).single();
          if(data) setFacility({facilityName:data.facility_name||"",licenseNumber:data.license_number||"",shiftHours:String(data.shift_hours??8),shiftsPerDay:String(data.shifts_per_day??1),defaultCultivationAllocationBasis:data.default_cultivation_allocation_basis||"batch_weight",qbAccountMap:data.qb_account_map||{}});
        } else {
          try{ const s = JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}"); setFacility(f=>({...f,qbAccountMap:s.qbAccountMap||{},facilityName:s.facilityName||"",licenseNumber:s.licenseNumber||""})); }catch{}
        }
      }catch(e){ console.error("Finance load error:",e); }
      setLoading(false);
    }
    load();
  },[]);
  const [laborTypes, setLaborTypes] = useState([]);
  const [facility, setFacility] = useState({});
  const [harvestBatches, setHarvestBatches] = useState([]);
  const [costPools, setCostPools] = useState([]);


  const [editCogs, setEditCogs] = useState(null); // batchId being edited
  const [editSku, setEditSku]   = useState(null);
  const [editCult, setEditCult] = useState(null);
  const [bomForm, setBomForm]   = useState(null);

  function openAddBom(){ setBomForm({id:crypto.randomUUID(),name:"",category:CATS[0].v,subcategory:"",testFee:"350",items:[]}); setErr2(""); }
  function openEditBom(bom){ setBomForm({...bom,testFee:String(bom.testFee||350),items:(bom.items||[]).map(i=>({...i}))}); setErr2(""); }
  function addBomLine(){ setBomForm(f=>({...f,items:[...f.items,{itemId:"",qty:"1",qtyType:"per_unit_output",note:""}]})); }
  function setBomLine(i,k,v){ setBomForm(f=>({...f,items:f.items.map((l,idx)=>idx===i?{...l,[k]:v}:l)})); }
  function removeBomLine(i){ setBomForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)})); }
  const [errBom, setErr2] = useState("");
  async function saveBom(){
    if(!bomForm.name.trim()){ setErr2("Enter a BOM name."); return; }
    const toSave = {...bomForm, name:bomForm.name.trim(), testFee:parseFloat(bomForm.testFee)||0,
      items: bomForm.items.map(l=>({...l, qty:parseFloat(l.qty)||0}))};
    try{
      const saved = await db.boms.upsert(toSave);
      setBoms(p=>{const i=p.findIndex(b=>b.id===saved.id);return i>=0?p.map(b=>b.id===saved.id?saved:b):[...p,saved];});
      setBomForm(null); setErr2("");
    }catch(e){ setErr2("Save failed: "+e.message); }
  }
  async function removeBom(id){
    try{ await db.boms.delete(id); setBoms(p=>p.filter(b=>b.id!==id)); }
    catch(e){ console.error("BOM delete failed:",e); }
  }

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

  const [deductMsg, setDeductMsg] = useState({});
  async function deductNow(batch){
    const { updatedItems, shortfalls, bom, materialLines } = deductForBatch(batch, allBoms, items);
    if (!bom) { setDeductMsg(p=>({...p,[batch.id]:"No BOM matches this batch's category/subcategory — nothing to deduct."})); return; }
    try{
      if (updatedItems.length) {
        const saved = await Promise.all(updatedItems.map(it=>db.inventory_items.upsert(it)));
        setItems(p=>p.map(it=>{ const u=saved.find(s=>s.id===it.id); return u||it; }));
      }
      setDeductMsg(p=>({...p,[batch.id]: shortfalls.length
        ? `⚠ Ran short on: ${shortfalls.map(s=>s.itemName+" ("+s.shortfall.toFixed(1)+" short)").join(", ")}.`
        : `✓ Deducted per the "${bom.name}" BOM.`}));
      // Lock in the materials actually deducted, unless the user already
      // set an explicit override for this batch — deduction shouldn't
      // silently clobber a deliberate manual choice.
      const rec = getRecord(batch.id);
      if (materialLines.length && !rec.materialCostOverride && !rec.overrideMaterials) {
        setRecord(batch.id, {manualMaterials:materialLines, overrideMaterials:true, materialsLockedAt:new Date().toISOString()});
      }
    }catch(e){ setDeductMsg(p=>({...p,[batch.id]:"Deduction failed: "+e.message})); }
  }
  function unlockMaterials(batch){
    setRecord(batch.id, {manualMaterials:undefined, overrideMaterials:undefined, materialsLockedAt:undefined});
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
      const merged = idx>=0 ? {...p[idx],...updates} : {id:crypto.randomUUID(),spaceId,allocationBasis:facility.defaultCultivationAllocationBasis||"batch_weight",...updates};
      scheduleSave("cult_"+spaceId, "cultivation_costs", merged);
      return idx>=0 ? p.map(c=>c.spaceId===spaceId?merged:c) : [...p, merged];
    });
  }

  const [costPoolForm, setCostPoolForm] = useState(null);
  const [errCostPool, setErrCostPool] = useState("");
  function openAddCostPool(){ setCostPoolForm({id:crypto.randomUUID(),name:"",category:"rent",periodAmount:"",period:"monthly",productionPct:"100",allocationBasis:"batch_weight",active:true,notes:""}); setErrCostPool(""); }
  async function saveCostPool(){
    if(!costPoolForm.name.trim()){ setErrCostPool("Enter a name for this cost pool."); return; }
    const toSave = {...costPoolForm, name:costPoolForm.name.trim(), periodAmount:parseFloat(costPoolForm.periodAmount)||0, productionPct:parseFloat(costPoolForm.productionPct)||100};
    try{
      const saved = await db.cost_pools.upsert(toSave);
      setCostPools(p=>{const i=p.findIndex(c=>c.id===saved.id);return i>=0?p.map(c=>c.id===saved.id?saved:c):[...p,saved];});
      setCostPoolForm(null); setErrCostPool("");
    }catch(e){ setErrCostPool("Save failed: "+e.message); }
  }
  async function removeCostPool(id){
    try{ await db.cost_pools.delete(id); setCostPools(p=>p.filter(c=>c.id!==id)); }
    catch(e){ console.error("Cost pool delete failed:",e); }
  }
  async function toggleCostPoolActive(pool){
    try{
      const saved = await db.cost_pools.upsert({...pool, active: !pool.active});
      setCostPools(p=>p.map(c=>c.id===pool.id?saved:c));
    }catch(e){ console.error("Cost pool toggle failed:",e); }
  }

  const [opexForm, setOpexForm] = useState(null);
  const [errOpex, setErrOpex] = useState("");
  function openAddOpex(){ setOpexForm({id:crypto.randomUUID(),name:"",category:"g_and_a",amount:"",date:new Date().toISOString().split("T")[0],notes:""}); setErrOpex(""); }
  async function saveOpex(){
    if(!opexForm.name.trim()){ setErrOpex("Enter a name for this expense."); return; }
    const toSave = {...opexForm, name:opexForm.name.trim(), amount:parseFloat(opexForm.amount)||0};
    try{
      const saved = await db.operating_expenses.upsert(toSave);
      setOpex(p=>{const i=p.findIndex(o=>o.id===saved.id);return i>=0?p.map(o=>o.id===saved.id?saved:o):[...p,saved];});
      setOpexForm(null); setErrOpex("");
    }catch(e){ setErrOpex("Save failed: "+e.message); }
  }
  async function removeOpex(id){
    try{ await db.operating_expenses.delete(id); setOpex(p=>p.filter(o=>o.id!==id)); }
    catch(e){ console.error("Operating expense delete failed:",e); }
  }

  const allBoms = boms.length ? boms : DEFAULT_BOMS;
  const mainBatches = batches.filter(b=>!b.isLinked);

  // ── P&L calculation per batch ────────────────────────────────────────────
  // Thin wrapper over the shared lib/cogs.js engine — Finance.jsx and
  // BatchDashboard.jsx both call the exact same calculator now instead of
  // each keeping their own (previously divergent) COGS logic.
  const cogsCtx = { boms: allBoms, cogsRecords: cogsRecs, items, laborTypes, costPools, cultivationCosts: cultCosts, harvestBatches, growSpaces: spaces, allBatches: mainBatches, skus, salesOrders, equipment };
  function batchPnL(batch) { return batchPnLCalc(batch, cogsCtx); }

  // ── Summary totals ────────────────────────────────────────────────────────
  const summary = mainBatches.reduce((acc, b) => {
    const p = batchPnL(b);
    acc.totalCOGS += p.totalCOGS;
    acc.totalRev  += p.totalRev;
    acc.materialCost += p.materialCost;
    acc.directLaborCost += p.directLaborCost;
    acc.testFee += p.testFee;
    acc.cultivationCost += p.cultivationCost;
    acc.allocatedOverhead += p.allocatedOverhead;
    return acc;
  }, {totalCOGS:0,totalRev:0,materialCost:0,directLaborCost:0,testFee:0,cultivationCost:0,allocatedOverhead:0});

  // ── Annual 280E Summary — rolls up capitalized COGS (§263A) vs. anything
  // flagged not-capitalized, for every batch dated in the selected year.
  // This is not a full return — it's the capitalized-COGS side of the
  // picture only; review with a tax advisor before filing.
  const summaryYears = Array.from(new Set(mainBatches.filter(b=>b.d).map(b=>new Date(b.d+"T00:00:00").getFullYear()))).sort();
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const yearBatches = mainBatches.filter(b => b.d && new Date(b.d+"T00:00:00").getFullYear() === summaryYear);
  const annualSummary = yearBatches.reduce((acc, b) => {
    const p = batchPnL(b);
    acc.materialCost += p.materialCost;
    acc.directLaborCost += p.directLaborCost;
    acc.testFee += p.testFee;
    acc.cultivationCost += p.cultivationCost;
    acc.allocatedOverhead += p.allocatedOverhead;
    acc.deductibleTotal += p.deductibleTotal;
    acc.nonDeductibleTotal += p.nonDeductibleTotal;
    acc.totalRev += p.totalRev;
    acc.totalCOGS += p.totalCOGS;
    acc.bookedRevenue += p.hasBookedOrders ? p.totalRev : 0;
    for (const line of (p.overheadLines||[])) acc.poolBreakdown[line.name] = (acc.poolBreakdown[line.name]||0) + line.share;
    return acc;
  }, {materialCost:0,directLaborCost:0,testFee:0,cultivationCost:0,allocatedOverhead:0,deductibleTotal:0,nonDeductibleTotal:0,totalRev:0,totalCOGS:0,bookedRevenue:0,poolBreakdown:{}});
  annualSummary.totalCapitalized = annualSummary.materialCost + annualSummary.directLaborCost + annualSummary.testFee + annualSummary.cultivationCost + annualSummary.allocatedOverhead;
  annualSummary.estimatedRevenue = annualSummary.totalRev - annualSummary.bookedRevenue;
  annualSummary.grossProfit = annualSummary.totalRev - annualSummary.totalCOGS;
  annualSummary.grossMargin = annualSummary.totalRev>0 ? annualSummary.grossProfit/annualSummary.totalRev*100 : 0;

  // ── Non-deductible operating expenses — the other side of §280E. Kept
  // separate from annualSummary.nonDeductibleTotal (a per-batch flag) since
  // these are a different judgment call: facility-level G&A that was never
  // COGS-eligible, not a specific batch someone excluded.
  const yearOpex = opex.filter(o => o.date && new Date(o.date+"T00:00:00").getFullYear() === summaryYear);
  const opexTotal = yearOpex.reduce((s,o)=>s+(parseFloat(o.amount)||0),0);
  const costPoolRemainder = calcNonDeductibleCostPoolRemainder(costPools, equipment);
  const totalNonDeductible = annualSummary.nonDeductibleTotal + costPoolRemainder.total + opexTotal;

  // ── Net Income — the P&L Summary tab's actual bottom line. Gross Profit
  // alone isn't a P&L; subtracting Operating Expenses (cost pools' non-
  // production share + logged OpEx, same figures the 280E Summary already
  // computes) gets to one. Deliberately does NOT subtract
  // annualSummary.nonDeductibleTotal again — that's a per-batch §280E tax
  // flag on dollars already counted in COGS, not a separate real cost.
  const operatingExpensesTotal = costPoolRemainder.total + opexTotal;
  const netIncome = annualSummary.grossProfit - operatingExpensesTotal;
  const netMargin = annualSummary.totalRev>0 ? netIncome/annualSummary.totalRev*100 : 0;

  function exportAnnual280ESummaryCsv() {
    const esc = v => { const s = String(v??""); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
    const rows = [
      ["ResinOps — Annual 280E Capitalized COGS Summary", String(summaryYear)],
      [],
      ["Category","Amount"],
      ["Direct Materials", annualSummary.materialCost.toFixed(2)],
      ["Direct Labor", annualSummary.directLaborCost.toFixed(2)],
      ["Lab Testing", annualSummary.testFee.toFixed(2)],
      ["Cultivation (allocated)", annualSummary.cultivationCost.toFixed(2)],
      ...Object.entries(annualSummary.poolBreakdown).map(([name,amt])=>["Overhead — "+name, amt.toFixed(2)]),
      ["Total Allocated Overhead", annualSummary.allocatedOverhead.toFixed(2)],
      [],
      ["Total Capitalized COGS (§263A)", annualSummary.totalCapitalized.toFixed(2)],
      ["280E-Deductible", annualSummary.deductibleTotal.toFixed(2)],
      ["Flagged Not Capitalized (batch-level)", annualSummary.nonDeductibleTotal.toFixed(2)],
      [],
      ["Non-Deductible Operating Expenses", ""],
      ...costPoolRemainder.lines.map(l=>["Cost pool non-production share — "+l.name, l.share.toFixed(2)]),
      ...Object.entries(yearOpex.reduce((acc,o)=>{acc[o.category]=(acc[o.category]||0)+(parseFloat(o.amount)||0);return acc;},{})).map(([cat,amt])=>["OpEx — "+cat.replace(/_/g," "), amt.toFixed(2)]),
      ["Total Non-Deductible Operating Expenses", (costPoolRemainder.total+opexTotal).toFixed(2)],
      [],
      ["Grand Total Non-Deductible (batch-flagged + facility OpEx)", totalNonDeductible.toFixed(2)],
      [],
      ["Batches included", String(yearBatches.length)],
      ["Generated", new Date().toISOString().split("T")[0]],
      ["Note","Capitalized COGS across production batches for the year only — not a full return. Review with your tax advisor before filing."],
    ];
    const csv = rows.map(r=>r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ResinOps-280E-Summary-${summaryYear}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Same data as exportAnnual280ESummaryCsv above, laid out as a printable
  // one-pager — the version meant to actually hand to a CPA rather than
  // import into a spreadsheet.
  function exportAnnual280ESummaryPdf() {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 16;

    doc.setFontSize(15); doc.setFont(undefined,"bold");
    doc.text("Annual 280E Capitalized COGS Summary", 14, y);
    doc.setFontSize(10); doc.setFont(undefined,"normal");
    y += 7;
    if (facility.facilityName) { doc.text(facility.facilityName + (facility.licenseNumber?" — "+facility.licenseNumber:""), 14, y); y += 5; }
    doc.text(`Tax year ${summaryYear} · ${yearBatches.length} batch${yearBatches.length===1?"":"es"} · Generated ${new Date().toISOString().split("T")[0]}`, 14, y);
    y += 8;

    doc.setFontSize(9); doc.setTextColor(90);
    const disclaimer = "Capitalized COGS across production batches for the year only — not a full return. Review with your tax advisor before filing.";
    doc.text(doc.splitTextToSize(disclaimer, pageWidth-28), 14, y);
    doc.setTextColor(0);
    y += 12;

    const stat = (label, value) => `${label}: ${value}`;
    doc.setFontSize(10);
    doc.text(stat("Total Capitalized COGS (§263A)", fmtC(annualSummary.totalCapitalized)), 14, y);
    doc.text(stat("280E-Deductible", fmtC(annualSummary.deductibleTotal)), pageWidth/2+4, y);
    y += 6;
    doc.text(stat("Flagged Not Capitalized (batches)", fmtC(annualSummary.nonDeductibleTotal)), 14, y);
    doc.text(stat("Non-Deductible Operating Expenses", fmtC(costPoolRemainder.total+opexTotal)), pageWidth/2+4, y);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [["Capitalized COGS Breakdown","Amount"]],
      body: [
        ["Direct Materials", fmtC(annualSummary.materialCost)],
        ["Direct Labor", fmtC(annualSummary.directLaborCost)],
        ["Lab Testing", fmtC(annualSummary.testFee)],
        ["Cultivation (allocated)", fmtC(annualSummary.cultivationCost)],
        ...Object.entries(annualSummary.poolBreakdown).map(([name,amt])=>["   Overhead — "+name, fmtC(amt)]),
        ["Total Allocated Overhead", fmtC(annualSummary.allocatedOverhead)],
        ["Total Capitalized COGS", fmtC(annualSummary.totalCapitalized)],
      ],
      theme: "striped",
      headStyles: {fillColor:[74,124,89]},
      didParseCell: (d) => { if (d.row.index===d.table.body.length-1 && d.section==="body") d.cell.styles.fontStyle="bold"; },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Non-Deductible Operating Expenses","Amount"]],
      body: [
        ...costPoolRemainder.lines.map(l=>["Cost pool non-production share — "+l.name, fmtC(l.share)]),
        ...Object.entries(yearOpex.reduce((acc,o)=>{acc[o.category]=(acc[o.category]||0)+(parseFloat(o.amount)||0);return acc;},{})).map(([cat,amt])=>["OpEx — "+cat.replace(/_/g," "), fmtC(amt)]),
        ["Total Non-Deductible Operating Expenses", fmtC(costPoolRemainder.total+opexTotal)],
        ["Grand Total Non-Deductible (batches + OpEx)", fmtC(totalNonDeductible)],
      ],
      theme: "striped",
      headStyles: {fillColor:[180,74,74]},
      didParseCell: (d) => { if (d.row.index>=d.table.body.length-2 && d.section==="body") d.cell.styles.fontStyle="bold"; },
    });

    doc.save(`ResinOps-280E-Summary-${summaryYear}.pdf`);
  }

  // ── Cash-flow forecast: bucket every dated batch (past 3 months for trend
  // context, next 12 months as the actual forecast) by scheduled-date month.
  // COGS is projected for every batch in the window. Revenue follows the
  // same priority batchPnL always uses: real sales-order bookings first
  // (bookedRevenueForBatch in lib/revenue.js), falling back to a manual
  // per-batch override, then SKU price — an unpriced, unbooked batch
  // contributes its real cost but $0 revenue, same as it would show up in
  // a real bank account before the sale closes.
  const today0 = new Date(); today0.setDate(1); today0.setHours(0,0,0,0);
  const forecastMonths = Array.from({length:15},(_,i)=>{
    const m = new Date(today0.getFullYear(), today0.getMonth()+(i-3), 1);
    return { key:m.getFullYear()+"-"+String(m.getMonth()+1).padStart(2,"0"), date:m,
      label:m.toLocaleDateString(undefined,{month:"short",year:"numeric"}), isPast:m<today0 };
  });
  const forecastData = forecastMonths.map(mo => {
    const rows = mainBatches.filter(b=>{
      if(!b.d) return false;
      const bd = new Date(b.d+"T00:00:00");
      return bd.getFullYear()===mo.date.getFullYear() && bd.getMonth()===mo.date.getMonth();
    }).map(b=>({batch:b, p:batchPnL(b)}));
    const cogs = rows.reduce((s,r)=>s+r.p.totalCOGS,0);
    const priced = rows.filter(r=>r.p.totalRevOverride || r.p.revPerUnit>0);
    const revenue = priced.reduce((s,r)=>s+r.p.totalRev,0);
    const bookedRevenue = rows.filter(r=>r.p.hasBookedOrders).reduce((s,r)=>s+r.p.totalRev,0);
    const estimatedRevenue = revenue - bookedRevenue;
    return { ...mo, rows, cogs, revenue, bookedRevenue, estimatedRevenue, hasPricedBatch:priced.length>0, net:revenue-cogs };
  });
  let runningCash = 0;
  forecastData.forEach(mo => { runningCash += mo.net; mo.cumulative = runningCash; });
  const forecastMax = Math.max(1, ...forecastData.map(mo=>Math.max(mo.cogs,mo.revenue)));
  const futureForecast = forecastData.filter(mo=>!mo.isPast);
  const futureTotals = futureForecast.reduce((acc,mo)=>{
    acc.cogs += mo.cogs; acc.revenue += mo.revenue; acc.batches += mo.rows.length;
    acc.hasPricedBatch = acc.hasPricedBatch || mo.hasPricedBatch;
    return acc;
  }, {cogs:0,revenue:0,batches:0,hasPricedBatch:false});
  const futureNet = futureTotals.revenue - futureTotals.cogs;

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
          {[["cogs","📊 Batch COGS"],["pnl","💰 P&L Summary"],["forecast","📅 Forecast"],["bom","🧾 Bill of Materials"],["cult","🌿 Cultivation Costs"],["pools","🏢 Cost Pools"],["opex","📋 Operating Expenses"],["sku","🏷️ SKU Pricing"],["280e","🧾 280E Summary"]].map(([v,l])=>(
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
                {l:"Direct Labor",v:fmtC(summary.directLaborCost)},
                {l:"Allocated Overhead",v:fmtC(summary.allocatedOverhead)},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className="fin-stat-val">{s.v}</div></div>)}
            </div>

            {mainBatches.length===0 ? (
              <div className="fin-card" style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No production batches yet.</div>
            ) : mainBatches.map(batch => {
              const cogs = calcBatchCOGS(batch, cogsCtx);
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
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:6}}>
                    {[
                      {l:"Materials",v:fmtC(cogs.materialCost)},
                      {l:"Direct Labor",v:fmtC(cogs.directLaborCost)},
                      {l:"Testing",v:fmtC(cogs.testFee)},
                      {l:"Cultivation",v:fmtC(cogs.cultivationCost)},
                      {l:"Overhead",v:fmtC(cogs.allocatedOverhead)},
                    ].map((s,i)=>(
                      <div key={i} style={{background:"var(--surface-2)",borderRadius:6,padding:"7px 10px"}}>
                        <div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l}</div>
                        <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                  {cogs.overheadLines.length>0 && (
                    <div style={{fontSize:10,color:"var(--text-3)",marginBottom:10}}>
                      Overhead: {cogs.overheadLines.map(l=>l.name+" "+fmtC(l.share)).join(" · ")}
                    </div>
                  )}

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
                          <label className="fin-lbl">Labor cost override ($) — leave blank to total the Direct Labor rows below</label>
                          <input type="number" className="fin-inp" step="0.01"
                            value={rec.laborCostOverride??""} placeholder={fmtN(cogs.directLaborCost)+" (from labor rows)"}
                            onChange={e=>setRecord(batch.id,{laborCostOverride:e.target.value||undefined})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Lab testing fee ($)</label>
                          <input type="number" className="fin-inp" step="1"
                            value={rec.testFee??""} placeholder="350"
                            onChange={e=>setRecord(batch.id,{testFee:e.target.value})} />
                        </div>
                        <div>
                          <label className="fin-lbl">Cultivation cost override ($) — leave blank to auto-allocate</label>
                          <input type="number" className="fin-inp" step="0.01"
                            value={rec.cultCost??""} placeholder={fmtN(cogs.cultivationCost)+" (auto-allocated)"}
                            onChange={e=>setRecord(batch.id,{cultCost:e.target.value||undefined})} />
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

                      {/* Direct labor — hours-tracked roles (trim techs, extraction
                          techs) entered per batch. Indirect/management labor is
                          covered separately via a cost pool on the Cost Pools tab,
                          not tracked per batch. */}
                      <div style={{marginBottom:14}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Direct Labor</div>
                        {(rec.laborLines||[]).map((line,i)=>{
                          const lt = laborTypes.find(x=>x.id===line.laborTypeId);
                          return (
                            <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6,alignItems:"flex-end"}}>
                              <div><label className="fin-lbl">Labor type</label>
                                <select className="fin-sel" value={line.laborTypeId||""}
                                  onChange={e=>setRecord(batch.id,{laborLines:(rec.laborLines||[]).map((l,idx)=>idx===i?{...l,laborTypeId:e.target.value}:l)})}>
                                  <option value="">— Select —</option>
                                  {laborTypes.map(t=><option key={t.id} value={t.id}>{t.n||t.name} (${t.rate}/hr)</option>)}
                                </select>
                              </div>
                              <div><label className="fin-lbl">Hours</label>
                                <input type="number" step="0.25" className="fin-inp" value={line.hours||""}
                                  onChange={e=>setRecord(batch.id,{laborLines:(rec.laborLines||[]).map((l,idx)=>idx===i?{...l,hours:e.target.value}:l)})} />
                              </div>
                              <div style={{fontSize:12,color:"var(--text-2)"}}>{lt?fmtC((parseFloat(line.hours)||0)*lt.rate):"—"}</div>
                              <button className="fin-btn fin-sm fin-del" onClick={()=>setRecord(batch.id,{laborLines:(rec.laborLines||[]).filter((_,idx)=>idx!==i)})}>✕</button>
                            </div>
                          );
                        })}
                        <button className="fin-btn fin-secondary" style={{fontSize:11,padding:"4px 10px"}}
                          onClick={()=>setRecord(batch.id,{laborLines:[...(rec.laborLines||[]),{laborTypeId:"",hours:""}]})}>+ Add labor row</button>
                      </div>

                      <label style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,fontSize:12,color:"var(--text-2)",cursor:"pointer"}}>
                        <input type="checkbox" checked={!!rec.nonDeductible} onChange={e=>setRecord(batch.id,{nonDeductible:e.target.checked})} />
                        Exclude this batch's COGS from the 280E-deductible total (flag as not capitalized)
                      </label>

                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <button className="fin-btn fin-secondary" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>deductNow(batch)}>📦 Deduct inventory now</button>
                        {deductMsg[batch.id] && <span style={{fontSize:11,color:deductMsg[batch.id].startsWith("⚠")?"var(--amber)":deductMsg[batch.id].startsWith("✓")?"var(--accent-2)":"var(--danger)"}}>{deductMsg[batch.id]}</span>}
                      </div>

                      {/* BOM material lines */}
                      {cogs.materialLines.length > 0 && (
                        <div style={{marginTop:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{fontSize:11,fontWeight:700,color:"var(--text-3)"}}>BOM Material Breakdown</div>
                            {rec.materialsLockedAt ? (
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontSize:10,color:"var(--text-3)"}}>🔒 Locked from inventory deduction on {new Date(rec.materialsLockedAt).toLocaleDateString()}</span>
                                <button className="fin-btn fin-sm fin-secondary" onClick={()=>unlockMaterials(batch)}>🔓 Unlock — use live recipe</button>
                              </div>
                            ) : (
                              <span style={{fontSize:10,color:"var(--text-3)"}}>Live recipe match — locks in once inventory is deducted</span>
                            )}
                          </div>
                          <div style={{border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
                            <table className="fin-tbl">
                              <thead><tr><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Line Total</th></tr></thead>
                              <tbody>
                                {cogs.materialLines.map((ml,i)=>(
                                  <tr key={i}>
                                    <td>{ml.name}</td>
                                    <td>{ml.qty} {ml.uom}</td>
                                    <td>{fmtC(ml.unitCost)}</td>
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
              <strong>280E Note:</strong> Under IRC §280E, cannabis businesses may only deduct Cost of Goods Sold federally — but §263A lets a vertically-integrated operator capitalize more than just raw materials into COGS. Each batch's total below is built from direct materials (BOM), direct labor (hours entered per batch), lab testing, cultivation costs (auto-allocated by grow space), and indirect overhead (allocated from named cost pools — rent, utilities, depreciation, etc. — see the Cost Pools tab). Any batch can be flagged "not capitalized" if it shouldn't count — see the deductible/non-deductible split below. This app computes the allocation; review the methodology with your accountant before filing.
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:10}}>
              <div style={{fontSize:12,color:"var(--text-3)"}}>Figures below are for the selected year — same year selector as the 280E Summary tab.</div>
              <select className="fin-sel" style={{width:"auto",minWidth:100}} value={summaryYear} onChange={e=>setSummaryYear(parseInt(e.target.value))}>
                {(summaryYears.includes(summaryYear)?summaryYears:[...summaryYears,summaryYear]).sort().map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
              {[
                {l:"Total Revenue",v:fmtC(annualSummary.totalRev)},
                {l:"Gross Profit",v:fmtC(annualSummary.grossProfit),cls:annualSummary.grossProfit>0?"margin-good":annualSummary.grossProfit<0?"margin-bad":""},
                {l:"Gross Margin",v:pct(annualSummary.grossProfit,annualSummary.totalRev),cls:annualSummary.grossMargin>50?"margin-good":annualSummary.grossMargin>25?"margin-warn":"margin-bad"},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
              {[
                {l:"Booked Revenue",v:fmtC(annualSummary.bookedRevenue),cls:"margin-good"},
                {l:"Estimated Revenue",v:fmtC(annualSummary.estimatedRevenue)},
                {l:"Operating Expenses",v:fmtC(operatingExpensesTotal),cls:operatingExpensesTotal>0?"margin-bad":""},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:10}}>
              {[
                {l:"Net Income",v:fmtC(netIncome),cls:netIncome>0?"margin-good":netIncome<0?"margin-bad":""},
                {l:"Net Margin",v:pct(netIncome,annualSummary.totalRev),cls:netMargin>20?"margin-good":netMargin>0?"margin-warn":"margin-bad"},
                {l:"280E-Deductible COGS",v:fmtC(annualSummary.deductibleTotal),cls:"margin-good"},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Not Capitalized (batch-flagged)",v:fmtC(annualSummary.nonDeductibleTotal)},
                {l:"Grand Total Non-Deductible",v:fmtC(totalNonDeductible)},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>
            <div style={{fontSize:11,color:"var(--text-3)",marginBottom:16}}>Net Income = Gross Profit − Operating Expenses (cost pools' non-production share + logged Operating Expenses — see those tabs). Doesn't double-subtract batch-flagged COGS, since that's a §280E tax-treatment flag on dollars already counted in COGS, not a separate real cost.</div>

            <div style={{marginBottom:16}}>
              <button className="fin-btn fin-secondary" onClick={()=>exportQuickBooksCsv(yearBatches, cogsCtx, facility.qbAccountMap||{})}>⬇ Export to QuickBooks (CSV)</button>
              <span style={{fontSize:11,color:"var(--text-3)",marginLeft:10}}>Journal entries per batch, mapped to your chart of accounts — configure account names in Facility Settings.</span>
            </div>

            {/* Per batch P&L */}
            <div className="fin-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Batch P&L — {summaryYear}</div>
                <div style={{fontSize:11,color:"var(--text-3)"}}>Units sold/revenue come from real Sales Orders once a batch has bookings — enter a pre-sale estimate manually before that, or override the total directly</div>
              </div>
              {yearBatches.length===0 ? (
                <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No batches dated in {summaryYear}.</div>
              ) : (
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                  <table className="fin-tbl">
                    <thead>
                      <tr><th>Batch</th><th>Product</th><th>Units Sold</th><th>Rev/Unit ($)</th><th>Total Rev</th><th>COGS</th><th>Gross Profit</th><th>Margin</th></tr>
                    </thead>
                    <tbody>
                      {yearBatches.map(batch => {
                        const p = batchPnL(batch);
                        const rec = getRecord(batch.id);
                        const cls = p.grossMargin>=50?"pill-green":p.grossMargin>=25?"pill-amber":"pill-red";
                        return (
                          <tr key={batch.id}>
                            <td style={{fontWeight:500,color:"var(--text)",whiteSpace:"nowrap"}}>{batch.name}</td>
                            <td style={{fontSize:11,whiteSpace:"nowrap"}}>{batch.catLabel}{batch.subLabel?" — "+batch.subLabel:""}</td>
                            <td>
                              {p.hasBookedOrders ? (
                                <span title="From real sales orders booked against this batch" style={{fontWeight:500,color:"var(--text)"}}>{p.unitsSold} <span className="pill pill-blue" style={{fontSize:9}}>booked</span></span>
                              ) : (
                                <input type="number" min="0" style={{width:70,background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:5,color:"var(--text)",fontSize:12,padding:"2px 6px",fontFamily:"monospace"}}
                                  value={rec.unitsSold||""}
                                  placeholder={String(p.estUnits)}
                                  onChange={e=>setRecord(batch.id,{unitsSold:e.target.value})} />
                              )}
                            </td>
                            <td>
                              {p.hasBookedOrders ? (
                                <span style={{fontWeight:500,color:"var(--text)"}}>{fmtC(p.revPerUnit)}</span>
                              ) : (
                                <input type="number" min="0" step="0.01" style={{width:70,background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:5,color:"var(--text)",fontSize:12,padding:"2px 6px",fontFamily:"monospace"}}
                                  value={rec.revPerUnit||""}
                                  placeholder="0.00"
                                  onChange={e=>setRecord(batch.id,{revPerUnit:e.target.value})} />
                              )}
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
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>COGS Components — §263A Reference — {summaryYear}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
                {[
                  {l:"Raw Materials",v:fmtC(annualSummary.materialCost),pct:pct(annualSummary.materialCost,annualSummary.totalCOGS)},
                  {l:"Direct Labor",v:fmtC(annualSummary.directLaborCost),pct:pct(annualSummary.directLaborCost,annualSummary.totalCOGS)},
                  {l:"Lab Testing",v:fmtC(annualSummary.testFee),pct:pct(annualSummary.testFee,annualSummary.totalCOGS)},
                  {l:"Cultivation Costs",v:fmtC(annualSummary.cultivationCost),pct:pct(annualSummary.cultivationCost,annualSummary.totalCOGS)},
                  {l:"Allocated Overhead",v:fmtC(annualSummary.allocatedOverhead),pct:pct(annualSummary.allocatedOverhead,annualSummary.totalCOGS)},
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

        {/* ── FORECAST ── */}
        {tab==="forecast" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Next 12 Mo. Projected COGS",v:fmtC(futureTotals.cogs)},
                {l:"Next 12 Mo. Projected Revenue",v:futureTotals.hasPricedBatch?fmtC(futureTotals.revenue):"—"},
                {l:"Net Cash Impact (12 mo.)",v:futureTotals.hasPricedBatch?fmtC(futureNet):"—",cls:!futureTotals.hasPricedBatch?"":(futureNet>=0?"margin-good":"margin-bad")},
                {l:"Batches Scheduled",v:String(futureTotals.batches)},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>

            <div className="fin-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Monthly Cash Timeline</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:16}}>
                COGS is projected for every batch scheduled in a month, using the same Batch COGS figures as the tabs above. Revenue prioritizes real sales-order bookings (solid bar) over a manual estimate or SKU price (lighter bar) — an unpriced, unbooked batch still shows its real cost with $0 revenue, same as it would hit a bank account before the sale closes. Past three months shown for trend context.
              </div>
              {forecastData.every(mo=>mo.rows.length===0) ? (
                <div style={{textAlign:"center",padding:24,color:"var(--text-3)"}}>No batches with a scheduled date in this window.</div>
              ) : forecastData.map(mo=>(
                <div key={mo.key} style={{marginBottom:16,paddingBottom:16,borderBottom:"1px solid var(--border)",opacity:mo.isPast?0.65:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text)"}}>
                      {mo.label}{mo.isPast && <span style={{fontSize:10,color:"var(--text-3)",fontWeight:400,marginLeft:6}}>(past)</span>}
                    </div>
                    <div style={{fontSize:11,color:"var(--text-3)"}}>{mo.rows.length} batch{mo.rows.length===1?"":"es"}</div>
                  </div>

                  {mo.rows.length>0 && <>
                    <div style={{display:"grid",gridTemplateColumns:"64px 1fr 76px",gap:8,alignItems:"center",marginBottom:3}}>
                      <div style={{fontSize:10,color:"var(--text-3)"}}>COGS</div>
                      <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{width:(mo.cogs/forecastMax*100)+"%",height:"100%",background:"var(--danger)"}} />
                      </div>
                      <div style={{fontSize:11,color:"var(--text-2)",textAlign:"right"}}>{fmtC(mo.cogs)}</div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"64px 1fr 76px",gap:8,alignItems:"center",marginBottom:2}}>
                      <div style={{fontSize:10,color:"var(--text-3)"}}>Revenue</div>
                      <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden",display:"flex"}}>
                        <div style={{width:(mo.bookedRevenue/forecastMax*100)+"%",height:"100%",background:"var(--accent-2)"}} />
                        <div style={{width:(mo.estimatedRevenue/forecastMax*100)+"%",height:"100%",background:"var(--accent-2)",opacity:0.4}} />
                      </div>
                      <div style={{fontSize:11,color:"var(--text-2)",textAlign:"right"}}>{fmtC(mo.revenue)}</div>
                    </div>
                    {mo.revenue>0 && <div style={{display:"grid",gridTemplateColumns:"64px 1fr 76px",gap:8,marginBottom:8}}>
                      <div />
                      <div style={{fontSize:10,color:"var(--text-3)"}}>{mo.bookedRevenue>0 && <span>● booked {fmtC(mo.bookedRevenue)}</span>}{mo.bookedRevenue>0 && mo.estimatedRevenue>0 && "  ·  "}{mo.estimatedRevenue>0 && <span style={{opacity:0.6}}>● estimated {fmtC(mo.estimatedRevenue)}</span>}</div>
                      <div />
                    </div>}

                    <div style={{marginBottom:8}}>
                      {mo.rows.map(r=>(
                        <div key={r.batch.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--text-3)",padding:"2px 0"}}>
                          <span>{r.batch.name}</span>
                          <span>{fmtC(r.p.totalCOGS)} COGS{r.p.totalRev>0?" · "+fmtC(r.p.totalRev)+" rev":""}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{display:"flex",justifyContent:"flex-end",gap:18,fontSize:11}}>
                      <span style={{color:"var(--text-3)"}}>Net: <strong style={{color:mo.net>=0?"var(--accent-2)":"var(--danger)"}}>{fmtC(mo.net)}</strong></span>
                      <span style={{color:"var(--text-3)"}}>Cumulative: <strong style={{color:mo.cumulative>=0?"var(--accent-2)":"var(--danger)"}}>{fmtC(mo.cumulative)}</strong></span>
                    </div>
                  </>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── BOM ── */}
        {tab==="bom" && (
          <div className="fin-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text-2)",maxWidth:600}}>
                Bill of Materials defines what inventory is actually consumed per batch — real recipes referencing real inventory items, used both for COGS estimation here and for real stock deduction when a batch is created/completed. Quantities can be per batch, per lb of input, or per unit of output.
                {!boms.length && <div style={{marginTop:6,color:"var(--amber)"}}>⚠ No saved BOMs yet — showing built-in starter defaults below. Save one to start tracking your real recipes.</div>}
              </div>
              {!bomForm && <button className="fin-btn fin-primary" onClick={openAddBom}>+ Add BOM</button>}
            </div>

            {bomForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="fin-lbl">BOM name</label><input className="fin-inp" value={bomForm.name} onChange={e=>setBomForm(f=>({...f,name:e.target.value}))} placeholder="Whole Flower" /></div>
                  <div><label className="fin-lbl">Category</label><select className="fin-sel" value={bomForm.category} onChange={e=>setBomForm(f=>({...f,category:e.target.value,subcategory:""}))}>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
                  <div><label className="fin-lbl">Subcategory</label>
                    {SUBS[bomForm.category]?.length ? (
                      <select className="fin-sel" value={bomForm.subcategory} onChange={e=>setBomForm(f=>({...f,subcategory:e.target.value}))}>
                        <option value="">— Any / none —</option>
                        {SUBS[bomForm.category].map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
                      </select>
                    ) : (
                      <input className="fin-inp" value={bomForm.subcategory} disabled style={{opacity:0.6}} placeholder="n/a for this category" />
                    )}
                  </div>
                  <div><label className="fin-lbl">Lab testing fee ($)</label><input type="number" className="fin-inp" value={bomForm.testFee} onChange={e=>setBomForm(f=>({...f,testFee:e.target.value}))} /></div>
                </div>

                <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Recipe Lines</div>
                {bomForm.items.map((line,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 2fr auto",gap:8,marginBottom:6,alignItems:"flex-end"}}>
                    <div><label className="fin-lbl">Inventory item</label><select className="fin-sel" value={line.itemId} onChange={e=>setBomLine(i,"itemId",e.target.value)}><option value="">— Select item —</option>{items.map(it=><option key={it.id} value={it.id}>{it.n}</option>)}</select></div>
                    <div><label className="fin-lbl">Qty</label><input type="number" step="0.01" className="fin-inp" value={line.qty} onChange={e=>setBomLine(i,"qty",e.target.value)} /></div>
                    <div><label className="fin-lbl">Per</label><select className="fin-sel" value={line.qtyType} onChange={e=>setBomLine(i,"qtyType",e.target.value)}>{QTY_TYPES.map(q=><option key={q.v} value={q.v}>{q.l}</option>)}</select></div>
                    <div><label className="fin-lbl">Note</label><input className="fin-inp" value={line.note} onChange={e=>setBomLine(i,"note",e.target.value)} /></div>
                    <button className="fin-btn fin-sm fin-del" onClick={()=>removeBomLine(i)}>✕</button>
                  </div>
                ))}
                <button className="fin-btn fin-secondary" style={{fontSize:11,padding:"4px 10px",marginTop:4}} onClick={addBomLine}>+ Add line</button>

                {errBom && <div style={{fontSize:12,color:"var(--danger)",marginTop:10}}>{errBom}</div>}
                <div style={{display:"flex",gap:8,marginTop:12}}>
                  <button className="fin-btn fin-primary" onClick={saveBom}>Save BOM</button>
                  <button className="fin-btn fin-secondary" onClick={()=>setBomForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            {allBoms.map((bom) => (
              <div key={bom.id} style={{border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{bom.name}</div>
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{bom.category||bom.catSub?.split("|")[0]}{(bom.subcategory||bom.catSub?.split("|")[1])?" / "+(bom.subcategory||bom.catSub?.split("|")[1]):""}</div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <div style={{fontSize:11,color:"var(--text-3)"}}>Testing fee: {fmtC(bom.testFee)}</div>
                    {boms.length>0 && <>
                      <button className="fin-btn fin-sm fin-edit" onClick={()=>openEditBom(bom)}>Edit</button>
                      <button className="fin-btn fin-sm fin-del" onClick={()=>removeBom(bom.id)}>✕</button>
                    </>}
                  </div>
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
                              <td style={{fontSize:11,color:"var(--text-3)"}}>{QTY_TYPES.find(q=>q.v===line.qtyType)?.l||"per batch"}</td>
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
            {!boms.length && (
              <div style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>
                These starter BOMs aren't saved yet — click "+ Add BOM" to create your own real, editable recipes (they'll replace these defaults once you save at least one).
              </div>
            )}
          </div>
        )}

        {/* ── CULTIVATION COSTS ── */}
        {tab==="cult" && (
          <div className="fin-card">
            <div style={{fontSize:12,color:"var(--text-2)",marginBottom:14}}>
              Track cultivation supply costs per grow space. Costs auto-allocate across the production batches sourced from that space's harvest — by weight or by how long the grow cycle occupied the space, your choice per space (defaults from Facility Settings).
            </div>
            {spaces.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No grow spaces scheduled yet.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="fin-tbl">
                  <thead><tr><th>Grow Space</th><th>Strain</th><th>Plants</th><th>Media / Setup</th><th>Nutrients (est.)</th><th>IPM (est.)</th><th>Total Cult. Cost</th><th>Allocate By</th><th></th></tr></thead>
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
                          <td>
                            {isEditing ? (
                              <select className="fin-sel" style={{width:130}} value={cc.allocationBasis||facility.defaultCultivationAllocationBasis||"batch_weight"} onChange={e=>setCultCost(sp.id,{allocationBasis:e.target.value})}>
                                <option value="batch_weight">By weight</option>
                                <option value="time_occupied">By time occupied</option>
                              </select>
                            ) : (cc.allocationBasis==="time_occupied"?"Time occupied":"By weight")}
                          </td>
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

        {/* ── COST POOLS ── */}
        {tab==="pools" && (
          <div className="fin-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text-2)",maxWidth:640}}>
                Named indirect-cost pools — rent, utilities, equipment depreciation, indirect/QA labor, insurance — each allocated across production batches by whatever basis makes sense for that cost. This is the actual §263A capitalization mechanism: real, per-pool math a batch's overhead figure is built from, not a single blended rate.
              </div>
              {!costPoolForm && <button className="fin-btn fin-primary" onClick={openAddCostPool}>+ Add Cost Pool</button>}
            </div>

            {costPoolForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="fin-lbl">Name</label><input className="fin-inp" value={costPoolForm.name} onChange={e=>setCostPoolForm(f=>({...f,name:e.target.value}))} placeholder="Facility Rent" /></div>
                  <div><label className="fin-lbl">Category</label>
                    <select className="fin-sel" value={costPoolForm.category} onChange={e=>setCostPoolForm(f=>({...f,category:e.target.value}))}>
                      <option value="rent">Rent</option><option value="utilities">Utilities</option><option value="depreciation">Equipment Depreciation</option>
                      <option value="indirect_labor">Indirect/QA Labor</option><option value="insurance">Insurance</option><option value="repairs_maintenance">Repairs & Maintenance</option>
                      <option value="quality_control">Quality Control</option><option value="other">Other</option>
                    </select>
                  </div>
                  <div><label className="fin-lbl">Period</label>
                    <select className="fin-sel" value={costPoolForm.period} onChange={e=>setCostPoolForm(f=>({...f,period:e.target.value}))}>
                      <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
                    </select>
                  </div>
                </div>
                {costPoolForm.category==="depreciation" && (
                  <div style={{marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <input type="checkbox" id="linkEquip" checked={!!costPoolForm.linkedToEquipment} onChange={e=>setCostPoolForm(f=>({...f,linkedToEquipment:e.target.checked}))} />
                    <label htmlFor="linkEquip" style={{fontSize:12,color:"var(--text-2)"}}>Link to Equipment Registry — compute this pool's amount from active assets' straight-line depreciation instead of typing a number</label>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  {costPoolForm.linkedToEquipment ? (
                    <div><label className="fin-lbl">Amount per period ($)</label><input className="fin-inp" disabled style={{opacity:0.6,cursor:"not-allowed"}} value={fmtC(calcEquipmentDepreciationPool(equipment, new Date().toISOString().split("T")[0]).monthly * (costPoolForm.period==="annual"?12:costPoolForm.period==="quarterly"?3:1))} /></div>
                  ) : (
                    <div><label className="fin-lbl">Amount per period ($)</label><input type="number" step="0.01" className="fin-inp" value={costPoolForm.periodAmount} onChange={e=>setCostPoolForm(f=>({...f,periodAmount:e.target.value}))} placeholder="8000" /></div>
                  )}
                  <div><label className="fin-lbl">% attributable to production</label><input type="number" min="0" max="100" className="fin-inp" value={costPoolForm.productionPct} onChange={e=>setCostPoolForm(f=>({...f,productionPct:e.target.value}))} placeholder="100" /></div>
                  <div><label className="fin-lbl">Allocation basis</label>
                    <select className="fin-sel" value={costPoolForm.allocationBasis} onChange={e=>setCostPoolForm(f=>({...f,allocationBasis:e.target.value}))}>
                      <option value="batch_weight">By batch input weight</option>
                      <option value="unit_count">By unit output</option>
                      <option value="labor_hours">By direct labor hours</option>
                      <option value="flat_per_batch">Flat, split evenly per batch</option>
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:10}}><label className="fin-lbl">Notes (optional)</label><input className="fin-inp" value={costPoolForm.notes||""} onChange={e=>setCostPoolForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. 70% of total rent is production floor, 30% is office/retail" /></div>
                {errCostPool && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{errCostPool}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="fin-btn fin-primary" onClick={saveCostPool}>Save</button>
                  <button className="fin-btn fin-secondary" onClick={()=>setCostPoolForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            {costPools.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No cost pools defined yet — batches will show $0 allocated overhead until you add one.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="fin-tbl">
                  <thead><tr><th>Name</th><th>Category</th><th>Amount</th><th>Production %</th><th>Allocate By</th><th>Active</th><th></th></tr></thead>
                  <tbody>
                    {costPools.map(pool=>(
                      <tr key={pool.id} style={{opacity:pool.active===false?0.5:1}}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{pool.name}</td>
                        <td style={{fontSize:11,textTransform:"capitalize"}}>{(pool.category||"").replace(/_/g," ")}</td>
                        <td>
                          {pool.linkedToEquipment
                            ? fmtC(calcEquipmentDepreciationPool(equipment, new Date().toISOString().split("T")[0]).monthly * (pool.period==="annual"?12:pool.period==="quarterly"?3:1))
                            : fmtC(pool.periodAmount)}
                          /{pool.period==="annual"?"yr":pool.period==="quarterly"?"qtr":"mo"}
                          {pool.linkedToEquipment && <div style={{fontSize:10,color:"var(--text-3)"}}>from Equipment Registry</div>}
                        </td>
                        <td>{pool.productionPct}%</td>
                        <td style={{fontSize:11}}>{({batch_weight:"Batch weight",unit_count:"Unit output",labor_hours:"Labor hours",flat_per_batch:"Flat per batch"})[pool.allocationBasis]}</td>
                        <td><button className="fin-btn fin-sm fin-secondary" onClick={()=>toggleCostPoolActive(pool)}>{pool.active===false?"Off":"On"}</button></td>
                        <td><div style={{display:"flex",gap:6}}>
                          <button className="fin-btn fin-sm fin-edit" onClick={()=>setCostPoolForm({...pool,periodAmount:String(pool.periodAmount),productionPct:String(pool.productionPct)})}>Edit</button>
                          <button className="fin-btn fin-sm fin-del" onClick={()=>removeCostPool(pool.id)}>✕</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── OPERATING EXPENSES ── */}
        {tab==="opex" && (
          <div className="fin-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text-2)",maxWidth:640}}>
                Pure SG&A that was never eligible for any COGS treatment — marketing, admin salaries, legal/professional fees, a separate retail storefront, non-production insurance. This is the other side of §280E: money that's genuinely disallowed, shown alongside the Annual 280E Summary's capitalized-COGS side so the full picture is on one page. Log a recurring cost as one row per payment, or one lump annual row — either way it sums correctly by year.
              </div>
              {!opexForm && <button className="fin-btn fin-primary" onClick={openAddOpex}>+ Add Expense</button>}
            </div>

            {opexForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="fin-lbl">Name</label><input className="fin-inp" value={opexForm.name} onChange={e=>setOpexForm(f=>({...f,name:e.target.value}))} placeholder="Q3 digital marketing retainer" /></div>
                  <div><label className="fin-lbl">Category</label>
                    <select className="fin-sel" value={opexForm.category} onChange={e=>setOpexForm(f=>({...f,category:e.target.value}))}>
                      <option value="g_and_a">G&A</option><option value="marketing">Marketing</option><option value="admin_salaries">Admin Salaries</option>
                      <option value="legal_professional">Legal / Professional</option><option value="insurance_nonprod">Insurance (non-production)</option>
                      <option value="retail_operations">Retail Operations</option><option value="other">Other</option>
                    </select>
                  </div>
                  <div><label className="fin-lbl">Amount ($)</label><input type="number" step="0.01" className="fin-inp" value={opexForm.amount} onChange={e=>setOpexForm(f=>({...f,amount:e.target.value}))} placeholder="2500" /></div>
                  <div><label className="fin-lbl">Date</label><input type="date" className="fin-inp" value={opexForm.date} onChange={e=>setOpexForm(f=>({...f,date:e.target.value}))} /></div>
                </div>
                <div style={{marginBottom:10}}><label className="fin-lbl">Notes (optional)</label><input className="fin-inp" value={opexForm.notes||""} onChange={e=>setOpexForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. Retainer covers Jul-Sep" /></div>
                {errOpex && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{errOpex}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="fin-btn fin-primary" onClick={saveOpex}>Save</button>
                  <button className="fin-btn fin-secondary" onClick={()=>setOpexForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            {opex.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No operating expenses logged yet.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="fin-tbl">
                  <thead><tr><th>Name</th><th>Category</th><th>Date</th><th>Amount</th><th></th></tr></thead>
                  <tbody>
                    {[...opex].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(o=>(
                      <tr key={o.id}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{o.name}</td>
                        <td style={{fontSize:11,textTransform:"capitalize"}}>{(o.category||"").replace(/_/g," ")}</td>
                        <td style={{fontSize:11}}>{o.date}</td>
                        <td style={{color:"var(--danger)"}}>{fmtC(o.amount)}</td>
                        <td><div style={{display:"flex",gap:6}}>
                          <button className="fin-btn fin-sm fin-edit" onClick={()=>setOpexForm({...o,amount:String(o.amount)})}>Edit</button>
                          <button className="fin-btn fin-sm fin-del" onClick={()=>removeOpex(o.id)}>✕</button>
                        </div></td>
                      </tr>
                    ))}
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
              {!editSku && <button className="fin-btn fin-primary" onClick={()=>setEditSku({id:crypto.randomUUID(),product:"",size:"",channel:"retail",price:""})}>+ Add SKU</button>}
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

        {/* ── ANNUAL 280E SUMMARY ── */}
        {tab==="280e" && (
          <>
            <div className="fin-card" style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:4}}>
                <div style={{fontSize:12,color:"var(--text-2)",maxWidth:640}}>
                  One-page rollup of capitalized COGS (§263A) alongside what's genuinely disallowed under §280E — batches flagged not capitalized, cost pools' non-production share, and logged operating expenses. Not a full return — hand it to your accountant alongside your other books, and review before filing.
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <select className="fin-sel" style={{width:"auto",minWidth:100}} value={summaryYear} onChange={e=>setSummaryYear(parseInt(e.target.value))}>
                    {(summaryYears.includes(summaryYear)?summaryYears:[...summaryYears,summaryYear]).sort().map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                  <button className="fin-btn fin-secondary" onClick={exportAnnual280ESummaryPdf}>⬇ Download 280E Summary (PDF)</button>
                  <button className="fin-btn fin-secondary" onClick={exportAnnual280ESummaryCsv}>⬇ Download 280E Summary (CSV)</button>
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Total Capitalized COGS (§263A)",v:fmtC(annualSummary.totalCapitalized)},
                {l:"280E-Deductible",v:fmtC(annualSummary.deductibleTotal),cls:"margin-good"},
                {l:"Flagged Not Capitalized (batches)",v:fmtC(annualSummary.nonDeductibleTotal),cls:annualSummary.nonDeductibleTotal>0?"margin-bad":""},
                {l:"Non-Deductible Operating Expenses",v:fmtC(costPoolRemainder.total+opexTotal),cls:(costPoolRemainder.total+opexTotal)>0?"margin-bad":""},
              ].map((s,i)=><div key={i} className="fin-stat"><div className="fin-stat-lbl">{s.l}</div><div className={"fin-stat-val "+(s.cls||"")}>{s.v}</div></div>)}
            </div>

            <div className="fin-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{summaryYear} Capitalized COGS Breakdown — {yearBatches.length} batch{yearBatches.length===1?"":"es"}</div>
              {yearBatches.length===0 ? (
                <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No batches dated in {summaryYear}.</div>
              ) : (
                <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                  <table className="fin-tbl">
                    <thead><tr><th>Category</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                    <tbody>
                      <tr><td>Direct Materials</td><td style={{textAlign:"right"}}>{fmtC(annualSummary.materialCost)}</td></tr>
                      <tr><td>Direct Labor</td><td style={{textAlign:"right"}}>{fmtC(annualSummary.directLaborCost)}</td></tr>
                      <tr><td>Lab Testing</td><td style={{textAlign:"right"}}>{fmtC(annualSummary.testFee)}</td></tr>
                      <tr><td>Cultivation (allocated)</td><td style={{textAlign:"right"}}>{fmtC(annualSummary.cultivationCost)}</td></tr>
                      {Object.entries(annualSummary.poolBreakdown).map(([name,amt])=>(
                        <tr key={name}><td style={{paddingLeft:24,fontSize:11,color:"var(--text-3)"}}>Overhead — {name}</td><td style={{textAlign:"right",fontSize:11,color:"var(--text-3)"}}>{fmtC(amt)}</td></tr>
                      ))}
                      <tr style={{borderTop:"1px solid var(--border-2)"}}><td style={{fontWeight:500,color:"var(--text)"}}>Total Allocated Overhead</td><td style={{textAlign:"right",fontWeight:500,color:"var(--text)"}}>{fmtC(annualSummary.allocatedOverhead)}</td></tr>
                      <tr style={{borderTop:"2px solid var(--border-2)"}}><td style={{fontWeight:700,color:"var(--text)"}}>Total Capitalized COGS</td><td style={{textAlign:"right",fontWeight:700,color:"var(--accent-2)"}}>{fmtC(annualSummary.totalCapitalized)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="fin-card" style={{marginTop:16}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Non-Deductible Operating Expenses — {summaryYear}</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:12}}>Cost pools' non-production share is a facility-wide annual figure (not filtered by year — see Cost Pools tab); logged operating expenses below are filtered to {summaryYear} by date.</div>
              {costPoolRemainder.lines.length===0 && yearOpex.length===0 ? (
                <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No non-deductible operating expenses — every cost pool is 100% production, and nothing's logged in Operating Expenses.</div>
              ) : (
                <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                  <table className="fin-tbl">
                    <thead><tr><th>Category</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                    <tbody>
                      {costPoolRemainder.lines.map(l=>(
                        <tr key={l.poolId}><td>Cost pool non-production share — {l.name}</td><td style={{textAlign:"right"}}>{fmtC(l.share)}</td></tr>
                      ))}
                      {Object.entries(yearOpex.reduce((acc,o)=>{acc[o.category]=(acc[o.category]||0)+(parseFloat(o.amount)||0);return acc;},{})).map(([cat,amt])=>(
                        <tr key={cat}><td style={{textTransform:"capitalize"}}>OpEx — {cat.replace(/_/g," ")}</td><td style={{textAlign:"right"}}>{fmtC(amt)}</td></tr>
                      ))}
                      <tr style={{borderTop:"2px solid var(--border-2)"}}><td style={{fontWeight:700,color:"var(--text)"}}>Total Non-Deductible Operating Expenses</td><td style={{textAlign:"right",fontWeight:700,color:"var(--danger)"}}>{fmtC(costPoolRemainder.total+opexTotal)}</td></tr>
                      <tr><td style={{fontWeight:700,color:"var(--text)"}}>Grand Total Non-Deductible (batches + OpEx)</td><td style={{textAlign:"right",fontWeight:700,color:"var(--danger)"}}>{fmtC(totalNonDeductible)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
