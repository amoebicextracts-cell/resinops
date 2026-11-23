// House-format GMP batch record (sections 1-6, same layout as the paper
// Pre-Roll Batch Record the production floor uses).
//
// Vapes are made as a phased run (sections 1-8): Phase 1 blends the whole
// batch, sends a bulk oil sample (full panel) and 3-6 filled units (heavy
// metals), and holds everything for the COA; Phase 2 fills the rest on the
// same hardware lot at the Phase 1 settings, under the same batch number.
// Raw flower pre-rolls are phased the same way: Phase 1 makes a test portion,
// randomly selected units go to the lab, everything is held for the COA, and
// Phase 2 makes the rest from the same flower at the Phase 1 settings.
//
// Pure function of the batch and its related records, so the GMP Hub's
// Sign & Release flow, its per-batch download and the bulk export all
// print the same document. Values ResinOps already knows are printed in
// blue bold (targets from batch_formulation, recorded sign-offs, linked
// COA results); everything else is left blank for the floor to fill in.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { calcVapeFormulation, extractBatchNumbers } from "./batchFormulation.js";

const INK = [24, 32, 42], BLUE = [31, 95, 174], GREY = [93, 104, 118], HEAD = [230, 236, 245], LINE = [154, 163, 173];
const TIERS = [["worker", "Worker"], ["supervisor", "Supervisor"], ["manager", "Manager"], ["qc_head", "QC/Production Head"]];
const M = 36;

