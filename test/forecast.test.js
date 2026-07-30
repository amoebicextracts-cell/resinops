import test from 'node:test';
import assert from 'node:assert/strict';

import { projectCo2Depletion, projectBomShortfall, projectCleaningDepletion } from '../src/lib/forecast.js';

function inDays(n) {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

test('projectCo2Depletion sums usage only for enabled cycles harvesting inside the window', () => {
  const growRooms = [{ id: 'r1', sqft: '100', ceilingHeightFt: '10', co2Method: 'tank', co2InventoryItemId: 'i1' }];
  const items = [{ id: 'i1', n: 'CO2 (Cultivation Enrichment)', uom: 'lb', lots: [{ remaining: 50 }] }];
  const inWindowCycle = { co2EnrichmentEnabled: true, growMapId: 'r1', projectedHarvest: inDays(10), flw: '8' };
  const outOfWindowCycle = { co2EnrichmentEnabled: true, growMapId: 'r1', projectedHarvest: inDays(200), flw: '8' };
  const disabledCycle = { co2EnrichmentEnabled: false, growMapId: 'r1', projectedHarvest: inDays(10), flw: '8' };

  const result = projectCo2Depletion([inWindowCycle, outOfWindowCycle, disabledCycle], growRooms, items, 30);
  assert.equal(result.length, 1);
  assert.equal(result[0].itemId, 'i1');
  assert.equal(result[0].stock, 50);
  assert.ok(result[0].projectedNeed > 0);
});

test('projectCo2Depletion skips cycles whose room has no CO2 item linked', () => {
  const growRooms = [{ id: 'r1', sqft: '100', ceilingHeightFt: '10', co2Method: 'tank' }];
  const cycle = { co2EnrichmentEnabled: true, growMapId: 'r1', projectedHarvest: inDays(5), flw: '8' };
  assert.deepEqual(projectCo2Depletion([cycle], growRooms, [], 30), []);
});

// Regression: grow_spaces.projectedHarvest is a real column but nothing in
// the app ever writes it (Scheduler.jsx computes the harvest date live
// instead of persisting it) — a cycle with no projectedHarvest must still
// be projected using clone_date + rooting + veg/flower weeks, or the
// forecast silently returns nothing for every real cycle in the app.
test('projectCo2Depletion estimates the harvest date from clone_date + veg/flower weeks when projectedHarvest is absent', () => {
  const growRooms = [{ id: 'r1', sqft: '100', ceilingHeightFt: '10', co2Method: 'tank', co2InventoryItemId: 'i1' }];
  const items = [{ id: 'i1', n: 'CO2 (Cultivation Enrichment)', uom: 'lb', lots: [{ remaining: 50 }] }];
  const today = new Date(); today.setHours(0,0,0,0);
  const cloneDate = new Date(today);
  const cycle = { co2EnrichmentEnabled: true, growMapId: 'r1', d: cloneDate.toISOString().split('T')[0], veg: '0', flw: '1' };
  // harvest ≈ clone_date + 14 days rooting + 7 days flower (flw=1) = 21 days out, inside a 30-day window
  const result = projectCo2Depletion([cycle], growRooms, items, 30);
  assert.equal(result.length, 1);
  assert.equal(result[0].itemId, 'i1');
});

test('projectBomShortfall only flags BOM-referenced items at or below reorder point, resolving lead time from the most recent PO', () => {
  const items = [
    { id: 'i1', n: 'Low Item', uom: 'lb', reorderAt: 10, lots: [{ remaining: 5 }] },
    { id: 'i2', n: 'Healthy Item', uom: 'lb', reorderAt: 10, lots: [{ remaining: 50 }] },
    { id: 'i3', n: 'Low Item Not In Any BOM', uom: 'lb', reorderAt: 10, lots: [{ remaining: 5 }] },
  ];
  const boms = [{ id: 'b1', items: [{ itemId: 'i1' }, { itemId: 'i2' }] }];
  const vendors = [{ id: 'v1', leadDays: '14' }];
  const purchaseOrders = [
    { vendorId: 'v1', date: '2026-01-01', items: [{ itemId: 'i1', qty: 100 }] },
    { vendorId: 'v1', date: '2026-06-01', items: [{ itemId: 'i1', qty: 100 }] },
  ];
  const result = projectBomShortfall(items, boms, purchaseOrders, vendors);
  assert.equal(result.length, 1);
  assert.equal(result[0].itemId, 'i1');
  assert.equal(result[0].leadDays, 14);
});

test('projectCleaningDepletion projects only spaces with an interval and logged product history', () => {
  const items = [{ id: 'i10', n: 'Isopropyl Alcohol', uom: 'gal', lots: [{ remaining: 5 }] }];
  const spaces = [
    { cleanIntervalDays: '7', cleanLog: [{ productsUsed: [{ itemId: 'i10', qty: '1' }] }, { productsUsed: [{ itemId: 'i10', qty: '1' }] }] },
    { cleanIntervalDays: '7', cleanLog: [] },
    { cleanIntervalDays: '', cleanLog: [{ productsUsed: [{ itemId: 'i10', qty: '5' }] }] },
  ];
  const result = projectCleaningDepletion(spaces, items, 28);
  assert.equal(result.length, 1);
  assert.equal(result[0].itemId, 'i10');
  // 1 gal/event avg * (28/7 = 4 projected events) = 4
  assert.ok(Math.abs(result[0].projectedNeed - 4) < 1e-9);
});
