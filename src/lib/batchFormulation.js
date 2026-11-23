// Vape formulation math and METRC production batch numbers.
//
// Ported from the Distillate Dosing Calculator the production floor used
// before this lived in ResinOps. Everything here is pure (no React, no
// db) so the Production Scheduler panel, the GMP Hub batch record and the
// tests all share one implementation.
//
// A formulation is stored on production_batches.batch_formulation:
//   {
//     distDrum, distCoa, potencySource: "retest"|"coa", distPotencyPct,
//     mode: "terp"|"thc", terpPct, targetThcPct,
//     terps: [{name, share}],           // share of the terpene portion, %
//     labelG, overfillG, tolG,          // per unit
//     sellableUnits, labUnits, holdupPct,
//     heatF, mixF, fillF,               // null = record only
//     metrcBatch, bulkBatch,
//   }

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

export const EMPTY_VAPE_FORMULATION = {
  distDrum: "", distCoa: "", potencySource: "retest", distPotencyPct: "",
  mode: "terp", terpPct: "", targetThcPct: "",
  terps: [{ name: "", share: 100 }],
  labelG: "", overfillG: "0", tolG: "0.03",
  sellableUnits: "", labUnits: "0", holdupPct: "0.5",
  heatF: "150", mixF: "120", fillF: "120",
  metrcBatch: "", bulkBatch: "",
};

/**
 * Size a distillate + terpene vape blend.
 * Returns every number the batch record prints, plus errors and warnings.
 */
export function calcVapeFormulation(f = {}, opts = {}) {
  const pot = num(f.distPotencyPct);
  const label = num(f.labelG);
  const fill = label + num(f.overfillG);
  const tol = num(f.tolG);
  const units = Math.max(0, Math.round(num(f.sellableUnits)));
  const lab = Math.max(0, Math.round(num(f.labUnits)));
  const loss = Math.min(0.5, Math.max(0, num(f.holdupPct) / 100));
  const bulkG = Math.max(0, num(f.bulkSampleG));   // bulk oil pulled for the lab before filling
  const errs = [], warns = [];

  let df, tf;
  if (f.mode === "thc") {
    const t = num(f.targetThcPct);
    df = pot > 0 ? t / pot : 0; tf = 1 - df;
    if (pot > 0 && t >= pot) errs.push(`Target ${t.toFixed(1)}% THC is at or above the distillate's ${pot.toFixed(2)}%. Terpenes can only lower potency.`);
  } else {
    tf = num(f.terpPct) / 100; df = 1 - tf;
  }
  if (pot <= 0) errs.push("Enter the distillate potency.");
  if (fill <= 0) errs.push("Enter the label net weight per unit.");
  if (tf < 0 && f.mode !== "thc") errs.push("Terpene % cannot be negative.");
  if (tf > 0.12) warns.push(`${(tf * 100).toFixed(1)}% terpenes is high for distillate oil. Expect thinner oil and a higher leak risk.`);
  if (f.potencySource === "coa") warns.push("Distillate potency is from the supplier COA, not an in-house retest of this drum.");

  const total = units + lab;
  // Hold-up is lost while filling; the bulk lab sample comes out of the blend before that.
  const blend = fill > 0 ? total * fill / (1 - loss) + bulkG : 0;
  const dist = blend * df, terpG = blend * tf;
  const rows = Array.isArray(f.terps) && f.terps.length ? f.terps : [{ name: "", share: 100 }];
  const shareSum = rows.reduce((a, t) => a + Math.max(0, num(t.share)), 0) || 1;
  const terps = rows.map(t => ({
    name: (t.name || "").trim() || opts.defaultTerpName || "Terpene blend",
    g: terpG * Math.max(0, num(t.share)) / shareSum,
    pct: tf * 100 * Math.max(0, num(t.share)) / shareSum,
  }));
  if (tf > 0 && Math.abs(rows.reduce((a, t) => a + num(t.share), 0) - 100) > 0.01) warns.push("Terpene shares don't add to 100%. Weights are split in proportion.");

  const thc = df * pot;
  return {
    pot, label, fill, tol, units, lab, total, loss, df, tf, thc,
    blend, dist, terpG, terps, bulkG, lossG: (blend - bulkG) * loss,
    mgPerUnit: label * thc * 10,
    errs, warns,
  };
}

