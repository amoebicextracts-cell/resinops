import { useState, useEffect } from "react";
import { db } from "./lib/db";
import SalesGoalDial from "./SalesGoalDial.jsx";

function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtN(n){return Number(n||0).toLocaleString();}
function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}

// Parse estimated unit count out of a batch's yieldEst string (same approach used in Finance.jsx)
function extractUnits(yieldEst) {
  if (!yieldEst) return 0;
  const m = yieldEst.match(/([\d,]+)\s*(?:×|units|cones|carts|AIOs|bottles)/);
  return m ? parseInt(m[1].replace(/,/g,"")) : 0;
}
function extractActualUnits(actualYield) {
  if (!actualYield) return 0;
  const m = actualYield.match(/([\d,]+)\s*units?/i);
  return m ? parseInt(m[1].replace(/,/g,"")) : 0;
}

const CSS = `
  .so-wrap{padding:24px;flex:1;overflow-y:auto;}
  .so-tabs{display:flex;gap:2px;margin-bottom:18px;background:var(--surface-2);border-radius:8px;padding:3px;}
  .so-tab{flex:1;padding:7px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;transition:all 0.15s;}
  .so-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.2);}
  .so-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .so-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .so-inp:focus{outline:none;border-color:var(--accent);}
  .so-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .so-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .so-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .so-btn:hover{opacity:0.85;}
  .so-primary{background:var(--accent);color:#fff;}
  .so-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .so-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .so-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .so-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .so-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .so-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .so-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .so-tbl tr:last-child td{border-bottom:none;}
  .so-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .avail-good{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .avail-low{background:rgba(200,150,58,0.15);color:var(--amber);}
  .avail-none{background:rgba(200,74,74,0.15);color:var(--danger);}
  .status-open{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-confirmed{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .status-pending{background:rgba(200,150,58,0.15);color:var(--amber);}
  .status-waitlist{background:rgba(150,100,200,0.15);color:#9060c0;}
  .status-fulfilled{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .status-canceled{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .so-num{width:70px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:6px;color:var(--text);font-family:monospace;font-size:12px;padding:3px 6px;text-align:center;}
  .so-num:focus{outline:none;border-color:var(--accent);}
`;

const EMPTY_ORDER = { customerId:"", customerName:"", customerLicense:"", orderDate:new Date().toISOString().split("T")[0], status:"open", lines:[], notes:"" };
const NEW_CUSTOMER = "__new";

