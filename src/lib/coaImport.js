// ============================================================
// ResinOps — COA import → batch linking helpers
// src/lib/coaImport.js
//
// A lab COA can belong to a harvest (bulk flower sent for testing) or to
// a finished production batch (a vape, pre-roll, extract lot). The QC
// import used to only know about harvests, so finished-product COAs became
// placeholder harvest batches and never reached the Production Scheduler.
// These pure helpers decide where each COA row should go and build the
// production batch for it; DataManager.jsx does the reads and writes.
// ============================================================

import { inferProductCategory, defaultSteps, catLabel, subLabel } from "./productCategories.js";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const METRC_RE = /^1A4[0-9A-Z]{21}$/i;

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Link choices stored per COA row in the import's "Link" step.
export const LINK_NEW_PRODUCTION = "new_prod";
export const LINK_NEW_HARVEST = "new_harvest";
export const LINK_NONE = "none";
export const harvestLink = (id) => `h:${id}`;
export const productionLink = (id) => `p:${id}`;
export function parseLink(value) {
  const v = String(value || "");
  if (v.startsWith("h:")) return { kind: "harvest", id: v.slice(2) };
  if (v.startsWith("p:")) return { kind: "production", id: v.slice(2) };
  if (v === LINK_NEW_PRODUCTION || v === LINK_NEW_HARVEST || v === LINK_NONE) return { kind: v };
  return { kind: LINK_NEW_HARVEST };
}

export function coaProductType(r) {
  return String(r.productType || r.product_type || r["Product Type"] || r.format || r["Format"] || "").trim();
}

export function coaMetrcTag(r) {
  const t = String(r.metrcTag || r.metrc_tag || r["METRC Tag"] || r["Package ID"] || "").trim();
  return METRC_RE.test(t) ? t.toUpperCase() : "";
}

// The production batch name a COA row stands for. Lab exports usually
// carry it as batchName ("<product> - <lot code>"); fall back to the
// strain plus sample ID so two unnamed COAs never collapse into one batch.
export function coaBatchName(r) {
  const name = String(r.batchName || r.batch_name || "").trim();
  const strain = String(r.strainName || "").trim();
  if (name && norm(name) !== norm(strain)) return name;
  const sample = String(r.sampleId || "").trim();
  return [strain || "Unknown", sample].filter(Boolean).join(" — ");
}

// null when the row gives no hint of a finished product.
export function inferCoaCategory(r) {
  return inferProductCategory(coaProductType(r)) || inferProductCategory(r.batchName || r.batch_name);
}

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function isoField(r, ...keys) {
  for (const k of keys) {
    const v = String(r[k] || "").trim();
    if (ISO_RE.test(v)) return v;
  }
  return "";
}

// Start date for a production batch reconstructed from its COA. Backs off
// from the date the sample went to the lab by the length of the steps
// before "QC / Testing", so the scheduler's testing step lines up with the
// real submission. A lot/production date is only used when there is no
// submission date: default templates (pre-roll starts with drying and
// curing) would otherwise push QC weeks past when it really happened.
export function coaStartDate(r, steps, today) {
  const qcIdx = steps.findIndex((s) => /qc|testing/i.test(s.n));
  const before = (qcIdx === -1 ? [] : steps.slice(0, qcIdx)).reduce((a, s) => a + (Number(s.days) || 0), 0);
  const submitted = isoField(r, "submittedDate", "submitted_date");
  if (submitted) return addDays(submitted, -before);
  const produced = isoField(r, "productionDate", "production_date");
  if (produced) return produced;
  const reported = isoField(r, "receivedDate", "received_date");
  if (reported) return addDays(reported, -before);
  return today;
}

export function buildProductionBatchFromCoa(r, { id, cat, sub, today }) {
  const steps = defaultSteps(cat, sub);
  const metrcTag = coaMetrcTag(r);
  const sample = String(r.sampleId || "").trim();
  return {
    id,
    name: coaBatchName(r),
    cat,
    sub: sub || "",
    catLabel: catLabel(cat),
    subLabel: subLabel(cat, sub),
    strains: String(r.strainName || "").trim(),
    d: coaStartDate(r, steps, today),
    // The scheduler derives progress from d + steps; a reported COA means
    // the batch already went through testing.
    status: r.receivedDate ? "complete" : "in_progress",
    inputAmt: 0,
    unit: "g",
    steps,
    isLinked: false,
    inputSource: "manual",
    ...(metrcTag ? { metrcTag } : {}),
    notes: [
      `Created from COA import (${sample || "no sample ID"})`,
      isoField(r, "productionDate", "production_date") && `Lot date ${isoField(r, "productionDate", "production_date")}`,
      "Start date set so QC / Testing begins on the lab submission date",
    ].filter(Boolean).join(" · "),
  };
}

// Existing production batch this COA belongs to: same METRC package tag,
// else same batch name.
export function matchProductionBatch(r, productionBatches) {
  const tag = coaMetrcTag(r);
  if (tag) {
    const byTag = productionBatches.find((b) => String(b.metrcTag || "").toUpperCase() === tag);
    if (byTag) return byTag;
  }
  const name = norm(coaBatchName(r));
  return productionBatches.find((b) => norm(b.name) === name) || null;
}

export function matchHarvestBatch(r, harvestBatches) {
  const sample = String(r.sampleId || "").trim();
  if (!sample) return null;
  return harvestBatches.find((b) => String(b.coaSampleId || "").trim() === sample && !isCoaPlaceholderHarvest(b)) || null;
}

export function isCoaPlaceholderHarvest(b) {
  return /^Auto-created from passing COA import/.test(String(b?.notes || ""));
}

// Default link for a COA row: an existing batch it clearly belongs to,
// else a new production batch when it's a finished product, else the old
// behaviour (placeholder harvest batch).
export function defaultCoaLink(r, { harvestBatches = [], productionBatches = [] } = {}) {
  const pb = matchProductionBatch(r, productionBatches);
  if (pb) return productionLink(pb.id);
  const hb = matchHarvestBatch(r, harvestBatches);
  if (hb) return harvestLink(hb.id);
  return inferCoaCategory(r) ? LINK_NEW_PRODUCTION : LINK_NEW_HARVEST;
}
