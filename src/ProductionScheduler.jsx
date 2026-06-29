import { useState, useEffect } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const LW=280, RH=96, HH=56, PX=11;
const UNIT_TO_G = { g:1, lbs:453.592, kg:1000 };
const CANNABINOIDS = ["THC","THCa","CBD","CBDa","CBG","CBN","CBC","THCV"];

const SBG = {
  "Intake / Prep":"#1e3248","Drying":"#1e4420","Bucking":"#2e5010","Trimming":"#3a5e14",
  "Curing":"#143810","Grinding":"#504810","Rolling / Filling":"#583c0e","Extraction":"#582208",
  "Pressing":"#4a2008","Washing":"#143848","Lyophilization":"#0e2848","Purge / Process":"#3e1414",
  "Winterization":"#221438","Decarb":"#481c0e","Distillation":"#200e48","Formulation":"#0e3848",
  "Sauce Separation":"#3a1838","Filling":"#183040","Production":"#104038","Dose QC":"#0e2838",
  "QC / Testing":"#0a1848","Packaging":"#2e0e48","Inventory":"#0e3030",
};
const SFG = {
  "Intake / Prep":"#90c0f0","Drying":"#90f0a0","Bucking":"#b0e080","Trimming":"#c0f090",
  "Curing":"#80d080","Grinding":"#f0e060","Rolling / Filling":"#f0b860","Extraction":"#f8a870",
  "Pressing":"#f09870","Washing":"#80d0f0","Lyophilization":"#78b0f0","Purge / Process":"#f09090",
  "Winterization":"#b090f8","Decarb":"#f0a870","Distillation":"#c090ff","Formulation":"#70d0f0",
  "Sauce Separation":"#d080e0","Filling":"#80c0f0","Production":"#70e0c8","Dose QC":"#80c0f0",
  "QC / Testing":"#7090f8","Packaging":"#c080f8","Inventory":"#70d0d0",
};

// ── Product catalog ────────────────────────────────────────────────────────
const CATS = [
  {v:"whole_flower",l:"Whole Flower"},{v:"ground_flower",l:"Ground Flower"},
  {v:"pre_roll",l:"Pre-Roll"},{v:"extract",l:"Extract / Concentrate"},
  {v:"vape",l:"Vape"},{v:"tincture",l:"Tincture"},
  {v:"topical",l:"Topical"},{v:"edible",l:"Edible"},
];

