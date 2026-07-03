import { useState, useRef } from "react";

// All localStorage keys that belong to ResinOps
const ALL_KEYS = [
  "resinops_spaces","resinops_grow_map","resinops_clone_sched",
  "resinops_harvest_batches","resinops_prod","resinops_remediation",
  "resinops_inventory","resinops_vendors","resinops_pos",
  "resinops_boms","resinops_cogs","resinops_skus","resinops_cult_costs",
  "resinops_equipment","resinops_equipment_service",
  "resinops_workorders","resinops_loto",
  "resinops_employees","resinops_shifts","resinops_signoffs",
  "resinops_sops","resinops_deviations",
  "resinops_cult_inputs","resinops_qc_tests","resinops_qc_holds",
  "resinops_pheno_hunts","resinops_strains",
  "resinops_presell","resinops_orders",
  "resinops_labor_types","resinops_facility","resinops_facility_settings",
  "resinops_facility_root_days","resinops_facility_veg_weeks",
  "resinops_presell_default",
];

function bytesToSize(b){ return b>1048576?(b/1048576).toFixed(1)+"MB":b>1024?(b/1024).toFixed(0)+"KB":b+"B"; }
function countRecords(data){
  let n=0;
  Object.values(data).forEach(v=>{ try{ const p=JSON.parse(v); if(Array.isArray(p)) n+=p.length; else if(p&&typeof p==="object") n+=1; }catch{} });
  return n;
}

// ── Import-target schemas for the AI to map to ──────────────────────────────
const IMPORT_TARGETS = {
  employees:{ label:"Employee Roster", icon:"👥", key:"resinops_employees",
    schema:`Each record must use these EXACT field names — map from whatever column names appear in the source:
  name (the person's full name — may be called "Full Name", "Employee", "Staff Member", "Worker", etc.)
  role (their job title — may be called "Job Title", "Position", "Title", "Role", etc.)
  department (their department or area — may be called "Department", "Team", "Area", "Section", etc.)
  status (employment status — must be exactly the string "active" or "inactive". Map "Active","Employed","Current" → "active"; "Inactive","Terminated","Former","Left" → "inactive")
  hireDate (start date in YYYY-MM-DD — may be called "Start Date", "Hire Date", "Employment Start", "Date Hired", "Joined", etc.)
  phone (cell or work phone — may be called "Phone", "Cell", "Mobile", "Contact Number", etc.)
  email (work email — may be called "Email", "Work Email", "E-mail", etc.)
  pestLicenseNum (pesticide license number — may be called "Pest. Cert #", "License #", "Cert Number", "Pesticide License", etc.)
  pestLicenseCategory (pesticide license category — may be called "Cert Category", "License Type", "Category", etc. Copy the full text value)
  pestLicenseExpiry (license expiry date in YYYY-MM-DD — may be called "Cert Expiry", "Expiry Date", "License Expires", etc.)
  certs (always set to empty array [])
  trainings (always set to empty array [])
  notes (any notes, comments, or additional info field)` },
  equipment:{ label:"Equipment Registry", icon:"🔧", key:"resinops_equipment",
    schema:`Each record must use these EXACT field names:
  name (equipment name or description — may be called "Asset Description", "Equipment Name", "Item", "Asset", etc.)
  cat (category or type — may be called "Category", "Type", "Category/Type", "Asset Type", etc.)
  make (manufacturer or brand — may be called "Brand", "Manufacturer", "Make", "Brand/Manufacturer", etc.)
  model (model number or name — may be called "Model", "Model Number", "Model #", etc.)
  serial (serial number — may be called "Serial", "Serial Number", "Serial #", "S/N", etc.)
  assetTag (internal asset tag or ID — may be called "Asset Tag", "Tag", "Asset ID", "Internal ID", etc.)
  location (where the equipment is located — may be called "Location", "Room", "Area", "Placed In", etc.)
  purchaseDate (date purchased in YYYY-MM-DD — may be called "Purchase Date", "Date Purchased", "Acquired", etc.)
  purchasePrice (cost in dollars as a number — may be called "Cost", "Price", "Purchase Price", "Cost (USD)", etc. Strip $ and commas)
  warrantyExpires (warranty expiry date in YYYY-MM-DD — may be called "Warranty Expiration", "Warranty Expires", "Warranty End", etc.)
  pmFreqDays (preventive maintenance interval as number of days — may be called "Service Interval", "PM Frequency", "Maintenance Interval". Convert "90 days" → 90, "quarterly" → 90, "annually" → 365, "monthly" → 30)
  status (default to "active" unless the source indicates otherwise)` },
  inventory:{ label:"Inventory Items", icon:"📦", key:"resinops_inventory",
    schema:`Each record must use these EXACT field names:
  n (the item name or description — may be called "Item", "Description", "Item Description", "Product", "Supply", "Item Name", etc.)
  cat (category — you MUST classify each item into exactly one of these categories based on what the item is:
    "Packaging" — jars, bags, mylar, labels, exit bags, containers, tubes, lids, boxes
    "Extraction Solvents" — butane, propane, ethanol, CO2, alcohol used in extraction
    "Extraction Consumables" — filter paper, filter discs, membranes, gaskets, winterization supplies
    "Post-Harvest Supplies" — trim bags, harvest bins, turkey bags, drying nets, bucking supplies
    "Pre-Roll Supplies" — cones, pre-roll tubes, filter tips, rolling papers, doob tubes
    "Vape Hardware" — cartridges, batteries, disposables, pods, coils, 510 hardware
    "Edible Ingredients" — distillate, isolate, food ingredients, MCT oil, gummies, cooking supplies
    "Lab Supplies" — compliance sample bags, swabs, petri dishes, testing supplies, scales
    "Nutrients & Amendments" — fertilizers, pH up, pH down, cal-mag, silica, microbes, compost teas
    "Growing Media" — coco coir, perlite, soil, rockwool, hydroton, peat, vermiculite
    "IPM Products" — pesticides, insecticides, fungicides, beneficials, neem oil, predatory insects
    "Cultivation Supplies" — pots, trays, stakes, trellis, net cups, irrigation parts, sensors
    "Cleaning & Sanitation" — isopropyl alcohol, bleach, hydrogen peroxide, cleaning agents, gloves, PPE
    "Other" — only use this if the item genuinely does not fit any category above
  )
  uom (unit of measure — must be one of: each, g, kg, lb, oz, gal, L, ml, case, sheet, ft, roll)
  stock (current quantity on hand as a number — may be called "Current Stock", "Qty", "On Hand", "Quantity", etc.)
  cost (unit cost in dollars as a plain number — may be called "Unit Cost", "Cost", "Price", "Cost/Unit", etc. Strip $ signs)
  reorderAt (reorder trigger quantity as a number — may be called "Reorder Point", "Reorder At", "Min Stock", "Low Stock Alert", etc.)
  reorderQty (order quantity as a number — may be called "Reorder Qty", "Order Quantity", "Reorder Amount", etc.)
  vm (valuation method — must be exactly "fifo", "average", or "last". Default to "average" if not specified)
  notes (any notes or comments field)` },
  vendors:{ label:"Vendors", icon:"🏭", key:"resinops_vendors",
    schema:`Each record must use these EXACT field names:
  n (vendor or company name — may be called "Vendor", "Company", "Supplier", "Business Name", etc.)
  vendorType (type of vendor — may be called "Type", "Category", "Vendor Type", "Supplier Type", etc.)
  contact (primary contact person name — may be called "Contact", "Contact Name", "Rep", "Sales Rep", etc.)
  phone (phone number)
  email (email address)
  leadDays (lead time in days as a number — may be called "Lead Time", "Lead Days", "Delivery Time", etc.)
  notes (any notes field)` },
  strains:{ label:"Strain Database", icon:"🧬", key:"resinops_strains",
    schema:`Each record must use these EXACT field names:
  name (strain or cultivar name — may be called "Strain", "Cultivar", "Cultivar Name", "Variety", etc.)
  type (indica/sativa/hybrid — may be called "Type", "Strain Type", "Classification". Normalize to "Indica", "Sativa", "Hybrid", or "Indica-dominant"/"Sativa-dominant")
  parentage (genetic cross or lineage — may be called "Genetics", "Lineage", "Cross", "Genetic Cross", "Parents", etc.)
  breeder (who bred the strain — may be called "Breeder", "Seed Company", "Source", "Original Breeder", etc.)
  thcaAvg (average THCa % as a number — may be called "Avg THCa", "THCa %", "THCa Average", etc. Strip % sign)
  thcAvg (average THC % as a number)
  cbdAvg (average CBD % as a number)
  terpsAvg (average total terpenes % as a number — may be called "Avg Total Terpenes", "Terpenes %", etc.)
  dominantTerpenes (top terpenes as comma-separated text — may be called "Dominant Terpenes", "Top Terps", "Primary Terpenes", etc.)
  avgYieldGPerSqft (average yield in grams per square foot as a number — may be called "Avg Yield", "Yield g/sqft", "Yield per sqft", etc.)
  avgFlowerWeeks (flower time in weeks as a number — may be called "Flower Time", "Flower Weeks", "Days to Harvest". Convert days to weeks)
  aroma (aroma description text — may be called "Aroma", "Smell", "Nose", "Aroma Notes", etc.)
  flavor (flavor description text — may be called "Flavor", "Taste", "Flavor Profile", etc.)
  effectProfile (effects description — may be called "Effects", "Effect", "Effect Description", "High Profile", etc.)
  notes (any internal notes or comments)` },
  spaces:{ label:"Grow Spaces / Rooms", icon:"🗺️", key:"resinops_grow_map",
    schema:`Each record must use these EXACT field names:
  name (room or space name — may be called "Room", "Space", "Area", "Room Name", "Grow Room", etc.)
  type (type of space — may be called "Type", "Room Type", "Environment". Common values: indoor, greenhouse, mixed-light, outdoor, veg, clone, dry, processing)
  sqft (total square footage as a number)
  canopy (canopy square footage as a number — may differ from total sqft)
  maxPlants (maximum plant count as a number)
  lightType (lighting type — LED, HPS, CMH, Mixed-light, Natural, etc.)
  lightCount (number of lights as a number)
  lightWatts (watts per light as a number)
  status (default "active")` },
  harvest_batches:{ label:"Harvest Batches", icon:"🌿", key:"resinops_harvest_batches",
    schema:`Each record must use these EXACT field names:
  id (batch ID — may be called "Batch ID", "Lot ID", "Harvest ID", etc. Preserve the original value exactly)
  strainName (strain name — may be called "Strain Name", "Strain", "Cultivar", etc.)
  spaceName (harvest room or grow space — may be called "Harvest Room", "Grow Space", "Room", "Space", etc.)
  d (harvest date in YYYY-MM-DD — may be called "Harvest Date", "Date", etc.)
  wetWeightG (wet weight in GRAMS as a number — if source is in lbs multiply by 453.592. May be called "Wet Weight lbs", "Wet Weight", "Wet Weight g", etc.)
  totalDryWeight (total dry weight in GRAMS as a number — if source is in lbs multiply by 453.592. May be called "Dry Weight lbs", "Dry Weight", "Final Dry Weight", etc.)
  status (must be exactly "done" or "open" — map "complete", "completed", "finished", "cured" → "done"; "drying", "curing", "in progress", "open" → "open")
  coaSampleId (lab sample ID — may be called "COA Sample ID", "Sample ID", "Lab Sample #", etc.)
  labName (testing lab name — may be called "Lab Name", "Lab", "Testing Lab", etc.)
  thca (THCa percentage as a plain number — may be called "THCa %", "THCa", "THCa Avg", etc. Strip % sign)
  plants (plant count as a number — may be called "Plant Count", "Plants", "# Plants", etc.)
  grade_a (Grade A flower weight in grams as a number — may be called "Grade A (g)", "Grade A", "A Grade", etc.)
  grade_b (Grade B flower weight in grams — may be called "Grade B (g)", "Grade B", "B Grade", etc.)
  grade_c (Grade C flower weight in grams — may be called "Grade C (g)", "Grade C", "C Grade", etc.)
  trim (Trim weight in grams — may be called "Trim (g)", "Trim", "Trim Weight", etc.)
  waste (Waste weight in grams — may be called "Waste (g)", "Waste", "Waste Weight", etc.)
  notes (any notes field)` },
  qc_tests:{ label:"QC / Lab Test Results (COA)", icon:"🔬", key:"resinops_qc_tests",
    schema:"See COA-specific instructions in the system prompt." },
  cult_inputs:{ label:"Cultivation Inputs (Nutrients)", icon:"🌱", key:"resinops_cult_inputs",
    schema:`Each record must use these EXACT field names:
  spaceName (grow space or room name — may be called "Grow Space", "Room", "Space", "Area", etc.)
  date (application date in YYYY-MM-DD — may be called "Date", "Application Date", etc.)
  type (CRITICAL: must be exactly one of these values based on what the product is:
    "nutrient" — for fertilizers, nutrients, plant food, tonics, boosters (e.g. Athena Grow, CalMag, PK, Vitamax)
    "amendment" — for soil amendments, compost, worm castings, microbes added to media
    "beneficial" — for beneficial insects, predatory mites, nematodes
    "flush" — for plain water flush or enzyme flush
    "other" — only if none of the above fit
    DO NOT use "ipm_spray", "pesticide", or "fungicide" — those belong in the Pesticide Spray Log, not here)
  product (product name)
  manufacturer (brand or maker)
  rate (application rate as a number — extract just the number)
  rateUnit (rate unit e.g. "ml/L", "oz/gal", "tsp/gal", "g/plant")
  volumeApplied (total volume as a number)
  volumeUnit (volume unit — "gal", "L", "ml")
  areaApplied (area in sq ft as a number)
  costPerUnit (cost per unit as a number — strip $ signs)
  totalCost (total cost as a number — strip $ signs)
  notes (any notes field)` },
  sales_orders:{ label:"Sales & Pre-Orders", icon:"🧾", key:"resinops_orders",
    schema:`Each record must use these EXACT field names:
  dispensaryName (dispensary or account name — may be called "Dispensary Name", "Account", "Customer", "Buyer", etc.)
  licenseNum (dispensary license number — may be called "License Number", "License #", "OCM License", etc.)
  orderDate (order date in YYYY-MM-DD — may be called "Order Date", "Date", "Placed Date", etc.)
  deliveryDate (requested delivery date in YYYY-MM-DD — may be called "Requested Delivery", "Delivery Date", "Ship Date", etc.)
  product (product name — may be called "Product", "Item", "SKU", "Product Name", etc.)
  strain (strain name — may be called "Strain", "Cultivar", "Variety", etc.)
  units (number of units ordered as a number — may be called "Units Ordered", "Quantity", "Qty", "Units", etc.)
  unitPrice (price per unit as a number — strip $ signs. May be called "Unit Price", "Price", "Price Per Unit", etc.)
  orderTotal (total order value as a number — strip $ signs. May be called "Order Total", "Total", "Amount", etc.)
  status (must be exactly one of: "confirmed", "pending", "waitlist" — map "Confirmed" → "confirmed", "Pending" → "pending", "Waitlisted"/"Waitlist" → "waitlist")
  notes (any notes field)` },
  spray_log:{ label:"Pesticide Spray Log (NY DEC)", icon:"🛡️", key:"resinops_spray_log",
    schema:`Each record must use these EXACT field names (NY DEC compliant pesticide application log):
  date (application date in YYYY-MM-DD — may be called "Application Date", "Date", "Spray Date", etc.)
  spaceName (grow space or room — may be called "Grow Space / Room", "Room", "Space", "Area Treated", etc.)
  type (default to "ipm_spray" unless clearly a fungicide → "fungicide", insecticide → "insecticide", herbicide → "herbicide")
  product (product/pesticide name — may be called "Product / Pesticide Name", "Pesticide", "Product", "Chemical", etc.)
  manufacturer (brand/manufacturer — may be called "Manufacturer", "Brand", etc.)
  epaRegNum (EPA registration number — may be called "EPA Registration Number", "EPA Reg #", "EPA#", "Reg #", etc.)
  rate (label rate as a number — extract just the numeric value from fields like "2 oz/gal")
  rateUnit (rate unit — extract the unit portion e.g. "oz/gal", "ml/L", "lb/acre")
  volumeApplied (amount mixed/applied as a number — may be called "Amount Mixed (gallons)", "Amount Mixed", "Volume Applied", etc.)
  volumeUnit (volume unit, default "gal")
  areaApplied (area treated as a number in sq ft — may be called "Area Treated (sq ft)", "Area Treated", "Area", etc.)
  applicationMethod (how applied — may be called "Application Equipment", "Method", "Equipment Used", etc.)
  targetPest (target pest or disease — may be called "Target Pest / Disease", "Target Pest", "Pest", etc.)
  weatherTemp (temperature as a number — may be called "Temp at Application (F)", "Temp", "Temperature (F)", etc.)
  weatherWind (wind speed as a number — may be called "Wind Speed (mph)", "Wind Speed", "Wind", etc.)
  weatherHumidity (relative humidity as a number — may be called "Relative Humidity (%)", "RH", "Humidity", etc.)
  rei (re-entry interval in hours as a number — may be called "Re-Entry Interval (hrs)", "REI", etc.)
  phi (pre-harvest interval in days as a number — may be called "Pre-Harvest Interval (days)", "PHI", etc.)
  applicatorName (licensed applicator full name — may be called "Licensed Applicator", "Applicator", "Applied By", etc.)
  applicatorLicenseNum (pesticide license number — may be called "Pesticide License #", "License #", "Cert #", etc.)
  notes (any notes field)` },
};

