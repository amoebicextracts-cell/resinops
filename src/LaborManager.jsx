import { useState, useEffect } from "react";

export const DEFAULT_LABOR_TYPES = [
  {id:"lt_1", n:"Director of Operations",       cat:"Management",   count:1, rate:75},
  {id:"lt_2", n:"Production Manager",            cat:"Management",   count:1, rate:50},
  {id:"lt_3", n:"QC / Compliance Manager",       cat:"Management",   count:1, rate:45},
  {id:"lt_4", n:"Lead Extraction Technician",    cat:"Extraction",   count:1, rate:32},
  {id:"lt_5", n:"Extraction Technician",         cat:"Extraction",   count:2, rate:25},
  {id:"lt_6", n:"Post-Harvest Lead",             cat:"Post-Harvest", count:1, rate:28},
  {id:"lt_7", n:"Trim Technician",               cat:"Post-Harvest", count:4, rate:18},
  {id:"lt_8", n:"Packaging Technician",          cat:"Post-Harvest", count:3, rate:18},
  {id:"lt_9", n:"Pre-Roll Technician",           cat:"Post-Harvest", count:2, rate:20},
  {id:"lt_10",n:"Head Grower / Cultivation Lead",cat:"Cultivation",  count:1, rate:30},
  {id:"lt_11",n:"Cultivation Technician",        cat:"Cultivation",  count:3, rate:20},
  {id:"lt_12",n:"IPM Technician",                cat:"Cultivation",  count:1, rate:22},
  {id:"lt_13",n:"Compliance Officer",            cat:"Compliance",   count:1, rate:35},
  {id:"lt_14",n:"Formulation Technician",        cat:"Production",   count:2, rate:22},
  {id:"lt_15",n:"Processing Technician",         cat:"Production",   count:2, rate:20},
];

// Default labor for each step type
export const STEP_LABOR = {
  "Intake / Prep":                    {p:false, h:4,  s:2, lc:"Production"},
  "Drying":                           {p:true,  h:12, s:1, lc:"Post-Harvest", m:0.5},
  "Bucking":                          {p:false, h:8,  s:3, lc:"Post-Harvest"},
  "Trimming":                         {p:false, h:24, s:4, lc:"Post-Harvest"},
  "Curing":                           {p:true,  h:10, s:1, lc:"Post-Harvest", m:0.25},
  "Grinding":                         {p:false, h:4,  s:2, lc:"Post-Harvest"},
  "Rolling / Filling":                {p:false, h:8,  s:3, lc:"Post-Harvest"},
  "Cold Hydrocarbon Extraction":      {p:false, h:8,  s:2, lc:"Extraction"},
  "Extraction":                       {p:false, h:8,  s:2, lc:"Extraction"},
  "Pressing":                         {p:false, h:8,  s:2, lc:"Extraction"},
  "Washing":                          {p:false, h:8,  s:2, lc:"Extraction"},
  "Lyophilization":                   {p:true,  h:3,  s:1, lc:"Post-Harvest", m:0.5},
  "Purge / Process":                  {p:true,  h:3,  s:1, lc:"Extraction",   m:1.0},
  "Controlled Crash Crystallization": {p:false, h:8,  s:2, lc:"Extraction"},
  "HTE Removal (Butane Fraction)":    {p:false, h:4,  s:2, lc:"Extraction"},
  "HTE Removal / Pour-off":           {p:false, h:4,  s:2, lc:"Extraction"},
  "Warm Gas Redissolution":           {p:false, h:4,  s:2, lc:"Extraction"},
  "Initial Solvent Recovery":         {p:false, h:4,  s:2, lc:"Extraction"},
  "Diamond Mining / Jar Crystallization":{p:true,h:21, s:1, lc:"Extraction",  m:0.5},
  "Recrystallization":                {p:false, h:4,  s:2, lc:"Extraction"},
  "Cold Solvent Wash":                {p:false, h:4,  s:2, lc:"Extraction"},
  "Crystal Filtration":               {p:false, h:4,  s:2, lc:"Extraction"},
  "Crystal Wash":                     {p:false, h:4,  s:2, lc:"Extraction"},
  "Residual Purge":                   {p:true,  h:1,  s:1, lc:"Extraction",   m:0.5},
  "Final Solvent Purge":              {p:true,  h:2,  s:1, lc:"Extraction",   m:0.5},
  "Crude Extraction":                 {p:false, h:12, s:2, lc:"Extraction"},
  "Winterization":                    {p:false, h:4,  s:2, lc:"Extraction"},
  "Extensive Winterization":          {p:false, h:6,  s:2, lc:"Extraction"},
  "CRC Remediation":                  {p:false, h:4,  s:2, lc:"Extraction"},
  "Material Decarb 125C":             {p:false, h:2,  s:1, lc:"Extraction"},
  "Decarb":                           {p:false, h:2,  s:1, lc:"Extraction"},
  "Distillation":                     {p:false, h:8,  s:2, lc:"Extraction"},
  "Sauce Separation":                 {p:false, h:4,  s:2, lc:"Extraction"},
  "R-134a Terp Cut":                  {p:false, h:4,  s:2, lc:"Extraction"},
  "R-134a Cannabinoid Cut":           {p:false, h:14, s:2, lc:"Extraction"},
  "THCa Crystallization":             {p:true,  h:18, s:1, lc:"Extraction",   m:0.5},
  "Formulation":                      {p:false, h:6,  s:2, lc:"Production"},
  "Filling":                          {p:false, h:8,  s:3, lc:"Production"},
  "Production":                       {p:false, h:10, s:3, lc:"Production"},
  "Dose QC":                          {p:false, h:4,  s:2, lc:"Compliance"},
  "QC / Testing":                     {p:true,  h:10, s:0, lc:"Compliance",   m:0.25},
  "Packaging":                        {p:false, h:8,  s:3, lc:"Post-Harvest"},
  "Inventory":                        {p:false, h:2,  s:2, lc:"Compliance"},
};

