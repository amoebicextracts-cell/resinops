// ============================================================
// ResinOps — Shared production product-category vocabulary
// src/lib/productCategories.js
//
// Pulled out of ProductionScheduler.jsx so Scheduler.jsx's grow-space
// earmarking UI (which needs the same category/subcategory list, so an
// earmark and a Dashboard "needs a new batch" flag line up on the same
// cat|sub key) doesn't create a cross-manualChunk-group import edge
// between the "modules-cultivation" and "modules-production" Vite
// chunks (vite.config.js) -- that import alone roughly doubled the
// modules-production chunk's size by pulling Scheduler.jsx's whole
// dependency graph into it. ProductionScheduler.jsx re-exports these so
// its existing importers (BatchDashboard.jsx, Finance.jsx,
// Remediation.jsx) are unaffected.
// ============================================================

export const CATS=[
  {v:"whole_flower",l:"Whole Flower"},{v:"ground_flower",l:"Ground Flower"},
  {v:"pre_roll",l:"Pre-Roll"},{v:"extract",l:"Extract / Concentrate"},
  {v:"vape",l:"Vape"},{v:"tincture",l:"Tincture"},
  {v:"topical",l:"Topical"},{v:"edible",l:"Edible"},
];
export const SUBS={
  extract:[
    {v:"shatter",l:"BHO — Shatter / Wax"},{v:"badder",l:"BHO — Badder / Budder"},
    {v:"live_resin",l:"BHO — Live Resin"},{v:"sugar",l:"BHO — Sugar"},
    {v:"diamonds",l:"BHO — Diamonds & Sauce"},{v:"rosin_fl",l:"Rosin — Flower Press"},
    {v:"rosin_hash",l:"Rosin — Hash Press"},{v:"hash",l:"Ice Water Hash"},
    {v:"co2",l:"CO2 Extract"},{v:"distillate",l:"Distillate (Ethanol or Hydrocarbon)"},
    {v:"thca_ff",l:"THCa Isolate — Fresh Frozen Input"},
    {v:"thca_trim",l:"THCa Isolate — Dry Trim Input"},
    {v:"r134a_20l",l:"R-134a Extraction — 20L Machine"},
    {v:"r134a_50l",l:"R-134a Extraction — 50L Machine"},
  ],
  vape:[
    {v:"cartridge",l:"510-Thread Cartridge"},{v:"disposable",l:"AIO / Disposable"},
    {v:"oil_rosin",l:"Vape Oil — Rosin-derived"},{v:"oil_live_resin",l:"Vape Oil — Live Resin-derived"},
  ],
  edible:[
    {v:"gummies",l:"Gummies"},{v:"chocolate",l:"Chocolate"},
    {v:"capsules",l:"Capsules"},{v:"beverage",l:"Beverage"},{v:"other",l:"Other"},
  ],
};

