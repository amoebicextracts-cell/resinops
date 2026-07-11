import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { STEP_LABOR } from "./LaborManager.jsx";

// ── Date helpers ───────────────────────────────────────────────────────────
function dAdd(dt,n){const r=new Date(dt);r.setDate(r.getDate()+n);return r;}
function dDiff(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
function fmtDay(dt){return new Date(dt).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});}
function fmtShort(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function startOfWeek(dt){const d=new Date(dt);d.setDate(d.getDate()-d.getDay());d.setHours(0,0,0,0);return d;}
function isSameDay(a,b){const x=new Date(a),y=new Date(b);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate();}
function isToday(dt){return isSameDay(dt,new Date());}

// ── Cultivation harvest calculator (mirrors Scheduler.jsx) ─────────────────
const CULT_ROOTING=14, CULT_DRYING=12, CULT_TESTING=10, CULT_PACKAGING=9;
function cultHarvestDate(sp){
  const s=new Date(sp.d+"T12:00:00");
  const tx=dAdd(s,CULT_ROOTING);
  const fl=dAdd(tx,sp.veg*7);
  return dAdd(fl,sp.flw*7);
}
function cultInventoryDate(sp){
  const hv=cultHarvestDate(sp);
  return dAdd(dAdd(dAdd(hv,CULT_DRYING),CULT_TESTING),CULT_PACKAGING);
}

// ── Step calendar day calculator ───────────────────────────────────────────
function stepCalDays(step, shiftHours) {
  const sh = parseFloat(shiftHours) || 8;
  if (step.isPassive) return Math.max(1, parseInt(step.calDays || step.hours || step.days || 1));
  if (step.days !== undefined && step.hours === undefined) return Math.max(1, parseInt(step.days));
  const hrs = parseFloat(step.hours) || sh;
  const staff = parseInt(step.staffCount) || 1;
  return Math.max(1, Math.ceil(hrs / (staff * sh)));
}

function buildTimeline(d, steps, shiftHours) {
  let c = new Date(d + "T12:00:00");
  return (steps || []).map(s => {
    const s0 = new Date(c);
    const days = stepCalDays(s, shiftHours);
    const e = dAdd(c, days);
    c = e;
    return { ...s, name: s.n || s.name, calDays: days, start: s0, end: e };
  });
}

// ── Daily demand calc ──────────────────────────────────────────────────────
function getDayDemand(date, batches, spaces, shiftHours, ltMap) {
  const items = [];
  const dStart = new Date(date); dStart.setHours(0,0,0,0);
  const dEnd   = new Date(date); dEnd.setHours(23,59,59,999);

  batches.filter(b => !b.isLinked).forEach(batch => {
    const tl = buildTimeline(batch.d, batch.steps, shiftHours);
    tl.forEach(step => {
      if (step.start <= dEnd && step.end > dStart) {
        const def = STEP_LABOR[step.name] || {};
        const isP = step.isPassive !== undefined ? step.isPassive : (def.p || false);
        const ltId = step.laborTypeId || "unassigned";
        const dailyHrs = isP
          ? ((step.monitorHrsPerDay !== undefined ? step.monitorHrsPerDay : (def.m || 0.25)) * (step.staffCount || def.s || 1))
          : ((step.staffCount || def.s || 1) * parseFloat(shiftHours || 8));
        const rate = ltMap[ltId]?.rate || 0;
        items.push({ batchName:batch.name, stepName:step.name, ltId, ltName:ltMap[ltId]?.n||"Unassigned", hours:dailyHrs, cost:dailyHrs*rate, isPassive:isP });
      }
    });
  });

  // Cultivation harvest events
  spaces.forEach(sp => {
    const hv = cultHarvestDate(sp);
    if (isSameDay(hv, date)) {
      const harvestHrs = Math.max(1, Math.ceil((sp.plants || 0) * 0.25));
      items.push({ batchName:sp.name+" (HARVEST)", stepName:"Harvest / Buck", ltId:"cultivation", ltName:"Cultivation Team", hours:harvestHrs, cost:0, isPassive:false, isHarvest:true });
    }
  });

  return items;
}

const CSS = `
  .ld-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ld-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:18px;}
  .ld-day{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;cursor:pointer;transition:border-color 0.15s;}
  .ld-day:hover{border-color:var(--accent);}
  .ld-day.today{border-color:var(--accent);background:rgba(74,124,89,0.08);}
  .ld-day.selected{border-color:var(--accent-2);background:rgba(74,124,89,0.15);}
  .ld-bar{height:6px;border-radius:3px;margin-top:4px;transition:width 0.3s;}
  .ld-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .ld-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .ld-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .ld-tbl tr:last-child td{border-bottom:none;}
  .ld-pill{font-size:9px;font-weight:700;padding:2px 6px;border-radius:10px;white-space:nowrap;}
  .ld-ok{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .ld-warn{background:rgba(200,150,58,0.15);color:var(--amber);}
  .ld-over{background:rgba(200,74,74,0.15);color:var(--danger);}
  .ld-passive{background:rgba(100,100,100,0.12);color:var(--text-3);}
  .ld-harvest{background:rgba(90,120,200,0.15);color:#7090f0;}
  .ld-nav{background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;cursor:pointer;padding:6px 12px;font-size:12px;color:var(--text-2);font-family:'Inter',sans-serif;}
  .ld-nav:hover{border-color:var(--accent);color:var(--accent-2);}
`;

export default function LaborDashboard() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);

  // Load data
  const [facility, setFacility] = useState({shiftHours:"8",shiftsPerDay:"1"});
  const [laborTypes, setLaborTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [lt, pb, sp]=await Promise.all([
          db.labor_types.list(),
          db.production_batches.list(),
          db.grow_spaces.list(),
        ]);
        setLaborTypes(lt);
        setBatches(pb);
        setSpaces(sp);
      }catch(e){ console.error("LaborDashboard load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const sh = parseFloat(facility.shiftHours) || 8;
  const spd = parseInt(facility.shiftsPerDay) || 1;
  const hrsPerDay = sh * spd;

  // Build labor type map
  const ltMap = {};
  laborTypes.forEach(lt => ltMap[lt.id] = lt);
  // Also build category → available hours map
  const catCapacity = {};
  laborTypes.forEach(lt => {
    if (!catCapacity[lt.cat]) catCapacity[lt.cat] = { count:0, hrs:0, rate:0 };
    catCapacity[lt.cat].count += lt.count;
    catCapacity[lt.cat].hrs += lt.count * hrsPerDay;
    catCapacity[lt.cat].rate += lt.count * lt.rate;
  });

  // 5-week window (35 days)
  const windowStart = startOfWeek(dAdd(new Date(), weekOffset * 7));
  const days = Array.from({length:35},(_,i) => dAdd(windowStart,i));

  // Compute demand for all days
  const dayDemands = days.map(d => ({
    date: d,
    items: getDayDemand(d, batches, spaces, sh, ltMap),
  }));

  // Selected day detail
  const selDay = selectedDay ? dayDemands.find(d => isSameDay(d.date, selectedDay)) : null;

  // Group items by labor category for the selected day
  function groupByCat(items) {
    const g = {};
    items.forEach(item => {
      const lt = ltMap[item.ltId];
      const cat = lt?.cat || (item.isHarvest ? "Cultivation" : "Unassigned");
      if (!g[cat]) g[cat] = { items:[], totalHrs:0, totalCost:0 };
      g[cat].items.push(item);
      g[cat].totalHrs += item.hours;
      g[cat].totalCost += item.cost;
    });
    return g;
  }

  function utilColor(usedHrs, availHrs) {
    if (availHrs === 0) return "#7090f0";
    const pct = usedHrs / availHrs;
    if (pct <= 0.7) return "var(--accent-2)";
    if (pct <= 1.0) return "var(--amber)";
    return "var(--danger)";
  }

  function utilClass(usedHrs, availHrs) {
    if (availHrs === 0) return "ld-harvest";
    const pct = usedHrs / availHrs;
    if (pct <= 0.7) return "ld-ok";
    if (pct <= 1.0) return "ld-warn";
    return "ld-over";
  }

  // Weekly summary (by cat)
  const weeks = [0,1,2,3,4].map(w => {
    const weekDays = dayDemands.slice(w*7,(w+1)*7);
    const totalHrs = {};
    weekDays.forEach(({items}) => items.forEach(item => {
      const lt = ltMap[item.ltId];
      const cat = lt?.cat || (item.isHarvest?"Cultivation":"Unassigned");
      totalHrs[cat] = (totalHrs[cat]||0) + item.hours;
    }));
    return { start:weekDays[0]?.date, end:weekDays[6]?.date, totalHrs };
  });

  const hasBatches = batches.filter(b=>!b.isLinked).length > 0 || spaces.length > 0;

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading labor dashboard…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="ld-wrap">
        <div style={{marginBottom:20}}>
          <!-- title removed - shown in app header -->
        </div>

        {laborTypes.length===0&&(
          <div style={{background:"rgba(200,150,58,0.08)",border:"1px solid rgba(200,150,58,0.25)",borderRadius:10,padding:"16px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--amber)",marginBottom:3}}>⚠ No labor types configured</div>
              <div style={{fontSize:12,color:"var(--text-3)"}}>Labor demand calculations require configured labor types with headcounts and hourly rates. Load the demo or set up in Labor Setup.</div>
            </div>
            <button onClick={()=>{
              const laborTypes=[
                {id:"cultivation",n:"Cultivation Team",cat:"cultivation",count:4,rate:22,hrsPerDay:8,notes:""},
                {id:"postharvest",n:"Post-Harvest Team",cat:"post_harvest",count:3,rate:18,hrsPerDay:8,notes:""},
                {id:"processing",n:"Processing Team",cat:"processing",count:2,rate:20,hrsPerDay:8,notes:""},
              ];
              // labor types saved via LaborManager
              window.location.reload();
            }} style={{background:"var(--amber)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
              Load defaults
            </button>
          </div>
        )}

        {!hasBatches && (
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>📊</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No scheduled batches yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Add production batches or grow spaces to see labor demand planning</div>
          </div>
        )}

        {hasBatches && (<>
          {/* Week navigation */}
          <div className="ld-card">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button className="ld-nav" onClick={()=>setWeekOffset(w=>w-1)}>← Previous 5 weeks</button>
              <div style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>
                {fmtShort(windowStart)} — {fmtShort(dAdd(windowStart,34))}
              </div>
              <button className="ld-nav" onClick={()=>setWeekOffset(w=>w+1)}>Next 5 weeks →</button>
            </div>

            {/* 5-week grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                <div key={d} style={{fontSize:10,fontWeight:700,color:"var(--text-3)",textAlign:"center",paddingBottom:4}}>{d}</div>
              ))}
              {dayDemands.map(({date,items},i) => {
                const totalDemand = items.reduce((a,x)=>a+x.hours,0);
                const totalCost = items.reduce((a,x)=>a+x.cost,0);
                const totalCap = hrsPerDay * laborTypes.reduce((a,t)=>a+t.count,0);
                const pct = totalCap>0 ? Math.min(totalDemand/totalCap,1) : 0;
                const hasHarvest = items.some(x=>x.isHarvest);
                const sel = selectedDay&&isSameDay(date,selectedDay);
                const tod = isToday(date);
                return (
                  <div key={i} className={"ld-day"+(tod?" today":"")+(sel?" selected":"")}
                    onClick={()=>setSelectedDay(sel?null:date)}>
                    <div style={{fontSize:10,fontWeight:600,color:tod?"var(--accent-2)":"var(--text-2)"}}>{date.getDate()}</div>
                    {items.length>0 && (
                      <>
                        <div style={{fontSize:9,color:"var(--text-3)",marginTop:1}}>{totalDemand.toFixed(0)}h·${totalCost.toFixed(0)}</div>
                        <div className="ld-bar" style={{width:(pct*100)+"%",background:utilColor(totalDemand,totalCap)}} />
                        {hasHarvest && <div style={{fontSize:8,color:"#7090f0",marginTop:2,fontWeight:700}}>🌿 HARVEST</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex",gap:16,marginTop:12,fontSize:11,color:"var(--text-3)"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:6,borderRadius:3,background:"var(--accent-2)"}} />≤70% capacity</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:6,borderRadius:3,background:"var(--amber)"}} />70-100% capacity</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:6,borderRadius:3,background:"var(--danger)"}} />Over capacity</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:6,borderRadius:3,background:"#7090f0"}} />Harvest event</div>
            </div>
          </div>

          {/* Selected day detail */}
          {selDay && (
            <div className="ld-card">
              <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:12}}>
                {fmtDay(selDay.date)} — Detail
                {isToday(selDay.date) && <span style={{fontSize:11,color:"var(--accent-2)",marginLeft:8,fontWeight:400}}>Today</span>}
              </div>
              {selDay.items.length === 0 ? (
                <div style={{fontSize:13,color:"var(--text-3)"}}>No production activity on this day.</div>
              ) : (() => {
                const grouped = groupByCat(selDay.items);
                return (
                  <>
                    {/* Staffing recommendations */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,marginBottom:16}}>
                      {Object.entries(grouped).map(([cat,g]) => {
                        const cap = catCapacity[cat];
                        const headNeeded = sh>0 ? Math.ceil(g.totalHrs/sh) : 0;
                        const headAvail = cap?.count || 0;
                        const cls = headAvail===0?"ld-harvest":headNeeded<=headAvail?"ld-ok":headNeeded<headAvail*1.2?"ld-warn":"ld-over";
                        return (
                          <div key={cat} style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}>
                            <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{cat}</div>
                            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                              <span style={{fontSize:20,fontWeight:700,color:"var(--text)"}}>{headNeeded}</span>
                              <span style={{fontSize:12,color:"var(--text-3)"}}>/ {headAvail} avail</span>
                              <span className={"ld-pill "+cls}>{headNeeded<=headAvail?"OK":headNeeded-headAvail+" short"}</span>
                            </div>
                            <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>{g.totalHrs.toFixed(1)} person-hrs · ${g.totalCost.toFixed(0)}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Step breakdown */}
                    <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                      <table className="ld-tbl">
                        <thead><tr><th>Batch</th><th>Step</th><th>Labor Type</th><th>Hours</th><th>Est. Cost</th><th>Type</th></tr></thead>
                        <tbody>
                          {selDay.items.map((item,i) => (
                            <tr key={i}>
                              <td style={{fontWeight:500,color:"var(--text)",whiteSpace:"nowrap"}}>{item.batchName}</td>
                              <td style={{whiteSpace:"nowrap"}}>{item.stepName}</td>
                              <td>{item.ltName}</td>
                              <td>{item.hours.toFixed(1)} hrs</td>
                              <td>{item.cost>0?"$"+item.cost.toFixed(0):"—"}</td>
                              <td>
                                {item.isHarvest ? <span className="ld-pill ld-harvest">Harvest</span>
                                  : item.isPassive ? <span className="ld-pill ld-passive">Monitoring</span>
                                  : <span className="ld-pill ld-ok">Active</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Weekly summary */}
          <div className="ld-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Weekly Summary</div>
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="ld-tbl">
                <thead>
                  <tr>
                    <th>Week</th>
                    {Object.keys(catCapacity).map(cat=><th key={cat}>{cat}</th>)}
                    <th>Total Hours</th>
                    <th>Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((wk,i) => {
                    if (!wk.start) return null;
                    const wkDays = dayDemands.slice(i*7,(i+1)*7);
                    const wkItems = wkDays.flatMap(d=>d.items);
                    const totalHrs = wkItems.reduce((a,x)=>a+x.hours,0);
                    const totalCost = wkItems.reduce((a,x)=>a+x.cost,0);
                    return (
                      <tr key={i}>
                        <td style={{whiteSpace:"nowrap",fontWeight:500,color:"var(--text)"}}>{fmtShort(wk.start)} – {fmtShort(wk.end)}</td>
                        {Object.keys(catCapacity).map(cat => {
                          const hrs = wkItems.filter(x=>{const lt=ltMap[x.ltId];return(lt?.cat||"Unassigned")===cat;}).reduce((a,x)=>a+x.hours,0);
                          const avail = catCapacity[cat]?.hrs * 5 || 0;
                          const cls = hrs===0?"":utilClass(hrs,avail);
                          return <td key={cat}>{hrs>0?<span className={"ld-pill "+cls}>{hrs.toFixed(0)}h</span>:<span style={{color:"var(--text-3)"}}>—</span>}</td>;
                        })}
                        <td style={{fontWeight:500}}>{totalHrs.toFixed(0)} hrs</td>
                        <td style={{color:"var(--accent-2)",fontWeight:500}}>{totalCost>0?"$"+totalCost.toFixed(0):"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}
      </div>
    </>
  );
}
