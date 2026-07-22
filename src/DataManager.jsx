import { useState, useRef, useEffect } from "react";
import { db, TABLE_NAMES } from "./lib/db";
import { getCurrentFacility, supabase, isSupabaseEnabled } from "./lib/supabase";
import { authenticatedApiFetch, formatApiError } from "./lib/api";
import { DEFAULT_LABOR_TYPES } from "./LaborManager.jsx";

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
  production_batches:{ label:"Production Batches", icon:"🏭", key:"resinops_prod",
    schema:`Each record must use these EXACT field names:
  name (batch name — may be called "Batch Name", "Name", "Production Batch", etc.)
  catLabel (product category label — may be called "Product Type", "Category", "Product Category", etc. e.g. "Whole Flower", "Pre-Roll", "Concentrate")
  subLabel (product sub-type — may be called "Sub-Type", "Sub Type", "Product Sub-Type", e.g. "3.5g Retail", "1g", "Live Rosin")
  strains (strain name(s) — may be called "Strain(s)", "Strain", "Cultivar", etc.)
  d (scheduled start date in YYYY-MM-DD — may be called "Scheduled Start", "Start Date", "Date", etc.)
  status (must be exactly "complete", "in_progress", or "scheduled" — map "Complete","Done","Finished" → "complete"; "In Progress","In-Progress","Active" → "in_progress"; "Scheduled","Upcoming","Planned" → "scheduled")
  yieldEst (estimated yield as text — may be called "Estimated Yield", "Est. Output", "Yield", etc. Keep the full string including units)
  actual_yield (actual yield achieved — may be called "Actual Yield", "Actual", "Yield Achieved", etc.)
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
  grow_schedule:{ label:"Grow Schedule", icon:"📅", key:"resinops_spaces",
    schema:`Each record must use these EXACT field names:
  name (batch or room name — may be called "Batch Name", "Room / Batch", "Name", etc.)
  d (clone or seed date in YYYY-MM-DD — may be called "Clone / Seed Date", "Start Date", "Clone Date", etc.)
  veg (veg weeks as a number — may be called "Veg Weeks", "Veg (weeks)", "Vegetative Weeks", etc.)
  flw (flower weeks as a number — may be called "Flower Weeks", "Flower (weeks)", "Flowering Weeks", etc.)
  strain (primary strain name — may be called "Strain 1", "Primary Strain", "Strain", "Cultivar", etc.)
  plants (plant count as a number — may be called "Plants 1", "Plant Count", "Plants", etc.)
  strain2 (second strain if applicable — may be called "Strain 2", "Secondary Strain", etc. Leave blank if none)
  plants2 (second strain plant count — may be called "Plants 2", etc. Leave blank if none)
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
  date (application date in YYYY-MM-DD)
  spaceName (the grow room or space name — column may be called "Grow Space / Room" or similar)
  type (default "ipm_spray" unless fungicide/insecticide/herbicide)
  product (THE PRODUCT OR PESTICIDE NAME — this is the most important field. Column may be called "Product / Pesticide Name", "Product", "Pesticide", "Chemical Name". ALWAYS populate this field.)
  manufacturer (brand name)
  epaRegNum (EPA registration number — column "EPA Registration Number")
  rate (numeric rate value only — extract just the number from e.g. "2 oz/gal")
  rateUnit (the unit — extract from e.g. "2 oz/gal" → "oz/gal")
  volumeApplied (total volume as number — column "Amount Mixed (gallons)")
  volumeUnit (default "gal")
  areaApplied (area in sq ft as number — column "Area Treated (sq ft)")
  applicationMethod (column "Application Equipment")
  targetPest (column "Target Pest / Disease")
  weatherTemp (number — column "Temp at Application (F)")
  weatherWind (number — column "Wind Speed (mph)")
  weatherHumidity (number — column "Relative Humidity (%)")
  rei (number — column "Re-Entry Interval (hrs)")
  phi (number — column "Pre-Harvest Interval (days)")
  applicatorName (column "Licensed Applicator")
  applicatorLicenseNum (column "Pesticide License #")
  notes (notes field)` },
};

// Maps each import target to the real Supabase table it should persist
// to. confirmImport() used to write straight to localStorage.setItem
// (tgt.key) instead of any of these — that's the bug being fixed.
const TARGET_TABLE = {
  employees: 'employees',
  equipment: 'equipment',
  inventory: 'inventory_items',
  vendors: 'vendors',
  strains: 'strains',
  spaces: 'grow_rooms',
  harvest_batches: 'harvest_batches',
  production_batches: 'production_batches',
  qc_tests: 'qc_tests',
  cult_inputs: 'cultivation_inputs',
  grow_schedule: 'grow_spaces',
  sales_orders: 'sales_orders',
  spray_log: 'spray_log',
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
Always return exactly: { "detectedType": "employees|equipment|inventory|vendors|strains|spaces|grow_schedule|qc_tests|cult_inputs|spray_log|harvest_batches|production_batches|sales_orders|unknown", "confidence": 0-100, "summary": "one line", "records": [...] }
${mappingRule}
${coaInstructions}`;

  const resp = await authenticatedApiFetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: 'data-import', system, prompt }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(formatApiError(resp, err, "Server error " + resp.status));
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
  const [importHistory, setImportHistory] = useState([]);

  useEffect(()=>{
    db.import_history.list().then(setImportHistory).catch(e=>console.error("Import history load error:",e));
  },[]);
  const [importState,setImportState]=useState("idle"); // idle|reading|analyzing|preview|coamatch|done|error
  const [importResult,setImportResult]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [importTarget,setImportTarget]=useState("");
  const [coaBatchLinks,setCoaBatchLinks]=useState({}); // sampleId -> harvestBatchId
  const [restoreConfirm,setRestoreConfirm]=useState(false);
  const [statusMsg,setStatusMsg]=useState("");
  const [demoLoading,setDemoLoading]=useState(false);
  const [clearLoading,setClearLoading]=useState(false);

  async function loadDemoData(){
    if (demoLoading) return;
    setDemoLoading(true);
    setStatusMsg("Loading demo data…");
    try {
      // The records below originally used short human-readable ids (pb_001, gs_001,
      // s1, etc.) which worked fine in localStorage but are not valid Postgres uuids.
      // uid() generates a real uuid per fake id and keeps them consistent across
      // datasets that reference each other (e.g. a production batch's harvestBatchId).
      const idMap = {};
      // Deterministic id: the same fake id (e.g. "s1", "eq_001") always hashes to
      // the exact same UUID-shaped string, every time this runs. That's what makes
      // clicking "Load Demo Data" repeatedly update the same rows instead of
      // stacking up duplicates — the old version used crypto.randomUUID() fresh
      // on every click, so nothing ever matched an existing row on conflict.
      function deterministicUuid(seed){
        let h1=0xdeadbeef, h2=0x41c6ce57;
        for (let i=0;i<seed.length;i++){
          const ch=seed.charCodeAt(i);
          h1=Math.imul(h1^ch,2654435761);
          h2=Math.imul(h2^ch,1597334677);
        }
        h1=(Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909))>>>0;
        h2=(Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909))>>>0;
        const hex=h1.toString(16).padStart(8,"0")+h2.toString(16).padStart(8,"0");
        const full=(hex+hex).slice(0,32);
        return `${full.slice(0,8)}-${full.slice(8,12)}-4${full.slice(12,15)}-a${full.slice(15,18)}-${full.slice(18,30)}`;
      }
      const uid = (fakeId) => { if(!fakeId) return ""; if(!idMap[fakeId]) idMap[fakeId]=deterministicUuid("resinops-demo-"+String(fakeId)); return idMap[fakeId]; };

      // ── Facility Settings ── rename the current facility for the demo.
      // facilities isn't in dbTransforms' SCHEMAS list, so db.facilities.upsert
      // passes fields straight through — using the real snake_case column
      // names confirmed directly from FacilitySettings.jsx's own save() call.
      try {
        const fid = getCurrentFacility();
        if (fid) {
          await db.facilities.upsert({
            id: fid,
            facility_name: "Cascade Peak Cannabis LLC",
            dba_name: "Cascade Peak",
            license_number: "OCM-AUPR-007891",
            license_type: "Adult-Use Cultivator",
            state: "NY",
            address: "1220 Route 17M",
            city: "Tuxedo",
            zip: "10987",
            phone: "(845) 555-0100",
            email: "ops@cascadepeak.co",
            website: "www.cascadepeak.co",
            timezone: "America/New_York",
            fiscal_year_start: 1,
          });
        }
      } catch(e) { console.warn("Facility settings demo rename skipped:", e.message); }

      // ── Strains ──────────────────────────────────────────
      const strainsRaw = [
        {id:"s1",name:"Gorilla Cake",type:"Hybrid",lineage:"Gorilla Glue #4 × Wedding Cake",breeder:"Archive Seed Bank",thcaAvg:"24.2",thcAvg:"0.21",terpsAvg:"2.8",dominantTerps:"Myrcene, Caryophyllene, Limonene",vegWeeks:"4",flowerWeeks:"9",yieldGSqFt:"48",aroma:"Earthy, vanilla, diesel",flavor:"Sweet cream, fuel, pine",effects:"Heavy body relaxation with euphoric onset",notes:"Top performer — consistent 24%+ THCa across all runs"},
        {id:"s2",name:"Black Maple",type:"Hybrid",lineage:"GMO × Maple Syrup",breeder:"In-house selection",thcaAvg:"26.1",thcAvg:"0.23",terpsAvg:"3.1",dominantTerps:"Myrcene, Ocimene, Linalool",vegWeeks:"4",flowerWeeks:"9",yieldGSqFt:"44",aroma:"Sweet maple, diesel, skunk",flavor:"Syrupy, earthy, kushy",effects:"Deeply relaxing, sleep-promoting",notes:"HLV-free TC stock. Exceptional bag appeal."},
        {id:"s3",name:"Mango Haze",type:"Sativa-dominant",lineage:"Mango × Super Silver Haze",breeder:"Mr. Nice Seeds",thcaAvg:"21.4",thcAvg:"0.18",terpsAvg:"2.4",dominantTerps:"Terpinolene, Ocimene, Myrcene",vegWeeks:"4",flowerWeeks:"10",yieldGSqFt:"52",aroma:"Tropical mango, citrus, floral",flavor:"Mango, pine, sweet",effects:"Uplifting, creative, energetic",notes:"Highest yielder in the lineup. 10-week flower."},
        {id:"s4",name:"Blueberry Headband",type:"Hybrid",lineage:"Blueberry × Headband",breeder:"House genetics",thcaAvg:"22.8",thcAvg:"0.20",terpsAvg:"2.2",dominantTerps:"Myrcene, Caryophyllene, Pinene",vegWeeks:"4",flowerWeeks:"9",yieldGSqFt:"46",aroma:"Blueberry, earthy, floral",flavor:"Berry, cream, pine",effects:"Balanced head and body",notes:"Strong dispensary demand — pre-sold on every run"},
        {id:"s5",name:"Sour Diesel OG",type:"Sativa-dominant",lineage:"Sour Diesel × OG Kush",breeder:"House genetics",thcaAvg:"23.5",thcAvg:"0.20",terpsAvg:"2.6",dominantTerps:"Caryophyllene, Limonene, Myrcene",vegWeeks:"4",flowerWeeks:"10",yieldGSqFt:"49",aroma:"Diesel, lemon, pine",flavor:"Fuel, citrus, earthy",effects:"Energizing, focus-enhancing",notes:"HLV-free run. Post-TC clean stock."},
        {id:"s6",name:"Zaza Runtz",type:"Hybrid",lineage:"Zkittlez × Gelato",breeder:"Cookies",thcaAvg:"25.3",thcAvg:"0.22",terpsAvg:"3.3",dominantTerps:"Limonene, Caryophyllene, Linalool",vegWeeks:"4",flowerWeeks:"8",yieldGSqFt:"42",aroma:"Candy, fruity, tropical",flavor:"Sweet, creamy, tropical",effects:"Euphoric, uplifting, creative",notes:"Premium shelf — commands top price point"},
      ];
      for (const s of strainsRaw) {
        await db.strains.upsert({id:uid(s.id),name:s.name,type:s.type,lineage:s.lineage,breeder:s.breeder,thcaAvg:s.thcaAvg,thcAvg:s.thcAvg,terpsAvg:s.terpsAvg,dominantTerpenes:s.dominantTerps,avgVegWeeks:s.vegWeeks,avgFlowerWeeks:s.flowerWeeks,avgYieldGPerSqft:s.yieldGSqFt,aroma:s.aroma,flavor:s.flavor,effects:s.effects,notes:s.notes});
      }

      // ── Grow Rooms (Grow Map) ───────────────────────────────────
      const growMapRaw = [
        {id:"gr1",name:"Flower Room 1",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR1",notes:"Main production room"},
        {id:"gr2",name:"Flower Room 2",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR2",notes:""},
        {id:"gr3",name:"Flower Room 3",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR3",notes:""},
        {id:"gr4",name:"Flower Room 4",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR4",notes:""},
        {id:"gr5",name:"Flower Room 5",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR5",notes:""},
        {id:"gr6",name:"Flower Room 6",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR6",notes:""},
        {id:"gr7",name:"Flower Room 7",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"cleaning",sensorId:"GR-FR7",notes:"Post-harvest cleaning"},
        {id:"gr8",name:"Flower Room 8",type:"Indoor",sqft:"1200",canopy:"960",maxPlants:"64",lightType:"LED",lightCount:"16",lightWatts:"650",status:"active",sensorId:"GR-FR8",notes:""},
        {id:"gr9",name:"Veg Room",type:"Veg",sqft:"800",canopy:"640",maxPlants:"128",lightType:"LED",lightCount:"8",lightWatts:"400",status:"active",sensorId:"GR-VEG",notes:"Mixed strains pre-flower"},
        {id:"gr10",name:"Mother Room",type:"Mother Room",sqft:"400",canopy:"320",maxPlants:"24",lightType:"LED",lightCount:"4",lightWatts:"400",status:"active",sensorId:"GR-MOM",notes:"6 strains in rotation"},
        {id:"gr11",name:"Propagation / Clone Room",type:"Propagation",sqft:"300",canopy:"240",maxPlants:"512",lightType:"T5 Fluorescent",lightCount:"8",lightWatts:"54",status:"active",sensorId:"GR-PROP",notes:"Clone propagation trays"},
        {id:"gr12",name:"Genetics Lab / TC",type:"Genetics Lab / TC",sqft:"150",canopy:"",maxPlants:"",lightType:"LED",lightCount:"2",lightWatts:"100",status:"active",sensorId:"GR-TC",notes:"Tissue culture clean room"},
      ];
      for (const g of growMapRaw) {
        await db.grow_rooms.upsert({id:uid(g.id),name:g.name,roomType:g.type,sqft:g.sqft,canopySqft:g.canopy,maxPlants:g.maxPlants,lightType:g.lightType,lightCount:g.lightCount,lightWatts:g.lightWatts,status:g.status,sensorId:g.sensorId,notes:g.notes});
      }

      // ── Grow Spaces ──────────────────────────────────────────
      const growSpacesRaw = [
        {id:"gs_001",name:"FR5 — Gorilla Cake Cycle 4",d:"2026-05-10",veg:"4",flw:"9",strains:[{id:1,name:"Gorilla Cake",plants:"64"}],growMapId:"",status:"active",topping:[{id:"top_gs001_1",date:"2026-05-25",node:4,strainName:"Gorilla Cake"},{id:"top_gs001_2",date:"2026-06-05",node:6,strainName:"Gorilla Cake"}]},
        {id:"gs_002",name:"FR6 — Black Maple Cycle 4",d:"2026-05-03",veg:"4",flw:"9",strains:[{id:1,name:"Black Maple",plants:"64"}],growMapId:"",status:"active"},
        {id:"gs_003",name:"FR7 — Mango Haze Cycle 2",d:"2026-04-26",veg:"4",flw:"10",strains:[{id:1,name:"Mango Haze",plants:"64"}],growMapId:"",status:"cleaning"},
        {id:"gs_004",name:"FR8 — Gorilla Cake Cycle 3",d:"2026-06-13",veg:"4",flw:"9",strains:[{id:1,name:"Gorilla Cake",plants:"64"}],growMapId:"",status:"active"},
        {id:"gs_005",name:"FR1 — Mango Haze Cycle 3",d:"2026-06-20",veg:"4",flw:"10",strains:[{id:1,name:"Mango Haze",plants:"64"}],growMapId:"",status:"active"},
        {id:"gs_006",name:"FR2 — Sour Diesel OG Cycle 2",d:"2026-06-27",veg:"4",flw:"10",strains:[{id:1,name:"Sour Diesel OG",plants:"64"}],growMapId:"",status:"active"},
        {id:"gs_007",name:"FR3 — Blueberry Headband Cycle 3",d:"2026-07-04",veg:"4",flw:"9",strains:[{id:1,name:"Blueberry Headband",plants:"64"}],growMapId:"",status:"active"},
        {id:"gs_008",name:"FR4 — Zaza Runtz Cycle 3",d:"2026-07-11",veg:"4",flw:"8",strains:[{id:1,name:"Zaza Runtz",plants:"64"}],growMapId:"",status:"active"},
        {id:"gs_009",name:"Veg — Mixed Strains",d:"2026-06-20",veg:"4",flw:"0",strains:[{id:1,name:"Mango Haze",plants:"32"},{id:2,name:"Blueberry Headband",plants:"32"}],growMapId:"",status:"active",topping:[{id:"top_gs009_1",date:"2026-07-10",node:3,strainName:"Mango Haze"}]},
      ];
      for (const gs of growSpacesRaw) {
        await db.grow_spaces.upsert({id:uid(gs.id),name:gs.name,d:gs.d,veg:gs.veg,flw:gs.flw,strains:gs.strains,plants:gs.strains.reduce((a,x)=>a+(parseInt(x.plants)||0),0),growMapId:gs.growMapId?uid(gs.growMapId):"",status:gs.status,toppingLog:gs.topping||[]});
      }

      // ── Clone Schedules ──────────────────────────────────
      const today2 = new Date();
      const fmt = d => d.toISOString().split("T")[0];
      const addD = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
      const cloneSchedulesRaw = [
        {id:"cs_001",strainName:"Black Maple",motherId:"",cutDate:fmt(addD(today2,5)),rootDays:"14",vegWeeks:"4",targetRoom:"Flower Room 6",cutQty:"32",status:"upcoming",notes:"FR6 flips to flower Jul 10 — cuts needed by Jul 5"},
        {id:"cs_002",strainName:"Gorilla Cake",motherId:"",cutDate:fmt(addD(today2,12)),rootDays:"14",vegWeeks:"4",targetRoom:"Flower Room 5",cutQty:"32",status:"upcoming",notes:"FR5 harvest Jul 17 — next cycle cuts needed Jul 17"},
        {id:"cs_003",strainName:"Mango Haze",motherId:"",cutDate:fmt(addD(today2,-3)),rootDays:"14",vegWeeks:"4",targetRoom:"Flower Room 7",cutQty:"64",status:"rooting",notes:"Cuts taken Jul 2 — in propagation trays"},
        {id:"cs_004",strainName:"Blueberry Headband",motherId:"",cutDate:fmt(addD(today2,19)),rootDays:"14",vegWeeks:"4",targetRoom:"Flower Room 3",cutQty:"64",status:"upcoming",notes:"FR3 scheduled flip Aug 1"},
      ];
      for (const c of cloneSchedulesRaw) {
        await db.clone_schedules.upsert({...c, id: uid(c.id), harvestDate: c.cutDate, plannedPlants: c.cutQty});
      }

      // ── Mother Plants ────────────────────────────────────
      const motherPlantsRaw = [
        {id:"mom_001",strainName:"Black Maple",roomId:"gr10",plantCount:6,introducedDate:"2025-11-01",cycleWeeks:"6",status:"active",cutsPerPlantPerCycle:"8",notes:"Primary Black Maple mother line — HLV-free TC stock.",cutLog:[{id:"cl_mom001_1",date:"2026-07-05",cutsTotal:"48",cutsPerPlant:"8",health:"Good",notes:"Routine cutting cycle — cuts sent to FR6 next cycle."}]},
        {id:"mom_002",strainName:"Gorilla Cake",roomId:"gr10",plantCount:6,introducedDate:"2025-10-15",cycleWeeks:"6",status:"active",cutsPerPlantPerCycle:"8",notes:"Top-performer mother line — consistent 24%+ THCa.",cutLog:[{id:"cl_mom002_1",date:"2026-07-12",cutsTotal:"48",cutsPerPlant:"8",health:"Good",notes:"Cuts taken for FR5 next cycle."}]},
        {id:"mom_003",strainName:"Sour Diesel OG",roomId:"gr10",plantCount:4,introducedDate:"2026-01-10",cycleWeeks:"6",status:"active",cutsPerPlantPerCycle:"6",notes:"Post-TC clean stock, HLV-free run.",cutLog:[]},
      ];
      for (const m of motherPlantsRaw) {
        await db.mother_plants.upsert({...m, id: uid(m.id), roomId: uid(m.roomId)});
      }

      // ── Harvest Batches ─────────────────────────────────
      const harvestBatchesRaw = [
        {id:1001,strainName:"Gorilla Cake",spaceName:"Flower Room 5",spaceId:"gs_001",plants:64,d:"2026-06-28",wetWeightG:36287,totalDryWeight:8165,status:"done",coaSampleId:"KC-NY-2026-0841",labName:"Kaycha Labs NY",thca:"24.1",trimMethods:{aa:"hand",a:"hand",b:"machine",c:"machine"},grades:{aa:{weight:"2840",s2s:""},a:{weight:"3120",s2s:""},b:{weight:"1490",s2s:""},c:{weight:"420",s2s:""},trim:{weight:"295",s2s:""},waste:{weight:"0",s2s:""}},steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1002,strainName:"Black Maple",spaceName:"Flower Room 6",spaceId:"gs_002",plants:64,d:"2026-06-21",wetWeightG:33520,totalDryWeight:7620,status:"done",coaSampleId:"KC-NY-2026-0822",labName:"Kaycha Labs NY",thca:"26.0",trimMethods:{aa:"hand",a:"hand",b:"machine",c:"machine"},grades:{aa:{weight:"2650",s2s:""},a:{weight:"2920",s2s:""},b:{weight:"1380",s2s:""},c:{weight:"390",s2s:""},trim:{weight:"280",s2s:""},waste:{weight:"0",s2s:""}},steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1003,strainName:"Mango Haze",spaceName:"Flower Room 7",spaceId:"gs_003",plants:64,d:"2026-06-14",wetWeightG:38940,totalDryWeight:9280,status:"done",coaSampleId:"KC-NY-2026-0798",labName:"Kaycha Labs NY",thca:"21.3",trimMethods:{aa:"hand",a:"hand",b:"machine",c:"machine"},grades:{aa:{weight:"3210",s2s:""},a:{weight:"3640",s2s:""},b:{weight:"1740",s2s:""},c:{weight:"410",s2s:""},trim:{weight:"280",s2s:""},waste:{weight:"0",s2s:""}},steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:4},{n:"Curing",days:14}]},
        {id:1004,strainName:"Blueberry Headband",spaceName:"Flower Room 1",spaceId:"gs_005",plants:64,d:"2026-05-31",wetWeightG:34810,totalDryWeight:7940,status:"done",coaSampleId:"KC-NY-2026-0761",labName:"Kaycha Labs NY",thca:"22.7",trimMethods:{aa:"hand",a:"hand",b:"machine",c:"machine"},grades:{aa:{weight:"2760",s2s:""},a:{weight:"3050",s2s:""},b:{weight:"1440",s2s:""},c:{weight:"410",s2s:""},trim:{weight:"280",s2s:""},waste:{weight:"0",s2s:""}},steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1005,strainName:"Sour Diesel OG",spaceName:"Flower Room 2",spaceId:"gs_006",plants:64,d:"2026-05-24",wetWeightG:36420,totalDryWeight:8290,status:"done",coaSampleId:"KC-NY-2026-0744",labName:"Kaycha Labs NY",thca:"23.4",trimMethods:{aa:"hand",a:"hand",b:"machine",c:"machine"},grades:{aa:{weight:"2880",s2s:""},a:{weight:"3190",s2s:""},b:{weight:"1510",s2s:""},c:{weight:"430",s2s:""},trim:{weight:"280",s2s:""},waste:{weight:"0",s2s:""}},steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        // ── Additional harvests feeding the trailing/forward production
        // batches below (Forecast tab + Annual 280E Summary need batches
        // spread across ~15 months, not just this one July cluster).
        {id:1006,strainName:"Zaza Runtz",spaceName:"Flower Room 3",spaceId:"gs_004",plants:64,d:"2026-03-15",wetWeightG:35200,totalDryWeight:8010,status:"done",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1007,strainName:"Gorilla Cake",spaceName:"Flower Room 7",spaceId:"gs_007",plants:64,d:"2026-03-28",wetWeightG:34600,totalDryWeight:7850,status:"done",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1008,strainName:"Mango Haze",spaceName:"Flower Room 8",spaceId:"gs_008",plants:64,d:"2026-04-25",wetWeightG:36100,totalDryWeight:8340,status:"done",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1009,strainName:"Sour Diesel OG",spaceName:"Veg — Mixed Strains",spaceId:"gs_009",plants:64,d:"2026-07-25",wetWeightG:36400,totalDryWeight:8300,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1010,strainName:"Gorilla Cake",spaceName:"Flower Room 5",spaceId:"gs_001",plants:64,d:"2026-08-20",wetWeightG:35900,totalDryWeight:8180,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1011,strainName:"Black Maple",spaceName:"Flower Room 6",spaceId:"gs_002",plants:64,d:"2026-09-20",wetWeightG:33800,totalDryWeight:7690,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1012,strainName:"Mango Haze",spaceName:"Flower Room 7",spaceId:"gs_003",plants:64,d:"2026-10-20",wetWeightG:39100,totalDryWeight:9350,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:4},{n:"Curing",days:14}]},
        {id:1013,strainName:"Blueberry Headband",spaceName:"Flower Room 3",spaceId:"gs_004",plants:64,d:"2026-11-20",wetWeightG:35000,totalDryWeight:8000,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1014,strainName:"Sour Diesel OG",spaceName:"Flower Room 1",spaceId:"gs_005",plants:64,d:"2026-12-20",wetWeightG:36700,totalDryWeight:8360,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1015,strainName:"Zaza Runtz",spaceName:"Flower Room 2",spaceId:"gs_006",plants:64,d:"2027-01-20",wetWeightG:34400,totalDryWeight:7830,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1016,strainName:"Gorilla Cake",spaceName:"Flower Room 7",spaceId:"gs_007",plants:64,d:"2027-02-20",wetWeightG:35600,totalDryWeight:8100,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1017,strainName:"Black Maple",spaceName:"Flower Room 8",spaceId:"gs_008",plants:64,d:"2027-03-20",wetWeightG:33700,totalDryWeight:7660,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1018,strainName:"Mango Haze",spaceName:"Veg — Mixed Strains",spaceId:"gs_009",plants:64,d:"2027-04-20",wetWeightG:38700,totalDryWeight:9260,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:4},{n:"Curing",days:14}]},
        {id:1019,strainName:"Blueberry Headband",spaceName:"Flower Room 5",spaceId:"gs_001",plants:64,d:"2027-05-20",wetWeightG:34900,totalDryWeight:7960,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
        {id:1020,strainName:"Sour Diesel OG",spaceName:"Flower Room 6",spaceId:"gs_002",plants:64,d:"2027-06-20",wetWeightG:36500,totalDryWeight:8320,status:"scheduled",steps:[{n:"Hang Dry",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:14}]},
      ];
      for (const h of harvestBatchesRaw) {
        await db.harvest_batches.upsert({...h, id: uid(h.id), spaceId: h.spaceId?uid(h.spaceId):""});
      }

      // ── QC Tests / COAs ───────────────────────────────
      const qcTestsRaw = [
        {id:"q1",strainName:"Gorilla Cake",sampleId:"KC-NY-2026-0841",batchId:1001,batchType:"harvest",labName:"Kaycha Labs NY",dateSubmitted:"2026-06-30",dateReported:"2026-07-05",thca:"24.1",thc:"0.21",totalThc:"21.37",cbd:"0.04",cbg:"0.31",cbn:"0.08",totalTerpenes:"2.84",myrcene:"1.12",caryophyllene:"0.64",limonene:"0.48",linalool:"0.21",humulene:"0.18",ocimene:"0.21",overallPass:true,pesticidesPass:true,heavyMetalsPass:true,microbialsPass:true,tyam:180,tab:320,waterActivity:0.561,moistureContent:8.4,foreignMatterPass:true},
        {id:"q2",strainName:"Black Maple",sampleId:"KC-NY-2026-0822",batchId:1002,batchType:"harvest",labName:"Kaycha Labs NY",dateSubmitted:"2026-06-23",dateReported:"2026-06-28",thca:"26.0",thc:"0.23",totalThc:"23.03",cbd:"0.03",cbg:"0.28",cbn:"0.06",totalTerpenes:"3.12",myrcene:"1.34",caryophyllene:"0.58",ocimene:"0.44",linalool:"0.38",limonene:"0.21",humulene:"0.17",overallPass:true,pesticidesPass:true,heavyMetalsPass:true,microbialsPass:true,tyam:220,tab:280,waterActivity:0.558,moistureContent:8.1,foreignMatterPass:true},
        {id:"q3",strainName:"Mango Haze",sampleId:"KC-NY-2026-0798",batchId:1003,batchType:"harvest",labName:"Kaycha Labs NY",dateSubmitted:"2026-06-16",dateReported:"2026-06-21",thca:"21.3",thc:"0.18",totalThc:"18.87",cbd:"0.06",cbg:"0.22",cbn:"0.04",totalTerpenes:"2.41",myrcene:"0.82",terpinolene:"0.64",ocimene:"0.48",limonene:"0.28",caryophyllene:"0.19",overallPass:true,pesticidesPass:true,heavyMetalsPass:true,microbialsPass:true,tyam:160,tab:290,waterActivity:0.562,moistureContent:8.6,foreignMatterPass:true},
        {id:"q4",strainName:"Blueberry Headband",sampleId:"KC-NY-2026-0761",batchId:1004,batchType:"harvest",labName:"Kaycha Labs NY",dateSubmitted:"2026-06-02",dateReported:"2026-06-07",thca:"22.7",thc:"0.20",totalThc:"20.11",cbd:"0.05",cbg:"0.24",cbn:"0.07",totalTerpenes:"2.23",myrcene:"0.94",caryophyllene:"0.52",pinene:"0.31",linalool:"0.24",limonene:"0.22",overallPass:true,pesticidesPass:true,heavyMetalsPass:true,microbialsPass:true,tyam:190,tab:310,waterActivity:0.559,moistureContent:8.3,foreignMatterPass:true},
        {id:"q5",strainName:"Sour Diesel OG",sampleId:"KC-NY-2026-0744",batchId:1005,batchType:"harvest",labName:"Kaycha Labs NY",dateSubmitted:"2026-05-26",dateReported:"2026-05-31",thca:"23.4",thc:"0.20",totalThc:"20.73",cbd:"0.04",cbg:"0.26",cbn:"0.05",totalTerpenes:"2.61",myrcene:"0.88",caryophyllene:"0.72",limonene:"0.54",humulene:"0.28",pinene:"0.19",overallPass:true,pesticidesPass:true,heavyMetalsPass:true,microbialsPass:true,tyam:170,tab:300,waterActivity:0.560,moistureContent:8.2,foreignMatterPass:true},
      ];
      for (const q of qcTestsRaw) {
        const {id,batchId,...rest} = q;
        await db.qc_tests.upsert({...rest, id: uid(id), harvestBatchId: uid(batchId), batchId: uid(batchId), batchName: q.strainName+" Harvest", submittedDate: q.dateSubmitted, expectedDate: q.dateReported, receivedDate: q.dateReported, microbialPass: q.microbialsPass});
      }

      // ── Production Batches ──────────────────────────────
      const FLOWER_STEPS = [{n:"Trimming",days:3},{n:"Curing",days:14},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
      const PREROLL_STEPS = [{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:7},{n:"Packaging",days:2},{n:"Inventory",days:1}];
      const EXTRACT_STEPS = [{n:"Intake & Prep",days:2},{n:"Extraction",days:3},{n:"Post-Processing",days:5},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];

      // ── Spread-out batches (trailing trend + forward forecast) ──────
      // Built from a compact template + builder instead of ~30 fully
      // hand-authored objects — same field shape as the hand-authored
      // batches above, just generated. Fills the Forecast tab's 15-month
      // window (3 back, 12 forward) and gives the Annual 280E Summary
      // more than one month of data to roll up.
      const SPREAD_FLAVORS = [
        {cat:"whole_flower",sub:"",catLabel:"Whole Flower",subLabel:"",nameSuffix:"3.5g Retail",steps:FLOWER_STEPS,packagingContainer:"cr_glass_jar",harvestGrade:"aa",inputAmt:2600,units:740,pkg:"3.5g jars",unitPrice:19},
        {cat:"pre_roll",sub:"",catLabel:"Pre-Roll",subLabel:"",nameSuffix:"Pre-Roll 1g 5pk",steps:PREROLL_STEPS,packagingContainer:"poptop_multi",packagingUnitsPerPack:5,harvestGrade:"b",inputAmt:1700,units:1550,pkg:"5-packs",unitPrice:24},
        {cat:"vape",sub:"cartridge",catLabel:"Vape",subLabel:"Cartridge",nameSuffix:"1g Vape",steps:[{n:"Formulation",days:1},{n:"Filling",days:2},{n:"QC / Testing",days:7},{n:"Packaging",days:2},{n:"Inventory",days:1}],packagingContainer:"individual_tube",vapeHardware:"fg_z510",inputAmt:1450,units:1400,pkg:"1g carts",unitPrice:28,noHarvest:true},
        {cat:"extract",sub:"rosin_hash",catLabel:"Extract / Concentrate",subLabel:"Rosin — Hash Press",nameSuffix:"Hash Rosin",steps:EXTRACT_STEPS,packagingContainer:"glass_jar_5ml",harvestGrade:"trim",inputAmt:230,units:180,pkg:"g hash rosin",unitPrice:65,noUnitRegex:true},
      ];
      const SPREAD_STRAINS = ["Gorilla Cake","Black Maple","Mango Haze","Blueberry Headband","Sour Diesel OG","Zaza Runtz"];

      function mkSpreadBatch(id, d, flavorIdx, strainIdx, harvestBatchId, status) {
        const f = SPREAD_FLAVORS[flavorIdx % SPREAD_FLAVORS.length];
        const strain = SPREAD_STRAINS[strainIdx % SPREAD_STRAINS.length];
        const code = strain.split(" ").map(w=>w[0]).join("").toUpperCase();
        const yieldEst = f.noUnitRegex ? `~${f.units}${f.pkg}` : `~${f.units.toLocaleString()} × ${f.pkg}`;
        const useHarvest = !f.noHarvest && harvestBatchId;
        return {
          id, name:`${code}-${d.replace(/-/g,"").slice(0,6)} — ${strain} ${f.nameSuffix}`,
          cat:f.cat, sub:f.sub, strains:strain, d, inputAmt:String(f.inputAmt), unit:"g", status,
          catLabel:f.catLabel, subLabel:f.subLabel, yieldEst,
          packagingContainer:f.packagingContainer,
          ...(f.packagingUnitsPerPack?{packagingUnitsPerPack:f.packagingUnitsPerPack}:{}),
          ...(f.vapeHardware?{vapeHardware:f.vapeHardware}:{}),
          ...(useHarvest?{harvestBatchId, harvestGrade:f.harvestGrade}:{}),
          steps:f.steps.map(s=>({...s})), isLinked:false, unitPrice:f.unitPrice,
        };
      }

      const LABOR_BY_FLAVOR = [
        [{laborTypeId:"lt_7",hours:10},{laborTypeId:"lt_8",hours:6}],
        [{laborTypeId:"lt_9",hours:5}],
        [{laborTypeId:"lt_14",hours:6},{laborTypeId:"lt_15",hours:4}],
        [{laborTypeId:"lt_5",hours:6}],
      ];

      // Trailing (3 months back) — trend context, sourced from the March/
      // April harvests above so every harvest→production date stays
      // chronologically valid.
      const TRAILING = [
        {id:"pb_t01", d:"2026-04-12", flavorIdx:0, strainIdx:5, harvestBatchId:1006},
        {id:"pb_t02", d:"2026-04-26", flavorIdx:1, strainIdx:0, harvestBatchId:1007},
        {id:"pb_t03", d:"2026-05-10", flavorIdx:2, strainIdx:2, harvestBatchId:1008},
        {id:"pb_t04", d:"2026-05-24", flavorIdx:3, strainIdx:5, harvestBatchId:1006},
        {id:"pb_t05", d:"2026-06-08", flavorIdx:0, strainIdx:4, harvestBatchId:1005},
        {id:"pb_t06", d:"2026-06-22", flavorIdx:1, strainIdx:3, harvestBatchId:1004},
      ];
      // Forward (12 months) — 2 batches/month, one harvest per month.
      const FORWARD_MONTHS = [
        {m:"2026-08",harvestId:1009,strainIdx:4}, {m:"2026-09",harvestId:1010,strainIdx:0},
        {m:"2026-10",harvestId:1011,strainIdx:1}, {m:"2026-11",harvestId:1012,strainIdx:2},
        {m:"2026-12",harvestId:1013,strainIdx:3}, {m:"2027-01",harvestId:1014,strainIdx:4},
        {m:"2027-02",harvestId:1015,strainIdx:5}, {m:"2027-03",harvestId:1016,strainIdx:0},
        {m:"2027-04",harvestId:1017,strainIdx:1}, {m:"2027-05",harvestId:1018,strainIdx:2},
        {m:"2027-06",harvestId:1019,strainIdx:3}, {m:"2027-07",harvestId:1020,strainIdx:4},
      ];
      const FORWARD = [];
      FORWARD_MONTHS.forEach((mo,i) => {
        FORWARD.push({id:`pb_f${String(i*2+1).padStart(2,"0")}`, d:`${mo.m}-08`, flavorIdx:(i*2)%4, strainIdx:mo.strainIdx, harvestBatchId:mo.harvestId});
        FORWARD.push({id:`pb_f${String(i*2+2).padStart(2,"0")}`, d:`${mo.m}-22`, flavorIdx:(i*2+1)%4, strainIdx:(mo.strainIdx+1)%6, harvestBatchId:mo.harvestId});
      });

      const spreadBatches = [
        ...TRAILING.map(t=>mkSpreadBatch(t.id, t.d, t.flavorIdx, t.strainIdx, t.harvestBatchId, "in_progress")),
        ...FORWARD.map(t=>mkSpreadBatch(t.id, t.d, t.flavorIdx, t.strainIdx, t.harvestBatchId, "scheduled")),
      ];
      const spreadLaborLines = Object.fromEntries(
        [...TRAILING, ...FORWARD].map(t => [t.id, LABOR_BY_FLAVOR[t.flavorIdx % SPREAD_FLAVORS.length]])
      );

      const demoProdBatchesRaw = [
        {id:"pb_001",name:"GC-2026-07A — Gorilla Cake 3.5g Retail",cat:"whole_flower",sub:"",strains:"Gorilla Cake",d:"2026-07-08",inputAmt:"2840",unit:"g",status:"in_progress",catLabel:"Whole Flower",subLabel:"",yieldEst:"~810 × 3.5g jars",packagingContainer:"cr_glass_jar",packagingItemId:"inv_001",harvestBatchId:1001,harvestGrade:"aa",steps:FLOWER_STEPS.map(s=>({...s})),isLinked:false,unitPrice:18},
        {id:"pb_002",name:"BM-2026-07A — Black Maple 3.5g Retail",cat:"whole_flower",sub:"",strains:"Black Maple",d:"2026-07-08",inputAmt:"2650",unit:"g",status:"in_progress",catLabel:"Whole Flower",subLabel:"",yieldEst:"~757 × 3.5g jars",packagingContainer:"cr_glass_jar",harvestBatchId:1002,harvestGrade:"aa",steps:FLOWER_STEPS.map(s=>({...s})),isLinked:false,unitPrice:20},
        {id:"pb_003",name:"MH-2026-07A — Mango Haze Pre-Roll 1g 5pk",cat:"pre_roll",sub:"",strains:"Mango Haze",d:"2026-07-10",inputAmt:"1740",unit:"g",status:"scheduled",catLabel:"Pre-Roll",subLabel:"",yieldEst:"~1,600 × 5-packs",packagingContainer:"poptop_multi",packagingUnitsPerPack:5,harvestBatchId:1003,harvestGrade:"b",steps:PREROLL_STEPS.map(s=>({...s})),isLinked:false,unitPrice:24},
        {id:"pb_004",name:"CP-2026-07A — Mixed Strain Distillate",cat:"extract",sub:"sp_lab10",strains:"Gorilla Cake, Black Maple",d:"2026-07-15",inputAmt:"2200",unit:"g",status:"scheduled",catLabel:"Extract / Concentrate",subLabel:"Short Path — Lab Society 10L",yieldEst:"~1,760g distillate (80% overall) · 7h 1st pass + 6h 2nd pass",packagingContainer:"applicator_syringe",steps:EXTRACT_STEPS.map(s=>({...s})),isLinked:false,unitPrice:45},
        {id:"pb_005",name:"CP-2026-07A — Mixed Strain H/T (Edibles Grade)",cat:"extract",sub:"distillate",strains:"Gorilla Cake, Black Maple",d:"2026-07-15",inputAmt:"200",unit:"g",status:"scheduled",catLabel:"Extract / Concentrate",subLabel:"Distillate (Edibles Grade)",yieldEst:"~200g heads/tails fraction",packagingContainer:"glass_jar",steps:EXTRACT_STEPS.map(s=>({...s})),isLinked:true,linkedTo:"pb_004",unitPrice:20},
        {id:"pb_006",name:"BH-2026-07A — Blueberry Headband 1g Vape",cat:"vape",sub:"cartridge",strains:"Blueberry Headband",d:"2026-07-20",inputAmt:"1500",unit:"g",status:"scheduled",catLabel:"Vape",subLabel:"Cartridge",yieldEst:"~1,455 × 1g carts",packagingContainer:"individual_tube",vapeHardware:"fg_z510",steps:[{n:"Formulation",days:1},{n:"Filling",days:2},{n:"QC / Testing",days:7},{n:"Packaging",days:2},{n:"Inventory",days:1}],isLinked:false,unitPrice:28},
        {id:"pb_007",name:"ZR-2026-07A — Zaza Runtz 7g Retail",cat:"whole_flower",sub:"",strains:"Zaza Runtz",d:"2026-07-22",inputAmt:"1800",unit:"g",status:"scheduled",catLabel:"Whole Flower",subLabel:"",yieldEst:"~257 × 7g jars",packagingContainer:"cr_glass_jar",steps:FLOWER_STEPS.map(s=>({...s})),isLinked:false,unitPrice:42},
        {id:"pb_008",name:"SD-2026-07A — Sour Diesel OG Live Resin",cat:"extract",sub:"live_resin",strains:"Sour Diesel OG",d:"2026-07-18",inputAmt:"3200",unit:"g",status:"scheduled",catLabel:"Extract / Concentrate",subLabel:"BHO — Live Resin",yieldEst:"~480g live resin",packagingContainer:"glass_jar_5ml",steps:EXTRACT_STEPS.map(s=>({...s})),isLinked:false,unitPrice:55},
        {id:"pb_009",name:"GC-2026-07C — Gorilla Cake Ice Water Hash",cat:"extract",sub:"hash",strains:"Gorilla Cake",d:"2026-07-01",inputAmt:"2000",unit:"g",status:"in_progress",catLabel:"Extract / Concentrate",subLabel:"Ice Water Hash",yieldEst:"~245g dry hash (12% yield)",packagingContainer:"glass_jar",harvestBatchId:1001,harvestGrade:"trim",steps:EXTRACT_STEPS.map(s=>({...s})),isLinked:false,inputMaterialType:"Dry Trim",unitPrice:48,
          washEvents:[{id:uid("we_pb009_1"),date:"2026-06-29",waterTempF:"34",iceRatio:"1:1",agitationMethod:"wash_machine",agitationTimeMin:"18",numberOfWashes:"6",washVessel:"Pure Extraction Machine",inputWeightG:"2000",grades:[{micron:45,wetWeightG:"180"},{micron:73,wetWeightG:"420"},{micron:90,wetWeightG:"260"},{micron:120,wetWeightG:"140"},{micron:160,wetWeightG:"80"},{micron:220,wetWeightG:"40"}],notes:"Fresh frozen Gorilla Cake trim, single wash session."}],
          freezeDryCycles:[{id:uid("fdc_pb009_1"),sourceWashId:uid("we_pb009_1"),date:"2026-07-01",equipmentBrand:"harvest_right",equipmentModel:"hr_medium",batchSizeG:"1120",shelfTempF:"",condenserTempF:"-40",vacuumLevel:"Auto",cycleTimeHours:"30",finalDryWeightG:"245",notes:"Standard cycle, all micron grades combined."}]},
        {id:"pb_010",name:"GC-2026-07B — Gorilla Cake Hash Rosin",cat:"extract",sub:"rosin_hash",strains:"Gorilla Cake",d:"2026-07-05",inputAmt:"245",unit:"g",status:"in_progress",catLabel:"Extract / Concentrate",subLabel:"Rosin — Hash Press",yieldEst:"~196g hash rosin (80% press yield)",packagingContainer:"glass_jar_5ml",steps:EXTRACT_STEPS.map(s=>({...s})),isLinked:false,unitPrice:65,
          pressRuns:[{id:uid("pr_pb010_1"),sourceBatchId:uid("pb_009"),sourceFreezeDryId:uid("fdc_pb009_1"),date:"2026-07-05",pressBrand:"lowtemp",pressModel:"lt_v2_3x5",plateTempF:"180",pressTimeSec:"90",pressure:"20 tons",bagMicron:90,packingMethod:"prepress_puck_bag",prePressWeightG:"245",postPressYieldG:"196",notes:"Clean full-melt run, minimal blowout."}],
          coldCureBatches:[{id:uid("cc_pb010_1"),sourcePressRunId:uid("pr_pb010_1"),dateStarted:"2026-07-05",dateEnded:"2026-07-19",tempF:"38",resultingConsistency:"Budder / Batter",notes:"14-day cold cure, whipped to batter consistency."}]},
        {id:"pb_011",name:"MH-2026-07B — Mango Haze Flower Rosin",cat:"extract",sub:"rosin_fl",strains:"Mango Haze",d:"2026-07-12",inputAmt:"500",unit:"g",status:"in_progress",catLabel:"Extract / Concentrate",subLabel:"Rosin — Flower Press",yieldEst:"~65g flower rosin (13% yield)",packagingContainer:"glass_jar_1g",steps:EXTRACT_STEPS.map(s=>({...s})),isLinked:false,unitPrice:70,
          pressRuns:[{id:uid("pr_pb011_1"),sourceBatchId:"",sourceFreezeDryId:"",date:"2026-07-12",pressBrand:"pure_pressure",pressModel:"pp_pikes_peak",plateTempF:"195",pressTimeSec:"75",pressure:"5 tons",bagMicron:73,packingMethod:"loose_bag",prePressWeightG:"500",postPressYieldG:"65",notes:"Fresh flower rosin, single-pass press."}]},
        ...spreadBatches,
      ];
      for (const p of demoProdBatchesRaw) {
        const {id,harvestBatchId,linkedTo,packagingItemId,...rest} = p;
        await db.production_batches.upsert({...rest, id: uid(id), harvestBatchId: harvestBatchId?uid(harvestBatchId):"", linkedTo: linkedTo?uid(linkedTo):"", packagingItemId: packagingItemId?uid(packagingItemId):""});
      }

      // ── COGS Records ── per-batch revenue overlay (rev_per_unit) that
      // Finance's Cost & P&L page already reads — mirrors each batch's
      // unitPrice above so Finance stays consistent with what's shown
      // directly on the batch.
      for (const p of demoProdBatchesRaw) {
        if (!p.unitPrice) continue;
        await db.cogs_records.upsert({id: uid("cogs_"+p.id), batchId: uid(p.id), revPerUnit: p.unitPrice});
      }

      // ── SKUs ──────────────────────────────────────────
      const skusRaw = [
        {id:"sku_wf35",product:"Whole Flower 3.5g",sku:"CP-WF-3.5",price:18.00,unit:"each",cat:"whole_flower",notes:"Standard retail 3.5g jar"},
        {id:"sku_wf7", product:"Whole Flower 7g",  sku:"CP-WF-7",  price:32.00,unit:"each",cat:"whole_flower",notes:""},
        {id:"sku_wf28",product:"Whole Flower 28g", sku:"CP-WF-28", price:110.00,unit:"each",cat:"whole_flower",notes:"Ounce — wholesale"},
        {id:"sku_pr1", product:"Pre-Roll 1g",      sku:"CP-PR-1",  price:8.00, unit:"each",cat:"pre_roll",   notes:"Single 1g cone"},
        {id:"sku_pr5", product:"Pre-Roll 5-pack",  sku:"CP-PR-5",  price:35.00,unit:"each",cat:"pre_roll",   notes:"5x0.5g pack"},
        {id:"sku_ros", product:"Live Rosin 1g",    sku:"CP-LR-1",  price:65.00,unit:"each",cat:"extract",    notes:"Solventless rosin"},
        {id:"sku_vape",product:"Vape Cartridge 0.5g",sku:"CP-VC-05",price:45.00,unit:"each",cat:"vape",     notes:"510 thread"},
      ];
      for (const s of skusRaw) {
        await db.skus.upsert({id:uid(s.id),product:s.product,skuCode:s.sku,unitPrice:s.price,category:s.cat,active:true});
      }

      // ── BOMs ── real recipes referencing real inventory_items ids (not
      // the old bomsRaw shape — product/items[].unitCost — which neither
      // Finance.jsx's BOM editor nor real stock deduction understands).
      // Only covers categories the demo production batches actually use,
      // against items that actually have received stock (see the PO
      // receiving backfill above) so deducting against them is meaningful.
      const bomsRaw = [
        {id:"bom_wf",name:"Whole Flower",category:"whole_flower",subcategory:"",testFee:350,
          items:[
            {itemId:"inv_001",qty:1,qtyType:"per_unit_output",note:"Glass jar per unit"},
            {itemId:"inv_002",qty:1,qtyType:"per_unit_output",note:"Label per unit"},
          ]},
        {id:"bom_pr",name:"Pre-Roll",category:"pre_roll",subcategory:"",testFee:350,
          items:[
            {itemId:"inv_003",qty:1,qtyType:"per_unit_output",note:"Cone per unit"},
          ]},
        {id:"bom_lr",name:"BHO Live Resin",category:"extract",subcategory:"live_resin",testFee:450,
          items:[
            {itemId:"inv_006",qty:1.5,qtyType:"per_lb_input",note:"Butane: 1.5 lbs per lb biomass"},
          ]},
        {id:"bom_vape",name:"Vape Cartridge",category:"vape",subcategory:"cartridge",testFee:400,
          items:[
            {itemId:"inv_002",qty:1,qtyType:"per_unit_output",note:"Label per unit"},
          ]},
        {id:"bom_dist",name:"Short-Path Distillate",category:"extract",subcategory:"sp_lab10",testFee:500,
          items:[
            {itemId:"inv_006",qty:0.3,qtyType:"per_lb_input",note:"Residual solvent recovery loss: 0.3 lbs per lb input"},
          ]},
        {id:"bom_iwh",name:"Ice Water Hash",category:"extract",subcategory:"hash",testFee:350,
          items:[
            {itemId:"inv_002",qty:1,qtyType:"per_unit_output",note:"Label per jar"},
          ]},
        {id:"bom_rh",name:"Hash Rosin",category:"extract",subcategory:"rosin_hash",testFee:450,
          items:[
            {itemId:"inv_002",qty:1,qtyType:"per_unit_output",note:"Label per jar"},
          ]},
        {id:"bom_rf",name:"Flower Rosin",category:"extract",subcategory:"rosin_fl",testFee:450,
          items:[
            {itemId:"inv_002",qty:1,qtyType:"per_unit_output",note:"Label per jar"},
          ]},
      ];
      for (const b of bomsRaw) {
        await db.boms.upsert({...b, id:uid(b.id), items:b.items.map(l=>({...l,itemId:uid(l.itemId)}))});
      }

      // ── Cost Pools ── named §263A indirect-cost pools, allocated across
      // batches per their own allocation basis — the actual capitalization
      // mechanism behind the Cost & P&L page's "Allocated Overhead" figure.
      const costPoolsRaw = [
        {id:"cp_rent",name:"Facility Rent",category:"rent",periodAmount:12000,period:"monthly",productionPct:75,allocationBasis:"batch_weight",active:true,notes:"75% of total rent is production/cultivation floor space; the rest is office/retail."},
        {id:"cp_util",name:"Utilities",category:"utilities",periodAmount:4500,period:"monthly",productionPct:90,allocationBasis:"batch_weight",active:true,notes:"HVAC, lighting, water — 90% attributable to cultivation and processing."},
        {id:"cp_dep",name:"Equipment Depreciation",category:"depreciation",periodAmount:2800,period:"monthly",productionPct:100,allocationBasis:"unit_count",active:true,linkedToEquipment:true,notes:"Computed from the Equipment Registry's straight-line depreciation (purchase price − salvage value, over useful life) rather than a manually typed figure — see the planned capacity-upgrade asset for how a future purchase projects into upcoming months."},
        {id:"cp_ind",name:"Indirect / QA Labor",category:"indirect_labor",periodAmount:9500,period:"monthly",productionPct:100,allocationBasis:"labor_hours",active:true,notes:"Production Manager + QC/Compliance Manager salaries — not tracked per batch, allocated by direct labor hours instead."},
        {id:"cp_ins",name:"Insurance",category:"insurance",periodAmount:1600,period:"monthly",productionPct:100,allocationBasis:"flat_per_batch",active:true,notes:"Product liability + property insurance, split evenly across batches produced in the period."},
      ];
      for (const cp of costPoolsRaw) {
        await db.cost_pools.upsert({...cp, id:uid(cp.id)});
      }

      // ── Cultivation Costs ── per grow-space media/nutrients/IPM spend,
      // auto-allocated to production batches via harvest_batches.spaceId
      // above. Mixed allocation bases so the demo shows both methods.
      const cultCostsRaw = [
        {spaceId:"gs_001",media:420,nutrients:680,ipm:95,other:0,allocationBasis:"batch_weight"},
        {spaceId:"gs_002",media:410,nutrients:660,ipm:90,other:0,allocationBasis:"batch_weight"},
        {spaceId:"gs_003",media:440,nutrients:710,ipm:110,other:0,allocationBasis:"time_occupied"},
        {spaceId:"gs_004",media:415,nutrients:670,ipm:100,other:0,allocationBasis:"batch_weight"},
        {spaceId:"gs_005",media:425,nutrients:685,ipm:105,other:0,allocationBasis:"time_occupied"},
        {spaceId:"gs_006",media:430,nutrients:690,ipm:100,other:0,allocationBasis:"batch_weight"},
        {spaceId:"gs_007",media:418,nutrients:675,ipm:98,other:0,allocationBasis:"batch_weight"},
        {spaceId:"gs_008",media:422,nutrients:678,ipm:102,other:0,allocationBasis:"batch_weight"},
        {spaceId:"gs_009",media:210,nutrients:340,ipm:50,other:0,allocationBasis:"time_occupied"},
      ];
      for (const cc of cultCostsRaw) {
        await db.cultivation_costs.upsert({id:uid("cc_"+cc.spaceId), spaceId:uid(cc.spaceId), media:cc.media, nutrients:cc.nutrients, ipm:cc.ipm, other:cc.other, allocationBasis:cc.allocationBasis});
      }

      // ── Direct labor lines ── every non-linked demo batch gets real
      // hours-tracked labor rows, both so the Direct Labor section on
      // Cost & P&L isn't empty AND so the labor-hours-based "Indirect / QA
      // Labor" cost pool allocates across the whole batch set instead of
      // concentrating on whichever few batches happen to have hours logged.
      // Merged into the same cogs_records row the revPerUnit loop above
      // already created (same deterministic id), not a separate read-back.
      const laborLinesRaw = {
        pb_001: [{laborTypeId:"lt_7",hours:14}, {laborTypeId:"lt_8",hours:9}], // Trim + Packaging techs
        pb_002: [{laborTypeId:"lt_7",hours:13}, {laborTypeId:"lt_8",hours:8}],
        pb_003: [{laborTypeId:"lt_9",hours:6}], // Pre-Roll technician
        pb_004: [{laborTypeId:"lt_15",hours:12}], // Processing technician (short-path distillate)
        pb_006: [{laborTypeId:"lt_14",hours:8}, {laborTypeId:"lt_15",hours:5}], // Formulation + Processing
        pb_007: [{laborTypeId:"lt_7",hours:12}, {laborTypeId:"lt_8",hours:7}],
        pb_008: [{laborTypeId:"lt_4",hours:10}, {laborTypeId:"lt_5",hours:16}], // Lead + Extraction techs
        pb_009: [{laborTypeId:"lt_5",hours:8}],
        pb_010: [{laborTypeId:"lt_5",hours:6}],
        pb_011: [{laborTypeId:"lt_5",hours:5}],
        ...spreadLaborLines,
      };
      for (const [pbId, lines] of Object.entries(laborLinesRaw)) {
        const p = demoProdBatchesRaw.find(x=>x.id===pbId);
        await db.cogs_records.upsert({id:uid("cogs_"+pbId), batchId:uid(pbId), revPerUnit:p?.unitPrice, laborLines: lines.map(l=>({laborTypeId:uid(l.laborTypeId),hours:l.hours}))});
      }

      // ── GMP Hub ── SOPs / Shifts / Deviations ──────────────────────
      const sopsRaw = [
        {id:"sop_001",title:"Cannabis Flower Harvest Procedure",code:"SOP-CULT-001",version:"2.1",category:"Cultivation",status:"approved",approvedBy:"Marcus Webb",approvedDate:"2024-09-15",reviewDate:"2025-09-15",description:"Standard operating procedure for harvesting cannabis flower including pre-harvest inspection, cutting protocol, wet weight recording, and transport to dry room.",steps:["Verify harvest authorization in Metrc and confirm batch ID","Inspect canopy for visible mold or pest damage — halt if found","Set up labeled harvest bins and scale in staging area","Cut plants at base, remove fan leaves, record wet weight per plant","Transport to Dry / Cure Room within 2 hours of cutting","Log wet weight and harvest date in ResinOps Harvest Batches"]},
        {id:"sop_002",title:"IPM Pesticide Application Protocol",code:"SOP-IPM-001",version:"3.0",category:"Compliance",status:"approved",approvedBy:"Sofia Ramirez",approvedDate:"2024-11-01",reviewDate:"2025-11-01",description:"NY DEC compliant pesticide application procedure covering pre-application checklist, PPE requirements, application technique, and post-application recordkeeping.",steps:["Verify applicator holds valid Category 24 or 1A NY pesticide license","Check EPA registration number on current product label","Confirm PHI and REI — post REI signage on room door","Don full PPE: respirator, goggles, gloves, coveralls","Mix product at label rate — record amount mixed and area to treat","Apply using designated equipment — full canopy coverage required","Log application in ResinOps Pesticide Log immediately after completion","Do not enter room until REI has elapsed"]},
        {id:"sop_003",title:"COA Review and Batch Release",code:"SOP-QC-001",version:"1.4",category:"Quality Control",status:"approved",approvedBy:"Sofia Ramirez",approvedDate:"2024-10-01",reviewDate:"2025-10-01",description:"Procedure for reviewing Certificate of Analysis results from Kaycha Labs and releasing or holding harvest batches based on NY OCM action limits.",steps:["Receive COA from Kaycha Labs — verify lab ID and sample ID match batch record","Review all panels: cannabinoids, terpenes, microbial, pesticides, heavy metals, water activity","Compare all results against NY OCM action limits","If all panels PASS: update batch status to released in ResinOps and Metrc","If any panel FAILS: immediately place batch on QC Hold in ResinOps","For failed microbial: refer to Remediation SOP-REM-001","Document review in Deviation Register if any result was borderline"]},
        {id:"sop_004",title:"Tissue Culture Vessel Preparation",code:"SOP-TC-001",version:"1.0",category:"Genetics Lab",status:"approved",approvedBy:"Priya Nair",approvedDate:"2024-03-01",reviewDate:"2025-03-01",description:"Aseptic technique procedure for preparing TC media and inoculating culture vessels using Athena CulturIN system components.",steps:["Wipe all laminar flow hood surfaces with 70% isopropyl alcohol — run hood 15 min before use","Prepare Athena Shoots or Roots media per stage per manufacturer spec","Autoclave media: 121°C / 15 PSI / 20 minutes","Allow media to cool to <50°C before adding heat-sensitive components","Pour media in hood under aseptic conditions — flame tools between uses","Inoculate vessel with prepared explant material","Label with strain, stage, date, and technician initials","Log vessel in ResinOps TC Tracker"]},
      ];
      for (const s of sopsRaw) {
        const contentText = s.description+"\n\nSteps:\n"+s.steps.map((step,i)=>(i+1)+". "+step).join("\n");
        await db.gmp_sops.upsert({id:uid(s.id),title:s.title,department:s.category,category:s.category,version:s.version,status:s.status,approvedBy:s.approvedBy,content:contentText});
      }

      const today = new Date().toISOString().split("T")[0];
      const shiftsRaw = [
        {id:"shift_001",date:today,type:"day",lead:"Marcus Webb",startTime:"06:00",endTime:"14:30",spaces:["Flower Room 6","Flower Room 7","Veg Room"],notes:"Standard cultivation shift — fed FR6 and FR7 with Athena PK week 5 protocol. Topped canopy in FR7. No issues.",tasks:[{task:"Nutrient feed FR6 + FR7",done:true},{task:"Canopy inspection all rooms",done:true},{task:"Beneficial insect check clone room",done:true}]},
        {id:"shift_002",date:today,type:"processing",lead:"Taryn Delacroix",startTime:"07:00",endTime:"15:00",spaces:["Processing Room","Dry / Cure Room"],notes:"Post-harvest processing — Mango Haze cure check. Moisture at 9.1% — one more week. Black Maple packaging complete 2,400 units.",tasks:[{task:"Cure check Mango Haze",done:true},{task:"Black Maple packaging run",done:true},{task:"Trim machine blade inspection",done:true}]},
      ];
      for (const sh of shiftsRaw) {
        await db.gmp_shifts.upsert({id:uid(sh.id),shiftDate:sh.date,department:sh.type,supervisor:sh.lead,notes:sh.notes,entries:[{id:"se_"+uid(sh.id),employeeId:"",timeIn:sh.startTime,timeOut:sh.endTime,batchType:"harvest",batchId:"",hoursWorked:"8",taskNotes:sh.lead+" — "+sh.tasks.map(t=>t.task).join("; ")+" ["+sh.spaces.join(", ")+"]"}]});
      }

      const deviationsRaw = [
        {id:"dev_001",date:"2024-11-15",type:"Environmental",severity:"minor",space:"Flower Room 6",title:"RH spike above 65% during lights-off",description:"Relative humidity in Flower Room 6 reached 68% during a 4-hour window on the night of Nov 14-15 due to dehumidifier drain line blockage. No visible mold observed on inspection.",corrective:"Drain line cleared and flushed. Amir Hassan added quarterly drain line check to PM schedule for all Quest 335 units.",preventive:"Added RH high alert threshold of 62% to Growlink monitoring for all flower rooms.",status:"closed",closedDate:"2024-11-16",closedBy:"Marcus Webb"},
      ];
      for (const d of deviationsRaw) {
        await db.gmp_deviations.upsert({id:uid(d.id),title:d.title,description:"["+d.space+"] "+d.title+": "+d.description,severity:d.severity,status:d.status,resolution:d.corrective+" Preventive: "+d.preventive,date:d.date,type:d.type,rootCause:d.description,correctiveAction:d.corrective,preventiveAction:d.preventive});
      }

      // ── Step Sign-Offs ────────────────────────────────────
      const gmpSignoffsRaw = [
        {id:"so_gmp_001",batchType:"harvest",batchId:1001,stepName:"Hang Dry",performedById:"emp_001",verifiedById:"emp_002",timestamp:"2026-06-28T08:00",notes:"Harvest hung within 2 hours of cutting per SOP-CULT-001."},
        {id:"so_gmp_002",batchType:"production",batchId:"pb_001",stepName:"Trimming",performedById:"emp_003",verifiedById:"emp_002",timestamp:"2026-07-11T14:00",notes:"Machine trim complete, GreenBroz 215."},
        {id:"so_gmp_003",batchType:"production",batchId:"pb_002",stepName:"Trimming",performedById:"emp_003",verifiedById:"emp_002",timestamp:"2026-07-11T15:30",notes:"Machine trim complete."},
        {id:"so_gmp_004",batchType:"production",batchId:"pb_010",stepName:"QC / Testing",performedById:"emp_006",verifiedById:"emp_002",timestamp:"2026-07-19T10:00",notes:"Sample submitted to Kaycha Labs for hash rosin COA."},
      ];
      for (const s of gmpSignoffsRaw) {
        await db.gmp_signoffs.upsert({...s, id: uid(s.id), batchId: uid(s.batchId), performedById: uid(s.performedById), verifiedById: uid(s.verifiedById)});
      }

      // ── Labor Types ── single source of truth: LaborManager's own default
      // roster, so "Load Demo Data" and "Reset defaults" always agree
      // instead of seeding two different role lists with incompatible
      // categories.
      for (const l of DEFAULT_LABOR_TYPES) {
        await db.labor_types.upsert({...l, id:uid(l.id)});
      }

      // ── Sales Orders ────────────────────────────────────
      const salesOrdersRaw = [
        {id:"so_001",customerName:"Greenleaf Dispensary",customerLicense:"OCM-RO-001234",orderDate:"2026-07-01",status:"open",importStatus:"confirmed",lines:[{id:"l1",product:"Gorilla Cake 3.5g",qty:100,unitPrice:18,orderTotal:1800},{id:"l2",product:"Black Maple 3.5g",qty:80,unitPrice:20,orderTotal:1600}],notes:"Regular weekly account"},
        {id:"so_002",customerName:"Hudson Valley Cannabis Co.",customerLicense:"OCM-RO-002891",orderDate:"2026-07-02",status:"open",importStatus:"confirmed",lines:[{id:"l3",product:"Mango Haze Pre-Roll 5pk",qty:200,unitPrice:24,orderTotal:4800}],notes:"Pre-roll program — confirmed"},
        {id:"so_003",customerName:"Capital District Collective",customerLicense:"OCM-RO-003445",orderDate:"2026-07-03",status:"open",importStatus:"confirmed",lines:[{id:"l4",product:"Blueberry Headband 1g Vape",qty:150,unitPrice:28,orderTotal:4200},{id:"l5",product:"Sour Diesel OG 3.5g",qty:60,unitPrice:19,orderTotal:1140}],notes:"Vape program launching this month"},
        {id:"so_004",customerName:"Brooklyn Bodega Cannabis",customerLicense:"OCM-RO-004122",orderDate:"2026-07-04",status:"open",importStatus:"pending",lines:[{id:"l6",product:"Zaza Runtz 7g",qty:80,unitPrice:42,orderTotal:3360}],notes:"Waiting on lab results — pending confirmation"},
        {id:"so_005",customerName:"Finger Lakes Dispensary",customerLicense:"OCM-RO-005678",orderDate:"2026-07-05",status:"open",importStatus:"pending",lines:[{id:"l7",product:"Gorilla Cake 3.5g",qty:60,unitPrice:18,orderTotal:1080},{id:"l8",product:"Black Maple 3.5g",qty:40,unitPrice:20,orderTotal:800}],notes:"New account — pending credit approval"},
        {id:"so_006",customerName:"Catskill Mountain Wellness",customerLicense:"OCM-RO-006234",orderDate:"2026-07-05",status:"open",importStatus:"waitlist",lines:[{id:"l9",product:"Black Maple 3.5g",qty:100,unitPrice:20,orderTotal:2000}],notes:"Waitlisted — Black Maple sold out until Jul 22 harvest"},
        {id:"so_007",customerName:"Saratoga Smoke Shop",customerLicense:"OCM-RO-007891",orderDate:"2026-07-06",status:"open",importStatus:"waitlist",lines:[{id:"l10",product:"Zaza Runtz 3.5g",qty:120,unitPrice:22,orderTotal:2640}],notes:"Waitlisted — Zaza Runtz next harvest Jul 25"},
      ];
      for (const so of salesOrdersRaw) {
        await db.sales_orders.upsert({id:uid(so.id),customerName:so.customerName,customerLicense:so.customerLicense,orderDate:so.orderDate,status:so.status,importStatus:so.importStatus,lines:so.lines,notes:so.notes});
      }

      // ── Booked pipeline against the near-term forward batches above —
      // gives the Forecast tab's "booked" (solid) vs. "estimated" (lighter)
      // revenue split something real to show for the next couple months,
      // not just far-future SKU-price guesses.
      const forwardOrdersRaw = [
        {id:"so_f01",customerName:"Greenleaf Dispensary",customerLicense:"OCM-RO-001234",orderDate:"2026-08-01",status:"open",importStatus:"confirmed",lines:[{id:"lf1",batchId:uid("pb_f01"),product:"Sour Diesel OG 3.5g Retail",qty:300,unitPrice:19,orderTotal:5700}],notes:"August allocation — confirmed"},
        {id:"so_f02",customerName:"Hudson Valley Cannabis Co.",customerLicense:"OCM-RO-002891",orderDate:"2026-09-10",status:"open",importStatus:"confirmed",lines:[{id:"lf2",batchId:uid("pb_f04"),product:"Black Maple Hash Rosin",qty:40,unitPrice:65,orderTotal:2600}],notes:"September rosin allocation — confirmed"},
      ];
      for (const so of forwardOrdersRaw) {
        await db.sales_orders.upsert({id:uid(so.id),customerName:so.customerName,customerLicense:so.customerLicense,orderDate:so.orderDate,status:so.status,importStatus:so.importStatus,lines:so.lines,notes:so.notes});
      }

      // ── Customers ── names match the sales_orders above exactly; Customers.jsx
      // falls back to matching orders by customerName when an order has no
      // customerId, so these link up automatically without touching the orders.
      const customersRaw = [
        {id:"cust_001",name:"Greenleaf Dispensary",licenseNumber:"OCM-RO-001234",contactName:"Dana Whitfield",phone:"518-555-0142",email:"orders@greenleafny.com",address:"114 Broadway, Saratoga Springs, NY",accountType:"dispensary",pipelineStage:"active",notes:"Regular weekly account — flower and pre-roll program."},
        {id:"cust_002",name:"Hudson Valley Cannabis Co.",licenseNumber:"OCM-RO-002891",contactName:"Marcus Ianni",phone:"845-555-0198",email:"buying@hvcannabisco.com",address:"22 Mill St, Kingston, NY",accountType:"wholesale",pipelineStage:"active",notes:"Pre-roll program, confirmed monthly volume."},
        {id:"cust_003",name:"Capital District Collective",licenseNumber:"OCM-RO-003445",contactName:"Renee Okafor",phone:"518-555-0176",email:"renee@capdistrictcollective.com",address:"88 State St, Albany, NY",accountType:"dispensary",pipelineStage:"active",notes:"Vape program launched this month."},
        {id:"cust_004",name:"Brooklyn Bodega Cannabis",licenseNumber:"OCM-RO-004122",contactName:"Luis Fernandez",phone:"718-555-0133",email:"luis@brooklynbodegacannabis.com",address:"410 Flatbush Ave, Brooklyn, NY",accountType:"dispensary",pipelineStage:"prospect",notes:"Waiting on lab results before first order confirms."},
        {id:"cust_005",name:"Finger Lakes Dispensary",licenseNumber:"OCM-RO-005678",contactName:"Sarah Voss",phone:"607-555-0119",email:"sarah@fingerlakesdispensary.com",address:"1200 Seneca St, Geneva, NY",accountType:"dispensary",pipelineStage:"prospect",notes:"New account — pending credit approval."},
        {id:"cust_006",name:"Catskill Mountain Wellness",licenseNumber:"OCM-RO-006234",contactName:"Tom Bramer",phone:"845-555-0187",email:"tom@catskillmtnwellness.com",address:"65 Main St, Margaretville, NY",accountType:"dispensary",pipelineStage:"lead",notes:"Waitlisted for Black Maple — sold out until next harvest."},
        {id:"cust_007",name:"Saratoga Smoke Shop",licenseNumber:"OCM-RO-007891",contactName:"Priya Chandra",phone:"518-555-0164",email:"priya@saratogasmokeshop.com",address:"30 Broadway, Saratoga Springs, NY",accountType:"dispensary",pipelineStage:"lead",notes:"Waitlisted — Zaza Runtz next harvest."},
      ];
      for (const c of customersRaw) {
        await db.customers.upsert({...c, id: uid(c.id)});
      }

      // ── Sales Goals ── current month goal so the Sales Goal Dial has live
      // progress to show against the confirmed July orders above.
      const salesGoalsRaw = [
        {id:"goal_jul26",periodStart:"2026-07-01",periodEnd:"2026-07-31",goalAmount:45000,notes:"July revenue target"},
        {id:"goal_jun26",periodStart:"2026-06-01",periodEnd:"2026-06-30",goalAmount:40000,notes:"June revenue target"},
      ];
      for (const g of salesGoalsRaw) {
        await db.sales_goals.upsert({...g, id: uid(g.id)});
      }

      // ── Employees ── set Marcus Webb's Category 24 license to expire in 45 days
      // so the dashboard's expiring-license alert has something to show
      try {
        const employees = await db.employees.list();
        const targets = employees.filter(e => e.name?.includes("Marcus Webb") || e.pestLicenseCategory?.includes("Category 24"));
        if (targets.length) {
          const alertDate = new Date(); alertDate.setDate(alertDate.getDate()+45);
          const alertDateStr = alertDate.toISOString().split("T")[0];
          for (const e of targets) await db.employees.upsert({...e, pestLicenseExpiry: alertDateStr});
        }
      } catch(e) { console.warn("Employee demo patch skipped:", e.message); }

      // ── Employees ── create real demo staff records (the patch above only
      // updates an existing Marcus Webb record — if none exists yet, as on a
      // fresh demo facility, there's nothing to patch, hence Employees/Labor
      // Setup showing empty). Create the actual roster referenced throughout
      // this demo data (shift leads, applicators, deviation closers, etc.)
      const employeesRaw = [
        {id:"emp_001",name:"Marcus Webb",role:"Head Grower / Cultivation Lead",department:"Cultivation",status:"active",hireDate:"2024-03-01",phone:"(845) 555-0110",email:"m.webb@cascadepeak.co",pestLicenseNum:"NY-PEST-1847",pestLicenseCategory:"Category 24 (Private Applicator)",pestLicenseState:"NY",pestLicenseExpiry:"",certs:[],trainings:[],notes:"Lead cultivator, 12 years experience."},
        {id:"emp_002",name:"Sofia Ramirez",role:"Compliance Officer",department:"Compliance",status:"active",hireDate:"2024-04-15",phone:"(845) 555-0111",email:"s.ramirez@cascadepeak.co",pestLicenseNum:"NY-PEST-2291",pestLicenseCategory:"Category 1A (Commercial Technician)",pestLicenseState:"NY",pestLicenseExpiry:"2027-03-01",certs:[],trainings:[],notes:"Manages IPM program and NY OCM compliance filings."},
        {id:"emp_003",name:"Taryn Delacroix",role:"Post-Harvest Lead",department:"Post-Harvest",status:"active",hireDate:"2024-05-01",phone:"(845) 555-0112",email:"t.delacroix@cascadepeak.co",pestLicenseNum:"",pestLicenseCategory:"None / Not Licensed",pestLicenseState:"NY",pestLicenseExpiry:"",certs:[],trainings:[],notes:"Runs drying, bucking, trimming, and curing operations."},
        {id:"emp_004",name:"Priya Nair",role:"Tissue Culture Lab Tech",department:"QC / Lab",status:"active",hireDate:"2024-06-01",phone:"(845) 555-0113",email:"p.nair@cascadepeak.co",pestLicenseNum:"",pestLicenseCategory:"None / Not Licensed",pestLicenseState:"NY",pestLicenseExpiry:"",certs:[],trainings:[],notes:"Manages TC lab, accessions, and clean stock program."},
        {id:"emp_005",name:"Amir Hassan",role:"Maintenance Lead",department:"Maintenance",status:"active",hireDate:"2024-03-15",phone:"(845) 555-0114",email:"a.hassan@cascadepeak.co",pestLicenseNum:"",pestLicenseCategory:"None / Not Licensed",pestLicenseState:"NY",pestLicenseExpiry:"",certs:[],trainings:[],notes:"HVAC, dehumidification, and equipment PM schedule."},
        {id:"emp_006",name:"Devon Park",role:"Extraction Technician",department:"Processing",status:"active",hireDate:"2024-07-01",phone:"(845) 555-0115",email:"d.park@cascadepeak.co",pestLicenseNum:"",pestLicenseCategory:"None / Not Licensed",pestLicenseState:"NY",pestLicenseExpiry:"",certs:[],trainings:[],notes:"Hydrocarbon extraction and post-processing."},
        {id:"emp_007",name:"Tyler Bates",role:"Packaging Technician",department:"Processing",status:"active",hireDate:"2024-08-01",phone:"(845) 555-0116",email:"t.bates@cascadepeak.co",pestLicenseNum:"",pestLicenseCategory:"None / Not Licensed",pestLicenseState:"NY",pestLicenseExpiry:"",certs:[],trainings:[],notes:"Packaging line and facility sanitation."},
      ];
      for (const e of employeesRaw) {
        await db.employees.upsert({...e, id: uid(e.id)});
      }

      // ── Cultivation Inputs ────────────────────────────────
      const cultivationInputsRaw = [
        {id:"ci_001",date:"2026-06-20",type:"nutrient",spaceId:uid("gs_002"),spaceName:"FR6 — Black Maple Cycle 4",applicatorId:uid("emp_001"),applicatorName:"Marcus Webb",applicatorLicenseNum:"NY-PEST-1847",product:"Athena Pro Grow",manufacturer:"Athena",rate:"3",rateUnit:"g/gal",volumeApplied:"200",volumeUnit:"gal",areaApplied:"1200",costPerUnit:"1.85",totalCost:"370",applicationMethod:"Fertigation",notes:"Standard weekly feed, Flower Room 6, week 5 PK protocol."},
        {id:"ci_002",date:"2026-06-25",type:"beneficial",spaceId:uid("gs_009"),spaceName:"Veg — Mixed Strains",applicatorId:uid("emp_002"),applicatorName:"Sofia Ramirez",applicatorLicenseNum:"NY-PEST-2291",species:"Amblyseius cucumeris",supplier:"Koppert Biological Systems",releaseRate:"5",releaseUnit:"insects/sqft",rate:"5",rateUnit:"insects/sqft",areaApplied:"1200",costPerUnit:"0.0225",totalCost:"6.75",notes:"Preventive thrips biocontrol release, clone room."},
        {id:"ci_003",date:"2026-07-01",type:"nutrient",spaceId:uid("gs_009"),spaceName:"Veg — Mixed Strains",applicatorId:uid("emp_001"),applicatorName:"Marcus Webb",applicatorLicenseNum:"NY-PEST-1847",product:"Athena Pro Core",manufacturer:"Athena",rate:"2.5",rateUnit:"g/gal",volumeApplied:"180",volumeUnit:"gal",areaApplied:"1200",costPerUnit:"1.60",totalCost:"288",applicationMethod:"Fertigation",notes:"Veg-stage feed, Veg Room."},
      ];
      for (const ci of cultivationInputsRaw) {
        await db.cultivation_inputs.upsert({...ci, id: uid(ci.id)});
      }

      // ── Inventory Items ───────────────────────────────────
      const inventoryRaw = [
        {id:"inv_001",n:"Child-Resistant Glass Jar 2oz",cat:"Packaging",uom:"each",reorderAt:"500",reorderQty:"5000",vm:"average",notes:"Primary packaging for whole flower 3.5g/7g."},
        {id:"inv_002",n:"Tamper-Evident Label",cat:"Packaging",uom:"each",reorderAt:"1000",reorderQty:"10000",vm:"average",notes:"NY OCM compliant labels, printed per SKU."},
        {id:"inv_003",n:"Pre-Roll Cone 110mm",cat:"Packaging",uom:"each",reorderAt:"2000",reorderQty:"20000",vm:"average",notes:""},
        {id:"inv_004",n:"Athena Pro Grow",cat:"Nutrients & Amendments",uom:"lb",reorderAt:"10",reorderQty:"50",vm:"average",notes:"Primary flower-stage nutrient line."},
        {id:"inv_005",n:"Athena Pro Core",cat:"Nutrients & Amendments",uom:"lb",reorderAt:"10",reorderQty:"50",vm:"average",notes:"Veg-stage base nutrient."},
        {id:"inv_006",n:"55-Gallon Butane (n-Butane)",cat:"Extraction Solvents",uom:"lb",reorderAt:"100",reorderQty:"500",vm:"fifo",requiresCoc:true,notes:"Extraction solvent, hydrocarbon-certified."},
        {id:"inv_007",n:"Regalia Bio-Fungicide",cat:"IPM Products",uom:"gal",reorderAt:"2",reorderQty:"5",vm:"average",notes:"Preventive fungicide, OMRI listed."},
        {id:"inv_008",n:"Suffoil-X",cat:"IPM Products",uom:"gal",reorderAt:"2",reorderQty:"5",vm:"average",notes:"Horticultural oil, mite/insect preventive."},
        {id:"inv_009",n:"Amblyseius cucumeris Sachets",cat:"IPM Products",uom:"each",reorderAt:"50",reorderQty:"200",vm:"fifo",notes:"Predatory mite sachets for thrips control — monthly replacement."},
      ];
      for (const inv of inventoryRaw) {
        await db.inventory_items.upsert({...inv, id: uid(inv.id)});
      }

      // ── Vendors ────────────────────────────────────────────
      const vendorsRaw = [
        {id:"vnd_001",n:"Pacific Packaging Supply",vendorType:"supply",contact:"Kim Osei",phone:"(503) 555-0141",email:"orders@pacpacksupply.com",leadDays:"7",notes:"Primary packaging vendor — jars, labels, exit bags."},
        {id:"vnd_002",n:"Athena Agriculture",vendorType:"supply",contact:"Rebecca Lund",phone:"(800) 555-0142",email:"sales@athenaag.com",leadDays:"5",notes:"Nutrient line supplier."},
        {id:"vnd_003",n:"Koppert Biological Systems",vendorType:"supply",contact:"Dennis Farrow",phone:"(831) 555-0143",email:"orders@koppert.us",leadDays:"10",notes:"Beneficial insects for IPM program."},
        {id:"vnd_004",n:"Empire Hydrocarbon Solutions",vendorType:"supply",contact:"Wade Mercer",phone:"(518) 555-0144",email:"sales@empirehydro.com",leadDays:"14",notes:"n-Butane and propane, hydrocarbon-certified deliveries."},
        {id:"vnd_005",n:"Hudson Valley HVAC Service",vendorType:"service",contact:"Renata Cole",phone:"(845) 555-0145",email:"service@hvhvac.com",leadDays:"3",notes:"Dehumidifier and HVAC preventive maintenance contractor."},
      ];
      for (const v of vendorsRaw) {
        await db.vendors.upsert({...v, id: uid(v.id)});
      }

      // ── Purchase Orders (mix of received and pending, to show the workflow) ──
      const purchaseOrdersRaw = [
        {id:"po_001",poNum:"PO-0001",vendorId:uid("vnd_001"),date:"2026-06-10",expectedDelivery:"2026-06-17",status:"received",
          items:[{itemId:uid("inv_001"),qty:5000,unitCost:0.38,receivedQty:5000},{itemId:uid("inv_002"),qty:10000,unitCost:0.08,receivedQty:10000},{itemId:uid("inv_003"),qty:20000,unitCost:0.09,receivedQty:20000}],notes:"Standard packaging restock."},
        {id:"po_002",poNum:"PO-0002",vendorId:uid("vnd_002"),date:"2026-06-15",expectedDelivery:"2026-06-20",status:"received",
          items:[{itemId:uid("inv_004"),qty:50,unitCost:42.00,receivedQty:50},{itemId:uid("inv_005"),qty:50,unitCost:38.00,receivedQty:50}],notes:"Monthly nutrient restock."},
        {id:"po_003",poNum:"PO-0003",vendorId:uid("vnd_004"),date:"2026-06-05",expectedDelivery:"2026-06-19",status:"received",
          items:[{itemId:uid("inv_006"),qty:500,unitCost:3.20,receivedQty:500}],notes:"Quarterly hydrocarbon solvent order — CoC required on receipt."},
        {id:"po_004",poNum:"PO-0004",vendorId:uid("vnd_003"),date:"2026-07-08",expectedDelivery:"2026-07-15",status:"sent",
          items:[{itemId:uid("inv_009"),qty:200,unitCost:4.50,receivedQty:0}],notes:"Restocking predatory mite sachets — awaiting delivery."},
        {id:"po_005",poNum:"PO-0005",vendorId:uid("vnd_003"),date:"2026-06-01",expectedDelivery:"2026-06-08",status:"received",
          items:[{itemId:uid("inv_007"),qty:5,unitCost:68.00,receivedQty:5},{itemId:uid("inv_008"),qty:5,unitCost:54.00,receivedQty:5},{itemId:uid("inv_009"),qty:100,unitCost:4.50,receivedQty:100}],notes:"Initial IPM chemical + sachet stock — prior to PO-0004 restock."},
      ];
      for (const po of purchaseOrdersRaw) {
        await db.purchase_orders.upsert({...po, id: uid(po.id)});
      }

      // ── Backfill lots + CoC on items received above (mirrors what confirmReceive()
      // does when you click Receive in the UI — done directly here since demo data
      // isn't clicked through the actual receiving flow) ──
      const receivedLots = [
        {itemFakeId:"inv_001", poFakeId:"po_001", qty:5000, cost:0.38, date:"2026-06-17"},
        {itemFakeId:"inv_002", poFakeId:"po_001", qty:10000, cost:0.08, date:"2026-06-17"},
        {itemFakeId:"inv_003", poFakeId:"po_001", qty:20000, cost:0.09, date:"2026-06-17"},
        {itemFakeId:"inv_004", poFakeId:"po_002", qty:50, cost:42.00, date:"2026-06-20"},
        {itemFakeId:"inv_005", poFakeId:"po_002", qty:50, cost:38.00, date:"2026-06-20"},
        {itemFakeId:"inv_006", poFakeId:"po_003", qty:500, cost:3.20, date:"2026-06-19"},
        {itemFakeId:"inv_007", poFakeId:"po_005", qty:5, cost:68.00, date:"2026-06-08"},
        {itemFakeId:"inv_008", poFakeId:"po_005", qty:5, cost:54.00, date:"2026-06-08"},
        {itemFakeId:"inv_009", poFakeId:"po_005", qty:100, cost:4.50, date:"2026-06-08"},
      ];
      // Refetch items so we can safely merge lots onto the just-created records
      const allInvItems = await db.inventory_items.list();
      for (const rl of receivedLots) {
        const itemId = uid(rl.itemFakeId);
        const item = allInvItems.find(x=>x.id===itemId);
        if (!item) continue;
        const lot = {id: uid(rl.itemFakeId+"-lot-"+rl.poFakeId), date: rl.date, qty: rl.qty, remaining: rl.qty, costPerUnit: rl.cost, poId: uid(rl.poFakeId)};
        const updated = {...item, lots:[...(item.lots||[]).filter(l=>l.poId!==lot.poId), lot], lastCost: rl.cost};
        if (rl.itemFakeId==="inv_006") {
          updated.cocs = [{
            id: uid("coc-inv_006-po_003"), lotNum:"EHS-2026-0619", supplier:"Empire Hydrocarbon Solutions",
            issueDate:"2026-06-19", expiryDate:"2027-06-19", docRef:"CoC-EHS-06192026",
            status:"pass", notes:"Purity spec verified — hydrocarbon-grade n-Butane, <10ppm residual.",
          }];
        }
        if (rl.itemFakeId==="inv_001") {
          updated.cocs = [{
            id: uid("coc-inv_001-po_001"), lotNum:"PPS-2026-0617", supplier:"Pacific Packaging Supply",
            issueDate:"2026-06-17", expiryDate:"2028-06-17", docRef:"CoC-PPS-06172026",
            status:"pass", notes:"Food-grade glass, child-resistant closure spec verified.",
          }];
        }
        await db.inventory_items.upsert(updated);
      }

      // ── Equipment ──────────────────────────────────────────
      // purchasePrice/usefulLifeMonths/salvageValue drive the "Equipment
      // Depreciation" cost pool (linkedToEquipment:true, below) via
      // straight-line monthly depreciation — see calcEquipmentDepreciationPool
      // in lib/cogs.js. eq_006 is a "planned" future purchase: its
      // depreciation only starts contributing once forecast months reach
      // its purchaseDate, demonstrating the projection story.
      const equipmentRaw = [
        {id:"eq_001",name:"Harvest Right Medium Freeze Dryer",cat:"Extraction",make:"Harvest Right",model:"Medium",serial:"HR-MED-20441",location:"Processing Room",purchaseDate:"2025-01-15",purchasePrice:4500,usefulLifeMonths:60,salvageValue:500,warrantyExpires:"2027-01-15",pmFreqDays:"90",lastServiceDate:"2026-05-01",status:"active",notes:"Primary freeze-dry unit for ice water hash."},
        {id:"eq_002",name:"Low Temp Plates V2 3x5",cat:"Extraction",make:"Low Temp Plates",model:"V2 3x5",serial:"LTP-V2-8834",location:"Processing Room",purchaseDate:"2025-02-01",purchasePrice:3200,usefulLifeMonths:60,salvageValue:300,warrantyExpires:"2026-02-01",pmFreqDays:"180",lastServiceDate:"2026-04-10",status:"active",notes:"Primary rosin press."},
        {id:"eq_003",name:"GreenBroz 215",cat:"Trimming & Bucking",make:"GreenBroz",model:"215",serial:"GB215-5521",location:"Processing Room",purchaseDate:"2024-11-01",purchasePrice:13500,usefulLifeMonths:84,salvageValue:1500,warrantyExpires:"2025-11-01",pmFreqDays:"30",lastServiceDate:"2026-06-15",status:"active",notes:"Primary machine trim unit, blade inspection monthly."},
        {id:"eq_004",name:"Quest 335 Dehumidifier — FR6",cat:"HVAC & Dehumidification",make:"Quest",model:"335",serial:"Q335-2291",location:"Flower Room 6",purchaseDate:"2024-08-01",purchasePrice:2800,usefulLifeMonths:60,salvageValue:200,warrantyExpires:"2026-08-01",pmFreqDays:"90",lastServiceDate:"2026-06-01",status:"active",notes:"Quarterly drain line check per corrective action from Nov 2024 deviation."},
        {id:"eq_005",name:"CVault Cure Station",cat:"Drying & Curing",make:"CVault",model:"Commercial 27gal",serial:"CV-27-1145",location:"Dry / Cure Room",purchaseDate:"2024-09-01",purchasePrice:1800,usefulLifeMonths:84,salvageValue:200,warrantyExpires:"",pmFreqDays:"",lastServiceDate:"",status:"active",notes:"Long-term cure storage, humidity-controlled."},
        {id:"eq_006",name:"Low Temp Plates V3 5x7 (Capacity Upgrade)",cat:"Extraction",make:"Low Temp Plates",model:"V3 5x7",serial:"",location:"Processing Room",purchaseDate:"2027-01-15",purchasePrice:8500,usefulLifeMonths:60,salvageValue:500,warrantyExpires:"",pmFreqDays:"180",lastServiceDate:"",status:"planned",notes:"Planned second rosin press to add hash-rosin capacity — depreciation begins Jan 2027 once purchased."},
      ];
      for (const eq of equipmentRaw) {
        await db.equipment.upsert({...eq, id: uid(eq.id)});
      }

      // ── Equipment Service Log ── matches each asset's own lastServiceDate above
      const serviceLogRaw = [
        {id:"svc_001",equipId:"eq_001",date:"2026-05-01",type:"pm",tech:"Tyler Bates",cost:145,notes:"Cleaned condenser coils, checked vacuum seal."},
        {id:"svc_002",equipId:"eq_002",date:"2026-04-10",type:"pm",tech:"Tyler Bates",cost:0,notes:"Plate inspection, no wear detected."},
        {id:"svc_003",equipId:"eq_003",date:"2026-06-15",type:"pm",tech:"Marcus Webb",cost:80,notes:"Blade inspection and replacement per monthly schedule."},
        {id:"svc_004",equipId:"eq_004",date:"2026-06-01",type:"inspection",tech:"Tyler Bates",cost:0,notes:"Drain line check per Nov 2024 corrective action — clear."},
      ];
      for (const s of serviceLogRaw) {
        await db.equipment_service_log.upsert({id:uid(s.id),equipId:uid(s.equipId),date:s.date,type:s.type,tech:s.tech,cost:s.cost,notes:s.notes});
      }

      // ── Work Orders ────────────────────────────────────────
      const workOrdersRaw = [
        {id:"wo_001",title:"GreenBroz 215 blade replacement",cat:"Preventive Maintenance",equipId:"eq_003",severity:"low",reportedBy:"Tyler Bates",reportedDate:"2026-06-14",status:"closed",assignedTo:"Amir Hassan",description:"Monthly blade inspection flagged wear on trim blades ahead of schedule.",resolutionNotes:"Replaced trim blade set, tested on scrap trim before returning to production.",laborHours:"1.5",partsCost:"85",laborCost:"37.50",totalCost:"122.50"},
        {id:"wo_002",title:"Quest 335 dehumidifier drain line check",cat:"Corrective Maintenance",equipId:"eq_004",severity:"medium",reportedBy:"Marcus Webb",reportedDate:"2026-06-01",status:"closed",assignedTo:"Amir Hassan",description:"Quarterly drain line check per corrective action from Nov 2024 RH deviation.",resolutionNotes:"Drain line clear, no blockage found. Logged as routine PM per CAPA schedule.",laborHours:"1",partsCost:"0",laborCost:"25",totalCost:"25"},
        {id:"wo_003",title:"Low Temp rosin press heating plate inconsistency",cat:"Corrective Maintenance",equipId:"eq_002",severity:"high",reportedBy:"Devon Park",reportedDate:"2026-07-18",status:"open",assignedTo:"Amir Hassan",description:"Plate temp reading fluctuating ±8°F during hash rosin runs, affecting yield consistency.",resolutionNotes:"",laborHours:"",partsCost:"",laborCost:"",totalCost:""},
      ];
      for (const w of workOrdersRaw) {
        await db.work_orders.upsert({...w, id: uid(w.id), equipId: uid(w.equipId)});
      }

      // ── LOTO Log ───────────────────────────────────────────
      const lotoRaw = [
        {id:"loto_001",equipId:"eq_003",date:"2026-06-14",reason:"Blade replacement — GreenBroz 215",lockedBy:"Amir Hassan",lockTime:"2026-06-14T09:00",reenergizedBy:"Amir Hassan",reenergizeTime:"2026-06-14T10:30",verifiedSafe:true,status:"closed",notes:"Blade set replaced and tested, machine re-energized and verified safe before returning to Tyler Bates."},
        {id:"loto_002",equipId:"eq_002",date:"2026-07-18",reason:"Heating plate inspection — Low Temp Plates V2 3x5",lockedBy:"Amir Hassan",lockTime:"2026-07-18T16:00",reenergizedBy:"",reenergizeTime:"",verifiedSafe:false,status:"open",notes:"Locked out pending thermocouple diagnostic — tied to open Work Order WO-0003."},
      ];
      for (const l of lotoRaw) {
        await db.loto_log.upsert({...l, id: uid(l.id), equipId: uid(l.equipId)});
      }

      // ── Spray Log / Pesticide Applications ──────────────────────
      const sprayLogRaw = [
        {id:"sl_001",date:"2026-06-25",type:"ipm_spray",spaceName:"Veg Room",product:"Regalia Bio-Fungicide",manufacturer:"Marrone Bio Innovations",epaRegNum:"84059-3",rate:"1",rateUnit:"oz/gal",volumeApplied:"12",volumeUnit:"gal",areaApplied:"800",applicationMethod:"Backpack sprayer",targetPest:"Powdery mildew (preventive)",weatherTemp:"71",weatherWind:"2",weatherHumidity:"55",rei:"4",phi:"0",applicatorName:"Sofia Ramirez",applicatorLicenseNum:"NY-PEST-2291",notes:"Routine preventive IPM rotation — week 3 of 4"},
        {id:"sl_002",date:"2026-06-27",type:"ipm_spray",spaceName:"Flower Room 6",product:"Suffoil-X",manufacturer:"BioWorks",epaRegNum:"68113-1-70051",rate:"2",rateUnit:"oz/gal",volumeApplied:"18",volumeUnit:"gal",areaApplied:"1200",applicationMethod:"Backpack sprayer",targetPest:"Russet mites (preventive)",weatherTemp:"73",weatherWind:"1",weatherHumidity:"52",rei:"4",phi:"0",applicatorName:"Sofia Ramirez",applicatorLicenseNum:"NY-PEST-2291",notes:"Pre-flip preventive pass, FR6 flips to flower Jul 10"},
      ];
      for (const sl of sprayLogRaw) {
        await db.spray_log.upsert({...sl, id: uid(sl.id)});
      }

      // ── IPM Tracker ── beneficial releases, scouting, and threshold
      // actions live here now instead of Spray Log — sl_003 above used to
      // be a beneficial-release row misfiled into the pesticide log; it's
      // properly represented as ipm_002 below instead.
      const ipmLogRaw = [
        {id:"ipm_001",entryType:"scouting",spaceId:"gs_009",roomName:"Veg — Mixed Strains",targetPest:"Thrips",status:"completed",performedDate:"2026-07-15",performedBy:"emp_002",pestCount:"3",thresholdExceeded:false,notes:"Routine weekly scouting, Veg Room — counts well under threshold."},
        {id:"ipm_002",entryType:"beneficial_release",spaceId:"gs_009",roomName:"Veg — Mixed Strains",targetPest:"Thrips (preventive biocontrol)",status:"completed",performedDate:"2026-07-01",performedBy:"emp_001",species:"Amblyseius cucumeris",releaseRate:"5",releaseUnit:"insects/sqft",notes:"Monthly sachet release, Veg Room — mirrors Cultivation Inputs ci_002 cost record."},
        {id:"ipm_003",entryType:"threshold_action",spaceId:"gs_002",roomName:"FR6 — Black Maple Cycle 4",targetPest:"Russet mites",status:"completed",performedDate:"2026-06-27",performedBy:"emp_002",pestCount:"14",thresholdExceeded:true,actionTaken:"Scheduled Suffoil-X preventive spray (see Spray Log sl_002).",notes:"Pre-flip scouting round flagged elevated counts in FR6 ahead of Jul 10 flip."},
        {id:"ipm_004",entryType:"beneficial_release",spaceId:"gs_009",roomName:"Veg — Mixed Strains",targetPest:"Preventive biocontrol ahead of upcoming batches",status:"planned",scheduledDate:"2026-07-25",performedBy:"emp_002",species:"Amblyseius cucumeris",releaseRate:"5",releaseUnit:"insects/sqft",batchIds:["pb_006","pb_007"],notes:"Planned release tied to the Blueberry Headband vape batch and Zaza Runtz flower batch currently in queue."},
      ];
      for (const ip of ipmLogRaw) {
        const {batchIds,...rest} = ip;
        await db.ipm_log.upsert({...rest, id: uid(ip.id), spaceId: uid(ip.spaceId), performedBy: ip.performedBy?uid(ip.performedBy):"", batchIds: (batchIds||[]).map(b=>uid(b))});
      }

      // ── TC Tracker, Facility Map, Pheno Hunt ─────────────────────
      // All three are now wired to real tables (db.tc_accessions/
      // tc_vessels/tc_formulas, db.facility_map_spaces, db.pheno_hunts) —
      // seed through db.*upsert() like every other Supabase-backed module
      // above, not localStorage.
      try {
        const tcAccessions = [
          {id:"tca_001",strainName:"Black Maple",sourceType:"mother_plant",initiatedDate:"2026-05-15",initiatedBy:"Priya Nair",purpose:"preservation",hlvStatus:"cleared",notes:"Source from mother room pheno BM-04. HLV-free confirmed via PCR.",status:"active"},
          {id:"tca_002",strainName:"Gorilla Cake",sourceType:"mother_plant",initiatedDate:"2026-05-20",initiatedBy:"Priya Nair",purpose:"preservation",hlvStatus:"cleared",notes:"Standard preservation accession.",status:"active"},
          {id:"tca_003",strainName:"Sour Diesel OG",sourceType:"mother_plant",initiatedDate:"2026-06-01",initiatedBy:"Priya Nair",purpose:"hlv_cleanup",hlvStatus:"cleared",notes:"Post-cleanup accession, HLV-free run confirmed.",status:"active"},
        ];
        for (const a of tcAccessions) await db.tc_accessions.upsert({...a, id:uid(a.id)});

        const tcVessels = [
          {id:"tcv_001",accessionId:"tca_001",label:"BM-04-A",stage:"stage2",stageDate:"2026-06-01",mediaBase:"Athena Shoots",mediaLotNum:"AS-2604",contaminated:false,health:"Good",transferCount:3,explantDate:"2026-05-15",explantSource:"Mother room pheno BM-04",notes:"Clean stock, transitioning to rooting stage next cycle.",log:[]},
          {id:"tcv_002",accessionId:"tca_002",label:"GC-01-A",stage:"stage3",stageDate:"2026-06-15",mediaBase:"Athena Roots",mediaLotNum:"AR-1092",contaminated:false,health:"Good",transferCount:2,explantDate:"2026-05-20",explantSource:"Mother room",notes:"Rooting stage, transitioning to ex vitro acclimatization next cycle.",log:[]},
          {id:"tcv_003",accessionId:"tca_003",label:"SD-02-A",stage:"explant",stageDate:"2026-06-20",mediaBase:"WPM",mediaLotNum:"WP-3301",contaminated:false,health:"Good",transferCount:1,explantDate:"2026-06-01",explantSource:"Mother room",notes:"New accession, initial establishment phase.",log:[]},
          {id:"tcv_004",accessionId:"tca_001",label:"BM-04-B",stage:"stage2",stageDate:"2026-05-15",mediaBase:"Athena Shoots",mediaLotNum:"AS-2589",contaminated:true,contamType:"Bacterial (cloudy media)",contamDate:"2026-06-14",health:"Poor — consider discard",transferCount:4,explantDate:"2026-05-15",explantSource:"Mother room pheno BM-04",notes:"Contamination detected June 14 — bacterial. Quarantined, source review initiated.",log:[]},
        ];
        for (const v of tcVessels) await db.tc_vessels.upsert({...v, id:uid(v.id), accessionId:uid(v.accessionId)});

        const tcFormulas = [
          {id:"tcf_001",name:"Standard Multiplication",stage:"stage1",base:"Athena Shoots",volume:1000,agar:7,ph:5.7,pgr1name:"BAP",pgr1mg:0.5,pgr2name:"IBA",pgr2mg:0,notes:"Standard multiplication-stage formula for most cultivars."},
          {id:"tcf_002",name:"Standard Rooting",stage:"stage3",base:"Athena Roots",volume:1000,agar:6,ph:5.6,pgr1name:"IBA",pgr1mg:1.0,pgr2name:"",pgr2mg:0,notes:"Root-induction formula, lower agar for easier ex vitro transfer."},
        ];
        for (const f of tcFormulas) await db.tc_formulas.upsert({...f, id:uid(f.id)});

        const facilityRooms = [
          {id:"fmr_001",name:"Processing Room",type:"Processing Room",sqft:1000,status:"active",assignedBatchIds:[uid("pb_009"),uid("pb_010"),uid("pb_011")],cleanIntervalDays:3,notes:"Extraction, trimming, packaging",cleanLog:[{date:new Date(Date.now()-2*86400000).toISOString().split("T")[0],type:"Full Sanitation",by:"Tyler Bates",notes:"Post-production full clean",batchId:""}]},
          {id:"fmr_002",name:"Dry / Cure Room",type:"Dry / Cure Room",sqft:800,status:"active",assignedBatchIds:[uid("pb_001"),uid("pb_002")],cleanIntervalDays:7,notes:"Drying nets and CVault cure station",cleanLog:[{date:new Date(Date.now()-5*86400000).toISOString().split("T")[0],type:"Surface Wipe-Down",by:"Taryn Delacroix",notes:"Between harvest cycles",batchId:""}]},
          {id:"fmr_003",name:"Compliance Office",type:"Compliance Office",sqft:150,status:"active",assignedBatchIds:[],cleanIntervalDays:7,notes:"QC sample storage and compliance files",cleanLog:[]},
          {id:"fmr_004",name:"Storage — Finished Goods",type:"Storage — Finished Goods",sqft:400,status:"active",assignedBatchIds:[],cleanIntervalDays:14,notes:"Packaged product awaiting delivery",cleanLog:[{date:new Date(Date.now()-10*86400000).toISOString().split("T")[0],type:"Deep Clean",by:"Tyler Bates",notes:"Monthly deep clean",batchId:""}]},
          {id:"fmr_005",name:"Receiving / Shipping",type:"Receiving / Shipping",sqft:200,status:"active",assignedBatchIds:[],cleanIntervalDays:7,notes:"Inbound supplies and outbound orders",cleanLog:[]},
        ];
        for (const r of facilityRooms) await db.facility_map_spaces.upsert({...r, id:uid(r.id)});

        const phenoHunts = [
          {id:"ph_001",strainName:"Purple Runtz F2",breeder:"In-house",seedSource:"Self-pollinated Zaza Runtz",seedCount:12,germDate:"2026-05-01",notes:"F2 pop from our own Zaza Runtz — hunting for a keeper with tighter internodes.",
            seeds:[
              {id:"phs_001",phenoNum:"1",sex:"female",germinated:true,isKeeper:true,stage:"Flower",cloneCutDate:"2026-05-22",testRunLinked:"",coaTHC:"0.19",coaTHCa:"24.8",coaCBD:"0.03",coaTerps:"2.9",scores:{structure:8,aroma:9,vigor:7},observations:"Strong candy-fruit terp profile, tight node spacing. Leading candidate.",archived:false},
              {id:"phs_002",phenoNum:"2",sex:"female",germinated:true,isKeeper:false,stage:"Flower",cloneCutDate:"2026-05-22",testRunLinked:"",coaTHC:"0.17",coaTHCa:"22.1",coaCBD:"0.04",coaTerps:"2.3",scores:{structure:6,aroma:7,vigor:8},observations:"Good vigor but stretchy, aroma less distinct than #1.",archived:false},
              {id:"phs_003",phenoNum:"3",sex:"male",germinated:true,isKeeper:false,stage:"Vegetative",cloneCutDate:"",testRunLinked:"",coaTHC:"",coaTHCa:"",coaCBD:"",coaTerps:"",scores:{},observations:"Culled — male.",archived:true},
            ]},
          {id:"ph_002",strainName:"Blue Gelonade",breeder:"In-house",seedSource:"Blueberry Headband × Lemonade",seedCount:8,germDate:"2026-06-10",notes:"New cross testing blueberry terps against a citrus-forward line.",
            seeds:[
              {id:"phs_004",phenoNum:"1",sex:"unknown",germinated:true,isKeeper:false,stage:"Seedling",cloneCutDate:"",testRunLinked:"",coaTHC:"",coaTHCa:"",coaCBD:"",coaTerps:"",scores:{},observations:"Too early to sex — healthy seedling.",archived:false},
              {id:"phs_005",phenoNum:"2",sex:"unknown",germinated:true,isKeeper:false,stage:"Seedling",cloneCutDate:"",testRunLinked:"",coaTHC:"",coaTHCa:"",coaCBD:"",coaTerps:"",scores:{},observations:"Healthy seedling, slightly slower to establish than #1.",archived:false},
            ]},
        ];
        for (const h of phenoHunts) await db.pheno_hunts.upsert({...h, id:uid(h.id)});

        // Microbial Remediation — flag one harvest batch as aspergillus-positive
        // so there's something to remediate. Links to the Mango Haze harvest
        // batch (id 1003) via the same uid() map used when it was created above.
        const remediationRecords = [
          {id:"rm_001",sourceType:"harvest",sourceId:uid(1003),strainName:"Mango Haze",weightG:"9280",
            labName:"Kaycha Labs NY",labReportRef:"KC-NY-2026-0798-R",testDate:"2026-06-21",
            tyamCfu:"180000",tabCfu:"45000",aspergillus:true,
            gyPerHour:"1000",turnRequired:true,status:"flagged",retestResult:"",
            notes:"Aspergillus flagged on initial COA — batch held pending irradiation and retest. Scheduling irradiation run this week."},
        ];
        for (const rec of remediationRecords) await db.remediation.upsert({...rec, id:uid(rec.id)});
      } catch(e) { console.warn("TC Tracker / Facility Map / Pheno Hunt / Remediation demo seed skipped:", e.message); }

      setStatusMsg("✓ Demo data loaded — all Supabase modules (including TC Tracker, Facility Map, and Pheno Hunt) are populated. Refresh any module to see it. Facility name/license was NOT changed (needs FacilitySettings.jsx field names to do that safely).");
    } catch(e) {
      console.error("Demo load error:", e);
      setStatusMsg("✗ Demo load failed: "+e.message+" — some data may have partially loaded. Check the browser console for details.");
    } finally {
      setDemoLoading(false);
    }
  }
  const fileRef=useRef();

  async function clearAllData(){
    if(!window.confirm("This will permanently delete ALL data in ResinOps — every table, for this facility. Are you sure? This cannot be undone.")) return;
    setClearLoading(true);
    setStatusMsg("Clearing all data…");
    try{
      let stillFailing = [];
      if (isSupabaseEnabled) {
        const fid = getCurrentFacility();
        if (!fid) {
          throw new Error("No active facility selected — refusing to clear data (this would otherwise delete every tenant's records, not just yours). Reload the app and select a facility, then try again.");
        }
        let remaining = TABLE_NAMES.filter(t => t !== "facilities");
        // Multi-pass: some tables can't be cleared until other tables that
        // reference them (foreign keys) are cleared first. Rather than hand-map
        // every dependency, just retry whatever's left a few times — each pass
        // clears whatever it can, so dependency order resolves itself.
        for (let pass=0; pass<6 && remaining.length>0; pass++){
          const failedThisPass = [];
          for (const table of remaining) {
            const { error } = await supabase.from(table).delete().eq("facility_id", fid);
            if (error) failedThisPass.push(table);
          }
          remaining = failedThisPass;
        }
        stillFailing = remaining;
        if (stillFailing.length) console.warn("Could not fully clear these tables after retries:", stillFailing);
      }
      const keys = Object.keys(localStorage).filter(k=>k.startsWith("resinops_"));
      keys.forEach(k=>localStorage.removeItem(k));
      setStatusMsg(stillFailing.length
        ? "⚠ Cleared most data, but these tables wouldn't fully clear even after retries: "+stillFailing.join(", ")+" — check the console for details."
        : "✓ All ResinOps data cleared (Supabase + localStorage) — ready for a fresh demo load. Refresh any open module to see it clear.");
    }catch(e){
      console.error("Clear all error:", e);
      setStatusMsg("✗ Clear failed: "+e.message+" — some tables may have partially cleared.");
    }finally{
      setClearLoading(false);
    }
  }
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
  : `Auto-detect which ResinOps module this data belongs to. These rules are ABSOLUTE — follow them in order:

RULE 1 — spray_log ONLY if file has ALL THREE: "EPA Registration Number" column AND "Re-Entry Interval" column AND "Licensed Applicator" column. Missing even one = NOT spray_log.
RULE 2 — cult_inputs if file has "Input Type" column OR products are clearly nutrients/amendments/beneficial insects (Athena Grow, CalMag, Vitamax, Koppert, cucumeris, worm castings) with zero EPA registration numbers in the data.
RULE 3 — sales_orders if file has dispensary/account names AND order totals AND order dates.
RULE 4 — production_batches if file has product type/category AND scheduled dates AND batch status.
RULE 5 — harvest_batches if file has batch IDs AND harvest dates AND wet weight.
RULE 6 — qc_tests if file has sample IDs AND cannabinoid percentages AND lab pass/fail panels.
RULE 7 — employees, equipment, inventory, vendors, strains, spaces for all other types.

MOST IMPORTANT: Any file containing nutrient products (Athena, CalMag, Grotek, Botanicare, etc.) or beneficial insects (Koppert, cucumeris) with NO EPA registration numbers is ALWAYS cult_inputs. It is NEVER spray_log.`}

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
      thca:toNum(r.thca||r.thca_percent||r["THCa %"]||r["THCa"]),
      thc:toNum(r.thc||r.delta_9_thc||r.total_thc||r["Delta-9 THC %"]||r["Total THC %"]||r["THC"]),
      totalThc:toNum(r.totalThc||r.total_thc||r["Total THC %"]||r["Total THC"]),
      cbda:toNum(r.cbda||r.cbda_percent||r["CBDa %"]||r["CBDa"]),
      cbd:toNum(r.cbd||r.cbd_percent||r["CBD %"]||r["CBD"]),
      cbg:toNum(r.cbg||r.cbg_percent||r["CBG %"]||r["CBG"]),
      cbn:toNum(r.cbn||r.cbn_percent||r["CBN %"]||r["CBN"]),
      thcv:toNum(r.thcv||r.thcv_percent||r["THCv %"]||r["THCv"]),
      cbc:toNum(r.cbc||r.cbc_percent||r["CBC %"]||r["CBC"]),
      totalCannabinoids:toNum(r.totalCannabinoids||r.total_cannabinoids||r.total_cannabinoids_percent||r["Total Cannabinoids %"]||r["Total Cannabinoids"]),
      totalTerpenes:toNum(r.totalTerpenes||r.total_terpenes||r.total_terpenes_percent||r["Total Terpenes %"]||r["Total Terpenes"]),
      myrcene:toNum(r.myrcene||r.beta_myrcene||r["beta-Myrcene %"]||r["beta-Myrcene"]||r["Myrcene %"]||r["Myrcene"]),
      limonene:toNum(r.limonene||r.limonene_percent||r["Limonene %"]||r["Limonene"]),
      caryophyllene:toNum(r.caryophyllene||r.beta_caryophyllene||r["beta-Caryophyllene %"]||r["beta-Caryophyllene"]||r["Caryophyllene %"]||r["Caryophyllene"]),
      linalool:toNum(r.linalool||r.linalool_percent||r["Linalool %"]||r["Linalool"]),
      pinene:toNum(r.pinene||r.alpha_pinene||r["alpha-Pinene %"]||r["alpha-Pinene"]||r["Pinene %"]||r["Pinene"]),
      ocimene:toNum(r.ocimene||r.ocimene_percent||r["Ocimene %"]||r["Ocimene"]),
      terpinolene:toNum(r.terpinolene||r.terpinolene_percent||r["Terpinolene %"]||r["Terpinolene"]),
      humulene:toNum(r.humulene||r.alpha_humulene||r["Humulene %"]||r["Humulene"]),
      tyam:toNum(r.tyam||r.total_yeast_and_mold||r.total_yeast_mold_cfu_g||r["Total Yeast and Mold CFU/g"]||r["TYAM"]),
      tab:toNum(r.tab||r.total_aerobic_count||r.total_aerobic_count_cfu_g||r["Total Aerobic Count CFU/g"]||r["TAC"]),
      waterActivity:toNum(r.waterActivity||r.water_activity||r.water_activity_aw||r["Water Activity Aw"]||r["Water Activity"]),
      moistureContent:toNum(r.moistureContent||r.moisture_content||r.moisture_content_percent||r["Moisture Content %"]||r["Moisture Content"]),
      aspergillus:toBool(r.aspergillus||r.aspergillus_panel||r["Aspergillus Panel"]),
      salmonella:toBool(r.salmonella||r.salmonella_panel||r["Salmonella"]),
      stec:toBool(r.stec||r.stec_e_coli||r["STEC E coli"]||r["STEC"]),
      ecoli:toBool(r.ecoli||r.e_coli||r["E. coli"]),
      microbialPass:toBool(r.microbialPass||r.microbial_pass),
      pesticidesPass:toBool(r.pesticidesPass||r.pesticides_pass||r.pesticide_residues||r["Pesticide Residues"]),
      heavyMetalsPass:toBool(r.heavyMetalsPass||r.heavy_metals_pass||r.heavy_metals||r["Heavy Metals"]),
      foreignMatterPass:toBool(r.foreignMatterPass||r.foreign_matter_pass||r.foreign_matter||r["Foreign Matter"]),
      overallPass:toBool(r.overallPass||r.overall_pass||r.overall_result||r["Overall Result"]),
    };
    // Derive overallPass if not explicitly set
    if(norm.overallPass===undefined||norm.overallPass===null){
      const bools=[norm.microbialPass,norm.pesticidesPass,norm.heavyMetalsPass,norm.foreignMatterPass,norm.aspergillus,norm.salmonella,norm.stec,norm.ecoli].filter(v=>v!==null);
      if(bools.some(v=>v===false)) norm.overallPass=false;
      else if(bools.length>0&&bools.every(v=>v===true)) norm.overallPass=true;
      else norm.overallPass=toBool(r.overallPass);
    } else {
      if(norm.overallPass===undefined) norm.overallPass=toBool(r.overallPass||r.overall_pass||r.overall_result||r["Overall Result"]);
    }
    return norm;
  }

  async function confirmImport(batchLinks={}){
    if(!importResult?.records?.length) return;
    const target=importTarget||importResult.detectedType;
    const tgt=IMPORT_TARGETS[target];
    const table=TARGET_TABLE[target];
    if(!tgt||!table){ setImportErr("Cannot identify where to save this data. Please select a data type above and re-analyze."); return; }
    try{
      const rawRecords=importResult.records.map(r=>({
        ...r,
        id:r.id&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id)?r.id:crypto.randomUUID()
      }));
      // ── Normalize records based on target type ──────────────────────────
      let newRecords;
      if(target==="qc_tests"){
        const hb=await db.harvest_batches.list();
        newRecords = rawRecords.map((r,i)=>{
          // Resolve sampleId from all possible field name variants
          const sampleId=r.sampleId||r.sample_id||r["Sample ID"]||r["Lab Sample ID"]||"";
          // Auto-link: check if harvest batch already has matching coaSampleId
          const autoMatch=sampleId?hb.find(b=>(b.coaSampleId||b.coa_sample_id||b["COA Sample ID"]||"")===sampleId):null;
          const linkedId=batchLinks[sampleId||i]||autoMatch?.id||"";
          const linkedBatch=linkedId?hb.find(b=>String(b.id)===String(linkedId)):null;
          // batchId alone isn't a real qc_tests column — harvestBatchId/
          // productionBatchId are, split by batchType, same as
          // QCTesting.jsx's own save() does. Every COA-import link here
          // is to a harvest batch (linkedBatch comes from hb, the
          // harvest_batches list), so batchType stays the "harvest"
          // default normalizeQCRecord already applies.
          return normalizeQCRecord({...r,sampleId,batchId:linkedId||"",harvestBatchId:linkedId||"",batchName:linkedBatch?(linkedBatch.strainName+(linkedBatch.d?" ("+new Date(linkedBatch.d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+")":"")):"",});
        });
      } else if(target==="employees"){
        newRecords = rawRecords.map(r=>({...r,id:r.id,name:r.name||r.full_name||r["Full Name"]||r["Employee Name"]||"",role:r.role||r.job_title||r["Job Title"]||r["Title"]||r["Position"]||"Other",department:r.department||r["Department / Area"]||r["Department"]||r["Area"]||"Other",status:["active","inactive"].includes((r.status||"").toLowerCase())?(r.status||"").toLowerCase():"active",hireDate:r.hireDate||r.employment_start||r["Employment Start"]||r["Start Date"]||r["Hire Date"]||"",phone:r.phone||r.cell_phone||r["Cell Phone"]||r["Phone"]||"",email:r.email||r.work_email||r["Work Email"]||r["Email"]||"",pestLicenseNum:r.pestLicenseNum||r.pesticide_cert_number||r.cert_number||r["Pesticide Cert #"]||r["License #"]||"",pestLicenseCategory:r.pestLicenseCategory||r.pesticide_cert_category||r.cert_category||r["Cert Category"]||r["License Type"]||"",pestLicenseExpiry:r.pestLicenseExpiry||r.pesticide_cert_expiry||r.cert_expiry_date||r["Cert Expiry Date"]||r["License Expires"]||"",certs:Array.isArray(r.certs)?r.certs:[],trainings:Array.isArray(r.trainings)?r.trainings:[],notes:r.notes||r["Notes"]||"",}));
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
          return {...r,id:r.id,name:r.name||r.asset_description||r.equipment_name||r["Asset Description"]||r["Equipment Name"]||r["Item"]||"",cat,make:r.make||r.brand||r.manufacturer||r.brand_manufacturer||r["Brand"]||r["Manufacturer"]||r["Brand / Manufacturer"]||"",model:r.model||r.model_number||r["Model Number"]||r["Model"]||"",serial:r.serial||r.serial_number||r["Serial Number"]||r["Serial"]||"",assetTag:r.assetTag||r.asset_tag||r["Asset Tag"]||"",location:r.location||r.room_location||r["Room / Location"]||r["Location"]||"",purchaseDate:r.purchaseDate||r.purchase_date||r["Purchase Date"]||"",purchasePrice:String(r.purchasePrice||r.purchase_price||r.cost||r["Cost (USD)"]||r["Cost"]||"").replace(/[$,]/g,""),warrantyExpires:r.warrantyExpires||r.warranty_expiration||r.warranty_expires||r["Warranty Expiration"]||"",pmFreqDays:String(pmDays),lastServiceDate:r.lastServiceDate||r.last_service||r.last_service_date||r["Last Service"]||"",status:"active",notes:r.notes||r["Notes"]||"",};
        });
      } else if(target==="strains"){
        newRecords = rawRecords.map(r=>({...r,id:r.id,name:r.name||r.cultivar_name||r.strain_name||r.strain||r["Cultivar Name"]||r["Strain Name"]||r["Strain"]||"",type:r.type||r.strain_type||r["Strain Type"]||r["Type"]||"Hybrid",parentage:r.parentage||r.genetic_cross||r.genetic_cross_lineage||r.lineage||r["Genetic Cross / Lineage"]||r["Lineage"]||r["Genetics"]||"",breeder:r.breeder||r.original_breeder||r["Original Breeder"]||r["Breeder"]||r["Seed Company"]||"",thcaAvg:r.thcaAvg||r.avg_thca||r.avg_thca_pct||r.thca_avg||r["Avg THCa %"]||r["Avg THCa"]||"",thcAvg:r.thcAvg||r.avg_thc||r.avg_thc_pct||r["Avg THC %"]||r["Avg THC"]||"",cbdAvg:r.cbdAvg||r.avg_cbd||r.avg_cbd_pct||r["Avg CBD %"]||r["Avg CBD"]||"",terpsAvg:r.terpsAvg||r.avg_total_terpenes||r.avg_terpenes||r.avg_total_terpenes_pct||r["Avg Total Terpenes %"]||r["Avg Total Terpenes"]||"",dominantTerpenes:r.dominantTerpenes||r.dominant_terpenes||r["Dominant Terpenes"]||r["Top Terpenes"]||"",avgYieldGPerSqft:r.avgYieldGPerSqft||r.avg_yield||r.avg_yield_g_sqft||r["Avg Yield (g/sqft canopy)"]||r["Avg Yield"]||"",avgFlowerWeeks:r.avgFlowerWeeks||r.flower_time_weeks||r.flower_time||r.flower_weeks||r["Flower Time (weeks)"]||r["Flower Weeks"]||"",avgVegWeeks:r.avgVegWeeks||r.veg_time_weeks||r.veg_time||r["Veg Time (weeks)"]||r["Veg Weeks"]||"",aroma:r.aroma||r.aroma_notes||r["Aroma Notes"]||r["Aroma"]||"",flavor:r.flavor||r.flavor_profile||r["Flavor Profile"]||r["Flavor"]||"",effectProfile:r.effectProfile||r.effect_description||r.effects||r["Effect Description"]||r["Effects"]||"",notes:r.notes||r.internal_notes||r["Internal Notes"]||r["Notes"]||"",status:r.status||"active",salesDescription:r.salesDescription||r.sales_description||r["Sales Description"]||"",}));
      } else if(target==="spray_log"){
        newRecords = rawRecords.map(r=>({...r,
          id: r.id,
          type: r.type||"ipm_spray",
          date: r.date||r.application_date||r["Application Date"]||"",
          // Space — Claude may encode "Grow Space / Room" as grow_space___room or grow_space_room or grow_space
          spaceName: r.spaceName||r.space_name||r.grow_space___room||r.grow_space_room||r.grow_space||r["Grow Space / Room"]||r["Grow Space"]||r["Room"]||r["Space"]||"",
          // Product — scan ALL keys for any that contain "product" or "pesticide" if standard lookups fail
          product: (()=>{
            const direct = r.product||r.product___pesticide_name||r.product_pesticide_name||r.pesticide_name||r["Product / Pesticide Name"]||r["Product"]||r["Pesticide Name"]||r["Chemical"]||r["product_name"]||r["chemical_name"]||"";
            if(direct) return direct;
            // Scan all keys for any containing "product" or "pesticide"
            const key = Object.keys(r).find(k=>k.toLowerCase().includes("product")||k.toLowerCase().includes("pesticide")||k.toLowerCase().includes("chemical"));
            return key ? String(r[key]||"") : "";
          })(),
          manufacturer: r.manufacturer||r["Manufacturer"]||r["Brand"]||"",
          epaRegNum: r.epaRegNum||r.epa_registration_number||r.epa_reg_number||r.epa_number||r["EPA Registration Number"]||r["EPA Reg #"]||r["EPA #"]||r["EPA"]||"",
          // Rate — "2 oz/gal" → rate="2", rateUnit="oz/gal"
          rate: (()=>{ const raw=String(r.rate||r.label_rate||r["Label Rate"]||""); const m=raw.match(/^([\d.]+)/); return m?m[1]:""; })(),
          rateUnit: (()=>{ const raw=String(r.rate||r.label_rate||r["Label Rate"]||""); const m=raw.match(/^[\d.]+\s*(.*)/); return r.rateUnit||r.rate_unit||(m&&m[1]?m[1]:"oz/gal"); })(),
          volumeApplied: String(r.volumeApplied||r.amount_mixed||r.amount_mixed_gallons||r["Amount Mixed (gallons)"]||r["Amount Mixed"]||""),
          volumeUnit: r.volumeUnit||"gal",
          // Area — "Area Treated (sq ft)" → area_treated__sq_ft__ or area_treated_sq_ft
          areaApplied: (()=>{
            const d=r.areaApplied||r.area_treated||r.area_treated_sq_ft||r["Area Treated (sq ft)"]||r["Area Treated"]||r["Area Sq Ft"]||"";
            if(d) return String(d);
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("area"));
            return k?String(r[k]||""):"";
          })(),
          applicationMethod: r.applicationMethod||r.application_equipment||r.application_method||r["Application Equipment"]||r["Application Method"]||"Backpack sprayer",
          targetPest: (()=>{
            const d=r.targetPest||r.target_pest___disease||r.target_pest_disease||r.target_pest||r["Target Pest / Disease"]||r["Target Pest"]||r["Pest"]||"";
            if(d) return d;
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("pest")||k.toLowerCase().includes("target"));
            return k?String(r[k]||""):"";
          })(),
          weatherTemp: (()=>{
            const d=r.weatherTemp||r.temp_at_application||r.temp_at_application__f__||r["Temp at Application (F)"]||r["Temp"]||"";
            if(d) return String(d);
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("temp"));
            return k?String(r[k]||""):"";
          })(),
          weatherWind: (()=>{
            const d=r.weatherWind||r.wind_speed||r.wind_speed__mph__||r["Wind Speed (mph)"]||r["Wind Speed"]||"";
            if(d) return String(d);
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("wind"));
            return k?String(r[k]||""):"";
          })(),
          weatherHumidity: (()=>{
            const d=r.weatherHumidity||r.relative_humidity||r.relative_humidity____||r["Relative Humidity (%)"]||r["RH"]||"";
            if(d) return String(d);
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("humid")||k.toLowerCase().includes("relative"));
            return k?String(r[k]||""):"";
          })(),
          rei: (()=>{
            const d=r.rei||r.re_entry_interval||r.re_entry_interval__hrs__||r["Re-Entry Interval (hrs)"]||r["REI"]||"";
            if(d) return String(d);
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("rei")||k.toLowerCase().includes("re_entry")||k.toLowerCase().includes("reentry"));
            return k?String(r[k]||""):"";
          })(),
          phi: (()=>{
            const d=r.phi||r.pre_harvest_interval||r.pre_harvest_interval__days__||r["Pre-Harvest Interval (days)"]||r["PHI"]||"";
            if(d) return String(d);
            const k=Object.keys(r).find(k=>k.toLowerCase().includes("phi")||k.toLowerCase().includes("harvest_interval")||k.toLowerCase().includes("pre_harvest"));
            return k?String(r[k]||""):"";
          })(),
          applicatorName: r.applicatorName||r.licensed_applicator||r.applicator_name||r["Licensed Applicator"]||r["Applicator"]||"",
          // "Pesticide License #" → pesticide_license___
          applicatorLicenseNum: r.applicatorLicenseNum||r.pesticide_license___||r.pesticide_license||r.pesticide_license_number||r["Pesticide License #"]||r["License #"]||"",
          notes: r.notes||r["Notes"]||"",
        }));
      } else if(target==="spaces"){
        newRecords = rawRecords.map(r=>({...r,id:r.id,name:r.name||r.room_name||r["Room Name"]||r["Space Name"]||r["Room"]||"",type:r.type||r.room_type||r["Room Type"]||r["Type"]||"Indoor",sqft:r.sqft||r.total_sq_ft||r["Total Sq Ft"]||r["Square Footage"]||r["Sq Ft"]||"",canopy:r.canopy||r.canopy_sq_ft||r["Canopy Sq Ft"]||r["Canopy Square Footage"]||"",maxPlants:r.maxPlants||r.max_plants||r["Max Plants"]||r["Max Plant Count"]||"",lightType:r.lightType||r.light_type||r["Light Type"]||"LED",lightCount:r.lightCount||r.light_count||r["Lights Count"]||r["Light Count"]||"",lightWatts:r.lightWatts||r.watts_per_light||r.watts_per_fixture||r["Watts Per Light"]||r["Watts Per Fixture"]||"",resetDays:r.resetDays||r.reset_days||r.clean_reset_duration||r["Clean & Reset Duration"]||r["Reset Days"]||"",lastHarvestDate:r.lastHarvestDate||r.last_harvest_date||r["Last Harvest Date"]||"",status:r.status||"active",notes:r.notes||r["Notes"]||"",}));
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
            id: r.id,
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
      } else if(target==="inventory"){
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
          return {...r,id:r.id,n:name,cat,uom:r.uom||r.unit||r.unit_of_measure||r["Unit of Measure"]||"each",reorderAt:parseFloat(r.reorderAt??r.reorder_at??r.reorder_point??r["Reorder At"]??0)||0,reorderQty:parseFloat(r.reorderQty??r.reorder_qty??r["Reorder Qty"]??0)||0,vm:["fifo","average","last"].includes((r.vm||r.valuation_method||r["Valuation Method"]||"").toLowerCase())?(r.vm||r.valuation_method||r["Valuation Method"]).toLowerCase():"average",lots,lastCost:cost||0,notes:r.notes||r["Notes"]||"",};
        });
      } else if(target==="production_batches"){
        const WF=[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:10},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
        const PR=[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:10},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
        const EX=[{n:"Intake & Prep",days:2},{n:"Extraction",days:3},{n:"Post-Processing",days:5},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}];
        newRecords = rawRecords.map(r=>{
          const rawCat=(r.catLabel||r.cat_label||r.product_type||r["Product Type"]||r["Category"]||"").toLowerCase();
          let cat="whole_flower", catLabel="Whole Flower";
          if(rawCat.includes("pre")||rawCat.includes("roll")||rawCat.includes("cone")){ cat="pre_roll"; catLabel="Pre-Roll"; }
          else if(rawCat.includes("extract")||rawCat.includes("concentrate")||rawCat.includes("rosin")||rawCat.includes("distillate")){ cat="extract"; catLabel="Concentrate"; }
          else if(rawCat.includes("vape")||rawCat.includes("cart")){ cat="vape"; catLabel="Vape"; }
          else if(rawCat.includes("edible")||rawCat.includes("gummy")){ cat="edible"; catLabel="Edible"; }
          const rawStatus=(r.status||r["Status"]||"").toLowerCase();
          const status=rawStatus.includes("complete")||rawStatus.includes("done")||rawStatus.includes("finish")?"complete":rawStatus.includes("progress")||rawStatus.includes("active")?"in_progress":"scheduled";
          const steps=cat==="pre_roll"?PR.map(s=>({...s})):cat==="extract"?EX.map(s=>({...s})):WF.map(s=>({...s}));
          return {
            ...r,
            id: r.id,
            name: r.name||r.batch_name||r["Batch Name"]||r["Name"]||"",
            cat,
            catLabel: r.catLabel||r.cat_label||catLabel,
            subLabel: r.subLabel||r.sub_label||r.sub_type||r["Sub-Type"]||r["Sub Type"]||"",
            strains: r.strains||r.strain||r["Strain(s)"]||r["Strain"]||r["Cultivar"]||"",
            d: r.d||r.scheduled_start||r.start_date||r["Scheduled Start"]||r["Start Date"]||r["Date"]||"",
            status,
            yieldEst: r.yieldEst||r.yield_est||r.estimated_yield||r["Estimated Yield"]||r["Est. Output"]||r["Yield"]||"",
            actual_yield: r.actual_yield||r["Actual Yield"]||r["Actual"]||"",
            inputAmt: parseFloat(r.inputAmt||r.input_amt||r["Input Amount"]||0)||0,
            unit: r.unit||"g",
            notes: r.notes||r["Notes"]||"",
            steps,
            isLinked: false,
          };
        });
      } else if(target==="harvest_batches"){
        const DS={
          whole_flower:[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:10},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
          pre_roll:[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:10},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
          extract:[{n:"Intake & Prep",days:2},{n:"Extraction",days:3},{n:"Post-Processing",days:5},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
        };
        newRecords = rawRecords.map(r=>{
          const wetLbs=parseFloat(r.wet_weight_lbs||r["Wet Weight lbs"]||r["Wet Weight"]||0)||0;
          const wetG=parseFloat(r.wetWeightG||r.wet_weight_g||0)||0;
          const wetWeightG=Number(wetG>0?wetG:wetLbs>0?Math.round(wetLbs*453.592):0)||0;
          const dryLbs=parseFloat(r.dry_weight_lbs||r["Dry Weight lbs"]||r["Dry Weight"]||0)||0;
          const dryG=parseFloat(r.totalDryWeight||r.total_dry_weight||r.dry_weight_g||0)||0;
          const totalDryWeight=Number(dryG>0?dryG:dryLbs>0?Math.round(dryLbs*453.592):0)||0;
          const rawStatus=(r.status||r["Status"]||"").toLowerCase();
          const status=rawStatus==="complete"||rawStatus==="done"||rawStatus==="completed"||rawStatus==="cured"?"done":"open";
          const cat=r.cat||"whole_flower";
          return {
            ...r,
            id:r.id,
            strainName:r.strainName||r.strain_name||r["Strain Name"]||r["Strain"]||"",
            spaceName:r.spaceName||r.space_name||r.harvest_room||r["Harvest Room"]||r["Grow Space"]||"",
            plants:r.plants||r.plant_count||r["Plant Count"]||"",
            d:r.d||r.harvest_date||r["Harvest Date"]||new Date().toISOString().split("T")[0],
            wetWeightG,totalDryWeight,status,
            coaSampleId:r.coaSampleId||r.coa_sample_id||r["COA Sample ID"]||r["Sample ID"]||"",
            labName:r.labName||r.lab_name||r["Lab Name"]||"",
            thca:r.thca||r["THCa %"]||r["THCa"]||"",
            notes:r.notes||r["Notes"]||"",
            grades:{
              aa:{weight:r.grade_aa||r["Grade AA (g)"]||"",s2s:""},
              a:{weight:r.grade_a||r["Grade A (g)"]||"",s2s:""},
              b:{weight:r.grade_b||r["Grade B (g)"]||"",s2s:""},
              c:{weight:r.grade_c||r["Grade C (g)"]||"",s2s:""},
              trim:{weight:r.trim||r["Trim (g)"]||"",s2s:""},
              waste:{weight:r.waste||r["Waste (g)"]||"",s2s:""},
            },
            steps:Array.isArray(r.steps)&&r.steps.length>0?r.steps:(DS[cat]||DS.whole_flower).map(s=>({...s})),
          };
        });
      } else if(target==="grow_schedule"){
        newRecords = rawRecords.map(r=>{
          const strain1=r.strain||r.strain1||r["Strain 1"]||r["Primary Strain"]||r["Strain"]||r["Cultivar"]||"";
          const plants1=r.plants||r.plants1||r["Plants 1"]||r["Plant Count"]||r["Plants"]||"";
          const strain2=r.strain2||r["Strain 2"]||r["Secondary Strain"]||"";
          const plants2=r.plants2||r["Plants 2"]||"";
          const strains=[{id:Date.now()+Math.random(),name:strain1,plants:String(plants1)}];
          if(strain2) strains.push({id:Date.now()+Math.random(),name:strain2,plants:String(plants2)});
          return {
            id: r.id,
            name: r.name||r.batch_name||r["Batch Name"]||r["Room / Batch"]||r["Name"]||(strain1+" — "+new Date().toISOString().split("T")[0]),
            d: r.d||r.clone_date||r.seed_date||r["Clone / Seed Date"]||r["Clone Date"]||r["Start Date"]||new Date().toISOString().split("T")[0],
            veg: String(r.veg||r.veg_weeks||r["Veg Weeks"]||r["Veg (weeks)"]||"4"),
            flw: String(r.flw||r.flower_weeks||r["Flower Weeks"]||r["Flower (weeks)"]||"9"),
            strains,
            strain: strain1,
            plants: String(plants1),
            status: "active",
            growMapId: "",
            notes: r.notes||r["Notes"]||"",
          };
        });
      } else if(target==="sales_orders"){
        // This normalization used to live (misplaced, never reachable —
        // there was no target==="sales_orders" branch at all) inside
        // grow_schedule's block, silently clobbered by a second
        // newRecords assignment there. Moved here where it belongs, and
        // status/importStatus corrected to match SalesOrders.jsx's real
        // two-field model: `status` is the fulfillment lifecycle
        // (open/fulfilled/canceled), `importStatus` is what this dialog's
        // own schema prompt actually describes (confirmed/pending/waitlist).
        newRecords = rawRecords.map(r=>{
          const dispensaryName=r.dispensaryName||r.dispensary_name||r["Dispensary Name"]||r["Account"]||r["Customer"]||"";
          const licenseNum=r.licenseNum||r.licenseNumber||r.license_num||r.license_number||r["License Number"]||r["License #"]||r["OCM License"]||"";
          const units=parseFloat(r.units||r.units_ordered||r["Units Ordered"]||r["Quantity"]||r["Qty"]||0)||0;
          const unitPrice=parseFloat(String(r.unitPrice||r.unit_price||r["Unit Price"]||r["Price"]||0).replace(/[$,]/g,""))||0;
          const orderTotal=parseFloat(String(r.orderTotal||r.order_total||r["Order Total"]||r["Total"]||0).replace(/[$,]/g,""))||(units*unitPrice)||0;
          const rawStatus=(r.status||r["Status"]||"").toLowerCase();
          const importStatus=rawStatus.includes("confirm")?"confirmed":rawStatus.includes("wait")?"waitlist":"pending";
          const product=r.product||r["Product"]||r["Item"]||"";
          const strain=r.strain||r["Strain"]||r["Cultivar"]||"";
          return {
            id: r.id,
            customerName: dispensaryName,
            customerLicense: licenseNum,
            orderDate: r.orderDate||r.order_date||r["Order Date"]||r["Date"]||"",
            status: "open",
            importStatus,
            notes: (r.notes||r["Notes"]||"")+(product?` | Product: ${product}`:"")+(strain?` | Strain: ${strain}`:""),
            lines: units>0?[{
              id:crypto.randomUUID(),
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

      // Persist every imported record to its real Supabase table. This
      // used to be a single localStorage.setItem(tgt.key, ...) call —
      // in Supabase mode nothing ever actually reached the tables every
      // other module reads via db.<table>.list(), so imports silently
      // vanished (still visible to the user via the success toast).
      for(const r of newRecords){ await db[table].upsert(r); }

      // Populate strain database from COA imports
      if(target==="qc_tests"){
        const strains=await db.strains.list();
        const strainNames=new Set(strains.map(s=>s.name.toLowerCase()));
        const newStrains=newRecords
          .filter(r=>r.strainName&&!strainNames.has(r.strainName.toLowerCase()))
          .map(r=>({
            id:crypto.randomUUID(),
            name:r.strainName,type:"Unknown",parentage:"",breeder:"",
            thcaAvg:r.thca||"",thcAvg:r.thc||"",cbdAvg:r.cbd||"",
            terpsAvg:r.totalTerpenes||"",
            dominantTerpenes:[r.myrcene&&"Myrcene",r.limonene&&"Limonene",r.caryophyllene&&"Caryophyllene"].filter(Boolean).join(", "),
            notes:"Auto-added from COA import",status:"active",salesDescription:"",
          }));
        for(const s of newStrains){ await db.strains.upsert(s); }

        // Auto-create completed harvest batches for passing COAs, or update linked ones
        const passingRecords=newRecords.filter(r=>r.overallPass===true);
        if(passingRecords.length){
          const hb=await db.harvest_batches.list();
          const existingSampleIds=new Set(hb.map(b=>b.coaSampleId).filter(Boolean));
          for(const [i,r] of passingRecords.entries()){
            if(r.harvestBatchId){
              // Update the linked batch to complete with COA data
              const linked=hb.find(b=>String(b.id)===String(r.harvestBatchId));
              if(linked){
                await db.harvest_batches.upsert({
                  ...linked,status:"complete",coaSampleId:r.sampleId,
                  thca:r.thca||linked.thca,thc:r.thc||linked.thc,totalTerpenes:r.totalTerpenes||linked.totalTerpenes,
                  labName:r.labName||linked.labName,
                });
              }
            } else if(!existingSampleIds.has(r.sampleId)){
              // No linked batch — create placeholder
              await db.harvest_batches.upsert({
                id:crypto.randomUUID(),
                strainName:r.strainName||"Unknown",
                d:r.receivedDate||r.submittedDate||new Date().toISOString().split("T")[0],
                status:"complete",coaSampleId:r.sampleId,labName:r.labName,
                thca:r.thca,thc:r.thc,totalTerpenes:r.totalTerpenes,
                notes:"Auto-created from passing COA import ("+(r.sampleId||"no sample ID")+")",
              });
            }
          }
        }
      }

      setImportState("done");
      const extras=target==="qc_tests"?` — strain catalogue & harvest batches updated`:"";
      const skipped=rawRecords.length-newRecords.length;
      const skipMsg=skipped>0?` (${skipped} skipped — missing required fields)`:"";
      setStatusMsg(newRecords.length+" record"+(newRecords.length!==1?"s":"")+" imported to "+tgt.label+extras+skipMsg+" ✓");
      // Log to import history
      const histSaved=await db.import_history.upsert({
        id:crypto.randomUUID(),
        fileName:importResult?.fileName||"unknown",
        dataType:tgt.label,
        recordCount:newRecords.length,
        status:"success",
      });
      setImportHistory(p=>[histSaved,...p].slice(0,50));
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

            {/* Download templates */}
            <div style={{background:"rgba(74,124,89,0.06)",border:"1px solid rgba(74,124,89,0.2)",borderRadius:8,padding:"10px 14px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--accent-2)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>📥 Download import templates</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:8}}>If the AI can't read your file format, download a blank template, fill it out, and re-upload.</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {[
                  ["Employees","TEMPLATE_Employee_Roster"],
                  ["Grow Map","TEMPLATE_Grow_Map"],
                  ["Equipment","TEMPLATE_Equipment_Registry"],
                  ["Inventory","TEMPLATE_Supplies_Inventory"],
                  ["Strains","TEMPLATE_Strain_Catalog"],
                  ["Harvest Batches","TEMPLATE_Harvest_Batches"],
                  ["COA Results","TEMPLATE_COA_Results"],
                  ["Production Batches","TEMPLATE_Production_Batches"],
                  ["Cult. Inputs","TEMPLATE_Cultivation_Inputs"],
                  ["Pesticide Log","TEMPLATE_Pesticide_Spray_Log"],
                  ["Sales Orders","TEMPLATE_Sales_Orders"],
                ].map(([label, file])=>(
                  <button key={file} className="dm-btn dm-secondary" style={{fontSize:10,padding:"4px 10px"}}
                    onClick={()=>{
                      // Generate template CSV on the fly based on known headers
                      const headers = {
                        TEMPLATE_Employee_Roster:"Full Name,Job Title,Department / Area,Employment Start,Cell Phone,Work Email,Pesticide Cert #,Cert Category,Cert Expiry Date,Status,Emergency Contact,Notes",
                        TEMPLATE_Grow_Map:"Room Name,Room Type,Total Sq Ft,Canopy Sq Ft,Max Plants,Light Type,Lights Count,Watts Per Light,Status,Notes",
                        TEMPLATE_Equipment_Registry:"Asset Description,Category/Type,Brand / Manufacturer,Model Number,Serial Number,Asset Tag,Room / Location,Purchase Date,Cost (USD),Warranty Expiration,Service Interval,Last Service,Notes",
                        TEMPLATE_Supplies_Inventory:"Item Name,Category,Unit of Measure,Current Stock,Unit Cost,Reorder At,Reorder Qty,Primary Vendor,Notes",
                        TEMPLATE_Strain_Catalog:"Cultivar Name,Strain Type,Genetic Cross / Lineage,Original Breeder,Avg THCa %,Avg THC %,Avg CBD %,Avg Total Terpenes %,Dominant Terpenes,Avg Yield (g/sqft canopy),Veg Time (weeks),Flower Time (weeks),Aroma Notes,Flavor Profile,Effect Description,Internal Notes",
                        TEMPLATE_Harvest_Batches:"Batch ID,Strain Name,Harvest Room,Harvest Date,Wet Weight lbs,Dry Weight lbs,Grade A (g),Grade B (g),Grade C (g),Trim (g),Waste (g),Plant Count,Dry Room,Cure Start Date,Cure End Date,Status,COA Sample ID,Lab Name,THCa %,Notes",
                        TEMPLATE_COA_Results:"Sample Name,Sample ID,Lab Name,Date Submitted,Date Reported,THCa %,Delta-9 THC %,Total THC %,CBDa %,CBD %,CBG %,CBN %,THCv %,CBC %,Total Cannabinoids %,Total Terpenes %,beta-Myrcene %,Limonene %,Ocimene %,beta-Caryophyllene %,alpha-Pinene %,Linalool %,Humulene %,Total Yeast and Mold CFU/g,Total Aerobic Count CFU/g,Aspergillus Panel,Salmonella,STEC E coli,Pesticide Residues,Heavy Metals,Water Activity Aw,Moisture Content %,Foreign Matter,Overall Result",
                        TEMPLATE_Production_Batches:"Batch Name,Product Type,Sub-Type,Strain(s),Source Harvest Batch,Scheduled Start,Scheduled Complete,Estimated Yield,Status,Assigned To,Notes",
                        TEMPLATE_Cultivation_Inputs:"Grow Space,Date,Input Type,Product,Manufacturer,Rate,Rate Unit,Amount Mixed,Volume Unit,Area Sq Ft,Cost Per Unit,Total Cost,Notes",
                        TEMPLATE_Pesticide_Spray_Log:"Application Date,Grow Space / Room,Product / Pesticide Name,EPA Registration Number,Label Rate,Amount Mixed (gallons),Area Treated (sq ft),Application Equipment,Target Pest / Disease,Temp at Application (F),Wind Speed (mph),Relative Humidity (%),Re-Entry Interval (hrs),Pre-Harvest Interval (days),Licensed Applicator,Pesticide License #,Notes",
                        TEMPLATE_Sales_Orders:"Order ID,Dispensary Name,License Number,Order Date,Requested Delivery,Product,Strain,Units Ordered,Unit Price,Order Total,Status,Notes",
                      };
                      const h = headers[file]||"";
                      const blob = new Blob([h+"\n"], {type:"text/csv"});
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = file+".csv";
                      a.click();
                    }}>
                    ↓ {label}
                  </button>
                ))}
              </div>
            </div>

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
              {importHistory.length>0&&<button className="dm-btn dm-secondary" style={{fontSize:11}} onClick={async()=>{
                if(!window.confirm("Clear import history? This does not delete imported data.")) return;
                try{
                  await Promise.all(importHistory.map(h=>db.import_history.delete(h.id)));
                  setImportHistory([]);
                }catch(e){ console.error("Clear import history failed:",e); }
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
                          {new Date(h.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} {new Date(h.created_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
                        </td>
                        <td style={{fontFamily:"monospace",fontSize:11,color:"var(--text-2)"}}>{h.fileName}</td>
                        <td><span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:10,background:"rgba(74,124,89,0.15)",color:"var(--accent-2)"}}>{h.dataType}</span></td>
                        <td style={{fontWeight:600,color:"var(--accent-2)"}}>{h.recordCount} records</td>
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
                <button className="dm-btn dm-primary" style={{background:"rgba(90,63,160,0.8)"}} disabled={demoLoading} onClick={loadDemoData}>
                  {demoLoading ? "Loading demo data…" : "✨ Load demo facility settings"}
                </button>
                <button className="dm-btn dm-secondary" style={{color:"var(--danger)",borderColor:"rgba(200,74,74,0.4)!important"}} disabled={clearLoading} onClick={clearAllData}>
                  {clearLoading ? "Clearing…" : "🗑 Clear all data"}
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
