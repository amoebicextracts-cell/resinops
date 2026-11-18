// House-format GMP batch record (sections 1-6, same layout as the paper
// Pre-Roll Batch Record the production floor uses).
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
  if (p.signed) text("Signed record: frozen at QC Head Sign & Release.", { size: 9, bold: true, color: BLUE });
  if (vc?.errs.length) text("CHECK BEFORE STARTING: " + vc.errs.join(" "), { size: 9, bold: true, color: [180, 0, 0] });

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
      ["Target Unit Count", v(`${vc.total} filled (${vc.units} sellable + ${vc.lab} lab / retain)`)],
      ["Batch Size (blend)", v(`${n(vc.blend, 1)} g  (includes ${n(vc.lossG, 1)} g hold-up allowance, ${n(vc.loss * 100, 1)}%)`)],
    );
  } else {
    idRows.push(
      ["Input Quantity", batch.inputAmt ? v(`${batch.inputAmt} ${batch.unit || "g"}`) : ""],
      ["Estimated Output", batch.yieldEst ? v(batch.yieldEst) : ""],
    );
  }
  idRows.push(
    ["Master SOP / BOM Reference and Revision", ""], ["Facility / Room", ""],
    ["Production Date", batch.d ? v(fmtDate(batch.d)) : ""], ["Start Time / End Time", ""],
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
  text('Complete before any material enters the room. Any "No" stops the batch until resolved and logged as a deviation in Section 6.');
  const clear = ["Previous batch materials, labels, and paperwork removed",
    kind === "vape" ? "Mixing vessel, stirrer, filler reservoir, and lines cleaned and dry (no previous flavor)" : kind === "infused" ? "Tumbler drum, spray gun, knockbox, trays, and screens cleaned; no previous strain or flavor" : "Work surfaces, grinder, and filling machine cleaned and sanitized",
    "Cleaning log signed for this room and equipment", "No other product, strain, or lot present at the station",
    "Staff in required PPE", "Room temperature (°F) and RH (%) within SOP range: ____ °F / ____ %"];
  table(["Check", "Yes / No", "Initials", "Time"], clear.map(c => [c, "", "", ""]), [4.6, 0.7, 0.7, 0.7]);
  table(["Balance", "Test Weight (g)", "Reading (g)", "Pass (within ± ____ g)?", "Initials"], [["Bulk balance", "", "", "", ""], ["Check-weigh balance (0.01 g)", "", "", "", ""]], [1.7, 1.1, 1.1, 1.5, 0.8]);
  line("Line clearance verified by (QA or Lead, sign / date): ______________________________");

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
      ["Oil temperature at fill (°F)", temp(f.fillF), "", ""], ["Filler / dose setting", "", "", ""], ["Capping method and press setting", "", "", ""],
    ], [3, 1.3, 1, 1], 18);
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
    h3("In-process fill weight checks");
    text(`Weigh the first unit, then one every ${every} units, and the last unit. Target ${n(vc.fill, 3)} g net, accept ${n(vc.fill - vc.tol, 3)} to ${n(vc.fill + vc.tol, 3)} g. Two in a row out of spec: stop, adjust the filler, and log a deviation.`);
    table(["Check #", "Unit #", "Time", "Empty Unit (g)", "Filled Unit (g)", "Net Fill (g)", "In Spec?", "Initials"],
      Array.from({ length: nChk }, (_, i) => [String(i + 1), g(i === 0 ? "1" : i === nChk - 1 ? `last (${vc.total})` : String(i * every)), "", "", "", "", "", ""]), [0.6, 0.9, 0.7, 1, 1, 1, 0.7, 0.7], 16);
  } else {
    h3("In-process weight checks");
    table(["Check #", "Time", "Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5", "Unit 6", "Unit 7", "Unit 8", "Unit 9", "Unit 10", "Avg (g)", "In Spec?", "Initials"], blanks(6, 15), [0.5, 0.5, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.5, 0.5, 0.5], 17);
  }
  if (shiftEntries.length) {
    h3("Labor entries (from ResinOps)");
    table(["Date", "Employee", "In", "Out", "Hours", "Task"], shiftEntries.map(e => [fmtDate(e.shiftDate), v(empName(e.employeeId)), e.timeIn || "", e.timeOut || "", e.hoursWorked || "", e.taskNotes || ""]), [0.9, 1.4, 0.6, 0.6, 0.6, 2.4], 16);
  }

  // ── 5. QC, yield, waste ──
  h2("5. QC Results, Yield Reconciliation and Waste");
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
  h3("Material balance");
  const unitG = vc ? vc.fill : null;
  table(["Line", "Item", "Expected", "Recorded"], [
    ["A", vc ? "Total blend made (actual total net)" : "Total input issued", vc ? v(n(vc.blend, 1) + " g") : batch.inputAmt ? v(`${batch.inputAmt} ${batch.unit || "g"}`) : "", ""],
    ["B", `Good units produced (qty: ______ )${unitG ? " × " + n(unitG, 3) + " g" : ""}`, vc ? v(n(vc.units * vc.fill, 1) + " g") : batch.yieldEst ? v(batch.yieldEst) : "", batch.actual_yield ? v(batch.actual_yield) : batch.actualYieldG ? v(batch.actualYieldG + " g") : ""],
    ["C", "Rejected units", "", ""], ["D", "Lab and retain samples", vc ? v(n(vc.lab * vc.fill, 1) + " g") : "", ""],
    ["E", "Left in equipment / returned to inventory", vc ? v("~" + n(vc.lossG, 1) + " g") : "", ""],
    ["F", "Waste (from waste log)", "", (batch.lossEntries || []).length ? v((batch.lossEntries || []).reduce((a, le) => a + (+le.amountG || 0), 0) + " g") : ""],
    ["G", "Accounted for = B + C + D + E + F", "", ""], ["H", "Unaccounted variance = A minus G", "", ""], ["I", "Variance % = H ÷ A × 100", "", ""],
  ], [0.4, 3.6, 1.1, 1.1], 18);
  line("Allowed variance per SOP: ______ %. If line I exceeds it, open a deviation in Section 6 before release.");
  h3("Waste log (render unusable per state rules before disposal)");
  table(["Time", "Waste Type", "Weight (g)", "Method Rendered Unusable", "METRC Waste Logged (Y/N)", "Witness 1", "Witness 2"], blanks(3, 7, false), [0.6, 1.6, 0.7, 1.3, 0.9, 0.8, 0.8], 18);

  // ── 6. Packaging, deviations, release ──
  h2("6. Packaging, Labeling, Deviations, and Release");
  table(["Check", "Entry", "Initials"], [["Units per package", batch.packagingUnitsPerPack ? v(batch.packagingUnitsPerPack) : "", ""], ["Packages produced (qty)", "", ""],
    ["Label potency taken from the product COA, not the calculated value (Y/N)", "", ""], ["Label matches product, strain, weight, and potency on COA (Y/N)", "", ""],
    ["Required state warnings and universal symbol present (Y/N)", "", ""], ["Child-resistant closure verified (Y/N)", "", ""],
    ["Batch / lot number printed on each package (Y/N)", "", ""], ["New METRC package tag(s) created", batch.s2sOutputTags ? v(batch.s2sOutputTags) : "", ""]], [4, 1.6, 0.7], 18);
  h3("Deviations (from ResinOps)");
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
