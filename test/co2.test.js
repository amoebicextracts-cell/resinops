import test from 'node:test';
import assert from 'node:assert/strict';

import { calcCo2Usage, daysEnrichedForCycle } from '../src/lib/co2.js';

test('days-enriched defaults to flowering weeks x 7 when not set on the cycle', () => {
  assert.equal(daysEnrichedForCycle({ flw: '8' }), 56);
  assert.equal(daysEnrichedForCycle({ flw: '8', co2DaysEnriched: '40' }), 40);
  assert.equal(daysEnrichedForCycle({}), 0);
});

test('tank/regulator method scales with room volume, ppm delta, ACH, and days', () => {
  const room = { sqft: '100', ceilingHeightFt: '10', co2Method: 'tank', co2PpmTarget: '1200', co2HoursPerDay: '12', co2InjectionRateAch: '0.75' };
  const usage = calcCo2Usage(room, {}, 10);
  assert.equal(usage.roomVolFt3, 1000);
  assert.equal(usage.deltaPpm, 800);
  assert.ok(usage.lbs > 0, 'expected positive lbs for a real enrichment window');
  const doubleDays = calcCo2Usage(room, {}, 20);
  assert.ok(Math.abs(doubleDays.lbs - usage.lbs * 2) < 1e-9, 'usage should scale linearly with days enriched');
});

test('burner method uses the rated CF/hr output directly, not the ACH formula', () => {
  const room = { sqft: '100', ceilingHeightFt: '10', co2Method: 'burner', co2BurnRateCf: '5', co2HoursPerDay: '12' };
  const usage = calcCo2Usage(room, {}, 1);
  assert.equal(usage.gasVolFt3PerDay, 60); // 5 cf/hr * 12 hr
  assert.equal(usage.lbs, 60 * 0.1144);
});

test('cycle-level overrides win over room defaults for ppm target and hours/day', () => {
  const room = { sqft: '100', ceilingHeightFt: '10', co2Method: 'tank', co2PpmTarget: '1200', co2HoursPerDay: '12' };
  const cycle = { co2PpmTargetOverride: '1500', co2HoursPerDayOverride: '18' };
  const usage = calcCo2Usage(room, cycle, 1);
  assert.equal(usage.targetPpm, 1500);
  assert.equal(usage.hoursPerDay, 18);
});

test('zero days enriched yields zero usage', () => {
  const room = { sqft: '100', ceilingHeightFt: '10', co2Method: 'tank' };
  const usage = calcCo2Usage(room, {}, 0);
  assert.equal(usage.lbs, 0);
});
