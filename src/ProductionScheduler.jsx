import { useState, useEffect } from "react";
import { autoPopulateStrains } from "./strainUtils.js";

const LW=280, RH=96, HH=56, PX=11;
const UNIT_TO_G={g:1,lbs:453.592,kg:1000};
const CANNABINOIDS=["THC","THCa","CBD","CBDa","CBG","CBN","CBC","THCV"];

// ── Machine trimmer specs (lbs/day) ────────────────────────────────────────

// ── Pre-roll machine specs (joints/hour, published manufacturer figures) ──
const PREROLL_MACHINES = {
  hand:           {l:"Hand-rolled / manual fill",                t:0},
  knockbox_100:   {l:"Futurola Knockbox 100 (single op.)",        t:529},
  knockbox_2op:   {l:"Futurola Knockbox (2-operator)",            t:1000},
  kingkone_1op:   {l:"King Kone (single op.)",                    t:585},
  kingkone_2op:   {l:"King Kone (2-operator)",                    t:1170},
  filnfold_1op:   {l:"Fill N' Fold (single op.)",                 t:837},
  filnfold_2op:   {l:"Fill N' Fold (2-operator)",                 t:1361},
  blackbird:      {l:"RollPros Blackbird",                        t:900},
  preroller_100:  {l:"PreRoll-Er 100",                            t:1000},
  preroller_200:  {l:"PreRoll-Er 200",                            t:1300},
  preroller_400:  {l:"PreRoll-Er 400",                            t:1400},
  rocketbox_2:    {l:"STM RocketBox 2.0",                         t:2500},
  rocketbox_pro:  {l:"STM RocketBox Pro",                         t:2500},
  aurax:          {l:"Hefestus AuraX",                            t:2000},
  custom:         {l:"Custom / Other",                            t:500},
};

const TRIMMERS={
  greenboz_215:{l:"GreenBroz 215",t:215},
  twister_t4:{l:"Twister T4",t:100},
  twister_t6:{l:"Twister T6",t:150},
  mobius_m108:{l:"Mobius M108S",t:400},
  dbt_twister:{l:"Twister DBT (BatchOne)",t:200},
  dbt_centurion:{l:"Centurion Pro DBT",t:250},
  custom:{l:"Custom / Other",t:100},
};

// ── Vape terpene sources ───────────────────────────────────────────────────
const TERP_SRCS={
  pure:{l:"100% Cannabis-derived Terpenes",purity:1.00,thc:0.00},
  hte:{l:"High Terpene Extract (HTE) ~60% terps",purity:0.60,thc:0.25},
  rosin:{l:"Rosin Terps ~65% terps",purity:0.65,thc:0.20},
  r134a:{l:"R-134a Terp Liquid ~50% terps (10% THC, 38% flavonoids)",purity:0.50,thc:0.10},
};


function getThcaSteps(sub, method, cycles) {
  const isFf = sub === "thca_ff";
  const n = Math.max(1, parseInt(cycles) || 1);
  const extraClean = isFf ? [] : [
    {n:"Extensive Winterization",days:3},
    {n:"CRC Remediation",days:1},
  ];
  if (method === "controlled") {
    return [
      {n:"Intake / Prep",days:1},
      {n:"Cold Hydrocarbon Extraction",days:2},
      ...extraClean,
      {n:"Controlled Crash Crystallization",days:1},
      {n:"HTE Removal (Butane Fraction)",days:1},
      {n:"Warm Gas Redissolution",days:1},
      {n:"Recrystallization",days:n},
      {n:"Cold Solvent Wash",days:1},
      {n:"Residual Purge",days:1},
      {n:"QC / Testing",days:10},
      {n:"Packaging",days:1},
      {n:"Inventory",days:1},
    ];
  } else {
    return [
      {n:"Intake / Prep",days:1},
      {n:"Cold Hydrocarbon Extraction",days:2},
      ...extraClean,
      {n:"Initial Solvent Recovery",days:1},
      {n:"Diamond Mining / Jar Crystallization",days:21},
      {n:"HTE Removal / Pour-off",days:1},
      {n:"Warm Gas Redissolution",days:1},
      {n:"Recrystallization",days:n*7},
      {n:"Cold Solvent Wash",days:1},
      {n:"Final Solvent Purge",days:2},
      {n:"QC / Testing",days:10},
      {n:"Packaging",days:1},
      {n:"Inventory",days:1},
    ];
  }
}

const SBG={
  "Intake / Prep":"#1e3248","Drying":"#1e4420","Bucking":"#2e5010","Trimming":"#3a5e14",
  "Curing":"#143810","Grinding":"#504810","Rolling / Filling":"#583c0e","Extraction":"#582208",
  "Pressing":"#4a2008","Washing":"#143848","Lyophilization":"#0e2848","Purge / Process":"#3e1414",
  "Winterization":"#221438","Extensive Winterization":"#281448","CRC Remediation":"#301838",
  "Decarb":"#481c0e","Distillation":"#200e48","Formulation":"#0e3848",
  "Sauce Separation":"#3a1838","Filling":"#183040","Production":"#104038","Dose QC":"#0e2838",
  "THCa Crystallization":"#0e2848","Crystal Filtration":"#182848","Crystal Wash":"#102040",
  "Residual Purge":"#3e1814","Material Decarb 125C":"#582808",
  "R-134a Terp Cut":"#1e3858","R-134a Cannabinoid Cut":"#1a2e58","Micron Filtration":"#163045","Vacuum Purge (12 hr)":"#102035","Intermediary Storage / QC Hold":"#2a3a2a",
  "Crude Extraction":"#482010",
  "Cold Hydrocarbon Extraction":"#502010",
  "Controlled Crash Crystallization":"#102858",
  "HTE Removal (Butane Fraction)":"#104048",
  "HTE Removal / Pour-off":"#104048",
  "Warm Gas Redissolution":"#181848",
  "Initial Solvent Recovery":"#301828",
  "Diamond Mining / Jar Crystallization":"#082048",
  "Recrystallization":"#0a1e58",
  "Cold Solvent Wash":"#083038",
  "Final Solvent Purge":"#381010","QC / Testing":"#0a1848","Packaging":"#2e0e48","Inventory":"#0e3030",
};
const SFG={
  "Intake / Prep":"#90c0f0","Drying":"#90f0a0","Bucking":"#b0e080","Trimming":"#c0f090",
  "Curing":"#80d080","Grinding":"#f0e060","Rolling / Filling":"#f0b860","Extraction":"#f8a870",
  "Pressing":"#f09870","Washing":"#80d0f0","Lyophilization":"#78b0f0","Purge / Process":"#f09090",
  "Winterization":"#b090f8","Extensive Winterization":"#c0a0ff","CRC Remediation":"#d090e0",
  "Decarb":"#f0a870","Distillation":"#c090ff","Formulation":"#70d0f0",
  "Sauce Separation":"#d080e0","Filling":"#80c0f0","Production":"#70e0c8","Dose QC":"#80c0f0",
  "THCa Crystallization":"#80c0f8","Crystal Filtration":"#90d0f8","Crystal Wash":"#78c0f0",
  "Residual Purge":"#f0b090","Material Decarb 125C":"#f8b870",
  "R-134a Terp Cut":"#80c8f8","R-134a Cannabinoid Cut":"#78b8f8","Micron Filtration":"#60a8e8","Vacuum Purge (12 hr)":"#5090d8","Intermediary Storage / QC Hold":"#90b890",
  "Crude Extraction":"#f0a060",
  "Cold Hydrocarbon Extraction":"#f0a060",
  "Controlled Crash Crystallization":"#70b0f8",
  "HTE Removal (Butane Fraction)":"#70d8e8",
  "HTE Removal / Pour-off":"#70d8e8",
  "Warm Gas Redissolution":"#9090f8",
  "Initial Solvent Recovery":"#d090b0",
  "Diamond Mining / Jar Crystallization":"#6090f0",
  "Recrystallization":"#7090f8",
  "Cold Solvent Wash":"#70d0e8",
  "Final Solvent Purge":"#f09090","QC / Testing":"#7090f8","Packaging":"#c080f8","Inventory":"#70d0d0",
};

