import test from 'node:test';
import assert from 'node:assert/strict';

import { inferProductCategory, defaultSteps, STEPS } from '../src/lib/productCategories.js';
import {
  LINK_NEW_PRODUCTION, LINK_NEW_HARVEST, parseLink,
  coaBatchName, coaMetrcTag, coaStartDate, inferCoaCategory,
  buildProductionBatchFromCoa, matchProductionBatch, defaultCoaLink, isCoaPlaceholderHarvest,
} from '../src/lib/coaImport.js';

// The QC import used to turn every unlinked passing COA into a placeholder
// harvest batch, so finished-product COAs (vapes, pre-rolls) never reached
// the Production Scheduler. These cover the replacement logic.

test('product categories are inferred from lab product types and batch names', () => {
  assert.deepEqual(inferProductCategory('2g Disposable Vape'), { cat: 'vape', sub: 'disposable' });
  assert.deepEqual(inferProductCategory('1g Vape Cartridge'), { cat: 'vape', sub: 'cartridge' });
  assert.deepEqual(inferProductCategory('Raw Pre-Roll'), { cat: 'pre_roll', sub: '' });
  assert.deepEqual(inferProductCategory('Infused Pre-Roll (1g)'), { cat: 'pre_roll', sub: '' });
  assert.deepEqual(inferProductCategory('Bulk Distillate'), { cat: 'extract', sub: 'distillate' });
  assert.deepEqual(inferProductCategory('Bulk Flower'), { cat: 'whole_flower', sub: '' });
  assert.deepEqual(inferProductCategory('Hash Rosin 1g'), { cat: 'extract', sub: 'rosin_hash' });
  assert.deepEqual(inferProductCategory('Wedding Cake 1g IPR - GCCNY-WEDDING-1gIPR-070726-B02'), { cat: 'pre_roll', sub: '' });
  assert.equal(inferProductCategory(''), null);
  assert.equal(inferProductCategory('Wedding Cake'), null);
});

test('vape batches get vape steps, not whole-flower drying and curing', () => {
  const steps = defaultSteps('vape', 'disposable');
  assert.deepEqual(steps, STEPS.disposable);
  assert.ok(!steps.some(s => s.n === 'Drying'));
  steps[0].days = 99; // a fresh copy each call
  assert.notEqual(STEPS.disposable[0].days, 99);
});

const vapeRow = {
  strainName: 'Pineapple Express',
  batchName: 'Pineapple Express 2g Disposable Vape - GCCNY-PINEAPPLE2GUZO-DISTY-102326-B03',
  sampleId: '20261026-CHAO-002',
  productType: '2g Disposable Vape',
  metrcTag: '1A41203000022CF000000863',
  submittedDate: '2026-10-26',
  receivedDate: '2026-11-02',
};

test('a finished-product COA defaults to a new production batch', () => {
  assert.equal(defaultCoaLink(vapeRow), LINK_NEW_PRODUCTION);
  assert.deepEqual(inferCoaCategory(vapeRow), { cat: 'vape', sub: 'disposable' });
});

test('a COA with no product hint keeps the old placeholder-harvest behaviour', () => {
  assert.equal(defaultCoaLink({ strainName: 'Blue Dream', batchName: 'Blue Dream', sampleId: 'X-1' }), LINK_NEW_HARVEST);
});

test('an existing production batch is matched by METRC tag, then by name', () => {
  const byTag = { id: 'pb1', name: 'something else', metrcTag: '1A41203000022CF000000863' };
  const byName = { id: 'pb2', name: '  pineapple express 2g disposable vape - gccny-pineapple2guzo-disty-102326-b03 ' };
  assert.equal(matchProductionBatch(vapeRow, [byName, byTag]).id, 'pb1');
  assert.equal(matchProductionBatch(vapeRow, [byName]).id, 'pb2');
  assert.equal(parseLink(defaultCoaLink(vapeRow, { productionBatches: [byName] })).id, 'pb2');
});

test('a harvest batch already carrying the sample ID is linked, but COA placeholders are not', () => {
  const real = { id: 'hb1', coaSampleId: 'S-9', notes: '' };
  const placeholder = { id: 'hb2', coaSampleId: 'S-9', notes: 'Auto-created from passing COA import (S-9)' };
  assert.ok(isCoaPlaceholderHarvest(placeholder));
  assert.deepEqual(parseLink(defaultCoaLink({ sampleId: 'S-9' }, { harvestBatches: [placeholder, real] })), { kind: 'harvest', id: 'hb1' });
  assert.equal(defaultCoaLink({ sampleId: 'S-9' }, { harvestBatches: [placeholder] }), LINK_NEW_HARVEST);
});

test('start date backs off from lab submission by the steps before QC', () => {
  // disposable: Intake 1 + Formulation 2 + Filling 3 = 6 days before QC / Testing
  assert.equal(coaStartDate(vapeRow, defaultSteps('vape', 'disposable'), '2026-11-09'), '2026-10-20');
  // A lot date never overrides the submission anchor: the pre-roll template
  // starts with ~4 weeks of drying/curing, so starting on the lot date
  // would put QC a month after the sample really went to the lab.
  const preRoll = defaultSteps('pre_roll', '');
  const start = coaStartDate({ submittedDate: '2026-10-26', productionDate: '2026-10-23' }, preRoll, 'x');
  const qcStart = preRoll.slice(0, preRoll.findIndex(s => s.n === 'QC / Testing')).reduce((a, s) => a + s.days, 0);
  assert.equal(new Date(Date.parse(start) + qcStart * 864e5).toISOString().slice(0, 10), '2026-10-26');
  assert.equal(coaStartDate({ productionDate: '2026-10-23' }, preRoll, 'x'), '2026-10-23');
  assert.equal(coaStartDate({}, [], '2026-11-09'), '2026-11-09');
  // crosses a month boundary
  assert.equal(coaStartDate({ submittedDate: '2026-03-02' }, defaultSteps('vape', 'disposable'), 'x'), '2026-02-24');
});

test('builds a scheduler-ready production batch from a COA row', () => {
  const b = buildProductionBatchFromCoa(vapeRow, { id: 'new1', cat: 'vape', sub: 'disposable', today: '2026-11-09' });
  assert.equal(b.name, vapeRow.batchName);
  assert.equal(b.cat, 'vape');
  assert.equal(b.sub, 'disposable');
  assert.equal(b.catLabel, 'Vape');
  assert.equal(b.subLabel, 'AIO / Disposable');
  assert.equal(b.strains, 'Pineapple Express');
  assert.equal(b.metrcTag, '1A41203000022CF000000863');
  assert.equal(b.d, '2026-10-20');
  assert.equal(b.status, 'complete');
  assert.deepEqual(b.steps, STEPS.disposable);
  assert.match(b.notes, /20261026-CHAO-002/);
  assert.match(buildProductionBatchFromCoa({ ...vapeRow, productionDate: '2026-10-23' }, { id: 'n', cat: 'vape', sub: 'disposable', today: 'x' }).notes, /Lot date 2026-10-23/);
});

test('batch names and METRC tags fall back safely', () => {
  assert.equal(coaBatchName({ strainName: 'Gelato', batchName: 'Gelato', sampleId: 'S-1' }), 'Gelato — S-1');
  assert.equal(coaMetrcTag({ metrcTag: '20260806-CHAO-002' }), '');
  assert.equal(coaMetrcTag({ metrcTag: '1a41203000022cf000000863' }), '1A41203000022CF000000863');
});
