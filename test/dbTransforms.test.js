import test from 'node:test';
import assert from 'node:assert/strict';

import { transformForDb } from '../src/lib/dbTransforms.js';

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
