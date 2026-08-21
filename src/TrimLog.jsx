import { useState, useEffect, useMemo } from "react";
import { db, auth } from "./lib/db";
import { parseDateLocal, todayLocalISO } from "./lib/dateUtils";

// Matches harvest_batches' own grade keys (aa/a/b/c) so a trim entry's grade
// lines up with the batch's own grade breakdown rather than inventing a
// separate vocabulary.
const GRADES = [
  {v:"",l:"— Not specified —"},
  {v:"aa",l:"AA"},
  {v:"a",l:"A"},
  {v:"b",l:"B"},
  {v:"c",l:"C"},
];

const RANGE_OPTIONS = [
  {v:"7",l:"Last 7 days"},
  {v:"30",l:"Last 30 days"},
  {v:"90",l:"Last 90 days"},
  {v:"all",l:"All time"},
];

function fmtD(dt){return dt?parseDateLocal(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function fmtG(n){return `${Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1})}g`;}
function fmtM(n){return `$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;}

// Minimal local view of a harvest_batches row -- just enough to label a
// picker and show a strain, not the full shape HarvestBatches.jsx works
// with (grades breakdown, steps, etc. aren't needed here).
function normalizeBatchLite(r){
  return {
    id: r.id,
    strainName: r.strainName||r.strain_name||"",
    spaceName: r.spaceName||r.space_name||r.room_name||"",
    d: r.d||r.harvest_date||todayLocalISO(),
  };
}

const CSS = `
  .tl-wrap{padding:24px;flex:1;overflow-y:auto;}
  .tl-tabs{display:flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:3px;margin-bottom:18px;max-width:520px;}
  .tl-tab{flex:1;padding:8px 6px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;color:var(--text-2);background:none;}
  .tl-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.15);}
  .tl-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .tl-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:14px;padding:10px 12px;box-sizing:border-box;}
  .tl-inp:focus{outline:none;border-color:var(--accent);}
  .tl-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:14px;padding:10px 12px;box-sizing:border-box;cursor:pointer;}
  .tl-lbl{font-size:12px;color:var(--text-2);display:block;margin-bottom:5px;font-weight:500;}
  .tl-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:14px;padding:12px 18px;}
  .tl-btn:hover{opacity:0.85;}
  .tl-btn:disabled{opacity:0.5;cursor:not-allowed;}
  .tl-primary{background:var(--accent);color:#fff;width:100%;}
  .tl-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .tl-sm{font-size:11px;padding:5px 10px;border-radius:6px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .tl-sm:disabled{opacity:0.5;cursor:not-allowed;}
  .tl-approve{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .tl-reject{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .tl-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);gap:12px;}
  .tl-row:last-child{border-bottom:none;}
  .tl-pill{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:0.04em;}
  .tl-pending{background:rgba(200,150,58,0.15);color:var(--amber);}
  .tl-approved{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .tl-rejected{background:rgba(200,74,74,0.12);color:var(--danger);}
  .tl-lb-row{display:grid;grid-template-columns:32px 1.5fr 1fr 1fr 1fr;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid var(--border);}
  .tl-lb-row:last-child{border-bottom:none;}
  .tl-lb-head{font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;padding:5px 10px;}
`;

const EMPTY_ENTRY = {employeeId:"", harvestBatchId:"", entryDate: todayLocalISO(), gramsTrimmed:"", grade:"", notes:""};

export default function TrimLog(){
  const [tab, setTab] = useState("log"); // log | approvals | leaderboard
  const [employees, setEmployees] = useState([]);
  const [laborTypes, setLaborTypes] = useState([]);
  const [batches, setBatches] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({...EMPTY_ENTRY});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [rejecting, setRejecting] = useState(null); // entry id currently showing a rejection-reason input
  const [rejectReason, setRejectReason] = useState("");

  const [leaderboardRange, setLeaderboardRange] = useState("30");

  // Who's actually logged in -- the database now enforces that only this
  // person's own linked employee row can approve/reject (see
  // enforce_trim_entry_approver_identity), so "approving as" is resolved
  // from the login itself rather than a free-text dropdown of any employee.
  const [currentUserId, setCurrentUserId] = useState(null);
  useEffect(()=>{ auth.getUser().then(u=>setCurrentUserId(u?.id||null)); },[]);

  useEffect(()=>{
    async function load(){
      try{
        const [emp, lt, hb, te] = await Promise.all([
          db.employees.list(),
          db.labor_types.list(),
          db.harvest_batches.list(),
          db.trim_entries.list(),
        ]);
        setEmployees(emp.filter(e=>e.status==="active"));
        setLaborTypes(lt);
        setBatches(hb.map(normalizeBatchLite));
        setEntries(te);
      }catch(e){ console.error("TrimLog load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const employeeById = useMemo(()=>Object.fromEntries(employees.map(e=>[e.id,e])), [employees]);
  const batchById = useMemo(()=>Object.fromEntries(batches.map(b=>[b.id,b])), [batches]);
  const myEmployee = useMemo(()=>employees.find(e=>e.user_id&&e.user_id===currentUserId)||null, [employees, currentUserId]);

  function pieceRateFor(employee){
    if(!employee) return null;
    const lt = laborTypes.find(t=>(t.name||t.n)===employee.role);
    const rate = lt?.pieceRate ?? lt?.piece_rate;
    return rate!=null && rate!=="" ? Number(rate) : null;
  }

  const setF = (k,v)=>setForm(f=>({...f,[k]:v}));

  async function submitEntry(){
    if(!form.employeeId){ setErr("Select who's submitting this entry."); return; }
    if(!form.harvestBatchId){ setErr("Select a batch."); return; }
    const grams = parseFloat(form.gramsTrimmed);
    if(!(grams>0)){ setErr("Enter a grams-trimmed amount greater than 0."); return; }

    setSaving(true); setErr("");
    try{
      // piece_rate is deliberately NOT resolved here -- it's snapshotted at
      // approval time instead (see approveEntry), so an entry submitted
      // before a role has a piece rate configured still gets paid
      // correctly once approved, rather than being permanently stuck at
      // whatever rate (or lack of one) existed the moment it was typed in.
      const entry = {
        id: crypto.randomUUID(),
        employeeId: form.employeeId,
        harvestBatchId: form.harvestBatchId,
        entryDate: form.entryDate || todayLocalISO(),
        gramsTrimmed: grams,
        grade: form.grade || null,
        notes: form.notes.trim() || null,
        status: "pending",
      };
      const saved = await db.trim_entries.upsert(entry);
      setEntries(p=>[saved, ...p]);
      setForm({...EMPTY_ENTRY, employeeId: form.employeeId, harvestBatchId: form.harvestBatchId});
    }catch(e){ setErr("Could not save entry: "+e.message); }
    setSaving(false);
  }

  async function approveEntry(entry){
    if(!myEmployee){ setErr("Your login isn't linked to an employee record — ask an account owner to link you under Employees → Login Access before you can approve entries."); return; }
    try{
      // Resolved fresh, right now -- not whatever was (or wasn't) set when
      // the trimmer originally submitted. Once this save lands the row is
      // approved, and the DB trigger locks piece_rate (and every other
      // payroll-relevant field) from changing again while it stays approved.
      const rate = pieceRateFor(employeeById[entry.employeeId]);
      const saved = await db.trim_entries.upsert({
        ...entry, status:"approved", pieceRate: rate, approvedByEmployeeId: myEmployee.id, approvedAt: new Date().toISOString(), rejectionReason: null,
      });
      setEntries(p=>p.map(e=>e.id===saved.id?saved:e));
    }catch(e){ setErr("Approval failed: "+e.message); }
  }

  async function rejectEntry(entry){
    if(!myEmployee){ setErr("Your login isn't linked to an employee record — ask an account owner to link you under Employees → Login Access before you can reject entries."); return; }
    try{
      const saved = await db.trim_entries.upsert({
        ...entry, status:"rejected", approvedByEmployeeId: myEmployee.id, approvedAt: new Date().toISOString(),
        rejectionReason: rejectReason.trim() || null,
      });
      setEntries(p=>p.map(e=>e.id===saved.id?saved:e));
      setRejecting(null); setRejectReason("");
    }catch(e){ setErr("Rejection failed: "+e.message); }
  }

  const pending = entries.filter(e=>e.status==="pending").sort((a,b)=>new Date(b.entryDate)-new Date(a.entryDate));
  const recent = entries.slice().sort((a,b)=>new Date(b.createdAt||b.created_at)-new Date(a.createdAt||a.created_at)).slice(0,15);

  const leaderboard = useMemo(()=>{
    const cutoff = leaderboardRange==="all" ? null : new Date(Date.now()-parseInt(leaderboardRange)*86400000);
    const approved = entries.filter(e=>e.status==="approved" && (!cutoff || new Date(e.entryDate)>=cutoff));
    const byEmployee = {};
    for(const e of approved){
      const key = e.employeeId;
      if(!byEmployee[key]) byEmployee[key] = {employeeId:key, grams:0, earnings:0, entryCount:0};
      byEmployee[key].grams += Number(e.gramsTrimmed||0);
      byEmployee[key].earnings += Number(e.gramsTrimmed||0) * Number(e.pieceRate||0);
      byEmployee[key].entryCount += 1;
    }
    return Object.values(byEmployee).sort((a,b)=>b.grams-a.grams);
  }, [entries, leaderboardRange]);

  const trimmerEmployees = employees; // any active employee can log an entry -- role isn't restricted to a fixed "Trim Technician" string

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading trim log…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="tl-wrap">
        <div style={{marginBottom:18}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Trim Log</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>
            Individual trimmer weigh-ins, piece-rate payroll, and per-trimmer leaderboards — the actuals layer on top of Harvest Batches' planning estimates.
          </div>
        </div>

        <div className="tl-tabs">
          <button className={"tl-tab"+(tab==="log"?" active":"")} onClick={()=>setTab("log")}>Log Entry</button>
          <button className={"tl-tab"+(tab==="approvals"?" active":"")} onClick={()=>setTab("approvals")}>
            Approvals{pending.length>0?` (${pending.length})`:""}
          </button>
          <button className={"tl-tab"+(tab==="leaderboard"?" active":"")} onClick={()=>setTab("leaderboard")}>Leaderboard</button>
        </div>

        {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:14}}>{err}</div>}

        {tab==="log" && (
          <>
            <div className="tl-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>Log a trim weigh-in</div>
              <div style={{marginBottom:12}}>
                <label className="tl-lbl">Trimmer</label>
                <select className="tl-sel" value={form.employeeId} onChange={e=>setF("employeeId",e.target.value)}>
                  <option value="">— Select trimmer —</option>
                  {trimmerEmployees.map(e=><option key={e.id} value={e.id}>{e.name}{e.role?` (${e.role})`:""}</option>)}
                </select>
                {form.employeeId && pieceRateFor(employeeById[form.employeeId])==null && (
                  <div style={{fontSize:11,color:"var(--amber)",marginTop:5}}>
                    No piece rate set for {employeeById[form.employeeId]?.role||"this role"} yet — entry will still be logged. The rate is looked up when this gets approved, not now, so adding one in Labor Setup before approval still pays this entry correctly.
                  </div>
                )}
              </div>
              <div style={{marginBottom:12}}>
                <label className="tl-lbl">Batch</label>
                <select className="tl-sel" value={form.harvestBatchId} onChange={e=>setF("harvestBatchId",e.target.value)}>
                  <option value="">— Select batch —</option>
                  {batches.map(b=><option key={b.id} value={b.id}>{b.strainName||"(unnamed)"} — {b.spaceName||"—"} ({fmtD(b.d)})</option>)}
                </select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div>
                  <label className="tl-lbl">Grams trimmed</label>
                  <input type="number" min="0" step="0.1" className="tl-inp" placeholder="0.0" value={form.gramsTrimmed} onChange={e=>setF("gramsTrimmed",e.target.value)} />
                </div>
                <div>
                  <label className="tl-lbl">Grade (optional)</label>
                  <select className="tl-sel" value={form.grade} onChange={e=>setF("grade",e.target.value)}>
                    {GRADES.map(g=><option key={g.v} value={g.v}>{g.l}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <label className="tl-lbl">Date</label>
                <input type="date" className="tl-inp" value={form.entryDate} onChange={e=>setF("entryDate",e.target.value)} />
              </div>
              <div style={{marginBottom:16}}>
                <label className="tl-lbl">Notes (optional)</label>
                <input className="tl-inp" placeholder="Anything worth flagging about this session" value={form.notes} onChange={e=>setF("notes",e.target.value)} />
              </div>
              <button className="tl-btn tl-primary" disabled={saving} onClick={submitEntry}>
                {saving?"Submitting…":"Submit for approval"}
              </button>
            </div>

            <div className="tl-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:10}}>Recent entries</div>
              {recent.length===0 ? (
                <div style={{textAlign:"center",padding:20,color:"var(--text-3)",fontSize:13}}>No entries logged yet.</div>
              ) : recent.map(e=>{
                const emp = employeeById[e.employeeId];
                const batch = batchById[e.harvestBatchId];
                return (
                  <div className="tl-row" key={e.id}>
                    <div>
                      <div style={{fontWeight:500,color:"var(--text)",fontSize:13}}>{emp?.name||"(unknown)"} — {fmtG(e.gramsTrimmed)}</div>
                      <div style={{fontSize:11,color:"var(--text-3)"}}>{batch?.strainName||"—"} · {fmtD(e.entryDate)}{e.grade?` · Grade ${e.grade.toUpperCase()}`:""}</div>
                    </div>
                    <span className={"tl-pill tl-"+e.status}>{e.status}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab==="approvals" && (
          <div className="tl-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Pending entries ({pending.length})</div>
              <div style={{fontSize:12,color:myEmployee?"var(--text-2)":"var(--amber)"}}>
                {myEmployee?`Approving as ${myEmployee.name}`:"Your login isn't linked to an employee — see Employees → Login Access"}
              </div>
            </div>
            {pending.length===0 ? (
              <div style={{textAlign:"center",padding:20,color:"var(--text-3)",fontSize:13}}>Nothing waiting on approval.</div>
            ) : pending.map(e=>{
              const emp = employeeById[e.employeeId];
              const batch = batchById[e.harvestBatchId];
              // Live preview of the rate that would actually be applied if
              // approved right now -- e.pieceRate itself is still null at
              // this stage (only resolved and frozen at approval time).
              const previewRate = pieceRateFor(emp);
              return (
                <div key={e.id} style={{padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                    <div>
                      <div style={{fontWeight:500,color:"var(--text)",fontSize:13}}>{emp?.name||"(unknown)"} — {fmtG(e.gramsTrimmed)}</div>
                      <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>
                        {batch?.strainName||"—"} · {fmtD(e.entryDate)}{e.grade?` · Grade ${e.grade.toUpperCase()}`:""}
                        {previewRate!=null?` · will pay ${fmtM(previewRate)}/g → ${fmtM(e.gramsTrimmed*previewRate)}`:" · no piece rate set yet — will approve at $0"}
                      </div>
                      {e.notes && <div style={{fontSize:11,color:"var(--text-2)",marginTop:4}}>{e.notes}</div>}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0}}>
                      <button className="tl-sm tl-approve" disabled={!myEmployee} onClick={()=>approveEntry(e)}>Approve</button>
                      <button className="tl-sm tl-reject" disabled={!myEmployee} onClick={()=>setRejecting(rejecting===e.id?null:e.id)}>Reject</button>
                    </div>
                  </div>
                  {rejecting===e.id && (
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <input className="tl-inp" placeholder="Reason (optional)" value={rejectReason} onChange={ev=>setRejectReason(ev.target.value)} />
                      <button className="tl-sm tl-reject" style={{flexShrink:0}} onClick={()=>rejectEntry(e)}>Confirm reject</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab==="leaderboard" && (
          <div className="tl-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Per-trimmer leaderboard — approved entries only</div>
              <select className="tl-sel" style={{width:"auto"}} value={leaderboardRange} onChange={e=>setLeaderboardRange(e.target.value)}>
                {RANGE_OPTIONS.map(r=><option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </div>
            {leaderboard.length===0 ? (
              <div style={{textAlign:"center",padding:20,color:"var(--text-3)",fontSize:13}}>No approved entries in this range yet.</div>
            ) : (
              <>
                <div className="tl-lb-row" style={{gridTemplateColumns:"32px 1.5fr 1fr 1fr 1fr"}}>
                  <div className="tl-lb-head">#</div>
                  <div className="tl-lb-head">Trimmer</div>
                  <div className="tl-lb-head">Entries</div>
                  <div className="tl-lb-head">Grams</div>
                  <div className="tl-lb-head">Earnings</div>
                </div>
                {leaderboard.map((row,i)=>(
                  <div className="tl-lb-row" key={row.employeeId}>
                    <div style={{fontWeight:700,color:i===0?"var(--accent-2)":"var(--text-3)"}}>{i+1}</div>
                    <div style={{fontWeight:500,color:"var(--text)"}}>{employeeById[row.employeeId]?.name||"(unknown)"}</div>
                    <div style={{color:"var(--text-2)"}}>{row.entryCount}</div>
                    <div style={{color:"var(--text-2)"}}>{fmtG(row.grams)}</div>
                    <div style={{color:"var(--accent-2)",fontWeight:600}}>{row.earnings>0?fmtM(row.earnings):"—"}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
