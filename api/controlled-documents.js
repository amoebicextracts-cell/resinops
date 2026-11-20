// ============================================================
// Document Control — upload, confirm and download controlled documents
// api/controlled-documents.js — Vercel serverless function
//
// One function, three actions (keeps the function count down):
//
//   POST { action: 'create-upload-url', facilityId, documentId | newDocument,
//          versionLabel, changelog, fileName, mimeType, fileSize, effectiveDate }
//     Editor only. Creates the document (if newDocument) and a 'pending'
//     version row, then mints a signed upload URL for the private
//     "controlled-documents" bucket. The browser uploads directly to
//     Storage (no Vercel body-size cap), then calls 'confirm'.
//
//   POST { action: 'confirm', facilityId, versionId }
//     Editor only. Verifies the object really is in Storage, hashes it
//     (SHA-256 over the stored bytes, not a client claim), and promotes
//     the version to 'current' -- superseding the previous current one --
//     in one database transaction (promote_controlled_document_version).
//
//   POST { action: 'get-url', facilityId, versionId }
//     Any facility member. Mints a 5-minute signed download URL for any
//     version, current or superseded.
//
// Same security model as the resinex-* and sign-document functions: the
// bucket has no client policy and every read/write is re-authorized here.
// A version that never gets confirmed stays 'pending' and is hidden in
// the UI -- the same accepted residual gap as resinex uploads.
// ============================================================

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityMember } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';
import {
  buildStoragePath,
  validateCreateUploadPayload,
  validateVersionActionPayload,
} from './_controlled-documents.js';

const BUCKET = 'controlled-documents';
const ROUTE = 'controlled-documents';

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Section-scoped permissions (scope_roles.compliance) can narrow a member's
// global role, so ask the database as the caller (RLS-equivalent check).
async function requireDocumentAccess(auth, facilityId, need) {
  const { data, error } = await auth.supabase.rpc('controlled_documents_access', { p_facility: facilityId });
  if (error) return { error: 'Unable to verify facility access', status: 503 };
  if (data === 'edit' || (need === 'view' && data === 'view')) return {};
  return { error: need === 'edit' ? 'Compliance edit access required' : 'Facility access denied', status: 403 };
}

async function createUploadUrl({ req, res, auth, admin, requestId }) {
  const validationError = validateCreateUploadPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);
  const { facilityId, newDocument, versionLabel, changelog, fileName, mimeType, effectiveDate } = req.body;
  let { documentId } = req.body;

  const authz = await requireFacilityMember(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);
  const scoped = await requireDocumentAccess(auth, facilityId, 'edit');
  if (scoped.error) return sendApiError(res, scoped.status, scoped.error, requestId);

  let createdDocumentId = null;
  if (newDocument) {
    const { data: doc, error } = await admin
      .from('controlled_documents')
      .insert({
        facility_id: facilityId,
        created_by: auth.user.id,
        doc_key: newDocument.docKey.trim(),
        title: newDocument.title.trim(),
        category: newDocument.category || 'other',
        product_type: newDocument.productType || null,
        rd_dosed: newDocument.rdDosed ?? null,
        notes: newDocument.notes || null,
      })
      .select('id')
      .single();
    if (error?.code === '23505') {
      return sendApiError(res, 409, `A document with key "${newDocument.docKey.trim()}" already exists. Upload a new version to it instead.`, requestId);
    }
    if (error || !doc) {
      logApiError({ requestId, route: ROUTE, userId: auth.user.id, facilityId }, error || new Error('document insert returned no row'));
      return sendApiError(res, 502, 'Unable to create the document', requestId);
    }
    documentId = doc.id;
    createdDocumentId = doc.id;
  } else {
    const { data: doc, error } = await admin
      .from('controlled_documents')
      .select('id, facility_id, status')
      .eq('id', documentId)
      .maybeSingle();
    if (error) return sendApiError(res, 502, 'Unable to look up the document', requestId);
    if (!doc || doc.facility_id !== facilityId) return sendApiError(res, 404, 'Document not found', requestId);
    if (doc.status === 'retired') return sendApiError(res, 409, 'This document is retired. Reactivate it before adding a version.', requestId);
  }

  const undoNewDocument = async () => {
    if (createdDocumentId) await admin.from('controlled_documents').delete().eq('id', createdDocumentId);
  };

  const { data: version, error: versionError } = await admin
    .from('controlled_document_versions')
    .insert({
      facility_id: facilityId,
      document_id: documentId,
      version_label: versionLabel.trim(),
      changelog: changelog.trim(),
      effective_date: effectiveDate || null,
      file_name: fileName.trim(),
      mime_type: mimeType || null,
      uploaded_by: auth.user.id,
      status: 'pending',
    })
    .select('id')
    .single();
  if (versionError?.code === '23505') {
    await undoNewDocument();
    return sendApiError(res, 409, `Version ${versionLabel.trim()} already exists for this document. Use the next version number.`, requestId);
  }
  if (versionError || !version) {
    await undoNewDocument();
    logApiError({ requestId, route: ROUTE, userId: auth.user.id, facilityId }, versionError || new Error('version insert returned no row'));
    return sendApiError(res, 502, 'Unable to start the upload', requestId);
  }

  const storagePath = buildStoragePath(facilityId, documentId, version.id, fileName);
  const { error: pathError } = await admin
    .from('controlled_document_versions')
    .update({ storage_path: storagePath })
    .eq('id', version.id);
  const { data: signed, error: urlError } = pathError
    ? { data: null, error: pathError }
    : await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (urlError || !signed?.token) {
    await admin.from('controlled_document_versions').delete().eq('id', version.id);
    await undoNewDocument();
    logApiError({ requestId, route: ROUTE, userId: auth.user.id, facilityId }, urlError || new Error('createSignedUploadUrl returned no token'));
    return sendApiError(res, 502, 'Unable to create an upload URL', requestId);
  }

  return res.status(200).json({ data: { documentId, versionId: version.id, path: storagePath, token: signed.token } });
}

