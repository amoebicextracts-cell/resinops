import { useState, useEffect } from "react";
import { db } from "./lib/db";
import { parseDateLocal } from "./lib/dateUtils";
import { supabase, getCurrentFacility } from "./lib/supabase";
import { authenticatedApiFetch, formatApiError } from "./lib/api";

const ROOM_TYPES = ["Indoor","Mixed-Light Greenhouse","Outdoor Greenhouse","Hoop House","Outdoor","Mother Room","Propagation","Veg","Nursery","Genetics Lab / TC","Other"];
const LIGHT_TYPES = ["HPS","LED","CMH/LEC","DE HPS","Hybrid LED+HPS","Natural Light","Supplemental LED","None"];
const CO2_METHODS = [
  {v:"",l:"— Not enriched —"},
  {v:"tank",l:"Tank / Regulator"},
  {v:"burner",l:"Combustion Burner"},
];
const STATUSES = [
  {v:"active",l:"Active — plants in room"},
  {v:"cleaning",l:"Cleaning / Reset"},
  {v:"empty",l:"Empty — ready for plants"},
  {v:"inbuild",l:"In Build / Under Construction"},
  {v:"offline",l:"Offline"},
];

function fmtD(dt){return dt?parseDateLocal(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";}
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
  .gm-sensor-readout{display:flex;gap:10px;font-size:11px;color:var(--accent-2);margin-top:4px;font-weight:600;}
`;

const EMPTY={name:"",type:"Indoor",sqft:"",canopy:"",maxPlants:"",lightType:"LED",lightCount:"",lightWatts:"",resetDays:"7",status:"empty",lastHarvestDate:"",sensorId:"",notes:"",
  ceilingHeightFt:"",co2Method:"",co2PpmTarget:"1200",co2HoursPerDay:"12",co2InjectionRateAch:"0.75",co2BurnRateCf:"",co2InventoryItemId:""};

export default function GrowMap(){
  const [spaces,setSpaces]=useState([]);
  const [cultSpaces,setCultSpaces]=useState([]);
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [links,setLinks]=useState([]);
  const [readings,setReadings]=useState({});

  function normalizeRoom(r){
    return {
      ...r,
      id: r.id||crypto.randomUUID(),
      name: r.name||r.room_name||r["Room Name"]||r["Space Name"]||r["Room"]||"",
      type: r.type||r.room_type||r["Room Type"]||r["Type"]||"Indoor",
      sqft: r.sqft||r.total_sq_ft||r["Total Sq Ft"]||r["Square Footage"]||r["Sq Ft"]||"",
      canopy: r.canopy||r.canopy_sqft||r.canopy_sq_ft||r["Canopy Sq Ft"]||r["Canopy"]||"",
      maxPlants: r.maxPlants||r.max_plants||r["Max Plants"]||"",
      lightType: r.lightType||r.light_type||r["Light Type"]||"LED",
      lightCount: r.lightCount||r.light_count||r["Lights Count"]||"",
      lightWatts: r.lightWatts||r.light_watts||r.watts_per_light||r["Watts Per Light"]||"",
      resetDays: r.resetDays||r.reset_days||r["Reset Days"]||"",
      lastHarvestDate: r.lastHarvestDate||r.last_harvest_date||"",
      sensorId: r.sensorId||r.sensor_id||"",
      status: r.status||"active",
      notes: r.notes||"",
      ceilingHeightFt: r.ceilingHeightFt||r.ceiling_height_ft||"",
      co2Method: r.co2Method||r.co2_method||"",
      co2PpmTarget: r.co2PpmTarget||r.co2_ppm_target||"",
      co2HoursPerDay: r.co2HoursPerDay||r.co2_hours_per_day||"",
      co2InjectionRateAch: r.co2InjectionRateAch||r.co2_injection_rate_ach||"",
      co2BurnRateCf: r.co2BurnRateCf||r.co2_burn_rate_cf||"",
      co2InventoryItemId: r.co2InventoryItemId||r.co2_inventory_item_id||"",
    };
  }

  useEffect(()=>{
    async function load(){
      try{
        const [rooms, cs, inv, deviceLinks] = await Promise.all([
          db.grow_rooms.list(),
          db.grow_spaces.list(),
          db.inventory_items.list(),
          db.sensor_device_links.list(),
        ]);
        setSpaces(rooms.map(normalizeRoom));
        setCultSpaces(cs);
        setItems(inv);
        setLinks(deviceLinks);
        await loadReadings(rooms.map(r=>r.id));
      }catch(e){ console.error("GrowMap load error:",e); }
      setLoading(false);
    }
    load();
  },[]);

  // Live readout on room cards -- last 30 minutes of readings, latest value
  // per room+metric. Empty/no-op in local mode (no `supabase` client) or for
  // rooms with no linked/reporting sensor.
  async function loadReadings(roomIds){
    if(!supabase || roomIds.length===0) return;
    try{
      const cutoff=new Date(Date.now()-30*60000).toISOString();
      const {data,error}=await supabase.from("sensor_readings")
        .select("grow_room_id,metric,value,recorded_at")
        .in("grow_room_id",roomIds).gte("recorded_at",cutoff)
        .order("recorded_at",{ascending:false});
      if(error) throw error;
      const byRoom={};
      for(const row of (data||[])){
        if(!byRoom[row.grow_room_id]) byRoom[row.grow_room_id]={};
        if(!(row.metric in byRoom[row.grow_room_id])){
          byRoom[row.grow_room_id][row.metric]={value:row.value,recordedAt:row.recorded_at};
        }
      }
      setReadings(byRoom);
    }catch(e){ console.error("Sensor readings load error:",e); }
  }

  async function refreshLinks(){
    try{ setLinks(await db.sensor_device_links.list()); }catch(e){ console.error(e); }
  }

  function getActiveBatch(roomName, roomId) {
    return cultSpaces.find(s => s.name === roomName || s.growMapId === roomId);
  }
  const [form,setForm]=useState(null);
  const [err,setErr]=useState("");

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  function openAdd(){setForm({...EMPTY,id:null});setErr("");}
  function openEdit(s){setForm({...s});setErr("");}
  async function save(){
    if(!form.name.trim()){setErr("Enter a room name.");return;}
    // co2_method has a not-null-friendly check constraint (tank/burner) —
    // "" (the form's "not enriched" option) must become null, not the
    // literal empty string, or the save fails the constraint.
    const sp={...form,id:form.id||crypto.randomUUID(),co2Method:form.co2Method||null};
    try{
      const saved=await db.grow_rooms.upsert(sp);
      const normalized=normalizeRoom(saved);
      if(form.id) setSpaces(p=>p.map(x=>x.id===normalized.id?normalized:x));
      else setSpaces(p=>[...p,normalized]);
      setForm(null);setErr("");
    }catch(e){ setErr("Save failed: "+e.message); }
  }
  async function remove(id){
    try{
      await db.grow_rooms.delete(id);
      setSpaces(p=>p.filter(x=>x.id!==id));
    }catch(e){ setErr("Delete failed: "+e.message); }
  }
  async function setStatus(id,status){
    try{
      const room=spaces.find(x=>x.id===id);
      if(room){
        await db.grow_rooms.upsert({...room,status});
        setSpaces(p=>p.map(x=>x.id===id?{...x,status}:x));
      }
    }catch(e){ console.error("Status update failed:",e); }
  }

  function exportCSV(){
    const cols=["name","type","sqft","canopy","maxPlants","lightType","lightCount","lightWatts","resetDays","status","sensorId","notes"];
    const rows=[cols.join(","), ...spaces.map(s=>cols.map(k=>JSON.stringify(s[k]||"")).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows],{type:"text/csv"}));a.download="GrowMap.csv";document.body.appendChild(a);a.click();document.body.removeChild(a);
  }

  const statusGroups=STATUSES.map(s=>({...s,rooms:spaces.filter(sp=>sp.status===s.v)}));
  const cleaningRooms=spaces.filter(s=>s.status==="cleaning");

  if(loading) return(<div style={{padding:48,textAlign:"center",color:"var(--text-3)",fontSize:14}}>Loading grow rooms…</div>);

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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="gm-lbl">Ceiling height (ft)</label><input type="number" className="gm-inp" value={form.ceilingHeightFt} onChange={e=>setF("ceilingHeightFt",e.target.value)} placeholder="8" /></div>
              <div><label className="gm-lbl">CO2 delivery method</label><select className="gm-sel" value={form.co2Method} onChange={e=>setF("co2Method",e.target.value)}>{CO2_METHODS.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}</select></div>
              <div><label className="gm-lbl">CO2 source (inventory item)</label><select className="gm-sel" value={form.co2InventoryItemId} onChange={e=>setF("co2InventoryItemId",e.target.value)} disabled={!form.co2Method}><option value="">— Select item —</option>{items.filter(i=>i.cat==="Cultivation Supplies"&&/co2/i.test(i.n||"")).map(i=><option key={i.id} value={i.id}>{i.n}</option>)}</select></div>
            </div>
            {form.co2Method&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="gm-lbl">Default PPM target</label><input type="number" className="gm-inp" value={form.co2PpmTarget} onChange={e=>setF("co2PpmTarget",e.target.value)} /></div>
                <div><label className="gm-lbl">Default hours enriched/day</label><input type="number" className="gm-inp" value={form.co2HoursPerDay} onChange={e=>setF("co2HoursPerDay",e.target.value)} /></div>
                {form.co2Method==="tank"&&<div><label className="gm-lbl">Replenishment rate (room-volumes/hr)</label><input type="number" step="0.05" className="gm-inp" value={form.co2InjectionRateAch} onChange={e=>setF("co2InjectionRateAch",e.target.value)} placeholder="0.75" /></div>}
                {form.co2Method==="burner"&&<div><label className="gm-lbl">Burner output (ft³ CO2/hr, from spec sheet)</label><input type="number" className="gm-inp" value={form.co2BurnRateCf} onChange={e=>setF("co2BurnRateCf",e.target.value)} /></div>}
              </div>
            )}
            <div style={{marginBottom:10}}><label className="gm-lbl">Notes</label><input className="gm-inp" value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>
            {form.id
              ? <SensorLinksPanel roomId={form.id} links={links.filter(l=>l.grow_room_id===form.id)} onChange={refreshLinks} />
              : <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10}}>Save the room first, then AC Infinity sensors can be linked to it here.</div>}
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
                    {sp.co2Method&&<div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>CO2: {sp.co2Method==="tank"?"Tank/Regulator":"Burner"} · Target {sp.co2PpmTarget||1200}ppm · {sp.co2HoursPerDay||12}h/day</div>}
                    {ready&&<div style={{fontSize:11,color:ready.diff>=0?"var(--accent-2)":"var(--danger)",marginTop:4,fontWeight:500}}>
                      {ready.diff>=0?`Ready in ${ready.diff}d — ${fmtD(ready.date)}`:`Reset overdue by ${Math.abs(ready.diff)}d`}
                    </div>}
                    {readings[sp.id]&&(
                      <div className="gm-sensor-readout">
                        {readings[sp.id].temp_f&&<span>🌡 {readings[sp.id].temp_f.value.toFixed(1)}°F</span>}
                        {readings[sp.id].humidity_pct&&<span>💧 {readings[sp.id].humidity_pct.value.toFixed(0)}%</span>}
                        {readings[sp.id].vpd_kpa&&<span>VPD {readings[sp.id].vpd_kpa.value.toFixed(2)}</span>}
                      </div>
                    )}
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

// AC Infinity is the only sensor platform Alex currently has account access
// to without a client involved (Growlink/Argus require a client's real
// account) -- see supabase/migrations/20260820090000_add_sensor_ingestion.sql
// and api/ac-infinity.js. "Discover" shows AC Infinity's raw device-list JSON
// rather than a parsed dropdown, since the exact device/port response shape
// isn't documented anywhere verifiable -- the device ID / port gets read off
// the raw output once, the first time a real account is linked.
function SensorLinksPanel({roomId,links,onChange}){
  const [discovering,setDiscovering]=useState(false);
  const [discovered,setDiscovered]=useState("");
  const [discoverErr,setDiscoverErr]=useState("");
  const [newDeviceId,setNewDeviceId]=useState("");
  const [newPort,setNewPort]=useState("");
  const [newLabel,setNewLabel]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  async function discover(){
    setDiscovering(true);setDiscoverErr("");
    try{
      const res=await authenticatedApiFetch("/api/ac-infinity",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"devices.list"}),
      },{includeFacility:true});
      const json=await res.json();
      if(!res.ok||json.error) throw new Error(formatApiError(res,json,"AC Infinity request failed"));
      setDiscovered(JSON.stringify(json.data,null,2));
    }catch(e){ setDiscoverErr(e.message); }
    setDiscovering(false);
  }

  async function addLink(){
    if(!newDeviceId.trim()){setErr("Enter a device ID — read it off the discovered JSON above.");return;}
    setBusy(true);setErr("");
    try{
      await db.sensor_device_links.upsert({
        grow_room_id:roomId,source:"ac_infinity",
        external_device_id:newDeviceId.trim(),external_port_id:newPort.trim()||null,
        label:newLabel.trim()||null,active:true,
      });
      setNewDeviceId("");setNewPort("");setNewLabel("");
      onChange();
    }catch(e){ setErr("Link failed: "+e.message); }
    setBusy(false);
  }

  async function toggleActive(link){
    try{ await db.sensor_device_links.upsert({...link,active:!link.active}); onChange(); }
    catch(e){ console.error("Sensor link toggle failed:",e); }
  }

  async function removeLink(id){
    try{ await db.sensor_device_links.delete(id); onChange(); }
    catch(e){ console.error("Sensor link delete failed:",e); }
  }

  return(
    <div style={{marginTop:2,marginBottom:14,padding:12,background:"var(--surface-2)",borderRadius:8,border:"1px solid var(--border-2)"}}>
      <div style={{fontSize:12,fontWeight:600,color:"var(--text)",marginBottom:8}}>AC Infinity sensor links</div>
      {links.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
          {links.map(l=>(
            <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,color:"var(--text-2)"}}>
              <span>{l.label||`Device ${l.external_device_id}`}{l.external_port_id?` · port ${l.external_port_id}`:""}{!l.active&&" (paused)"}</span>
              <span style={{display:"flex",gap:6}}>
                <button className="gm-sm gm-secondary" onClick={()=>toggleActive(l)}>{l.active?"Pause":"Resume"}</button>
                <button className="gm-sm gm-del" onClick={()=>removeLink(l.id)}>✕</button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:8,marginBottom:8}}>
        <input className="gm-inp" placeholder="Device ID" value={newDeviceId} onChange={e=>setNewDeviceId(e.target.value)} />
        <input className="gm-inp" placeholder="Port (if any)" value={newPort} onChange={e=>setNewPort(e.target.value)} />
        <input className="gm-inp" placeholder="Label (optional)" value={newLabel} onChange={e=>setNewLabel(e.target.value)} />
        <button className="gm-btn gm-secondary" disabled={busy} onClick={addLink}>+ Link</button>
      </div>
      {err&&<div style={{fontSize:11,color:"var(--danger)",marginBottom:8}}>{err}</div>}
      <button className="gm-btn gm-secondary" style={{fontSize:11}} disabled={discovering} onClick={discover}>
        {discovering?"Discovering…":"Discover AC Infinity devices"}
      </button>
      <div style={{fontSize:10,color:"var(--text-3)",marginTop:4}}>
        Not an officially documented API — this shows AC Infinity's raw device list so the device ID / port can be read off it and linked above.
      </div>
      {discoverErr&&<div style={{fontSize:11,color:"var(--danger)",marginTop:6}}>{discoverErr}</div>}
      {discovered&&<pre style={{fontSize:10,color:"var(--text-2)",background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:6,padding:8,marginTop:8,maxHeight:200,overflow:"auto",whiteSpace:"pre-wrap"}}>{discovered}</pre>}
    </div>
  );
}