async function callClaude(prompt, isCOA=false, fieldSchema=""){
  const mappingRule = fieldSchema ? `
CRITICAL FIELD MAPPING RULE:
You MUST rename every field in every record to use the exact target field names listed below.
Do NOT use the source column names as keys. Do NOT preserve original column headers.
The source column names are different from the target field names — your job is to translate between them.

Example of CORRECT behavior:
  Source row: {"Full Name": "Jane Smith", "Employment Start": "2022-01-15", "Status": "Active"}
  Target fields include: name, hireDate, status
  Correct output record: {"name": "Jane Smith", "hireDate": "2022-01-15", "status": "active"}

Example of WRONG behavior (do not do this):
  Wrong output record: {"Full Name": "Jane Smith", "Employment Start": "2022-01-15", "Status": "Active"}

TARGET FIELD NAMES AND WHAT THEY MAP FROM:
${fieldSchema}` : "";

  const coaInstructions = isCOA ? `
CRITICAL: For COA PDFs, output records using these EXACT field names (not the lab's column headers):
  strainName → product/strain name on the COA
  sampleId → lab sample ID or lot number
  labName → testing laboratory name
  submittedDate → date submitted (YYYY-MM-DD)
  receivedDate → report date / results issued (YYYY-MM-DD)
  thca → THCa % as plain number (21.4 not "21.4%")
  thc → Delta-9 THC % as plain number
  cbda → CBDa % as plain number
  cbd → CBD % as plain number
  cbg → CBG % as plain number
  cbn → CBN % as plain number
  thcv → THCv % as plain number
  cbc → CBC % as plain number
  totalCannabinoids → Total Cannabinoids % as plain number
  totalTerpenes → Total Terpenes % as plain number
  myrcene → Myrcene % as plain number
  limonene → Limonene % as plain number
  caryophyllene → Beta-Caryophyllene % as plain number
  linalool → Linalool % as plain number
  pinene → Alpha-Pinene % as plain number
  ocimene → Ocimene % as plain number
  terpinolene → Terpinolene % as plain number
  humulene → Humulene % as plain number
  tyam → Total Yeast & Mold CFU/g as plain number
  tab → Total Aerobic Bacteria CFU/g as plain number
  aspergillus → boolean true=pass false=fail
  salmonella → boolean true=pass false=fail
  stec → boolean true=pass false=fail
  ecoli → boolean true=pass false=fail
  microbialPass → boolean true=pass false=fail
  pesticidesPass → boolean true=pass false=fail
  heavyMetalsPass → boolean true=pass false=fail
  waterActivity → Aw value as plain number (0.562)
  moistureContent → moisture % as plain number
  foreignMatterPass → boolean true=pass false=fail
  overallPass → true if ALL panels passed, false if ANY failed` : "";

  const system = `You are a data import assistant for ResinOps, a cannabis operations platform.
Return ONLY valid JSON with no markdown, no backticks, no explanation.
Always return exactly: { "detectedType": "employees|equipment|inventory|vendors|strains|spaces|qc_tests|cult_inputs|spray_log|harvest_batches|sales_orders|unknown", "confidence": 0-100, "summary": "one line", "records": [...] }
${mappingRule}
${coaInstructions}`;

  const resp = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, prompt }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Server error " + resp.status);
  }
  const data = await resp.json();
  const text = data.content?.map(b => b.text || "").join("").trim();
  return JSON.parse(text);
}

const CSS=`
  @keyframes dm-progress{0%{transform:translateX(-100%)}50%{transform:translateX(100%)}100%{transform:translateX(-100%)}}
  .dm-wrap{padding:24px;flex:1;overflow-y:auto;}
  .dm-tabs{display:flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:3px;margin-bottom:18px;}
  .dm-tab{flex:1;padding:7px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;}
  .dm-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.15);}
  .dm-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:20px;margin-bottom:16px;}
  .dm-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .dm-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:8px 16px;}
  .dm-btn:hover{opacity:0.85;}
  .dm-primary{background:var(--accent);color:#fff;}
  .dm-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .dm-danger{background:rgba(200,74,74,0.85);color:#fff;}
  .dm-ai{background:linear-gradient(135deg,#5a3fa0,#2d5a8a);color:#fff;}
  .dm-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .dm-drop{border:2px dashed var(--border-2);border-radius:12px;padding:40px 24px;text-align:center;cursor:pointer;transition:border-color 0.15s;}
  .dm-drop:hover,.dm-drop.over{border-color:var(--accent);background:rgba(74,124,89,0.04);}
  .dm-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .dm-tbl th{text-align:left;padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .dm-tbl td{padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-2);}
  .dm-tbl tr:last-child td{border-bottom:none;}
  .dm-step{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;margin-bottom:8px;}
  .dm-step-done{background:rgba(74,124,89,0.1);border:1px solid rgba(74,124,89,0.3);}
  .dm-step-active{background:rgba(90,60,160,0.1);border:1px solid rgba(90,60,160,0.3);}
  .dm-step-wait{background:var(--surface-2);border:1px solid var(--border);}
  .dm-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;}
  .conf-high{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .conf-mid{background:rgba(200,150,58,0.15);color:var(--amber);}
  .conf-low{background:rgba(200,74,74,0.15);color:var(--danger);}
`;

