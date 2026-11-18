import test from 'node:test';
import assert from 'node:assert/strict';

import { calcVapeFormulation, nextRun, vapeBatchNumbers, extractBatchNumbers, flavorCode } from '../src/lib/batchFormulation.js';
import { buildHouseBatchRecordPdf, batchRecordFileBase, batchRecordFolder } from '../src/lib/batchRecordPdf.js';
import { transformForDb } from '../src/lib/dbTransforms.js';

// The 2026-11-18 Terpaja Blast 2 g AIO run, as sized by the Distillate
// Dosing Calculator: 506 sellable + 12 lab, 0.5% hold-up, 4% terpenes,
// Batch 0022 distillate at 87.77%.
const TERPAJA = {
  distDrum: 'Batch 0022', distCoa: '20261106-CHAO-006', potencySource: 'retest', distPotencyPct: '87.77',
  mode: 'terp', terpPct: '4', terps: [{ name: 'Terpaja Blast', share: 100 }],
  labelG: '2', overfillG: '0', tolG: '0.03', sellableUnits: '506', labUnits: '12', holdupPct: '0.5',
  heatF: '150', mixF: '120', fillF: '120',
  metrcBatch: 'GCCNY-TERPAJA2GUZO-DISTY-111826-B03', bulkBatch: 'GCCNY-TERPAJA-DISTY-111826-B03',
};

test('vape formulation matches the calculator for the 11/18 Terpaja run', () => {
  const c = calcVapeFormulation(TERPAJA);
  assert.equal(c.total, 518);
  assert.equal(c.blend.toFixed(1), '1041.2');
  assert.equal(c.dist.toFixed(1), '999.6');
  assert.equal(c.terpG.toFixed(2), '41.65');
  assert.equal(c.thc.toFixed(2), '84.26');
  assert.equal(Math.round(c.mgPerUnit), 1685);
  assert.deepEqual(c.errs, []);
});

test('target-THC mode solves the terpene fraction and rejects impossible targets', () => {
  const c = calcVapeFormulation({ ...TERPAJA, mode: 'thc', targetThcPct: '82.18' });
  assert.equal((c.tf * 100).toFixed(2), '6.37');
  const bad = calcVapeFormulation({ ...TERPAJA, mode: 'thc', targetThcPct: '90' });
  assert.equal(bad.errs.length, 1);
});

test('supplier-COA potency is flagged', () => {
  assert.ok(calcVapeFormulation({ ...TERPAJA, potencySource: 'coa' }).warns.some(w => /supplier COA/.test(w)));
});

test('METRC run numbers count earlier runs, including legacy spellings', () => {
  const used = [
    'GCCNY-TERPAJA2GUZO-DISTY-032526-B01', 'GCCNY-TERPAJA2GUZO-DISTY-052726-B02', 'GCCNY-TERPAJA1G510-DISTY-052726-B02',
    'GCCNY-TIGER-2GUZO-052126-B02', 'GCCNY-NYCDIESEL-1GIPR-071426-BO2',
  ];
  assert.equal(nextRun('TERPAJA', '2GUZO-DISTY', used), 3);
  assert.equal(nextRun('TIGER', '2GUZO-DISTY', used), 3);
  assert.equal(nextRun('WEDDING', '2GUZO-DISTY', used), 1);
  const nb = vapeBatchNumbers({ product: 'Terpaja Blast', labelG: 2, isAio: true, dateISO: '2026-11-19', used: [...used, TERPAJA.metrcBatch] });
  assert.equal(nb.fin, 'GCCNY-TERPAJA2GUZO-DISTY-111926-B04');
  assert.equal(nb.bulk, 'GCCNY-TERPAJA-DISTY-111926-B04');
  assert.equal(flavorCode("Tiger's Blood"), 'TIGER');
});

test('batch numbers are found in ResinOps batch names', () => {
  assert.deepEqual(extractBatchNumbers(['Tigers Blood 2g Uzo Disposable Vape - GCCNY-TIGER2GUZO-DISTY-111826-B03', 'no number']), ['GCCNY-TIGER2GUZO-DISTY-111826-B03']);
});

test('batch_formulation is persisted by transformForDb', () => {
  const r = transformForDb('production_batches', { name: 'x', batchFormulation: TERPAJA });
  assert.deepEqual(r.batch_formulation, TERPAJA);
});

test('house batch record builds for a vape with sign-offs and a COA, and for a batch with no formulation', () => {
  const batch = { id: 'b1', name: 'Terpaja Blast 2g Uzo Disposable Vape - GCCNY-TERPAJA2GUZO-DISTY-111826-B03', cat: 'vape', sub: 'disposable',
    catLabel: 'Vape', subLabel: 'AIO / Disposable', strains: 'Terpaja Blast', d: '2026-11-18', inputAmt: 1041.2, unit: 'g',
    steps: [{ n: 'Formulation' }, { n: 'Filling' }, { n: 'QC / Testing' }], batchFormulation: TERPAJA };
  const signoffs = [{ stepName: 'Filling', workerId: 'e1', workerAt: '2026-11-18T15:00:00Z' },
    { stepName: 'QC / Testing', workerId: 'e1', workerAt: '2026-11-25T10:00:00Z', qc_headId: 'e2', qc_headAt: '2026-11-26T10:00:00Z' }];
  const qcTests = [{ labName: 'Green Analytics NY', sampleId: '20261125-CHAO-001', totalThc: 84.1, overallPass: true, microbialPass: true, pesticidesPass: true, heavyMetalsPass: true }];
  const doc = buildHouseBatchRecordPdf({ batch, facility: { facility_name: 'GCC NY Operations' }, signoffs, qcTests, empName: id => ({ e1: 'Pat Worker', e2: 'Quinn QC' })[id], generatedAt: '2026-11-26' });
  assert.ok(doc.getNumberOfPages() >= 4);
  const pdf = doc.output();
  for (const s of ['GCCNY-TERPAJA2GUZO-DISTY-111826-B03', 'Quinn QC', '20261125-CHAO-001', '999.6', 'RELEASED']) assert.ok(pdf.includes(s), s);
  assert.equal(batchRecordFileBase(batch), 'GCCNY-TERPAJA2GUZO-DISTY-111826-B03');
  assert.equal(batchRecordFolder(batch), 'Vapes');

  const legacy = { id: 'b2', name: 'Grape Pie Raw Flower Pre-Roll - GCCNY-GPIE-1GRPR-110526-B01', cat: 'pre_roll', strains: 'Grape Pie', inputAmt: 0 };
  const doc2 = buildHouseBatchRecordPdf({ batch: legacy });
  assert.ok(doc2.output().includes('Pre-Roll Batch Record'));
  assert.equal(batchRecordFolder(legacy), 'Pre-Rolls');
});