const n = (v, d = 2) => (Number.isFinite(+v) ? (+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "");
const v = t => ({ content: String(t), styles: { textColor: BLUE, fontStyle: "bold" } });  // pre-filled value
const b = t => ({ content: String(t), styles: { fontStyle: "bold" } });
const g = t => ({ content: String(t), styles: { textColor: GREY } });
const fC = f => Math.round((f - 32) * 5 / 9);
const temp = f => (f === null || f === undefined || f === "" ? "" : v(`${f} °F (${fC(+f)} °C)`));
const passTxt = p => (p === true ? "PASS" : p === false ? "FAIL" : "");
const fmtDate = s => (s ? String(s).slice(0, 10) : "");

function kindOf(batch) {
  const c = String(batch.cat || "").toLowerCase(), s = String(batch.sub || "").toLowerCase();
  const name = String(batch.name || "").toLowerCase();
  if (c === "vape") return "vape";
  if (c === "preroll" || c === "pre_roll" || name.includes("pre-roll")) return /infus|ipr/.test(name + " " + s) ? "infused" : "preroll";
  if (c === "edible") return "edible";
  return "other";
}
const TITLES = { vape: "Vape Batch Record", preroll: "Pre-Roll Batch Record", infused: "Infused Pre-Roll Batch Record", edible: "Edible Batch Record", other: "Production Batch Record" };

/**
 * @param {object} p
 * @param {object} p.batch          production batch (app format)
 * @param {object} [p.facility]     facility row (facility_name, license_number)
 * @param {Array}  [p.signoffs]     gmp_signoffs rows for this batch
 * @param {Array}  [p.deviations]   gmp_deviations rows for this batch
 * @param {Array}  [p.qcTests]      qc_tests rows linked to this batch
 * @param {Array}  [p.shiftEntries] labor entries for this batch
 * @param {Function} [p.empName]    employee id -> display name
 * @param {Function} [p.onBehalf]   (signoff, tier) -> {text} | null
 * @param {string} [p.generatedAt]  ISO date for the footer
 * @param {boolean} [p.signed]      true when built inside Sign & Release
 */
export function buildHouseBatchRecordPdf(p) {
  const { batch, facility = {}, signoffs = [], deviations = [], qcTests = [], shiftEntries = [] } = p;
  const empName = p.empName || (id => id || "");
  const onBehalf = p.onBehalf || (() => null);
  const kind = kindOf(batch);
  const f = batch.batchFormulation || null;
  const vc = kind === "vape" && f ? calcVapeFormulation(f, { defaultTerpName: (batch.strains || "").split(",")[0].trim() }) : null;
  const metrc = f?.metrcBatch || extractBatchNumbers([batch.name, batch.notes])[0] || "";
  const bulk = f?.bulkBatch || "";
  const product = (batch.name || "").replace(/\s*-\s*GCCNY[-_].*$/i, "") || batch.name || "";
  const title = `${TITLES[kind]}: ${product}`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), CW = W - 2 * M;
  let y = M;
  const need = h => { if (y + h > H - 50) { doc.addPage(); y = M; } };
  const text = (t, o = {}) => {
    const size = o.size || 9;
    doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...(o.color || INK));
    const lines = doc.splitTextToSize(String(t), CW), h = lines.length * size * 1.3;
    need(h); doc.text(lines, M, y + size, { lineHeightFactor: 1.3 }); y += h + (o.gap ?? 4); doc.setTextColor(0);
  };
  const h2 = t => { y += 8; need(80); text(t, { size: 12.5, bold: true, gap: 3 }); };
  const h3 = t => { y += 3; need(60); text(t, { size: 10, bold: true, gap: 2 }); };
  const line = t => text(t, { size: 9.5, gap: 9 });
  const table = (head, body, widths, minH = 17) => {
    const tw = widths.reduce((a, x) => a + x, 0);
    const columnStyles = Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w * CW / tw }]));
    need(head ? 40 : 20);
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, bottom: 50 }, head: head ? [head] : undefined, body,
      theme: "grid", columnStyles,
      styles: { font: "helvetica", fontSize: 8.5, textColor: INK, lineColor: LINE, lineWidth: 0.5, cellPadding: 4, minCellHeight: minH, valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: HEAD, textColor: INK, fontStyle: "bold", fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY + 7;
  };
  const fields = rows => table(["Field", "Entry"], rows, [2.3, 3.7], 18);
  const blanks = (rows, cols, numbered = true) => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, k) => (k === 0 && numbered ? String(i + 1) : "")));

  // ── Header ──
  text(title, { size: 16, bold: true, gap: 2 });
  text([facility.facility_name, facility.license_number].filter(Boolean).join(" · ") + (metrc ? `   |   METRC P.B. ${metrc}` : ""), { size: 9.5, color: GREY, gap: 6 });
  text("This is the batch record for the production floor. Fill in by hand in blue or black ink, then enter it into the ResinOps GMP Hub by end of shift. The paper original is filed with the batch.");
  text('Good documentation rules: write at the time of the activity. No pencil, no white-out. Correct errors with a single line, initials, date, and reason. Write "N/A" in any field that does not apply. Never leave a blank. Blue bold entries come from ResinOps: calculated targets, recorded sign-offs and linked COA results.');
  const isVape = kind === "vape", isRaw = kind === "preroll";
  const phased = isVape || isRaw;
  const S = phased ? { yield: 7, dev: 8 } : { yield: 5, dev: 6 };
  const joints = kind === "preroll" || kind === "infused";   // rejects are unrolled and re-rolled
  if (isVape) text("Phased run (test samples first): this batch is made in two phases under one batch number. Phase 1: weigh and blend the whole batch, pull a bulk oil sample for the full panel, and fill 3–6 units for heavy-metal testing; everything is held until the COA passes (Sections 5 and 6). Phase 2: re-warm and re-mix the held oil and fill the rest on the same hardware lot at the Phase 1 settings. Rows marked [LOCK] must match Phase 1; a mismatch is a deviation (Section 8) and QA decides whether to retest.", { bold: true });
  if (isRaw) text("Phased run (test portion first): this batch is made in two phases under one batch number. Phase 1 makes a test portion; randomly selected units go to the lab and all material is held until the COA passes (Sections 5 and 6). Phase 2 makes the rest from the same source flower at exactly the Phase 1 settings, so the lab samples represent the whole batch. Rejects from either phase are reworked (Section 4). Rows marked [LOCK] must match Phase 1; a mismatch is a deviation (Section 8) and QA decides whether to retest.", { bold: true });
  if (p.signed) text("Signed record: frozen at QC Head Sign & Release.", { size: 9, bold: true, color: BLUE });
  const planChecks = [...(vc?.errs || [])];
  if (kind === "vape" && vc && vc.lab < 3) planChecks.push(`Only ${vc.lab} lab / retain units are planned; the heavy-metal test needs 3–6 filled units.`);
  if (kind === "vape" && vc && !vc.bulkG) planChecks.push("No bulk oil lab sample is budgeted in the formulation; pulling one will leave Phase 2 short of the sellable count.");
  if (planChecks.length) text("CHECK BEFORE STARTING: " + planChecks.join(" "), { size: 9, bold: true, color: [180, 0, 0] });

  // ── 1. Batch identification ──
  h2("1. Batch Identification");
  const idRows = [
    ["METRC Production Batch No. (finished)", metrc ? v(metrc) : ""],
    ["METRC Production Batch No. (bulk)", bulk ? v(bulk) : ""],
    ["ResinOps Batch ID", v(batch.id || "")],
    ["METRC Package Tag(s) (output)", batch.metrcTag || batch.s2sOutputTags ? v(batch.metrcTag || batch.s2sOutputTags) : ""],
    ["Product Name / SKU", product ? v(product) : ""],
    ["Product Type", v([batch.catLabel, batch.subLabel].filter(Boolean).join(" — ") || batch.cat || "")],
    ["Strain(s) / Flavor", batch.strains ? v(batch.strains) : ""],
  ];
  if (vc) {
    idRows.push(
      ["Formula (by weight)", v(`${n(vc.df * 100)}% distillate / ${n(vc.tf * 100)}% terpenes`)],
      ["Expected Potency (theoretical)", v(`${n(vc.thc, 1)}% THC, ${n(vc.mgPerUnit, 0)} mg THC per unit (${n(vc.pot)}% x ${n(vc.df * 100)}%)`)],
      ["Target Fill Weight (g, net)", v(`${n(vc.fill, 3)} g`)],
      ["Allowed Fill Tolerance (± g)", v(`± ${n(vc.tol, 3)} g  (accept ${n(vc.fill - vc.tol, 3)} to ${n(vc.fill + vc.tol, 3)} g)`)],
      ["Target Unit Count", v(`${vc.total} filled (${vc.units} sellable + ${vc.lab} lab / retain${kind === "vape" ? ", incl. the 3–6 heavy-metal test units" : ""})`)],
      ["Batch Size (blend)", v(`${n(vc.blend, 1)} g  (includes ${n(vc.lossG, 1)} g hold-up allowance, ${n(vc.loss * 100, 1)}%${vc.bulkG > 0 ? `, and ${n(vc.bulkG, 1)} g bulk oil lab sample` : ""})`)],
    );
  } else {
    idRows.push(
      ["Input Quantity", batch.inputAmt ? v(`${batch.inputAmt} ${batch.unit || "g"}`) : ""],
      ["Estimated Output", batch.yieldEst ? v(batch.yieldEst) : ""],
    );
  }
  if (isRaw) idRows.push(
    ["Production Plan", v("Phased: Phase 1 test portion, random units to the lab, hold for the COA, then Phase 2 remainder at the Phase 1 settings under the same batch number")],
    ["Test Portion (planned % of batch / g)", batch.inputAmt ? v(`______ % of ${batch.inputAmt} ${batch.unit || "g"} = ________ g`) : ""],
    ["Reject Handling", v("Unroll and re-roll into units that pass QC; reworked units join the batch total")],
  );
  if (isVape) idRows.push(
    ["Production Plan", v("Phased: blend the whole batch, send a bulk oil sample (full panel) and 3–6 filled units (heavy metals), hold for the COA, then fill the rest at the Phase 1 settings under the same batch number")],
    ["Heavy-Metal Test Units (qty, 3–6)", ""],
  );
  idRows.push(
    ["Master SOP / BOM Reference and Revision", ""], ["Facility / Room", ""],
    [phased ? (isVape ? "Phase 1 Date (blend, samples, test units)" : "Phase 1 Date (test portion)") : "Production Date", batch.d ? v(fmtDate(batch.d)) : ""],
    ...(phased ? [[isVape ? "Phase 2 Fill Date" : "Phase 2 Production Date", ""]] : []),
    [phased ? "Start / End Time (Phase 1  |  Phase 2)" : "Start Time / End Time", ""],
    ["Production Lead (print, sign)", ""], ["Operators on Batch", ""],
  );
  fields(idRows);

  // ── 2. Input materials ──
  h2("2. Input Materials");
  text("Pull every input against its ResinOps inventory lot so FIFO and BOM deduction match the floor. Every cannabis input must show a passing COA in QC Testing and no active hold before use.");
  h3("Cannabis inputs");
  const cin = [];
  if (vc) cin.push(["1", v("Distillate" + (f.distDrum ? ", drum " + f.distDrum : "")), "", "", f.distCoa ? v(f.distCoa + " / Pass? ___") : "", v(n(vc.pot)), v(n(vc.dist, 1)), "", "", "", "", ""]);
  else if (batch.inputAmt) cin.push(["1", v(batch.inputMaterialType || batch.strains || "Input"), "", batch.s2sSourceTags ? v(batch.s2sSourceTags) : "", "", "", v(`${batch.inputAmt} ${batch.unit || "g"}`), "", "", "", "", ""]);
  while (cin.length < 3) cin.push([String(cin.length + 1), "", "", "", "", "", "", "", "", "", "", ""]);
  table(["#", "Material", "ResinOps Lot ID", "METRC Tag", "COA # / Pass?", "Potency (% THC)", "Target Net (g)", "Gross Wt (g)", "Tare (g)", "Net Issued (g)", "Issued By", "Verif. By"], cin, [0.3, 1.4, 0.95, 0.85, 1.25, 0.7, 0.7, 0.7, 0.55, 0.7, 0.6, 0.65], 22);
  if (vc) text(f.potencySource === "coa"
    ? `CHECK BEFORE USE: distillate potency ${n(vc.pot)}% is from the supplier COA, not an in-house retest of this drum.`
    : `Distillate potency ${n(vc.pot)}% is the in-house retest of ${f.distDrum || "this drum"}${f.distCoa ? " (COA " + f.distCoa + ")" : ""}. If a different drum is issued, stop and recalculate the formula before use.`, { size: 8.5, color: GREY });
  if (vc && vc.tf > 0) {
    h3("Non-cannabis ingredients");
    table(["#", "Ingredient", "Supplier", "Supplier Lot", "Target Net (g)", "Gross Wt (g)", "Tare (g)", "Net Issued (g)", "Issued By", "Verif. By"],
      vc.terps.map((t, i) => [String(i + 1), v(t.name), "", "", v(n(t.g)), "", "", "", "", ""]).concat([[String(vc.terps.length + 1), "", "", "", "", "", "", "", "", ""]]),
      [0.3, 1.7, 1, 1, 0.75, 0.75, 0.6, 0.8, 0.7, 0.75], 22);
  }
  h3("Packaging and components");
  table(["#", "Component", "ResinOps Lot / Supplier Lot", "Qty Needed", "Qty Issued", "Qty Returned", "Qty Used", "Issued By"], [
    ["1", kind === "vape" ? b("Hardware") : b("Cones / primary container"), "", vc ? v(vc.total + " + spares") : "", "", "", "", ""],
    ["2", batch.packagingContainer ? v(batch.packagingContainer) : "Retail package", "", vc ? v(String(vc.units)) : "", "", "", "", ""],
    ["3", "Labels", "", vc ? v(String(vc.units)) : "", "", "", "", ""], ["4", "Child-resistant packaging", "", "", "", "", "", ""],
  ], [0.3, 1.8, 1.6, 0.9, 0.8, 0.8, 0.8, 0.8], 18);

  // ── 3. Line clearance ──
  h2("3. Line Clearance and Equipment Checks");
  text('Complete before any material enters the room. Any "No" stops the batch until resolved and logged as a deviation in Section ' + S.dev + '.' + (phased ? ' Do it once for each phase.' : ''));
  const clear = ["Previous batch materials, labels, and paperwork removed",
    kind === "vape" ? "Mixing vessel, stirrer, filler reservoir, and lines cleaned and dry (no previous flavor)" : kind === "infused" ? "Tumbler drum, spray gun, knockbox, trays, and screens cleaned; no previous strain or flavor" : "Work surfaces, grinder, and filling machine cleaned and sanitized",
    "Cleaning log signed for this room and equipment", "No other product, strain, or lot present at the station",
    "Staff in required PPE", "Room temperature (°F) and RH (%) within SOP range: ____ °F / ____ %"];
  if (phased) {
    table(["Check", "Phase 1 Y/N", "Initials / Time", "Phase 2 Y/N", "Initials / Time"], clear.map(c => [c, "", "", "", ""]), [3.7, 0.7, 0.85, 0.7, 0.85]);
    table(["Phase", "Balance", "Test Weight (g)", "Reading (g)", "Pass (within ± ____ g)?", "Initials"],
      [["1", "Bulk balance"], ["1", "Check-weigh balance (0.01 g)"], ["2", "Bulk balance"], ["2", "Check-weigh balance (0.01 g)"]].map(r => [...r, "", "", "", ""]), [0.5, 1.6, 1, 1, 1.4, 0.8]);
    line("Line clearance verified by (QA or Lead, sign / date):  Phase 1 ____________________   Phase 2 ____________________");
  } else {
    table(["Check", "Yes / No", "Initials", "Time"], clear.map(c => [c, "", "", ""]), [4.6, 0.7, 0.7, 0.7]);
    table(["Balance", "Test Weight (g)", "Reading (g)", "Pass (within ± ____ g)?", "Initials"], [["Bulk balance", "", "", "", ""], ["Check-weigh balance (0.01 g)", "", "", "", ""]], [1.7, 1.1, 1.1, 1.5, 0.8]);
    line("Line clearance verified by (QA or Lead, sign / date): ______________________________");
  }

  // ── 4. Production ──
  h2("4. Production");
  if (vc) {
    h3("Weigh and blend");
    table(["Ingredient", "Target Net (g)", "Actual Net (g)", "Operator", "Verifier"],
      [[v("Distillate" + (f.distDrum ? " (" + f.distDrum + ")" : "")), v(n(vc.dist, 1)), "", "", ""]]
        .concat(vc.tf > 0 ? vc.terps.map(t => [v(t.name), v(n(t.g)), "", "", ""]) : [])
        .concat([[b("Total blend"), v(n(vc.blend, 1)), "", "", ""]]), [2.2, 1, 1, 1, 1], 20);
    table(["Field", "Target", "Actual", "Initials / Time"], [
      ["Heat distillate to (°F)", temp(f.heatF), "", ""],
      ["Distillate temperature when terpenes added (°F)", temp(f.mixF), "", ""],
      ["Vessel covered during mixing? Y/N", "Y", "", ""], ["Mix time (min)", "", "", ""],
      ["Blend uniform: no streaks, layers, or separation? Y/N", "Y", "", ""],
      ["Actual terpene % = terpene net ÷ total net × 100", v(n(vc.tf * 100) + "%"), "", ""],
    ], [3, 1.3, 1, 1], 18);
  }
  if (isVape) {
    h3("Fill (Phase 1 = heavy-metal test units, Phase 2 = remainder)");
    text("Fill the 3–6 test units in Phase 1 on the hardware lot and settings Phase 2 will use. Before Phase 2, set every [LOCK] row to the Phase 1 value, then record the Phase 2 actual and mark Match.", { size: 8.5, color: GREY });
    const lock = t => "[LOCK] " + t, na = () => g("—");
    table(["Field", "Target", "Phase 1 (test units)", "Phase 2 (remainder)", "Match P1? (Y/N)"], [
      [lock("Hardware model / supplier"), "", "", "", ""],
      [lock("Hardware lot # (Phase 2 must use the test-unit lot)"), "", "", "", ""],
      [lock("Target fill weight and tolerance (g net)"), vc ? v(`${n(vc.fill, 3)} ± ${n(vc.tol, 3)}`) : "", "", "", ""],
      [lock("Oil temperature at fill (°F)"), vc ? temp(f.fillF) : "", "", "", ""],
      [lock("Filler / dose setting"), "", "", "", ""],
      [lock("Capping method and press setting"), "", "", "", ""],
      ["Held oil re-warmed to (°F) and re-mixed (min) before fill", "", na(), "", na()],
      ["Units filled (qty)", vc ? v(`${vc.total} total`) : "", "", "", na()],
      ["Date / operator / verifier", "", "", "", na()],
    ], [2.6, 0.9, 1.1, 1.1, 0.7], 18);
  }
  h3("Step sign-offs (from ResinOps)");
  const steps = Array.isArray(batch.steps) ? batch.steps.map(s => s.n) : [];
  const soRows = [];
  for (const step of steps.length ? steps : [...new Set(signoffs.map(s => s.stepName))]) {
    const so = signoffs.find(s => s.stepName === step);
    const signed = TIERS.filter(([t]) => so?.[t + "Id"]);
    if (!signed.length) { soRows.push([step, "", "", "", ""]); continue; }
    for (const [t, label] of signed) {
      const ob = onBehalf(so, t);
      soRows.push([step, label, v(empName(so[t + "Id"])), v(String(so[t + "At"] || "").replace("T", " ").slice(0, 16)), ob ? g(ob.text) : ""]);
    }
  }
  if (!soRows.length) soRows.push(["", "", "", "", ""]);
  table(["Step", "Tier", "Signed By", "Signed At", "Note"], soRows, [1.6, 1, 1.3, 1.1, 1.6], 16);
  if (vc) {
    const every = Math.max(10, Math.round(vc.total / 20 / 5) * 5) || 10, nChk = Math.min(30, Math.floor(Math.max(0, vc.total - 1) / every) + 2);
    h3(phased ? "In-process fill weight checks (Phase 2)" : "In-process fill weight checks");
    text(`${phased ? "Number Phase 2 units from 1. " : ""}Weigh the first unit, then one every ${every} units, and the last unit. Target ${n(vc.fill, 3)} g net, accept ${n(vc.fill - vc.tol, 3)} to ${n(vc.fill + vc.tol, 3)} g. Two in a row out of spec: stop, adjust the filler, and log a deviation.`);
    table(["Check #", "Unit #", "Time", "Empty Unit (g)", "Filled Unit (g)", "Net Fill (g)", "In Spec?", "Initials"],
      Array.from({ length: nChk }, (_, i) => [String(i + 1), g(i === 0 ? "1" : i === nChk - 1 ? (phased ? "last (Phase 2)" : `last (${vc.total})`) : String(i * every)), "", "", "", "", "", ""]), [0.6, 0.9, 0.7, 1, 1, 1, 0.7, 0.7], 16);
  } else {
    if (isRaw) {
      h3("Grind, sift and fill (Phase 1 = test portion, Phase 2 = remainder)");
      text("Fill the Phase 1 column, then stop at Section 5. Before Phase 2, set every [LOCK] row to the Phase 1 value, then record the Phase 2 actual and mark Match.", { size: 8.5, color: GREY });
      const lock = t => "[LOCK] " + t, na = () => g("—");
      table(["Field", "Phase 1 (test portion)", "Phase 2 (remainder)", "Match P1? (Y/N)"], [
        [lock("Grinder setting / screen size"), "", "", ""],
        [lock("Sifter screen mesh (top / bottom)"), "", "", ""],
        [lock("Sifter vibration, load per pass (g), run time (min)"), "", "", ""],
        [lock("Fill method (machine / hand / knockbox) and cycle setting"), "", "", ""],
        [lock("Cone / paper size and type (lot # may differ)"), "", "", ""],
        [lock("Target weight and tolerance (g)"), "", "", ""],
        [lock("Closing method"), "", "", ""],
        ["Flower into grinder (g)", "", "", na()],
        ["Stems / oversize removed on the sifter (g)", "", "", na()],
        ["Accepted flower to fill (g)", "", "", na()],
        ["Phase 2 stem % within ± ____ points of Phase 1 (Y/N)", na(), "", na()],
        ["Units made (qty)", "", "", na()],
        ["Date / operator / verifier", "", "", na()],
      ], [2.8, 1.2, 1.2, 0.8], 18);
    }
    h3(isRaw ? "In-process weight checks (Check # = phase-check: 1-1 is Phase 1, first check)" : "In-process weight checks");
    table(["Check #", "Time", "Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Unit 6", "Unit 7", "Unit 8", "Unit 9", "Unit 10", "Avg (g)", "In Spec?", "Initials"],
      isRaw ? ["1-1", "1-2", "1-3", "2-1", "2-2", "2-3", "2-4", "2-5", "2-6"].map(c => [c, ...Array(14).fill("")]) : blanks(6, 15),
      [0.5, 0.5, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.5, 0.5, 0.5], 17);
    if (isRaw) line("Phase 1 average (g): ________   Phase 2 average (g): ________   Phase 2 within ± ______ g of Phase 1 (Y/N): ____");
  }
  if (joints) {
    h3("Reject rework (unroll and re-roll)");
    text(`After QC${isRaw ? " of each phase" : ""}, every rejected unit goes back to be reworked: unroll it, recover the ${kind === "infused" ? "infused " : ""}flower, and re-roll it into new units at the same settings${isRaw ? " ([LOCK] rows above)" : " (cone type, fill method, target weight)"}. Reworked units must pass the same weight and visual checks before they are added to the batch total. Keep rejects in a labeled container for this batch only. A reworked unit that fails again goes to the waste log unless the SOP allows another rework.`);
    table(["Reject Reason", "Qty"], ["Underweight", "Overweight", "Loose pack / voids", "Bad close / spill", "Torn or damaged paper", "Draw test fail", "Other: ____________"]
      .map(r => [r, ""]).concat([[b("Total rejects"), ""]]), [4, 1.2], 16);
    table(["Rework #", "Rejects In (qty)", "Flower Recovered (g)", "Cones Discarded (qty)", "Re-rolled (qty)", "Passed QC (qty)", "Failed Again (qty)", "Operator / Verifier"],
      blanks(3, 8).concat([[b("Total"), "", "", "", "", "", "", ""]]), [0.6, 0.75, 0.85, 0.8, 0.75, 0.75, 0.75, 1.05], 18);
    fields([["Recovered flower from this batch only, free of paper and debris (Y/N)", ""],
      ["Re-rolled at the same settings: cone type, fill method, target weight (Y/N)", ""],
      ["Every reworked unit weighed and visually checked (100%), all in spec (Y/N)", ""],
      ["Reworked units added to the batch count (qty) and packaged under this batch number", ""],
      ["Units that failed again: disposition (waste log / second rework per SOP)", ""],
      ["Rework verified by (sign / date)", ""]]);
  }
  if (shiftEntries.length) {
    h3("Labor entries (from ResinOps)");
    table(["Date", "Employee", "In", "Out", "Hours", "Task"], shiftEntries.map(e => [fmtDate(e.shiftDate), v(empName(e.employeeId)), e.timeIn || "", e.timeOut || "", e.hoursWorked || "", e.taskNotes || ""]), [0.9, 1.4, 0.6, 0.6, 0.6, 2.4], 16);
  }

  // ── 5. QC, yield, waste ──
  if (isVape) {
    h2("5. Test Samples, Lab Submission and Hold (Phase 1)");
    text("Pull the bulk oil sample from the finished blend after the blend-uniform check. Fill the 3–6 heavy-metal test units from the same blend, on the hardware lot and filler settings Phase 2 will use, so the heavy-metal result covers the hardware the batch ships in.");
    h3("Bulk oil sample (full panel)");
    fields([["Sample weight (g) / container type and ID", vc?.bulkG ? v(`target ${n(vc.bulkG, 1)} g`) : ""], ["Pulled from (top / middle / bottom of the mixed vessel)", ""], ["Pulled by / witness, date and time", ""],
      ["METRC lab sample package tag", ""], ["Tests requested (full panel per lab test plan)", ""]]);
    h3("Heavy-metal test units (3–6)");
    table(["#", "Unit ID", "Hardware Lot #", "Empty Unit (g)", "Filled Unit (g)", "Net Fill (g)", "In Spec?", "Initials"], blanks(6, 8), [0.3, 0.9, 1.2, 0.9, 0.9, 0.9, 0.7, 0.7], 17);
    line("Test units sent: ______ (3 to 6)     METRC lab sample package tag: ______________________");
    h3("Lab submission");
    fields([["Testing lab (name / license #)", ""], ["Sampled by (in-house name / lab sampler name)", ""], ["Transfer manifest #", ""],
      ["Date / time released to the lab", ""], ["Chain of custody signed (Y/N, by)", ""]]);
    h3("Hold (everything waits for the COA)");
    fields([["Bulk oil remaining after sampling (g)", ""], ["Container (material / ID) and storage location", ""], ["Storage temperature (°F) / protected from light (Y/N)", ""],
      ["Sealed with tamper-evident seal (seal #)", ""], ["Hardware of the test-unit lot set aside for Phase 2 (qty / location)", ""],
      ["HOLD labels on bulk oil and hardware (Y/N)", ""], ["ResinOps QC hold entered / METRC package status (Y/N)", ""], ["Hold start date / time, by", ""]]);
    h2("6. COA Review and Phase 2 Release");
    text("Do not fill Phase 2 until this section is complete and QA has signed it.", { bold: true, color: [180, 0, 0] });
  } else if (isRaw) {
    h2("5. Test Portion: Random Sampling, Lab Submission and Hold");
    text("The lab samples stand for the whole batch, so pick them at random from every Phase 1 good unit, not by hand. Number the units 1 to N in production order (trays of known count are fine), generate the random unit numbers and write them down first, then pull exactly those units.");
    fields([["Phase 1 good units produced (N)", ""], ["Units numbered 1 to N in production order (Y/N)", ""],
      ["Samples required by the lab / test plan (units / g)", ""], ["Random number tool (random.org, calculator RAND, random number table)", ""],
      ["Random unit numbers generated (record BEFORE pulling)", ""], ["Selected by / witness", ""]]);
    table(["Sample #", "Random Unit #", "Net Wt (g)", "Sample Container / Tag", "Pulled By", "Witness"], blanks(10, 6), [0.6, 0.9, 0.8, 1.8, 1, 1], 16);
    line("Total units sent: ________   Total grams sent: ________");
    h3("Lab submission");
    fields([["Testing lab (name / license #)", ""], ["Sampled by (in-house name / lab sampler name)", ""], ["METRC lab sample package tag", ""],
      ["Transfer manifest #", ""], ["Date / time released to the lab", ""], ["Tests requested (full panel per lab test plan)", ""], ["Chain of custody signed (Y/N, by)", ""]]);
    h3("Hold (everything waits for the COA)");
    fields([["Phase 1 units: package tag / storage location", ""], ["Remainder flower: weight at hold start (g)", ""],
      ["Remainder flower: container ID / storage location", ""], ["Remainder sealed with tamper-evident seal (seal #)", ""],
      ["HOLD labels on Phase 1 units and remainder (Y/N)", ""], ["ResinOps QC hold entered / METRC package status (Y/N)", ""], ["Hold start date / time, by", ""]]);
    h2("6. COA Review and Phase 2 Release");
    text("Do not start Phase 2 until this section is complete and QA has signed it.", { bold: true, color: [180, 0, 0] });
  } else {
    h2("5. QC Results, Yield Reconciliation and Waste");
  }
  h3("Lab results (linked COAs)");
  if (qcTests.length) {
    table(["Lab", "Sample ID", "Reported", "Total THC %", "Total Terps %", "Micro", "Pest.", "Metals", "Result"],
      qcTests.map(t => [v(t.labName || ""), v(t.sampleId || ""), v(fmtDate(t.dateReported || t.receivedDate || t.dateSubmitted)), v(t.totalThc ?? t.thc ?? ""), v(t.totalTerpenes ?? ""),
        v(passTxt(t.microbialPass ?? t.microbialsPass)), v(passTxt(t.pesticidesPass)), v(passTxt(t.heavyMetalsPass)), v(passTxt(t.overallPass) || "Pending")]),
      [0.9, 1.4, 0.8, 0.7, 0.7, 0.5, 0.5, 0.5, 0.7], 18);
    if (vc) text(`Expected ${n(vc.thc, 1)}% THC from the formula; compare with the lab's total THC above.`, { size: 8.5, color: GREY });
  } else {
    table(["Lab", "Sample ID", "Reported", "Total THC %", "Result"], [["", "", "", "", ""]], [1, 1.4, 0.9, 0.9, 0.9], 20);
  }
  if (phased) {
    h3("COA panel review");
    table(["Panel", "Sample", "Result", "Limit / Spec", "Pass / Fail"], (isVape ? [
      ["Total THC (%)", "Bulk oil"], ["Total terpenes (%)", "Bulk oil"], ["Residual solvents", "Bulk oil"], ["Microbials", "Bulk oil"],
      ["Mycotoxins", "Bulk oil"], ["Pesticides", "Bulk oil"], ["Heavy metals", "Bulk oil"], ["Heavy metals", "Filled test units"], [b("Overall"), ""],
    ] : ["Total THC (%)", "Total cannabinoids (%)", "Total terpenes (%), if tested", "Microbials", "Mycotoxins", "Heavy metals", "Pesticides",
      "Water activity / moisture", "Foreign matter"].map(x => [x, "Phase 1 units"]).concat([[b("Overall"), ""]])
    ).map(r => [...r, "", "", ""]), [2, 1.2, 1, 1, 0.8], 17);
    if (isRaw) {
      h3("Remainder check before Phase 2");
      fields([["Days on hold", ""], ["Seal intact and seal # matches Section 5 (Y/N)", ""],
        ["Storage temperature / RH stayed in range during the hold (log reviewed, Y/N)", ""],
        ["Visual check: no mold, moisture, pests, or odor change (Y/N)", ""],
        ["Remainder weight now (g) / lost on hold = hold start minus now (g; a gain is negative)", ""],
        ["Same source package tag(s) only, nothing added (Y/N)", ""],
        ["Equipment set to the Phase 1 [LOCK] values in Section 4 (Y/N)", ""]]);
    } else h3("Held oil and hardware check before Phase 2");
    if (isVape) fields([["Days on hold", ""], ["Seal intact and seal # matches Section 5 (Y/N)", ""],
      ["Storage temperature stayed in range, protected from light (log reviewed, Y/N)", ""],
      ["Oil appearance: no separation, crystallization, color change, or off odor (Y/N)", ""],
      ["Bulk oil weight now (g) / lost on hold = hold start minus now (g; a gain is negative)", ""],
      ["Phase 2 hardware is the same lot as the test units (Y/N; No = deviation and heavy-metal retest)", ""],
      ["Filler and capper set to the Phase 1 [LOCK] values in Section 4 (Y/N)", ""]]);
    h3("QA decision");
    if (isRaw) text("Circle one:   COA PASS: Phase 2 authorized, Phase 1 units released from hold   /   COA FAIL: do NOT make Phase 2; keep all material on hold, open a deviation (Section 8), and disposition per SOP (retest, remediation, or destruction)");
    else text("Circle one:   COA PASS: Phase 2 fill authorized   /   COA FAIL: do NOT fill Phase 2; keep the oil, test units and hardware on hold, open a deviation (Section 8), and disposition per SOP (retest, remediation, or destruction)");
    table(["Role", "Print Name", "Signature", "Date / Time"], [["QA Reviewer", "", "", ""], ["Production Lead (acknowledged)", "", "", ""]], [1.6, 1.8, 1.8, 1], 24);
    h2(`${S.yield}. Yield Reconciliation and Waste`);
    text("Reconcile once, after Phase 2, across both phases.");
  }
  h3("Material balance");
  const unitG = vc ? vc.fill : null;
  const wasteG = (batch.lossEntries || []).length ? v((batch.lossEntries || []).reduce((a, le) => a + (+le.amountG || 0), 0) + " g") : "";
  const goodG = batch.actual_yield ? v(batch.actual_yield) : batch.actualYieldG ? v(batch.actualYieldG + " g") : "";
  if (isVape) table(["Line", "Item", "Expected", "Recorded"], [
    ["A", "Total blend made (actual total net)", vc ? v(n(vc.blend, 1) + " g") : batch.inputAmt ? v(`${batch.inputAmt} ${batch.unit || "g"}`) : "", ""],
    ["B", `Good units produced, Phase 2 (qty: ______ )${unitG ? " × " + n(unitG, 3) + " g" : ""}`, vc ? v(n(vc.units * vc.fill, 1) + " g") : batch.yieldEst ? v(batch.yieldEst) : "", goodG],
    ["C", "Rejected units (both phases)", "", ""],
    ["D", "Bulk oil sample sent to the lab (Section 5)", vc?.bulkG ? v(n(vc.bulkG, 1) + " g") : "", ""],
    ["E", `Heavy-metal test units sent (qty: ____ )${unitG ? " × " + n(unitG, 3) + " g" : ""}`, "", ""],
    ["F", "Retain samples", "", ""],
    ["G", "Left in equipment / returned to inventory", vc ? v("~" + n(vc.lossG, 1) + " g") : "", ""],
    ["H", "Bulk oil lost during the hold = hold start minus before Phase 2 (Section 6; a gain is negative)", "", ""],
    ["I", "Waste (from waste log)", "", wasteG],
    ["J", "Accounted for = B + C + D + E + F + G + H + I", "", ""], ["K", "Unaccounted variance = A minus J", "", ""], ["L", "Variance % = K ÷ A × 100", "", ""],
  ], [0.4, 3.6, 1.1, 1.1], 18);
  else if (isRaw) table(["Line", "Item", "Expected", "Recorded"], [
    ["A", "Total cannabis input issued", batch.inputAmt ? v(`${batch.inputAmt} ${batch.unit || "g"}`) : "", ""],
    ["A1", "    of which Phase 1 test portion", "", ""], ["A2", "    of which Phase 2 remainder (= A minus A1)", "", ""],
    ["B", "Good units kept (Phase 1 ____ + Phase 2 ____ + reworked ____ ) × unit weight", batch.yieldEst ? v(batch.yieldEst) : "", goodG],
    ["C", "Grind, sift and stem losses (Section 4, both phases)", "", ""],
    ["D", "Rework loss = flower in rejected units minus flower recovered", "", ""],
    ["E", "Lab test samples sent (Section 5, ____ units)", "", ""],
    ["F", "Retain samples", "", ""],
    ["G", "Unused flower returned to inventory", "", ""],
    ["H", "Remainder lost during the hold = hold start minus before Phase 2 (Section 6; a gain is negative)", "", ""],
    ["I", "Waste (from waste log, incl. units that failed rework)", "", wasteG],
    ["J", "Accounted for = B + C + D + E + F + G + H + I", "", ""], ["K", "Unaccounted variance = A minus J", "", ""], ["L", "Variance % = K ÷ A × 100", "", ""],
  ], [0.4, 3.6, 1.1, 1.1], 18);
  else table(["Line", "Item", "Expected", "Recorded"], [
    ["A", vc ? "Total blend made (actual total net)" : "Total input issued", vc ? v(n(vc.blend, 1) + " g") : batch.inputAmt ? v(`${batch.inputAmt} ${batch.unit || "g"}`) : "", ""],
    ["B", `Good units produced (qty: ______ ${joints ? "incl. ____ reworked " : ""})${unitG ? " × " + n(unitG, 3) + " g" : ""}`, vc ? v(n(vc.units * vc.fill, 1) + " g") : batch.yieldEst ? v(batch.yieldEst) : "", batch.actual_yield ? v(batch.actual_yield) : batch.actualYieldG ? v(batch.actualYieldG + " g") : ""],
    ["C", joints ? "Rework loss = flower in rejected units minus flower recovered" : "Rejected units", "", ""], ["D", "Lab and retain samples", vc ? v(n(vc.lab * vc.fill, 1) + " g") : "", ""],
    ["E", "Left in equipment / returned to inventory", vc ? v("~" + n(vc.lossG, 1) + " g") : "", ""],
    ["F", joints ? "Waste (from waste log, incl. units that failed rework)" : "Waste (from waste log)", "", (batch.lossEntries || []).length ? v((batch.lossEntries || []).reduce((a, le) => a + (+le.amountG || 0), 0) + " g") : ""],
    ["G", "Accounted for = B + C + D + E + F", "", ""], ["H", "Unaccounted variance = A minus G", "", ""], ["I", "Variance % = H ÷ A × 100", "", ""],
  ], [0.4, 3.6, 1.1, 1.1], 18);
  line(`Allowed variance per SOP: ______ %. If line ${phased ? "L" : "I"} exceeds it, open a deviation in Section ${S.dev} before release.`);
  h3("Waste log (render unusable per state rules before disposal)");
  table(["Time", "Waste Type", "Weight (g)", "Method Rendered Unusable", "METRC Waste Logged (Y/N)", "Witness 1", "Witness 2"], blanks(3, 7, false), [0.6, 1.6, 0.7, 1.3, 0.9, 0.8, 0.8], 18);

  // ── 6. Packaging, deviations, release ──
  h2(`${S.dev}. Packaging, Labeling, Deviations, and Release`);
  table(["Check", "Entry", "Initials"], [["Units per package", batch.packagingUnitsPerPack ? v(batch.packagingUnitsPerPack) : "", ""], ["Packages produced (qty)", "", ""],
    ...(joints ? [["Reworked units packaged under this batch number (Y/N)", "", ""]] : []),
    ...(isRaw ? [["Phase 1 and Phase 2 units packaged under this batch number (Y/N)", "", ""]] : []),
    ...(isVape ? [["Hardware lot on packaged units matches the heavy-metal test units (Y/N)", "", ""]] : []),
    ["Label potency taken from the product COA, not the calculated value (Y/N)", "", ""], ["Label matches product, strain, weight, and potency on COA (Y/N)", "", ""],
    ["Required state warnings and universal symbol present (Y/N)", "", ""], ["Child-resistant closure verified (Y/N)", "", ""],
    ["Batch / lot number printed on each package (Y/N)", "", ""], ["New METRC package tag(s) created", batch.s2sOutputTags ? v(batch.s2sOutputTags) : "", ""]], [4, 1.6, 0.7], 18);
  h3("Deviations (from ResinOps)");
  if (isRaw) text("Include any [LOCK] mismatch, substitute equipment, a broken hold seal, or Phase 2 stem % or weight outside the Phase 1 range, and QA's retest decision.", { size: 8.5, color: GREY });
  if (isVape) text("Include any [LOCK] mismatch, a different hardware lot in Phase 2, a broken hold seal, or oil that changed on hold, and QA's retest decision.", { size: 8.5, color: GREY });
  table(["#", "Type", "Severity", "What Happened", "Corrective Action", "Status"],
    deviations.length ? deviations.map((d, i) => [String(i + 1), v(d.type || ""), v(d.severity || ""), v(d.title || d.description || ""), v(d.correctiveAction || ""), v(d.status || "")]) : blanks(2, 6),
    [0.3, 1.1, 0.7, 2, 1.8, 0.7], 22);
  if (!deviations.length) line("No deviations this batch (initial): ________");
  h3("Review and release");
  const qcSo = signoffs.filter(s => s.qc_headId).sort((a, c) => String(c.qc_headAt).localeCompare(String(a.qc_headAt)))[0];
  table(["Role", "Name", "Signature", "Date"], [["Production Lead", "", "", ""], ["QA Reviewer", "", "", ""],
    ["QA Release Authority", qcSo ? v(empName(qcSo.qc_headId)) : "", qcSo ? v("e-signed in ResinOps") : "", qcSo ? v(String(qcSo.qc_headAt || "").slice(0, 10)) : ""]], [1.6, 1.8, 1.8, 1], 24);
  const allPass = qcTests.length > 0 && qcTests.every(t => t.overallPass === true);
  line(qcSo ? `Disposition: ${allPass ? "RELEASED" : "ON HOLD"} (QC Head e-signed ${String(qcSo.qc_headAt || "").slice(0, 10)}${allPass ? "; all linked COAs pass" : "; not every linked COA shows PASS"})`
    : "Disposition (circle one):   RELEASED  /  ON HOLD  /  REJECTED");
  line("Comments: " + "_".repeat(92));

  // ── Footer ──
  const pages = doc.getNumberOfPages(), gen = p.generatedAt || new Date().toISOString().slice(0, 10);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text(`${title}   |   ${metrc || "Batch " + (batch.id || "")}   |   Generated ${gen} from ResinOps${p.signed ? " (signed)" : ""}`, M, H - 22, { maxWidth: W - 2 * M - 60 });
    doc.text(`Page ${i} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  doc.setTextColor(0);
  return doc;
}

/** File-system-safe name for a batch's record: the METRC P.B. number when there is one. */
export function batchRecordFileBase(batch) {
  const pb = batch.batchFormulation?.metrcBatch || extractBatchNumbers([batch.name, batch.notes])[0];
  return (pb || String(batch.name || "batch-" + batch.id)).replace(/[^\w.-]+/g, "_").slice(0, 120);
}

/** Folder for the bulk export, mirroring Production - Batch Sheets. */
export function batchRecordFolder(batch) {
  return { vape: "Vapes", preroll: "Pre-Rolls", infused: "Infused Pre-Rolls", edible: "Gummies", other: "Other" }[kindOf(batch)];
}
