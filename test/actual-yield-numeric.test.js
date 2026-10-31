import test from 'node:test';
import assert from 'node:assert/strict';

import { transformFromDb } from '../src/lib/dbTransforms.js';
import { batchBaseUnits, extractActualUnits, extractUnits } from '../src/lib/sales.js';

// Production's actual_yield column is numeric, so PostgREST returns a JS
// number. That crashed the Dashboard with "c.match is not a function".

test('a numeric actual_yield from the database loads as text', () => {
  const row = transformFromDb('production_batches', { id: 'b1', actual_yield: 1200 });
  assert.equal(row.actual_yield, '1200');
  assert.equal(row.actualYield, '1200');
});

test('text actual_yield and missing values pass through unchanged', () => {
  assert.equal(transformFromDb('production_batches', { actual_yield: '1,180 units' }).actual_yield, '1,180 units');
  assert.equal(transformFromDb('production_batches', { actual_yield: null }).actual_yield, null);
});

test('yield helpers never throw on numbers and read bare numbers as the count', () => {
  assert.equal(extractActualUnits(1200), 1200);
  assert.equal(extractActualUnits('1,200'), 1200);
  assert.equal(extractActualUnits('1,180 units'), 1180);
  assert.equal(extractActualUnits('32.4g'), 32.4);
  assert.equal(extractUnits(500), 0);
  assert.equal(extractUnits('~1,455 × 1g carts'), 1455);
});

test('a batch with a recorded numeric actual yield uses it as the base', () => {
  const result = batchBaseUnits({ yieldEst: '~810 × 3.5g jars', actual_yield: 790 });
  assert.equal(result.actualUnits, 790);
  assert.equal(result.baseUnits, 790);
  assert.equal(result.isActual, true);
});
