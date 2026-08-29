import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { CATS, SUBS } from "./lib/productCategories";
import { poolLedger } from "./lib/productionPools";
import { parseDateLocal } from "./lib/dateUtils";

function fmtG(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});}
function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4});}
function fmtDT(dt){return dt?parseDateLocal(dt).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"—";}

const CSS = `
  .pp-wrap{padding:24px;flex:1;overflow-y:auto;}
  .pp-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .pp-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .pp-inp:focus{outline:none;border-color:var(--accent);}
  .pp-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .pp-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .pp-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .pp-btn:hover{opacity:0.85;}
  .pp-primary{background:var(--accent);color:#fff;}
  .pp-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .pp-sm{font-size:10px;padding:4px 9px;border-radius:6px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .pp-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .pp-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .pp-tbl th{text-align:left;padding:6px 8px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);}
  .pp-tbl td{padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-2);}
  .pp-empty{padding:24px;text-align:center;color:var(--text-3);font-size:12px;}
`;

// Flat "Category — Subcategory" option list, same vocabulary
// ProductionScheduler.jsx's New Production Batch form uses, so a pool's
// category context lines up with real batch categories.
const CATEGORY_OPTIONS = CATS.flatMap(c =>
  (SUBS[c.v]||[]).length
    ? SUBS[c.v].map(s => ({ value: c.v+"|"+s.v, label: c.l+" — "+s.l }))
    : [{ value: c.v+"|", label: c.l }]
);

const EMPTY_POOL = { name:"", category:"", subcategory:"", notes:"" };
const EMPTY_TX = { amountG:"", unitCostPerG:"", batchId:"", notes:"" };

