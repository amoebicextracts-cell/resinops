// ============================================================
// ResinOps — Shared cost-of-goods-sold calculation engine
// src/lib/cogs.js
//
// The single COGS/margin calculator for Finance.jsx, BatchDashboard.jsx,
// and any future report — replaces three previously-independent
// calculators that disagreed with each other for the same batch
// (different testing-fee logic, different SKU matching, no shared
// source of truth). Built on the existing BOM-resolution helpers in
// lib/inventory.js (unchanged) and revenue helpers in lib/revenue.js.
//
// COGS is assembled from four components, matching how a real IRC §263A
// capitalization schedule is built:
//   - materials      — direct materials from a batch's matched BOM
//   - direct labor    — hours logged against this batch's own labor lines
//                        (trim techs, extraction techs — people whose time
//                        is naturally tracked per batch)
//   - cultivation     — a grow space's media/nutrients/IPM/other costs,
//                        allocated across the batches sourced from it
//   - overhead        — named indirect cost pools (rent, utilities,
//                        depreciation, indirect/QA labor, insurance),
//                        allocated across batches sharing the pool's
//                        period by whatever basis the pool specifies
//
// Every allocation function returns both a total AND per-line detail
// (which BOM item, which cost pool, etc.) so the UI can show — and a
// demo can explain — exactly how a number was built, not just the
// number itself.
// ============================================================

import { resolveBom, lineQty, inputLbsFromBatch, estUnitsFromBatch } from './inventory.js';
import { bookedRevenueForBatch } from './revenue.js';

