import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { bookedRevenueForBatch } from "./lib/revenue";

const ACCOUNT_TYPES = ["dispensary","processor","wholesale","other"];
const PIPELINE_STAGES = ["lead","prospect","active","inactive"];

function fmtC(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});}
function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}

const CSS=`
  .cu-wrap{padding:24px;flex:1;overflow-y:auto;}
  .cu-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .cu-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .cu-inp:focus{outline:none;border-color:var(--accent);}
  .cu-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .cu-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .cu-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .cu-btn:hover{opacity:0.85;}
  .cu-primary{background:var(--accent);color:#fff;}
  .cu-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .cu-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .cu-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .cu-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .cu-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .cu-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .cu-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .cu-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .stage-lead{background:rgba(150,100,200,0.15);color:#9060c0;}
  .stage-prospect{background:rgba(200,150,58,0.15);color:var(--amber);}
  .stage-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .stage-inactive{background:rgba(100,100,100,0.15);color:var(--text-3);}
`;

const EMPTY = {name:"",licenseNumber:"",contactName:"",phone:"",email:"",address:"",accountType:"dispensary",pipelineStage:"active",notes:""};

export default function Customers(){
  const [customers,setCustomers]=useState([]);
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState(null);
  const [detailId,setDetailId]=useState(null);
  const [stageFilter,setStageFilter]=useState("");
  const [err,setErr]=useState("");

  useEffect(()=>{
    async function load(){
      try{
        const [cu,so]=await Promise.all([db.customers.list(),db.sales_orders.list()]);
        setCustomers(cu);
        setOrders(so);
      }catch(e){ console.error("Customers load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  // Order-history rollup per customer — links by customerId; falls back to
  // matching customerName for legacy/imported orders that predate the
  // customer_id column, so their history still rolls up.
  function historyFor(customer){
    const matched = orders.filter(o=>o.customerId===customer.id || (!o.customerId && o.customerName===customer.name));
    let revenue=0;
    for(const o of matched){
      if(o.status==="canceled") continue;
      for(const l of o.lines||[]) revenue += (parseFloat(l.qty)||0)*(parseFloat(l.unitPrice)||0);
    }
    const lastOrder = matched.length ? matched.reduce((a,o)=>!a||new Date(o.orderDate)>new Date(a.orderDate)?o:a, null) : null;
    return { orderCount: matched.length, revenue, lastOrderDate: lastOrder?.orderDate||null };
  }

  async function save(){
    if(!form.name.trim()){setErr("Enter a customer/account name.");return;}
    const cust={...form,id:form.id||crypto.randomUUID()};
    try{
      const saved=await db.customers.upsert(cust);
      if(form.id) setCustomers(p=>p.map(x=>x.id===saved.id?saved:x));
      else setCustomers(p=>[...p,saved]);
      setForm(null);setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }
  async function remove(id){
    try{ await db.customers.delete(id); setCustomers(p=>p.filter(x=>x.id!==id)); if(detailId===id)setDetailId(null); }
    catch(e){ setErr("Delete failed: "+e.message); }
  }

  const filtered = stageFilter ? customers.filter(c=>c.pipelineStage===stageFilter) : customers;
  const detail = customers.find(c=>c.id===detailId);
  const detailHistory = detail ? historyFor(detail) : null;
  const detailOrders = detail ? orders.filter(o=>o.customerId===detail.id || (!o.customerId && o.customerName===detail.name)) : [];

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading customers…</div>);

  return(
    <>
      <style>{CSS}</style>
      <div className="cu-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Customers / Accounts</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Dispensary and wholesale accounts, contact info, pipeline stage, and order history</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {detailId&&<button className="cu-btn cu-secondary" onClick={()=>setDetailId(null)}>← All accounts</button>}
            {!form&&!detailId&&<button className="cu-btn cu-primary" onClick={()=>setForm({...EMPTY})}>+ Add customer</button>}
          </div>
        </div>

        {form&&(
          <div className="cu-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>{form.id?"Edit Customer":"New Customer"}</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="cu-lbl">Account / dispensary name</label><input className="cu-inp" value={form.name} onChange={e=>setF("name",e.target.value)} /></div>
              <div><label className="cu-lbl">License number</label><input className="cu-inp" value={form.licenseNumber} onChange={e=>setF("licenseNumber",e.target.value)} placeholder="OCM-..." /></div>
              <div><label className="cu-lbl">Account type</label><select className="cu-sel" value={form.accountType} onChange={e=>setF("accountType",e.target.value)}>{ACCOUNT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="cu-lbl">Contact name</label><input className="cu-inp" value={form.contactName} onChange={e=>setF("contactName",e.target.value)} /></div>
              <div><label className="cu-lbl">Phone</label><input className="cu-inp" value={form.phone} onChange={e=>setF("phone",e.target.value)} /></div>
              <div><label className="cu-lbl">Email</label><input className="cu-inp" value={form.email} onChange={e=>setF("email",e.target.value)} /></div>
              <div><label className="cu-lbl">Pipeline stage</label><select className="cu-sel" value={form.pipelineStage} onChange={e=>setF("pipelineStage",e.target.value)}>{PIPELINE_STAGES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div style={{marginBottom:10}}><label className="cu-lbl">Address</label><input className="cu-inp" value={form.address} onChange={e=>setF("address",e.target.value)} /></div>
            <div style={{marginBottom:10}}><label className="cu-lbl">Notes</label><textarea className="cu-inp" rows={2} style={{resize:"vertical"}} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="cu-btn cu-primary" onClick={save}>{form.id?"Save changes":"Add customer"}</button>
              <button className="cu-btn cu-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!form&&detail&&(
          <div className="cu-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"var(--text)"}}>{detail.name}</div>
                <div style={{fontSize:11,color:"var(--text-3)"}}>{detail.accountType} · {detail.contactName||"no contact on file"} {detail.phone&&"· "+detail.phone} {detail.email&&"· "+detail.email}</div>
              </div>
              <span className={"cu-pill stage-"+detail.pipelineStage}>{detail.pipelineStage}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
              <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Lifetime orders</div><div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{detailHistory.orderCount}</div></div>
              <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Lifetime revenue</div><div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{fmtC(detailHistory.revenue)}</div></div>
              <div style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Last order</div><div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{fmtD(detailHistory.lastOrderDate)}</div></div>
            </div>
            {detailOrders.length>0&&(
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:14}}>
                <table className="cu-tbl">
                  <thead><tr><th>Date</th><th>Status</th><th>Lines</th><th>Total</th></tr></thead>
                  <tbody>{[...detailOrders].sort((a,b)=>new Date(b.orderDate)-new Date(a.orderDate)).map(o=>{
                    const total=(o.lines||[]).reduce((a,l)=>a+(parseFloat(l.qty)||0)*(parseFloat(l.unitPrice)||0),0);
                    return <tr key={o.id}><td>{fmtD(o.orderDate)}</td><td>{o.importStatus||o.status}</td><td>{(o.lines||[]).length}</td><td style={{color:"var(--accent-2)",fontWeight:500}}>{fmtC(total)}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button className="cu-btn cu-edit" onClick={()=>setForm({...detail})}>Edit</button>
              <button className="cu-btn cu-del" onClick={()=>remove(detail.id)}>Delete</button>
            </div>
          </div>
        )}

        {!form&&!detailId&&(
          customers.length===0?(
            <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:10}}>🏢</div>
              <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No customer accounts yet</div>
              <div style={{fontSize:12,color:"var(--text-3)"}}>Add dispensary/wholesale accounts here — link them to orders in Sales & Pre-Orders</div>
            </div>
          ):(
            <div className="cu-card">
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <select className="cu-sel" style={{maxWidth:200}} value={stageFilter} onChange={e=>setStageFilter(e.target.value)}>
                  <option value="">All stages</option>
                  {PIPELINE_STAGES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{marginLeft:"auto",fontSize:12,color:"var(--text-3)",alignSelf:"center"}}>{filtered.length} account{filtered.length!==1?"s":""}</div>
              </div>
              <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
                <table className="cu-tbl">
                  <thead><tr><th>Account</th><th>Type</th><th>Contact</th><th>Stage</th><th>Orders</th><th>Lifetime Revenue</th><th>Last Order</th><th></th></tr></thead>
                  <tbody>{filtered.map(c=>{
                    const h=historyFor(c);
                    return(
                      <tr key={c.id}>
                        <td style={{fontWeight:500,color:"var(--text)",cursor:"pointer"}} onClick={()=>setDetailId(c.id)}>{c.name}</td>
                        <td style={{fontSize:11}}>{c.accountType}</td>
                        <td style={{fontSize:11}}>{c.contactName||"—"}</td>
                        <td><span className={"cu-pill stage-"+c.pipelineStage}>{c.pipelineStage}</span></td>
                        <td>{h.orderCount}</td>
                        <td style={{color:"var(--accent-2)",fontWeight:500}}>{fmtC(h.revenue)}</td>
                        <td style={{fontSize:11}}>{fmtD(h.lastOrderDate)}</td>
                        <td><div style={{display:"flex",gap:5}}>
                          <button className="cu-sm cu-edit" onClick={()=>setForm({...c})}>Edit</button>
                          <button className="cu-sm cu-del" onClick={()=>remove(c.id)}>✕</button>
                        </div></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
}
