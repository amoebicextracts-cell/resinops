// ============================================================
// ResinOps — Batch mass-balance reconciliation
// src/lib/reconciliation.js
//
// Scoped to the BHO/THCa-isolate extraction subcategories that already
// split one intake into multiple tracked fractions today —
// ProductionScheduler's auto-created isLinked HTE/Heads-Tails children,
// plus diamondSauceBatches. Sums every weight already being recorded
// (dewaxPasses/purgeRuns pre/post pairs, each linked batch's actual
// yield, plus a catch-all lossEntries bucket) back against the batch's
// own intake weight — the same "every gram accounted for" reconciliation
// idea Top Secret Workshops' KPI Cost Tracker centers its pitch on.
//
// Informational only (see risk-assessment.md's DI-3 precedent: a
// confirm-before-save check, not a DI-2-style hard release gate) — a
// non-zero delta is a visibility signal for the operator, not something
// that blocks saving or releasing a batch.
// ============================================================

import { inputLbsFromBatch } from './inventory.js';

const G_PER_LB = 453.592;

// Subcategories (all under cat "extract") that produce a linked
// co-product batch or a tracked dewax/purge chain worth reconciling.
// Mirrors the isBhoProduct/isThcaSub checks already used elsewhere in
// ProductionScheduler.jsx.
export const RECONCILABLE_SUBS = ["shatter", "badder", "live_resin", "sugar", "diamonds", "thca_ff", "thca_trim"];

export function isReconcilableBatch(batch) {
  return !!batch && batch.cat === "extract" && RECONCILABLE_SUBS.includes(batch.sub);
}

export function intakeGramsFromBatch(batch) {
  return inputLbsFromBatch(batch) * G_PER_LB;
}

function round1(n) { return Math.round((n + Number.EPSILON) * 10) / 10; }

// Sums (pre - post) across every entry in a dewaxPasses/purgeRuns-style
// array — each entry already records a pre/post weigh-in pair for that
// processing step, so this is real recorded loss, not an estimate.
function stepLossG(entries, preKey, postKey) {
  return (entries || []).reduce((sum, e) => {
    const pre = parseFloat(e[preKey]) || 0;
    const post = parseFloat(e[postKey]) || 0;
    return sum + Math.max(0, pre - post);
  }, 0);
}

export const LOSS_TYPES = [
  { v: "transfer", l: "Transfer loss" },
  { v: "solvent", l: "Residual solvent loss" },
  { v: "decarb_co2", l: "Decarboxylation / CO₂ loss" },
  { v: "other", l: "Other / waste" },
];

// batch: the main (non-linked) production batch.
// linkedBatches: every batch in the same list with linkedTo === batch.id.
// Returns a full breakdown so the UI can show exactly how the delta was
// built, not just the number — same philosophy as lib/cogs.js.
export function calcBatchReconciliation(batch, linkedBatches) {
  const intakeG = intakeGramsFromBatch(batch);

  const dewaxLossG = stepLossG(batch.dewaxPasses, "prePassWeightG", "postPassWeightG");
  const purgeLossG = stepLossG(batch.purgeRuns, "prePurgeWeightG", "postPurgeWeightG");
  // Clamped at 0 -- a negative entry (typo or a stray minus sign) would
  // otherwise subtract from totalLossG instead of adding to it, silently
  // hiding a real imbalance behind a false "balanced" reading.
  const loggedLossLines = (batch.lossEntries || []).map(e => ({ ...e, amountG: Math.max(0, parseFloat(e.amountG) || 0) }));
  const loggedLossG = loggedLossLines.reduce((a, e) => a + e.amountG, 0);
  const totalLossG = dewaxLossG + purgeLossG + loggedLossG;

  // Clamped at 0 for the same reason as loggedLossLines above — a
  // negative yield (typo, or a record saved before this clamp existed)
  // would subtract from totalOutputG instead of adding to it.
  const mainYieldG = Math.max(0, parseFloat(batch.actualYieldG) || 0);
  const linkedYields = (linkedBatches || []).map(lb => ({
    id: lb.id, name: lb.name, yieldG: Math.max(0, parseFloat(lb.actualYieldG) || 0),
  }));
  const linkedYieldG = linkedYields.reduce((a, l) => a + l.yieldG, 0);
  const totalOutputG = mainYieldG + linkedYieldG;

  const deltaG = intakeG - totalOutputG - totalLossG;
  const hasAnyData = mainYieldG > 0 || linkedYieldG > 0 || totalLossG > 0;

  return {
    intakeG: round1(intakeG),
    mainYieldG: round1(mainYieldG),
    linkedYields: linkedYields.map(l => ({ ...l, yieldG: round1(l.yieldG) })),
    linkedYieldG: round1(linkedYieldG),
    dewaxLossG: round1(dewaxLossG),
    purgeLossG: round1(purgeLossG),
    loggedLossLines,
    loggedLossG: round1(loggedLossG),
    totalLossG: round1(totalLossG),
    totalOutputG: round1(totalOutputG),
    deltaG: round1(deltaG),
    hasAnyData,
    // Sub-gram tolerance — these are hand-entered scale readings, not a
    // system that can guarantee exact-integer accounting.
    balanced: hasAnyData && Math.abs(deltaG) < 0.5,
  };
}
