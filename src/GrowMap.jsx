import { useState, useEffect } from "react";

const ROOM_TYPES = ["Indoor","Mixed-Light Greenhouse","Outdoor Greenhouse","Hoop House","Outdoor","Mother Room","Propagation","Veg","Nursery","Genetics Lab / TC","Other"];
const LIGHT_TYPES = ["HPS","LED","CMH/LEC","DE HPS","Hybrid LED+HPS","Natural Light","Supplemental LED","None"];
const STATUSES = [
  {v:"active",l:"Active — plants in room"},
  {v:"cleaning",l:"Cleaning / Reset"},
  {v:"empty",l:"Empty — ready for plants"},
  {v:"inbuild",l:"In Build / Under Construction"},
  {v:"offline",l:"Offline"},
];

function fmtD(dt){return dt?new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
function daysUntilReady(space){
  if(space.status!=="cleaning"||!space.lastHarvestDate||!space.resetDays) return null;
  const ready=new Date(space.lastHarvestDate);
  ready.setDate(ready.getDate()+parseInt(space.resetDays||7));
  const diff=Math.round((ready-new Date())/86400000);
  return{date:ready,diff};
}

const CSS=`
  .gm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .gm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .gm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .gm-inp:focus{outline:none;border-color:var(--accent);}
  .gm-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .gm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .gm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;}
  .gm-btn:hover{opacity:0.85;}
  .gm-primary{background:var(--accent);color:#fff;}
  .gm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .gm-sm{font-size:10px;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;}
  .gm-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .gm-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .gm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-top:14px;}
  .gm-room{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:6px;}
  .gm-room-name{font-size:14px;font-weight:600;color:var(--text);}
  .gm-room-sub{font-size:11px;color:var(--text-3);}
  .gm-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;display:inline-block;}
  .s-active{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .s-cleaning{background:rgba(200,150,58,0.15);color:var(--amber);}
  .s-empty{background:rgba(90,120,200,0.15);color:#7090f0;}
  .s-inbuild{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .s-offline{background:rgba(200,74,74,0.12);color:var(--danger);}
  .gm-stat{display:flex;flex-direction:column;gap:1px;}
  .gm-stat-l{font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;}
  .gm-stat-v{font-size:12px;color:var(--text-2);font-weight:500;}
`;

const EMPTY={name:"",type:"Indoor",sqft:"",canopy:"",maxPlants:"",lightType:"LED",lightCount:"",lightWatts:"",resetDays:"7",status:"empty",lastHarvestDate:"",sensorId:"",notes:""};

export default function GrowMap(){
  const [spaces,setSpaces]=useState(()=>{
    try{
      const raw=JSON.parse(localStorage.getItem("resinops_grow_map")||"[]");
      return raw.map(r=>({
        ...r,
        id: r.id||"sp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
        name: r.name||r.room_name||r["Room Name"]||r["Space Name"]||r["Room"]||"",
        type: r.type||r.room_type||r["Room Type"]||r["Type"]||"Indoor",
        sqft: r.sqft||r.total_sq_ft||r["Total Sq Ft"]||r["Square Footage"]||r["Sq Ft"]||r["sqft"]||"",
        canopy: r.canopy||r.canopy_sq_ft||r["Canopy Sq Ft"]||r["Canopy Square Footage"]||r["Canopy"]||"",
        maxPlants: r.maxPlants||r.max_plants||r["Max Plants"]||r["Max Plant Count"]||r["Maximum Plants"]||"",
        lightType: r.lightType||r.light_type||r["Light Type"]||r["Lights Type"]||"LED",
        lightCount: r.lightCount||r.light_count||r.lights_count||r["Lights Count"]||r["Light Count"]||r["Number of Lights"]||"",
        lightWatts: r.lightWatts||r.watts_per_light||r.watts_per_fixture||r["Watts Per Light"]||r["Watts Per Fixture"]||r["Watts/Fixture"]||"",
        resetDays: r.resetDays||r.reset_days||r.clean_reset_duration||r["Clean & Reset Duration"]||r["Reset Days"]||"",
        lastHarvestDate: r.lastHarvestDate||r.last_harvest_date||r["Last Harvest Date"]||"",
        status: r.status||"active",
        notes: r.notes||r["Notes"]||"",
      }));
    }catch{return[];}
  });
  const cultSpaces=JSON.parse(localStorage.getItem("resinops_spaces")||"[]");

  function getActiveBatch(roomName, roomId) {
    return cultSpaces.find(s => s.name === roomName || s.growMapId === roomId);
  }
  const [form,setForm]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_grow_map",JSON.stringify(spaces));},[spaces]);

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  function openAdd(){setForm({...EMPTY,id:null});setErr("");}
  function openEdit(s){setForm({...s});setErr("");}
  function save(){
    if(!form.name.trim()){setErr("Enter a room name.");return;}
    const sp={...form,id:form.id||"gm"+Date.now()};
    if(form.id) setSpaces(p=>p.map(x=>x.id===sp.id?sp:x));
    else setSpaces(p=>[...p,sp]);
    setForm(null);setErr("");
  }
  function remove(id){setSpaces(p=>p.filter(x=>x.id!==id));}
  function setStatus(id,status){setSpaces(p=>p.map(x=>x.id===id?{...x,status}:x));}

  function exportCSV(){
    const cols=["name","type","sqft","canopy","maxPlants","lightType","lightCount","lightWatts","resetDays","status","sensorId","notes"];
    const rows=[cols.join(","), ...spaces.map(s=>cols.map(k=>JSON.stringify(s[k]||"")).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows],{type:"text/csv"}));a.download="GrowMap.csv";document.body.appendChild(a);a.click();document.body.removeChild(a);
  }

  const statusGroups=STATUSES.map(s=>({...s,rooms:spaces.filter(sp=>sp.status===s.v)}));
  const cleaningRooms=spaces.filter(s=>s.status==="cleaning");

  return(
    <>
      <style>{CSS}</style>
      <div className="gm-wrap">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Grow Map</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Persistent room & space repository — all facility grow areas, statuses, and reset timing</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {spaces.length>0&&<button className="gm-btn gm-secondary" onClick={exportCSV}>↓ Export CSV</button>}
            {!form&&<button className="gm-btn gm-primary" onClick={openAdd}>+ Add room / space</button>}
          </div>
        </div>

        {cleaningRooms.length>0&&(
          <div style={{background:"rgba(200,150,58,0.08)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--amber)",marginBottom:4}}>Rooms currently in cleaning / reset</div>
            {cleaningRooms.map(s=>{
              const r=daysUntilReady(s);
              return(<div key={s.id} style={{fontSize:11,color:"var(--text-2)",marginBottom:2}}>
                <strong>{s.name}</strong> — {r?r.diff>=0?`Ready in ${r.diff} day${r.diff!==1?"s":""} (${fmtD(r.date)})`:`Overdue by ${Math.abs(r.diff)}d`:"reset days not set"}
              </div>);
            })}
          </div>
        )}

        {form&&(
          <div className="gm-card" style={{border:"1px solid var(--accent)"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>{form.id?"Edit Room":"Add Room / Space"}</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="gm-lbl">Room / space name</label><input className="gm-inp" value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="GH-4, Indoor Room 1, Veg Tent A…" /></div>
              <div><label className="gm-lbl">Room type</label><select className="gm-sel" value={form.type} onChange={e=>setF("type",e.target.value)}>{ROOM_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label className="gm-lbl">Status</label><select className="gm-sel" value={form.status} onChange={e=>setF("status",e.target.value)}>{STATUSES.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}</select></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="gm-lbl">Square footage</label><input type="number" className="gm-inp" value={form.sqft} onChange={e=>setF("sqft",e.target.value)} /></div>
              <div><label className="gm-lbl">Canopy sq ft</label><input type="number" className="gm-inp" value={form.canopy} onChange={e=>setF("canopy",e.target.value)} /></div>
              <div><label className="gm-lbl">Max plant count</label><input type="number" className="gm-inp" value={form.maxPlants} onChange={e=>setF("maxPlants",e.target.value)} /></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="gm-lbl">Light type</label><select className="gm-sel" value={form.lightType} onChange={e=>setF("lightType",e.target.value)}>{LIGHT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label className="gm-lbl">Light count</label><input type="number" className="gm-inp" value={form.lightCount} onChange={e=>setF("lightCount",e.target.value)} /></div>
              <div><label className="gm-lbl">Watts per fixture</label><input type="number" className="gm-inp" value={form.lightWatts} onChange={e=>setF("lightWatts",e.target.value)} /></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="gm-lbl">Clean & reset duration (days)</label><input type="number" min="1" className="gm-inp" value={form.resetDays} onChange={e=>setF("resetDays",e.target.value)} /></div>
              <div><label className="gm-lbl">Last harvest date</label><input type="date" className="gm-inp" value={form.lastHarvestDate} onChange={e=>setF("lastHarvestDate",e.target.value)} /></div>
              <div><label className="gm-lbl">Sensor ID (Growlink / future API)</label><input className="gm-inp" value={form.sensorId} onChange={e=>setF("sensorId",e.target.value)} placeholder="For V2 climate API bridge" /></div>
            </div>
            <div style={{marginBottom:10}}><label className="gm-lbl">Notes</label><input className="gm-inp" value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {err&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="gm-btn gm-primary" onClick={save}>{form.id?"Save changes":"Add to Grow Map"}</button>
              <button className="gm-btn gm-secondary" onClick={()=>{setForm(null);setErr("");}}>Cancel</button>
            </div>
          </div>
        )}

        {spaces.length===0&&!form&&(
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🗺️</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No grow spaces mapped yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Add every room, greenhouse, and grow area here — this becomes the source of truth for the Clone Scheduler and cultivation planning</div>
          </div>
        )}

        {spaces.length>0&&!form&&(
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
              {STATUSES.map(s=>{const count=spaces.filter(sp=>sp.status===s.v).length;return count>0?(<div key={s.v} style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                <div style={{fontSize:9,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.l.split("—")[0].trim()}</div>
                <div style={{fontSize:20,fontWeight:700,color:"var(--accent-2)"}}>{count}</div>
              </div>):null;})}
            </div>
            <div className="gm-grid">
              {spaces.map(sp=>{
                const ready=daysUntilReady(sp);
                const totalW=parseInt(sp.lightCount||0)*parseInt(sp.lightWatts||0);
                return(
                  <div key={sp.id} className="gm-room">
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div className="gm-room-name">{sp.name}</div>
                        <div className="gm-room-sub">{sp.type}</div>
                      </div>
                      <span className={"gm-pill s-"+sp.status}>{STATUSES.find(s=>s.v===sp.status)?.l.split("—")[0].trim()}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:6}}>
                      {sp.sqft&&<div className="gm-stat"><div className="gm-stat-l">Total sq ft</div><div className="gm-stat-v">{sp.sqft}</div></div>}
                      {sp.canopy&&<div className="gm-stat"><div className="gm-stat-l">Canopy sq ft</div><div className="gm-stat-v">{sp.canopy}</div></div>}
                      {sp.maxPlants&&<div className="gm-stat"><div className="gm-stat-l">Max plants</div><div className="gm-stat-v">{sp.maxPlants}</div></div>}
                      {sp.lightType&&<div className="gm-stat"><div className="gm-stat-l">Lighting</div><div className="gm-stat-v">{sp.lightCount?sp.lightCount+"× ":""}{sp.lightType}</div></div>}
                      {totalW>0&&<div className="gm-stat"><div className="gm-stat-l">Total watts</div><div className="gm-stat-v">{totalW.toLocaleString()}W</div></div>}
                      {sp.resetDays&&<div className="gm-stat"><div className="gm-stat-l">Reset days</div><div className="gm-stat-v">{sp.resetDays}d</div></div>}
                    </div>
                    {ready&&<div style={{fontSize:11,color:ready.diff>=0?"var(--accent-2)":"var(--danger)",marginTop:4,fontWeight:500}}>
                      {ready.diff>=0?`Ready in ${ready.diff}d — ${fmtD(ready.date)}`:`Reset overdue by ${Math.abs(ready.diff)}d`}
                    </div>}
                    {sp.sensorId&&<div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>Sensor: {sp.sensorId}</div>}
                    {(()=>{const ab=getActiveBatch(sp.name,sp.id);return ab?(<div style={{fontSize:11,color:"var(--accent-2)",fontWeight:500,marginTop:4,background:"rgba(74,124,89,0.1)",borderRadius:5,padding:"3px 7px",display:"inline-block"}}>🌱 Active batch: {(ab.strains||[]).map(s=>s.name).join(", ")||ab.strain||"—"}</div>):null;})()}
                    {sp.notes&&<div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>{sp.notes}</div>}
                    <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                      {sp.status!=="cleaning"&&<button className="gm-sm gm-secondary" onClick={()=>setStatus(sp.id,"cleaning")}>→ Cleaning</button>}
                      {sp.status!=="active"&&<button className="gm-sm gm-secondary" onClick={()=>setStatus(sp.id,"active")}>→ Active</button>}
                      {sp.status!=="empty"&&<button className="gm-sm gm-secondary" onClick={()=>setStatus(sp.id,"empty")}>→ Empty</button>}
                      <button className="gm-sm gm-edit" onClick={()=>openEdit(sp)}>Edit</button>
                      <button className="gm-sm gm-del" onClick={()=>remove(sp.id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
