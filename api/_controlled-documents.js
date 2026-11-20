// ============================================================
// Document Control — request validation and path helpers
// api/_controlled-documents.js (shared module, not a function)
//
// Kept separate from api/controlled-documents.js so the rules can be
// unit-tested without a Supabase client (test/controlled-documents.test.js).
// ============================================================

export const DOCUMENT_CATEGORIES = new Set(['template', 'batch_record', 'rd_record', 'sop', 'form', 'other']);
export const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/csv', 'text/markdown', 'text/plain']);
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Document keys show up in the UI and in Storage paths only via the
// document's UUID, never directly -- but keep them to a safe, readable set.
const DOC_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._&+ -]{0,119}$/;

const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function sanitizeFileName(name) {
  const cleaned = String(name).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+/, '');
  return (cleaned || 'file').slice(-150);
}

export function buildStoragePath(facilityId, documentId, versionId, fileName) {
  return `${facilityId}/${documentId}/${versionId}-${sanitizeFileName(fileName)}`;
}

function validateNewDocument(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'newDocument must be an object';
  if (!isNonEmptyString(doc.docKey) || !DOC_KEY_RE.test(doc.docKey.trim())) return 'newDocument.docKey is invalid';
  if (!isNonEmptyString(doc.title) || doc.title.trim().length > 200) return 'newDocument.title is required (max 200 characters)';
  if (doc.category !== undefined && !DOCUMENT_CATEGORIES.has(doc.category)) return 'newDocument.category is invalid';
  if (doc.productType !== undefined && doc.productType !== null && (typeof doc.productType !== 'string' || doc.productType.length > 60)) return 'newDocument.productType is invalid';
  if (doc.rdDosed !== undefined && doc.rdDosed !== null && typeof doc.rdDosed !== 'boolean') return 'newDocument.rdDosed must be true, false or null';
  if (doc.notes !== undefined && doc.notes !== null && (typeof doc.notes !== 'string' || doc.notes.length > 2000)) return 'newDocument.notes is too long';
  return null;
}

export function validateCreateUploadPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { facilityId, documentId, newDocument, versionLabel, changelog, fileName, mimeType, fileSize, effectiveDate } = body;
  if (!isNonEmptyString(facilityId)) return 'facilityId is required';
  if (documentId !== undefined && newDocument !== undefined) return 'Send either documentId or newDocument, not both';
  if (documentId === undefined && newDocument === undefined) return 'documentId or newDocument is required';
  if (documentId !== undefined && !isUuid(documentId)) return 'documentId must be a UUID';
  if (newDocument !== undefined) {
    const err = validateNewDocument(newDocument);
    if (err) return err;
  }
  if (!isNonEmptyString(versionLabel) || !VERSION_RE.test(versionLabel.trim())) return 'versionLabel must look like 1, 1.1 or 1.1.2';
  if (!isNonEmptyString(changelog)) return 'changelog is required: describe what changed in this version';
  if (changelog.length > 8000) return 'changelog is too long (max 8000 characters)';
  if (!isNonEmptyString(fileName) || fileName.length > 255) return 'fileName is required';
  if (mimeType !== undefined && mimeType !== null && mimeType !== '' && !ALLOWED_MIME_TYPES.has(mimeType)) return 'File type not allowed (PDF, PNG, JPEG, CSV, Markdown or text)';
  if (fileSize !== undefined && fileSize !== null && (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > MAX_FILE_BYTES)) return 'fileSize must be between 1 byte and 25 MB';
  if (effectiveDate !== undefined && effectiveDate !== null && effectiveDate !== '' && (typeof effectiveDate !== 'string' || !DATE_RE.test(effectiveDate))) return 'effectiveDate must be YYYY-MM-DD';
  return null;
}

export function validateVersionActionPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  if (!isNonEmptyString(body.facilityId)) return 'facilityId is required';
  if (!isUuid(body.versionId)) return 'versionId must be a UUID';
  return null;
}
