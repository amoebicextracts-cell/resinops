import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, defaultSteps } from '../src/lib/productCategories.js';
import { facilityCultivates, CULTIVATION_MODULE_ID } from '../src/lib/moduleVisibility.js';
import { defaultCoaLink, isBulkInput, LINK_NEW_PRODUCTION, LINK_NEW_HARVEST, LINK_NONE } from '../src/lib/coaImport.js';

const CULTIVATION_STEPS = /drying|bucking|trimming|curing/i;

test('production templates never include post-harvest (cultivation) steps', () => {
  for (const [key, steps] of Object.entries(STEPS)) {
    const bad = steps.filter((s) => CULTIVATION_STEPS.test(s.n)).map((s) => s.n);
    assert.deepEqual(bad, [], `${key} has ${bad.join(', ')}`);
  }
  assert.deepEqual(defaultSteps('pre_roll', '').map((s) => s.n),
    ['Intake / Prep', 'Grinding', 'Rolling / Filling', 'QC / Testing', 'Packaging', 'Inventory']);
});

test('a facility cultivates unless Harvest Batches is turned off', () => {
  assert.equal(CULTIVATION_MODULE_ID, 'harvest');
  assert.equal(facilityCultivates('commercial', {}), true);
  assert.equal(facilityCultivates('home', {}), true);
  assert.equal(facilityCultivates('commercial', { harvest: false }), false);
  assert.equal(facilityCultivates('commercial', { 'grow-map': false }), true);
  assert.equal(facilityCultivates('commercial', { harvest: true }), true);
});

const preRoll = { productType: 'Raw Pre-Roll', strainName: 'Grape Pie', sampleId: 'S1', batchName: 'Grape Pie Raw Flower Pre-Roll - GPIE-B01' };
const distillate = { productType: 'Bulk Distillate', strainName: 'Distillate - Batch 0022', sampleId: 'S2', batchName: 'Distillate - Batch 0022' };
const unknown = { productType: 'Other', strainName: 'Mystery', sampleId: 'S3' };

test('cultivating facilities keep the original COA link defaults', () => {
  assert.equal(defaultCoaLink(preRoll), LINK_NEW_PRODUCTION);
  assert.equal(defaultCoaLink(distillate), LINK_NEW_PRODUCTION);
  assert.equal(defaultCoaLink(unknown), LINK_NEW_HARVEST);
  const hb = [{ id: 'h1', coaSampleId: 'S3', notes: '' }];
  assert.equal(defaultCoaLink(unknown, { harvestBatches: hb }), 'h:h1');
});

test('non-cultivating facilities never default a COA to a harvest batch', () => {
  const opts = { cultivates: false, harvestBatches: [{ id: 'h1', coaSampleId: 'S3', notes: '' }] };
  assert.equal(defaultCoaLink(preRoll, opts), LINK_NEW_PRODUCTION);
  assert.equal(defaultCoaLink(distillate, opts), LINK_NONE, 'purchased bulk input stays unlinked');
  assert.equal(defaultCoaLink(unknown, opts), LINK_NONE);
  const tag = '1A4120300006C36000000917';
  const pb = [{ id: 'p1', name: 'Some batch', metrcTag: tag }];
  assert.equal(defaultCoaLink({ ...distillate, metrcTag: tag }, { ...opts, productionBatches: pb }), 'p:p1', 'an existing production batch still wins');
});

test('bulk inputs are recognised from product type or batch name', () => {
  assert.equal(isBulkInput(distillate), true);
  assert.equal(isBulkInput({ productType: 'Biomass' }), true);
  assert.equal(isBulkInput({ batchName: 'Sour Diesel Trim' }), true);
  assert.equal(isBulkInput(preRoll), false);
  assert.equal(isBulkInput({ productType: '2g Disposable Vape' }), false);
});
