// ============================================================
// ResinOps — Shared supply-forecast primitives
// src/lib/supplyForecast.js
//
// Projects a still-growing grow_spaces strain row's eventual harvest
// output (total dry weight + per-grade split) from the facility's own
// completed harvest_batches history for that strain -- falling back to
// a facility-wide average across all strains when the specific strain
// has no completed harvests yet. Used by Scheduler.jsx (to show a
// grower what a cycle is likely to yield, and to let them earmark that
// projected output per grade for a planned end product) and by
// Dashboard.jsx (to show whether an urgent "needs a new batch" product
// has relief already scheduled).
// ============================================================

const GRADE_KEYS = ["a", "b", "c", "trim"];

// Harvest batches saved before the grades jsonb column existed store each
// grade as its own flat legacy column (grade_a_g, trim_g, etc.) instead.
// db.js's transformFromDb adds camelCase aliases (gradeA, trimWeight, ...)
// alongside the raw db row rather than replacing it, so both are present
// on anything returned by db.harvest_batches.list() -- mirrors the same
// modern-then-legacy-fallback reconciliation HarvestBatches.jsx's own
// normalizeBatch() already does for display, so a strain's projection
// isn't blind to its own older harvest history.
// "a" and "aa" are two distinct grade tiers that can both carry real
// weight on the same harvest (not an either/or) -- sum them rather than
// picking whichever happens to be truthy first, or the other tier's
// output silently disappears from the projection.
function gradeWeight(hb, key) {
  // "a" and "aa" each need their own modern-then-legacy resolution before
  // summing -- one tier recorded in the modern jsonb and the other only in
  // its legacy flat column (a real possibility on an older, partially-
  // edited harvest) would otherwise short-circuit on the first tier's
  // modern value and never consult the second tier's legacy fallback.
  if (key === "a") {
    const a = parseFloat(hb.grades?.a?.weight) || parseFloat(hb.gradeA) || 0;
    const aa = parseFloat(hb.grades?.aa?.weight) || parseFloat(hb.gradeAA) || 0;
    return a + aa;
  }
  const modern = parseFloat(hb.grades?.[key]?.weight) || 0;
  if (modern > 0) return modern;
  if (key === "b") return parseFloat(hb.gradeB) || 0;
  if (key === "c") return parseFloat(hb.gradeC) || 0;
  if (key === "trim") return parseFloat(hb.trimWeight) || 0;
  return 0;
}

// Matches HarvestBatches.jsx's own normalizeBatch() status canonicalization
// -- QCTesting.jsx (and CSV imports) can persist "complete"/"completed"
// rather than "done", and reading the raw (un-normalized) list() result
// here would otherwise silently exclude that real harvest history.
const DONE_STATUSES = new Set(["done", "complete", "completed"]);

// Completed harvests with a real total weight and plant count -- anything
// else has no basis for a per-plant or grade-split average.
function completedSamples(harvestBatches, strainName) {
  return harvestBatches.filter(hb =>
    DONE_STATUSES.has((hb.status || "").toLowerCase()) &&
    (parseFloat(hb.totalDryWeight) || 0) > 0 &&
    (parseFloat(hb.plants) || 0) > 0 &&
    (!strainName || (hb.strainName || "").toLowerCase() === strainName.toLowerCase())
  );
}

// A harvest can have a real total weight recorded without ever having its
// A/B/C/trim breakdown filled in -- averaging those rows into the grade
// split would silently drag it toward "ungraded" even though that's just
// missing data, not a real 0% split for that tier.
function hasGradeBreakdown(hb) {
  return GRADE_KEYS.some(k => gradeWeight(hb, k) > 0);
}

export function strainGradeProfile(strainName, harvestBatches) {
  let samples = completedSamples(harvestBatches, strainName);
  let usedFallback = false;
  if (samples.length === 0) {
    samples = completedSamples(harvestBatches, null); // facility-wide, any strain
    usedFallback = true;
  }
  if (samples.length === 0) return null;

  const perPlantG = samples.reduce((a, hb) => a + (parseFloat(hb.totalDryWeight) / parseFloat(hb.plants)), 0) / samples.length;

  // Grade split gets its own sample pool -- prefer this strain's own graded
  // harvests, then this strain's ungraded-included pool doesn't apply (no
  // basis), then fall back to any facility harvest that does have a real
  // breakdown recorded, rather than diluting toward zero with ungraded rows.
  let gradeSamples = samples.filter(hasGradeBreakdown);
  if (gradeSamples.length === 0) gradeSamples = completedSamples(harvestBatches, null).filter(hasGradeBreakdown);
  const gradeSplitPct = {};
  for (const k of GRADE_KEYS) {
    gradeSplitPct[k] = gradeSamples.length > 0
      ? gradeSamples.reduce((a, hb) => {
          const total = parseFloat(hb.totalDryWeight) || 0;
          return total > 0 ? a + gradeWeight(hb, k) / total : a;
        }, 0) / gradeSamples.length
      : 0;
  }
  return { perPlantG, gradeSplitPct, sampleSize: samples.length, gradeSampleSize: gradeSamples.length, usedFallback };
}

// Returns null if there's no historical basis at all (no completed
// harvests anywhere in the facility yet) -- callers should show "no
// estimate yet" rather than a fabricated number.
export function projectedYieldForStrainRow(strainName, plantCount, harvestBatches) {
  const profile = strainGradeProfile(strainName, harvestBatches);
  if (!profile) return null;
  const totalG = profile.perPlantG * (parseFloat(plantCount) || 0);
  const grades = {};
  for (const k of GRADE_KEYS) grades[k] = totalG * profile.gradeSplitPct[k];
  return { totalG, grades, sampleSize: profile.sampleSize, gradeSampleSize: profile.gradeSampleSize, usedFallback: profile.usedFallback };
}

// Same clone->veg->flower date math as Scheduler.jsx's getSched(), pulled
// out here so Dashboard.jsx's relief calc can't drift from the schedule
// the grower actually sees.
export function harvestDateForSpace(sp) {
  const s = new Date(sp.d + "T12:00:00");
  const tx = new Date(s); tx.setDate(tx.getDate() + 14);
  const fl = new Date(tx); fl.setDate(fl.getDate() + (parseInt(sp.veg) || 4) * 7);
  const hv = new Date(fl); hv.setDate(hv.getDate() + (parseInt(sp.flw) || 9) * 7);
  return hv;
}
