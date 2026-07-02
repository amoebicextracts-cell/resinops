import { useState } from "react";

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
  const settings=JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}");
  const spaces=JSON.parse(localStorage.getItem("resinops_spaces")||"[]");
  const growMap=JSON.parse(localStorage.getItem("resinops_grow_map")||"[]");
  const harvestBatches=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
  const prodBatches=JSON.parse(localStorage.getItem("resinops_prod")||"[]").filter(b=>!b.isLinked);
  const employees=JSON.parse(localStorage.getItem("resinops_employees")||"[]");
  const equipment=JSON.parse(localStorage.getItem("resinops_equipment")||"[]");
  const workOrders=JSON.parse(localStorage.getItem("resinops_workorders")||"[]");
  const loto=JSON.parse(localStorage.getItem("resinops_loto")||"[]");
  const deviations=JSON.parse(localStorage.getItem("resinops_deviations")||"[]");
  const qcHolds=JSON.parse(localStorage.getItem("resinops_qc_holds")||"[]");
  const qcTests=JSON.parse(localStorage.getItem("resinops_qc_tests")||"[]");
  const inventory=JSON.parse(localStorage.getItem("resinops_inventory")||"[]");
  const cloneSched=JSON.parse(localStorage.getItem("resinops_clone_sched")||"[]");
  const shifts=JSON.parse(localStorage.getItem("resinops_shifts")||"[]");
  const facilityVegWeeks=parseInt(localStorage.getItem("resinops_facility_veg_weeks")||"4");
  const facilityRootDays=parseInt(localStorage.getItem("resinops_facility_root_days")||"14");

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

  // COAs submitted but not yet received (awaiting lab results)
  const pendingCOAs = qcTests.filter(t => t.submittedDate && !t.receivedDate && t.overallPass===undefined);

  // GMP cert expirations within 60 days across all employees
  const gmpCertAlerts = employees.flatMap(e =>
    (e.certs||[]).filter(c => c.expiry && daysFromNow(c.expiry) !== null && daysFromNow(c.expiry) <= 60)
      .map(c => ({...c, employeeName: e.name, d: daysFromNow(c.expiry)}))
  ).sort((a,b) => a.d - b.d);

  // Training expirations within 60 days
  const trainingAlerts = employees.flatMap(e =>
    (e.trainings||[]).filter(t => t.expiry && daysFromNow(t.expiry) !== null && daysFromNow(t.expiry) <= 60)
      .map(t => ({...t, employeeName: e.name, d: daysFromNow(t.expiry)}))
  ).sort((a,b) => a.d - b.d);
  const openWOs=workOrders.filter(w=>w.status!=="resolved");
  const openLoto=loto.filter(l=>l.status==="open");
  const openDevs=deviations.filter(d=>d.status==="open");

  const totalAlerts=cuts.filter(c=>c.d<=3).length+qcHolds.length+openLoto.length+openDevs.filter(d=>d.status==="open").length+licenses.filter(l=>l.d<=14).length+pendingCOAs.length+gmpCertAlerts.filter(c=>c.d<=14).length+trainingAlerts.filter(t=>t.d<=14).length;

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
          </div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>{today.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}{totalAlerts>0&&<span style={{marginLeft:10,fontWeight:600,color:"var(--danger)"}}>• {totalAlerts} item{totalAlerts!==1?"s":""} need attention</span>}</div>
        </div>

        {/* Top stats row */}
        <div className="db-grid db-row3" style={{marginBottom:14}}>
          {[
            {icon:"🌿",label:"Active grow spaces",value:spaces.length,sub:spaces.length+" scheduled",nav:"scheduler"},
            {icon:"🏭",label:"Production batches",value:prodBatches.length,sub:qcHolds.length+" on QC hold",nav:"production",alert:qcHolds.length>0},
            {icon:"⛔",label:"QC holds",value:qcHolds.length,sub:"blocked from sales",nav:"qc-testing",alert:qcHolds.length>0},
            {icon:"🛠️",label:"Open work orders",value:openWOs.length,sub:openWOs.filter(w=>w.severity==="critical"||w.severity==="high").length+" critical/high",nav:"maintenance",alert:openWOs.some(w=>w.severity==="critical")},
            {icon:"🔒",label:"Active LOTO",value:openLoto.length,sub:"equipment locked out",nav:"maintenance",alert:openLoto.length>0},
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

          {/* Pending COAs */}
          {pendingCOAs.length>0&&(
            <div className="db-card">
              <div className="db-card-t">🔬 COAs awaiting lab results ({pendingCOAs.length})</div>
              {pendingCOAs.map((t,i)=>(
                <div key={i} className="db-alert a-amber" style={{cursor:onNavigate?"pointer":"default"}} onClick={()=>onNavigate&&onNavigate("qc-testing")}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,color:"var(--text)"}}>{t.strainName||"Unknown strain"}</div>
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{t.labName||"Lab"} · Sample {t.sampleId||"—"}</div>
                  </div>
                  <div style={{textAlign:"right",fontSize:10,color:"var(--text-3)"}}>Submitted {fmtD(t.submittedDate)}</div>
                </div>
              ))}
            </div>
          )}

          {/* GMP cert expirations */}
          {gmpCertAlerts.length>0&&(
            <div className="db-card">
              <div className="db-card-t">🏅 GMP certifications expiring (60 days)</div>
              {gmpCertAlerts.map((c,i)=>(
                <div key={i} className={"db-alert "+(c.d<=14?"a-red":"a-amber")} style={{cursor:onNavigate?"pointer":"default"}} onClick={()=>onNavigate&&onNavigate("employees")}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,color:"var(--text)"}}>{c.employeeName}</div>
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{c.name||c.cert||"Certification"}</div>
                  </div>
                  <div style={{textAlign:"right"}}><div style={{fontWeight:700,color:c.d<=14?"var(--danger)":"var(--amber)",fontSize:12}}>In {c.d}d</div><div style={{fontSize:10,color:"var(--text-3)"}}>{fmtD(c.expiry)}</div></div>
                </div>
              ))}
            </div>
          )}

          {/* Training expirations */}
          {trainingAlerts.length>0&&(
            <div className="db-card">
              <div className="db-card-t">📚 Trainings expiring (60 days)</div>
              {trainingAlerts.map((t,i)=>(
                <div key={i} className={"db-alert "+(t.d<=14?"a-red":"a-amber")} style={{cursor:onNavigate?"pointer":"default"}} onClick={()=>onNavigate&&onNavigate("employees")}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500,color:"var(--text)"}}>{t.employeeName}</div>
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{t.name||t.training||"Training"}</div>
                  </div>
                  <div style={{textAlign:"right"}}><div style={{fontWeight:700,color:t.d<=14?"var(--danger)":"var(--amber)",fontSize:12}}>In {t.d}d</div><div style={{fontSize:10,color:"var(--text-3)"}}>{fmtD(t.expiry)}</div></div>
                </div>
              ))}
            </div>
          )}

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
