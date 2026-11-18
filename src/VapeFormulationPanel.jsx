// Vape formulation & batch record panel for the Production Scheduler.
// Replaces the floor's separate Distillate Dosing Calculator: sizes the
// distillate + terpene blend, carries the temperatures and fill checks the
// GMP Hub batch record prints, and issues the METRC production batch
// number. Stored on production_batches.batch_formulation.

import { EMPTY_VAPE_FORMULATION, calcVapeFormulation, vapeBatchNumbers, extractBatchNumbers } from "./lib/batchFormulation.js";

const TEMP_OPTS = { heatF: [140, 150, 160], mixF: [115, 120, 125, 130], fillF: [110, 120, 130] };
const fmt = (v, d = 1) => (Number.isFinite(+v) ? (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

export default function VapeFormulationPanel({ value, onChange, product, labelG, isAio, dateISO, batches, editId, onUseBlendAsInput, onUseBatchNumberInName }) {
  const f = { ...EMPTY_VAPE_FORMULATION, labelG: labelG ? String(labelG) : "", ...(value || {}) };
  const set = (k, v) => onChange({ ...f, [k]: v });
  const c = calcVapeFormulation(f, { defaultTerpName: product });
  const used = extractBatchNumbers((batches || []).filter(b => b.id !== editId).flatMap(b => [b.name, b.notes, b.batchFormulation?.metrcBatch, b.batchFormulation?.bulkBatch]));

  const inp = (k, label, props = {}) => (
    <div><label className="ps-lbl">{label}</label><input className="ps-inp" value={f[k] ?? ""} onChange={e => set(k, e.target.value)} {...props} /></div>
  );
  const tempSel = (k, label) => (
    <div><label className="ps-lbl">{label}</label>
      <select className="ps-sel" value={f[k] === null || f[k] === "" ? "" : String(f[k])} onChange={e => set(k, e.target.value === "" ? null : e.target.value)}>
        <option value="">Record only (no target)</option>
        {TEMP_OPTS[k].map(t => <option key={t} value={String(t)}>{t} °F ({Math.round((t - 32) * 5 / 9)} °C)</option>)}
        {f[k] && !TEMP_OPTS[k].includes(+f[k]) && <option value={String(f[k])}>{f[k]} °F (custom)</option>}
      </select>
    </div>
  );
  const terps = Array.isArray(f.terps) && f.terps.length ? f.terps : [{ name: "", share: 100 }];
  const setTerp = (i, k, v) => set("terps", terps.map((t, j) => (j === i ? { ...t, [k]: v } : t)));

  function generate() {
    const nb = vapeBatchNumbers({ product, labelG: c.label, isAio, dateISO, used });
    if (nb) onChange({ ...f, metrcBatch: nb.fin, bulkBatch: nb.bulk });
  }
  const preview = vapeBatchNumbers({ product, labelG: c.label, isAio, dateISO, used });

  return (
    <div className="ps-box">
      <div className="ps-box-t">📋 Vape Formulation & Batch Record</div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12 }}>
        Distillate + terpene blend sized to the unit count, with the temperatures, fill tolerance and METRC batch numbers the GMP Hub batch record prints. Use the in-house retest potency of the drum you are pulling, not the supplier COA.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        {inp("distDrum", "Distillate drum / batch #", { placeholder: "Batch 0022" })}
        {inp("distCoa", "Distillate COA #", { placeholder: "20261106-CHAO-006" })}
        {inp("distPotencyPct", "Distillate potency (% THC)", { type: "number", step: "0.01" })}
        <div><label className="ps-lbl">Potency comes from</label>
          <select className="ps-sel" value={f.potencySource} onChange={e => set("potencySource", e.target.value)}>
            <option value="retest">In-house retest of this drum</option><option value="coa">Supplier COA</option>
          </select></div>
        <div><label className="ps-lbl">Formula set by</label>
          <select className="ps-sel" value={f.mode} onChange={e => set("mode", e.target.value)}>
            <option value="terp">Terpene %</option><option value="thc">Target THC %</option>
          </select></div>
        {f.mode === "thc" ? inp("targetThcPct", "Target THC in oil (%)", { type: "number", step: "0.1" }) : inp("terpPct", "Terpenes (% of oil)", { type: "number", step: "0.01" })}
        {inp("labelG", "Label net weight per unit (g)", { type: "number", step: "0.01" })}
        {inp("overfillG", "Overfill per unit (g)", { type: "number", step: "0.005" })}
        {inp("tolG", "Fill tolerance (± g)", { type: "number", step: "0.005" })}
        {inp("sellableUnits", "Sellable units", { type: "number", step: "1" })}
        {inp("labUnits", "Extra lab / retain units", { type: "number", step: "1" })}
        {inp("holdupPct", "Hold-up loss (% of blend)", { type: "number", step: "0.5" })}
        {tempSel("heatF", "Heat distillate to")}
        {tempSel("mixF", "Add terpenes / mix at")}
        {tempSel("fillF", "Fill at")}
      </div>

      <div style={{ marginTop: 10 }}>
        <label className="ps-lbl">Terpene components (share of the terpene portion, %)</label>
        {terps.map((t, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 6, marginBottom: 6 }}>
            <input className="ps-inp" placeholder={product || "Terpene blend"} value={t.name} onChange={e => setTerp(i, "name", e.target.value)} />
            <input className="ps-inp" type="number" value={t.share} onChange={e => setTerp(i, "share", e.target.value)} />
            <button type="button" className="ps-btn" disabled={terps.length < 2} onClick={() => set("terps", terps.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="ps-btn" onClick={() => set("terps", [...terps, { name: "", share: 0 }])}>+ Add terpene</button>
      </div>

      {c.errs.map(e => <div key={e} style={{ marginTop: 8, fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>⚠ {e}</div>)}
      {c.warns.map(w => <div key={w} style={{ marginTop: 6, fontSize: 12, color: "var(--amber)" }}>⚠ {w}</div>)}
      {!c.errs.length && c.total > 0 && (
        <div style={{ marginTop: 10, background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px", fontSize: 12, display: "grid", gap: 4 }}>
          <div><strong>{fmt(c.thc)}% THC</strong> expected · {fmt(c.mgPerUnit, 0)} mg per unit · {c.total} units ({c.units} + {c.lab} lab/retain) at {fmt(c.fill, 3)} g ± {fmt(c.tol, 3)}</div>
          <div>Pull <strong>{fmt(c.dist)} g distillate</strong>{c.tf > 0 && <> + {c.terps.map(t => `${fmt(t.g, 2)} g ${t.name}`).join(" + ")}</>} = <strong>{fmt(c.blend)} g blend</strong> (incl. {fmt(c.lossG)} g hold-up)</div>
          {onUseBlendAsInput && <div><button type="button" className="ps-btn" onClick={() => onUseBlendAsInput(+c.blend.toFixed(1))}>Use {fmt(c.blend)} g as this batch's input</button></div>}
        </div>
      )}

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {inp("metrcBatch", "METRC production batch # (finished)")}
        {inp("bulkBatch", "Bulk blend batch #")}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <button type="button" className="ps-btn" disabled={!preview} onClick={generate}>Generate METRC batch #</button>
        {onUseBatchNumberInName && f.metrcBatch && <button type="button" className="ps-btn" onClick={() => onUseBatchNumberInName(f.metrcBatch)}>Put batch # in the batch name</button>}
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{preview ? `Next: ${preview.fin} (run B${String(preview.run).padStart(2, "0")}, counted from batch numbers already in ResinOps)` : "Enter the strain / flavor first."}</span>
      </div>
    </div>
  );
}