const CATS = ["Management","Extraction","Post-Harvest","Cultivation","Compliance","Production"];

const CSS = `
  .lm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .lm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:18px;}
  .lm-title{font-size:13px;font-weight:600;color:var(--text);margin:0 0 14px;}
  .lm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .lm-inp:focus{outline:none;border-color:var(--accent);}
  .lm-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .lm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .lm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;transition:opacity 0.15s;font-size:12px;padding:7px 14px;}
  .lm-btn:hover{opacity:0.85;}
  .lm-primary{background:var(--accent);color:#fff;}
  .lm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .lm-danger{background:rgba(200,74,74,0.1);border:1px solid rgba(200,74,74,0.3)!important;color:var(--danger);padding:4px 10px;font-size:11px;border-radius:5px;}
  .lm-tbl{width:100%;border-collapse:collapse;}
  .lm-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .lm-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-2);font-size:13px;vertical-align:middle;}
  .lm-tbl tr:last-child td{border-bottom:none;}
  .lm-cat{font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;background:rgba(74,124,89,0.15);color:var(--accent-2);}
  .lm-num{width:70px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:6px;color:var(--text);font-family:monospace;font-size:12px;padding:3px 6px;text-align:center;}
  .lm-num:focus{outline:none;border-color:var(--accent);}
`;

const EMPTY_LT = {n:"",cat:"Post-Harvest",count:"1",rate:"20"};