async function loadVersion(admin, versionId) {
  return admin
    .from('controlled_document_versions')
    .select('id, facility_id, document_id, status, storage_path')
    .eq('id', versionId)
    .maybeSingle();
}

async function confirmVersion({ req, res, auth, admin, requestId }) {
  const validationError = validateVersionActionPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);
  const { facilityId, versionId } = req.body;

  const authz = await requireFacilityMember(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);
  const scoped = await requireDocumentAccess(auth, facilityId, 'edit');
  if (scoped.error) return sendApiError(res, scoped.status, scoped.error, requestId);

  const { data: version, error } = await loadVersion(admin, versionId);
  if (error) return sendApiError(res, 502, 'Unable to look up the version', requestId);
  if (!version || version.facility_id !== facilityId) return sendApiError(res, 404, 'Version not found', requestId);
  if (version.status !== 'pending') return sendApiError(res, 409, 'Version is not pending confirmation', requestId);

  // Hash what Storage actually holds -- never trust a client-side claim.
  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(version.storage_path);
  if (downloadError || !blob) return sendApiError(res, 409, 'Upload not found in storage. Try uploading again.', requestId);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const { data: promoted, error: promoteError } = await admin.rpc('promote_controlled_document_version', {
    p_version_id: versionId,
    p_file_size: bytes.length,
    p_sha256: sha256,
  });
  if (promoteError) {
    logApiError({ requestId, route: ROUTE, userId: auth.user.id, facilityId }, promoteError);
    return sendApiError(res, 502, 'Unable to confirm the version', requestId);
  }
  return res.status(200).json({ data: promoted });
}

async function getVersionUrl({ req, res, auth, admin, requestId }) {
  const validationError = validateVersionActionPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);
  const { facilityId, versionId } = req.body;

  const authz = await requireFacilityMember(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);
  const scoped = await requireDocumentAccess(auth, facilityId, 'view');
  if (scoped.error) return sendApiError(res, scoped.status, scoped.error, requestId);

  const { data: version, error } = await loadVersion(admin, versionId);
  if (error) return sendApiError(res, 502, 'Unable to look up the version', requestId);
  if (!version || version.facility_id !== facilityId || version.status === 'pending') {
    return sendApiError(res, 404, 'Version not found', requestId);
  }
  const { data: signed, error: urlError } = await admin.storage.from(BUCKET).createSignedUrl(version.storage_path, 300);
  if (urlError || !signed?.signedUrl) {
    logApiError({ requestId, route: ROUTE, userId: auth.user.id, facilityId }, urlError || new Error('createSignedUrl returned no URL'));
    return sendApiError(res, 502, 'Unable to retrieve the document', requestId);
  }
  return res.status(200).json({ data: { url: signed.signedUrl } });
}

const ACTIONS = {
  'create-upload-url': { run: createUploadUrl, limit: 60 },
  confirm: { run: confirmVersion, limit: 60 },
  'get-url': { run: getVersionUrl, limit: 240 },
};

export default async function handler(req, res) {
  const requestId = initializeApiRequest(req, res);
  applyCors(req, res);
  if (!isOriginAllowed(req.headers?.origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = ACTIONS[req.body?.action];
  if (!action) return sendApiError(res, 400, 'Unknown action', requestId);

  const auth = await authenticateRequest(req);
  if (auth.error) return sendApiError(res, auth.status, auth.error, requestId);

  const limited = checkRateLimit(`${ROUTE}:${req.body.action}:${auth.user.id}`, { limit: action.limit, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many requests. Try again later.', requestId);
  }

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Document Control is not configured', requestId);

  try {
    return await action.run({ req, res, auth, admin, requestId });
  } catch (error) {
    logApiError({ requestId, route: ROUTE, userId: auth.user.id, facilityId: req.body?.facilityId }, error);
    return sendApiError(res, 500, 'Document Control request failed', requestId);
  }
}