// Default process steps per product, keyed by getStepKey(cat, sub). Lives
// here (not ProductionScheduler.jsx) so the Data & Imports importers build
// the same timelines the scheduler's own form does.
export const STEPS={
  // Flower products start from finished (dried, cured, trimmed) flower.
  // Drying / bucking / trimming / curing are post-harvest work tracked on
  // Harvest Batches, not production steps -- a facility that buys its
  // flower never does them, and a grower already logs them on the harvest.
  whole_flower: [{n:"Intake / Prep",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  ground_flower:[{n:"Intake / Prep",days:1},{n:"Grinding",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  pre_roll:     [{n:"Intake / Prep",days:1},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  shatter:      [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  badder:       [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:4},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  live_resin:   [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sugar:        [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:4},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  diamonds:     [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:21},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  rosin_fl:     [{n:"Intake / Prep",days:1},{n:"Pressing",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  rosin_hash:   [{n:"Intake / Prep",days:1},{n:"Pressing",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  hash:         [{n:"Intake / Prep",days:1},{n:"Washing",days:2},{n:"Lyophilization",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  co2:          [{n:"Intake / Prep",days:1},{n:"Extraction",days:3},{n:"Winterization",days:2},{n:"Distillation",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  distillate:   [{n:"Intake / Prep",days:1},{n:"Crude Extraction",days:3},{n:"Winterization",days:2},{n:"Decarb",days:1},{n:"Distillation",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],

  // Short path distillation — all models share same process steps
  sp_lab5:     [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_lab10:    [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_lab20:    [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_summit_mini:[{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_summit_std:[{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_summit_pro:[{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_oss5:     [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_oss12:    [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_oss20:    [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_ai5:      [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_ai10:     [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sp_custom:   [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"Short Path 1st Pass",days:1},{n:"Short Path 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  // Wiped Film Evaporator — all models share same process steps
  wfe_vta70:   [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_vta125:  [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_pope2:   [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_pope4:   [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_pope6:   [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_chemtech:[{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_delta:   [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  wfe_custom:  [{n:"Intake / Crude Prep",days:1},{n:"Winterization / Filtration",days:2},{n:"Decarboxylation",days:1},{n:"WFE 1st Pass",days:1},{n:"WFE 2nd Pass",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  // thca_ff and thca_trim use getThcaSteps() dynamically

  r134a_20l:    [{n:"Intake / Prep",days:1},{n:"R-134a Terp Cut",days:1},{n:"Material Decarb 125C",days:1},{n:"R-134a Cannabinoid Cut",days:4},{n:"Micron Filtration",days:1},{n:"Vacuum Purge (12 hr)",days:1},{n:"Intermediary Storage / QC Hold",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  r134a_50l:    [{n:"Intake / Prep",days:1},{n:"R-134a Terp Cut",days:1},{n:"Material Decarb 125C",days:1},{n:"R-134a Cannabinoid Cut",days:4},{n:"Micron Filtration",days:1},{n:"Vacuum Purge (12 hr)",days:1},{n:"Intermediary Storage / QC Hold",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  cartridge:    [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  disposable:   [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Filling",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  oil_rosin:    [{n:"Intake / Prep",days:1},{n:"Sauce Separation",days:2},{n:"Formulation",days:2},{n:"Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  oil_live_resin:[{n:"Intake / Prep",days:1},{n:"Sauce Separation",days:2},{n:"Formulation",days:2},{n:"Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  tincture:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  topical:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:3},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  gummies:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:2},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  chocolate:    [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:3},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  capsules:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  beverage:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  other:        [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
};

export function getStepKey(cat,sub){
  if(["whole_flower","ground_flower","pre_roll","tincture","topical"].includes(cat))return cat;
  if(cat==="extract")return sub||"shatter";
  if(cat==="vape")return sub||"cartridge";
  if(cat==="edible")return sub||"gummies";
  return cat;
}

// A fresh copy of the default steps, safe to mutate.
export function defaultSteps(cat,sub){
  return (STEPS[getStepKey(cat,sub)]||STEPS.other).map(s=>({n:s.n,days:s.days}));
}

const CAT_LABEL=Object.fromEntries(CATS.map(c=>[c.v,c.l]));
export function catLabel(cat){ return CAT_LABEL[cat]||""; }
export function subLabel(cat,sub){ return (SUBS[cat]||[]).find(s=>s.v===sub)?.l||""; }

// Best-guess category/subcategory from free text such as a lab's sample
// name or a product-type column ("2g Disposable Vape", "Raw Pre-Roll",
// "Bulk Distillate", "Live Rosin 1g"). Returns null when nothing matches,
// so callers can tell "unknown" apart from a real whole-flower guess.
export function inferProductCategory(text){
  const t=String(text||"").toLowerCase();
  if(!t.trim()) return null;
  const has=(re)=>re.test(t);
  if(has(/disposable|\baio\b|all[- ]in[- ]one/)) return {cat:"vape",sub:"disposable"};
  if(has(/\bvape\b|cartridge|\bcarts?\b|\b510\b|\bpod\b/)) return {cat:"vape",sub:"cartridge"};
  if(has(/pre-?roll|preroll|\bipr\b|\bjoint|\bblunt|\bcone/)) return {cat:"pre_roll",sub:""};
  if(has(/gumm/)) return {cat:"edible",sub:"gummies"};
  if(has(/chocolate/)) return {cat:"edible",sub:"chocolate"};
  if(has(/capsule/)) return {cat:"edible",sub:"capsules"};
  if(has(/beverage|drink|seltzer/)) return {cat:"edible",sub:"beverage"};
  if(has(/edible/)) return {cat:"edible",sub:"other"};
  if(has(/tincture/)) return {cat:"tincture",sub:""};
  if(has(/topical|lotion|balm|salve/)) return {cat:"topical",sub:""};
  if(has(/distillate/)) return {cat:"extract",sub:"distillate"};
  if(has(/hash rosin/)) return {cat:"extract",sub:"rosin_hash"};
  if(has(/rosin/)) return {cat:"extract",sub:"rosin_fl"};
  if(has(/live resin/)) return {cat:"extract",sub:"live_resin"};
  if(has(/diamond/)) return {cat:"extract",sub:"diamonds"};
  if(has(/badder|budder/)) return {cat:"extract",sub:"badder"};
  if(has(/sugar/)) return {cat:"extract",sub:"sugar"};
  if(has(/shatter|\bwax\b/)) return {cat:"extract",sub:"shatter"};
  if(has(/ice water hash|bubble hash|\bhash\b/)) return {cat:"extract",sub:"hash"};
  if(has(/\bco2\b/)) return {cat:"extract",sub:"co2"};
  if(has(/concentrate|extract/)) return {cat:"extract",sub:"shatter"};
  if(has(/ground|shake|smalls/)) return {cat:"ground_flower",sub:""};
  if(has(/flower|\bbud\b|eighth|3\.5\s?g|\b28\s?g/)) return {cat:"whole_flower",sub:""};
  return null;
}