export default function LaborManager() {
  const [facility, setFacility] = useState(() => {
    try { return JSON.parse(localStorage.getItem("resinops_facility") || '{"shiftHours":"8","shiftsPerDay":"1"}'); }
    catch { return {shiftHours:"8",shiftsPerDay:"1"}; }
  });
  const [types, setTypes] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("resinops_labor_types") || "[]");
      return stored.length > 0 ? stored : DEFAULT_LABOR_TYPES;
    } catch { return DEFAULT_LABOR_TYPES; }
  });
  const [form, setForm] = useState(null); // null = hidden, {} = new, {id} = edit
  const [err, setErr] = useState("");

  useEffect(() => { localStorage.setItem("resinops_facility", JSON.stringify(facility)); }, [facility]);
  useEffect(() => { localStorage.setItem("resinops_labor_types", JSON.stringify(types)); }, [types]);

  const setF = (k,v) => setFacility(f => ({...f,[k]:v}));
  const setLF = (k,v) => setForm(f => ({...f,[k]:v}));

  function openAdd() { setForm({...EMPTY_LT}); setErr(""); }
  function openEdit(lt) { setForm({...lt, count:String(lt.count), rate:String(lt.rate)}); setErr(""); }
  function closeForm() { setForm(null); setErr(""); }

  function saveType() {
    if (!form.n?.trim()) { setErr("Enter a job title."); return; }
    const lt = { id: form.id || "lt_"+Date.now(), n: form.n.trim(), cat: form.cat, count: parseInt(form.count)||1, rate: parseFloat(form.rate)||0 };
    if (form.id) setTypes(p => p.map(t => t.id===form.id ? lt : t));
    else setTypes(p => [...p, lt]);
    closeForm();
  }

  function removeType(id) { setTypes(p => p.filter(t => t.id !== id)); }

  function resetDefaults() {
    if (window.confirm("Reset labor types to defaults? This will overwrite your current roster.")) {
      setTypes(DEFAULT_LABOR_TYPES);
    }
  }

  const totalHeadcount = types.reduce((a,t) => a+t.count, 0);
  const totalHrCost = types.reduce((a,t) => a+t.count*t.rate, 0);

  return (
    <>
      <style>{CSS}</style>
      <div className="lm-wrap">
        <div style={{marginBottom:20}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Labor Setup</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>Define facility shift structure and labor types with hourly rates</div>
        </div>

        {/* Facility settings */}
        <div className="lm-card">
          <div className="lm-title">Facility Settings</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <div>
              <label className="lm-lbl">Hours per shift</label>
              <input type="number" className="lm-inp" min="1" max="24" value={facility.shiftHours}
                onChange={e=>setF("shiftHours",e.target.value)} />
            </div>
            <div>
              <label className="lm-lbl">Shifts per day</label>
              <input type="number" className="lm-inp" min="1" max="3" value={facility.shiftsPerDay}
                onChange={e=>setF("shiftsPerDay",e.target.value)} />
            </div>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:1}}>
              <div style={{fontSize:12,color:"var(--text-2)"}}>
                <div style={{fontSize:22,fontWeight:700,color:"var(--accent-2)",lineHeight:1}}>{(parseFloat(facility.shiftHours)||8)*(parseInt(facility.shiftsPerDay)||1)}</div>
                productive hrs/day
              </div>
            </div>
          </div>
        </div>

        {/* Labor types */}
        <div className="lm-card">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div>
              <div className="lm-title" style={{margin:0}}>Labor Roster</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginTop:2}}>
                {totalHeadcount} total headcount · ~${totalHrCost.toFixed(0)}/hr fully staffed
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="lm-btn lm-secondary" style={{fontSize:11,padding:"5px 10px"}} onClick={resetDefaults}>Reset defaults</button>
              {!form && <button className="lm-btn lm-primary" onClick={openAdd}>+ Add role</button>}
            </div>
          </div>

          {/* Add/edit form */}
          {form && (
            <div style={{background:"var(--surface-2)",borderRadius:8,padding:"12px 14px",marginBottom:14,border:"1px solid var(--border-2)"}}>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="lm-lbl">Job title</label>
                  <input className="lm-inp" placeholder="Trim Technician" value={form.n} onChange={e=>setLF("n",e.target.value)} />
                </div>
                <div>
                  <label className="lm-lbl">Category</label>
                  <select className="lm-sel" value={form.cat} onChange={e=>setLF("cat",e.target.value)}>
                    {CATS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lm-lbl">Headcount</label>
                  <input type="number" min="0" className="lm-inp" value={form.count} onChange={e=>setLF("count",e.target.value)} />
                </div>
                <div>
                  <label className="lm-lbl">Hourly rate ($)</label>
                  <input type="number" min="0" step="0.5" className="lm-inp" value={form.rate} onChange={e=>setLF("rate",e.target.value)} />
                </div>
              </div>
              {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="lm-btn lm-primary" onClick={saveType}>{form.id?"Save changes":"Add role"}</button>
                <button className="lm-btn lm-secondary" onClick={closeForm}>Cancel</button>
              </div>
            </div>
          )}

          {/* Table */}
          {types.length === 0 ? (
            <div style={{textAlign:"center",padding:"24px",color:"var(--text-3)",fontSize:13}}>No labor types defined. Click + Add role or Reset defaults.</div>
          ) : (
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="lm-tbl">
                <thead>
                  <tr><th>Job Title</th><th>Category</th><th>Headcount</th><th>Hourly Rate</th><th>Daily Cost (1 shift)</th><th></th></tr>
                </thead>
                <tbody>
                  {CATS.map(cat => {
                    const catTypes = types.filter(t => t.cat === cat);
                    if (!catTypes.length) return null;
                    return [
                      <tr key={"h-"+cat}><td colSpan={6} style={{background:"var(--surface-2)",fontSize:10,fontWeight:700,color:"var(--text-3)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"5px 10px"}}>{cat}</td></tr>,
                      ...catTypes.map(lt => (
                        <tr key={lt.id}>
                          <td style={{fontWeight:500,color:"var(--text)"}}>{lt.n}</td>
                          <td><span className="lm-cat">{lt.cat}</span></td>
                          <td>
                            <input type="number" min="0" className="lm-num" value={lt.count}
                              onChange={e=>setTypes(p=>p.map(t=>t.id===lt.id?{...t,count:parseInt(e.target.value)||0}:t))} />
                          </td>
                          <td>${lt.rate.toFixed(2)}/hr</td>
                          <td style={{color:"var(--accent-2)",fontWeight:500}}>
                            ${(lt.count * lt.rate * (parseFloat(facility.shiftHours)||8)).toFixed(0)}
                          </td>
                          <td>
                            <div style={{display:"flex",gap:6}}>
                              <button className="lm-btn lm-secondary" style={{padding:"3px 8px",fontSize:10}} onClick={()=>openEdit(lt)}>Edit</button>
                              <button className="lm-danger" onClick={()=>removeType(lt.id)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary */}
          {types.length > 0 && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:14}}>
              {[
                {l:"Total headcount",v:totalHeadcount+" people"},
                {l:"Hourly all-in",v:"$"+totalHrCost.toFixed(0)+"/hr"},
                {l:"Daily labor cost",v:"$"+(totalHrCost*(parseFloat(facility.shiftHours)||8)*(parseInt(facility.shiftsPerDay)||1)).toFixed(0)+"/day"},
                {l:"Weekly labor cost",v:"$"+(totalHrCost*(parseFloat(facility.shiftHours)||8)*(parseInt(facility.shiftsPerDay)||1)*5).toFixed(0)+"/wk"},
              ].map((s,i)=>(
                <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{s.l}</div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{s.v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step labor defaults info */}
        <div className="lm-card">
          <div className="lm-title">Step Labor Defaults</div>
          <div style={{fontSize:12,color:"var(--text-2)",lineHeight:1.7}}>
            Each production step has pre-assigned labor defaults based on step type. When you add a batch, steps are automatically classified as <strong style={{color:"var(--accent-2)"}}>active</strong> (needs full staff) or <strong style={{color:"var(--amber)"}}>passive</strong> (monitoring only — drying, curing, testing, crystallization). You can override hours, staff count, and labor type per step per batch.
          </div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <div style={{background:"rgba(74,124,89,0.15)",border:"1px solid var(--accent)",borderRadius:6,padding:"6px 12px",fontSize:11,color:"var(--accent-2)",fontWeight:600}}>Active step — full shift hours</div>
            <div style={{background:"rgba(200,150,58,0.1)",border:"1px solid var(--amber)",borderRadius:6,padding:"6px 12px",fontSize:11,color:"var(--amber)",fontWeight:600}}>Passive step — monitoring hours only</div>
          </div>
        </div>
      </div>
    </>
  );
}