export default function DataManager(){
  const [tab,setTab]=useState("import");
  const [dragOver,setDragOver]=useState(false);
  const [importHistory, setImportHistory] = useState(()=>{
    try{ return JSON.parse(localStorage.getItem("resinops_import_history")||"[]"); }catch{ return []; }
  });
  const [importState,setImportState]=useState("idle"); // idle|reading|analyzing|preview|coamatch|done|error
  const [importResult,setImportResult]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [importTarget,setImportTarget]=useState("");
  const [coaBatchLinks,setCoaBatchLinks]=useState({}); // sampleId -> harvestBatchId
  const [restoreConfirm,setRestoreConfirm]=useState(false);
  const [statusMsg,setStatusMsg]=useState("");
  const fileRef=useRef();
  const restoreRef=useRef();

  // ── Backup ───────────────────────────────────────────────────────────────
  function backup(){
    const settings=JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}");
    const facilityName=settings.facilityName||"ResinOps";
    const data={};
    ALL_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v) data[k]=v; });
    const payload=JSON.stringify({version:"1.0",exported:new Date().toISOString(),facility:facilityName,data},null,2);
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([payload],{type:"application/json"}));
    a.download=facilityName.replace(/\s+/g,"_")+"_ResinOps_Backup_"+new Date().toISOString().slice(0,10)+".json";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setStatusMsg("Backup downloaded ✓");
    setTimeout(()=>setStatusMsg(""),3000);
  }

  function restoreFromFile(file){
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const payload=JSON.parse(ev.target.result);
        if(!payload.data) throw new Error("Invalid backup file format");
        Object.entries(payload.data).forEach(([k,v])=>{ if(ALL_KEYS.includes(k)) localStorage.setItem(k,v); });
        setStatusMsg("Restore complete — "+Object.keys(payload.data).length+" data keys restored ✓");
        setRestoreConfirm(false);
        setTimeout(()=>{ setStatusMsg(""); window.location.reload(); },1500);
      }catch(e){ setStatusMsg("Restore failed: "+e.message); }
    };
    reader.readAsText(file);
  }

  // ── Storage stats ─────────────────────────────────────────────────────────
  function getStats(){
    let totalBytes=0;
    const keys=[];
    ALL_KEYS.forEach(k=>{
      const v=localStorage.getItem(k);
      if(v){ const b=new Blob([v]).size; totalBytes+=b; try{ const p=JSON.parse(v); keys.push({k,count:Array.isArray(p)?p.length:1,size:b}); }catch{} }
    });
    return{totalBytes,keys:keys.filter(x=>x.count>0).sort((a,b)=>b.count-a.count)};
  }
  const stats=getStats();

  // ── AI Import ─────────────────────────────────────────────────────────────
  async function processFile(file){
    setImportState("reading");
    setImportErr("");
    setImportResult(null);

    try{
      let content="";
      const ext=file.name.split(".").pop().toLowerCase();

      if(ext==="csv"||ext==="tsv"){
        content=await file.text();
        // Send first 200 rows max
        const lines=content.split("\n");
        content=lines.slice(0,201).join("\n");
      }
      else if(ext==="json"){
        content=await file.text();
        content=content.slice(0,30000);
      }
      else if(ext==="xlsx"||ext==="xls"){
        setImportErr("For Excel files, please open the file and use File → Save As → CSV (.csv), then upload the CSV here. CSV imports work perfectly and avoid browser compatibility issues with Excel's binary format.");
        setImportState("error");
        return;
      }
      else if(ext==="docx"){
        // DOCX: ask user to save as PDF or copy-paste text instead
        // (mammoth native deps are not compatible with all build environments)
        setImportErr("For Word documents (.docx), please save a copy as PDF, then upload the PDF — or copy and paste the text content into a .txt file and upload that instead. CSV and Excel exports work directly.");
        setImportState("error");
        return;
      }
      else if(ext==="pdf"){
        // Extract text via pdfjs loaded from CDN
        if(!window.pdfjsLib){
          const script=document.createElement("script");
          script.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          await new Promise((res,rej)=>{ script.onload=res; script.onerror=rej; document.head.appendChild(script); });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const buf=await file.arrayBuffer();
        const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
        const pages=Math.min(pdf.numPages,15);
        let text="PDF DOCUMENT ("+pdf.numPages+" pages):\n";
        for(let i=1;i<=pages;i++){
          const page=await pdf.getPage(i);
          const tc=await page.getTextContent();
          text+=tc.items.map(it=>it.str).join(" ")+"\n";
        }
        content=text.slice(0,25000);
      }
      else{
        content=await file.text();
        content=content.slice(0,20000);
      }

      setImportState("analyzing");
      const detectedTarget=importTarget||"";
      const targetInfo=IMPORT_TARGETS[detectedTarget];
      const prompt=`File name: "${file.name}"
${targetInfo
  ? `Target module: ${targetInfo.label}

FIELD MAPPING INSTRUCTIONS — map the source columns to these exact field names:
${targetInfo.schema}

Your job is to read every row and map each source column to the correct target field name above, regardless of what the source calls it. Use context and meaning to map — do not require exact column name matches.`
  : `Auto-detect which ResinOps module this data belongs to. Use these definitive rules in order:
1. If the file has columns for EPA Registration Number AND Re-Entry Interval AND Licensed Applicator → classify as spray_log (pesticide applications)
2. If the file has columns for Input Type AND products that are nutrients/amendments/beneficials (NO EPA reg numbers) → classify as cult_inputs
3. If the file has columns for Dispensary Name AND Order Total AND Order Date → classify as sales_orders
4. If the file has columns for Batch ID AND Harvest Date AND Wet Weight → classify as harvest_batches
5. If the file has columns for Sample ID AND THCa % AND lab panel results (Pass/Fail) → classify as qc_tests
6. Otherwise use: employees|equipment|inventory|vendors|strains|spaces|unknown`}

File contents:
---
${content}
---

Return every row as a record. Do not skip rows. Map all columns you can identify — leave out columns that have no clear match.`;

      const isCOA = (importTarget==="qc_tests") || (!importTarget && ext==="pdf");
      const fieldSchema = !isCOA && targetInfo ? targetInfo.schema : "";
      const result=await callClaude(prompt, isCOA, fieldSchema);
      setImportResult({...result,fileName:file.name,fileType:ext,isCOA:isCOA||result.detectedType==="qc_tests"});
      setImportState("preview");
    }catch(e){
      console.error(e);
      setImportErr("Import failed: "+e.message);
      setImportState("error");
    }
  }

  function normalizeQCRecord(r){
    // Normalize boolean pass/fail fields — Claude may return strings "true"/"false"/"pass"/"fail"
    const toBool=(v)=>{
      if(v===true||v===false) return v;
      if(typeof v==="string"){
        const l=v.toLowerCase().trim();
        if(l==="true"||l==="pass"||l==="yes") return true;
        if(l==="false"||l==="fail"||l==="no") return false;
      }
      return null;
    };
    // Normalize numeric fields — strip % signs and convert to number strings
    const toNum=(v)=>{
      if(v===undefined||v===null||v==="") return "";
      const n=parseFloat(String(v).replace(/%/g,""));
      return isNaN(n)?"":String(n);
    };
    const norm={
      ...r,
      // Identity fields — catch all variants Claude might return
      batchId: r.batchId||r.batch_id||"",
      batchName: r.batchName||r.batch_name||r.strainName||r.strain_name||r.sample_name||r["Sample Name"]||"",
      batchType: r.batchType||r.batch_type||"harvest",
      strainName: r.strainName||r.strain_name||r.sample_name||r["Sample Name"]||r["Strain"]||"",
      sampleId: r.sampleId||r.sample_id||r["Sample ID"]||r["Lab Sample ID"]||r["Lab ID"]||"",
      labName: r.labName||r.lab_name||r["Lab Name"]||r["Laboratory"]||"",
      submittedDate: r.submittedDate||r.submitted_date||r.date_submitted||r["Date Submitted"]||"",
      receivedDate: r.receivedDate||r.received_date||r.date_reported||r.date_received||r["Date Reported"]||r["Date Received"]||"",
      status: r.receivedDate||r.received_date||r.date_reported?"complete":r.submittedDate||r.submitted_date||r.date_submitted?"submitted":"pending",
      source:"coa_import",
      // Normalize cannabinoids — catch both snake_case and CSV column names
      thca:toNum(r.thca||r["THCa %"]||r["THCa"]),
      thc:toNum(r.thc||r.delta_9_thc||r["Delta-9 THC %"]||r["Delta-9 THC"]||r["THC %"]||r["THC"]),
      cbda:toNum(r.cbda||r["CBDa %"]||r["CBDa"]),
      cbd:toNum(r.cbd||r["CBD %"]||r["CBD"]),
      cbg:toNum(r.cbg||r["CBG %"]||r["CBG"]),
      cbn:toNum(r.cbn||r["CBN %"]||r["CBN"]),
      thcv:toNum(r.thcv||r["THCv %"]||r["THCv"]),
      cbc:toNum(r.cbc||r["CBC %"]||r["CBC"]),
      totalCannabinoids:toNum(r.totalCannabinoids||r.total_cannabinoids||r["Total Cannabinoids %"]||r["Total Cannabinoids"]),
      // Normalize terpenes
      totalTerpenes:toNum(r.totalTerpenes||r.total_terpenes||r["Total Terpenes %"]||r["Total Terpenes"]),
      myrcene:toNum(r.myrcene||r.beta_myrcene||r["beta-Myrcene %"]||r["beta-Myrcene"]||r["Myrcene %"]),
      limonene:toNum(r.limonene||r["Limonene %"]||r["Limonene"]),
      caryophyllene:toNum(r.caryophyllene||r.beta_caryophyllene||r["beta-Caryophyllene %"]||r["beta-Caryophyllene"]||r["Caryophyllene %"]),
      linalool:toNum(r.linalool||r["Linalool %"]||r["Linalool"]),
      pinene:toNum(r.pinene||r.alpha_pinene||r["alpha-Pinene %"]||r["alpha-Pinene"]||r["Pinene %"]),
      ocimene:toNum(r.ocimene||r["Ocimene %"]||r["Ocimene"]),
      terpinolene:toNum(r.terpinolene||r["Terpinolene %"]||r["Terpinolene"]),
      humulene:toNum(r.humulene||r.alpha_humulene||r["Humulene %"]||r["Humulene"]),
      bisabolol:toNum(r.bisabolol||r.alpha_bisabolol||r["alpha-Bisabolol %"]||r["Bisabolol %"]),
      valencene:toNum(r.valencene||r["Valencene %"]||r["Valencene"]),
      // Microbial
      tyam:toNum(r.tyam||r.total_yeast_and_mold||r["Total Yeast and Mold CFU/g"]||r["TYAM"]),
      tab:toNum(r.tab||r.total_aerobic_count||r.total_aerobic_bacteria||r["Total Aerobic Count CFU/g"]||r["TAC"]),
      waterActivity:toNum(r.waterActivity||r.water_activity||r["Water Activity Aw"]||r["Water Activity"]),
      moistureContent:toNum(r.moistureContent||r.moisture_content||r["Moisture Content %"]||r["Moisture Content"]),
      // Pass/fail panels
      aspergillus:toBool(r.aspergillus||r["Aspergillus Panel"]),
      salmonella:toBool(r.salmonella||r["Salmonella"]),
      stec:toBool(r.stec||r.stec_e_coli||r["STEC E coli"]||r["STEC"]),
      ecoli:toBool(r.ecoli||r["E. coli"]),
      microbialPass:toBool(r.microbialPass||r.microbial_pass),
      pesticidesPass:toBool(r.pesticidesPass||r.pesticides_pass||r["Pesticide Residues"]),
      heavyMetalsPass:toBool(r.heavyMetalsPass||r.heavy_metals_pass||r["Heavy Metals"]),
      foreignMatterPass:toBool(r.foreignMatterPass||r.foreign_matter_pass||r["Foreign Matter"]),
    };
    // Derive overallPass if not explicitly set
    if(norm.overallPass===undefined||norm.overallPass===null){
      const bools=[norm.microbialPass,norm.pesticidesPass,norm.heavyMetalsPass,norm.foreignMatterPass,norm.aspergillus,norm.salmonella,norm.stec,norm.ecoli].filter(v=>v!==null);
      if(bools.some(v=>v===false)) norm.overallPass=false;
      else if(bools.length>0&&bools.every(v=>v===true)) norm.overallPass=true;
      else norm.overallPass=toBool(r.overallPass);
    } else {
      norm.overallPass=toBool(r.overallPass);
    }
    return norm;
  }

  function confirmImport(batchLinks={}){
    if(!importResult?.records?.length) return;
    const target=importTarget||importResult.detectedType;
    const tgt=IMPORT_TARGETS[target];
    if(!tgt){ setImportErr("Cannot identify where to save this data. Please select a data type above and re-analyze."); return; }
    try{
      const existing=JSON.parse(localStorage.getItem(tgt.key)||"[]");
      const rawRecords=importResult.records.map(r=>({
        ...r,
        id:r.id||"imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7)
      }));
      // ── Normalize records based on target type ──────────────────────────
      let newRecords;
      if(target==="qc_tests"){
        newRecords = rawRecords.map((r,i)=>{
          const linkedId=batchLinks[r.sampleId||i]||"";
          const hb=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
          const linkedBatch=linkedId?hb.find(b=>String(b.id)===String(linkedId)):null;
          return normalizeQCRecord({...r,batchId:linkedId||"",batchName:linkedBatch?(linkedBatch.strainName+(linkedBatch.d?" ("+new Date(linkedBatch.d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+")":"")):"",});
        });
      } else if(target==="employees"){
        newRecords = rawRecords.map(r=>({...r,id:r.id||"emp_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),name:r.name||r.full_name||r["Full Name"]||r["Employee Name"]||"",role:r.role||r.job_title||r["Job Title"]||r["Title"]||r["Position"]||"Other",department:r.department||r["Department / Area"]||r["Department"]||r["Area"]||"Other",status:["active","inactive"].includes((r.status||"").toLowerCase())?(r.status||"").toLowerCase():"active",hireDate:r.hireDate||r.employment_start||r["Employment Start"]||r["Start Date"]||r["Hire Date"]||"",phone:r.phone||r.cell_phone||r["Cell Phone"]||r["Phone"]||"",email:r.email||r.work_email||r["Work Email"]||r["Email"]||"",pestLicenseNum:r.pestLicenseNum||r.pesticide_cert_number||r.cert_number||r["Pesticide Cert #"]||r["License #"]||"",pestLicenseCategory:r.pestLicenseCategory||r.pesticide_cert_category||r.cert_category||r["Cert Category"]||r["License Type"]||"",pestLicenseExpiry:r.pestLicenseExpiry||r.pesticide_cert_expiry||r.cert_expiry_date||r["Cert Expiry Date"]||r["License Expires"]||"",certs:Array.isArray(r.certs)?r.certs:[],trainings:Array.isArray(r.trainings)?r.trainings:[],notes:r.notes||r["Notes"]||"",}));
      } else if(target==="equipment"){
        newRecords = rawRecords.map(r=>{
          const rawCat=r.cat||r.category||r.category_type||r["Category"]||r["Category/Type"]||r["Type"]||"";
          const EQL=["Extraction","Trimming & Bucking","Drying & Curing","Pre-Roll & Packaging","HVAC & Dehumidification","Fertigation & Irrigation","Lighting","Lab & Testing Instruments","Vehicles & Material Handling","Facility Systems","Other"];
          const ECM={"extraction":"Extraction","co2":"Extraction","bho":"Extraction","ethanol":"Extraction","trim":"Trimming & Bucking","bucking":"Trimming & Bucking","dry":"Drying & Curing","cure":"Drying & Curing","pre-roll":"Pre-Roll & Packaging","packaging":"Pre-Roll & Packaging","hvac":"HVAC & Dehumidification","dehumid":"HVAC & Dehumidification","climate":"HVAC & Dehumidification","fertigation":"Fertigation & Irrigation","irrigation":"Fertigation & Irrigation","light":"Lighting","lighting":"Lighting","lab":"Lab & Testing Instruments","testing":"Lab & Testing Instruments","scale":"Lab & Testing Instruments","vehicle":"Vehicles & Material Handling","forklift":"Vehicles & Material Handling","facility":"Facility Systems","electrical":"Facility Systems","generator":"Facility Systems"};
          let cat=EQL.includes(rawCat)?rawCat:null;
          if(!cat){const l=rawCat.toLowerCase();for(const [k,v] of Object.entries(ECM)){if(l.includes(k)){cat=v;break;}}}
          if(!cat)cat="Other";
          const pmRaw=r.pmFreqDays||r.pm_freq_days||r.service_interval||r["Service Interval"]||"90";
          const pmDays=typeof pmRaw==="string"?(pmRaw.toLowerCase().includes("annual")||pmRaw.includes("365")?"365":pmRaw.toLowerCase().includes("month")||pmRaw.includes("30")?"30":pmRaw.toLowerCase().includes("semi")||pmRaw.includes("180")?"180":parseInt(pmRaw)||"90"):pmRaw;
          return {...r,id:r.id||"eq_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),name:r.name||r.asset_description||r.equipment_name||r["Asset Description"]||r["Equipment Name"]||r["Item"]||"",cat,make:r.make||r.brand||r.manufacturer||r.brand_manufacturer||r["Brand"]||r["Manufacturer"]||r["Brand / Manufacturer"]||"",model:r.model||r.model_number||r["Model Number"]||r["Model"]||"",serial:r.serial||r.serial_number||r["Serial Number"]||r["Serial"]||"",assetTag:r.assetTag||r.asset_tag||r["Asset Tag"]||"",location:r.location||r.room_location||r["Room / Location"]||r["Location"]||"",purchaseDate:r.purchaseDate||r.purchase_date||r["Purchase Date"]||"",purchasePrice:String(r.purchasePrice||r.purchase_price||r.cost||r["Cost (USD)"]||r["Cost"]||"").replace(/[$,]/g,""),warrantyExpires:r.warrantyExpires||r.warranty_expiration||r.warranty_expires||r["Warranty Expiration"]||"",pmFreqDays:String(pmDays),lastServiceDate:r.lastServiceDate||r.last_service||r.last_service_date||r["Last Service"]||"",status:"active",notes:r.notes||r["Notes"]||"",};
        });
      } else if(target==="strains"){
        newRecords = rawRecords.map(r=>({...r,id:r.id||"str_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),name:r.name||r.cultivar_name||r.strain_name||r.strain||r["Cultivar Name"]||r["Strain Name"]||r["Strain"]||"",type:r.type||r.strain_type||r["Strain Type"]||r["Type"]||"Hybrid",parentage:r.parentage||r.genetic_cross||r.genetic_cross_lineage||r.lineage||r["Genetic Cross / Lineage"]||r["Lineage"]||r["Genetics"]||"",breeder:r.breeder||r.original_breeder||r["Original Breeder"]||r["Breeder"]||r["Seed Company"]||"",thcaAvg:r.thcaAvg||r.avg_thca||r.avg_thca_pct||r.thca_avg||r["Avg THCa %"]||r["Avg THCa"]||"",thcAvg:r.thcAvg||r.avg_thc||r.avg_thc_pct||r["Avg THC %"]||r["Avg THC"]||"",cbdAvg:r.cbdAvg||r.avg_cbd||r.avg_cbd_pct||r["Avg CBD %"]||r["Avg CBD"]||"",terpsAvg:r.terpsAvg||r.avg_total_terpenes||r.avg_terpenes||r.avg_total_terpenes_pct||r["Avg Total Terpenes %"]||r["Avg Total Terpenes"]||"",dominantTerpenes:r.dominantTerpenes||r.dominant_terpenes||r["Dominant Terpenes"]||r["Top Terpenes"]||"",avgYieldGPerSqft:r.avgYieldGPerSqft||r.avg_yield||r.avg_yield_g_sqft||r["Avg Yield (g/sqft canopy)"]||r["Avg Yield"]||"",avgFlowerWeeks:r.avgFlowerWeeks||r.flower_time_weeks||r.flower_time||r.flower_weeks||r["Flower Time (weeks)"]||r["Flower Weeks"]||"",avgVegWeeks:r.avgVegWeeks||r.veg_time_weeks||r.veg_time||r["Veg Time (weeks)"]||r["Veg Weeks"]||"",aroma:r.aroma||r.aroma_notes||r["Aroma Notes"]||r["Aroma"]||"",flavor:r.flavor||r.flavor_profile||r["Flavor Profile"]||r["Flavor"]||"",effectProfile:r.effectProfile||r.effect_description||r.effects||r["Effect Description"]||r["Effects"]||"",notes:r.notes||r.internal_notes||r["Internal Notes"]||r["Notes"]||"",status:r.status||"active",salesDescription:r.salesDescription||r.sales_description||r["Sales Description"]||"",}));
      } else if(target==="spray_log"){
        newRecords = rawRecords.map(r=>({...r,
          id: r.id||"sl_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
          type: r.type||"ipm_spray",
          date: r.date||r.application_date||r["Application Date"]||"",
          spaceName: r.spaceName||r.space_name||r.grow_space_room||r.grow_space||r["Grow Space / Room"]||r["Grow Space"]||r["Room"]||r["Space"]||"",
          product: r.product||r.product_pesticide_name||r.pesticide_name||r["Product / Pesticide Name"]||r["Product"]||r["Pesticide Name"]||"",
          manufacturer: r.manufacturer||r["Manufacturer"]||"",
          epaRegNum: r.epaRegNum||r.epa_registration_number||r.epa_reg_number||r["EPA Registration Number"]||r["EPA Reg #"]||r["EPA #"]||"",
          rate: String(r.rate||r.label_rate||r["Label Rate"]||"").split(" ")[0]||"",
          rateUnit: r.rateUnit||r.rate_unit||(String(r.label_rate||r["Label Rate"]||"").split(" ").slice(1).join(" "))||"oz/gal",
          volumeApplied: String(r.volumeApplied||r.amount_mixed||r.amount_mixed_gallons||r["Amount Mixed (gallons)"]||r["Amount Mixed"]||""),
          volumeUnit: r.volumeUnit||"gal",
          areaApplied: String(r.areaApplied||r.area_treated||r.area_treated_sq_ft||r["Area Treated (sq ft)"]||r["Area Treated"]||r["Area Sq Ft"]||""),
          applicationMethod: r.applicationMethod||r.application_equipment||r["Application Equipment"]||r["Application Method"]||"Backpack sprayer",
          targetPest: r.targetPest||r.target_pest||r.target_pest_disease||r["Target Pest / Disease"]||r["Target Pest"]||r["Pest"]||"",
          weatherTemp: String(r.weatherTemp||r.temp_at_application||r.temp||r["Temp at Application (F)"]||r["Temp"]||r["Temperature"]||""),
          weatherWind: String(r.weatherWind||r.wind_speed||r["Wind Speed (mph)"]||r["Wind Speed"]||r["Wind"]||""),
          weatherHumidity: String(r.weatherHumidity||r.relative_humidity||r["Relative Humidity (%)"]||r["RH"]||r["Humidity"]||""),
          rei: String(r.rei||r.re_entry_interval||r["Re-Entry Interval (hrs)"]||r["REI"]||""),
          phi: String(r.phi||r.pre_harvest_interval||r["Pre-Harvest Interval (days)"]||r["PHI"]||""),
          applicatorName: r.applicatorName||r.licensed_applicator||r.applicator_name||r["Licensed Applicator"]||r["Applicator"]||r["Applied By"]||"",
          applicatorLicenseNum: r.applicatorLicenseNum||r.pesticide_license||r.pesticide_license_number||r["Pesticide License #"]||r["License #"]||"",
          notes: r.notes||r["Notes"]||"",
        }));
      } else if(target==="spaces"){
        newRecords = rawRecords.map(r=>({...r,id:r.id||"sp_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),name:r.name||r.room_name||r["Room Name"]||r["Space Name"]||r["Room"]||"",type:r.type||r.room_type||r["Room Type"]||r["Type"]||"Indoor",sqft:r.sqft||r.total_sq_ft||r["Total Sq Ft"]||r["Square Footage"]||r["Sq Ft"]||"",canopy:r.canopy||r.canopy_sq_ft||r["Canopy Sq Ft"]||r["Canopy Square Footage"]||"",maxPlants:r.maxPlants||r.max_plants||r["Max Plants"]||r["Max Plant Count"]||"",lightType:r.lightType||r.light_type||r["Light Type"]||"LED",lightCount:r.lightCount||r.light_count||r["Lights Count"]||r["Light Count"]||"",lightWatts:r.lightWatts||r.watts_per_light||r.watts_per_fixture||r["Watts Per Light"]||r["Watts Per Fixture"]||"",resetDays:r.resetDays||r.reset_days||r.clean_reset_duration||r["Clean & Reset Duration"]||r["Reset Days"]||"",lastHarvestDate:r.lastHarvestDate||r.last_harvest_date||r["Last Harvest Date"]||"",status:r.status||"active",notes:r.notes||r["Notes"]||"",}));
      } else if(target==="cult_inputs"){
        newRecords = rawRecords.map(r=>{
          // Get the raw type from all possible column names
          const rawType=(r.type||r.input_type||r.inputType||r["Input Type"]||r["Type"]||"").toLowerCase().trim();
          let type="other";
          if(["nutrient","fertilizer","feed","supplement","foliar","booster","tonic","solution"].some(k=>rawType.includes(k))) type="nutrient";
          else if(["amendment","compost","worm","casting","microbe","soil","media","topdress"].some(k=>rawType.includes(k))) type="amendment";
          else if(["beneficial","insect","mite","predator","nematode","ladybug","lacewing","cucumeris","sachets"].some(k=>rawType.includes(k))) type="beneficial";
          else if(["flush","plain water","ro water","rinse","enzyme","water"].some(k=>rawType.includes(k))) type="flush";
          else if(["nutrient","amendment","beneficial","flush","other"].includes(rawType)) type=rawType;
          return {
            ...r,
            id: r.id||"ci_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
            spaceName: r.spaceName||r.space_name||r.grow_space||r["Grow Space"]||r["Space"]||r["Room"]||"",
            date: r.date||r.application_date||r["Date"]||r["Application Date"]||"",
            type,
            product: r.product||r["Product"]||r["Input"]||r["Material"]||"",
            manufacturer: r.manufacturer||r["Manufacturer"]||r["Brand"]||"",
            rate: r.rate||r["Rate"]||"",
            rateUnit: r.rateUnit||r.rate_unit||r["Rate Unit"]||"",
            volumeApplied: r.volumeApplied||r.amount_mixed||r["Amount Mixed"]||"",
            volumeUnit: r.volumeUnit||r.volume_unit||r["Volume Unit"]||"gal",
            areaApplied: r.areaApplied||r.area_sq_ft||r["Area Sq Ft"]||r["Area"]||"",
            costPerUnit: r.costPerUnit||r.cost_per_unit||r["Cost Per Unit"]||"",
            totalCost: r.totalCost||r.total_cost||r["Total Cost"]||"",
            notes: r.notes||r["Notes"]||"",
          };
        });
        newRecords = rawRecords.map(r=>{
          const name=r.n||r.name||r.item_name||r.item||r.description||r.item_description||r["Item Name"]||r["Item"]||r["Description"]||"";
          const rawCat=r.cat||r.category||r.item_category||r["Category"]||"";
          const ICL=["Packaging","Extraction Solvents","Extraction Consumables","Post-Harvest Supplies","Pre-Roll Supplies","Vape Hardware","Edible Ingredients","Lab Supplies","Nutrients & Amendments","Growing Media","IPM Products","Cultivation Supplies","Cleaning & Sanitation","Other"];
          const ICM={"packag":"Packaging","label":"Packaging","bag":"Packaging","jar":"Packaging","solvent":"Extraction Solvents","butane":"Extraction Solvents","ethanol":"Extraction Solvents","filter":"Extraction Consumables","trim":"Post-Harvest Supplies","pre-roll":"Pre-Roll Supplies","cone":"Pre-Roll Supplies","preroll":"Pre-Roll Supplies","vape":"Vape Hardware","cartridge":"Vape Hardware","nutrient":"Nutrients & Amendments","amendment":"Nutrients & Amendments","coco":"Growing Media","perlite":"Growing Media","soil":"Growing Media","ipm":"IPM Products","pesticide":"IPM Products","cultivation":"Cultivation Supplies","pot":"Cultivation Supplies","clean":"Cleaning & Sanitation","sanit":"Cleaning & Sanitation","lab":"Lab Supplies"};
          let cat=ICL.includes(rawCat)?rawCat:null;
          if(!cat){const l=rawCat.toLowerCase();for(const [k,v] of Object.entries(ICM)){if(l.includes(k)){cat=v;break;}}}
          if(!cat)cat="Other";
          const stock=parseFloat(r.stock??r.current_stock??r.qty??r["Current Stock"]??0)||0;
          const cost=parseFloat(r.cost??r.unit_cost??r["Unit Cost"]??0)||0;
          const lots=Array.isArray(r.lots)?r.lots:(stock>0?[{id:"lot_imp_"+Date.now()+Math.random(),date:new Date().toISOString().split("T")[0],qty:stock,remaining:stock,costPerUnit:cost,poId:"ai_import"}]:[]);
          return {...r,id:r.id||"inv_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),n:name,cat,uom:r.uom||r.unit||r.unit_of_measure||r["Unit of Measure"]||"each",reorderAt:parseFloat(r.reorderAt??r.reorder_at??r.reorder_point??r["Reorder At"]??0)||0,reorderQty:parseFloat(r.reorderQty??r.reorder_qty??r["Reorder Qty"]??0)||0,vm:["fifo","average","last"].includes((r.vm||r.valuation_method||r["Valuation Method"]||"").toLowerCase())?(r.vm||r.valuation_method||r["Valuation Method"]).toLowerCase():"average",lots,lastCost:cost||0,notes:r.notes||r["Notes"]||"",};
        });
      } else if(target==="harvest_batches"){
        newRecords = rawRecords.map(r=>{
          const wetLbs = parseFloat(r.wet_weight_lbs||r["Wet Weight lbs"]||r["Wet Weight"]||0)||0;
          const wetG   = parseFloat(r.wetWeightG||r.wet_weight_g||0)||0;
          const wetWeightG = wetG>0 ? wetG : wetLbs>0 ? Math.round(wetLbs*453.592) : 0;
          const dryLbs = parseFloat(r.dry_weight_lbs||r["Dry Weight lbs"]||r["Dry Weight"]||0)||0;
          const dryG   = parseFloat(r.totalDryWeight||r.total_dry_weight||r.dry_weight_g||0)||0;
          const totalDryWeight = dryG>0 ? dryG : dryLbs>0 ? Math.round(dryLbs*453.592) : 0;
          const rawStatus = (r.status||r["Status"]||"").toLowerCase();
          const status = rawStatus==="complete"||rawStatus==="done"||rawStatus==="completed"||rawStatus==="cured" ? "done" : "open";
          return {
            ...r,
            id: r.id||r.batch_id||r["Batch ID"]||"hb_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
            strainName: r.strainName||r.strain_name||r["Strain Name"]||r["Strain"]||"",
            spaceId: r.spaceId||r.space_id||"",
            spaceName: r.spaceName||r.space_name||r.harvest_room||r["Harvest Room"]||r["Grow Space"]||"",
            plants: r.plants||r.plant_count||r["Plant Count"]||"",
            d: r.d||r.harvest_date||r["Harvest Date"]||new Date().toISOString().split("T")[0],
            wetWeightG, totalDryWeight, status,
            coaSampleId: r.coaSampleId||r.coa_sample_id||r["COA Sample ID"]||r["Sample ID"]||"",
            labName: r.labName||r.lab_name||r["Lab Name"]||"",
            thca: r.thca||r["THCa %"]||r["THCa"]||"",
            notes: r.notes||r["Notes"]||"",
            plants: r.plants||r.plant_count||r["Plant Count"]||"",
            grades: {
              aa:{weight:r.grade_aa||r["Grade AA (g)"]||"",s2s:""},
              a: {weight:r.grade_a||r["Grade A (g)"]||"",s2s:""},
              b: {weight:r.grade_b||r["Grade B (g)"]||"",s2s:""},
              c: {weight:r.grade_c||r["Grade C (g)"]||"",s2s:""},
              trim:{weight:r.trim||r["Trim (g)"]||"",s2s:""},
              waste:{weight:r.waste||r["Waste (g)"]||"",s2s:""},
            },
            steps: (()=>{
              const DS={
                whole_flower:[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:10},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
                pre_roll:[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:10},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
                extract:[{n:"Intake & Prep",days:2},{n:"Extraction",days:3},{n:"Post-Processing",days:5},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
              };
              const cat=r.cat||"whole_flower";
              return Array.isArray(r.steps)&&r.steps.length>0?r.steps:(DS[cat]||DS.whole_flower).map(s=>({...s}));
            })(),
          };
        });
      } else if(target==="sales_orders"){
        newRecords = rawRecords.map(r=>{
          const dispensaryName=r.dispensaryName||r.dispensary_name||r["Dispensary Name"]||r["Account"]||r["Customer"]||"";
          const licenseNum=r.licenseNum||r.licenseNumber||r.license_num||r.license_number||r["License Number"]||r["License #"]||r["OCM License"]||"";
          const units=parseFloat(r.units||r.units_ordered||r["Units Ordered"]||r["Quantity"]||r["Qty"]||0)||0;
          const unitPrice=parseFloat(String(r.unitPrice||r.unit_price||r["Unit Price"]||r["Price"]||0).replace(/[$,]/g,""))||0;
          const orderTotal=parseFloat(String(r.orderTotal||r.order_total||r["Order Total"]||r["Total"]||0).replace(/[$,]/g,""))||(units*unitPrice)||0;
          const rawStatus=(r.status||r["Status"]||"").toLowerCase();
          const status=rawStatus==="fulfilled"||rawStatus==="complete"?"fulfilled":"open";
          const product=r.product||r["Product"]||r["Item"]||"";
          const strain=r.strain||r["Strain"]||r["Cultivar"]||"";
          return {
            id: r.id||"ord_imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
            customerName: dispensaryName,
            customerLicense: licenseNum,
            orderDate: r.orderDate||r.order_date||r["Order Date"]||r["Date"]||"",
            deliveryDate: r.deliveryDate||r.delivery_date||r.requested_delivery||r["Requested Delivery"]||r["Delivery Date"]||"",
            status,
            notes: (r.notes||r["Notes"]||"")+(product?` | Product: ${product}`:"")+(strain?` | Strain: ${strain}`:""),
            lines: units>0?[{
              id:"ln_imp_"+Date.now()+Math.random(),
              batchId:"",
              product: product+(strain?` (${strain})`:""),
              qty: String(units),
              unitPrice: String(unitPrice||0),
              orderTotal,
            }]:[],
          };
        });
      } else {
        newRecords = rawRecords;
      }
      localStorage.setItem(tgt.key,JSON.stringify([...existing,...newRecords]));

      // Populate strain database from COA imports
      if(target==="qc_tests"){
        const strains=JSON.parse(localStorage.getItem("resinops_strains")||"[]");
        const strainNames=new Set(strains.map(s=>s.name.toLowerCase()));
        const newStrains=newRecords
          .filter(r=>r.strainName&&!strainNames.has(r.strainName.toLowerCase()))
          .map(r=>({
            id:"str_auto_"+Date.now()+Math.random(),
            name:r.strainName,type:"Unknown",parentage:"",breeder:"",
            thcaAvg:r.thca||"",thcAvg:r.thc||"",cbdAvg:r.cbd||"",
            terpsAvg:r.totalTerpenes||"",
            dominantTerpenes:[r.myrcene&&"Myrcene",r.limonene&&"Limonene",r.caryophyllene&&"Caryophyllene"].filter(Boolean).join(", "),
            notes:"Auto-added from COA import",status:"active",salesDescription:"",
          }));
        if(newStrains.length) localStorage.setItem("resinops_strains",JSON.stringify([...strains,...newStrains]));

        // Auto-create completed harvest batches for passing COAs, or update linked ones
        const passingRecords=newRecords.filter(r=>r.overallPass===true);
        if(passingRecords.length){
          const hb=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
          const existingSampleIds=new Set(hb.map(b=>b.coaSampleId).filter(Boolean));
          let updatedHb=[...hb];
          const newBatches=[];
          passingRecords.forEach((r,i)=>{
            if(r.batchId){
              // Update the linked batch to complete with COA data
              updatedHb=updatedHb.map(b=>String(b.id)===String(r.batchId)?{
                ...b,status:"complete",coaSampleId:r.sampleId,
                thca:r.thca||b.thca,thc:r.thc||b.thc,totalTerpenes:r.totalTerpenes||b.totalTerpenes,
                labName:r.labName||b.labName,coaReceivedDate:r.receivedDate,
              }:b);
            } else if(!existingSampleIds.has(r.sampleId)){
              // No linked batch — create placeholder
              newBatches.push({
                id:"hb_coa_"+Date.now()+"_"+i,
                strainName:r.strainName||"Unknown",
                d:r.receivedDate||r.submittedDate||new Date().toISOString().split("T")[0],
                status:"complete",coaSampleId:r.sampleId,labName:r.labName,
                thca:r.thca,thc:r.thc,totalTerpenes:r.totalTerpenes,
                notes:"Auto-created from passing COA import ("+(r.sampleId||"no sample ID")+")",
                source:"coa_import",
              });
            }
          });
          localStorage.setItem("resinops_harvest_batches",JSON.stringify([...updatedHb,...newBatches]));
        }
      }

      setImportState("done");
      const extras=target==="qc_tests"?` — strain catalogue & harvest batches updated`:"";
      setStatusMsg(newRecords.length+" record"+(newRecords.length!==1?"s":"")+" imported to "+tgt.label+extras+" ✓");
      // Log to import history
      const histEntry={id:"h_"+Date.now(),ts:new Date().toISOString(),fileName:importResult?.fileName||"unknown",module:tgt.label,records:newRecords.length,target};
      const newHistory=[histEntry,...importHistory].slice(0,50);
      setImportHistory(newHistory);
      localStorage.setItem("resinops_import_history",JSON.stringify(newHistory));
    }catch(e){ setImportErr("Save failed: "+e.message); }
  }

  function reset(){ setImportState("idle");setImportResult(null);setImportErr("");setImportTarget("");setCoaBatchLinks({}); }

  const stepStatus=(step)=>{
    const order=["idle","reading","analyzing","preview","coamatch","done"];
    const cur=order.indexOf(importState);
    const s=order.indexOf(step);
    if(s<cur) return "done";
    if(s===cur) return "active";
    return "wait";
  };

  return(
    <>
      <style>{CSS}</style>
      <div className="dm-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Data & Imports</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>AI-powered universal import, data backup, and restore — onboard any facility in minutes</div>
        </div>
        {statusMsg&&<div style={{background:"rgba(74,124,89,0.1)",border:"1px solid rgba(74,124,89,0.3)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--accent-2)",fontWeight:500}}>{statusMsg}</div>}

        <div className="dm-tabs">
          {[["import","✨ AI Import"],["history","📋 Import History"],["backup","💾 Backup & Restore"],["storage","📊 Storage"]].map(([v,l])=>(
            <button key={v} className={"dm-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── AI IMPORT ── */}
        {tab==="import"&&(
          <div className="dm-card">
            <div style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:4}}>Drop any file — CSV, Excel, PDF, Word</div>
            <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16}}>Claude reads your existing spreadsheets, lab COA PDFs, and documents and maps the data into ResinOps automatically. Works with Smartsheet exports, METRC reports, lab PDFs, staff lists — anything.</div>

            {/* Progress steps */}
            {importState!=="idle"&&(
              <div style={{marginBottom:16}}>
                {(importResult?.isCOA||(importTarget||importResult?.detectedType)==="qc_tests"
                  ?[["reading","📂 Reading file"],["analyzing","✨ AI analyzing & mapping"],["preview","👁 Preview COA data"],["coamatch","🔗 Link to harvest batches"],["done","✅ Import complete"]]
                  :[["reading","📂 Reading file"],["analyzing","✨ AI analyzing & mapping"],["preview","👁 Preview — confirm before saving"],["done","✅ Import complete"]]
                ).map(([s,l])=>(
                  <div key={s} className={"dm-step dm-step-"+(stepStatus(s))}>
                    <span style={{fontSize:16}}>{stepStatus(s)==="done"?"✓":stepStatus(s)==="active"?"⏳":"○"}</span>
                    <span style={{fontSize:12,fontWeight:stepStatus(s)==="active"?600:400,color:stepStatus(s)==="active"?"var(--text)":"var(--text-3)"}}>{l}</span>
                    {stepStatus(s)==="active"&&s==="analyzing"&&<span style={{fontSize:11,color:"#9080f0",marginLeft:"auto"}}>Claude is reading your file...</span>}
                  </div>
                ))}
              </div>
            )}

            {importState==="idle"&&(
              <>
                <div style={{marginBottom:10}}>
                  <label className="dm-lbl">Data type (optional — leave blank for auto-detect)</label>
                  <select className="dm-inp" style={{cursor:"pointer"}} value={importTarget} onChange={e=>setImportTarget(e.target.value)}>
                    <option value="">Auto-detect from file content</option>
                    {Object.entries(IMPORT_TARGETS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div className={"dm-drop"+(dragOver?" over":"")}
                  onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)processFile(f);}}
                  onClick={()=>fileRef.current.click()}>
                  <div style={{fontSize:36,marginBottom:8}}>📂</div>
                  <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Drop your file here, or click to browse</div>
                  <div style={{fontSize:11,color:"var(--text-3)"}}>Supports: CSV, Excel (.xlsx), PDF (COAs, reports), Word (.docx), JSON</div>
                  <div style={{fontSize:11,color:"var(--text-3)",marginTop:4}}>Common imports: employee lists, COA PDFs, spray logs, strain databases, equipment lists, Smartsheet exports</div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.docx,.json,.txt" style={{display:"none"}} onChange={e=>{if(e.target.files[0])processFile(e.target.files[0]);e.target.value="";}} />
                </div>
              </>
            )}

            {importState==="error"&&(
              <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{importErr}</div>
                <button className="dm-btn dm-secondary" onClick={reset}>Try again</button>
              </div>
            )}

            {importState==="analyzing"&&(
              <div style={{textAlign:"center",padding:32}}>
                <div style={{fontSize:28,marginBottom:12}}>✨</div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:6}}>AI is analyzing your file...</div>
                <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16}}>Reading column headers, mapping fields, extracting data — usually 5-15 seconds</div>
                <div style={{width:200,height:4,background:"var(--surface-2)",borderRadius:2,margin:"0 auto",overflow:"hidden"}}>
                  <div style={{height:4,background:"var(--accent)",borderRadius:2,animation:"dm-progress 1.5s ease-in-out infinite",width:"60%"}}/>
                </div>
              </div>
            )}

            {importState==="preview"&&importResult&&(
              <div>
                <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Detected type</div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{IMPORT_TARGETS[importResult.detectedType]?.label||importResult.detectedType}</div>
                  </div>
                  <div style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Records found</div>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>{importResult.records?.length||0}</div>
                  </div>
                  <div style={{background:"var(--surface-2)",borderRadius:8,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>Confidence</div>
                    <span className={"dm-pill "+(importResult.confidence>=75?"conf-high":importResult.confidence>=50?"conf-mid":"conf-low")}>{importResult.confidence}%</span>
                  </div>
                  <div style={{flex:1,fontSize:12,color:"var(--text-2)",fontStyle:"italic"}}>{importResult.summary}</div>
                </div>

                {importResult.records?.length>0&&(
                  <>
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:14,maxHeight:320,overflowY:"auto"}}>
                    <table className="dm-tbl">
                      <thead><tr>{Object.keys(importResult.records[0]||{}).slice(0,8).map(k=><th key={k}>{k}</th>)}</tr></thead>
                      <tbody>
                        {importResult.records.slice(0,20).map((r,i)=>(
                          <tr key={i}>{Object.values(r).slice(0,8).map((v,j)=><td key={j} style={{maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(v||"")}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                    {importResult.records.length>20&&<div style={{padding:"6px 10px",fontSize:11,color:"var(--text-3)"}}>Showing 20 of {importResult.records.length} records</div>}
                  </div>
                  <details style={{marginBottom:14}}>
                    <summary style={{fontSize:11,color:"var(--text-3)",cursor:"pointer",padding:"4px 0"}}>🔍 Debug: raw first record (copy and share if fields look wrong)</summary>
                    <pre style={{fontSize:10,background:"var(--surface-2)",borderRadius:6,padding:"8px 10px",overflowX:"auto",color:"var(--text-2)",marginTop:6,whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
                      {JSON.stringify(importResult.records[0], null, 2)}
                    </pre>
                  </details>
                  </>
                )}

                {importResult.confidence<60&&(
                  <div style={{background:"rgba(200,150,58,0.1)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:"var(--amber)"}}>
                    Low confidence mapping. Review the preview carefully before importing. You can still import — just verify the data looks right in the table above.
                  </div>
                )}

                <div style={{display:"flex",gap:8}}>
                  <button className="dm-btn dm-primary" onClick={()=>{
                    const isCOA=importResult.isCOA||(importTarget||importResult.detectedType)==="qc_tests";
                    if(isCOA) setImportState("coamatch");
                    else confirmImport();
                  }}>
                    {(importResult.isCOA||(importTarget||importResult.detectedType)==="qc_tests")
                      ? "Next: Link to Batches →"
                      : `Import ${importResult.records?.length||0} records`}
                  </button>
                  <button className="dm-btn dm-secondary" onClick={reset}>Cancel / start over</button>
                </div>
              </div>
            )}

            {importState==="coamatch"&&importResult&&(
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Link COA results to existing harvest batches</div>
                <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
                  Match each COA result to the harvest batch you created when you sent the sample to Kaycha.
                  If you don't have a batch yet, leave it unlinked — ResinOps will create a placeholder batch automatically.
                </div>
                {importResult.records?.map((r,i)=>{
                  const hb=JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");
                  // Resolve display fields — Claude may use snake_case or CSV column names
                  const strain=r.strainName||r.strain_name||r.sample_name||r["Sample Name"]||r["Strain"]||"Unknown Strain";
                  const sampleId=r.sampleId||r.sample_id||r["Sample ID"]||r["Lab Sample ID"]||"—";
                  const thca=r.thca||r.thca_percent||r["THCa %"]||r["THCa"]||"";
                  const terps=r.totalTerpenes||r.total_terpenes||r.total_terpenes_percent||r["Total Terpenes %"]||"";
                  const passed=r.overallPass??r.overall_pass??(
                    (r["Overall Result"]||r.overall_result||"").toLowerCase()==="pass"?true:
                    (r["Overall Result"]||r.overall_result||"").toLowerCase()==="fail"?false:undefined
                  );
                  return(
                    <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"12px 14px",marginBottom:10,border:"1px solid var(--border-2)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{strain}</div>
                          <div style={{fontSize:11,color:"var(--text-3)"}}>Kaycha Sample ID: <span style={{fontFamily:"monospace",color:"var(--text-2)"}}>{sampleId}</span></div>
                          <div style={{fontSize:11,color:"var(--text-3)"}}>
                            {thca&&<span style={{marginRight:10}}>THCa: <strong style={{color:"var(--accent-2)"}}>{thca}%</strong></span>}
                            {terps&&<span>Terps: <strong style={{color:"var(--accent-2)"}}>{terps}%</strong></span>}
                            {passed===true&&<span style={{marginLeft:10,color:"var(--accent-2)",fontWeight:600}}>✓ PASS</span>}
                            {passed===false&&<span style={{marginLeft:10,color:"var(--danger)",fontWeight:600}}>✗ FAIL</span>}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="dm-lbl">Link to harvest batch in ResinOps</label>
                        <select className="dm-inp" style={{cursor:"pointer"}}
                          value={coaBatchLinks[sampleId!=="—"?sampleId:i]||""}
                          onChange={e=>setCoaBatchLinks(prev=>({...prev,[sampleId!=="—"?sampleId:i]:e.target.value}))}>
                          <option value="">— No match / create placeholder batch —</option>
                          {hb.filter(b=>!b.source||b.source!=="coa_import").map(b=>(
                            <option key={b.id} value={b.id}>
                              {b.strainName} {b.d?`(${new Date(b.d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})})`:""} {b.coaSampleId?`— ${b.coaSampleId}`:""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <button className="dm-btn dm-primary" onClick={()=>confirmImport(coaBatchLinks)}>Import & save COA results</button>
                  <button className="dm-btn dm-secondary" onClick={()=>setImportState("preview")}>← Back to preview</button>
                </div>
              </div>
            )}

            {importState==="done"&&(
              <div style={{textAlign:"center",padding:32}}>
                <div style={{fontSize:40,marginBottom:10}}>✅</div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Import complete</div>
                <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16}}>{statusMsg}</div>
                <button className="dm-btn dm-primary" onClick={reset}>Import another file</button>
              </div>
            )}
          </div>
        )}

        {/* ── DEMO MODE ── */}
        {/* ── IMPORT HISTORY ── */}
        {tab==="history"&&(
          <div className="dm-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:3}}>Import History</div>
                <div style={{fontSize:12,color:"var(--text-3)"}}>Last {importHistory.length} imports — verify what data has been loaded and avoid duplicates</div>
              </div>
              {importHistory.length>0&&<button className="dm-btn dm-secondary" style={{fontSize:11}} onClick={()=>{
                if(!window.confirm("Clear import history? This does not delete imported data.")) return;
                setImportHistory([]);localStorage.removeItem("resinops_import_history");
              }}>Clear history</button>}
            </div>
            {importHistory.length===0?(
              <div style={{textAlign:"center",padding:32,color:"var(--text-3)"}}>
                <div style={{fontSize:24,marginBottom:8}}>📋</div>
                <div>No imports yet — history appears here after your first import</div>
              </div>
            ):(
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="dm-tbl" style={{fontSize:12}}>
                  <thead><tr><th>Date & Time</th><th>File</th><th>Module</th><th>Records</th></tr></thead>
                  <tbody>
                    {importHistory.map((h,i)=>(
                      <tr key={h.id} style={{background:i%2===0?"transparent":"var(--surface-2)"}}>
                        <td style={{whiteSpace:"nowrap",color:"var(--text-3)",fontSize:11}}>
                          {new Date(h.ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} {new Date(h.ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
                        </td>
                        <td style={{fontFamily:"monospace",fontSize:11,color:"var(--text-2)"}}>{h.fileName}</td>
                        <td><span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:10,background:"rgba(74,124,89,0.15)",color:"var(--accent-2)"}}>{h.module}</span></td>
                        <td style={{fontWeight:600,color:"var(--accent-2)"}}>{h.records} records</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab==="backup"&&(
          <>
            <div className="dm-card" style={{border:"2px solid rgba(90,63,160,0.4)",background:"rgba(90,63,160,0.04)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span style={{fontSize:20}}>🚀</span>
                <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>Demo Mode — Cascade Peak Cannabis LLC</div>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(90,63,160,0.15)",color:"#9080f0"}}>INVESTOR DEMO</span>
              </div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>
                One-click facility setup for demo sessions. Loads Cascade Peak Cannabis LLC (OCM-AUPR-007891) into Facility Settings instantly — no manual entry required. Use this before importing the numbered demo CSV files.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                {[
                  ["Facility","Cascade Peak Cannabis LLC"],
                  ["License","OCM-AUPR-007891 (Adult-Use Cultivator)"],
                  ["Location","1220 Route 17M, Tuxedo, NY 10987"],
                  ["Seed-to-Sale","METRC / Flourish"],
                ].map(([l,v])=>(
                  <div key={l} style={{background:"var(--surface-2)",borderRadius:7,padding:"8px 12px"}}>
                    <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase"}}>{l}</div>
                    <div style={{fontSize:12,color:"var(--text)",fontWeight:500}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <button className="dm-btn dm-primary" style={{background:"rgba(90,63,160,0.8)"}} onClick={()=>{
                  // Facility settings
                  const demoSettings = {
                    facilityName:"Cascade Peak Cannabis LLC",dbaName:"Cascade Peak",
                    licenseNumber:"OCM-AUPR-007891",licenseType:"Adult-Use Cultivator",
                    state:"NY",address:"1220 Route 17M",city:"Tuxedo",zip:"10987",
                    phone:"(845) 555-0100",email:"ops@cascadepeak.co",website:"www.cascadepeak.co",
                    ownerName:"Jordan Cascade",ownerEmail:"j.cascade@cascadepeak.co",ownerPhone:"(845) 555-0101",
                    timezone:"America/New_York",tagSystem:"Flourish",fiscalYearStart:"01",metrcApiKey:"",
                  };
                  localStorage.setItem("resinops_facility_settings",JSON.stringify(demoSettings));

                  // SKU pricing — retail prices by product type
                  const skus = [
                    {id:"sku_wf35",product:"Whole Flower 3.5g",sku:"CP-WF-3.5",price:18.00,unit:"each",cat:"whole_flower",notes:"Standard retail 3.5g jar"},
                    {id:"sku_wf7", product:"Whole Flower 7g",  sku:"CP-WF-7",  price:32.00,unit:"each",cat:"whole_flower",notes:""},
                    {id:"sku_wf28",product:"Whole Flower 28g", sku:"CP-WF-28", price:110.00,unit:"each",cat:"whole_flower",notes:"Ounce — wholesale"},
                    {id:"sku_pr1", product:"Pre-Roll 1g",      sku:"CP-PR-1",  price:8.00, unit:"each",cat:"pre_roll",   notes:"Single 1g cone"},
                    {id:"sku_pr5", product:"Pre-Roll 5-pack",  sku:"CP-PR-5",  price:35.00,unit:"each",cat:"pre_roll",   notes:"5x0.5g pack"},
                    {id:"sku_ros", product:"Live Rosin 1g",    sku:"CP-LR-1",  price:65.00,unit:"each",cat:"extract",    notes:"Solventless rosin"},
                    {id:"sku_vape",product:"Vape Cartridge 0.5g",sku:"CP-VC-05",price:45.00,unit:"each",cat:"vape",     notes:"510 thread"},
                  ];
                  localStorage.setItem("resinops_skus",JSON.stringify(skus));

                  // BOMs — material cost per unit by product type
                  const boms = [
                    {id:"bom_wf",product:"Whole Flower",cat:"whole_flower",
                      items:[
                        {name:"Child-Resistant Glass Jar 2oz",qty:1,unit:"each",unitCost:0.38},
                        {name:"Tamper-Evident Label",qty:1,unit:"each",unitCost:0.08},
                        {name:"Exit Bag",qty:0.1,unit:"each",unitCost:0.12},
                      ],testFee:350,laborCostPerUnit:0.45,notes:""},
                    {id:"bom_pr",product:"Pre-Roll",cat:"pre_roll",
                      items:[
                        {name:"Pre-Roll Cone 110mm",qty:1,unit:"each",unitCost:0.09},
                        {name:"CR Tube 116mm",qty:1,unit:"each",unitCost:0.14},
                      ],testFee:350,laborCostPerUnit:0.22,notes:""},
                    {id:"bom_ros",product:"Live Rosin",cat:"extract",
                      items:[
                        {name:"Glass Jar",qty:1,unit:"each",unitCost:0.38},
                        {name:"Label",qty:1,unit:"each",unitCost:0.08},
                      ],testFee:450,laborCostPerUnit:8.50,notes:"Includes press labor estimate"},
                    {id:"bom_vape",product:"Vape Cartridge",cat:"vape",
                      items:[
                        {name:"510 Cartridge Hardware",qty:1,unit:"each",unitCost:2.80},
                        {name:"Label",qty:1,unit:"each",unitCost:0.08},
                      ],testFee:400,laborCostPerUnit:1.20,notes:""},
                  ];
                  localStorage.setItem("resinops_boms",JSON.stringify(boms));

                  // Fix license expiry dates — set Marcus Webb's Category 24 to 45 days from now for dashboard alert
                  const employees = JSON.parse(localStorage.getItem("resinops_employees")||"[]");
                  if(employees.length){
                    const alertDate = new Date();
                    alertDate.setDate(alertDate.getDate()+45);
                    const alertDateStr = alertDate.toISOString().split("T")[0];
                    const updated = employees.map(e=>
                      e.name?.includes("Marcus Webb") || e.pestLicenseCategory?.includes("Category 24")
                        ? {...e, pestLicenseExpiry: alertDateStr}
                        : e
                    );
                    localStorage.setItem("resinops_employees",JSON.stringify(updated));
                  }

                  // GMP Hub — pre-load SOPs, a shift log, and a deviation
                  const today = new Date().toISOString().split("T")[0];
                  const sops = [
                    {id:"sop_001",title:"Cannabis Flower Harvest Procedure",code:"SOP-CULT-001",version:"2.1",category:"Cultivation",status:"approved",approvedBy:"Marcus Webb",approvedDate:"2024-09-15",reviewDate:"2025-09-15",description:"Standard operating procedure for harvesting cannabis flower including pre-harvest inspection, cutting protocol, wet weight recording, and transport to dry room.",steps:["Verify harvest authorization in Metrc and confirm batch ID","Inspect canopy for visible mold or pest damage — halt if found","Set up labeled harvest bins and scale in staging area","Cut plants at base, remove fan leaves, record wet weight per plant","Transport to Dry / Cure Room within 2 hours of cutting","Log wet weight and harvest date in ResinOps Harvest Batches"]},
                    {id:"sop_002",title:"IPM Pesticide Application Protocol",code:"SOP-IPM-001",version:"3.0",category:"Compliance",status:"approved",approvedBy:"Sofia Ramirez",approvedDate:"2024-11-01",reviewDate:"2025-11-01",description:"NY DEC compliant pesticide application procedure covering pre-application checklist, PPE requirements, application technique, and post-application recordkeeping.",steps:["Verify applicator holds valid Category 24 or 1A NY pesticide license","Check EPA registration number on current product label","Confirm PHI and REI — post REI signage on room door","Don full PPE: respirator, goggles, gloves, coveralls","Mix product at label rate — record amount mixed and area to treat","Apply using designated equipment — full canopy coverage required","Log application in ResinOps Pesticide Log immediately after completion","Do not enter room until REI has elapsed"]},
                    {id:"sop_003",title:"COA Review and Batch Release",code:"SOP-QC-001",version:"1.4",category:"Quality Control",status:"approved",approvedBy:"Sofia Ramirez",approvedDate:"2024-10-01",reviewDate:"2025-10-01",description:"Procedure for reviewing Certificate of Analysis results from Kaycha Labs and releasing or holding harvest batches based on NY OCM action limits.",steps:["Receive COA from Kaycha Labs — verify lab ID and sample ID match batch record","Review all panels: cannabinoids, terpenes, microbial, pesticides, heavy metals, water activity","Compare all results against NY OCM action limits","If all panels PASS: update batch status to released in ResinOps and Metrc","If any panel FAILS: immediately place batch on QC Hold in ResinOps","For failed microbial: refer to Remediation SOP-REM-001","Document review in Deviation Register if any result was borderline"]},
                    {id:"sop_004",title:"Tissue Culture Vessel Preparation",code:"SOP-TC-001",version:"1.0",category:"Genetics Lab",status:"approved",approvedBy:"Priya Nair",approvedDate:"2024-03-01",reviewDate:"2025-03-01",description:"Aseptic technique procedure for preparing TC media and inoculating culture vessels using Athena CulturIN system components.",steps:["Wipe all laminar flow hood surfaces with 70% isopropyl alcohol — run hood 15 min before use","Prepare Athena Shoots or Roots media per stage per manufacturer spec","Autoclave media: 121°C / 15 PSI / 20 minutes","Allow media to cool to <50°C before adding heat-sensitive components","Pour media in hood under aseptic conditions — flame tools between uses","Inoculate vessel with prepared explant material","Label with strain, stage, date, and technician initials","Log vessel in ResinOps TC Tracker"]},
                  ];
                  localStorage.setItem("resinops_sops", JSON.stringify(sops));

                  const shifts = [
                    {id:"shift_001",date:today,type:"day",lead:"Marcus Webb",startTime:"06:00",endTime:"14:30",spaces:["Flower Room 6","Flower Room 7","Veg Room"],notes:"Standard cultivation shift — fed FR6 and FR7 with Athena PK week 5 protocol. Topped canopy in FR7. No issues.",tasks:[{task:"Nutrient feed FR6 + FR7",done:true},{task:"Canopy inspection all rooms",done:true},{task:"Beneficial insect check clone room",done:true}]},
                    {id:"shift_002",date:today,type:"processing",lead:"Taryn Delacroix",startTime:"07:00",endTime:"15:00",spaces:["Processing Room","Dry / Cure Room"],notes:"Post-harvest processing — Mango Haze cure check. Moisture at 9.1% — one more week. Black Maple packaging complete 2,400 units.",tasks:[{task:"Cure check Mango Haze",done:true},{task:"Black Maple packaging run",done:true},{task:"Trim machine blade inspection",done:true}]},
                  ];
                  localStorage.setItem("resinops_shifts", JSON.stringify(shifts));

                  const deviations = [
                    {id:"dev_001",date:"2024-11-15",type:"Environmental",severity:"minor",space:"Flower Room 6",title:"RH spike above 65% during lights-off",description:"Relative humidity in Flower Room 6 reached 68% during a 4-hour window on the night of Nov 14-15 due to dehumidifier drain line blockage. No visible mold observed on inspection.",corrective:"Drain line cleared and flushed. Amir Hassan added quarterly drain line check to PM schedule for all Quest 335 units.",preventive:"Added RH high alert threshold of 62% to Growlink monitoring for all flower rooms.",status:"closed",closedDate:"2024-11-16",closedBy:"Marcus Webb"},
                  ];
                  localStorage.setItem("resinops_deviations", JSON.stringify(deviations));

                  // Production batches — pre-load so Batch Margin Dashboard and Gantt chart work
                  const WF=[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:10},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
                  const PR=[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:10},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
                  const EX=[{n:"Intake & Prep",days:2},{n:"Extraction",days:3},{n:"Post-Processing",days:5},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
                  const prodBatches = [
                    {id:"pb_001",name:"Mango Haze — 3.5g Retail",cat:"whole_flower",sub:"3.5g",catLabel:"Whole Flower",subLabel:"3.5g Retail",strains:"Mango Haze",d:"2026-06-11",inputAmt:5820,unit:"g",yieldEst:"5200 units",actual_yield:"5,186 units",harvestBatchId:"HB-2026-0312",status:"complete",steps:WF.map(s=>({...s}))},
                    {id:"pb_002",name:"Black Maple — 3.5g Retail",cat:"whole_flower",sub:"3.5g",catLabel:"Whole Flower",subLabel:"3.5g Retail",strains:"Black Maple",d:"2026-05-27",inputAmt:5680,unit:"g",yieldEst:"5100 units",actual_yield:"5,092 units",harvestBatchId:"HB-2026-0298",status:"complete",steps:WF.map(s=>({...s}))},
                    {id:"pb_003",name:"Gorilla Cake — 1g Pre-Rolls",cat:"pre_roll",sub:"1g",catLabel:"Pre-Roll",subLabel:"1g",strains:"Gorilla Cake",d:"2026-05-13",inputAmt:1440,unit:"g",yieldEst:"2800 units",actual_yield:"2,792 units",harvestBatchId:"HB-2026-0285",status:"complete",steps:PR.map(s=>({...s}))},
                    {id:"pb_004",name:"Gorilla Cake — Live Rosin",cat:"extract",sub:"rosin",catLabel:"Concentrate",subLabel:"Live Rosin",strains:"Gorilla Cake",d:"2026-05-12",inputAmt:1800,unit:"g",yieldEst:"680g",actual_yield:"672g",harvestBatchId:"HB-2026-0285",status:"complete",steps:EX.map(s=>({...s}))},
                    {id:"pb_005",name:"Zaza Runtz — 3.5g Retail",cat:"whole_flower",sub:"3.5g",catLabel:"Whole Flower",subLabel:"3.5g Retail",strains:"Zaza Runtz",d:"2026-04-30",inputAmt:4820,unit:"g",yieldEst:"4500 units",actual_yield:"4,488 units",harvestBatchId:"HB-2026-0271",status:"complete",steps:WF.map(s=>({...s}))},
                    {id:"pb_006",name:"Black Maple — 3.5g Retail (Jul)",cat:"whole_flower",sub:"3.5g",catLabel:"Whole Flower",subLabel:"3.5g Retail",strains:"Black Maple",d:"2026-07-21",inputAmt:0,unit:"g",yieldEst:"~5000 units",actual_yield:"",harvestBatchId:"HB-2026-0401",status:"in_progress",steps:WF.map(s=>({...s}))},
                    {id:"pb_007",name:"Gorilla Cake — Live Rosin (Jul)",cat:"extract",sub:"rosin",catLabel:"Concentrate",subLabel:"Live Rosin",strains:"Gorilla Cake",d:"2026-07-10",inputAmt:0,unit:"g",yieldEst:"~640g",actual_yield:"",harvestBatchId:"HB-2026-0402",status:"in_progress",steps:EX.map(s=>({...s}))},
                    {id:"pb_008",name:"Mango Haze — 1g Pre-Rolls (Jul)",cat:"pre_roll",sub:"1g",catLabel:"Pre-Roll",subLabel:"1g",strains:"Mango Haze",d:"2026-07-01",inputAmt:1200,unit:"g",yieldEst:"1500 units",actual_yield:"",harvestBatchId:"HB-2026-0312",status:"in_progress",steps:PR.map(s=>({...s}))},
                  ];
                  localStorage.setItem("resinops_prod", JSON.stringify(prodBatches));
                  setStatusMsg("✓ Demo ready — facility, SKUs, BOMs, production batches, GMP Hub SOPs, and license alerts all configured");
                }}>
                  ✨ Load demo facility settings
                </button>
                <button className="dm-btn dm-secondary" style={{color:"var(--danger)",borderColor:"rgba(200,74,74,0.4)!important"}} onClick={()=>{
                  if(!window.confirm("This will permanently delete ALL data in ResinOps. Are you sure? This cannot be undone.")) return;
                  const keys = Object.keys(localStorage).filter(k=>k.startsWith("resinops_"));
                  keys.forEach(k=>localStorage.removeItem(k));
                  setStatusMsg("All ResinOps data cleared — ready for fresh demo");
                }}>
                  🗑 Clear all data
                </button>
              </div>
              {statusMsg&&<div style={{marginTop:10,fontSize:12,color:"var(--accent-2)",fontWeight:500}}>{statusMsg}</div>}
            </div>

            <div className="dm-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Export full data backup</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>Downloads all ResinOps data as a single JSON file. Store it somewhere safe — this is your only protection against browser data loss until the V2 cloud backend is live.</div>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
                <div style={{flex:1,background:"var(--surface-2)",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Total data size</div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{bytesToSize(stats.totalBytes)}</div>
                </div>
                <div style={{flex:1,background:"var(--surface-2)",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Total records</div>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--accent-2)"}}>{stats.keys.reduce((a,k)=>a+k.count,0)}</div>
                </div>
              </div>
              <button className="dm-btn dm-primary" onClick={backup}>↓ Download backup now</button>
              <div style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>⚠ Recommended: back up before every major import or after a heavy data-entry session.</div>
            </div>

            <div className="dm-card">
              <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>Restore from backup</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>Uploads a previously downloaded backup file and restores all data. <strong>This will merge with existing data</strong> — it will not delete records that are already there.</div>
              {!restoreConfirm?(
                <button className="dm-btn dm-secondary" onClick={()=>setRestoreConfirm(true)}>Restore from backup file…</button>
              ):(
                <div style={{background:"rgba(200,150,58,0.08)",border:"1px solid rgba(200,150,58,0.3)",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:12,color:"var(--amber)",marginBottom:10}}>Select your backup JSON file. Data will be merged with what's currently in the app.</div>
                  <div style={{display:"flex",gap:8}}>
                    <label className="dm-btn dm-primary" style={{cursor:"pointer"}}>
                      Choose backup file
                      <input ref={restoreRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>{if(e.target.files[0])restoreFromFile(e.target.files[0]);e.target.value="";}} />
                    </label>
                    <button className="dm-btn dm-secondary" onClick={()=>setRestoreConfirm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── STORAGE ── */}
        {tab==="storage"&&(
          <div className="dm-card">
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:12}}>Data storage breakdown</div>
            <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
              <table className="dm-tbl">
                <thead><tr><th>Module / data store</th><th>Records</th><th>Size</th></tr></thead>
                <tbody>{stats.keys.map(k=>(
                  <tr key={k.k}>
                    <td style={{fontFamily:"monospace",fontSize:11}}>{k.k.replace("resinops_","")}</td>
                    <td>{k.count}</td>
                    <td>{bytesToSize(k.size)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{marginTop:12,fontSize:11,color:"var(--text-3)"}}>Total: {bytesToSize(stats.totalBytes)} across {stats.keys.length} data stores. localStorage limit is typically 5–10MB per browser.</div>
          </div>
        )}
      </div>
    </>
  );
}
