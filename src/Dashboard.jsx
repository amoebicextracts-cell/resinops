import { useState, useEffect } from "react";
import { db } from "./lib/db";

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"—";}
function daysFromNow(dt){return dt?Math.round((new Date(dt)-new Date())/86400000):null;}
function addDays(dt,n){const d=new Date(dt);d.setDate(d.getDate()+n);return d;}
function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});}

const CSS=`
  .db-wrap{padding:24px;flex:1;overflow-y:auto;}
  .db-grid{display:grid;gap:14px;}
  .db-row2{grid-template-columns:1fr 1fr;}
  .db-row3{grid-template-columns:1fr 1fr 1fr;}
  .db-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:16px;}
  .db-card-t{font-size:11px;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:12px;}
  .db-stat{display:flex;align-items:flex-end;gap:6px;margin-bottom:2px;}
  .db-num{font-size:28px;font-weight:700;line-height:1;}
  .db-numlbl{font-size:11px;color:var(--text-3);margin-bottom:4px;}
  .db-alert{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:7px;margin-bottom:6px;font-size:12px;}
  .db-alert:last-child{margin-bottom:0;}
  .a-red{background:rgba(200,74,74,0.1);border:1px solid rgba(200,74,74,0.25);}
  .a-amber{background:rgba(200,150,58,0.1);border:1px solid rgba(200,150,58,0.25);}
  .a-green{background:rgba(74,124,89,0.1);border:1px solid rgba(74,124,89,0.25);}
  .a-blue{background:rgba(90,120,200,0.1);border:1px solid rgba(90,120,200,0.25);}
  .db-pill{font-size:10px;font-weight:600;padding:2px 7px;border-radius:8px;white-space:nowrap;}
  .db-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .db-tbl th{text-align:left;padding:5px 8px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);}
  .db-tbl td{padding:5px 8px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .db-tbl tr:last-child td{border-bottom:none;}
  .db-empty{font-size:11px;color:var(--text-3);font-style:italic;}
`;

