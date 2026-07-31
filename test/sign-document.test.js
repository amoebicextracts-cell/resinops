import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSignDocumentPayload } from '../api/_request-security.js';

const validPayload = {
  password: 'correct-horse-battery-staple',
  documentType: 'batch_record',
  documentId: 'batch-123',
  documentLabel: 'Whole Flower — Trimming QC Head release',
  facilityId: 'facility-1',
  pdfBase64: 'JVBERi0xLjQK',
  sha256: 'a'.repeat(64),
};

test('validateSignDocumentPayload accepts a well-formed payload for each document type', () => {
  assert.equal(validateSignDocumentPayload(validPayload), null);
  assert.equal(validateSignDocumentPayload({ ...validPayload, documentType: 'sop' }), null);
  assert.equal(validateSignDocumentPayload({ ...validPayload, documentType: 'deviation' }), null);
});

test('validateSignDocumentPayload rejects an unknown documentType', () => {
  assert.match(validateSignDocumentPayload({ ...validPayload, documentType: 'contract' }), /documentType/i);
});

test('validateSignDocumentPayload rejects a malformed sha256', () => {
  assert.match(validateSignDocumentPayload({ ...validPayload, sha256: 'not-a-hash' }), /sha256/i);
  assert.match(validateSignDocumentPayload({ ...validPayload, sha256: 'a'.repeat(63) }), /sha256/i);
  assert.equal(validateSignDocumentPayload({ ...validPayload, sha256: 'A'.repeat(64) }), null);
});

test('validateSignDocumentPayload rejects an oversized pdfBase64', () => {
  assert.match(validateSignDocumentPayload({ ...validPayload, pdfBase64: 'a'.repeat(11_000_001) }), /pdfBase64/i);
});

test('validateSignDocumentPayload rejects missing required fields', () => {
  assert.match(validateSignDocumentPayload({ ...validPayload, password: '' }), /password/i);
  assert.match(validateSignDocumentPayload({ ...validPayload, documentId: '' }), /documentId/i);
  assert.match(validateSignDocumentPayload({ ...validPayload, documentLabel: '' }), /documentLabel/i);
  assert.match(validateSignDocumentPayload({ ...validPayload, facilityId: '' }), /facilityId/i);
  assert.match(validateSignDocumentPayload({ ...validPayload, pdfBase64: '' }), /pdfBase64/i);
});

test('validateSignDocumentPayload rejects a non-object body', () => {
  assert.match(validateSignDocumentPayload(null), /invalid/i);
  assert.match(validateSignDocumentPayload([]), /invalid/i);
});
