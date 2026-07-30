// ============================================================
// ResinOps — Forward inventory-depletion forecast
// src/lib/forecast.js
//
// Three different treatments for three different consumption types,
// because they have different deduction timing today (see each function's
// comment) — this is deliberately NOT one generic "sum all future usage"
// calculator. Surfaced as InventoryERP.jsx's Depletion Forecast tab.
// ============================================================

import { calcCo2Usage, daysEnrichedForCycle } from './co2.js';

function inWindow(dateStr, windowDays) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  const end = new Date(now); end.setDate(end.getDate() + windowDays);
  return d >= now && d <= end;
}

function stockOnHand(item) {
  return (item.lots || []).reduce((a, l) => a + (l.remaining || 0), 0);
}

// grow_spaces.projectedHarvest is a real, allowlisted column but nothing in
// the app ever writes to it — Scheduler.jsx computes the harvest date live
// from clone_date + a 14-day rooting period + veg/flower weeks (its own
// getSched()) rather than persisting it. Mirror that exact math here
// instead of reading a column that's always null in practice.
const ROOTING_DAYS = 14;
function estimatedHarvestDate(cycle) {
  if (cycle.projectedHarvest) return cycle.projectedHarvest;
  if (!cycle.d) return null;
  const d = new Date(cycle.d + 'T12:00:00');
  const days = ROOTING_DAYS + (parseFloat(cycle.veg) || 0) * 7 + (parseFloat(cycle.flw) || 0) * 7;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// CO2 (cultivation enrichment) is never pre-deducted anywhere in the app —
// nothing withdraws it until a facility manually logs actual usage at
// harvest close-out (HarvestBatches.jsx). Current stock therefore hasn't
// netted out any upcoming cycle yet, so this is a clean forward sum with
// no double-counting risk, unlike BOM materials below.
export function projectCo2Depletion(growSpaces, growRooms, items, windowDays) {
  const byItem = {};
  for (const cycle of growSpaces || []) {
    if (!cycle.co2EnrichmentEnabled) continue;
    if (!inWindow(estimatedHarvestDate(cycle), windowDays)) continue;
    const room = (growRooms || []).find(r => r.id === cycle.growMapId);
    if (!room || !room.co2Method || !room.co2InventoryItemId) continue;
    const usage = calcCo2Usage(room, cycle, daysEnrichedForCycle(cycle));
    if (usage.lbs <= 0) continue;
    byItem[room.co2InventoryItemId] = (byItem[room.co2InventoryItemId] || 0) + usage.lbs;
  }
  return Object.entries(byItem).map(([itemId, projectedNeed]) => {
    const item = (items || []).find(i => i.id === itemId);
    if (!item) return null;
    const stock = stockOnHand(item);
    return { itemId, name: item.n, uom: item.uom, stock, projectedNeed, shortfall: Math.max(0, projectedNeed - stock) };
  }).filter(Boolean);
}

// BOM materials (extraction solvents, packaging, etc.) are already
// deducted from stock at batch CREATION (lib/inventory.js's
// deductForBatch, called from ProductionScheduler.jsx at save time) — so
// current stock already nets out every existing scheduled batch. Re-
// summing projected future batch usage here would double-count it. This
// only flags items already below their reorder point, with lead time
// resolved from each item's most recent purchase order (no per-item
// vendor link exists on inventory_items — the PO history already has the
// same information).
//
// Scoped to items an actual BOM line references — InventoryERP.jsx's own
// "at or below reorder point" banner already covers every item regardless
// of type, so flagging all items here too would just duplicate it (and
// mislabel non-production items, e.g. a cultivation-only supply, as
// "Extraction / Production").
export function projectBomShortfall(items, boms, purchaseOrders, vendors) {
  const referencedItemIds = new Set((boms || []).flatMap(b => (b.items || []).map(l => l.itemId)));
  const flagged = [];
  for (const item of items || []) {
    if (!referencedItemIds.has(item.id)) continue;
    const stock = stockOnHand(item);
    if (stock > (parseFloat(item.reorderAt) || 0)) continue;
    let leadDays = null;
    const posForItem = (purchaseOrders || [])
      .filter(po => (po.items || []).some(l => l.itemId === item.id))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (posForItem.length) {
      const vendor = (vendors || []).find(v => v.id === posForItem[0].vendorId);
      if (vendor?.leadDays) leadDays = parseFloat(vendor.leadDays);
    }
    flagged.push({ itemId: item.id, name: item.n, uom: item.uom, stock, reorderAt: parseFloat(item.reorderAt) || 0, leadDays });
  }
  return flagged;
}

// Cleaning-supply usage is deducted at LOG time (FacilityMap.jsx's
// logClean()), never pre-reserved for a future cleaning — so unlike BOM
// materials, this needs a genuine forward projection based on each
// space's cleaning cadence and its own logged history (no facility-wide
// default product list exists for cleaning the way DEFAULT_BOMS does for
// production, so a space with zero logged history simply can't be
// projected yet — skipped rather than guessed).
export function projectCleaningDepletion(facilityMapSpaces, items, windowDays) {
  const byItem = {};
  for (const space of facilityMapSpaces || []) {
    const intervalDays = parseFloat(space.cleanIntervalDays) || 0;
    const log = space.cleanLog || [];
    if (!intervalDays || !log.length) continue;
    const eventsWithProducts = log.filter(c => (c.productsUsed || []).some(l => l.itemId && parseFloat(l.qty) > 0));
    if (!eventsWithProducts.length) continue;
    const projectedEvents = windowDays / intervalDays;
    const perItemTotals = {};
    for (const ev of eventsWithProducts) {
      for (const line of ev.productsUsed || []) {
        if (!line.itemId || !(parseFloat(line.qty) > 0)) continue;
        perItemTotals[line.itemId] = (perItemTotals[line.itemId] || 0) + parseFloat(line.qty);
      }
    }
    for (const [itemId, total] of Object.entries(perItemTotals)) {
      const avgPerEvent = total / eventsWithProducts.length;
      byItem[itemId] = (byItem[itemId] || 0) + avgPerEvent * projectedEvents;
    }
  }
  return Object.entries(byItem).map(([itemId, projectedNeed]) => {
    const item = (items || []).find(i => i.id === itemId);
    if (!item) return null;
    const stock = stockOnHand(item);
    return { itemId, name: item.n, uom: item.uom, stock, projectedNeed, shortfall: Math.max(0, projectedNeed - stock) };
  }).filter(Boolean);
}