function fmtN(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// ── Materials ────────────────────────────────────────────────────────────
export function calcMaterialCost(batch, boms, items, cogsRecord) {
  const record = cogsRecord || {};
  let materialCost = 0;
  const materialLines = [];

  if (record.materialCostOverride !== undefined && record.materialCostOverride !== null && record.materialCostOverride !== '') {
    return { materialCost: parseFloat(record.materialCostOverride) || 0, materialLines: [], bom: resolveBom(batch, boms) };
  }

  const bom = resolveBom(batch, boms);
  if (bom && !record.overrideMaterials) {
    for (const line of bom.items || []) {
      const item = (items || []).find(x => x.id === line.itemId);
      if (!item) continue;
      const qty = lineQty(line, batch);
      const uc = item.lastCost || 0;
      const cost = qty * uc;
      materialCost += cost;
      materialLines.push({ name: item.n, qty: fmtN(qty), uom: item.uom, unitCost: uc, cost: fmtN(cost) });
    }
  } else if (record.manualMaterials) {
    for (const m of record.manualMaterials || []) {
      materialCost += parseFloat(m.cost) || 0;
      materialLines.push(m);
    }
  }

  return { materialCost, materialLines, bom };
}

// ── Direct labor ─────────────────────────────────────────────────────────
export function directLaborHours(cogsRecord) {
  return ((cogsRecord && cogsRecord.laborLines) || []).reduce((a, l) => a + (parseFloat(l.hours) || 0), 0);
}

export function calcDirectLaborCost(cogsRecord, laborTypes) {
  const record = cogsRecord || {};
  if (record.laborCostOverride !== undefined && record.laborCostOverride !== null && record.laborCostOverride !== '') {
    return { directLaborCost: parseFloat(record.laborCostOverride) || 0, directLaborLines: [] };
  }
  const directLaborLines = [];
  let directLaborCost = 0;
  for (const line of record.laborLines || []) {
    const lt = (laborTypes || []).find(x => x.id === line.laborTypeId);
    if (!lt) continue;
    const hours = parseFloat(line.hours) || 0;
    const cost = hours * (parseFloat(lt.rate) || 0);
    directLaborCost += cost;
    directLaborLines.push({ laborTypeId: lt.id, name: lt.n || lt.name, hours: fmtN(hours), rate: lt.rate, cost: fmtN(cost) });
  }
  return { directLaborCost, directLaborLines };
}

// ── Cultivation cost allocation ─────────────────────────────────────────
// Allocates one grow space's flat media/nutrients/IPM/other total across
// every production batch sourced (via harvestBatchId -> harvest_batches
// .spaceId) from that space. "batch_weight" splits by each batch's own
// input weight share; "time_occupied" splits at the harvest-batch level
// by how long each harvest's grow cycle (grow space clone date -> harvest
// date) occupied the space relative to other harvests from it, then
// carries that harvest's share down to its production batches by weight.
export function calcCultivationCost(batch, cultivationCosts, harvestBatches, allProductionBatches, growSpaces) {
  if (!batch.harvestBatchId) return { cultivationCost: 0, cultivationLines: [] };
  const hb = (harvestBatches || []).find(h => h.id === batch.harvestBatchId);
  if (!hb || !hb.spaceId) return { cultivationCost: 0, cultivationLines: [] };
  const cc = (cultivationCosts || []).find(c => c.spaceId === hb.spaceId);
  if (!cc) return { cultivationCost: 0, cultivationLines: [] };

  const total = (parseFloat(cc.media) || 0) + (parseFloat(cc.nutrients) || 0) + (parseFloat(cc.ipm) || 0) + (parseFloat(cc.other) || 0);
  if (total <= 0) return { cultivationCost: 0, cultivationLines: [] };

  const siblingBatches = (allProductionBatches || []).filter(b => {
    if (!b.harvestBatchId) return false;
    const bhb = (harvestBatches || []).find(h => h.id === b.harvestBatchId);
    return bhb && bhb.spaceId === hb.spaceId;
  });
  if (!siblingBatches.length) return { cultivationCost: 0, cultivationLines: [] };

  let harvestShare = total;
  if (cc.allocationBasis === 'time_occupied') {
    const space = (growSpaces || []).find(s => s.id === hb.spaceId);
    const siblingHarvestIds = [...new Set(siblingBatches.map(b => b.harvestBatchId))];
    const siblingHarvests = (harvestBatches || []).filter(h => siblingHarvestIds.includes(h.id));
    const spanDays = (hbRow) => {
      if (!space?.d || !hbRow.harvestDate) return 1;
      const days = Math.round((new Date(hbRow.harvestDate) - new Date(space.d)) / 86400000);
      return days > 0 ? days : 1;
    };
    const totalSpan = siblingHarvests.reduce((a, h) => a + spanDays(h), 0);
    const thisSpan = spanDays(hb);
    harvestShare = totalSpan > 0 ? total * (thisSpan / totalSpan) : total / siblingHarvests.length;
  }

  // Split this harvest's share across its own production batches by weight.
  const harvestSiblings = siblingBatches.filter(b => b.harvestBatchId === hb.id);
  const totalW = harvestSiblings.reduce((a, b) => a + inputLbsFromBatch(b), 0);
  const thisW = inputLbsFromBatch(batch);
  const share = totalW > 0 ? harvestShare * (thisW / totalW) : harvestShare / harvestSiblings.length;

  return {
    cultivationCost: share,
    cultivationLines: [{ spaceId: hb.spaceId, roomName: hb.roomName, total: fmtN(total), basis: cc.allocationBasis || 'batch_weight', share: fmtN(share) }],
  };
}

// ── Indirect overhead (cost pools) — the §263A allocation engine ────────
function periodKey(dateStr, period) {
  // Date-only strings ("2026-07-01") parse as UTC midnight per spec — using
  // local getters here would shift dates near a month boundary into the
  // wrong month in negative-UTC-offset timezones. Use UTC getters throughout
  // so the period always matches the calendar date as written.
  const d = new Date(dateStr || Date.now());
  if (period === 'annual') return String(d.getUTCFullYear());
  if (period === 'quarterly') return d.getUTCFullYear() + '-Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

export function calcAllocatedOverhead(batch, costPools, allBatches, cogsRecordsByBatchId) {
  const overheadLines = [];
  let allocatedOverhead = 0;

  for (const pool of (costPools || []).filter(p => p.active !== false)) {
    const periodBatches = (allBatches || []).filter(b => !b.isLinked && b.d && periodKey(b.d, pool.period) === periodKey(batch.d, pool.period));
    if (!periodBatches.length || !periodBatches.some(b => b.id === batch.id)) continue;

    const poolAmount = (parseFloat(pool.periodAmount) || 0) * (parseFloat(pool.productionPct ?? 100) / 100);
    if (poolAmount <= 0) continue;

    let share;
    if (pool.allocationBasis === 'flat_per_batch') {
      share = poolAmount / periodBatches.length;
    } else if (pool.allocationBasis === 'unit_count') {
      const totalUnits = periodBatches.reduce((a, b) => a + (parseInt(b.actualUnits || 0) || estUnitsFromBatch(b)), 0);
      const thisUnits = parseInt(batch.actualUnits || 0) || estUnitsFromBatch(batch);
      share = totalUnits > 0 ? poolAmount * (thisUnits / totalUnits) : poolAmount / periodBatches.length;
    } else if (pool.allocationBasis === 'labor_hours') {
      const totalHrs = periodBatches.reduce((a, b) => a + directLaborHours(cogsRecordsByBatchId?.[b.id]), 0);
      const thisHrs = directLaborHours(cogsRecordsByBatchId?.[batch.id]);
      share = totalHrs > 0 ? poolAmount * (thisHrs / totalHrs) : poolAmount / periodBatches.length;
    } else { // batch_weight (default)
      const totalW = periodBatches.reduce((a, b) => a + inputLbsFromBatch(b), 0);
      const thisW = inputLbsFromBatch(batch);
      share = totalW > 0 ? poolAmount * (thisW / totalW) : poolAmount / periodBatches.length;
    }

    if (share > 0) {
      overheadLines.push({ poolId: pool.id, name: pool.name, category: pool.category, allocationBasis: pool.allocationBasis, share: fmtN(share) });
      allocatedOverhead += share;
    }
  }

  return { allocatedOverhead, overheadLines };
}

// ── Full batch COGS ──────────────────────────────────────────────────────
export function calcBatchCOGS(batch, ctx) {
  const { boms = [], cogsRecords = [], items = [], laborTypes = [], costPools = [], cultivationCosts = [], harvestBatches = [], growSpaces = [], allBatches = [] } = ctx || {};
  const record = cogsRecords.find(r => r.batchId === batch.id) || {};
  const cogsRecordsByBatchId = Object.fromEntries(cogsRecords.map(r => [r.batchId, r]));

  const { materialCost, materialLines, bom } = calcMaterialCost(batch, boms, items, record);
  const { directLaborCost, directLaborLines } = calcDirectLaborCost(record, laborTypes);
  const testFee = parseFloat(record.testFee !== undefined && record.testFee !== null && record.testFee !== '' ? record.testFee : (bom?.testFee || 350));
  const { cultivationCost, cultivationLines } = record.cultCost !== undefined && record.cultCost !== null && record.cultCost !== ''
    ? { cultivationCost: parseFloat(record.cultCost) || 0, cultivationLines: [] }
    : calcCultivationCost(batch, cultivationCosts, harvestBatches, allBatches.length ? allBatches : [batch], growSpaces);
  const { allocatedOverhead, overheadLines } = calcAllocatedOverhead(batch, costPools, allBatches.length ? allBatches : [batch], cogsRecordsByBatchId);

  const totalCOGS = materialCost + directLaborCost + testFee + cultivationCost + allocatedOverhead;
  const estUnits = estUnitsFromBatch(batch);
  const actualUnits = parseInt(record.actualUnits || 0) || estUnits;
  const units = actualUnits || 1;

  return {
    materialCost: fmtN(materialCost), materialLines,
    directLaborCost: fmtN(directLaborCost), directLaborLines,
    testFee: fmtN(testFee),
    cultivationCost: fmtN(cultivationCost), cultivationLines,
    allocatedOverhead: fmtN(allocatedOverhead), overheadLines,
    totalCOGS: fmtN(totalCOGS),
    cogsPerUnit: fmtN(totalCOGS / units),
    estUnits, actualUnits, bom,
    // Everything above is what this app computed as capitalizable COGS.
    // deductibleTotal separately excludes anything a facility explicitly
    // flagged as not-COGS-eligible via record.nonDeductible, so the demo
    // can show the split rather than implying every dollar here is
    // automatically defensible without review.
    deductibleTotal: fmtN(record.nonDeductible ? 0 : totalCOGS),
    nonDeductibleTotal: fmtN(record.nonDeductible ? totalCOGS : 0),
  };
}

// ── Batch P&L (COGS + revenue) ───────────────────────────────────────────
export function batchPnL(batch, ctx) {
  const { cogsRecords = [], skus = [], salesOrders = [] } = ctx || {};
  const cogs = calcBatchCOGS(batch, ctx);
  const record = cogsRecords.find(r => r.batchId === batch.id) || {};
  const booked = bookedRevenueForBatch(batch.id, salesOrders);
  const hasBookedOrders = booked.units > 0;
  const unitsSold = hasBookedOrders ? booked.units : parseInt(record.unitsSold || 0);
  const sku = skus.find(s => s.id === record.skuPriceId);
  const revPerUnit = hasBookedOrders ? (booked.revenue / booked.units) : parseFloat(record.revPerUnit || sku?.price || 0);
  const totalRevOverride = parseFloat(record.totalRevOverride || 0);
  const totalRev = totalRevOverride || (hasBookedOrders ? booked.revenue : (revPerUnit * unitsSold));
  const grossProfit = totalRev - cogs.totalCOGS;
  const grossMargin = totalRev > 0 ? (grossProfit / totalRev * 100) : 0;
  return { ...cogs, unitsSold, revPerUnit, totalRev, totalRevOverride, grossProfit, grossMargin, sku, hasBookedOrders };
}
