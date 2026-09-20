import test from 'node:test';
import assert from 'node:assert/strict';

import { transformForDb, transformFromDb } from '../src/lib/dbTransforms.js';

// Regression test for a bug where GMPHub.jsx builds tier field keys by
// string concatenation (tier + "Id" / tier + "At"), which for the
// "qc_head" tier produces "qc_headId"/"qc_headAt" (not fully camelCase,
// since the tier id itself contains an underscore). FIELD_OVERRIDES had
// been keyed on "qcHeadId"/"qcHeadAt" instead, so transformForDb's
// allowlist silently dropped both fields on every save -- QC Head
// sign-offs never persisted, with no error surfaced anywhere.
test('transformForDb persists all four gmp_signoffs tier id/at pairs', () => {
  const record = {
    batchType: 'production',
    batchId: 'batch-1',
    stepName: 'QC / Testing',
    workerId: 'emp-1', workerAt: '2026-01-01T00:00:00.000Z',
    supervisorId: 'emp-2', supervisorAt: '2026-01-01T00:00:00.000Z',
    managerId: 'emp-3', managerAt: '2026-01-01T00:00:00.000Z',
    qc_headId: 'emp-4', qc_headAt: '2026-01-01T00:00:00.000Z',
  };
  const result = transformForDb('gmp_signoffs', record);
  assert.equal(result.worker_id, 'emp-1');
  assert.equal(result.worker_at, '2026-01-01T00:00:00.000Z');
  assert.equal(result.supervisor_id, 'emp-2');
  assert.equal(result.manager_id, 'emp-3');
  assert.equal(result.qc_head_id, 'emp-4');
  assert.equal(result.qc_head_at, '2026-01-01T00:00:00.000Z');
});

test('transformForDb maps the equipment shapeType field to shape_type', () => {
  const result = transformForDb('equipment', { name: 'Chiller', shapeType: 'tank' });
  assert.equal(result.shape_type, 'tank');
});

test('transformForDb sends an empty shapeType as null so choosing Auto clears the override', () => {
  const result = transformForDb('equipment', { name: 'Chiller', shapeType: '' });
  assert.equal(result.shape_type, null);
});

// The shape_type column ships in a separate, manually-applied migration.
// A form that never touched the dropdown must not send the column at all,
// or every equipment save would fail until that migration is applied.
test('transformForDb omits shape_type when the record has no shapeType', () => {
  const result = transformForDb('equipment', { name: 'Chiller', widthIn: 24 });
  assert.equal('shape_type' in result, false);
  assert.equal(result.width_in, 24);
});

test('transformFromDb exposes equipment.shape_type as shapeType too', () => {
  const result = transformFromDb('equipment', { id: 'e1', shape_type: 'rack' });
  assert.equal(result.shapeType, 'rack');
  assert.equal(result.shape_type, 'rack');
});