// ── METRC production batch numbers ─────────────────────────────────────
// House scheme seen in METRC for license OCM-PROC-24-000209-P1:
//   GCCNY-<CODE><FORMAT>-<MMDDYY>-B<NN>
// B<NN> counts runs of that flavor + format across all dates. Older
// numbers are inconsistent (Tigers Blood was TIGER-2GUZO, TigerB, TigersB;
// B0 written as BO), so matching normalises them first.

export const FLAVOR_CODES = {
  "nyc diesel": "NYCDIESEL", "pineapple express": "PINEAPPLE", "terpaja blast": "TERPAJA",
  "cherry lemon": "CHERRYL", "lemon cherry": "CHERRYL", "wedding cake": "WEDDING",
  "tigers blood": "TIGER", "tiger's blood": "TIGER",
};
const ALIASES = [["CHERRYLEMON", "CHERRYL"], ["TIGERSB", "TIGER"], ["TIGERB", "TIGER"], ["TERPB", "TERPAJA"], ["PINEA", "PINEAPPLE"], ["NYCD", "NYCDIESEL"]];

export function flavorCode(product) {
  const p = String(product || "").toLowerCase().replace(/\s+/g, " ").trim();
  return FLAVOR_CODES[p] || p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
}

/** Format suffix for a vape: [finished, bulk]. */
export function vapeFormats(labelG, isAio) {
  const g = num(labelG);
  const fin = isAio && g === 2 ? "2GUZO-DISTY"
    : g === 1 ? "1G510-DISTY"
    : g === 0.5 ? "05G510-DISTY"
    : String(g).replace(".", "") + (isAio ? "GAIO" : "GVAPE") + "-DISTY";
  return [fin, "-DISTY"];
}

function key(s) {
  let k = String(s).toUpperCase().replace(/\./g, "").replace(/[-_]/g, "").replace("DISTY", "").replace("1G510", "510");
  for (const [a, c] of ALIASES) if (k.startsWith(a) && !k.startsWith(c)) { k = c + k.slice(a.length); break; }
  return k;
}

/** Pull every GCCNY-… production batch number out of free text (batch names, notes). */
export function extractBatchNumbers(texts) {
  const out = [];
  for (const t of texts || []) for (const m of String(t || "").matchAll(/GCCNY[-_][A-Za-z0-9._-]+/g)) out.push(m[0]);
  return out;
}

/** Next run number for code+format given the batch numbers already used. */
export function nextRun(code, fmt, used) {
  const want = key(code + fmt);
  let max = 0;
  for (const u of used || []) {
    const m = String(u).match(/^GCCNY[-_](.+?)[-_](\d{6,7})(?:[-_]B[O0]?A?(\d+))?/i);
    if (!m || !m[3]) continue;
    if (key(m[1]) === want) max = Math.max(max, +m[3]);
  }
  return max + 1;
}

export function mmddyy(iso) {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? m + d + y.slice(2) : "";
}

/** {fin, bulk, run} for a vape batch. run overrides the automatic count. */
export function vapeBatchNumbers({ product, code, labelG, isAio, dateISO, used, run }) {
  const c = (code || flavorCode(product)).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return null;
  const [ff, bf] = vapeFormats(labelG, isAio);
  const r = run ? Math.max(1, Math.round(run)) : nextRun(c, ff, used);
  const b = "B" + String(r).padStart(2, "0"), dt = mmddyy(dateISO);
  return { fin: `GCCNY-${c}${ff}-${dt}-${b}`, bulk: `GCCNY-${c}${bf}-${dt}-${b}`, run: r };
}
