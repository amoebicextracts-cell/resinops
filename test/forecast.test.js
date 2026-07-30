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

test('projectBomShortfall only flags items at or below reorder point, resolving lead time from the most recent PO', () => {
  const items = [
    { id: 'i1', n: 'Low Item', uom: 'lb', reorderAt: 10, lots: [{ remaining: 5 }] },
    { id: 'i2', n: 'Healthy Item', uom: 'lb', reorderAt: 10, lots: [{ remaining: 50 }] },
  ];
  const vendors = [{ id: 'v1', leadDays: '14' }];
  const purchaseOrders = [
    { vendorId: 'v1', date: '2026-01-01', items: [{ itemId: 'i1', qty: 100 }] },
    { vendorId: 'v1', date: '2026-06-01', items: [{ itemId: 'i1', qty: 100 }] },
  ];
  const result = projectBomShortfall(items, purchaseOrders, vendors);
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