const CATS=[
  {v:"whole_flower",l:"Whole Flower"},{v:"ground_flower",l:"Ground Flower"},
  {v:"pre_roll",l:"Pre-Roll"},{v:"extract",l:"Extract / Concentrate"},
  {v:"vape",l:"Vape"},{v:"tincture",l:"Tincture"},
  {v:"topical",l:"Topical"},{v:"edible",l:"Edible"},
];
const SUBS={
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

const STEPS={
  whole_flower: [{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:10},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  ground_flower:[{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:10},{n:"Grinding",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  pre_roll:     [{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:10},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
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

// ── Packaging container types by product category ──────────────────────────
// ── Distillation apparatus specs ─────────────────────────────────────────────
const DISTILLATION_SPECS = {
  // Short path — throughput in grams crude per hour, typical yield %
  sp_lab5:      {type:"Short Path",vol:"5L",brand:"Lab Society",mfr:"Lab Society",throughputG:150,pass1Yield:0.78,pass2Yield:0.87,notes:"Bench-top, single operator. 1st pass crude→minor cannabinoids cut, 2nd pass main body."},
  sp_lab10:     {type:"Short Path",vol:"10L",brand:"Lab Society",mfr:"Lab Society",throughputG:300,pass1Yield:0.80,pass2Yield:0.88,notes:"Mid-scale. Common in licensed processing facilities."},
  sp_lab20:     {type:"Short Path",vol:"20L",brand:"Lab Society",mfr:"Lab Society",throughputG:550,pass1Yield:0.80,pass2Yield:0.88,notes:"Production scale. Requires 2 operators."},
  sp_summit_mini:{type:"Short Path",vol:"2L",brand:"Summit Research",mfr:"Summit Research",throughputG:80,pass1Yield:0.75,pass2Yield:0.86,notes:"R&D / small batch. Compact footprint."},
  sp_summit_std: {type:"Short Path",vol:"5L",brand:"Summit Research",mfr:"Summit Research",throughputG:180,pass1Yield:0.78,pass2Yield:0.87,notes:"Industry workhorse. Well-supported."},
  sp_summit_pro: {type:"Short Path",vol:"12L",brand:"Summit Research",mfr:"Summit Research",throughputG:400,pass1Yield:0.80,pass2Yield:0.88,notes:"Production-grade with motorized mantle."},
  sp_oss5:      {type:"Short Path",vol:"5L",brand:"Open Source Steel",mfr:"Open Source Steel",throughputG:175,pass1Yield:0.78,pass2Yield:0.87,notes:"Heavy-duty American-made glassware."},
  sp_oss12:     {type:"Short Path",vol:"12L",brand:"Open Source Steel",mfr:"Open Source Steel",throughputG:380,pass1Yield:0.80,pass2Yield:0.88,notes:""},
  sp_oss20:     {type:"Short Path",vol:"20L",brand:"Open Source Steel",mfr:"Open Source Steel",throughputG:580,pass1Yield:0.80,pass2Yield:0.88,notes:""},
  sp_ai5:       {type:"Short Path",vol:"5L",brand:"Across International",mfr:"Across International",throughputG:160,pass1Yield:0.78,pass2Yield:0.87,notes:"Cost-effective entry-level production unit."},
  sp_ai10:      {type:"Short Path",vol:"10L",brand:"Across International",mfr:"Across International",throughputG:310,pass1Yield:0.79,pass2Yield:0.87,notes:""},
  sp_custom:    {type:"Short Path",vol:"Custom",brand:"Custom",mfr:"",throughputG:200,pass1Yield:0.78,pass2Yield:0.87,notes:"Custom build. Enter your own throughput."},
  // WFE — higher throughput, continuous operation
  wfe_vta70:    {type:"WFE",vol:"VKL 70/5",brand:"Root Sciences",mfr:"VTA GmbH",throughputG:1000,pass1Yield:0.82,pass2Yield:0.90,notes:"Entry-level WFE. ~1kg/hr crude throughput. Continuous operation."},
  wfe_vta125:   {type:"WFE",vol:"VKL 125/5",brand:"Root Sciences",mfr:"VTA GmbH",throughputG:2000,pass1Yield:0.83,pass2Yield:0.90,notes:"Mid-scale WFE. ~2kg/hr. Industry standard for licensed processors."},
  wfe_pope2:    {type:"WFE",vol:"2-inch",brand:"Pope Scientific",mfr:"Pope Scientific",throughputG:500,pass1Yield:0.82,pass2Yield:0.90,notes:"2-inch unit. R&D to small production. American-made."},
  wfe_pope4:    {type:"WFE",vol:"4-inch",brand:"Pope Scientific",mfr:"Pope Scientific",throughputG:1500,pass1Yield:0.83,pass2Yield:0.90,notes:"4-inch — production scale. ~1.5kg/hr."},
  wfe_pope6:    {type:"WFE",vol:"6-inch",brand:"Pope Scientific",mfr:"Pope Scientific",throughputG:3000,pass1Yield:0.84,pass2Yield:0.91,notes:"6-inch — high-volume production. ~3kg/hr."},
  wfe_chemtech: {type:"WFE",vol:"Various",brand:"Chemtech",mfr:"Chemtech Services",throughputG:1200,pass1Yield:0.82,pass2Yield:0.90,notes:"Custom-engineered systems."},
  wfe_delta:    {type:"WFE",vol:"TruVax",brand:"Delta Separations",mfr:"Delta Separations",throughputG:1800,pass1Yield:0.83,pass2Yield:0.90,notes:"Integrated ethanol extraction + distillation system."},
  wfe_custom:   {type:"WFE",vol:"Custom",brand:"Custom",mfr:"",throughputG:1000,pass1Yield:0.82,pass2Yield:0.90,notes:"Custom WFE. Enter your own throughput."},
};

const PKG_CONTAINERS = {
  whole_flower: [
    {v:"cr_glass_jar",l:"CR Glass Jar"},
    {v:"cr_mylar",l:"CR Mylar Bag"},
    {v:"eighth_box",l:"Eighth Box (retail box)"},
    {v:"cr_tin",l:"CR Tin"},
    {v:"craft_bag",l:"Craft Paper Bag"},
    {v:"bulk_lb",l:"Bulk (pounds)"},
    {v:"other",l:"Other"},
  ],
  ground_flower: [
    {v:"cr_glass_jar",l:"CR Glass Jar"},
    {v:"cr_mylar",l:"CR Mylar Bag"},
    {v:"other",l:"Other"},
  ],
  pre_roll: [
    {v:"poptop_single",l:"Pop-Top Vial (single)"},
    {v:"poptop_multi",l:"Pop-Top Vial (multi-pack)"},
    {v:"glass_tube",l:"Glass Tube (single)"},
    {v:"poptop_glass",l:"Pop-Top Glass Tube"},
    {v:"doob_tube",l:"Doob Tube"},
    {v:"clamshell",l:"Clamshell"},
    {v:"retail_box_single",l:"Retail Box (individual)"},
    {v:"retail_box_multi",l:"Retail Box (multi-pack)"},
    {v:"tin_single",l:"Tin (single)"},
    {v:"tin_multi",l:"Tin (multi-pack)"},
    {v:"mylar_multi",l:"Mylar Bag (multi-pack)"},
    {v:"poptop_in_mylar",l:"Pop-Top Vials in Mylar"},
    {v:"tubes_in_mylar",l:"Tubes in Mylar"},
    {v:"box_in_mylar",l:"Box in Mylar"},
    {v:"other",l:"Other"},
  ],
  extract: [
    {v:"glass_jar_5ml",l:"Glass Jar 5mL"},
    {v:"glass_jar_7ml",l:"Glass Jar 7mL"},
    {v:"glass_jar_10ml",l:"Glass Jar 10mL"},
    {v:"silicone_container",l:"Silicone Container"},
    {v:"parchment_envelope",l:"Parchment Envelope"},
    {v:"applicator_syringe",l:"Applicator Syringe"},
    {v:"cold_cure_jar",l:"Cold Cure Glass Jar"},
    {v:"vac_sealed_bag",l:"Vacuum Sealed Bag"},
    {v:"bulk_gram",l:"Bulk (grams)"},
    {v:"other",l:"Other"},
  ],
  distillate: [
    {v:"applicator_syringe",l:"Applicator Syringe"},
    {v:"glass_jar",l:"Glass Jar"},
    {v:"bulk_gram",l:"Bulk (grams)"},
    {v:"other",l:"Other"},
  ],
  vape: [
    {v:"blister_pack",l:"Blister Pack"},
    {v:"individual_tube",l:"Individual CR Tube"},
    {v:"multi_box",l:"Multi-Pack Box"},
    {v:"cr_case",l:"Child-Resistant Case"},
    {v:"mylar_cart",l:"Mylar Bag"},
    {v:"other",l:"Other"},
  ],
  tincture: [
    {v:"dropper_bottle",l:"Dropper Bottle"},
    {v:"dropper_box",l:"Dropper Bottle in Box"},
    {v:"bulk",l:"Bulk"},
    {v:"other",l:"Other"},
  ],
  topical: [
    {v:"jar",l:"Jar"},
    {v:"tube_squeeze",l:"Squeeze Tube"},
    {v:"pump_bottle",l:"Pump Bottle"},
    {v:"other",l:"Other"},
  ],
  edible: [
    {v:"mylar_pouch",l:"Mylar Pouch"},
    {v:"cr_tin",l:"CR Tin"},
    {v:"retail_box",l:"Retail Box"},
    {v:"blister_pack",l:"Blister Pack"},
    {v:"bottle",l:"Bottle (capsules/beverages)"},
    {v:"other",l:"Other"},
  ],
};

const PKG={
  whole_flower:  [{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7},{l:"14g",v:14},{l:"28g",v:28},{l:"112g (QP)",v:112},{l:"448g (lb)",v:448}],
  ground_flower: [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7}],
  pre_roll:      [{l:"0.5g",v:0.5},{l:"0.75g",v:0.75},{l:"1g",v:1},{l:"1.5g",v:1.5},{l:"2g",v:2}],
  extract_solid: [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7}],
  extract_bulk:  [{l:"bulk (g)",v:1}],
  vape_cart:     [{l:"0.3g",v:0.3},{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2}],
  vape_aio:      [{l:"1g",v:1},{l:"1.75g",v:1.75},{l:"2g",v:2},{l:"2.25g",v:2.25},{l:"4g",v:4},{l:"7g",v:7}],
  vape_oil:      [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"2.25g",v:2.25},{l:"4g",v:4},{l:"7g",v:7}],
  tincture_bot:  [{l:"15ml",v:15},{l:"30ml",v:30},{l:"60ml",v:60}],
  topical:       [{l:"1 oz",v:1},{l:"2 oz",v:2},{l:"4 oz",v:4}],
  edible_dose:   [{l:"1mg",v:1},{l:"2mg",v:2},{l:"2.5mg",v:2.5},{l:"5mg",v:5},{l:"10mg",v:10},{l:"20mg",v:20},{l:"25mg",v:25},{l:"50mg",v:50},{l:"100mg",v:100}],
  edible_bev:    [{l:"100ml",v:100},{l:"200ml",v:200},{l:"355ml",v:355}],
};

function getPkg(cat,sub){
  if(cat==="whole_flower")return PKG.whole_flower;
  if(cat==="ground_flower")return PKG.ground_flower;
  if(cat==="pre_roll")return PKG.pre_roll;
  if(cat==="extract")return["distillate","thca_ff","thca_trim","r134a_20l","r134a_50l"].includes(sub)?PKG.extract_bulk:PKG.extract_solid;
  if(cat==="vape"){if(sub==="disposable")return PKG.vape_aio;if(sub==="oil_rosin"||sub==="oil_live_resin")return PKG.vape_oil;return PKG.vape_cart;}
  if(cat==="tincture")return PKG.tincture_bot;
  if(cat==="topical")return PKG.topical;
  if(cat==="edible")return sub==="beverage"?PKG.edible_bev:PKG.edible_dose;
  return[{l:"unit",v:1}];
}
function getStepKey(cat,sub){
  if(["whole_flower","ground_flower","pre_roll","tincture","topical"].includes(cat))return cat;
  if(cat==="extract")return sub||"shatter";
  if(cat==="vape")return sub||"cartridge";
  if(cat==="edible")return sub||"gummies";
  return cat;
}
function getInputLabel(cat){
  return({whole_flower:"Input — dry flower",ground_flower:"Input — dry flower",
    pre_roll:"Input — dry flower or trim",extract:"Input — biomass / trim / crude",
    vape:"Input — oil / distillate",tincture:"Input — extract",
    topical:"Batch size",edible:"Input — extract / distillate"})[cat]||"Input";
}

// ── Yield calculation ──────────────────────────────────────────────────────
function calcYield(cat,sub,inputAmt,unit,pkgV,pkgL,opts){
  const amt=parseFloat(inputAmt);if(!amt||amt<=0||!pkgV)return null;
  const g=amt*(UNIT_TO_G[unit]||1);
  const{stemWastePct=0,moistureLossPct=0,fillWastePct=0,coneWeight=1,packSize=5,
    inputMaterial="flower",overfillG=0,vapeInputType="distillate",sauceSepMethod="pour_off",
    extractInputType="distillate",inputPotencyPct=80,tincBottleSize=30,tincPotencyMgPerMl=33,
    kiefSift=false,kief40Pct=12,kief100Pct=8}=opts;
  if(cat==="whole_flower"){const eff=pkgV+(parseFloat(overfillG)||0);const units=Math.floor(g/eff*0.95);return`${g.toFixed(0)}g · ${units.toLocaleString()} × ${pkgL} units`+(parseFloat(overfillG)>0?` (+${overfillG}g overfill/unit)`:"");}
  if(cat==="ground_flower"){const sw=parseFloat(stemWastePct)/100||0;const ml=parseFloat(moistureLossPct)/100||0;const u=g*(1-sw)*(1-ml);const units=Math.floor(u/pkgV*0.98);let k="";if(kiefSift){k=` · Kief: ${(u*(parseFloat(kief40Pct)/100)).toFixed(1)}g (40-mesh), ${(u*(parseFloat(kief100Pct)/100)).toFixed(1)}g (100-mesh)`;}return`${u.toFixed(0)}g usable · ${units.toLocaleString()} × ${pkgL}${k}`;}
  if(cat==="pre_roll"){const sw=inputMaterial==="trim"?0.05:(parseFloat(stemWastePct)/100||0);const ml=parseFloat(moistureLossPct)/100||0;const fw=parseFloat(fillWastePct)/100||0;const u=g*(1-sw)*(1-ml)*(1-fw);const coneG=parseFloat(coneWeight)||1;const units=Math.floor(u/coneG);const packs=Math.floor(units/(parseInt(packSize)||1));let k="";if(kiefSift){k=` · Kief: ${(g*sw*(parseFloat(kief40Pct)/100)).toFixed(1)}g / ${(g*sw*(parseFloat(kief100Pct)/100)).toFixed(1)}g`;}return`${units.toLocaleString()} cones · ${packs.toLocaleString()} × ${packSize}-packs${k}`;}
  if(cat==="extract"){
    const ym={shatter:0.15,badder:0.15,live_resin:0.10,sugar:0.15,diamonds:0.08,rosin_fl:0.15,rosin_hash:0.60,hash:0.05,co2:0.10};
    if(sub==="distillate"){const crude=g*0.18;const total=crude*0.70;const main=total*0.80;const ht=total*0.20;return`Crude: ${crude.toFixed(0)}g → Distillate: ${total.toFixed(0)}g total | Main body: ${main.toFixed(0)}g (retail) + ${ht.toFixed(0)}g heads/tails (edibles grade) — 2 batches created`;}
    if(sub==="thca_ff"){const thca=g*0.08;const hte=g*0.06;const units=Math.floor(thca/pkgV*0.97);return`THCa: ~${thca.toFixed(0)}g (~8% of biomass) · ${units.toLocaleString()} × ${pkgL} | HTE co-product: ~${hte.toFixed(0)}g (linked batch auto-created)`;}
    if(sub==="thca_trim"){const thca=g*0.04;const hte=g*0.03;const units=Math.floor(thca/pkgV*0.97);return`THCa: ~${thca.toFixed(0)}g (~4% of trim) · ${units.toLocaleString()} × ${pkgL} | HTE co-product: ~${hte.toFixed(0)}g (linked batch auto-created)`;}
    if(sub==="r134a_20l"||sub==="r134a_50l"){const cap=sub==="r134a_50l"?5000:2500;const cycles=Math.ceil(g/cap);const terp=g*0.05;const cannab=g*0.145;return`${cycles} cycle${cycles>1?"s":""} · Terp liquid: ~${terp.toFixed(0)}g · Cannabinoid cut: ~${cannab.toFixed(0)}g — INTERMEDIARY PRODUCT (not finished good)`;}
    const out=g*(ym[sub]||0.15);const units=Math.floor(out/pkgV*0.97);return`~${out.toFixed(1)}g · ${units.toLocaleString()} × ${pkgL} units`;
  }
  if(cat==="vape"){const isOil=sub==="oil_rosin"||sub==="oil_live_resin";const fillEff=vapeInputType==="live_resin"||sub==="oil_live_resin"?0.95:vapeInputType==="rosin"||sub==="oil_rosin"?0.93:0.97;const units=Math.floor(g*fillEff/pkgV);return`~${units.toLocaleString()} × ${pkgL} ${sub==="disposable"?"AIOs":isOil?"oil units":"carts"}${isOil?" ("+sauceSepMethod.replace("_"," ")+" sep)":""}`;}
  if(cat==="tincture"){const potency=extractInputType==="rso"?0.60:extractInputType==="rosin"?0.55:(parseFloat(inputPotencyPct)/100||0.80);const totalMg=g*potency*1000;const mgPerMl=parseFloat(tincPotencyMgPerMl)||33;const totalMl=totalMg/mgPerMl;const bottles=Math.floor(totalMl/(parseFloat(tincBottleSize)||30)*0.98);return`~${totalMg.toFixed(0)}mg THC · ${totalMl.toFixed(0)}ml · ${bottles.toLocaleString()} × ${tincBottleSize}ml bottles`;}
  if(cat==="topical"){const oz=amt*(unit==="lbs"?16:unit==="kg"?35.274:0.035274);const units=Math.floor(oz/pkgV*0.97);return`~${oz.toFixed(1)} oz · ${units.toLocaleString()} × ${pkgL} units`;}
  if(cat==="edible"){if(sub==="beverage"){return`~${g.toFixed(0)}ml · ${Math.floor(g/pkgV*0.97).toLocaleString()} × ${pkgL} bottles`;}const potency=extractInputType==="rosin"?0.55:(parseFloat(inputPotencyPct)/100||0.80);const totalMg=g*potency*1000;const units=Math.floor(totalMg/pkgV*0.95);return`~${totalMg.toFixed(0)}mg (${(potency*100).toFixed(0)}% THC) · ${units.toLocaleString()} × ${pkgL} units`;}
  return null;
}

// ── Vape formulation calculator ────────────────────────────────────────────
function calcFormulation(distG,startPotPct,targetTerpPct,terpSrc,pkgV,terpSrcPotencyOverride){
  const D=parseFloat(distG)||0;const P=(parseFloat(startPotPct)||85)/100;const T=(parseFloat(targetTerpPct)||10)/100;
  const baseSrc=TERP_SRCS[terpSrc]||TERP_SRCS.pure;
  const overrideThc=terpSrcPotencyOverride!==undefined&&terpSrcPotencyOverride!==""?parseFloat(terpSrcPotencyOverride)/100:baseSrc.thc;
  const src={...baseSrc,thc:overrideThc};
  if(src.purity<=T)return{error:"Cannot reach this terp% with selected source — purity too low"};
  const terpAdd=D*T/(src.purity-T);const total=D+terpAdd;
  const thcTotal=D*P+terpAdd*src.thc;const finalPot=(thcTotal/total*100).toFixed(1);
  const carts=pkgV>0?Math.floor(total/pkgV*0.97):0;
  return{terpAdd:terpAdd.toFixed(2),total:total.toFixed(1),finalPot,carts,src:src.l};
}

// ── Trim time calculator ───────────────────────────────────────────────────
function calcTrimDays(inputG,trimType,machine,throughput,trimmerCount,gramsPerDay){
  const lbs=inputG/453.592;
  if(trimType==="machine"){const t=parseFloat(throughput)||100;return{days:Math.max(1,Math.ceil(lbs/t)),note:`${lbs.toFixed(1)} lbs ÷ ${t} lbs/day (${machine})`};}
  const tc=parseInt(trimmerCount)||1;const gpd=parseFloat(gramsPerDay)||350;
  return{days:Math.max(1,Math.ceil(inputG/(tc*gpd))),note:`${inputG.toFixed(0)}g ÷ (${tc} trimmers × ${gpd}g/day)`};
}

// ── Packaging time calculator ──────────────────────────────────────────────
function calcPrerollDays(totalUnits, throughput) {
  const t = parseFloat(throughput) || 500;
  if (t<=0) return null;
  return Math.max(1, Math.ceil(totalUnits / t / 8)); // throughput is units/hr, 8hr shift
}

function calcPkgDays(totalUnits,staffCount,baselineRate,pkgSize,pkgType){
  const rate=(parseFloat(baselineRate)||150)*Math.sqrt(3.5/(pkgSize||3.5))*(pkgType==="mylar"?1.3:1.0);
  const staff=parseInt(staffCount)||1;const hours=totalUnits/(staff*rate);
  return{days:Math.max(1,Math.ceil(hours/8)),hours:hours.toFixed(1),rate:rate.toFixed(0)};
}

// ── R-134a step calculator ─────────────────────────────────────────────────
function r134aCalcDays(inputG,machineType){
  const cap=machineType==="r134a_50l"?5000:2500;const cycles=Math.ceil(inputG/cap);
  // Filtration: ~4 hrs per liter of cannabinoid cut output (14.5% yield, treat as ml≈g)
  const cannabG=inputG*0.145;
  const filterHrs=cannabG/1000*4; // 4 hrs per liter
  const filterDays=Math.max(1,Math.ceil(filterHrs/8));
  return{cycles,terpDays:Math.max(1,Math.ceil(cycles*4/8)),decarbDays:Math.max(1,Math.ceil(cycles*2/8)),cannabDays:Math.max(1,Math.ceil(cycles*14/8)),filterDays,purgeDays:1};
}

// ── Date helpers ───────────────────────────────────────────────────────────
function dAdd(dt,n){const r=new Date(dt);r.setDate(r.getDate()+n);return r;}
function dDiff(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
function fmtS(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function fmtF(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function buildTimeline(d,steps){let c=new Date(d+"T12:00:00");return steps.map(s=>{const s0=new Date(c),e=dAdd(c,s.days);c=e;return{name:s.n,days:s.days,start:s0,end:e};});}

const CSS=`
  .ps-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ps-outer{overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:16px;}
  .ps-row{display:flex;border-bottom:1px solid var(--border);}
  .ps-row:last-child{border-bottom:none;}
  .ps-left{position:sticky;left:0;z-index:4;width:${LW}px;min-width:${LW}px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);padding:10px 14px;display:flex;flex-direction:column;justify-content:center;gap:3px;box-sizing:border-box;}
  .ps-tl{position:relative;flex:1;}
  .ps-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;transition:opacity 0.15s;}
  .ps-btn:hover{opacity:0.85;}
  .ps-primary{background:var(--accent);color:#fff;font-size:12px;padding:7px 14px;}
  .ps-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);font-size:12px;padding:7px 14px;}
  .ps-sm{font-size:10px;padding:3px 8px;font-weight:600;border-radius:5px;}
  .ps-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .ps-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .ps-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:8px 10px;box-sizing:border-box;}
  .ps-inp:focus{outline:none;border-color:var(--accent);}
  .ps-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:4px;}
  .ps-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:8px 10px;box-sizing:border-box;cursor:pointer;}
  .ps-sel:focus{outline:none;border-color:var(--accent);}
  .ps-days{width:50px;font-size:12px;padding:3px 6px;text-align:center;border-radius:4px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-family:monospace;}
  .ps-days:focus{outline:none;border-color:var(--accent);}
  .ps-exp{background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text-2);font-size:12px;font-weight:600;padding:7px 14px;cursor:pointer;font-family:'Inter',sans-serif;transition:border-color 0.15s;}
  .ps-exp:hover{border-color:var(--accent-2);color:var(--accent-2);}
  .ps-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;}
  .ps-tbl th{text-align:left;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .ps-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .ps-tbl tr:last-child td{border-bottom:none;}
  .sp{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .sp-a{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sp-u{background:rgba(200,150,58,0.15);color:var(--amber);}
  .sp-c{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .sp-l{background:rgba(90,120,200,0.15);color:#7090f0;}
  .ps-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .ps-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;}
  .ps-yield{background:rgba(74,124,89,0.15);border:1px solid var(--accent);border-radius:8px;padding:8px 12px;width:100%;box-sizing:border-box;}
  .ps-form-out{background:rgba(74,100,180,0.12);border:1px solid rgba(90,130,220,0.4);border-radius:8px;padding:10px 14px;margin-top:8px;}
  .ps-calc-note{font-size:11px;color:var(--accent-2);background:rgba(74,124,89,0.1);border-radius:5px;padding:4px 8px;margin-top:6px;}
  .cb-row{display:flex;flex-wrap:wrap;gap:6px;}
  .cb-pill{display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border-2);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--text-2);transition:all 0.15s;}
  .cb-pill.on{background:rgba(74,124,89,0.2);border-color:var(--accent);color:var(--accent-2);}
  .linked-badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(90,120,200,0.2);color:#7090f0;margin-left:4px;}
`;

const EMPTY={
  name:"",cat:"whole_flower",sub:"",strains:"",d:"",inputAmt:"",unit:"g",pkgIdx:3,steps:null,inputSource:"manual",harvestBatchId:"",harvestGrade:"",
  stemWastePct:"30",moistureLossPct:"2",fillWastePct:"3",coneWeight:"1",packSize:"5",inputMaterial:"flower",
  overfillG:"0.1",vapeInputType:"distillate",sauceSepMethod:"pour_off",
  extractInputType:"distillate",inputPotencyPct:"80",tincBottleSize:"30",tincPotencyMgPerMl:"33",
  kiefSift:false,kief40Pct:"12",kief100Pct:"8",cannabinoids:["THC"],
  trimType:"machine",trimMachine:"greenboz_215",trimThroughput:"215",
  prerollMachine:"knockbox_100",prerollThroughput:"529",
  trimmerCount:"4",gramsPerTrimmerDay:"350",
  packagingType:"jar",packagingStaff:"2",packagingBaseline:"150",packagingContainer:"",packagingUnitsPerPack:"5",
  vapeStartPotency:"85",vapeTerpPct:"10",vapeTerpSource:"pure",vapeTerpSrcPotency:String(TERP_SRCS.pure.thc*100),
  thcaMethod:"controlled",thcaRecrystCycles:"1",
  s2sSystem:"metrc",s2sSourceTags:"",s2sOutputTags:"",actual_yield:"",
};

function loadHarvestBatches(){ try{return JSON.parse(localStorage.getItem("resinops_harvest_batches")||"[]");}catch{return[];} }
const GRADE_LABELS={a:"A-Bud",b:"B-Bud",c:"C-Bud",trim:"Trim"};

export default function ProductionScheduler(){
  const harvestBatches = loadHarvestBatches();
  const isFlowerCat = (cat) => ["whole_flower","ground_flower","pre_roll"].includes(cat);
  const availableHarvest = harvestBatches.filter(hb => hb.status==="done" && Object.values(hb.grades||{}).some(g=>parseFloat(g.weight)>0));
  function selectHarvestGrade(hbId, grade) {
    const hb = harvestBatches.find(h=>h.id===parseInt(hbId));
    if (!hb) return;
    const g = hb.grades[grade];
    if (!g) return;
    setForm(f=>({...f, harvestBatchId:hbId, harvestGrade:grade, inputAmt:String(g.weight), unit:"g", strains: hb.strainName, s2sSourceTags: g.s2s||f.s2sSourceTags}));
  }
  const[batches,setBatches]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_prod")||"[]");}catch{return[];}});
  const[form,setForm]=useState(EMPTY);
  const[formMode,setFormMode]=useState(null);
  const[editId,setEditId]=useState(null);
  const[formErr,setFormErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_prod",JSON.stringify(batches));},[batches]);

  const today=new Date();
  const today0=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const pkgOpts=getPkg(form.cat,form.sub);
  const pkgIdx=Math.min(form.pkgIdx,pkgOpts.length-1);
  const pkgSel=pkgOpts[pkgIdx];
  const subOpts=SUBS[form.cat]||[];
  const isThcaSub=form.sub==="thca_ff"||form.sub==="thca_trim";
  const formSteps=form.steps||(isThcaSub?getThcaSteps(form.sub,form.thcaMethod||"controlled",form.thcaRecrystCycles||1):(STEPS[getStepKey(form.cat,form.sub)]||[]).map(s=>({n:s.n,days:s.days})));
  const totalDays=formSteps.reduce((a,s)=>a+(parseInt(s.days)||0),0);
  const yieldEst=calcYield(form.cat,form.sub,form.inputAmt,form.unit,pkgSel?.v,pkgSel?.l,form);
  const inputG=(parseFloat(form.inputAmt)||0)*(UNIT_TO_G[form.unit]||1);
  const isFlower=["whole_flower","ground_flower","pre_roll"].includes(form.cat);
  const isVape=form.cat==="vape";
  const isVapeFormulable=isVape&&(form.sub==="cartridge"||form.sub==="disposable");
  const isVapeOil=form.sub==="oil_rosin"||form.sub==="oil_live_resin";
  const isDistillate=form.cat==="extract"&&form.sub==="distillate";
  const isShortPath=form.cat==="extract"&&form.sub?.startsWith("sp_");
  const isWFE=form.cat==="extract"&&form.sub?.startsWith("wfe_");
  const isAnyDistillation=isDistillate||isShortPath||isWFE;
  const distSpec=DISTILLATION_SPECS[form.sub]||null;

  // Distillation yield calculator
  const distCalc=isAnyDistillation&&inputG>0&&distSpec?{
    throughputHrsPass1: Math.ceil(inputG/distSpec.throughputG),
    pass1YieldG: Math.round(inputG*distSpec.pass1Yield),
    pass2YieldG: Math.round(inputG*distSpec.pass1Yield*distSpec.pass2Yield),
    pass1Pct: Math.round(distSpec.pass1Yield*100),
    pass2Pct: Math.round(distSpec.pass2Yield*100),
    totalPct: Math.round(distSpec.pass1Yield*distSpec.pass2Yield*100),
    throughputHrsPass2: Math.ceil(inputG*distSpec.pass1Yield/distSpec.throughputG),
    spec: distSpec,
  }:null;
  const isThca=form.cat==="extract"&&isThcaSub;
  const showCb=["tincture","edible","topical"].includes(form.cat);

  // Trim calculator
  const trimCalc=isFlower&&inputG>0?calcTrimDays(inputG,form.trimType,TRIMMERS[form.trimMachine]?.l||"Custom",form.trimThroughput,form.trimmerCount,form.gramsPerTrimmerDay):null;

  // Packaging calculator
  const estUnits=inputG&&pkgSel?Math.floor(inputG/pkgSel.v*0.90):0;
  const pkgCalc=isFlower&&estUnits>0?calcPkgDays(estUnits,form.packagingStaff,form.packagingBaseline,pkgSel?.v,form.packagingType):null;
  const isPreRoll = form.cat==="pre_roll";
  const preRollUnitMatch = yieldEst?.match(/^([\d,]+)\s*cones/);
  const preRollUnits = preRollUnitMatch ? parseInt(preRollUnitMatch[1].replace(/,/g,"")) : 0;
  const prerollCalc = isPreRoll && preRollUnits>0 ? calcPrerollDays(preRollUnits, form.prerollThroughput) : null;
  function applyPrerollDays(){ if(!prerollCalc) return; setForm(f=>({...f, steps:formSteps.map(s=>s.n==="Rolling / Filling"?{...s,days:prerollCalc}:s)})); }

  // Vape formulation
  const formCalc=isVapeFormulable&&inputG>0?calcFormulation(inputG,form.vapeStartPotency,form.vapeTerpPct,form.vapeTerpSource,pkgSel?.v,form.vapeTerpSrcPotency):null;

  // R-134a cycle info
  const r134aInfo=isR134a&&inputG>0?r134aCalcDays(inputG,form.sub):null;

  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const toggleCb=(cb)=>setForm(f=>({...f,cannabinoids:f.cannabinoids.includes(cb)?f.cannabinoids.filter(x=>x!==cb):[...f.cannabinoids,cb]}));

  function changeCat(cat){const sub=SUBS[cat]?.[0]?.v||"";const key=getStepKey(cat,sub);const steps=(STEPS[key]||[]).map(s=>({n:s.n,days:s.days}));setForm(f=>({...f,cat,sub,steps,pkgIdx:0}));}
  function changeSub(sub){
    const isThca=sub==="thca_ff"||sub==="thca_trim";
    let steps;
    if(isThca){steps=getThcaSteps(sub,form.thcaMethod||"controlled",form.thcaRecrystCycles||1);}
    else{const key=getStepKey(form.cat,sub);steps=(STEPS[key]||[]).map(s=>({n:s.n,days:s.days}));}
    setForm(f=>({...f,sub,steps,pkgIdx:0}));
  }
  function changeThcaMethod(method){
    const steps=getThcaSteps(form.sub,method,form.thcaRecrystCycles||1);
    setForm(f=>({...f,thcaMethod:method,steps}));
  }
  function changeThcaCycles(cycles){
    const steps=getThcaSteps(form.sub,form.thcaMethod||"controlled",cycles);
    setForm(f=>({...f,thcaRecrystCycles:cycles,steps}));
  }
  function updateStep(i,v){setForm(f=>({...f,steps:formSteps.map((s,idx)=>idx===i?{...s,days:parseInt(v)||0}:s)}));}
  function applyTrimDays(){if(!trimCalc)return;setForm(f=>({...f,steps:formSteps.map(s=>s.n==="Trimming"?{...s,days:trimCalc.days}:s)}));}
  function applyPkgDays(){if(!pkgCalc)return;setForm(f=>({...f,steps:formSteps.map(s=>s.n==="Packaging"?{...s,days:pkgCalc.days}:s)}));}
  function applyR134aDays(){if(!r134aInfo)return;setForm(f=>({...f,steps:formSteps.map(s=>{if(s.n==="R-134a Terp Cut")return{...s,days:r134aInfo.terpDays};if(s.n==="Material Decarb 125C")return{...s,days:r134aInfo.decarbDays};if(s.n==="R-134a Cannabinoid Cut")return{...s,days:r134aInfo.cannabDays};if(s.n==="Micron Filtration")return{...s,days:r134aInfo.filterDays};if(s.n==="Vacuum Purge (12 hr)")return{...s,days:r134aInfo.purgeDays};return s;})}));}

  function openAdd(){const d=new Date().toISOString().split("T")[0];const steps=(STEPS["whole_flower"]||[]).map(s=>({n:s.n,days:s.days}));setForm({...EMPTY,d,steps});setFormMode("add");setFormErr("");}
  function openEdit(b){
    setForm({name:b.name,cat:b.cat,sub:b.sub||"",strains:b.strains||"",d:b.d,inputAmt:String(b.inputAmt||""),unit:b.unit||"g",pkgIdx:b.pkgIdx||0,steps:b.steps.map(s=>({n:s.n,days:s.days})),
      stemWastePct:String(b.stemWastePct||30),moistureLossPct:String(b.moistureLossPct||2),fillWastePct:String(b.fillWastePct||3),coneWeight:String(b.coneWeight||1),packSize:String(b.packSize||5),inputMaterial:b.inputMaterial||"flower",
      overfillG:String(b.overfillG||0.1),vapeInputType:b.vapeInputType||"distillate",sauceSepMethod:b.sauceSepMethod||"pour_off",extractInputType:b.extractInputType||"distillate",inputPotencyPct:String(b.inputPotencyPct||80),
      tincBottleSize:String(b.tincBottleSize||30),tincPotencyMgPerMl:String(b.tincPotencyMgPerMl||33),kiefSift:b.kiefSift||false,kief40Pct:String(b.kief40Pct||12),kief100Pct:String(b.kief100Pct||8),cannabinoids:b.cannabinoids||["THC"],
      trimType:b.trimType||"machine",trimMachine:b.trimMachine||"greenboz_215",trimThroughput:String(b.trimThroughput||215),trimmerCount:String(b.trimmerCount||4),gramsPerTrimmerDay:String(b.gramsPerTrimmerDay||350),prerollMachine:b.prerollMachine||"knockbox_100",prerollThroughput:String(b.prerollThroughput||529),packagingContainer:b.packagingContainer||"",packagingUnitsPerPack:String(b.packagingUnitsPerPack||5),
      packagingType:b.packagingType||"jar",packagingStaff:String(b.packagingStaff||2),packagingBaseline:String(b.packagingBaseline||150),
      vapeStartPotency:String(b.vapeStartPotency||85),vapeTerpPct:String(b.vapeTerpPct||10),vapeTerpSource:b.vapeTerpSource||"pure",vapeTerpSrcPotency:String(b.vapeTerpSrcPotency??(TERP_SRCS[b.vapeTerpSource||"pure"]?.thc*100||0)),
      thcaMethod:b.thcaMethod||"controlled",thcaRecrystCycles:String(b.thcaRecrystCycles||1),
      s2sSystem:b.s2sSystem||"metrc",s2sSourceTags:b.s2sSourceTags||"",s2sOutputTags:b.s2sOutputTags||"",actual_yield:b.actual_yield||""});
    setEditId(b.id);setFormMode("edit");setFormErr("");
  }
  function closeForm(){setFormMode(null);setEditId(null);}

  function validate(){
    if(!form.name.trim()){setFormErr("Enter a batch name.");return false;}
    if(!form.d){setFormErr("Select a start date.");return false;}
    if(!form.inputAmt||parseFloat(form.inputAmt)<=0){setFormErr("Enter a valid input quantity.");return false;}
    return true;
  }

  function saveBatch(){
    if(!validate())return;
    const steps=formSteps.map(s=>({n:s.n,days:parseInt(s.days)||0}));
    const sub=subOpts.find(s=>s.v===form.sub);
    const base={name:form.name.trim(),cat:form.cat,sub:form.sub,strains:form.strains.trim(),d:form.d,inputAmt:parseFloat(form.inputAmt),unit:form.unit,pkgIdx,steps,yieldEst,pkgLabel:pkgSel?.l,catLabel:CATS.find(c=>c.v===form.cat)?.l||form.cat,subLabel:sub?.l||"",stemWastePct:parseFloat(form.stemWastePct)||0,moistureLossPct:parseFloat(form.moistureLossPct)||0,fillWastePct:parseFloat(form.fillWastePct)||0,coneWeight:parseFloat(form.coneWeight)||1,packSize:parseInt(form.packSize)||5,inputMaterial:form.inputMaterial,overfillG:parseFloat(form.overfillG)||0,vapeInputType:form.vapeInputType,sauceSepMethod:form.sauceSepMethod,extractInputType:form.extractInputType,inputPotencyPct:parseFloat(form.inputPotencyPct)||80,tincBottleSize:parseFloat(form.tincBottleSize)||30,tincPotencyMgPerMl:parseFloat(form.tincPotencyMgPerMl)||33,kiefSift:form.kiefSift,kief40Pct:parseFloat(form.kief40Pct)||12,kief100Pct:parseFloat(form.kief100Pct)||8,cannabinoids:form.cannabinoids,trimType:form.trimType,trimMachine:form.trimMachine,trimThroughput:parseFloat(form.trimThroughput)||215,trimmerCount:parseInt(form.trimmerCount)||4,gramsPerTrimmerDay:parseFloat(form.gramsPerTrimmerDay)||350,prerollMachine:form.prerollMachine,prerollThroughput:parseFloat(form.prerollThroughput)||529,packagingType:form.packagingType,packagingContainer:form.packagingContainer||"",packagingUnitsPerPack:parseInt(form.packagingUnitsPerPack)||5,packagingStaff:parseInt(form.packagingStaff)||2,packagingBaseline:parseFloat(form.packagingBaseline)||150,vapeStartPotency:parseFloat(form.vapeStartPotency)||85,vapeTerpPct:parseFloat(form.vapeTerpPct)||10,vapeTerpSource:form.vapeTerpSource,vapeTerpSrcPotency:parseFloat(form.vapeTerpSrcPotency)||0,formulationResult:formCalc,s2sSystem:form.s2sSystem||"metrc",s2sSourceTags:form.s2sSourceTags.trim(),s2sOutputTags:form.s2sOutputTags.trim(),actual_yield:form.actual_yield.trim(),inputSource:form.inputSource,harvestBatchId:form.harvestBatchId,harvestGrade:form.harvestGrade};

    const mainId=formMode==="edit"?editId:Date.now();
    const mainBatch={...base,id:mainId};

    if(formMode==="edit"){
      setBatches(p=>{const filtered=p.filter(b=>b.id!==editId&&b.linkedTo!==editId);return[...filtered,mainBatch];});
    } else {
      const newBatches=[mainBatch];
      // Auto-create HTE linked batch for THCa isolate
      if(form.cat==="extract"&&(form.sub==="thca_ff"||form.sub==="thca_trim")){
        const isFf=form.sub==="thca_ff";
        const htePct=isFf?0.06:0.03;const hteG=inputG*htePct;
        const hteBatch={...base,id:Date.now()+2,name:form.name.trim()+" — HTE (Terpene Fraction)",isLinked:true,linkedTo:mainId,yieldEst:`~${hteG.toFixed(1)}g HTE (${isFf?"~6% of fresh frozen biomass":"~3% of dry trim"})`,actual_yield:"",s2s_barcode:""};
        newBatches.push(hteBatch);
      }
      // Auto-create linked heads/tails batch for distillate
      if(form.cat==="extract"&&form.sub==="distillate"){
        const crude=inputG*0.18;const total=crude*0.70;const ht=total*0.20;
        const htBatch={...base,id:Date.now()+1,name:form.name.trim()+" — Heads/Tails (Edibles Grade)",isLinked:true,linkedTo:mainId,yieldEst:`~${ht.toFixed(0)}g edibles-grade oil`,actual_yield:"",s2s_barcode:""};
        newBatches.push(htBatch);
      }
      setBatches(p=>[...p,...newBatches]);
    }
    autoPopulateStrains(form.strains, { source: "Production Scheduler" });
    closeForm();
  }

  function removeBatch(id){setBatches(p=>p.filter(b=>b.id!==id&&b.linkedTo!==id));}

  const timelines=batches.map(b=>buildTimeline(b.d,b.steps));
  const hasBatches=batches.length>0;
  let gStart,total,twPx,todayOff,months,weeks;
  if(hasBatches){
    const allS=timelines.map(tl=>tl[0]?.start).filter(Boolean);
    const allE=timelines.map(tl=>tl[tl.length-1]?.end).filter(Boolean);
    gStart=new Date(Math.min(...allS));total=dDiff(gStart,new Date(Math.max(...allE)))+10;
    twPx=total*PX;todayOff=dDiff(gStart,today);
    months=[];let mo="",moX=0;
    for(let day=0;day<=total;day++){const ml=dAdd(gStart,day).toLocaleDateString("en-US",{month:"short",year:"2-digit"});if(ml!==mo){if(mo)months.push({label:mo,x:moX,w:day*PX-moX});mo=ml;moX=day*PX;}}
    months.push({label:mo,x:moX,w:total*PX-moX});
    weeks=[];for(let day=0;day<=total;day+=7)weeks.push({x:day*PX,wn:Math.floor(day/7)+1,date:fmtS(dAdd(gStart,day))});
  }
  function batchStatus(b,tl){const start=new Date(b.d+"T00:00:00");const end=tl[tl.length-1]?.end;if(!end)return{label:"—",cls:"sp-u"};if(end<today0)return{label:"Complete",cls:"sp-c"};if(start>today0)return{label:"Upcoming",cls:"sp-u"};return{label:"In Progress",cls:"sp-a"};}

  function exportProd(){
    if(!batches.length)return;
    const date=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    const rows=batches.map((b,idx)=>{const tl=timelines[idx];const end=tl[tl.length-1]?.end;const stepRows=tl.map(s=>'<tr><td style="padding:4px 14px 4px 0;color:#555;font-size:13px;white-space:nowrap;">'+s.name+'</td><td style="padding:4px 14px 4px 0;font-size:13px;">'+fmtF(s.start)+' \u2192 '+fmtF(s.end)+'</td><td style="color:#666;font-size:13px;">'+s.days+' days</td></tr>').join("");return'<div style="margin-bottom:28px;page-break-inside:avoid;border-left:4px solid '+(b.isLinked?"#5a78cc":"#2d5a3d")+';padding-left:14px;"><h2 style="font-size:15px;font-weight:700;color:#1a1a1a;margin:0 0 2px;">'+b.name+(b.isLinked?' <span style="font-size:11px;color:#5a78cc;">[Linked Batch]</span>':'')+'</h2><p style="font-size:12px;color:#555;margin:0 0 10px;">'+b.catLabel+(b.subLabel?' \u2014 '+b.subLabel:'')+' &nbsp;\u00b7&nbsp; '+b.inputAmt+b.unit+(b.strains?' &nbsp;\u00b7&nbsp; '+b.strains:'')+'</p><table style="border-collapse:collapse;">'+stepRows+'</table><p style="font-size:12px;color:#333;margin:6px 0 0;"><strong>Est. output:</strong> '+(b.yieldEst||'—')+(b.actual_yield?' &nbsp;\u00b7&nbsp; <strong>Actual:</strong> '+b.actual_yield:'')+(b.cannabinoids?.length?' &nbsp;\u00b7&nbsp; '+b.cannabinoids.join(', '):'')+(b.s2s_barcode?' &nbsp;\u00b7&nbsp; S2S: '+b.s2s_barcode:'')+'</p></div>';}).join('<hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;">');
    const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ResinOps Production Schedule</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.6;}h1{font-size:22px;color:#2d5a3d;margin:0 0 4px;}.meta{font-size:13px;color:#666;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid #e0e0e0;}@media print{body{margin:24px;}}</style></head><body><h1>ResinOps \u2014 Production Schedule</h1><div class="meta">Exported '+date+' &nbsp;\u00b7&nbsp; '+batches.filter(b=>!b.isLinked).length+' batches<br><small>Ctrl+P \u2192 Save as PDF &nbsp;|&nbsp; File \u2192 Open in Word</small></div>'+rows+'</body></html>';
    const blob=new Blob([html],{type:"text/html"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="ResinOps-Production-"+new Date().toISOString().slice(0,10)+".html";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  }

  return(
    <>
      <style>{CSS}</style>
      <div className="ps-wrap">
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Production Scheduler</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Track every batch from intake to live inventory</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {hasBatches&&<button className="ps-exp" onClick={exportProd}>↓ Export</button>}
            {!formMode&&<button className="ps-btn ps-primary" onClick={openAdd}>+ Add Batch</button>}
          </div>
        </div>

        {/* ── FORM (inlined - no sub-component) ── */}
        {formMode&&(
          <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:10,padding:18,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>{formMode==="edit"?"Edit Batch":"New Production Batch"}</div>

            {/* Basic fields */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label className="ps-lbl">Batch name</label><input className="ps-inp" placeholder="Batch 2026-001" value={form.name} onChange={e=>setF("name",e.target.value)} /></div>
              <div><label className="ps-lbl">Product category</label><select className="ps-sel" value={form.cat} onChange={e=>changeCat(e.target.value)}>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
              {subOpts.length>0&&<div><label className="ps-lbl">Product type</label><select className="ps-sel" value={form.sub} onChange={e=>changeSub(e.target.value)}>{subOpts.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}</select></div>}
              <div><label className="ps-lbl">Strain(s) — comma-separate blends</label><input className="ps-inp" placeholder="Blue Dream, OG Kush" value={form.strains} onChange={e=>setF("strains",e.target.value)} /></div>
              <div><label className="ps-lbl">Batch start date</label><input type="date" className="ps-inp" value={form.d} onChange={e=>setF("d",e.target.value)} /></div>
              {isFlowerCat(form.cat) && availableHarvest.length>0 && (
                <div style={{gridColumn:"span 2"}}>
                  <label className="ps-lbl">Input source</label>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <button type="button" className="ps-btn" style={{fontSize:11,padding:"5px 12px",background:form.inputSource==="manual"?"var(--accent)":"var(--surface-2)",color:form.inputSource==="manual"?"#fff":"var(--text-2)",border:form.inputSource==="manual"?"none":"1px solid var(--border-2)"}} onClick={()=>setForm(f=>({...f,inputSource:"manual",harvestBatchId:"",harvestGrade:""}))}>Manual Entry</button>
                    <button type="button" className="ps-btn" style={{fontSize:11,padding:"5px 12px",background:form.inputSource==="harvest"?"var(--accent)":"var(--surface-2)",color:form.inputSource==="harvest"?"#fff":"var(--text-2)",border:form.inputSource==="harvest"?"none":"1px solid var(--border-2)"}} onClick={()=>setForm(f=>({...f,inputSource:"harvest"}))}>From Harvest Batch</button>
                  </div>
                  {form.inputSource==="harvest" && (
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
                      <select className="ps-sel" value={form.harvestBatchId} onChange={e=>setForm(f=>({...f,harvestBatchId:e.target.value}))}>
                        <option value="">— Select harvest batch —</option>
                        {availableHarvest.map(hb=><option key={hb.id} value={hb.id}>{hb.strainName} — {hb.spaceName||"manual"} ({fmtF(new Date(hb.d+"T12:00:00"))})</option>)}
                      </select>
                      <select className="ps-sel" value={form.harvestGrade} onChange={e=>selectHarvestGrade(form.harvestBatchId,e.target.value)} disabled={!form.harvestBatchId}>
                        <option value="">— Grade —</option>
                        {form.harvestBatchId && harvestBatches.find(h=>h.id===parseInt(form.harvestBatchId)) && Object.entries(harvestBatches.find(h=>h.id===parseInt(form.harvestBatchId)).grades).filter(([k,g])=>parseFloat(g.weight)>0).map(([k,g])=><option key={k} value={k}>{GRADE_LABELS[k]} ({g.weight}g)</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div><label className="ps-lbl">{getInputLabel(form.cat)}</label>
                <div style={{display:"flex",gap:6}}>
                  <input type="number" min="0" step="0.1" className="ps-inp" placeholder="1000" value={form.inputAmt} onChange={e=>setF("inputAmt",e.target.value)} style={{flex:1}} disabled={form.inputSource==="harvest"&&!!form.harvestGrade} />
                  <select className="ps-sel" value={form.unit} onChange={e=>setF("unit",e.target.value)} style={{width:64}}><option value="g">g</option><option value="lbs">lbs</option><option value="kg">kg</option></select>
                </div>
              </div>
              <div><label className="ps-lbl">Package / unit size</label><select className="ps-sel" value={pkgIdx} onChange={e=>setF("pkgIdx",parseInt(e.target.value))}>{pkgOpts.map((p,i)=><option key={i} value={i}>{p.l}</option>)}</select></div>
              <div style={{display:"flex",alignItems:"center"}}>
                {yieldEst?(<div className="ps-yield"><div style={{fontSize:10,color:"var(--accent-2)",fontWeight:700,marginBottom:2,letterSpacing:"0.06em",textTransform:"uppercase"}}>Estimated Output</div><div style={{fontSize:11,fontWeight:600,color:"var(--accent-2)",lineHeight:1.5}}>{yieldEst}</div></div>):<div style={{fontSize:12,color:"var(--text-3)"}}>Enter quantity to see yield estimate</div>}
              </div>
            </div>

            {/* Distillation apparatus calculator */}
            {isAnyDistillation&&(
              <div className="ps-box" style={{border:"1px solid rgba(90,120,200,0.3)",background:"rgba(90,120,200,0.05)"}}>
                <div className="ps-box-t" style={{color:"#8090e0"}}>🔬 Distillation Apparatus</div>
                {distSpec&&(
                  <div style={{marginBottom:10,padding:"8px 12px",background:"var(--surface)",borderRadius:7,fontSize:11}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontWeight:700,color:"var(--text)",fontSize:12}}>{distSpec.brand} — {distSpec.vol}</span>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:isShortPath?"rgba(90,120,200,0.15)":"rgba(74,124,89,0.15)",color:isShortPath?"#8090e0":"var(--accent-2)"}}>{distSpec.type}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:6}}>
                      <div style={{background:"var(--surface-2)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"var(--text-3)",textTransform:"uppercase",fontWeight:700}}>Throughput</div>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--text)"}}>{distSpec.throughputG}g/hr</div>
                      </div>
                      <div style={{background:"var(--surface-2)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"var(--text-3)",textTransform:"uppercase",fontWeight:700}}>1st Pass Yield</div>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--amber)"}}>{distSpec.pass1Pct||Math.round(distSpec.pass1Yield*100)}%</div>
                      </div>
                      <div style={{background:"var(--surface-2)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"var(--text-3)",textTransform:"uppercase",fontWeight:700}}>2nd Pass Yield</div>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--accent-2)"}}>{distSpec.pass2Pct||Math.round(distSpec.pass2Yield*100)}%</div>
                      </div>
                    </div>
                    {distSpec.notes&&<div style={{fontSize:10,color:"var(--text-3)"}}>{distSpec.notes}</div>}
                  </div>
                )}
                {distCalc&&(
                  <div style={{background:"rgba(74,124,89,0.08)",borderRadius:7,padding:"10px 12px",marginBottom:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--accent-2)",marginBottom:6}}>📊 Yield estimate from {inputG.toLocaleString()}g crude input:</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>After 1st Pass</div>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--amber)"}}>{distCalc.pass1YieldG.toLocaleString()}g</div>
                        <div style={{fontSize:10,color:"var(--text-3)"}}>{distCalc.pass1Pct}% recovery</div>
                        <div style={{fontSize:10,color:"var(--text-3)"}}>{distCalc.throughputHrsPass1} hrs running time</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>After 2nd Pass</div>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--accent-2)"}}>{distCalc.pass2YieldG.toLocaleString()}g</div>
                        <div style={{fontSize:10,color:"var(--text-3)"}}>{distCalc.totalPct}% overall recovery</div>
                        <div style={{fontSize:10,color:"var(--text-3)"}}>{distCalc.throughputHrsPass2} hrs 2nd pass</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Heads + Tails</div>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--text-2)"}}>{(distCalc.pass1YieldG-distCalc.pass2YieldG).toLocaleString()}g</div>
                        <div style={{fontSize:10,color:"var(--text-3)"}}>edibles-grade fraction</div>
                        <div style={{fontSize:10,color:"var(--text-3)"}}>auto-creates linked batch</div>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{fontSize:10,color:"var(--text-3)"}}>
                  Yield assumptions: 1st pass {distSpec?Math.round(distSpec.pass1Yield*100):78}% crude→distillate (minor cannabinoid separation + color remediation). 2nd pass {distSpec?Math.round(distSpec.pass2Yield*100):87}% yield with potency upgrade to 85–93% THC. Actual yields vary with crude quality and starting potency.
                </div>
              </div>
            )}


            {/* THCa crystallization method */}
            {isThca&&<div className="ps-box">
              <div className="ps-box-t">THCa Crystallization Method</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Crystallization method</label>
                  <select className="ps-sel" value={form.thcaMethod} onChange={e=>changeThcaMethod(e.target.value)}>
                    <option value="controlled">Controlled Crash — Genome Crystallizer (4-8 hrs/cycle)</option>
                    <option value="traditional">Traditional — Jar Tech / Diamond Miner (2-4 weeks)</option>
                  </select>
                </div>
                <div>
                  <label className="ps-lbl">Recrystallization cycles (default 1, add for higher purity)</label>
                  <input type="number" min="1" max="5" className="ps-inp"
                    value={form.thcaRecrystCycles} onChange={e=>changeThcaCycles(e.target.value)} />
                </div>
              </div>
              <div style={{fontSize:11,color:"var(--text-3)",lineHeight:1.6}}>
                {form.thcaMethod==="controlled"
                  ? "Workflow: Cold BHO extraction → Controlled Crash crystallization → HTE removed with butane fraction (auto-tracked as linked batch) → Warm gas redissolution → Recrystallization → Cold solvent wash → Final purge → >99% THCa"
                  : "Workflow: Cold BHO extraction → Initial solvent recovery → Diamond miner / jar crystallization → HTE pour-off (auto-tracked as linked batch) → Warm gas redissolution → Recrystallization → Cold solvent wash → Final purge → >99% THCa"}
              </div>
              <div style={{fontSize:11,color:"var(--accent-2)",marginTop:8,background:"rgba(74,124,89,0.1)",borderRadius:6,padding:"6px 10px"}}>
                HTE terpene fraction will be auto-created as a linked batch. Estimated yields: THCa ~{form.sub==="thca_ff"?"8%":"4%"} · HTE ~{form.sub==="thca_ff"?"6%":"3%"} of input biomass.
              </div>
            </div>}

            {/* R-134a cycle info */}
            {isR134a&&r134aInfo&&<div className="ps-box">
              <div className="ps-box-t">R-134a Machine Schedule</div>
              <div style={{fontSize:12,color:"var(--text-2)",marginBottom:8}}>
                Machine: {form.sub==="r134a_50l"?"50L (5,000g capacity)":"20L (2,500g capacity)"} · {r134aInfo.cycles} cycle{r134aInfo.cycles>1?"s":""} needed for {inputG.toFixed(0)}g input
              </div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:8}}>
                Terp cut: {r134aInfo.terpDays}d · Decarb 125°C: {r134aInfo.decarbDays}d · Cannabinoid cut: {r134aInfo.cannabDays}d · Filtration: {r134aInfo.filterDays}d · Vacuum purge: 1d
              </div>
              <button className="ps-btn ps-secondary" style={{fontSize:11,padding:"4px 10px"}} onClick={applyR134aDays}>Apply calculated days to steps</button>
            </div>}

            {/* Whole flower overfill */}
            {form.cat==="whole_flower"&&<div className="ps-box">
              <div className="ps-box-t">Overfill Variance per Unit</div>
              <div style={{maxWidth:240}}><label className="ps-lbl">Grams overfill per unit (e.g. 0.1)</label><input type="number" min="0" max="2" step="0.05" className="ps-inp" value={form.overfillG} onChange={e=>setF("overfillG",e.target.value)} /></div>
            </div>}

            {/* Pre-roll specific */}
            {form.cat==="pre_roll"&&<div className="ps-box">
              <div className="ps-box-t">Pre-Roll — Input, Waste & Pack</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="ps-lbl">Input material</label><select className="ps-sel" value={form.inputMaterial} onChange={e=>setF("inputMaterial",e.target.value)}><option value="flower">Whole / Ground Flower</option><option value="trim">Trim</option></select></div>
                <div><label className="ps-lbl">Cone weight (g)</label><input type="number" min="0.1" max="5" step="0.1" className="ps-inp" value={form.coneWeight} onChange={e=>setF("coneWeight",e.target.value)} /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                <div><label className="ps-lbl">Stem waste %</label><input type="number" min="0" max="60" step="1" className="ps-inp" value={form.stemWastePct} onChange={e=>setF("stemWastePct",e.target.value)} /></div>
                <div><label className="ps-lbl">Moisture loss %</label><input type="number" min="0" max="10" step="0.5" className="ps-inp" value={form.moistureLossPct} onChange={e=>setF("moistureLossPct",e.target.value)} /></div>
                <div><label className="ps-lbl">Fill waste %</label><input type="number" min="0" max="20" step="0.5" className="ps-inp" value={form.fillWastePct} onChange={e=>setF("fillWastePct",e.target.value)} /></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,marginBottom:10}}>
                <div><label className="ps-lbl">Units per pack</label><input type="number" min="1" max="100" step="1" className="ps-inp" value={form.packSize} onChange={e=>setF("packSize",e.target.value)} /></div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                <input type="checkbox" checked={form.kiefSift} onChange={e=>setF("kiefSift",e.target.checked)} />
                Include kief sifting from stem material
              </label>
              {form.kiefSift&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
                <div><label className="ps-lbl">40-mesh kief % of stems</label><input type="number" min="0" max="30" step="0.5" className="ps-inp" value={form.kief40Pct} onChange={e=>setF("kief40Pct",e.target.value)} /></div>
                <div><label className="ps-lbl">100-mesh kief % of stems</label><input type="number" min="0" max="20" step="0.5" className="ps-inp" value={form.kief100Pct} onChange={e=>setF("kief100Pct",e.target.value)} /></div>
              </div>}
            </div>}

            {/* Pre-roll machine throughput */}
            {form.cat==="pre_roll"&&<div className="ps-box">
              <div className="ps-box-t">Pre-Roll Machine</div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:8}}>
                <div><label className="ps-lbl">Machine</label><select className="ps-sel" value={form.prerollMachine} onChange={e=>{setF("prerollMachine",e.target.value);setF("prerollThroughput",String(PREROLL_MACHINES[e.target.value]?.t||500));}}>{Object.entries(PREROLL_MACHINES).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
                <div><label className="ps-lbl">Throughput (joints/hr) — editable</label><input type="number" min="0" className="ps-inp" value={form.prerollThroughput} onChange={e=>setF("prerollThroughput",e.target.value)} disabled={form.prerollMachine==="hand"} /></div>
              </div>
              {prerollCalc && (
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div className="ps-calc-note">Calculated rolling/filling time: {prerollCalc} day{prerollCalc>1?"s":""} for ~{preRollUnits.toLocaleString()} cones (8-hr shifts)</div>
                  <button className="ps-btn ps-secondary" style={{fontSize:11,padding:"3px 10px",flexShrink:0}} onClick={applyPrerollDays}>Apply to step</button>
                </div>
              )}
              {form.prerollMachine==="hand" && <div style={{fontSize:11,color:"var(--text-3)"}}>Hand-rolled — set Rolling / Filling days manually below based on crew size.</div>}
            </div>}

            {/* Ground flower */}
            {form.cat==="ground_flower"&&<div className="ps-box">
              <div className="ps-box-t">Ground Flower — Waste Factors</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="ps-lbl">Stem waste %</label><input type="number" min="0" max="60" step="1" className="ps-inp" value={form.stemWastePct} onChange={e=>setF("stemWastePct",e.target.value)} /></div>
                <div><label className="ps-lbl">Moisture loss %</label><input type="number" min="0" max="10" step="0.5" className="ps-inp" value={form.moistureLossPct} onChange={e=>setF("moistureLossPct",e.target.value)} /></div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                <input type="checkbox" checked={form.kiefSift} onChange={e=>setF("kiefSift",e.target.checked)} />Include kief sifting from stem material
              </label>
              {form.kiefSift&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
                <div><label className="ps-lbl">40-mesh kief %</label><input type="number" min="0" max="30" step="0.5" className="ps-inp" value={form.kief40Pct} onChange={e=>setF("kief40Pct",e.target.value)} /></div>
                <div><label className="ps-lbl">100-mesh kief %</label><input type="number" min="0" max="20" step="0.5" className="ps-inp" value={form.kief100Pct} onChange={e=>setF("kief100Pct",e.target.value)} /></div>
              </div>}
            </div>}

            {/* Trim method calculator moved to Harvest Batches — see per-batch trim calculator there */}

            {/* Packaging container selector — all categories */}
            {(()=>{
              const getCatKey=()=>{
                if(form.cat==="whole_flower"||form.cat==="ground_flower") return form.cat;
                if(form.cat==="pre_roll") return "pre_roll";
                if(form.cat==="extract"&&isAnyDistillation) return "distillate";
                if(form.cat==="extract") return "extract";
                if(form.cat==="vape") return "vape";
                if(form.cat==="tincture") return "tincture";
                if(form.cat==="topical") return "topical";
                if(form.cat==="edible") return "edible";
                return null;
              };
              const catKey=getCatKey();
              const containers=catKey?PKG_CONTAINERS[catKey]||[]:[];
              if(!containers.length) return null;
              const isMultiPack=["poptop_multi","retail_box_multi","tin_multi","mylar_multi","poptop_in_mylar","tubes_in_mylar","box_in_mylar"].includes(form.packagingContainer);
              const needsMylar=["poptop_in_mylar","tubes_in_mylar","box_in_mylar"].includes(form.packagingContainer);
              return(
                <div className="ps-box">
                  <div className="ps-box-t">Packaging & Container</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                    <div>
                      <label className="ps-lbl">Container type</label>
                      <select className="ps-sel" value={form.packagingContainer||""} onChange={e=>setF("packagingContainer",e.target.value)}>
                        <option value="">— Select container —</option>
                        {containers.map(ct=><option key={ct.v} value={ct.v}>{ct.l}</option>)}
                      </select>
                    </div>
                    {isMultiPack&&(
                      <div>
                        <label className="ps-lbl">Units per pack</label>
                        <input type="number" min="2" max="100" className="ps-inp" value={form.packagingUnitsPerPack||"5"} onChange={e=>setF("packagingUnitsPerPack",e.target.value)} placeholder="e.g. 5, 7, 10" />
                      </div>
                    )}
                    {needsMylar&&(
                      <div style={{gridColumn:"span 2",background:"rgba(74,124,89,0.06)",borderRadius:6,padding:"6px 10px",fontSize:11,color:"var(--accent-2)"}}>
                        ✓ Mylar outer bag included — {form.packagingContainer==="poptop_in_mylar"?"Pop-top vials sealed in mylar":form.packagingContainer==="tubes_in_mylar"?"Tubes sealed in mylar":"Box sealed in mylar"}
                      </div>
                    )}
                  </div>
                  {isFlower&&(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                      <div><label className="ps-lbl">Packaging staff</label><input type="number" min="1" className="ps-inp" value={form.packagingStaff} onChange={e=>setF("packagingStaff",e.target.value)} /></div>
                      <div><label className="ps-lbl">Baseline rate (units/person/hr)</label><input type="number" min="1" className="ps-inp" value={form.packagingBaseline} onChange={e=>setF("packagingBaseline",e.target.value)} /></div>
                      {pkgCalc&&<div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
                        <button className="ps-btn ps-secondary" style={{fontSize:11,padding:"3px 10px"}} onClick={applyPkgDays}>Apply to step</button>
                      </div>}
                    </div>
                  )}
                  {pkgCalc&&<div className="ps-calc-note">Packaging: {pkgCalc.days} day{pkgCalc.days>1?"s":""} / ~{pkgCalc.hours} hrs ({pkgCalc.rate} units/person/hr)</div>}
                </div>
              );
            })()}

            {/* Legacy: flower-only packaging calc fallback (hidden but keeps logic alive) */}
            {false&&isFlower&&<div className="ps-box">
              <div className="ps-box-t">Packaging Calculator</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="ps-lbl">Package type</label><select className="ps-sel" value={form.packagingType} onChange={e=>setF("packagingType",e.target.value)}><option value="jar">Jar (childproof)</option><option value="mylar">Mylar bag</option></select></div>
                <div><label className="ps-lbl">Packaging staff</label><input type="number" min="1" className="ps-inp" value={form.packagingStaff} onChange={e=>setF("packagingStaff",e.target.value)} /></div>
                <div><label className="ps-lbl">Baseline rate (units/person/hr for 3.5g)</label><input type="number" min="1" className="ps-inp" value={form.packagingBaseline} onChange={e=>setF("packagingBaseline",e.target.value)} /></div>
              </div>
            </div>}

            {/* Vape options */}
            {isVape&&!isVapeOil&&<div className="ps-box">
              <div className="ps-box-t">Vape — Input Material</div>
              <div style={{maxWidth:320}}><label className="ps-lbl">Input material type</label><select className="ps-sel" value={form.vapeInputType} onChange={e=>setF("vapeInputType",e.target.value)}><option value="distillate">Distillate</option><option value="live_resin">Live Resin</option><option value="rosin">Rosin</option></select></div>
            </div>}
            {isVapeOil&&<div className="ps-box">
              <div className="ps-box-t">Vape Oil — Sauce Separation Method</div>
              <div style={{maxWidth:320}}><label className="ps-lbl">Separation method</label><select className="ps-sel" value={form.sauceSepMethod} onChange={e=>setF("sauceSepMethod",e.target.value)}><option value="pour_off">Pour Off</option><option value="centrifuge">Centrifuge</option></select></div>
            </div>}

            {/* Vape formulation calculator */}
            {isVapeFormulable&&<div className="ps-box">
              <div className="ps-box-t">Vape Formulation Calculator</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label className="ps-lbl">Distillate starting potency (% THC)</label><input type="number" min="1" max="99" className="ps-inp" value={form.vapeStartPotency} onChange={e=>setF("vapeStartPotency",e.target.value)} /></div>
                <div><label className="ps-lbl">Target terpene % in final product</label><input type="number" min="1" max="50" step="0.5" className="ps-inp" value={form.vapeTerpPct} onChange={e=>setF("vapeTerpPct",e.target.value)} /></div>
                <div style={{gridColumn:"span 2"}}><label className="ps-lbl">Terpene source</label><select className="ps-sel" value={form.vapeTerpSource} onChange={e=>{const k=e.target.value;setForm(f=>({...f,vapeTerpSource:k,vapeTerpSrcPotency:String((TERP_SRCS[k]?.thc||0)*100)}));}}>{Object.entries(TERP_SRCS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select></div>
                <div><label className="ps-lbl">Terp source THC % — editable (default shown, override with your COA)</label><input type="number" min="0" max="100" step="0.5" className="ps-inp" value={form.vapeTerpSrcPotency} onChange={e=>setF("vapeTerpSrcPotency",e.target.value)} /></div>
              </div>
              {formCalc&&!formCalc.error&&<div className="ps-form-out">
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><div style={{fontSize:10,color:"#8090e0",fontWeight:700,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Terp additive needed</div><div style={{fontSize:16,fontWeight:700,color:"#a0b0f8"}}>{formCalc.terpAdd}g</div><div style={{fontSize:10,color:"#7080c0"}}>of selected source</div></div>
                  <div><div style={{fontSize:10,color:"#8090e0",fontWeight:700,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total volume</div><div style={{fontSize:16,fontWeight:700,color:"#a0b0f8"}}>{formCalc.total}g</div></div>
                  <div><div style={{fontSize:10,color:"#8090e0",fontWeight:700,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Est. final potency</div><div style={{fontSize:16,fontWeight:700,color:"#a0b0f8"}}>{formCalc.finalPot}% THC</div></div>
                  <div><div style={{fontSize:10,color:"#8090e0",fontWeight:700,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>Est. cart count</div><div style={{fontSize:16,fontWeight:700,color:"#a0b0f8"}}>{formCalc.carts.toLocaleString()}</div><div style={{fontSize:10,color:"#7080c0"}}>× {pkgSel?.l} @ 97% fill eff.</div></div>
                </div>
              </div>}
              {formCalc?.error&&<div style={{fontSize:12,color:"var(--danger)",marginTop:6}}>{formCalc.error}</div>}
            </div>}

            {/* Tincture */}
            {form.cat==="tincture"&&<div className="ps-box">
              <div className="ps-box-t">Tincture — Extract, Potency & Format</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label className="ps-lbl">Extract type</label><select className="ps-sel" value={form.extractInputType} onChange={e=>setF("extractInputType",e.target.value)}><option value="distillate">Distillate</option><option value="rosin">Rosin</option><option value="rso">RSO (Rick Simpson Oil)</option></select></div>
                <div><label className="ps-lbl">Input potency % THC</label><input type="number" min="1" max="100" className="ps-inp" value={form.extractInputType==="rosin"?"55":form.extractInputType==="rso"?"60":form.inputPotencyPct} disabled={form.extractInputType!=="distillate"} onChange={e=>setF("inputPotencyPct",e.target.value)} /></div>
                <div><label className="ps-lbl">Bottle size (ml)</label><select className="ps-sel" value={form.tincBottleSize} onChange={e=>setF("tincBottleSize",e.target.value)}>{["15","30","60"].map(v=><option key={v} value={v}>{v}ml</option>)}</select></div>
                <div><label className="ps-lbl">Target potency (mg/ml)</label><select className="ps-sel" value={form.tincPotencyMgPerMl} onChange={e=>setF("tincPotencyMgPerMl",e.target.value)}>{["10","25","33","50","100"].map(v=><option key={v} value={v}>{v} mg/ml</option>)}</select></div>
              </div>
            </div>}

            {/* Edible input */}
            {form.cat==="edible"&&form.sub!=="beverage"&&<div className="ps-box">
              <div className="ps-box-t">Edible — Extract Input</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div><label className="ps-lbl">Extract type</label><select className="ps-sel" value={form.extractInputType} onChange={e=>setF("extractInputType",e.target.value)}><option value="distillate">Distillate</option><option value="rosin">Rosin</option></select></div>
                <div><label className="ps-lbl">Input potency % THC</label><input type="number" min="1" max="100" className="ps-inp" value={form.extractInputType==="rosin"?"55":form.inputPotencyPct} disabled={form.extractInputType==="rosin"} onChange={e=>setF("inputPotencyPct",e.target.value)} /></div>
              </div>
            </div>}

            {/* Cannabinoid picker */}
            {showCb&&<div className="ps-box">
              <div className="ps-box-t">Cannabinoid Profile</div>
              <div className="cb-row">{CANNABINOIDS.map(cb=><div key={cb} className={"cb-pill"+(form.cannabinoids.includes(cb)?" on":"")} onClick={()=>toggleCb(cb)}>{cb}</div>)}</div>
            </div>}

            {/* Steps */}
            <div className="ps-box">
              <div className="ps-box-t">Production Steps — {totalDays} days total</div>
              <div style={{display:"grid",gap:6}}>
                {formSteps.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:2,background:SBG[s.n]||"#333",border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}} />
                    <span style={{fontSize:12,color:"var(--text-2)",flex:1,minWidth:0}}>{s.n}</span>
                    <input className="ps-days" type="number" min="1" max="365" value={s.days} onChange={e=>updateStep(i,e.target.value)} />
                    <span style={{fontSize:11,color:"var(--text-3)",width:28}}>days</span>
                  </div>
                ))}
              </div>
            </div>

            {/* S2S Chain of Custody */}
            <div className="ps-box">
              <div className="ps-box-t">Seed-to-Sale Chain of Custody</div>
              <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10,lineHeight:1.6}}>
                Tag data stored here will enable direct S2S API integration in v2 for automated verification and compliance reporting.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">S2S / Compliance system</label>
                  <select className="ps-sel" value={form.s2sSystem} onChange={e=>setF("s2sSystem",e.target.value)}>
                    <option value="metrc">METRC</option>
                    <option value="biotrack">BioTrackTHC</option>
                    <option value="leaf">Leaf Data Systems</option>
                    <option value="mj_freeway">MJ Freeway / Proteus</option>
                    <option value="flourish">Flourish Software</option>
                    <option value="cova">COVA</option>
                    <option value="other">Other / Custom</option>
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Source / input package tags — comma-separate multiple</label>
                  <textarea className="ps-inp" rows={2} placeholder={form.s2sSystem==="metrc"?"1A4FF0200000022000000001, 1A4FF0200000022000000002":"Enter source package tags, comma-separated"} value={form.s2sSourceTags} onChange={e=>setF("s2sSourceTags",e.target.value)} style={{resize:"vertical",minHeight:56}} />
                  <div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>Cannabis material received / input to this batch</div>
                </div>
                <div>
                  <label className="ps-lbl">Output / created package tags — comma-separate multiple</label>
                  <textarea className="ps-inp" rows={2} placeholder={form.s2sSystem==="metrc"?"1A4FF0200000022000000010, 1A4FF0200000022000000011":"Enter output package tags, comma-separated"} value={form.s2sOutputTags} onChange={e=>setF("s2sOutputTags",e.target.value)} style={{resize:"vertical",minHeight:56}} />
                  <div style={{fontSize:10,color:"var(--text-3)",marginTop:2}}>New packages created from this batch</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
                <div>
                  <label className="ps-lbl">Actual yield — enter after completion</label>
                  <input className="ps-inp" placeholder="e.g. 1,180 units / 32.4g" value={form.actual_yield} onChange={e=>setF("actual_yield",e.target.value)} />
                </div>
              </div>
            </div>

            {formErr&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{formErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="ps-btn ps-primary" onClick={saveBatch}>{formMode==="edit"?"Save Changes":"Add Batch"}</button>
              <button className="ps-btn ps-secondary" onClick={closeForm}>Cancel</button>
            </div>
          </div>
        )}

        {!hasBatches&&!formMode&&(
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🏭</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No production batches yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Add a batch to start tracking production timelines</div>
          </div>
        )}

        {hasBatches&&(<>
          <div className="ps-outer">
            <div className="ps-row" style={{height:HH,background:"var(--surface-2)"}}>
              <div className="ps-left" style={{height:HH,background:"var(--surface-2)"}}><span style={{fontSize:11,fontWeight:700,color:"var(--text-2)",letterSpacing:"0.08em",textTransform:"uppercase"}}>Batch</span></div>
              <div className="ps-tl" style={{minWidth:twPx,height:HH,overflow:"hidden"}}>
                {months.map((m,i)=><div key={i} style={{position:"absolute",left:m.x,top:0,width:m.w,height:24,borderRight:"1px solid var(--border)",padding:"0 8px",display:"flex",alignItems:"center",overflow:"hidden"}}><span style={{fontSize:11,fontWeight:600,color:"var(--text-2)",whiteSpace:"nowrap"}}>{m.label}</span></div>)}
                {weeks.map((w,i)=><div key={i} style={{position:"absolute",left:w.x,top:24,bottom:0,borderLeft:"1px solid var(--border)",paddingLeft:4,display:"flex",flexDirection:"column",justifyContent:"center"}}><div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",lineHeight:1.2}}>W{w.wn}</div><div style={{fontSize:9,color:"var(--text-3)",lineHeight:1.2}}>{w.date}</div></div>)}
              </div>
            </div>
            {batches.map((b,idx)=>{
              const tl=timelines[idx];const sub=SUBS[b.cat]?.find(s=>s.v===b.sub);
              return(
                <div key={b.id} className="ps-row" style={{height:RH,background:b.isLinked?"rgba(90,120,200,0.04)":undefined}}>
                  <div className="ps-left" style={{height:RH,borderLeft:b.isLinked?"2px solid rgba(90,120,200,0.4)":"none",paddingLeft:b.isLinked?12:14}}>
                    <div style={{fontSize:12,fontWeight:600,color:b.isLinked?"#8090d0":"var(--text)",wordBreak:"break-word",lineHeight:1.3}}>{b.isLinked?"↳ ":""}{b.name}</div>
                    <div style={{fontSize:11,color:"var(--text-2)",lineHeight:1.3}}>{b.catLabel}{sub?" — "+sub.l:""}</div>
                    {b.packagingContainer&&<div style={{fontSize:9,color:"var(--accent-2)",fontWeight:600}}>{PKG_CONTAINERS[b.cat]?.find(c=>c.v===b.packagingContainer)?.l||b.packagingContainer}{b.packagingUnitsPerPack&&b.packagingUnitsPerPack>1?` · ${b.packagingUnitsPerPack}-pack`:""}</div>}
                    {b.strains&&<div style={{fontSize:10,color:"var(--text-3)",lineHeight:1.3}}>{b.strains}</div>}
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{b.yieldEst||"—"}</div>
                    {(b.s2sOutputTags||b.s2s_barcode)&&<div style={{fontSize:9,color:"var(--text-3)",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🏷 {(b.s2sOutputTags||b.s2s_barcode||'').split(',')[0].trim()}</div>}
                    <div style={{display:"flex",gap:6,marginTop:5}}>
                      {!b.isLinked&&<button className="ps-btn ps-sm ps-edit" onClick={()=>openEdit(b)}>Edit</button>}
                      <button className="ps-btn ps-sm ps-del" onClick={()=>removeBatch(b.id)}>✕</button>
                    </div>
                  </div>
                  <div className="ps-tl" style={{minWidth:twPx,height:RH}}>
                    {weeks.map((w,i)=><div key={i} style={{position:"absolute",left:w.x,top:0,bottom:0,width:1,background:"var(--border)",opacity:0.4}} />)}
                    {tl.map((step,si)=>{const x=dDiff(gStart,step.start)*PX;const w=Math.max(dDiff(step.start,step.end)*PX,2);return(<div key={si} title={step.name+" — "+fmtF(step.start)+" \u2192 "+fmtF(step.end)+" ("+step.days+" days)"} style={{position:"absolute",left:x,top:12,width:w,height:RH-24,background:SBG[step.name]||"#333",opacity:b.isLinked?0.7:1,borderRadius:si===0?"5px 0 0 5px":si===tl.length-1?"0 5px 5px 0":"0",borderRight:si<tl.length-1?"1px solid rgba(0,0,0,0.25)":"none",display:"flex",alignItems:"center",overflow:"hidden",padding:"0 6px"}}>{w>30&&<span style={{fontSize:9,fontWeight:700,color:SFG[step.name]||"#fff",whiteSpace:"nowrap",letterSpacing:"0.03em"}}>{step.name}</span>}</div>);})}
                    {todayOff>=0&&todayOff<=total&&<div style={{position:"absolute",left:todayOff*PX,top:0,bottom:0,width:2,background:"var(--danger)",zIndex:3,opacity:0.9}} title="Today" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",marginBottom:20}}>
            {Object.entries(SBG).map(([name,bg])=><div key={name} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:10,borderRadius:2,background:bg,border:"1px solid rgba(255,255,255,0.12)"}} /><span style={{fontSize:10,color:"var(--text-3)"}}>{name}</span></div>)}
            <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:2,height:12,background:"var(--danger)",borderRadius:1}} /><span style={{fontSize:10,color:"var(--text-3)"}}>Today</span></div>
          </div>

          <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Batch Summary</div>
          <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:10}}>
            <table className="ps-tbl">
              <thead><tr><th>Batch</th><th>Product</th><th>Strains</th><th>Input</th><th>Est. Output</th><th>Actual Yield</th><th>Cannabinoids</th><th>Start</th><th>Completion</th><th>S2S Tags (out/in)</th><th>Status</th></tr></thead>
              <tbody>
                {batches.map((b,idx)=>{const tl=timelines[idx];const end=tl[tl.length-1]?.end;const st=batchStatus(b,tl);const sub=SUBS[b.cat]?.find(s=>s.v===b.sub);return(<tr key={b.id} style={{background:b.isLinked?"rgba(90,120,200,0.05)":undefined}}>
                  <td style={{color:b.isLinked?"#8090d0":"var(--text)",fontWeight:500,whiteSpace:"nowrap"}}>{b.isLinked?"↳ ":""}{b.name}</td>
                  <td style={{whiteSpace:"nowrap"}}>{b.catLabel}{sub?" — "+sub.l:""}</td>
                  <td>{b.strains||"—"}</td>
                  <td style={{whiteSpace:"nowrap"}}>{b.isLinked?"(auto)":b.inputAmt+b.unit}</td>
                  <td style={{fontSize:11}}>{b.yieldEst||"—"}</td>
                  <td style={{fontSize:11,color:b.actual_yield?"var(--accent-2)":"var(--text-3)"}}>{b.actual_yield||"—"}</td>
                  <td style={{fontSize:10}}>{b.cannabinoids?.join(", ")||"—"}</td>
                  <td style={{whiteSpace:"nowrap"}}>{fmtS(new Date(b.d+"T12:00:00"))}</td>
                  <td style={{whiteSpace:"nowrap"}}>{end?fmtS(end):"—"}</td>
                  <td style={{fontFamily:"monospace",fontSize:9}}><div>{b.s2sOutputTags?b.s2sOutputTags.split(",").map(t=>t.trim()).filter(Boolean).map((t,i)=><div key={i}>{t}</div>):b.s2s_barcode||"—"}</div><div style={{color:"var(--text-3)",marginTop:1}}>{b.s2sSourceTags?"← "+b.s2sSourceTags.split(",").length+" src":""}</div></td>
                  <td><span className={"sp "+(b.isLinked?"sp-l":st.cls)}>{b.isLinked?"Linked":st.label}</span></td>
                </tr>);})}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </>
  );
}