export default function ProductionPools() {
  const [pools, setPools] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poolForm, setPoolForm] = useState(null);
  const [poolFormMode, setPoolFormMode] = useState(null);
  const [editPoolId, setEditPoolId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [txForm, setTxForm] = useState(null); // {poolId, type, ...EMPTY_TX}
  const [err, setErr] = useState("");

  useEffect(()=>{
    async function load(){
      try{
        const [p, t, b] = await Promise.all([
          db.production_pools.list(),
          db.production_pool_transactions.list(),
          db.production_batches.list(),
        ]);
        setPools(p);
        setTransactions(t);
        setBatches(b.filter(x=>!x.isLinked));
      }catch(e){ console.error("ProductionPools load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  function openAddPool(){ setPoolForm({...EMPTY_POOL}); setPoolFormMode("add"); setErr(""); }
  function openEditPool(p){ setPoolForm({name:p.name, category:p.category||"", subcategory:p.subcategory||"", notes:p.notes||""}); setEditPoolId(p.id); setPoolFormMode("edit"); setErr(""); }
  function closePoolForm(){ setPoolForm(null); setPoolFormMode(null); setEditPoolId(null); setErr(""); }

  async function savePool(){
    if(!poolForm.name.trim()){ setErr("Enter a pool name."); return; }
    const record = { name:poolForm.name.trim(), category:poolForm.category||null, subcategory:poolForm.subcategory||null, notes:poolForm.notes.trim(), status:"active" };
    try{
      if(poolFormMode==="edit"){
        const saved = await db.production_pools.upsert({...pools.find(p=>p.id===editPoolId), ...record, id:editPoolId});
        setPools(prev=>prev.map(p=>p.id===editPoolId?saved:p));
      } else {
        const saved = await db.production_pools.upsert({...record, id:crypto.randomUUID()});
        setPools(prev=>[...prev, saved]);
      }
      closePoolForm();
    }catch(e){ setErr("Save failed: "+(e.message||e)); }
  }

  async function archivePool(p){
    if(!window.confirm(`Archive "${p.name}"? Its ledger stays intact, but it won't appear as a deposit/withdrawal target going forward.`)) return;
    try{
      const saved = await db.production_pools.upsert({...p, status:"archived"});
      setPools(prev=>prev.map(x=>x.id===p.id?saved:x));
    }catch(e){ setErr("Archive failed: "+(e.message||e)); }
  }

  function openTx(poolId, type){ setTxForm({poolId, type, ...EMPTY_TX}); setErr(""); }
  function closeTx(){ setTxForm(null); setErr(""); }

  async function saveTx(){
    const { poolId, type } = txForm;
    const amount = parseFloat(txForm.amountG);
    if(!(amount>0)){ setErr("Enter a valid amount in grams."); return; }
    const ledger = poolLedger(poolId, transactions);
    let unitCost;
    if(type==="deposit"){
      unitCost = parseFloat(txForm.unitCostPerG)||0;
    } else {
      if(amount>ledger.balanceG){ setErr(`Only ${fmtG(ledger.balanceG)}g available in this pool.`); return; }
      unitCost = ledger.avgCostPerG; // snapshot the current average at withdrawal time
    }
    const record = {
      id: crypto.randomUUID(), poolId, type, amountG: amount, unitCostPerG: unitCost,
      sourceBatchId: type==="deposit" ? (txForm.batchId||null) : null,
      destinationBatchId: type==="withdrawal" ? (txForm.batchId||null) : null,
      notes: txForm.notes.trim(),
    };
    try{
      const saved = await db.production_pool_transactions.upsert(record);
      setTransactions(prev=>[...prev, saved]);
      closeTx();
    }catch(e){ setErr("Save failed: "+(e.message||e)); }
  }

  async function deleteTx(tx){
    if(!window.confirm("Delete this ledger entry? This changes the pool's balance and cost basis retroactively.")) return;
    try{
      await db.production_pool_transactions.delete(tx.id);
      setTransactions(prev=>prev.filter(t=>t.id!==tx.id));
    }catch(e){ setErr("Delete failed: "+(e.message||e)); }
  }

  function batchName(id){ return batches.find(b=>b.id===id)?.name || "—"; }
  function categoryLabel(p){
    if(!p.category) return "—";
    const cat = CATS.find(c=>c.v===p.category)?.l || p.category;
    const sub = p.subcategory ? (SUBS[p.category]?.find(s=>s.v===p.subcategory)?.l || p.subcategory) : "";
    return sub ? `${cat} — ${sub}` : cat;
  }

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading production pools…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="pp-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>🧪 Production Pools</div>
            <div style={{fontSize:12,color:"var(--text-3)",maxWidth:640}}>Named intermediate WIP pools sitting between Harvest Batches and Production Batches — deposit material from a source batch, or draw it down as the input for a downstream batch. Balance and cost-per-gram are always computed live from the transaction ledger below, never stored separately.</div>
          </div>
          {!poolForm && <button className="pp-btn pp-primary" onClick={openAddPool}>+ New Pool</button>}
        </div>

        {poolForm && (
          <div className="pp-card">
            <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>{poolFormMode==="edit"?"Edit Pool":"New Pool"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="pp-lbl">Pool name</label><input className="pp-inp" placeholder="e.g. Diamond Production" value={poolForm.name} onChange={e=>setPoolForm(f=>({...f,name:e.target.value}))} /></div>
              <div><label className="pp-lbl">Category context (optional)</label>
                <select className="pp-sel" value={poolForm.category&&poolForm.subcategory!==undefined?poolForm.category+"|"+(poolForm.subcategory||""):""} onChange={e=>{const [cat,sub]=e.target.value.split("|");setPoolForm(f=>({...f,category:cat||"",subcategory:sub||""}));}}>
                  <option value="">— None —</option>
                  {CATEGORY_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:10}}><label className="pp-lbl">Notes</label><input className="pp-inp" value={poolForm.notes} onChange={e=>setPoolForm(f=>({...f,notes:e.target.value}))} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="pp-btn pp-primary" onClick={savePool}>{poolFormMode==="edit"?"Save Changes":"Create Pool"}</button>
              <button className="pp-btn pp-secondary" onClick={closePoolForm}>Cancel</button>
            </div>
          </div>
        )}

        {pools.filter(p=>p.status!=="archived").length===0 && !poolForm && (
          <div className="pp-empty">No production pools yet. Create one to start tracking WIP that sits between a harvest/extraction run and the finished batches drawn from it.</div>
        )}

        {pools.filter(p=>p.status!=="archived").map(p=>{
          const ledger = poolLedger(p.id, transactions);
          const isOpen = expandedId===p.id;
          return (
            <div className="pp-card" key={p.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={()=>setExpandedId(isOpen?null:p.id)}>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{isOpen?"▾":"▸"} {p.name}</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>{categoryLabel(p)}{p.notes?" · "+p.notes:""}</div>
                </div>
                <div style={{textAlign:"right",marginRight:12}}>
                  <div style={{fontSize:16,fontWeight:700,color:"var(--accent-2)"}}>{fmtG(ledger.balanceG)}g</div>
                  <div style={{fontSize:11,color:"var(--text-3)"}}>{fmtC(ledger.avgCostPerG)}/g avg</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button className="pp-sm pp-secondary" onClick={()=>openTx(p.id,"deposit")}>+ Deposit</button>
                  <button className="pp-sm pp-secondary" onClick={()=>openTx(p.id,"withdrawal")} disabled={ledger.balanceG<=0}>− Withdraw</button>
                  <button className="pp-sm pp-secondary" onClick={()=>openEditPool(p)}>Edit</button>
                  <button className="pp-sm pp-del" onClick={()=>archivePool(p)}>Archive</button>
                </div>
              </div>

              {txForm&&txForm.poolId===p.id && (
                <div style={{marginTop:12,padding:12,background:"var(--surface-2)",borderRadius:8}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>{txForm.type==="deposit"?"Deposit into":"Withdraw from"} {p.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:txForm.type==="deposit"?"1fr 1fr 2fr":"1fr 2fr",gap:8,marginBottom:8}}>
                    <input type="number" min="0" step="0.1" className="pp-inp" placeholder="Grams" value={txForm.amountG} onChange={e=>setTxForm(f=>({...f,amountG:e.target.value}))} />
                    {txForm.type==="deposit" && <input type="number" min="0" step="0.0001" className="pp-inp" placeholder="Cost / gram ($)" value={txForm.unitCostPerG} onChange={e=>setTxForm(f=>({...f,unitCostPerG:e.target.value}))} />}
                    <select className="pp-sel" value={txForm.batchId} onChange={e=>setTxForm(f=>({...f,batchId:e.target.value}))}>
                      <option value="">{txForm.type==="deposit"?"— Source batch (optional) —":"— Destination batch (optional) —"}</option>
                      {batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  {txForm.type==="withdrawal" && <div style={{fontSize:11,color:"var(--text-3)",marginBottom:8}}>Drawn at the pool's current average: {fmtC(poolLedger(p.id,transactions).avgCostPerG)}/g · {fmtG(poolLedger(p.id,transactions).balanceG)}g available</div>}
                  <input className="pp-inp" style={{marginBottom:8}} placeholder="Note (optional)" value={txForm.notes} onChange={e=>setTxForm(f=>({...f,notes:e.target.value}))} />
                  {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                  <div style={{display:"flex",gap:8}}>
                    <button className="pp-btn pp-primary" onClick={saveTx}>Save</button>
                    <button className="pp-btn pp-secondary" onClick={closeTx}>Cancel</button>
                  </div>
                </div>
              )}

              {isOpen && (
                <div style={{marginTop:12}}>
                  {ledger.transactions.length===0 ? <div className="pp-empty">No transactions logged yet.</div> : (
                    <table className="pp-tbl">
                      <thead><tr><th>Date</th><th>Type</th><th>Grams</th><th>$/g</th><th>Linked batch</th><th>Balance after</th><th>Note</th><th></th></tr></thead>
                      <tbody>{ledger.transactions.slice().reverse().map(t=>(
                        <tr key={t.id}>
                          <td>{fmtDT(t.created_at)}</td>
                          <td style={{color:t.type==="deposit"?"var(--accent-2)":"var(--amber)",fontWeight:600}}>{t.type==="deposit"?"Deposit":"Withdrawal"}</td>
                          <td>{t.type==="deposit"?"+":"−"}{fmtG(t.amountG)}g</td>
                          <td>{fmtC(t.unitCostPerG)}</td>
                          <td>{batchName(t.sourceBatchId||t.destinationBatchId)}</td>
                          <td>{fmtG(t.runningBalanceG)}g</td>
                          <td style={{fontSize:11}}>{t.notes||"—"}</td>
                          <td><button className="pp-sm pp-del" onClick={()=>deleteTx(t)}>✕</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
