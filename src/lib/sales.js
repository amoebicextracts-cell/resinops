// ============================================================
// ResinOps — Shared sales/batch-yield primitives
// src/lib/sales.js
//
// Extracted from SalesOrders.jsx so the unit-parsing and committed-
// quantity math can't silently drift between SalesOrders.jsx's presell-
// throttled "available to advertise" number and Dashboard.jsx's demand-
// side "true physical remaining supply" number -- the two are
// deliberately different calculations (see batchAvailability() in
// SalesOrders.jsx vs. batchPhysicalAvailable() in Dashboard.jsx), but
// both need to agree on how many units a batch actually yielded and how
// many are already spoken for.
// ============================================================

export function extractUnits(yieldEst) {
  if (!yieldEst) return 0;
  const m = yieldEst.match(/([\d,]+)\s*(?:×|units|cones|carts|AIOs|bottles)/);
  if (m) return parseInt(m[1].replace(/,/g,""));
  // Bulk/weight-sold concentrate output (e.g. "~180g hash rosin") has no
  // discrete unit count -- fall back to grams so weight-based products get
  // a real signal instead of always reading as 0.
  const g = yieldEst.match(/([\d,.]+)\s*g\b/i);
  return g ? parseFloat(g[1].replace(/,/g,"")) : 0;
}

export function extractActualUnits(actualYield) {
  if (!actualYield) return 0;
  const m = actualYield.match(/([\d,]+)\s*units?/i);
  if (m) return parseInt(m[1].replace(/,/g,""));
  const g = actualYield.match(/([\d,.]+)\s*g\b/i);
  return g ? parseFloat(g[1].replace(/,/g,"")) : 0;
}

export function batchBaseUnits(b) {
  const estUnits = extractUnits(b.yieldEst);
  // actualYieldG (PR #86's reconciliation-ledger field) is a clean recorded
  // number in grams for extract batches -- prefer it over parsing the
  // free-text actual_yield field when it's actually been entered.
  const structuredActualG = parseFloat(b.actualYieldG) || 0;
  const actualUnits = structuredActualG > 0 ? structuredActualG : extractActualUnits(b.actual_yield);
  return { estUnits, actualUnits, baseUnits: actualUnits || estUnits, isActual: !!actualUnits };
}

export function committedUnits(batchId, orders) {
  return orders.filter(o=>o.status!=="canceled").reduce((a,o)=>
    a + (o.lines||[]).filter(l=>l.batchId===batchId).reduce((aa,l)=>aa+(parseInt(l.qty)||0),0), 0);
}

export function qcHoldSet(qcTests) {
  return new Set(
    qcTests.filter(t=>t.onHold&&t.batchType==="production"&&t.productionBatchId)
      .map(t=>String(t.productionBatchId))
  );
}
