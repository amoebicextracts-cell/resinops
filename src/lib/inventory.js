// ============================================================
// ResinOps — Shared inventory consumption logic
// src/lib/inventory.js
//
// Withdraws stock from an inventory item's lots, oldest-lot-first
// (FIFO by lot date) regardless of the item's costing valuation_method
// (that only affects itemCost() display, not physical withdrawal order).
// Used both for manual "reduce stock" adjustments in InventoryERP.jsx
// and for real BOM-driven deduction when a production batch is
// created/completed.
// ============================================================

// Returns { item: updatedItem, withdrawn: number, shortfall: number }.
// withdrawn may be less than qty if there isn't enough stock — shortfall
// reports the difference so callers can warn instead of silently going
// negative.
export function withdrawFifo(item, qty) {
  let remainingToPull = Math.max(0, qty);
  const lots = [...(item.lots || [])]
    .map(l => ({ ...l }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  let withdrawn = 0;
  for (const lot of lots) {
    if (remainingToPull <= 0) break;
    const avail = lot.remaining || 0;
    if (avail <= 0) continue;
    const take = Math.min(avail, remainingToPull);
    lot.remaining = avail - take;
    remainingToPull -= take;
    withdrawn += take;
  }
  return { item: { ...item, lots }, withdrawn, shortfall: Math.max(0, qty - withdrawn) };
}

// Resolves the BOM matching a batch's category|subcategory, mirroring
// Finance.jsx's calcBatchCOGS() qty-scaling logic (per_unit_output /
// per_lb_input / per_batch) so estimated cost and actual deduction always
// agree on how much of each material a batch consumes.
export function resolveBom(batch, boms) {
  return boms.find(b => batch.cat && (b.catSub === batch.cat + "|" + (batch.sub || "") || (b.category === batch.cat && (b.subcategory || "") === (batch.sub || "")))) || null;
}

// Pulled out of lineQty() so lib/cogs.js's cost-pool allocation (weight-
// and unit-based) can share the exact same parsing instead of a second
// copy that could silently drift from what deduction actually uses.
export function inputLbsFromBatch(batch) {
  return (parseFloat(batch.inputAmt) || 0) * (batch.unit === "lb" || batch.unit === "lbs" ? 1 : batch.unit === "kg" ? 2.205 : 1 / 453.592);
}

export function estUnitsFromBatch(batch) {
  const unitMatch = batch.yieldEst?.match(/[\d,]+(?=\s*×|units|cones|carts|AIOs|bottles)/);
  return unitMatch ? parseInt(unitMatch[0].replace(/,/g, "")) : 0;
}

export function lineQty(line, batch) {
  const inputLbs = inputLbsFromBatch(batch);
  const units = parseInt(batch.actualUnits || 0) || estUnitsFromBatch(batch);
  if (line.qtyType === "per_unit_output") return line.qty * units;
  if (line.qtyType === "per_lb_input") return line.qty * inputLbs;
  return line.qty; // per_batch
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Builds the per-line materials breakdown for a batch against a specific
// (already-resolved) BOM. Shared by lib/cogs.js's live BOM-match path and
// deductForBatch's snapshot below, so a batch's live-estimated materials
// and its actually-deducted materials always agree on quantities — the
// two can only diverge on unit cost if items.lastCost changed in between.
export function resolveBomMaterialLines(batch, bom, items) {
  let materialCost = 0;
  const materialLines = [];
  for (const line of bom?.items || []) {
    const item = (items || []).find(x => x.id === line.itemId);
    if (!item) continue;
    const qty = lineQty(line, batch);
    const unitCost = item.lastCost || 0;
    const cost = qty * unitCost;
    materialCost += cost;
    materialLines.push({ name: item.n, qty: round2(qty), uom: item.uom, unitCost, cost: round2(cost) });
  }
  return { materialCost, materialLines };
}

// Deducts every BOM line for a batch from the matching inventory items.
// Returns { updatedItems, shortfalls, bom, materialLines } — updatedItems
// is only the items that actually changed (pass to
// Promise.all(db.inventory_items.upsert)), shortfalls lists any line that
// couldn't be fully covered by stock on hand so the caller can surface a
// warning instead of going negative, and materialLines is the same-shaped
// breakdown calcMaterialCost would produce — callers use it to lock in a
// materials snapshot at the moment of real deduction.
export function deductForBatch(batch, boms, items) {
  const bom = resolveBom(batch, boms);
  if (!bom) return { updatedItems: [], shortfalls: [], bom: null, materialLines: [] };
  const updatedItems = [];
  const shortfalls = [];
  let working = items;
  for (const line of bom.items || []) {
    const item = working.find(x => x.id === line.itemId);
    if (!item) continue;
    const qty = lineQty(line, batch);
    if (qty <= 0) continue;
    const { item: updated, shortfall } = withdrawFifo(item, qty);
    working = working.map(x => x.id === updated.id ? updated : x);
    const existingIdx = updatedItems.findIndex(x => x.id === updated.id);
    if (existingIdx >= 0) updatedItems[existingIdx] = updated;
    else updatedItems.push(updated);
    if (shortfall > 0) shortfalls.push({ itemName: item.n, itemId: item.id, needed: qty, shortfall });
  }
  const { materialLines } = resolveBomMaterialLines(batch, bom, items);
  return { updatedItems, shortfalls, bom, materialLines };
}
