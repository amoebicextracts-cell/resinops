import { useState, useEffect } from "react";

const LW = 280, RH = 92, HH = 56, PX = 11, LBS_TO_G = 453.592;

// ── Step colors (bg / text) ────────────────────────────────────────────────
const SBG = {
  "Intake / Prep":     "#1e3248", "Drying":            "#1e4420",
  "Bucking":           "#2e5010", "Trimming":          "#3a5e14",
  "Curing":            "#143810", "Grinding":          "#504810",
  "Rolling / Filling": "#583c0e", "Extraction":        "#582208",
  "Pressing":          "#4a2008", "Washing":           "#143848",
  "Lyophilization":    "#0e2848", "Purge / Process":   "#3e1414",
  "Winterization":     "#221438", "Decarb":            "#481c0e",
  "Distillation":      "#200e48", "Formulation":       "#0e3848",
  "Production":        "#104038", "Dose QC":           "#0e2838",
  "QC / Testing":      "#0a1848", "Packaging":         "#2e0e48",
  "Inventory":         "#0e3030",
};
const SFG = {
  "Intake / Prep":     "#90c0f0", "Drying":            "#90f0a0",
  "Bucking":           "#b0e080", "Trimming":          "#c0f090",
  "Curing":            "#80d080", "Grinding":          "#f0e060",
  "Rolling / Filling": "#f0b860", "Extraction":        "#f8a870",
  "Pressing":          "#f09870", "Washing":           "#80d0f0",
  "Lyophilization":    "#78b0f0", "Purge / Process":   "#f09090",
  "Winterization":     "#b090f8", "Decarb":            "#f0a870",
  "Distillation":      "#c090ff", "Formulation":       "#70d0f0",
  "Production":        "#70e0c8", "Dose QC":           "#80c0f0",
  "QC / Testing":      "#7090f8", "Packaging":         "#c080f8",
  "Inventory":         "#70d0d0",
};

// ── Product catalog ────────────────────────────────────────────────────────
const CATS = [
  { v: "whole_flower",  l: "Whole Flower" },
  { v: "ground_flower", l: "Ground Flower" },
  { v: "pre_roll",      l: "Pre-Roll" },
  { v: "extract",       l: "Extract / Concentrate" },
  { v: "vape",          l: "Vape" },
  { v: "tincture",      l: "Tincture" },
  { v: "topical",       l: "Topical" },
  { v: "edible",        l: "Edible" },
];

const SUBS = {
  extract: [
    { v: "shatter",    l: "BHO — Shatter / Wax" },
    { v: "badder",     l: "BHO — Badder / Budder" },
    { v: "live_resin", l: "BHO — Live Resin" },
    { v: "sugar",      l: "BHO — Sugar" },
    { v: "diamonds",   l: "BHO — Diamonds & Sauce" },
    { v: "rosin_fl",   l: "Rosin — Flower Press" },
    { v: "rosin_hash", l: "Rosin — Hash Press" },
    { v: "hash",       l: "Ice Water Hash" },
    { v: "co2",        l: "CO2 Extract" },
    { v: "distillate", l: "Distillate" },
  ],
  vape: [
    { v: "cartridge",  l: "Cartridge" },
    { v: "disposable", l: "Disposable" },
  ],
  edible: [
    { v: "gummies",    l: "Gummies" },
    { v: "chocolate",  l: "Chocolate" },
    { v: "capsules",   l: "Capsules" },
    { v: "beverage",   l: "Beverage" },
    { v: "other",      l: "Other" },
  ],
};