const SUBS = {
  extract:[
    {v:"shatter",l:"BHO — Shatter / Wax"},{v:"badder",l:"BHO — Badder / Budder"},
    {v:"live_resin",l:"BHO — Live Resin"},{v:"sugar",l:"BHO — Sugar"},
    {v:"diamonds",l:"BHO — Diamonds & Sauce"},{v:"rosin_fl",l:"Rosin — Flower Press"},
    {v:"rosin_hash",l:"Rosin — Hash Press"},{v:"hash",l:"Ice Water Hash"},
    {v:"co2",l:"CO2 Extract"},{v:"distillate",l:"Distillate"},
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

// ── Step configs ───────────────────────────────────────────────────────────
const STEPS = {
  whole_flower:  [{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:21},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  ground_flower: [{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:14},{n:"Grinding",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  pre_roll:      [{n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:14},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  shatter:       [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  badder:        [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:4},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  live_resin:    [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  sugar:         [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:4},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  diamonds:      [{n:"Intake / Prep",days:1},{n:"Extraction",days:2},{n:"Purge / Process",days:21},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  rosin_fl:      [{n:"Intake / Prep",days:1},{n:"Pressing",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  rosin_hash:    [{n:"Intake / Prep",days:1},{n:"Pressing",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  hash:          [{n:"Intake / Prep",days:1},{n:"Washing",days:2},{n:"Lyophilization",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  co2:           [{n:"Intake / Prep",days:1},{n:"Extraction",days:3},{n:"Winterization",days:2},{n:"Distillation",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  distillate:    [{n:"Intake / Prep",days:1},{n:"Winterization",days:2},{n:"Decarb",days:1},{n:"Distillation",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  cartridge:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  disposable:    [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Filling",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  oil_rosin:     [{n:"Intake / Prep",days:1},{n:"Sauce Separation",days:2},{n:"Formulation",days:2},{n:"Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  oil_live_resin:[{n:"Intake / Prep",days:1},{n:"Sauce Separation",days:2},{n:"Formulation",days:2},{n:"Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:1},{n:"Inventory",days:1}],
  tincture:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  topical:       [{n:"Intake / Prep",days:1},{n:"Formulation",days:3},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  gummies:       [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:2},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  chocolate:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:3},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  capsules:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  beverage:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  other:         [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
};

// ── Package sizes ──────────────────────────────────────────────────────────
const PKG = {
  whole_flower:   [{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7},{l:"14g",v:14},{l:"28g",v:28},{l:"112g (QP)",v:112},{l:"224g (HP)",v:224},{l:"448g (lb)",v:448}],
  ground_flower:  [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7}],
  pre_roll:       [{l:"0.5g",v:0.5},{l:"0.75g",v:0.75},{l:"1g",v:1},{l:"1.5g",v:1.5},{l:"2g",v:2}],
  extract_solid:  [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7}],
  extract_bulk:   [{l:"bulk (g)",v:1}],
  vape_cart:      [{l:"0.3g",v:0.3},{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2}],
  vape_aio:       [{l:"1g",v:1},{l:"1.75g",v:1.75},{l:"2g",v:2},{l:"2.25g",v:2.25},{l:"4g",v:4},{l:"7g",v:7}],
  vape_oil:       [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"2.25g",v:2.25},{l:"4g",v:4},{l:"7g",v:7}],
  tincture_bot:   [{l:"15ml",v:15},{l:"30ml",v:30},{l:"60ml",v:60}],
  tincture_pot:   [{l:"25mg/ml",v:25},{l:"33mg/ml",v:33},{l:"50mg/ml",v:50},{l:"100mg/ml",v:100}],
  topical:        [{l:"1 oz",v:1},{l:"2 oz",v:2},{l:"4 oz",v:4}],
  edible_dose:    [{l:"1mg",v:1},{l:"2mg",v:2},{l:"2.5mg",v:2.5},{l:"5mg",v:5},{l:"10mg",v:10},{l:"20mg",v:20},{l:"25mg",v:25},{l:"50mg",v:50},{l:"100mg",v:100}],
  edible_bev:     [{l:"100ml",v:100},{l:"200ml",v:200},{l:"355ml",v:355}],
};

function getPkg(cat,sub) {
  if (cat==="whole_flower") return PKG.whole_flower;
  if (cat==="ground_flower") return PKG.ground_flower;
  if (cat==="pre_roll") return PKG.pre_roll;
  if (cat==="extract") return sub==="distillate"?PKG.extract_bulk:PKG.extract_solid;
  if (cat==="vape") {
    if (sub==="disposable") return PKG.vape_aio;
    if (sub==="oil_rosin"||sub==="oil_live_resin") return PKG.vape_oil;
    return PKG.vape_cart;
  }
  if (cat==="tincture") return PKG.tincture_bot;
  if (cat==="topical") return PKG.topical;
  if (cat==="edible") return sub==="beverage"?PKG.edible_bev:PKG.edible_dose;
  return [{l:"unit",v:1}];
}

function getStepKey(cat,sub) {
  if (["whole_flower","ground_flower","pre_roll","tincture","topical"].includes(cat)) return cat;
  if (cat==="extract") return sub||"shatter";
  if (cat==="vape") return sub||"cartridge";
  if (cat==="edible") return sub||"gummies";
  return cat;
}

function getInputLabel(cat) {
  return ({
    whole_flower:"Input — dry flower",ground_flower:"Input — dry flower",
    pre_roll:"Input — dry flower or trim",extract:"Input — biomass / trim",
    vape:"Input — oil / distillate",tincture:"Input — extract",
    topical:"Batch size",edible:"Input — extract / distillate",
  })[cat]||"Input";
}

// ── Yield calculation ──────────────────────────────────────────────────────
function calcYield(cat,sub,inputAmt,unit,pkgV,pkgL,opts) {
  const amt = parseFloat(inputAmt);
  if (!amt||amt<=0||!pkgV) return null;
  const g = amt * (UNIT_TO_G[unit]||1);
  const {
    stemWastePct=0,moistureLossPct=0,fillWastePct=0,
    coneWeight=1,packSize=5,inputMaterial="flower",
    overfillG=0,vapeInputType="distillate",sauceSepMethod="pour_off",
    extractInputType="distillate",inputPotencyPct=80,
    tincBottleSize=30,tincPotencyMgPerMl=33,
    kiefSift=false,kief40Pct=12,kief100Pct=8,
  }=opts;

  if (cat==="whole_flower") {
    const eff=pkgV+(parseFloat(overfillG)||0);
    const units=Math.floor(g/eff*0.95);
    const ovNote=parseFloat(overfillG)>0?` +${overfillG}g overfill/unit`:"";
    return `${g.toFixed(0)}g input · ${units.toLocaleString()} × ${pkgL} units${ovNote}`;
  }
  if (cat==="ground_flower") {
    const sw=parseFloat(stemWastePct)/100||0;
    const ml=parseFloat(moistureLossPct)/100||0;
    const usable=g*(1-sw)*(1-ml);
    const units=Math.floor(usable/pkgV*0.98);
    let kiefNote="";
    if (kiefSift) {
      const k40=usable*(parseFloat(kief40Pct)/100);
      const k100=usable*(parseFloat(kief100Pct)/100);
      kiefNote=` · +${k40.toFixed(1)}g 40-mesh kief, +${k100.toFixed(1)}g 100-mesh kief`;
    }
    return `${usable.toFixed(0)}g usable · ${units.toLocaleString()} × ${pkgL} (${stemWastePct}% stem, ${moistureLossPct}% moisture)${kiefNote}`;
  }
  if (cat==="pre_roll") {
    const isTrim=inputMaterial==="trim";
    const sw=isTrim?5:(parseFloat(stemWastePct)/100||0)*100;
    const swf=isTrim?0.05:(parseFloat(stemWastePct)/100||0);
    const ml=parseFloat(moistureLossPct)/100||0;
    const fw=parseFloat(fillWastePct)/100||0;
    const usable=g*(1-swf)*(1-ml)*(1-fw);
    const coneG=parseFloat(coneWeight)||1;
    const units=Math.floor(usable/coneG);
    const packs=Math.floor(units/(parseInt(packSize)||1));
    let kiefNote="";
    if (kiefSift) {
      const siftBase=g*swf;
      const k40=siftBase*(parseFloat(kief40Pct)/100);
      const k100=siftBase*(parseFloat(kief100Pct)/100);
      kiefNote=` · Sifted kief: ${k40.toFixed(1)}g (40-mesh), ${k100.toFixed(1)}g (100-mesh)`;
    }
    return `${units.toLocaleString()} cones · ${packs.toLocaleString()} × ${packSize}-packs from ${usable.toFixed(0)}g usable${kiefNote}`;
  }
  if (cat==="extract") {
    const yldMap={shatter:0.15,badder:0.15,live_resin:0.10,sugar:0.15,diamonds:0.08,rosin_fl:0.15,rosin_hash:0.60,hash:0.05,co2:0.10,distillate:0.70};
    const outG=g*(yldMap[sub]||0.15);
    const units=Math.floor(outG/pkgV*0.97);
    return `~${outG.toFixed(1)}g extract · ${units.toLocaleString()} × ${pkgL} units`;
  }
  if (cat==="vape") {
    const isOil=sub==="oil_rosin"||sub==="oil_live_resin";
    const sepNote=isOil?(sauceSepMethod==="centrifuge"?" (centrifuge sep)":" (pour-off sep)"):"";
    const fillEff=vapeInputType==="live_resin"||sub==="oil_live_resin"?0.95:
                  vapeInputType==="rosin"||sub==="oil_rosin"?0.93:0.97;
    const units=Math.floor(g*fillEff/pkgV);
    const unitL=sub==="disposable"?"AIOs":isOil?"oil units":"carts";
    return `~${units.toLocaleString()} × ${pkgL} ${unitL}${sepNote} (${(fillEff*100).toFixed(0)}% fill eff.)`;
  }
  if (cat==="tincture") {
    const botSizeML=parseFloat(tincBottleSize)||30;
    const mgPerMl=parseFloat(tincPotencyMgPerMl)||33;
    const potency=extractInputType==="rso"?0.60:extractInputType==="rosin"?0.55:(parseFloat(inputPotencyPct)/100||0.80);
    const totalMg=g*potency*1000;
    const totalMl=totalMg/mgPerMl;
    const bottles=Math.floor(totalMl/botSizeML*0.98);
    const mgPerBot=(botSizeML*mgPerMl).toFixed(0);
    return `~${totalMg.toFixed(0)}mg THC · ${totalMl.toFixed(0)}ml total · ${bottles.toLocaleString()} × ${botSizeML}ml (${mgPerBot}mg/bottle)`;
  }
  if (cat==="topical") {
    const oz=amt*(unit==="lbs"?16:unit==="kg"?35.274:0.035274);
    const units=Math.floor(oz/pkgV*0.97);
    return `~${oz.toFixed(1)} oz total · ${units.toLocaleString()} × ${pkgL} units`;
  }
  if (cat==="edible") {
    if (sub==="beverage") {
      const units=Math.floor(g/pkgV*0.97);
      return `~${g.toFixed(0)}ml · ${units.toLocaleString()} × ${pkgL} bottles`;
    }
    const potency=extractInputType==="rosin"?0.55:(parseFloat(inputPotencyPct)/100||0.80);
    const totalMg=g*potency*1000;
    const units=Math.floor(totalMg/pkgV*0.95);
    const src=extractInputType==="rosin"?"rosin ~55%":`${(potency*100).toFixed(0)}% THC`;
    return `~${totalMg.toFixed(0)}mg total (${src}) · ${units.toLocaleString()} × ${pkgL} units`;
  }
  return null;
}

// ── Date helpers ───────────────────────────────────────────────────────────
function dAdd(dt,n){const r=new Date(dt);r.setDate(r.getDate()+n);return r;}
function dDiff(a,b){return Math.round((new Date(b)-new Date(a))/86400000);}
function fmtS(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
function fmtF(dt){return new Date(dt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}
function buildTimeline(d,steps){let c=new Date(d+"T12:00:00");return steps.map(s=>{const s0=new Date(c),e=dAdd(c,s.days);c=e;return{name:s.n,days:s.days,start:s0,end:e};});}

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS=`
  .ps-wrap{padding:24px;flex:1;overflow-y:auto;}
  .ps-outer{overflow-x:auto;border:1px solid var(--border);border-radius:10px;margin-bottom:16px;}
  .ps-row{display:flex;border-bottom:1px solid var(--border);}
  .ps-row:last-child{border-bottom:none;}
  .ps-left{position:sticky;left:0;z-index:4;width:${LW}px;min-width:${LW}px;flex-shrink:0;
    background:var(--surface);border-right:1px solid var(--border);padding:10px 14px;
    display:flex;flex-direction:column;justify-content:center;gap:3px;box-sizing:border-box;}
  .ps-tl{position:relative;flex:1;}
  .ps-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;transition:opacity 0.15s;}
  .ps-btn:hover{opacity:0.85;}
  .ps-primary{background:var(--accent);color:#fff;font-size:12px;padding:7px 14px;}
  .ps-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);font-size:12px;padding:7px 14px;}
  .ps-sm{font-size:10px;padding:3px 8px;font-weight:600;border-radius:5px;}
  .ps-edit{background:rgba(74,124,89,0.15);color:var(--accent-2);border:1px solid var(--accent)!important;}
  .ps-del{background:rgba(200,74,74,0.1);color:var(--danger);border:1px solid rgba(200,74,74,0.3)!important;}
  .ps-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;
    color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:8px 10px;box-sizing:border-box;}
  .ps-inp:focus{outline:none;border-color:var(--accent);}
  .ps-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:4px;}
  .ps-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;
    color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:8px 10px;box-sizing:border-box;cursor:pointer;}
  .ps-sel:focus{outline:none;border-color:var(--accent);}
  .ps-days{width:50px;font-size:12px;padding:3px 6px;text-align:center;border-radius:4px;
    border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-family:monospace;}
  .ps-days:focus{outline:none;border-color:var(--accent);}
  .ps-exp{background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;
    color:var(--text-2);font-size:12px;font-weight:600;padding:7px 14px;cursor:pointer;font-family:'Inter',sans-serif;transition:border-color 0.15s;}
  .ps-exp:hover{border-color:var(--accent-2);color:var(--accent-2);}
  .ps-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;}
  .ps-tbl th{text-align:left;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;
    text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .ps-tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .ps-tbl tr:last-child td{border-bottom:none;}
  .sp{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .sp-a{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .sp-u{background:rgba(200,150,58,0.15);color:var(--amber);}
  .sp-c{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .ps-box{background:var(--surface-2);border-radius:8px;padding:12px 14px;margin-bottom:10px;}
  .ps-box-t{font-size:10px;font-weight:700;color:var(--text-2);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;}
  .ps-yield{background:rgba(74,124,89,0.15);border:1px solid var(--accent);border-radius:8px;padding:8px 12px;width:100%;box-sizing:border-box;}
  .cb-row{display:flex;flex-wrap:wrap;gap:6px;}
  .cb-pill{display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border-2);
    border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;color:var(--text-2);transition:all 0.15s;}
  .cb-pill.on{background:rgba(74,124,89,0.2);border-color:var(--accent);color:var(--accent-2);}
`;

const EMPTY={
  name:"",cat:"whole_flower",sub:"",strains:"",d:"",inputAmt:"",unit:"g",pkgIdx:3,steps:null,
  stemWastePct:"30",moistureLossPct:"2",fillWastePct:"3",
  coneWeight:"1",packSize:"5",inputMaterial:"flower",
  overfillG:"0.1",
  vapeInputType:"distillate",sauceSepMethod:"pour_off",
  extractInputType:"distillate",inputPotencyPct:"80",
  tincBottleSize:"30",tincPotencyMgPerMl:"33",
  kiefSift:false,kief40Pct:"12",kief100Pct:"8",
  cannabinoids:["THC"],
  s2s_barcode:"",actual_yield:"",
};

export default function ProductionScheduler() {
  const [batches,setBatches]=useState(()=>{try{return JSON.parse(localStorage.getItem("resinops_prod")||"[]");}catch{return [];}});
  const [form,setForm]=useState(EMPTY);
  const [formMode,setFormMode]=useState(null);
  const [editId,setEditId]=useState(null);
  const [formErr,setFormErr]=useState("");

  useEffect(()=>{localStorage.setItem("resinops_prod",JSON.stringify(batches));},[batches]);

  const today=new Date();
  const today0=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const pkgOpts=getPkg(form.cat,form.sub);
  const pkgIdx=Math.min(form.pkgIdx,pkgOpts.length-1);
  const pkgSel=pkgOpts[pkgIdx];
  const subOpts=SUBS[form.cat]||[];
  const formSteps=form.steps||(STEPS[getStepKey(form.cat,form.sub)]||[]).map(s=>({n:s.n,days:s.days}));
  const totalDays=formSteps.reduce((a,s)=>a+(parseInt(s.days)||0),0);
  const yieldEst=calcYield(form.cat,form.sub,form.inputAmt,form.unit,pkgSel?.v,pkgSel?.l,form);

  // ── KEY FIX: use functional updater, never recreate handlers ──────────────
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  const toggleCb=(cb)=>setForm(f=>({...f,cannabinoids:f.cannabinoids.includes(cb)?f.cannabinoids.filter(x=>x!==cb):[...f.cannabinoids,cb]}));

  function changeCat(cat){
    const sub=SUBS[cat]?.[0]?.v||"";
    const key=getStepKey(cat,sub);
    const steps=(STEPS[key]||[]).map(s=>({n:s.n,days:s.days}));
    setForm(f=>({...f,cat,sub,steps,pkgIdx:0}));
  }
  function changeSub(sub){
    const key=getStepKey(form.cat,sub);
    const steps=(STEPS[key]||[]).map(s=>({n:s.n,days:s.days}));
    setForm(f=>({...f,sub,steps,pkgIdx:0}));
  }
  function updateStep(i,v){setForm(f=>({...f,steps:formSteps.map((s,idx)=>idx===i?{...s,days:parseInt(v)||0}:s)}));}

  function openAdd(){
    const d=new Date().toISOString().split("T")[0];
    const steps=(STEPS["whole_flower"]||[]).map(s=>({n:s.n,days:s.days}));
    setForm({...EMPTY,d,steps});setFormMode("add");setFormErr("");
  }
  function openEdit(b){
    setForm({
      name:b.name,cat:b.cat,sub:b.sub||"",strains:b.strains||"",
      d:b.d,inputAmt:String(b.inputAmt||b.inputLbs||""),unit:b.unit||"g",pkgIdx:b.pkgIdx||0,
      steps:b.steps.map(s=>({n:s.n,days:s.days})),
      stemWastePct:String(b.stemWastePct||30),moistureLossPct:String(b.moistureLossPct||2),
      fillWastePct:String(b.fillWastePct||3),coneWeight:String(b.coneWeight||1),
      packSize:String(b.packSize||5),inputMaterial:b.inputMaterial||"flower",
      overfillG:String(b.overfillG||0.1),
      vapeInputType:b.vapeInputType||"distillate",sauceSepMethod:b.sauceSepMethod||"pour_off",
      extractInputType:b.extractInputType||"distillate",inputPotencyPct:String(b.inputPotencyPct||80),
      tincBottleSize:String(b.tincBottleSize||30),tincPotencyMgPerMl:String(b.tincPotencyMgPerMl||33),
      kiefSift:b.kiefSift||false,kief40Pct:String(b.kief40Pct||12),kief100Pct:String(b.kief100Pct||8),
      cannabinoids:b.cannabinoids||["THC"],
      s2s_barcode:b.s2s_barcode||"",actual_yield:b.actual_yield||"",
    });
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
    const batch={
      id:formMode==="edit"?editId:Date.now(),
      name:form.name.trim(),cat:form.cat,sub:form.sub,strains:form.strains.trim(),
      d:form.d,inputAmt:parseFloat(form.inputAmt),unit:form.unit,pkgIdx,steps,
      yieldEst,pkgLabel:pkgSel?.l,
      catLabel:CATS.find(c=>c.v===form.cat)?.l||form.cat,subLabel:sub?.l||"",
      stemWastePct:parseFloat(form.stemWastePct)||0,moistureLossPct:parseFloat(form.moistureLossPct)||0,
      fillWastePct:parseFloat(form.fillWastePct)||0,coneWeight:parseFloat(form.coneWeight)||1,
      packSize:parseInt(form.packSize)||5,inputMaterial:form.inputMaterial,
      overfillG:parseFloat(form.overfillG)||0,
      vapeInputType:form.vapeInputType,sauceSepMethod:form.sauceSepMethod,
      extractInputType:form.extractInputType,inputPotencyPct:parseFloat(form.inputPotencyPct)||80,
      tincBottleSize:parseFloat(form.tincBottleSize)||30,tincPotencyMgPerMl:parseFloat(form.tincPotencyMgPerMl)||33,
      kiefSift:form.kiefSift,kief40Pct:parseFloat(form.kief40Pct)||12,kief100Pct:parseFloat(form.kief100Pct)||8,
      cannabinoids:form.cannabinoids,
      s2s_barcode:form.s2s_barcode.trim(),actual_yield:form.actual_yield.trim(),
    };
    if(formMode==="edit")setBatches(p=>p.map(b=>b.id===editId?batch:b));
    else setBatches(p=>[...p,batch]);
    closeForm();
  }
  function removeBatch(id){setBatches(p=>p.filter(b=>b.id!==id));}

  const timelines=batches.map(b=>buildTimeline(b.d,b.steps));

  function exportProd(){
    if(!batches.length)return;
    const date=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    const rows=batches.map((b,idx)=>{
      const tl=timelines[idx];const end=tl[tl.length-1]?.end;
      const stepRows=tl.map(s=>'<tr><td style="padding:4px 14px 4px 0;color:#555;font-size:13px;white-space:nowrap;">'+s.name+'</td><td style="padding:4px 14px 4px 0;font-size:13px;color:#1a1a1a;">'+fmtF(s.start)+' \u2192 '+fmtF(s.end)+'</td><td style="padding:4px 0;font-size:13px;color:#666;">'+s.days+' days</td></tr>').join("");
      return '<div style="margin-bottom:32px;page-break-inside:avoid;"><div style="background:#f6faf7;border-left:4px solid #2d5a3d;padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;"><h2 style="font-size:16px;font-weight:700;color:#1a1a1a;margin:0 0 3px;">'+b.name+'</h2><p style="font-size:13px;color:#444;margin:0;">'+b.catLabel+(b.subLabel?' \u2014 '+b.subLabel:'')+(b.strains?' &nbsp;\u00b7&nbsp; '+b.strains:'')+'&nbsp;\u00b7&nbsp;'+b.inputAmt+' '+b.unit+' input'+(b.s2s_barcode?' &nbsp;\u00b7&nbsp; S2S: '+b.s2s_barcode:'')+'</p></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;"><div><h3 style="font-size:11px;font-weight:700;color:#2d5a3d;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Steps</h3><table style="border-collapse:collapse;">'+stepRows+'</table></div><div><h3 style="font-size:11px;font-weight:700;color:#2d5a3d;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Summary</h3><table style="border-collapse:collapse;"><tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Start</td><td style="padding:3px 0;font-size:13px;">'+fmtF(new Date(b.d+'T12:00:00'))+'</td></tr><tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Completion</td><td style="padding:3px 0;font-size:13px;">'+(end?fmtF(end):'—')+'</td></tr><tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Est. output</td><td style="padding:3px 0;font-size:13px;">'+(b.yieldEst||'—')+'</td></tr><tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Actual yield</td><td style="padding:3px 0;font-size:13px;">'+(b.actual_yield||'—')+'</td></tr>'+(b.cannabinoids?.length?'<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Cannabinoids</td><td style="padding:3px 0;font-size:13px;">'+b.cannabinoids.join(', ')+'</td></tr>':'')+'</table></div></div></div>';
    }).join('<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">');
    const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ResinOps Production Schedule</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.6;}h1{font-size:22px;color:#2d5a3d;margin:0 0 4px;}.meta{font-size:13px;color:#666;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid #e0e0e0;}@media print{body{margin:24px;}}</style></head><body><h1>ResinOps \u2014 Production Schedule</h1><div class="meta">Exported '+date+' &nbsp;\u00b7&nbsp; '+batches.length+' batch'+(batches.length>1?'es':'')+'<br><small>Ctrl+P \u2192 Save as PDF &nbsp;|&nbsp; File \u2192 Open in Word</small></div>'+rows+'</body></html>';
    const blob=new Blob([html],{type:"text/html"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="ResinOps-Production-"+new Date().toISOString().slice(0,10)+".html";
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  }

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

  // Cannabinoid picker (used for tincture, edible, topical)
  const showCb=["tincture","edible","topical"].includes(form.cat);
  // Show vape oil sauce sep option
  const isVapeOil=form.sub==="oil_rosin"||form.sub==="oil_live_resin";

  return(
    <>
      <style>{CSS}</style>
      <div className="ps-wrap">
        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Production Scheduler</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Track every batch from intake to live inventory</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {hasBatches&&<button className="ps-exp" onClick={exportProd}>↓ Export schedule</button>}
            {!formMode&&<button className="ps-btn ps-primary" onClick={openAdd}>+ Add Batch</button>}
          </div>
        </div>

        {/* ── FORM (inlined — no sub-component, fixes the input focus bug) ── */}
        {formMode && (
          <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:10,padding:18,marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>
              {formMode==="edit"?"Edit Batch":"New Production Batch"}
            </div>

            {/* Row 1: name, category */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label className="ps-lbl">Batch name</label>
                <input className="ps-inp" placeholder="Batch 2026-001" value={form.name} onChange={e=>setF("name",e.target.value)} />
              </div>
              <div>
                <label className="ps-lbl">Product category</label>
                <select className="ps-sel" value={form.cat} onChange={e=>changeCat(e.target.value)}>
                  {CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              {subOpts.length>0&&<div>
                <label className="ps-lbl">Product type</label>
                <select className="ps-sel" value={form.sub} onChange={e=>changeSub(e.target.value)}>
                  {subOpts.map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>}
              <div>
                <label className="ps-lbl">Strain(s) — comma-separate blends</label>
                <input className="ps-inp" placeholder="Blue Dream, OG Kush" value={form.strains} onChange={e=>setF("strains",e.target.value)} />
              </div>
              <div>
                <label className="ps-lbl">Batch start date</label>
                <input type="date" className="ps-inp" value={form.d} onChange={e=>setF("d",e.target.value)} />
              </div>
              <div>
                <label className="ps-lbl">{getInputLabel(form.cat)}</label>
                <div style={{display:"flex",gap:6}}>
                  <input type="number" min="0" step="0.1" className="ps-inp" placeholder="1000"
                    value={form.inputAmt} onChange={e=>setF("inputAmt",e.target.value)} style={{flex:1}} />
                  <select className="ps-sel" value={form.unit} onChange={e=>setF("unit",e.target.value)} style={{width:64}}>
                    <option value="g">g</option>
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="ps-lbl">Package / unit size</label>
                <select className="ps-sel" value={pkgIdx} onChange={e=>setF("pkgIdx",parseInt(e.target.value))}>
                  {pkgOpts.map((p,i)=><option key={i} value={i}>{p.l}</option>)}
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center"}}>
                {yieldEst?(<div className="ps-yield">
                  <div style={{fontSize:10,color:"var(--accent-2)",fontWeight:700,marginBottom:2,letterSpacing:"0.06em",textTransform:"uppercase"}}>Estimated Output</div>
                  <div style={{fontSize:11,fontWeight:600,color:"var(--accent-2)",lineHeight:1.5}}>{yieldEst}</div>
                </div>):<div style={{fontSize:12,color:"var(--text-3)"}}>Enter input quantity to see yield estimate</div>}
              </div>
            </div>

            {/* Whole flower overfill */}
            {form.cat==="whole_flower"&&<div className="ps-box">
              <div className="ps-box-t">Overfill Variance per Unit</div>
              <div style={{maxWidth:240}}>
                <label className="ps-lbl">Grams overfill per unit (e.g. 0.1)</label>
                <input type="number" min="0" max="2" step="0.05" className="ps-inp"
                  value={form.overfillG} onChange={e=>setF("overfillG",e.target.value)} />
              </div>
            </div>}

            {/* Pre-roll specific */}
            {form.cat==="pre_roll"&&<div className="ps-box">
              <div className="ps-box-t">Pre-Roll — Input, Waste & Pack Settings</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Input material</label>
                  <select className="ps-sel" value={form.inputMaterial} onChange={e=>setF("inputMaterial",e.target.value)}>
                    <option value="flower">Whole / Ground Flower</option>
                    <option value="trim">Trim</option>
                  </select>
                </div>
                <div>
                  <label className="ps-lbl">Cone weight (g)</label>
                  <input type="number" min="0.1" max="5" step="0.1" className="ps-inp"
                    value={form.coneWeight} onChange={e=>setF("coneWeight",e.target.value)} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Stem waste %</label>
                  <input type="number" min="0" max="60" step="1" className="ps-inp"
                    value={form.stemWastePct} onChange={e=>setF("stemWastePct",e.target.value)} />
                </div>
                <div>
                  <label className="ps-lbl">Moisture loss %</label>
                  <input type="number" min="0" max="10" step="0.5" className="ps-inp"
                    value={form.moistureLossPct} onChange={e=>setF("moistureLossPct",e.target.value)} />
                </div>
                <div>
                  <label className="ps-lbl">Fill waste %</label>
                  <input type="number" min="0" max="20" step="0.5" className="ps-inp"
                    value={form.fillWastePct} onChange={e=>setF("fillWastePct",e.target.value)} />
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Units per pack</label>
                  <input type="number" min="1" max="100" step="1" className="ps-inp"
                    value={form.packSize} onChange={e=>setF("packSize",e.target.value)} />
                </div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                <input type="checkbox" checked={form.kiefSift} onChange={e=>setF("kiefSift",e.target.checked)} />
                Include kief sifting from stem material
              </label>
              {form.kiefSift&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
                <div>
                  <label className="ps-lbl">40-mesh kief % of stem material</label>
                  <input type="number" min="0" max="30" step="0.5" className="ps-inp"
                    value={form.kief40Pct} onChange={e=>setF("kief40Pct",e.target.value)} />
                </div>
                <div>
                  <label className="ps-lbl">100-mesh kief % of stem material</label>
                  <input type="number" min="0" max="20" step="0.5" className="ps-inp"
                    value={form.kief100Pct} onChange={e=>setF("kief100Pct",e.target.value)} />
                </div>
              </div>}
            </div>}

            {/* Ground flower specific */}
            {form.cat==="ground_flower"&&<div className="ps-box">
              <div className="ps-box-t">Ground Flower — Waste Factors</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Stem waste %</label>
                  <input type="number" min="0" max="60" step="1" className="ps-inp"
                    value={form.stemWastePct} onChange={e=>setF("stemWastePct",e.target.value)} />
                </div>
                <div>
                  <label className="ps-lbl">Moisture loss %</label>
                  <input type="number" min="0" max="10" step="0.5" className="ps-inp"
                    value={form.moistureLossPct} onChange={e=>setF("moistureLossPct",e.target.value)} />
                </div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,color:"var(--text-2)"}}>
                <input type="checkbox" checked={form.kiefSift} onChange={e=>setF("kiefSift",e.target.checked)} />
                Include kief sifting from stem material
              </label>
              {form.kiefSift&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
                <div>
                  <label className="ps-lbl">40-mesh kief %</label>
                  <input type="number" min="0" max="30" step="0.5" className="ps-inp"
                    value={form.kief40Pct} onChange={e=>setF("kief40Pct",e.target.value)} />
                </div>
                <div>
                  <label className="ps-lbl">100-mesh kief %</label>
                  <input type="number" min="0" max="20" step="0.5" className="ps-inp"
                    value={form.kief100Pct} onChange={e=>setF("kief100Pct",e.target.value)} />
                </div>
              </div>}
            </div>}

            {/* Vape input / sauce sep */}
            {form.cat==="vape"&&<div className="ps-box">
              <div className="ps-box-t">Vape — Input Material{isVapeOil?" & Separation Method":""}</div>
              <div style={{display:"grid",gridTemplateColumns:isVapeOil?"1fr 1fr":"1fr",gap:10}}>
                {!isVapeOil&&<div>
                  <label className="ps-lbl">Input material type</label>
                  <select className="ps-sel" value={form.vapeInputType} onChange={e=>setF("vapeInputType",e.target.value)}>
                    <option value="distillate">Distillate</option>
                    <option value="live_resin">Live Resin</option>
                    <option value="rosin">Rosin</option>
                  </select>
                </div>}
                {isVapeOil&&<div>
                  <label className="ps-lbl">Sauce separation method</label>
                  <select className="ps-sel" value={form.sauceSepMethod} onChange={e=>setF("sauceSepMethod",e.target.value)}>
                    <option value="pour_off">Pour Off</option>
                    <option value="centrifuge">Centrifuge</option>
                  </select>
                </div>}
              </div>
            </div>}

            {/* Tincture */}
            {form.cat==="tincture"&&<div className="ps-box">
              <div className="ps-box-t">Tincture — Extract, Potency & Format</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div>
                  <label className="ps-lbl">Extract type</label>
                  <select className="ps-sel" value={form.extractInputType} onChange={e=>setF("extractInputType",e.target.value)}>
                    <option value="distillate">Distillate</option>
                    <option value="rosin">Rosin</option>
                    <option value="rso">RSO (Rick Simpson Oil)</option>
                  </select>
                </div>
                <div>
                  <label className="ps-lbl">Input potency % THC {form.extractInputType!=="distillate"?"(auto-set)":""}</label>
                  <input type="number" min="1" max="100" className="ps-inp"
                    value={form.extractInputType==="rosin"?"55":form.extractInputType==="rso"?"60":form.inputPotencyPct}
                    disabled={form.extractInputType!=="distillate"}
                    onChange={e=>setF("inputPotencyPct",e.target.value)} />
                </div>
                <div>
                  <label className="ps-lbl">Bottle size (ml)</label>
                  <select className="ps-sel" value={form.tincBottleSize} onChange={e=>setF("tincBottleSize",e.target.value)}>
                    {["15","30","60"].map(v=><option key={v} value={v}>{v}ml</option>)}
                  </select>
                </div>
                <div>
                  <label className="ps-lbl">Target potency (mg/ml)</label>
                  <select className="ps-sel" value={form.tincPotencyMgPerMl} onChange={e=>setF("tincPotencyMgPerMl",e.target.value)}>
                    {["10","25","33","50","100"].map(v=><option key={v} value={v}>{v} mg/ml ({Number(v)*30}mg per 30ml)</option>)}
                  </select>
                </div>
              </div>
            </div>}

            {/* Edible input type */}
            {form.cat==="edible"&&form.sub!=="beverage"&&<div className="ps-box">
              <div className="ps-box-t">Edible — Extract Input</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label className="ps-lbl">Extract type</label>
                  <select className="ps-sel" value={form.extractInputType} onChange={e=>setF("extractInputType",e.target.value)}>
                    <option value="distillate">Distillate</option>
                    <option value="rosin">Rosin</option>
                  </select>
                </div>
                <div>
                  <label className="ps-lbl">Input potency % THC</label>
                  <input type="number" min="1" max="100" className="ps-inp"
                    value={form.extractInputType==="rosin"?"55":form.inputPotencyPct}
                    disabled={form.extractInputType==="rosin"}
                    onChange={e=>setF("inputPotencyPct",e.target.value)} />
                </div>
              </div>
            </div>}

            {/* Cannabinoid selector */}
            {showCb&&<div className="ps-box">
              <div className="ps-box-t">Cannabinoid Profile</div>
              <div className="cb-row">
                {CANNABINOIDS.map(cb=>(
                  <div key={cb} className={"cb-pill"+(form.cannabinoids.includes(cb)?" on":"")}
                    onClick={()=>toggleCb(cb)}>
                    <span>{cb}</span>
                  </div>
                ))}
              </div>
            </div>}

            {/* Steps */}
            <div className="ps-box">
              <div className="ps-box-t">Production Steps — {totalDays} days total</div>
              <div style={{display:"grid",gap:6}}>
                {formSteps.map((s,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:2,background:SBG[s.n]||"#333",border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}} />
                    <span style={{fontSize:12,color:"var(--text-2)",flex:1,minWidth:0}}>{s.n}</span>
                    <input className="ps-days" type="number" min="1" max="365" value={s.days}
                      onChange={e=>updateStep(i,e.target.value)} />
                    <span style={{fontSize:11,color:"var(--text-3)",width:28}}>days</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <label className="ps-lbl">S2S / METRC Tag</label>
                <input className="ps-inp" placeholder="1A400000000000000000000"
                  value={form.s2s_barcode} onChange={e=>setF("s2s_barcode",e.target.value)} />
              </div>
              <div>
                <label className="ps-lbl">Actual yield — enter after completion</label>
                <input className="ps-inp" placeholder="e.g. 1,180 units / 32.4g"
                  value={form.actual_yield} onChange={e=>setF("actual_yield",e.target.value)} />
              </div>
            </div>

            {formErr&&<div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{formErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button className="ps-btn ps-primary" onClick={saveBatch}>
                {formMode==="edit"?"Save Changes":"Add Batch"}
              </button>
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
              <div className="ps-left" style={{height:HH,background:"var(--surface-2)"}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--text-2)",letterSpacing:"0.08em",textTransform:"uppercase"}}>Batch</span>
              </div>
              <div className="ps-tl" style={{minWidth:twPx,height:HH,overflow:"hidden"}}>
                {months.map((m,i)=>(
                  <div key={i} style={{position:"absolute",left:m.x,top:0,width:m.w,height:24,borderRight:"1px solid var(--border)",padding:"0 8px",display:"flex",alignItems:"center",overflow:"hidden"}}>
                    <span style={{fontSize:11,fontWeight:600,color:"var(--text-2)",whiteSpace:"nowrap"}}>{m.label}</span>
                  </div>
                ))}
                {weeks.map((w,i)=>(
                  <div key={i} style={{position:"absolute",left:w.x,top:24,bottom:0,borderLeft:"1px solid var(--border)",paddingLeft:4,display:"flex",flexDirection:"column",justifyContent:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",lineHeight:1.2}}>W{w.wn}</div>
                    <div style={{fontSize:9,color:"var(--text-3)",lineHeight:1.2}}>{w.date}</div>
                  </div>
                ))}
              </div>
            </div>
            {batches.map((b,idx)=>{
              const tl=timelines[idx];
              const sub=SUBS[b.cat]?.find(s=>s.v===b.sub);
              return(
                <div key={b.id} className="ps-row" style={{height:RH}}>
                  <div className="ps-left" style={{height:RH}}>
                    <div style={{fontSize:12,fontWeight:600,color:"var(--text)",wordBreak:"break-word",lineHeight:1.3}}>{b.name}</div>
                    <div style={{fontSize:11,color:"var(--text-2)",lineHeight:1.3}}>{b.catLabel}{sub?" — "+sub.l:""}</div>
                    {b.strains&&<div style={{fontSize:10,color:"var(--text-3)",lineHeight:1.3}}>{b.strains}</div>}
                    <div style={{fontSize:10,color:"var(--text-3)"}}>{b.inputAmt}{b.unit} → {b.yieldEst||"—"}</div>
                    {b.s2s_barcode&&<div style={{fontSize:9,color:"var(--text-3)",fontFamily:"monospace"}}>{b.s2s_barcode}</div>}
                    <div style={{display:"flex",gap:6,marginTop:5}}>
                      <button className="ps-btn ps-sm ps-edit" onClick={()=>openEdit(b)}>Edit</button>
                      <button className="ps-btn ps-sm ps-del" onClick={()=>removeBatch(b.id)}>✕</button>
                    </div>
                  </div>
                  <div className="ps-tl" style={{minWidth:twPx,height:RH}}>
                    {weeks.map((w,i)=>(<div key={i} style={{position:"absolute",left:w.x,top:0,bottom:0,width:1,background:"var(--border)",opacity:0.4}} />))}
                    {tl.map((step,si)=>{
                      const x=dDiff(gStart,step.start)*PX;const w=Math.max(dDiff(step.start,step.end)*PX,2);
                      return(
                        <div key={si} title={step.name+" — "+fmtF(step.start)+" \u2192 "+fmtF(step.end)+" ("+step.days+" days)"}
                          style={{position:"absolute",left:x,top:12,width:w,height:RH-24,background:SBG[step.name]||"#333",
                            borderRadius:si===0?"5px 0 0 5px":si===tl.length-1?"0 5px 5px 0":"0",
                            borderRight:si<tl.length-1?"1px solid rgba(0,0,0,0.25)":"none",
                            display:"flex",alignItems:"center",overflow:"hidden",padding:"0 6px"}}>
                          {w>30&&<span style={{fontSize:9,fontWeight:700,color:SFG[step.name]||"#fff",whiteSpace:"nowrap",letterSpacing:"0.03em"}}>{step.name}</span>}
                        </div>
                      );
                    })}
                    {todayOff>=0&&todayOff<=total&&<div style={{position:"absolute",left:todayOff*PX,top:0,bottom:0,width:2,background:"var(--danger)",zIndex:3,opacity:0.9}} title="Today" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",marginBottom:20}}>
            {Object.entries(SBG).map(([name,bg])=>(
              <div key={name} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:12,height:10,borderRadius:2,background:bg,border:"1px solid rgba(255,255,255,0.12)"}} />
                <span style={{fontSize:10,color:"var(--text-3)"}}>{name}</span>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:2,height:12,background:"var(--danger)",borderRadius:1}} />
              <span style={{fontSize:10,color:"var(--text-3)"}}>Today</span>
            </div>
          </div>

          <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:8}}>Batch Summary</div>
          <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:10}}>
            <table className="ps-tbl">
              <thead>
                <tr>
                  <th>Batch</th><th>Product</th><th>Strains</th><th>Input</th>
                  <th>Est. Output</th><th>Actual Yield</th>
                  <th>Cannabinoids</th><th>Start</th><th>Completion</th>
                  <th>S2S Tag</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b,idx)=>{
                  const tl=timelines[idx];const end=tl[tl.length-1]?.end;
                  const st=batchStatus(b,tl);const sub=SUBS[b.cat]?.find(s=>s.v===b.sub);
                  return(
                    <tr key={b.id}>
                      <td style={{color:"var(--text)",fontWeight:500,whiteSpace:"nowrap"}}>{b.name}</td>
                      <td style={{whiteSpace:"nowrap"}}>{b.catLabel}{sub?" — "+sub.l:""}</td>
                      <td>{b.strains||"—"}</td>
                      <td style={{whiteSpace:"nowrap"}}>{b.inputAmt}{b.unit}</td>
                      <td style={{fontSize:11}}>{b.yieldEst||"—"}</td>
                      <td style={{fontSize:11,color:b.actual_yield?"var(--accent-2)":"var(--text-3)"}}>{b.actual_yield||"—"}</td>
                      <td style={{fontSize:10}}>{b.cannabinoids?.join(", ")||"—"}</td>
                      <td style={{whiteSpace:"nowrap"}}>{fmtS(new Date(b.d+"T12:00:00"))}</td>
                      <td style={{whiteSpace:"nowrap"}}>{end?fmtS(end):"—"}</td>
                      <td style={{fontFamily:"monospace",fontSize:10}}>{b.s2s_barcode||"—"}</td>
                      <td><span className={"sp "+st.cls}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </>
  );
}
