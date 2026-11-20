import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStoragePath,
  sanitizeFileName,
  validateCreateUploadPayload,
  validateVersionActionPayload,
} from '../api/_controlled-documents.js';
import {
  compareVersionLabels,
  groupDocuments,
  nextVersionLabel,
  visibleVersions,
} from '../src/lib/documentControl.js';

const DOC_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const VER_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const newVersion = {
  facilityId: 'facility-1',
  documentId: DOC_ID,
  versionLabel: '1.1',
  changelog: 'Added Step B vibratory sifter section.',
  fileName: 'GCCNY-TCOOK-1GRPR-111826-B01.pdf',
  mimeType: 'application/pdf',
  fileSize: 23181,
};
const newDocument = {
  facilityId: 'facility-1',
  newDocument: { docKey: 'GCCNY-TCOOK-1GRPR-111826-B01', title: 'Tropicana Cookies 1 g Pre-Roll', category: 'batch_record', productType: 'Pre-roll' },
  versionLabel: '1.0',
  changelog: 'Initial version.',
  fileName: 'record.pdf',
};

test('create-upload accepts a new version of an existing document', () => {
  assert.equal(validateCreateUploadPayload(newVersion), null);
});

test('create-upload accepts a brand-new document with its first version', () => {
  assert.equal(validateCreateUploadPayload(newDocument), null);
  assert.equal(validateCreateUploadPayload({ ...newDocument, newDocument: { ...newDocument.newDocument, category: 'rd_record', rdDosed: false } }), null);
});

test('every version needs a changelog', () => {
  assert.match(validateCreateUploadPayload({ ...newVersion, changelog: '   ' }), /changelog/i);
  assert.match(validateCreateUploadPayload({ ...newVersion, changelog: undefined }), /changelog/i);
  assert.match(validateCreateUploadPayload({ ...newVersion, changelog: 'x'.repeat(8001) }), /changelog/i);
});

test('version labels must be numeric dotted versions', () => {
  for (const ok of ['1', '1.0', '2.13', '1.2.3']) assert.equal(validateCreateUploadPayload({ ...newVersion, versionLabel: ok }), null, ok);
  for (const bad of ['v1', '1.', '1..2', 'final', '1.2.3.4', '']) assert.match(validateCreateUploadPayload({ ...newVersion, versionLabel: bad }), /versionLabel/, bad);
});

test('documentId and newDocument are mutually exclusive and one is required', () => {
  assert.match(validateCreateUploadPayload({ ...newVersion, newDocument: newDocument.newDocument }), /either/i);
  const { documentId, ...neither } = newVersion;
  assert.equal(documentId, DOC_ID);
  assert.match(validateCreateUploadPayload(neither), /required/i);
});

// documentId reaches the Storage path; it must be a real UUID, never a
// path-traversal-shaped string.
test('documentId must be a UUID', () => {
  assert.match(validateCreateUploadPayload({ ...newVersion, documentId: '../other-facility' }), /UUID/);
});

test('rejects unknown categories, file types, oversize files and bad dates', () => {
  assert.match(validateCreateUploadPayload({ ...newDocument, newDocument: { ...newDocument.newDocument, category: 'contract' } }), /category/);
  assert.match(validateCreateUploadPayload({ ...newVersion, mimeType: 'application/x-msdownload' }), /type/i);
  assert.match(validateCreateUploadPayload({ ...newVersion, fileSize: 26 * 1024 * 1024 }), /fileSize/);
  assert.match(validateCreateUploadPayload({ ...newVersion, effectiveDate: '11/18/2026' }), /effectiveDate/);
  assert.match(validateCreateUploadPayload({ ...newDocument, newDocument: { ...newDocument.newDocument, docKey: '../x' } }), /docKey/);
});

test('version actions need a facility and a UUID versionId', () => {
  assert.equal(validateVersionActionPayload({ facilityId: 'facility-1', versionId: VER_ID }), null);
  assert.match(validateVersionActionPayload({ facilityId: 'facility-1', versionId: 'abc' }), /versionId/);
  assert.match(validateVersionActionPayload({ versionId: VER_ID }), /facilityId/);
  assert.match(validateVersionActionPayload(null), /invalid/i);
});

test('storage paths are scoped by facility/document and file names are sanitized', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'etc-passwd');
  assert.equal(sanitizeFileName('Batch Record (WK 110426).pdf'), 'Batch-Record-WK-110426-.pdf');
  assert.equal(buildStoragePath('fac', DOC_ID, VER_ID, 'a b.pdf'), `fac/${DOC_ID}/${VER_ID}-a-b.pdf`);
});

test('version labels compare numerically and bump correctly', () => {
  assert.ok(compareVersionLabels('1.10', '1.9') > 0);
  assert.ok(compareVersionLabels('2', '1.9') > 0);
  assert.equal(compareVersionLabels('1.0', '1'), 0);
  assert.equal(nextVersionLabel([]), '1.0');
  assert.equal(nextVersionLabel(['1.0', '1.1']), '1.2');
  assert.equal(nextVersionLabel(['1.9', '1.10']), '1.11');
  assert.equal(nextVersionLabel(['1.3'], 'major'), '2.0');
});

test('version history hides pending uploads and lists newest first', () => {
  const versions = [
    { id: 'a', document_id: 'd', version_label: '1.0', status: 'superseded' },
    { id: 'b', document_id: 'd', version_label: '1.1', status: 'current' },
    { id: 'c', document_id: 'd', version_label: '1.2', status: 'pending' },
    { id: 'x', document_id: 'other', version_label: '9.0', status: 'current' },
  ];
  assert.deepEqual(visibleVersions(versions, 'd').map(v => v.id), ['b', 'a']);
});

test('documents group by category with search and retired filters', () => {
  const docs = [
    { id: 'd1', doc_key: 'GCCNY-TCOOK-1GRPR-111826-B01', title: 'Tropicana Cookies', category: 'batch_record', status: 'active' },
    { id: 'd2', doc_key: 'RD-UNDOSED_10mg_BlueRazDream_2026-10-09', title: 'Blue Raz Dream R&D', category: 'rd_record', status: 'active' },
    { id: 'd3', doc_key: 'OLD', title: 'Old form', category: 'form', status: 'retired' },
  ];
  const versions = [{ id: 'v1', document_id: 'd1', version_label: '1.1', status: 'current' }];
  const groups = groupDocuments(docs, versions);
  assert.deepEqual(groups.map(g => g.category), ['batch_record', 'rd_record']);
  assert.equal(groups[0].docs[0].current.id, 'v1');
  assert.equal(groupDocuments(docs, versions, { showRetired: true }).length, 3);
  assert.deepEqual(groupDocuments(docs, versions, { search: 'raz' }).map(g => g.category), ['rd_record']);
  assert.deepEqual(groupDocuments(docs, versions, { category: 'batch_record' }).map(g => g.docs.length), [1]);
});
