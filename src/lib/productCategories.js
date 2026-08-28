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