// ── Steps by product type ──────────────────────────────────────────────────
const STEPS = {
  whole_flower:  [{ n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:3},{n:"Curing",days:21},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  ground_flower: [{ n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:14},{n:"Grinding",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  pre_roll:      [{ n:"Drying",days:12},{n:"Bucking",days:2},{n:"Trimming",days:2},{n:"Curing",days:14},{n:"Grinding",days:1},{n:"Rolling / Filling",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
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
  cartridge:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  disposable:    [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  tincture:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  topical:       [{n:"Intake / Prep",days:1},{n:"Formulation",days:3},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  gummies:       [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:2},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  chocolate:     [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:3},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  capsules:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:1},{n:"Production",days:2},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  beverage:      [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:2},{n:"Dose QC",days:1},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
  other:         [{n:"Intake / Prep",days:1},{n:"Formulation",days:2},{n:"Production",days:3},{n:"QC / Testing",days:10},{n:"Packaging",days:2},{n:"Inventory",days:1}],
};

// Package size options {l: label, v: numeric value for calc}
const PKG_OPTS = {
  whole_flower:  [{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7},{l:"14g",v:14},{l:"28g",v:28}],
  ground_flower: [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7}],
  pre_roll:      [{l:"0.5g cone",v:0.5},{l:"0.75g cone",v:0.75},{l:"1g cone",v:1},{l:"1.5g cone",v:1.5},{l:"2g cone",v:2}],
  extract_solid: [{l:"0.5g",v:0.5},{l:"1g",v:1},{l:"2g",v:2},{l:"3.5g",v:3.5},{l:"7g",v:7}],
  extract_bulk:  [{l:"bulk grams",v:1}],
  vape:          [{l:"0.5g",v:0.5},{l:"1g",v:1}],
  tincture:      [{l:"15ml",v:15},{l:"30ml",v:30},{l:"60ml",v:60}],
  topical:       [{l:"1 oz",v:1},{l:"2 oz",v:2},{l:"4 oz",v:4}],
  edible_dose:   [{l:"2.5mg",v:2.5},{l:"5mg",v:5},{l:"10mg",v:10},{l:"25mg",v:25},{l:"50mg",v:50}],
  beverage:      [{l:"100ml",v:100},{l:"200ml",v:200},{l:"355ml",v:355}],
};

function getPkgOpts(cat, sub) {
  if (cat === "whole_flower") return PKG_OPTS.whole_flower;
  if (cat === "ground_flower") return PKG_OPTS.ground_flower;
  if (cat === "pre_roll") return PKG_OPTS.pre_roll;
  if (cat === "extract") return sub === "distillate" ? PKG_OPTS.extract_bulk : PKG_OPTS.extract_solid;
  if (cat === "vape") return PKG_OPTS.vape;
  if (cat === "tincture") return PKG_OPTS.tincture;
  if (cat === "topical") return PKG_OPTS.topical;
  if (cat === "edible") return sub === "beverage" ? PKG_OPTS.beverage : PKG_OPTS.edible_dose;
  return [{l:"unit",v:1}];
}

function getStepKey(cat, sub) {
  if (["whole_flower","ground_flower","pre_roll","tincture","topical"].includes(cat)) return cat;
  if (cat === "extract") return sub || "shatter";
  if (cat === "vape") return sub || "cartridge";
  if (cat === "edible") return sub || "gummies";
  return cat;
}

function getInputLabel(cat) {
  const map = {
    whole_flower: "Input — wet flower (lbs)", ground_flower: "Input — dry flower (lbs)",
    pre_roll: "Input — dry flower (lbs)", extract: "Input — biomass / trim (lbs)",
    vape: "Input — oil / distillate (lbs)", tincture: "Input — extract (lbs)",
    topical: "Batch size (lbs)", edible: "Input — distillate (lbs)",
  };
  return map[cat] || "Input (lbs)";
}

function calcYield(cat, sub, inputLbs, pkgV, pkgL) {
  const lbs = parseFloat(inputLbs);
  if (!lbs || lbs <= 0) return null;
  const g = lbs * LBS_TO_G;
  let out = "";

  if (cat === "whole_flower") {
    const dry = g * 0.27;
    const units = Math.floor(dry / pkgV * 0.95);
    out = `~${dry.toFixed(0)}g dry flower  ·  ${units.toLocaleString()} × ${pkgL} units`;
  } else if (cat === "ground_flower") {
    const outG = g * 0.97;
    const units = Math.floor(outG / pkgV * 0.98);
    out = `~${outG.toFixed(0)}g  ·  ${units.toLocaleString()} × ${pkgL} units`;
  } else if (cat === "pre_roll") {
    const units = Math.floor(g * 0.90 / pkgV);
    out = `~${units.toLocaleString()} × ${pkgL} pre-rolls`;
  } else if (cat === "extract") {
    const yld = {shatter:0.15,badder:0.15,live_resin:0.10,sugar:0.15,diamonds:0.08,rosin_fl:0.15,rosin_hash:0.60,hash:0.05,co2:0.10,distillate:0.70}[sub] || 0.15;
    const outG = g * yld;
    const units = Math.floor(outG / pkgV * 0.97);
    out = `~${outG.toFixed(1)}g extract  ·  ${units.toLocaleString()} × ${pkgL} units`;
  } else if (cat === "vape") {
    const units = Math.floor(g * 0.97 / pkgV);
    out = `~${units.toLocaleString()} × ${pkgL} ${sub === "disposable" ? "disposables" : "cartridges"}`;
  } else if (cat === "tincture") {
    const ml = g * 10;
    const units = Math.floor(ml / pkgV * 0.98);
    out = `~${ml.toFixed(0)}ml total  ·  ${units.toLocaleString()} × ${pkgL} bottles`;
  } else if (cat === "topical") {
    const oz = lbs * 16;
    const units = Math.floor(oz / pkgV * 0.97);
    out = `~${oz.toFixed(1)} oz total  ·  ${units.toLocaleString()} × ${pkgL} units`;
  } else if (cat === "edible") {
    if (sub === "beverage") {
      const ml = g;
      const units = Math.floor(ml / pkgV * 0.97);
      out = `~${ml.toFixed(0)}ml  ·  ${units.toLocaleString()} × ${pkgL} bottles`;
    } else {
      const totalMg = g * 0.80 * 1000;
      const units = Math.floor(totalMg / pkgV * 0.95);
      out = `~${totalMg.toFixed(0)}mg total THC  ·  ${units.toLocaleString()} × ${pkgL} units`;
    }
  }
  return out || null;
}

// ── Date helpers ───────────────────────────────────────────────────────────
function dAdd(dt, n) { const r = new Date(dt); r.setDate(r.getDate() + n); return r; }
function dDiff(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function fmtS(dt) { return new Date(dt).toLocaleDateString("en-US", {month:"short",day:"numeric"}); }
function fmtF(dt) { return new Date(dt).toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"}); }

function buildTimeline(startDate, steps) {
  let cur = new Date(startDate + "T12:00:00");
  return steps.map(s => {
    const start = new Date(cur);
    const end = dAdd(cur, s.days);
    cur = end;
    return { name: s.n, days: s.days, start, end };
  });
}

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
  .ps-wrap { padding: 24px; flex: 1; overflow-y: auto; }
  .ps-outer { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 16px; }
  .ps-row { display: flex; border-bottom: 1px solid var(--border); }
  .ps-row:last-child { border-bottom: none; }
  .ps-left {
    position: sticky; left: 0; z-index: 4; width: ${LW}px; min-width: ${LW}px;
    flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border);
    padding: 10px 14px; display: flex; flex-direction: column;
    justify-content: center; gap: 3px; box-sizing: border-box;
  }
  .ps-tl { position: relative; flex: 1; }
  .ps-spill { font-size: 8px; font-weight: 700; padding: 2px 4px; border-radius: 3px;
    color: #fff; white-space: nowrap; font-family: monospace; line-height: 1.4; cursor: default; }
  .ps-btn { border: none; border-radius: 8px; cursor: pointer; font-family: 'Inter',sans-serif;
    font-weight: 600; transition: opacity 0.15s; }
  .ps-btn:hover { opacity: 0.85; }
  .ps-primary { background: var(--accent); color: #fff; font-size: 12px; padding: 7px 14px; }
  .ps-secondary { background: var(--surface-2); border: 1px solid var(--border-2) !important;
    color: var(--text-2); font-size: 12px; padding: 7px 14px; }
  .ps-sm { font-size: 10px; padding: 3px 8px; font-weight: 600; border-radius: 5px; }
  .ps-edit { background: rgba(74,124,89,0.15); color: var(--accent-2); border: 1px solid var(--accent) !important; }
  .ps-del { background: rgba(200,74,74,0.1); color: var(--danger); border: 1px solid rgba(200,74,74,0.3) !important; }
  .ps-inp { width: 100%; background: var(--surface-2); border: 1px solid var(--border-2);
    border-radius: 8px; color: var(--text); font-family: 'Inter',sans-serif;
    font-size: 13px; padding: 8px 10px; box-sizing: border-box; }
  .ps-inp:focus { outline: none; border-color: var(--accent); }
  .ps-lbl { font-size: 11px; color: var(--text-2); display: block; margin-bottom: 4px; }
  .ps-select { width: 100%; background: var(--surface-2); border: 1px solid var(--border-2);
    border-radius: 8px; color: var(--text); font-family: 'Inter',sans-serif;
    font-size: 13px; padding: 8px 10px; box-sizing: border-box; cursor: pointer; }
  .ps-select:focus { outline: none; border-color: var(--accent); }
  .ps-days-inp { width: 50px; font-size: 12px; padding: 3px 6px; text-align: center;
    border-radius: 4px; border: 1px solid var(--border-2); background: var(--surface-2);
    color: var(--text); font-family: monospace; }
  .ps-days-inp:focus { outline: none; border-color: var(--accent); }
  .ps-exp { background: var(--surface-2); border: 1px solid var(--border-2); border-radius: 8px;
    color: var(--text-2); font-size: 12px; font-weight: 600; padding: 7px 14px; cursor: pointer;
    font-family: 'Inter',sans-serif; transition: border-color 0.15s; }
  .ps-exp:hover { border-color: var(--accent-2); color: var(--accent-2); }
  .ps-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
  .ps-table th { text-align: left; padding: 8px 10px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3);
    border-bottom: 1px solid var(--border); background: var(--surface-2); }
  .ps-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); color: var(--text-2);
    vertical-align: middle; }
  .ps-table tr:last-child td { border-bottom: none; }
  .status-pill { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .status-active { background: rgba(74,124,89,0.2); color: var(--accent-2); }
  .status-upcoming { background: rgba(200,150,58,0.15); color: var(--amber); }
  .status-complete { background: rgba(100,100,100,0.15); color: var(--text-3); }
`;

const EMPTY = { name:"", cat:"whole_flower", sub:"", strains:"", d:"", inputLbs:"", pkgIdx:2, steps:null };

export default function ProductionScheduler() {
  const [batches, setBatches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("resinops_prod") || "[]"); }
    catch { return []; }
  });
  const [form, setForm]       = useState(EMPTY);
  const [formMode, setFormMode] = useState(null);
  const [editId, setEditId]   = useState(null);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    localStorage.setItem("resinops_prod", JSON.stringify(batches));
  }, [batches]);

  const today = new Date();
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Derived form values
  const pkgOpts  = getPkgOpts(form.cat, form.sub);
  const pkgIdx   = Math.min(form.pkgIdx, pkgOpts.length - 1);
  const pkgSel   = pkgOpts[pkgIdx];
  const stepsKey = getStepKey(form.cat, form.sub);
  const defSteps = STEPS[stepsKey] || [];
  const formSteps = form.steps || defSteps.map(s => ({ n: s.n, days: s.days }));
  const totalDays = formSteps.reduce((a, s) => a + (parseInt(s.days) || 0), 0);
  const yieldEst = calcYield(form.cat, form.sub, form.inputLbs, pkgSel.v, pkgSel.l);
  const subOpts  = SUBS[form.cat] || [];

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function changeCat(cat) {
    const sub = SUBS[cat] ? SUBS[cat][0].v : "";
    const key = getStepKey(cat, sub);
    const steps = (STEPS[key] || []).map(s => ({ n: s.n, days: s.days }));
    setForm(f => ({ ...f, cat, sub, steps, pkgIdx: 0 }));
  }

  function changeSub(sub) {
    const key = getStepKey(form.cat, sub);
    const steps = (STEPS[key] || []).map(s => ({ n: s.n, days: s.days }));
    setForm(f => ({ ...f, sub, steps, pkgIdx: 0 }));
  }

  function updateStepDays(i, v) {
    const steps = formSteps.map((s, idx) => idx === i ? { ...s, days: parseInt(v) || 0 } : s);
    setForm(f => ({ ...f, steps }));
  }

  function openAdd() {
    const d = new Date().toISOString().split("T")[0];
    const steps = defSteps.map(s => ({ n: s.n, days: s.days }));
    setForm({ ...EMPTY, d, steps, cat: "whole_flower", sub: "", pkgIdx: 2 });
    setFormMode("add"); setFormErr("");
  }

  function openEdit(b) {
    setForm({ name: b.name, cat: b.cat, sub: b.sub, strains: b.strains,
              d: b.d, inputLbs: String(b.inputLbs), pkgIdx: b.pkgIdx,
              steps: b.steps.map(s => ({ n: s.n, days: s.days })) });
    setEditId(b.id); setFormMode("edit"); setFormErr("");
  }

  function closeForm() { setFormMode(null); setEditId(null); }

  function validate() {
    if (!form.name.trim()) { setFormErr("Enter a batch name."); return false; }
    if (!form.d)           { setFormErr("Select a start date."); return false; }
    if (!form.inputLbs || parseFloat(form.inputLbs) <= 0) { setFormErr("Enter a valid input quantity."); return false; }
    return true;
  }

  function saveBatch() {
    if (!validate()) return;
    const steps = formSteps.map(s => ({ n: s.n, days: parseInt(s.days) || 0 }));
    const batch = { id: Date.now(), name: form.name.trim(), cat: form.cat, sub: form.sub,
                    strains: form.strains.trim(), d: form.d, inputLbs: parseFloat(form.inputLbs),
                    pkgIdx, steps, yieldEst, pkgLabel: pkgSel.l,
                    catLabel: CATS.find(c => c.v === form.cat)?.l || form.cat,
                    subLabel: subOpts.find(s => s.v === form.sub)?.l || "" };
    if (formMode === "edit") {
      setBatches(prev => prev.map(b => b.id === editId ? { ...batch, id: editId } : b));
    } else {
      setBatches(prev => [...prev, batch]);
    }
    closeForm();
  }

  function removeBatch(id) { setBatches(prev => prev.filter(b => b.id !== id)); }

  // ── Compute timelines ────────────────────────────────────────────────────
  const timelines = batches.map(b => buildTimeline(b.d, b.steps));

  // ── Export ───────────────────────────────────────────────────────────────
  function exportProd() {
    if (!batches.length) return;
    const date = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

    const rows = batches.map((b, idx) => {
      const tl = timelines[idx];
      const end = tl[tl.length - 1]?.end;
      const stepRows = tl.map(s =>
        '<tr><td style="padding:4px 14px 4px 0;color:#555;font-size:13px;white-space:nowrap;">' + s.name +
        '</td><td style="padding:4px 14px 4px 0;font-size:13px;color:#1a1a1a;">' + fmtF(s.start) + ' → ' + fmtF(s.end) +
        '</td><td style="padding:4px 0;font-size:13px;color:#666;">' + s.days + ' days</td></tr>'
      ).join("");
      return '<div style="margin-bottom:32px;page-break-inside:avoid;">'
        + '<div style="background:#f6faf7;border-left:4px solid #2d5a3d;padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;">'
        + '<h2 style="font-size:16px;font-weight:700;color:#1a1a1a;margin:0 0 3px;">' + b.name + '</h2>'
        + '<p style="font-size:13px;color:#444;margin:0;">'
        + b.catLabel + (b.subLabel ? ' — ' + b.subLabel : '') + (b.strains ? ' &nbsp;·&nbsp; ' + b.strains : '')
        + '&nbsp;·&nbsp;' + b.inputLbs + ' lbs input</p>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">'
        + '<div><h3 style="font-size:11px;font-weight:700;color:#2d5a3d;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Production steps</h3>'
        + '<table style="border-collapse:collapse;">' + stepRows + '</table></div>'
        + '<div><h3 style="font-size:11px;font-weight:700;color:#2d5a3d;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Batch summary</h3>'
        + '<table style="border-collapse:collapse;">'
        + '<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Start</td><td style="padding:3px 0;font-size:13px;color:#1a1a1a;">' + fmtF(new Date(b.d + 'T12:00:00')) + '</td></tr>'
        + '<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Completion</td><td style="padding:3px 0;font-size:13px;color:#1a1a1a;">' + fmtF(end) + '</td></tr>'
        + '<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Total days</td><td style="padding:3px 0;font-size:13px;color:#1a1a1a;">' + b.steps.reduce((a,s)=>a+s.days,0) + '</td></tr>'
        + '<tr><td style="padding:3px 12px 3px 0;color:#555;font-size:13px;">Est. output</td><td style="padding:3px 0;font-size:13px;color:#1a1a1a;">' + (b.yieldEst || '—') + '</td></tr>'
        + '</table></div></div></div>';
    }).join('<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">');

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ResinOps Production Schedule</title>'
      + '<style>body{font-family:Arial,sans-serif;max-width:900px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.6;}'
      + 'h1{font-size:22px;color:#2d5a3d;margin:0 0 4px;}.meta{font-size:13px;color:#666;margin-bottom:28px;'
      + 'padding-bottom:14px;border-bottom:2px solid #e0e0e0;}@media print{body{margin:24px;}}</style></head><body>'
      + '<h1>ResinOps — Production Schedule</h1>'
      + '<div class="meta">Exported ' + date + ' &nbsp;·&nbsp; ' + batches.length + ' batch' + (batches.length>1?'es':'')
      + '<br><small>Ctrl+P → Save as PDF &nbsp;|&nbsp; File → Open in Word</small></div>'
      + rows + '</body></html>';

    const blob = new Blob([html], {type:"text/html"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "ResinOps-Production-" + new Date().toISOString().slice(0,10) + ".html";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Gantt setup ───────────────────────────────────────────────────────────
  const hasBatches = batches.length > 0;
  let gStart, total, twPx, todayOff, months, weeks;

  if (hasBatches) {
    const allStarts = timelines.map(tl => tl[0]?.start).filter(Boolean);
    const allEnds   = timelines.map(tl => tl[tl.length-1]?.end).filter(Boolean);
    gStart   = new Date(Math.min(...allStarts));
    const gEnd = new Date(Math.max(...allEnds));
    total    = dDiff(gStart, gEnd) + 10;
    twPx     = total * PX;
    todayOff = dDiff(gStart, today);

    months = [];
    let mo = "", moX = 0;
    for (let day = 0; day <= total; day++) {
      const ml = dAdd(gStart, day).toLocaleDateString("en-US", {month:"short",year:"2-digit"});
      if (ml !== mo) {
        if (mo) months.push({label:mo, x:moX, w:day*PX-moX});
        mo = ml; moX = day * PX;
      }
    }
    months.push({label:mo, x:moX, w:total*PX-moX});
    weeks = [];
    for (let day = 0; day <= total; day += 7)
      weeks.push({x:day*PX, wn:Math.floor(day/7)+1, date:fmtS(dAdd(gStart,day))});
  }

  // ── Status helper ─────────────────────────────────────────────────────────
  function batchStatus(b, tl) {
    const start = new Date(b.d + "T00:00:00");
    const end   = tl[tl.length-1]?.end;
    if (!end) return { label:"—", cls:"status-upcoming" };
    if (end < today0) return { label:"Complete", cls:"status-complete" };
    if (start > today0) return { label:"Upcoming", cls:"status-upcoming" };
    return { label:"In Progress", cls:"status-active" };
  }

  // ── Form panel ────────────────────────────────────────────────────────────
  const FormPanel = () => (
    <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:10,padding:18,marginBottom:20}}>
      <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:14}}>
        {formMode === "edit" ? "Edit Batch" : "New Production Batch"}
      </div>

      {/* Row 1 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label className="ps-lbl">Batch name</label>
          <input className="ps-inp" placeholder="Batch 2026-001" value={form.name}
            onChange={e => setF("name",e.target.value)} />
        </div>
        <div>
          <label className="ps-lbl">Product category</label>
          <select className="ps-select" value={form.cat} onChange={e => changeCat(e.target.value)}>
            {CATS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          {subOpts.length > 0 ? (
            <>
              <label className="ps-lbl">Product type</label>
              <select className="ps-select" value={form.sub} onChange={e => changeSub(e.target.value)}>
                {subOpts.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </>
          ) : <div />}
        </div>
        <div>
          <label className="ps-lbl">Strain(s) — separate blends with commas</label>
          <input className="ps-inp" placeholder="Blue Dream, OG Kush" value={form.strains}
            onChange={e => setF("strains",e.target.value)} />
        </div>
      </div>

      {/* Row 3 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div>
          <label className="ps-lbl">Batch start date</label>
          <input type="date" className="ps-inp" value={form.d} onChange={e => setF("d",e.target.value)} />
        </div>
        <div>
          <label className="ps-lbl">{getInputLabel(form.cat)}</label>
          <input type="number" min="0" step="0.1" className="ps-inp" placeholder="10"
            value={form.inputLbs} onChange={e => setF("inputLbs",e.target.value)} />
        </div>
      </div>

      {/* Row 4 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div>
          <label className="ps-lbl">Package / unit size</label>
          <select className="ps-select" value={pkgIdx}
            onChange={e => setF("pkgIdx", parseInt(e.target.value))}>
            {pkgOpts.map((p,i) => <option key={i} value={i}>{p.l}</option>)}
          </select>
        </div>
        <div style={{display:"flex",alignItems:"center"}}>
          {yieldEst ? (
            <div style={{background:"rgba(74,124,89,0.15)",border:"1px solid var(--accent)",
              borderRadius:8,padding:"8px 12px",width:"100%",boxSizing:"border-box"}}>
              <div style={{fontSize:10,color:"var(--accent-2)",fontWeight:700,marginBottom:2,
                letterSpacing:"0.06em",textTransform:"uppercase"}}>Estimated Output</div>
              <div style={{fontSize:12,fontWeight:600,color:"var(--accent-2)",lineHeight:1.4}}>{yieldEst}</div>
            </div>
          ) : (
            <div style={{fontSize:12,color:"var(--text-3)"}}>Enter input quantity to see yield estimate</div>
          )}
        </div>
      </div>

      {/* Steps */}
      <div style={{background:"var(--surface-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",letterSpacing:"0.06em",
          textTransform:"uppercase",marginBottom:10}}>
          Production Steps — {totalDays} days total
        </div>
        <div style={{display:"grid",gap:6}}>
          {formSteps.map((s, i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:2,background:SBG[s.n]||"#333",
                border:"1px solid rgba(255,255,255,0.15)",flexShrink:0}} />
              <span style={{fontSize:12,color:"var(--text-2)",flex:1,minWidth:0}}>{s.n}</span>
              <input className="ps-days-inp" type="number" min="1" max="365" value={s.days}
                onChange={e => updateStepDays(i, e.target.value)} />
              <span style={{fontSize:11,color:"var(--text-3)",width:28}}>days</span>
            </div>
          ))}
        </div>
      </div>

      {formErr && <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>{formErr}</div>}
      <div style={{display:"flex",gap:8}}>
        <button className="ps-btn ps-primary" onClick={saveBatch}>
          {formMode === "edit" ? "Save Changes" : "Add Batch"}
        </button>
        <button className="ps-btn ps-secondary" onClick={closeForm}>Cancel</button>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
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
            {hasBatches && <button className="ps-exp" onClick={exportProd}>↓ Export schedule</button>}
            {!formMode && <button className="ps-btn ps-primary" onClick={openAdd}>+ Add Batch</button>}
          </div>
        </div>

        {formMode && <FormPanel />}

        {!hasBatches && !formMode && (
          <div style={{border:"1px dashed var(--border-2)",borderRadius:10,padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>🏭</div>
            <div style={{fontSize:14,fontWeight:500,color:"var(--text-2)",marginBottom:4}}>No production batches yet</div>
            <div style={{fontSize:12,color:"var(--text-3)"}}>Add a batch to start tracking production timelines</div>
          </div>
        )}

        {hasBatches && (
          <>
            <div className="ps-outer">

              {/* Header row */}
              <div className="ps-row" style={{height:HH,background:"var(--surface-2)"}}>
                <div className="ps-left" style={{height:HH,background:"var(--surface-2)"}}>
                  <span style={{fontSize:11,fontWeight:700,color:"var(--text-2)",
                    letterSpacing:"0.08em",textTransform:"uppercase"}}>Batch</span>
                </div>
                <div className="ps-tl" style={{minWidth:twPx,height:HH,overflow:"hidden"}}>
                  {months.map((m,i) => (
                    <div key={i} style={{position:"absolute",left:m.x,top:0,width:m.w,height:24,
                      borderRight:"1px solid var(--border)",padding:"0 8px",
                      display:"flex",alignItems:"center",overflow:"hidden"}}>
                      <span style={{fontSize:11,fontWeight:600,color:"var(--text-2)",whiteSpace:"nowrap"}}>{m.label}</span>
                    </div>
                  ))}
                  {weeks.map((w,i) => (
                    <div key={i} style={{position:"absolute",left:w.x,top:24,bottom:0,
                      borderLeft:"1px solid var(--border)",paddingLeft:4,
                      display:"flex",flexDirection:"column",justifyContent:"center"}}>
                      <div style={{fontSize:10,fontWeight:700,color:"var(--text-3)",lineHeight:1.2}}>W{w.wn}</div>
                      <div style={{fontSize:9,color:"var(--text-3)",lineHeight:1.2}}>{w.date}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Batch rows */}
              {batches.map((b, idx) => {
                const tl = timelines[idx];
                const endDate = tl[tl.length-1]?.end;
                const sub = SUBS[b.cat]?.find(s => s.v === b.sub);
                return (
                  <div key={b.id} className="ps-row" style={{height:RH}}>

                    <div className="ps-left" style={{height:RH}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text)",
                        whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.3}}>{b.name}</div>
                      <div style={{fontSize:11,color:"var(--text-2)",lineHeight:1.3}}>
                        {b.catLabel}{sub ? " — " + sub.l : ""}
                      </div>
                      {b.strains && <div style={{fontSize:10,color:"var(--text-3)",lineHeight:1.3}}>{b.strains}</div>}
                      <div style={{fontSize:10,color:"var(--text-3)"}}>{b.inputLbs} lbs → {b.yieldEst || "—"}</div>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        <button className="ps-btn ps-sm ps-edit" onClick={() => openEdit(b)}>Edit</button>
                        <button className="ps-btn ps-sm ps-del" onClick={() => removeBatch(b.id)}>✕</button>
                      </div>
                    </div>

                    <div className="ps-tl" style={{minWidth:twPx,height:RH}}>
                      {weeks.map((w,i) => (
                        <div key={i} style={{position:"absolute",left:w.x,top:0,bottom:0,
                          width:1,background:"var(--border)",opacity:0.4}} />
                      ))}

                      {/* Step segments */}
                      {tl.map((step, si) => {
                        const x = dDiff(gStart, step.start) * PX;
                        const w = Math.max(dDiff(step.start, step.end) * PX, 2);
                        const bg = SBG[step.name] || "#333";
                        const fg = SFG[step.name] || "#fff";
                        return (
                          <div key={si} title={step.name + " — " + fmtF(step.start) + " → " + fmtF(step.end) + " (" + step.days + " days)"}
                            style={{position:"absolute",left:x,top:12,width:w,height:RH-24,
                              background:bg,borderRadius:si===0?"5px 0 0 5px":si===tl.length-1?"0 5px 5px 0":"0",
                              borderRight:si<tl.length-1?"1px solid rgba(0,0,0,0.25)":"none",
                              display:"flex",alignItems:"center",overflow:"hidden",padding:"0 6px"}}>
                            {w > 24 && <span style={{fontSize:9,fontWeight:700,color:fg,
                              whiteSpace:"nowrap",letterSpacing:"0.03em"}}>{step.name}</span>}
                          </div>
                        );
                      })}

                      {/* Today line */}
                      {todayOff >= 0 && todayOff <= total && (
                        <div style={{position:"absolute",left:todayOff*PX,top:0,bottom:0,
                          width:2,background:"var(--danger)",zIndex:3,opacity:0.9}} title="Today" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Step color legend */}
            <div style={{display:"flex",flexWrap:"wrap",gap:"6px 14px",marginBottom:20}}>
              {Object.entries(SBG).map(([name, bg]) => (
                <div key={name} style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:12,height:10,borderRadius:2,background:bg,
                    border:"1px solid rgba(255,255,255,0.12)"}} />
                  <span style={{fontSize:10,color:"var(--text-3)"}}>{name}</span>
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:2,height:12,background:"var(--danger)",borderRadius:1}} />
                <span style={{fontSize:10,color:"var(--text-3)"}}>Today</span>
              </div>
            </div>

            {/* Summary table */}
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",letterSpacing:"0.06em",
              textTransform:"uppercase",marginBottom:8}}>Batch Summary</div>
            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:10}}>
              <table className="ps-table">
                <thead>
                  <tr>
                    <th>Batch</th><th>Product</th><th>Strains</th>
                    <th>Input</th><th>Est. Output</th>
                    <th>Start</th><th>Completion</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b, idx) => {
                    const tl = timelines[idx];
                    const end = tl[tl.length-1]?.end;
                    const st = batchStatus(b, tl);
                    const sub = SUBS[b.cat]?.find(s => s.v === b.sub);
                    return (
                      <tr key={b.id}>
                        <td style={{color:"var(--text)",fontWeight:500}}>{b.name}</td>
                        <td>{b.catLabel}{sub ? " — " + sub.l : ""}</td>
                        <td>{b.strains || "—"}</td>
                        <td>{b.inputLbs} lbs</td>
                        <td style={{fontSize:11}}>{b.yieldEst || "—"}</td>
                        <td>{fmtS(new Date(b.d + "T12:00:00"))}</td>
                        <td>{end ? fmtS(end) : "—"}</td>
                        <td><span className={"status-pill " + st.cls}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