export default function SalesOrders() {
  const [tab, setTab] = useState("availability");
  const [batches, setBatches] = useState([]);
  const [skus, setSkus] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [presellOverrides, setPresellOverrides] = useState({});
  const [defaultPct, setDefaultPct] = useState(50);
  const [orders, setOrders] = useState([]);
  const [goals, setGoals] = useState([]);
  const [qcHolds, setQcHolds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    async function load(){
      try{
        const [o, pb, sk, qc, cu, gl]=await Promise.all([
          db.sales_orders.list(),
          db.production_batches.list(),
          db.skus.list(),
          db.qc_tests.list(),
          db.customers.list(),
          db.sales_goals.list(),
        ]);
        setOrders(o);
        setBatches(pb.filter(x=>!x.isLinked));
        setSkus(sk);
        setCustomers(cu);
        setGoals(gl);
        setQcHolds(new Set(
          qc.filter(t=>t.onHold&&t.batchType==="production"&&t.productionBatchId)
            .map(t=>String(t.productionBatchId))
        ));
      }catch(e){ console.error("SalesOrders load error:",e); }
      setLoading(false);
    }
    load();
  },[]);
  const [orderForm, setOrderForm] = useState(null);
  const [goalForm, setGoalForm] = useState(null);
  const [dialRefresh, setDialRefresh] = useState(0);
  const [err, setErr] = useState("");

  async function saveGoal(){
    if(!goalForm.periodStart||!goalForm.periodEnd||!goalForm.goalAmount){ setErr("Enter a period and goal amount."); return; }
    try{
      const saved=await db.sales_goals.upsert({...goalForm,id:goalForm.id||crypto.randomUUID()});
      setGoals(p=>{const i=p.findIndex(g=>g.id===saved.id);return i>=0?p.map(g=>g.id===saved.id?saved:g):[...p,saved];});
      setGoalForm(null);setErr("");setDialRefresh(n=>n+1);
    }catch(e){ setErr("Could not save goal: "+(e.message||e)); }
  }
  async function removeGoal(id){
    try{ await db.sales_goals.delete(id); setGoals(p=>p.filter(g=>g.id!==id)); setDialRefresh(n=>n+1); }
    catch(e){ setErr("Could not delete goal: "+(e.message||e)); }
  }


  // ── Availability math ──────────────────────────────────────────────────
  function batchAvailability(b) {
    const estUnits = extractUnits(b.yieldEst);
    const actualUnits = extractActualUnits(b.actual_yield);
    const baseUnits = actualUnits || estUnits;
    const pct = presellOverrides[b.id] !== undefined ? presellOverrides[b.id] : defaultPct;
    const cap = Math.floor(baseUnits * (parseFloat(pct)||0) / 100);
    const committed = orders.filter(o=>o.status!=="canceled").reduce((a,o)=>
      a + o.lines.filter(l=>l.batchId===b.id).reduce((aa,l)=>aa+(parseInt(l.qty)||0),0), 0);
    const onHold = qcHolds.has(String(b.id));
    const available = onHold ? 0 : Math.max(0, cap - committed);
    return { estUnits, actualUnits, baseUnits, pct, cap, committed, available, isActual: !!actualUnits, onHold };
  }

  function setPct(batchId, v) { setPresellOverrides(p=>({...p,[batchId]:v})); }

  // ── Order form ──────────────────────────────────────────────────────────
  function openNewOrder() { setOrderForm({...EMPTY_ORDER, id:crypto.randomUUID()}); setErr(""); }
  function openEditOrder(o) { setOrderForm({...o}); setErr(""); }
  function addLine() { setOrderForm(f=>({...f, lines:[...f.lines, {id:"ln"+Date.now()+Math.random(), batchId:"", qty:"", unitPrice:""}]})); }
  function setLine(i,k,v) {
    setOrderForm(f=>({...f, lines:f.lines.map((l,idx)=>{
      if (idx!==i) return l;
      const updated = {...l,[k]:v};
      if (k==="batchId") {
        const b = batches.find(x=>String(x.id)===String(v));
        const sku = skus.find(s=>b && s.product && b.catLabel && s.product.toLowerCase().includes(b.catLabel.toLowerCase().split(" ")[0]));
        if (sku) updated.unitPrice = String(sku.price);
      }
      return updated;
    })}));
  }
  function removeLine(i) { setOrderForm(f=>({...f, lines:f.lines.filter((_,idx)=>idx!==i)})); }

  async function saveOrder() {
    if (!orderForm.customerName.trim()) { setErr("Enter or select a customer."); return; }
    if (!orderForm.lines.length) { setErr("Add at least one line item."); return; }
    for (const l of orderForm.lines) {
      if (!l.batchId || !l.qty || parseInt(l.qty)<=0) { setErr("Every line needs a batch and quantity."); return; }
      if (qcHolds.has(String(l.batchId))) {
        const b = batches.find(x=>String(x.id)===String(l.batchId));
        setErr("\""+(b?.name||"A batch")+"\" is on QC hold and cannot be sold. Remove or replace that line to save this order.");
        return;
      }
    }
    try{
      let toSave = orderForm;
      // Picking "+ New customer…" doesn't create the account until save —
      // create it now so the order links to a real customer_id instead of
      // staying free-text-only.
      if (!toSave.customerId && toSave.customerName.trim()) {
        const newCust = await db.customers.upsert({id:crypto.randomUUID(),name:toSave.customerName.trim(),licenseNumber:toSave.customerLicense,accountType:"dispensary",pipelineStage:"active"});
        setCustomers(p=>[...p,newCust]);
        toSave = {...toSave, customerId:newCust.id};
      }
      const saved = await db.sales_orders.upsert(toSave);
      const isEdit = orders.some(o=>o.id===saved.id);
      if (isEdit) setOrders(p=>p.map(o=>o.id===saved.id?saved:o));
      else setOrders(p=>[...p,saved]);
      setOrderForm(null); setErr(""); setDialRefresh(n=>n+1);
    }catch(e){ setErr("Could not save: "+(e.message||e)); }
  }
  async function setOrderStatus(id, status) {
    const order = orders.find(o=>o.id===id);
    if (!order) return;
    try{
      const saved = await db.sales_orders.upsert({...order, status});
      setOrders(p=>p.map(o=>o.id===id?saved:o));
      setDialRefresh(n=>n+1);
    }catch(e){ setErr("Could not update status: "+(e.message||e)); }
  }
  async function removeOrder(id) {
    try{
      await db.sales_orders.delete(id);
      setOrders(p=>p.filter(o=>o.id!==id));
      setDialRefresh(n=>n+1);
    }catch(e){ setErr("Could not delete: "+(e.message||e)); }
  }

  function lineTotal(l) { return (parseFloat(l.qty)||0)*(parseFloat(l.unitPrice)||0); }
  function orderTotal(o) { return o.lines.reduce((a,l)=>a+lineTotal(l),0); }

  const openOrders = orders.filter(o=>o.status==="open");
  const totalCommittedValue = openOrders.reduce((a,o)=>a+orderTotal(o),0);

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading sales orders…</div>);

  return (
    <>
      <style>{CSS}</style>
      <div className="so-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Sales & Pre-Order Availability</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>Track sellable inventory against the production schedule and manage holds</div>
        </div>

        <SalesGoalDial refreshToken={dialRefresh} />

        {/* Revenue pipeline summary */}
        {orders.length>0&&(()=>{
          const getTotal=(o)=>{
            const direct=parseFloat(o.orderTotal||o.order_total||0)||0;
            if(direct>0) return direct;
            return (o.lines||[]).reduce((a,l)=>a+(parseFloat(l.orderTotal)||parseFloat(l.qty||0)*parseFloat(l.unitPrice||0)),0);
          };
          const confirmed=orders.filter(o=>(o.importStatus||"")===("confirmed")||(o.status==="open"&&!o.importStatus));
          const pending=orders.filter(o=>(o.importStatus||"")==="pending");
          const waitlist=orders.filter(o=>(o.importStatus||"")==="waitlist");
          const confirmedRev=confirmed.reduce((a,o)=>a+getTotal(o),0);
          const pendingRev=pending.reduce((a,o)=>a+getTotal(o),0);
          const accounts=new Set(orders.map(o=>o.customerName||o.dispensaryName||"").filter(Boolean)).size;
          return(
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
              {[
                {label:"Confirmed Revenue",value:"$"+confirmedRev.toLocaleString(undefined,{minimumFractionDigits:0}),color:"var(--accent-2)",sub:confirmed.length+" orders"},
                {label:"Pending Pipeline",value:"$"+pendingRev.toLocaleString(undefined,{minimumFractionDigits:0}),color:"var(--amber)",sub:pending.length+" orders"},
                {label:"Waitlisted",value:waitlist.length,color:"#9060c0",sub:"orders waiting on stock"},
                {label:"Active Accounts",value:accounts,color:"var(--text)",sub:orders.length+" total orders"},
              ].map(({label,value,color,sub})=>(
                <div key={label} style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 14px",border:"1px solid var(--border-2)"}}>
                  <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text-3)",marginBottom:4}}>{label}</div>
                  <div style={{fontSize:22,fontWeight:700,color,marginBottom:2}}>{value}</div>
                  <div style={{fontSize:10,color:"var(--text-3)"}}>{sub}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="so-tabs">
          {[["availability","📋 Availability Board"],["orders","🧾 Orders & Holds"],["goals","🎯 Goals"]].map(([v,l])=>(
            <button key={v} className={"so-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── AVAILABILITY BOARD ── */}
        {tab==="availability" && (
          <div className="so-card">
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <label className="so-lbl" style={{margin:0,whiteSpace:"nowrap"}}>Default presell %</label>
              <input type="number" min="0" max="100" className="so-num" value={defaultPct} onChange={e=>setDefaultPct(e.target.value)} />
              <div style={{fontSize:11,color:"var(--text-3)"}}>Applied to every batch unless overridden below. Keep this modest — it's selling against estimated, not actual, yield.</div>
            </div>

            {batches.length===0 ? (
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No production batches yet.</div>
            ) : (
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="so-tbl">
                  <thead><tr><th>Batch</th><th>Product</th><th>Est./Actual Units</th><th>Presell %</th><th>Presell Cap</th><th>Committed</th><th>Available</th></tr></thead>
                  <tbody>
                    {batches.map(b => {
                      const av = batchAvailability(b);
                      const cls = av.available===0?"avail-none":av.available<av.cap*0.2?"avail-low":"avail-good";
                      return (
                        <tr key={b.id}>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{b.name}{av.onHold&&<span className="so-pill avail-none" style={{marginLeft:8}}>🔒 QC HOLD</span>}</td>
                          <td style={{fontSize:11}}>{b.catLabel}{b.subLabel?" — "+b.subLabel:""}</td>
                          <td style={{fontSize:11}}>{fmtN(av.baseUnits)}{av.isActual?" (actual)":" (est.)"}</td>
                          <td><input type="number" min="0" max="100" className="so-num" value={av.pct} onChange={e=>setPct(b.id,e.target.value)} disabled={av.onHold} /></td>
                          <td>{fmtN(av.cap)}</td>
                          <td style={{color:av.committed>0?"var(--amber)":"var(--text-3)"}}>{fmtN(av.committed)}</td>
                          <td><span className={"so-pill "+cls}>{av.onHold?"blocked":fmtN(av.available)+" avail."}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS & HOLDS ── */}
        {tab==="orders" && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
              {[
                {l:"Open orders",v:String(openOrders.length)},
                {l:"Committed value (open)",v:fmtC(totalCommittedValue)},
                {l:"Total orders all-time",v:String(orders.length)},
              ].map((s,i)=>(
                <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{s.l}</div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{s.v}</div>
                </div>
              ))}
            </div>

            <div className="so-card">
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
                {!orderForm && <button className="so-btn so-primary" onClick={openNewOrder}>+ New order</button>}
              </div>

              {orderForm && (
                <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label className="so-lbl">Customer account</label>
                      <select className="so-sel" value={orderForm.customerId||(orderForm.customerName?NEW_CUSTOMER:"")} onChange={e=>{
                        const v=e.target.value;
                        if(v===NEW_CUSTOMER) setOrderForm(f=>({...f,customerId:"",customerName:"",customerLicense:""}));
                        else{
                          const c=customers.find(x=>x.id===v);
                          setOrderForm(f=>({...f,customerId:v,customerName:c?.name||"",customerLicense:c?.licenseNumber||""}));
                        }
                      }}>
                        <option value="">— Select account —</option>
                        {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value={NEW_CUSTOMER}>+ New customer…</option>
                      </select>
                    </div>
                    <div><label className="so-lbl">Order date</label><input type="date" className="so-inp" value={orderForm.orderDate} onChange={e=>setOrderForm(f=>({...f,orderDate:e.target.value}))} /></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div><label className="so-lbl">Customer name{!orderForm.customerId&&" (new account)"}</label><input className="so-inp" value={orderForm.customerName} disabled={!!orderForm.customerId} style={orderForm.customerId?{opacity:0.7}:undefined} onChange={e=>setOrderForm(f=>({...f,customerName:e.target.value}))} /></div>
                    <div><label className="so-lbl">License #</label><input className="so-inp" value={orderForm.customerLicense} disabled={!!orderForm.customerId} style={orderForm.customerId?{opacity:0.7}:undefined} onChange={e=>setOrderForm(f=>({...f,customerLicense:e.target.value}))} placeholder="OCM-..." /></div>
                  </div>

                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Line Items</div>
                  {orderForm.lines.map((l,i) => {
                    const b = batches.find(x=>String(x.id)===String(l.batchId));
                    const av = b ? batchAvailability(b) : null;
                    return (
                      <div key={l.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6,alignItems:"flex-end"}}>
                        <div><label className="so-lbl">Batch / product {av && (av.onHold ? <span style={{color:"var(--danger)"}}>(🔒 on QC hold — cannot sell)</span> : "("+av.available+" available)")}</label>
                          <select className="so-sel" value={l.batchId} onChange={e=>setLine(i,"batchId",e.target.value)}>
                            <option value="">— Select batch —</option>
                            {batches.map(bx=>{
                              const held=qcHolds.has(String(bx.id));
                              return <option key={bx.id} value={bx.id} disabled={held}>{bx.name} — {bx.catLabel}{held?" (QC hold)":""}</option>;
                            })}
                          </select>
                        </div>
                        <div><label className="so-lbl">Qty</label><input type="number" min="1" className="so-inp" value={l.qty} onChange={e=>setLine(i,"qty",e.target.value)} /></div>
                        <div><label className="so-lbl">Unit price ($)</label><input type="number" step="0.01" className="so-inp" value={l.unitPrice} onChange={e=>setLine(i,"unitPrice",e.target.value)} /></div>
                        <button className="so-del" onClick={()=>removeLine(i)}>✕</button>
                      </div>
                    );
                  })}
                  <button className="so-btn so-secondary" style={{fontSize:11,padding:"4px 10px",marginTop:4}} onClick={addLine}>+ Add line</button>

                  <div style={{marginTop:10,marginBottom:10}}><label className="so-lbl">Notes</label><input className="so-inp" value={orderForm.notes} onChange={e=>setOrderForm(f=>({...f,notes:e.target.value}))} /></div>

                  {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>Order total: {fmtC(orderTotal(orderForm))}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button className="so-btn so-primary" onClick={saveOrder}>Save order</button>
                      <button className="so-btn so-secondary" onClick={()=>{setOrderForm(null);setErr("");}}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {orders.length===0 ? (
                <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)"}}>No orders yet.</div>
              ) : (
                <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                  <table className="so-tbl">
                    <thead><tr><th>Customer</th><th>License</th><th>Date</th><th>Lines</th><th>Total</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {[...orders].sort((a,b)=>new Date(b.orderDate)-new Date(a.orderDate)).map(o => (
                        <tr key={o.id}>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{o.customerName}</td>
                          <td style={{fontSize:11,fontFamily:"monospace"}}>{o.customerLicense||"—"}</td>
                          <td>{fmtD(o.orderDate)}</td>
                          <td>{o.lines.length} item{o.lines.length!==1?"s":""}</td>
                          <td style={{color:"var(--accent-2)",fontWeight:500}}>{fmtC(orderTotal(o))}</td>
                          <td><span className={"so-pill status-"+(o.importStatus||o.status)}>{o.importStatus||o.status}</span></td>
                          <td><div style={{display:"flex",gap:5}}>
                            {o.status==="open" && <button className="so-sm so-edit" onClick={()=>setOrderStatus(o.id,"fulfilled")}>Fulfill</button>}
                            {o.status==="open" && <button className="so-sm so-secondary" onClick={()=>setOrderStatus(o.id,"canceled")}>Release</button>}
                            {o.status!=="open" && <button className="so-sm so-secondary" onClick={()=>setOrderStatus(o.id,"open")}>Reopen</button>}
                            <button className="so-sm so-edit" onClick={()=>openEditOrder(o)}>Edit</button>
                            <button className="so-sm so-del" onClick={()=>removeOrder(o.id)}>✕</button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── GOALS ── */}
        {tab==="goals" && (
          <div className="so-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text-2)"}}>Set a revenue goal for a period. The dial at the top tracks confirmed Sales Orders revenue against whichever goal's period includes today.</div>
              {!goalForm && <button className="so-btn so-primary" onClick={()=>setGoalForm({periodStart:new Date().toISOString().split("T")[0],periodEnd:new Date(new Date().getFullYear(),new Date().getMonth()+1,0).toISOString().split("T")[0],goalAmount:"",notes:""})}>+ Set goal</button>}
            </div>

            {goalForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="so-lbl">Period start</label><input type="date" className="so-inp" value={goalForm.periodStart} onChange={e=>setGoalForm(f=>({...f,periodStart:e.target.value}))} /></div>
                  <div><label className="so-lbl">Period end</label><input type="date" className="so-inp" value={goalForm.periodEnd} onChange={e=>setGoalForm(f=>({...f,periodEnd:e.target.value}))} /></div>
                  <div><label className="so-lbl">Goal amount ($)</label><input type="number" min="0" step="100" className="so-inp" value={goalForm.goalAmount} onChange={e=>setGoalForm(f=>({...f,goalAmount:e.target.value}))} /></div>
                </div>
                <div style={{marginBottom:10}}><label className="so-lbl">Notes</label><input className="so-inp" value={goalForm.notes} onChange={e=>setGoalForm(f=>({...f,notes:e.target.value}))} /></div>
                {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="so-btn so-primary" onClick={saveGoal}>Save goal</button>
                  <button className="so-btn so-secondary" onClick={()=>{setGoalForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}

            {goals.length===0 ? (
              <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)"}}>No goals set yet.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="so-tbl">
                  <thead><tr><th>Period</th><th>Goal</th><th>Notes</th><th></th></tr></thead>
                  <tbody>
                    {[...goals].sort((a,b)=>new Date(b.periodStart)-new Date(a.periodStart)).map(g=>(
                      <tr key={g.id}>
                        <td>{fmtD(g.periodStart)} – {fmtD(g.periodEnd)}</td>
                        <td style={{color:"var(--accent-2)",fontWeight:500}}>{fmtC(g.goalAmount)}</td>
                        <td style={{fontSize:11,color:"var(--text-3)"}}>{g.notes||"—"}</td>
                        <td><div style={{display:"flex",gap:5}}>
                          <button className="so-sm so-edit" onClick={()=>setGoalForm({...g})}>Edit</button>
                          <button className="so-sm so-del" onClick={()=>removeGoal(g.id)}>✕</button>
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