export default function Dashboard({ onNavigate }){
  const [loading,setLoading]=useState(true);
  const [settings,setSettings]=useState({});
  const [spaces,setSpaces]=useState([]);
  const [growMap,setGrowMap]=useState([]);
  const [harvestBatches,setHarvestBatches]=useState([]);
  const [prodBatches,setProdBatches]=useState([]);
  const [employees,setEmployees]=useState([]);
  const [equipment,setEquipment]=useState([]);
  const [deviations,setDeviations]=useState([]);
  const [inventory,setInventory]=useState([]);
  const [cloneSched,setCloneSched]=useState([]);
  const [shifts,setShifts]=useState([]);
  const [salesOrders,setSalesOrders]=useState([]);
  const [skus,setSkus]=useState([]);
  const [qcTests,setQcTests]=useState([]);
  const [strains,setStrains]=useState([]);
  const [workOrders,setWorkOrders]=useState([]);
  const [loto,setLoto]=useState([]);

  useEffect(()=>{
    async function load(){
      try{
        const [sp,gm,hb,pb,emp,eq,dv,inv,cs,sh,so,sk,qc,st,wo,lt]=await Promise.all([
          db.grow_spaces.list(),
          db.grow_rooms.list(),
          db.harvest_batches.list(),
          db.production_batches.list(),
          db.employees.list(),
          db.equipment.list(),
          db.gmp_deviations.list(),
          db.inventory_items.list(),
          db.clone_schedules.list(),
          db.gmp_shifts.list(),
          db.sales_orders.list(),
          db.skus.list(),
          db.qc_tests.list(),
          db.strains.list(),
          db.work_orders.list(),
          db.loto_log.list(),
        ]);
        setSpaces(sp); setGrowMap(gm); setHarvestBatches(hb);
        setProdBatches(pb.filter(b=>!b.isLinked)); setEmployees(emp);
        setEquipment(eq); setDeviations(dv); setInventory(inv);
        setCloneSched(cs); setShifts(sh); setSalesOrders(so);
        setSkus(sk); setQcTests(qc); setStrains(st);
        setWorkOrders(wo); setLoto(lt);
        try{ setSettings(JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}")); }catch{}
      }catch(e){ console.error("Dashboard load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const qcHolds=qcTests.filter(t=>t.overallPass===false||t.on_hold).map(t=>String(t.id));
  const prodBatchesAll=prodBatches;
  const growSpaces=spaces;
  const facilityVegWeeks=4;
  const facilityRootDays=14;

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading dashboard…</div>);

  const today=new Date();
  const todayStr=today.toISOString().split("T")[0];

  // ── Clone cut alerts ──────────────────────────────────────────────────────
  function cloneCutAlerts(){
    const alerts=[];
    spaces.forEach(sp=>{
      const strains=sp.strains||[];
      const harvestDate=addDays(sp.d+"T12:00:00",(parseInt(sp.veg||4)*7)+(parseInt(sp.flw||9)*7));
      const resetDays=growMap.find(g=>g.name===sp.name)?.resetDays||7;
      const transplantReady=addDays(harvestDate,parseInt(resetDays));
      const vegStart=addDays(transplantReady,-facilityVegWeeks*7);
      const cutDate=addDays(vegStart,-facilityRootDays);
      const d=daysFromNow(cutDate);
      if(d!==null&&d<=14&&d>=0){
        alerts.push({spaceName:sp.name,strainNames:strains.map(s=>s.name).join(", ")||sp.strain||"",cutDate,d});
      }
    });
    return alerts.sort((a,b)=>a.d-b.d);
  }

  // ── Upcoming harvests ────────────────────────────────────────────────────
  function upcomingHarvests(){
    return spaces.map(sp=>{
      const harvestDate=addDays(sp.d+"T12:00:00",(parseInt(sp.veg||4)*7)+(parseInt(sp.flw||9)*7));
      const d=daysFromNow(harvestDate);
      return{...sp,harvestDate,d};
    }).filter(s=>s.d!==null&&s.d>=0&&s.d<=30).sort((a,b)=>a.d-b.d);
  }

  // ── PM/calibration overdue ───────────────────────────────────────────────
  function pmAlerts(){
    return equipment.filter(eq=>{
      if(!eq.pmFreqDays||eq.pmFreqDays==="none") return false;
      const lastDate=eq.lastServiceDate||eq.purchaseDate;
      if(!lastDate) return false;
      const next=addDays(lastDate,parseInt(eq.pmFreqDays));
      return daysFromNow(next)<=7;
    }).map(eq=>{
      const lastDate=eq.lastServiceDate||eq.purchaseDate;
      const next=addDays(lastDate,parseInt(eq.pmFreqDays));
      return{...eq,nextPM:next,d:daysFromNow(next)};
    }).sort((a,b)=>a.d-b.d);
  }

  // ── License expirations ──────────────────────────────────────────────────
  function licenseAlerts(){
    return employees.filter(e=>e.pestLicenseExpiry&&e.status==="active"&&daysFromNow(e.pestLicenseExpiry)!==null&&daysFromNow(e.pestLicenseExpiry)<=60)
      .map(e=>({...e,d:daysFromNow(e.pestLicenseExpiry)})).sort((a,b)=>a.d-b.d);
  }

  // ── Low stock ────────────────────────────────────────────────────────────
  function lowStockItems(){
    return inventory.filter(item=>{
      const stock=(item.lots||[]).reduce((a,l)=>a+(l.remaining||0),0)||item.stock||0;
      return parseFloat(item.reorderAt)>0&&stock<=parseFloat(item.reorderAt);
    });
  }

  // ── Today's shifts ───────────────────────────────────────────────────────
  const todayShifts=shifts.filter(s=>s.date===todayStr);

  const cuts=cloneCutAlerts();
  const harvests=upcomingHarvests();
  const pm=pmAlerts();
  const licenses=licenseAlerts();
  const lowStock=lowStockItems();
  const openWOs=workOrders.filter(w=>w.status!=="resolved");
  const openLoto=loto.filter(l=>l.status==="open");
  const openDevs=deviations.filter(d=>d.status==="open");

  // ── Sales pipeline calculations ───────────────────────────────────────────
  // Use importStatus (from CSV import) if available, fall back to status field
  const getImportStatus=(o)=>o.importStatus||(o.status==="fulfilled"?"confirmed":o.status==="open"?"confirmed":"pending");
  const confirmedOrders=salesOrders.filter(o=>{const s=getImportStatus(o);return s==="confirmed";});
  const pendingOrders=salesOrders.filter(o=>{const s=getImportStatus(o);return s==="pending";});
  const waitlistOrders=salesOrders.filter(o=>{const s=getImportStatus(o);return s==="waitlist";});
  const getTotal=(o)=>{
    // Try direct orderTotal first
    const direct=parseFloat(o.orderTotal||o.order_total||o["Order Total"]||o["Total"]||0)||0;
    if(direct>0) return direct;
    // Fall back to summing lines array (SalesOrders component schema)
    if(Array.isArray(o.lines)&&o.lines.length>0){
      return o.lines.reduce((a,l)=>(parseFloat(l.orderTotal)||0)+(a),0)||
             o.lines.reduce((a,l)=>a+(parseFloat(l.qty||0)*parseFloat(l.unitPrice||0)),0);
    }
    return parseFloat(o.units||o["Units Ordered"]||0)*parseFloat(o.unitPrice||o.unit_price||o["Unit Price"]||0)||0;
  };
  const confirmedRevenue=confirmedOrders.reduce((a,o)=>a+getTotal(o),0);
  const pendingRevenue=pendingOrders.reduce((a,o)=>a+getTotal(o),0);
  const totalPipeline=confirmedRevenue+pendingRevenue;
  const getDispensaryName=(o)=>o.customerName||o.dispensaryName||o.dispensary_name||o["Dispensary Name"]||o["Account"]||"";
  const uniqueAccounts=new Set(salesOrders.map(getDispensaryName).filter(Boolean)).size;

  const totalAlerts=cuts.filter(c=>c.d<=3).length+qcHolds.length+openLoto.length+openDevs.filter(d=>d.status==="open").length+licenses.filter(l=>l.d<=14).length;

  // ── Revenue per pound ─────────────────────────────────────────────────────
  const totalDryLbs = harvestBatches.filter(b=>b.status==="done"&&b.totalDryWeight>0)
    .reduce((a,b)=>a+(parseFloat(b.totalDryWeight)||0)/453.592,0);
  const revPerLb = totalDryLbs>0 ? (confirmedRevenue+pendingRevenue)/totalDryLbs : 0;

  // ── Strain performance (THCa + yield from COAs and harvest batches) ────────
  const strainPerf = strains.map(s=>{
    const coa = qcTests.filter(t=>(t.strainName||"").toLowerCase()===s.name.toLowerCase());
    const hbs = harvestBatches.filter(b=>b.strainName===s.name&&b.totalDryWeight>0);
    const avgThca = coa.length>0 ? (coa.reduce((a,t)=>a+(parseFloat(t.thca)||0),0)/coa.length).toFixed(1) : s.thcaAvg||"";
    const avgYield = hbs.length>0 ? (hbs.reduce((a,b)=>a+(parseFloat(b.totalDryWeight)||0),0)/hbs.length/453.592).toFixed(1) : "";
    const orders = salesOrders.filter(o=>(o.notes||"").includes(s.name)||(o.lines||[]).some(l=>(l.product||"").includes(s.name)));
    return {name:s.name, avgThca, avgYield, batchCount:hbs.length, orderCount:orders.length};
  }).filter(s=>s.avgThca||s.avgYield).sort((a,b)=>parseFloat(b.avgThca||0)-parseFloat(a.avgThca||0));

  // ── 30-day timeline ────────────────────────────────────────────────────────
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  const thirtyDays = [];
  growSpaces.forEach(sp=>{
    if(!sp.d) return;
    const clone = new Date(sp.d);
    const vegWks = parseInt(sp.veg||4);
    const flwWks = parseInt(sp.flw||9);
    const flip = addDays(sp.d, vegWks*7);
    const harvest = addDays(sp.d, (vegWks+flwWks)*7);
    const strainLabel = (sp.strains||[]).map(s=>s.name).filter(Boolean).join(", ")||sp.strain||sp.name||"";
    [
      {date:flip, event:"🔄 Flip to flower", strain:strainLabel, room:sp.name},
      {date:harvest, event:"🌿 Harvest", strain:strainLabel, room:sp.name},
    ].forEach(e=>{
      const daysOut = Math.round((e.date-today)/86400000);
      if(daysOut>=0&&daysOut<=30) thirtyDays.push({...e,daysOut});
    });
  });
  prodBatches.filter(b=>b.status==="scheduled"||b.status==="in_progress").forEach(b=>{
    if(!b.d) return;
    const daysOut = Math.round((new Date(b.d)-today)/86400000);
    if(daysOut>=-7&&daysOut<=30) thirtyDays.push({date:new Date(b.d),event:"📦 Production",strain:b.strains||"",room:b.name,daysOut:Math.max(0,daysOut)});
  });
  thirtyDays.sort((a,b)=>a.daysOut-b.daysOut);

  const greetingHour=today.getHours();
  const greeting=greetingHour<12?"Good morning":greetingHour<17?"Good afternoon":"Good evening";

  return(
    <>
      <style>{CSS}</style>
      <div className="db-wrap">
        {/* Header */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:20,fontWeight:700,color:"var(--text)",marginBottom:2}}>
            {greeting}{settings.facilityName?" — "+settings.facilityName:""}
            <div style={{fontSize:11,color:"var(--text-3)",fontWeight:400,marginTop:2}}>
              {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})} · Updated {new Date().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
            </div>
          </div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>{today.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}{totalAlerts>0&&<span style={{marginLeft:10,fontWeight:600,color:"var(--danger)"}}>• {totalAlerts} item{totalAlerts!==1?"s":""} need attention</span>}</div>
        </div>

        {/* Empty state — show when no meaningful data exists */}
        {!settings.facilityName&&salesOrders.length===0&&harvestBatches.length===0&&employees.length===0&&(
          <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:12,padding:"32px 28px",marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🌿</div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:8}}>Welcome to ResinOps</div>
            <div style={{fontSize:13,color:"var(--text-2)",marginBottom:20,maxWidth:480,margin:"0 auto 20px"}}>
              Your dashboard will populate automatically as you import data. Get started in two ways:
            </div>
            <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>onNavigate&&onNavigate("data-manager")} style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:10,padding:"12px 24px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                ✨ Go to Data &amp; Imports
              </button>
              <button onClick={()=>{
                // Quick demo load
                const demoSettings={facilityName:"Cascade Peak Cannabis LLC",licenseNumber:"OCM-AUPR-007891",licenseType:"Adult-Use Cultivator",state:"NY",city:"Tuxedo",address:"1220 Route 17M",zip:"10987"};
                localStorage.setItem("resinops_facility_settings",JSON.stringify(demoSettings));
                window.location.reload();
              }} style={{background:"rgba(90,63,160,0.15)",color:"#9080f0",border:"1px solid rgba(90,63,160,0.3)",borderRadius:10,padding:"12px 24px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🏭 Load demo facility
              </button>
            </div>
            <div style={{fontSize:11,color:"var(--text-3)",marginTop:16}}>
              Or use Data &amp; Imports → Backup → "Load demo facility settings" for a fully configured demo with all modules populated.
            </div>
          </div>
        )}

        {/* Top stats row */}
        <div className="db-grid db-row3" style={{marginBottom:14}}>
          {[
            {icon:"💰",label:"Confirmed revenue",value:"$"+confirmedRevenue.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}),sub:confirmedOrders.length+" orders ready to fulfill",nav:"sales",alert:false},
            {icon:"🧾",label:"Pending pipeline",value:"$"+pendingRevenue.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0}),sub:waitlistOrders.length+" on waitlist",nav:"sales",alert:false},
            {icon:"🏪",label:"Active accounts",value:uniqueAccounts||"—",sub:salesOrders.length+" total orders",nav:"sales",alert:false},
            {icon:"🏭",label:"Production batches",value:prodBatchesAll.length,sub:qcHolds.length+" on QC hold",nav:"production",alert:qcHolds.length>0},
            {icon:"⛔",label:"QC holds",value:qcHolds.length,sub:"blocked from sales",nav:"qc-testing",alert:qcHolds.length>0},
            {icon:"🛠️",label:"Open work orders",value:openWOs.length,sub:openWOs.filter(w=>w.severity==="critical"||w.severity==="high").length+" critical/high",nav:"maintenance",alert:openWOs.some(w=>w.severity==="critical")},
            {icon:"⚠",label:"Open deviations",value:openDevs.length,sub:"awaiting CAPA",nav:"gmp-hub",alert:openDevs.length>0},
          ].map((s,i)=>(
            <div key={i} className="db-card" style={{cursor:onNavigate?"pointer":"default",borderColor:s.alert?"rgba(200,74,74,0.4)":"var(--border-2)"}} onClick={()=>onNavigate&&onNavigate(s.nav)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:11,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{s.label}</div>
                  <div style={{fontSize:26,fontWeight:700,color:s.alert?"var(--danger)":"var(--accent-2)"}}>{s.value}</div>
                  <div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>{s.sub}</div>
                </div>
                <span style={{fontSize:22}}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="db-grid db-row2">
          {/* Sales pipeline */}
          {salesOrders.length>0&&(
            <div className="db-card">
              <div className="db-card-t">🧾 Sales pipeline</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div style={{background:"rgba(74,124,89,0.08)",borderRadius:8,padding:"10px 12px",border:"1px solid rgba(74,124,89,0.2)"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Confirmed revenue</div>
                  <div style={{fontSize:20,fontWeight:700,color:"var(--accent-2)"}}>${confirmedRevenue.toLocaleString(undefined,{minimumFractionDigits:0})}</div>
                  <div style={{fontSize:10,color:"var(--text-3)"}}>{confirmedOrders.length} orders</div>
                </div>
                <div style={{background:"rgba(200,150,58,0.08)",borderRadius:8,padding:"10px 12px",border:"1px solid rgba(200,150,58,0.2)"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Pending pipeline</div>
                  <div style={{fontSize:20,fontWeight:700,color:"var(--amber)"}}>${pendingRevenue.toLocaleString(undefined,{minimumFractionDigits:0})}</div>
                  <div style={{fontSize:10,color:"var(--text-3)"}}>{pendingOrders.length} orders · {waitlistOrders.length} waitlisted</div>
                </div>
              </div>
              {confirmedOrders.slice(0,4).map((o,i)=>{
                const name=o.customerName||getDispensaryName(o);
                const product=o.product||o["Product"]||o.strain||o["Strain"]||"";
                const total=getTotal(o);
                return(
                  <div key={i} className="db-alert a-green" style={{cursor:"pointer"}} onClick={()=>onNavigate&&onNavigate("sales")}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:500,color:"var(--text)",fontSize:12}}>{name}</div>
                      <div style={{fontSize:10,color:"var(--text-3)"}}>{product}</div>
                    </div>
                    <div style={{fontWeight:700,color:"var(--accent-2)",fontSize:12}}>${total.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
                  </div>
                );
              })}
              {confirmedOrders.length>4&&<div style={{fontSize:11,color:"var(--text-3)",textAlign:"center",marginTop:4}}>+{confirmedOrders.length-4} more confirmed orders</div>}
            </div>
          )}

          {/* ── Revenue per pound ── */}
          {totalDryLbs>0&&(
            <div className="db-card">
              <div className="db-card-t">💰 Revenue per pound</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:700,color:"var(--accent-2)"}}>${revPerLb.toFixed(0)}</div>
                  <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase"}}>Rev / lb</div>
                </div>
                <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:700,color:"var(--text)"}}>{totalDryLbs.toFixed(1)}</div>
                  <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase"}}>Total lbs produced</div>
                </div>
                <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:700,color:"var(--text)"}}>{harvestBatches.filter(b=>b.status==="done").length}</div>
                  <div style={{fontSize:10,color:"var(--text-3)",textTransform:"uppercase"}}>Completed batches</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Strain performance ── */}
          {strainPerf.length>0&&(
            <div className="db-card">
              <div className="db-card-t">🧬 Strain performance</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr>
                  {["Strain","Avg THCa %","Avg Dry Yield (lbs)","Batches","Orders"].map(h=>(
                    <th key={h} style={{padding:"4px 8px",textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--text-3)",borderBottom:"1px solid var(--border)"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {strainPerf.map((s,i)=>(
                    <tr key={s.name} style={{borderBottom:"1px solid var(--border)",background:i%2===0?"transparent":"var(--surface-2)"}}>
                      <td style={{padding:"6px 8px",fontWeight:600,color:"var(--text)"}}>{s.name}</td>
                      <td style={{padding:"6px 8px",fontWeight:700,color:"var(--accent-2)"}}>{s.avgThca?s.avgThca+"%":"—"}</td>
                      <td style={{padding:"6px 8px",color:"var(--text-2)"}}>{s.avgYield?s.avgYield+" lbs":"—"}</td>
                      <td style={{padding:"6px 8px",color:"var(--text-3)"}}>{s.batchCount||"—"}</td>
                      <td style={{padding:"6px 8px",color:"var(--text-3)"}}>{s.orderCount||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 30-day operational timeline ── */}
          {thirtyDays.length>0&&(
            <div className="db-card">
              <div className="db-card-t">📅 Next 30 days</div>
              {thirtyDays.slice(0,10).map((e,i)=>(
                <div key={i} className="db-alert a-green" style={{cursor:"default"}}>
                  <div style={{minWidth:36,fontWeight:700,color:"var(--accent-2)",fontSize:12}}>
                    {e.daysOut===0?"Today":e.daysOut===1?"Tomorrow":e.daysOut+"d"}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,color:"var(--text)",fontSize:12}}>{e.event} — {e.strain}</div>
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{e.room} · {e.date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                  </div>
                </div>
              ))}
              {thirtyDays.length>10&&<div style={{fontSize:11,color:"var(--text-3)",textAlign:"center",marginTop:4}}>+{thirtyDays.length-10} more events this month</div>}
            </div>
          )}

          {/* Clone cut alerts */}
          <div className="db-card">
            <div className="db-card-t">✂️ Upcoming clone cuts</div>
            {cuts.length===0?<div className="db-empty">No cuts due in the next 14 days</div>:cuts.map((c,i)=>(
              <div key={i} className={"db-alert "+(c.d<=3?"a-red":c.d<=7?"a-amber":"a-green")}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,color:"var(--text)"}}>{c.spaceName}</div>
                  <div style={{fontSize:11,color:"var(--text-3)"}}>{c.strainNames}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:c.d<=3?"var(--danger)":c.d<=7?"var(--amber)":"var(--accent-2)",fontSize:13}}>{c.d===0?"TODAY":c.d===1?"TOMORROW":"In "+c.d+"d"}</div>
                  <div style={{fontSize:10,color:"var(--text-3)"}}>{fmtD(c.cutDate)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Upcoming harvests */}
          <div className="db-card">
            <div className="db-card-t">🌿 Upcoming harvests (30 days)</div>
            {harvests.length===0?<div className="db-empty">No harvests scheduled in the next 30 days</div>:(
              <table className="db-tbl">
                <thead><tr><th>Space</th><th>Strains</th><th>Est. harvest</th></tr></thead>
                <tbody>{harvests.map((s,i)=>(
                  <tr key={i}>
                    <td style={{fontWeight:500,color:"var(--text)"}}>{s.name}</td>
                    <td style={{fontSize:11}}>{(s.strains||[]).map(x=>x.name).join(", ")||s.strain||"—"}</td>
                    <td><span style={{fontWeight:600,color:s.d<=7?"var(--amber)":"var(--text)"}}>{s.d===0?"Today":s.d+"d — "+fmtD(s.harvestDate)}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {/* PM & license alerts */}
          <div className="db-card">
            <div className="db-card-t">🔧 PM / Calibration due</div>
            {pm.length===0?<div className="db-empty">No PM due in the next 7 days</div>:pm.slice(0,5).map((eq,i)=>(
              <div key={i} className={"db-alert "+(eq.d<0?"a-red":"a-amber")}>
                <div style={{flex:1}}><div style={{fontWeight:500,color:"var(--text)"}}>{eq.name}</div><div style={{fontSize:10,color:"var(--text-3)"}}>{eq.cat} · {eq.location||"—"}</div></div>
                <div style={{fontWeight:700,color:eq.d<0?"var(--danger)":"var(--amber)",fontSize:12}}>{eq.d<0?"Overdue "+Math.abs(eq.d)+"d":"Due in "+eq.d+"d"}</div>
              </div>
            ))}
          </div>

          {/* License expirations */}
          <div className="db-card">
            <div className="db-card-t">📋 License expirations (60 days)</div>
            {licenses.length===0?<div className="db-empty">No licenses expiring in the next 60 days</div>:licenses.map((e,i)=>(
              <div key={i} className={"db-alert "+(e.d<=14?"a-red":"a-amber")}>
                <div style={{flex:1}}><div style={{fontWeight:500,color:"var(--text)"}}>{e.name}</div><div style={{fontSize:10,color:"var(--text-3)"}}>{e.pestLicenseCategory?.split("—")[0].trim()}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontWeight:700,color:e.d<=14?"var(--danger)":"var(--amber)",fontSize:12}}>In {e.d}d</div><div style={{fontSize:10,color:"var(--text-3)"}}>{fmtD(e.pestLicenseExpiry)}</div></div>
              </div>
            ))}
          </div>

          {/* Low stock */}
          <div className="db-card">
            <div className="db-card-t">📦 Low / out of stock</div>
            {lowStock.length===0?<div className="db-empty">All inventory levels above reorder points</div>:(
              <table className="db-tbl">
                <thead><tr><th>Item</th><th>Stock</th><th>Reorder at</th></tr></thead>
                <tbody>{lowStock.slice(0,6).map((item,i)=>{
                  const stock=(item.lots||[]).reduce((a,l)=>a+(l.remaining||0),0)||item.stock||0;
                  return<tr key={i}><td style={{fontWeight:500,color:"var(--text)"}}>{item.n}</td><td style={{color:stock===0?"var(--danger)":"var(--amber)",fontWeight:600}}>{stock} {item.uom}</td><td style={{fontSize:11}}>{item.reorderAt} {item.uom}</td></tr>;
                })}</tbody>
              </table>
            )}
          </div>

          {/* Today's shifts / recent activity */}
          <div className="db-card">
            <div className="db-card-t">🕐 Today's shift activity</div>
            {todayShifts.length===0?<div className="db-empty">No shifts logged for today yet</div>:todayShifts.map((sh,i)=>{
              const empNames=(sh.entries||[]).map(e=>{const emp=JSON.parse(localStorage.getItem("resinops_employees")||"[]").find(x=>x.id===e.employeeId);return emp?.name||"";}).filter(Boolean);
              return(
                <div key={i} className="db-alert a-blue">
                  <div>
                    <div style={{fontWeight:500,color:"var(--text)"}}>{sh.department}</div>
                    <div style={{fontSize:11,color:"var(--text-3)"}}>{empNames.join(", ")||"No staff logged yet"}</div>
                  </div>
                </div>
              );
            })}
            {settings.facilityName&&<div style={{marginTop:10,padding:"8px 10px",background:"var(--surface-2)",borderRadius:6,fontSize:11,color:"var(--accent-2)"}}>
              {settings.facilityName} · {settings.licenseNumber||"License # not set"} · {settings.state}
            </div>}
          </div>
        </div>
      </div>
    </>
  );
}
