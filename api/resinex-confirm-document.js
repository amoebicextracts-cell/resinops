// ============================================================
// ResinEx — Confirm a document upload (flip pending -> confirmed)
// api/resinex-confirm-document.js — Vercel serverless function
//
// The resinex_project_documents row already exists (status: 'pending',
// written by api/resinex-create-upload-url.js before the upload even
// started) -- this just verifies the row and flips it to 'confirmed'
// once the browser's direct-to-Storage upload has actually completed.
// If this request never arrives, the row stays 'pending' -- a known,
// documented residual gap (no automatic cleanup job yet), but a
// queryable one rather than a completely untracked Storage object.
//
// Request format:
// POST /api/resinex-confirm-document
// { facilityId, documentId }
// file_size is read from Storage's own object metadata, not the client.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityEditor } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validateConfirmDocumentPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { facilityId, documentId } = body;
  if (typeof facilityId !== 'string' || !facilityId.trim()) return 'facilityId is required';
  if (typeof documentId !== 'string' || !documentId.trim()) return 'documentId is required';
  return null;
}

export default async function handler(req, res) {
  const requestId = initializeApiRequest(req, res);
  applyCors(req, res);
  if (!isOriginAllowed(req.headers?.origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return sendApiError(res, auth.status, auth.error, requestId);

  const limited = checkRateLimit(`resinex-confirm-document:${auth.user.id}`, { limit: 60, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many requests. Try again later.', requestId);
  }

  const validationError = validateConfirmDocumentPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);

  const { facilityId, documentId } = req.body;

  const authz = await requireFacilityEditor(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Document confirmation is not configured', requestId);

  try {
    const { data: existing, error: lookupError } = await admin
      .from('resinex_project_documents')
      .select('id, facility_id, status, storage_path')
      .eq('id', documentId)
      .maybeSingle();
    if (lookupError) {
      logApiError({ requestId, route: 'resinex-confirm-document', userId: auth.user.id, facilityId }, lookupError);
      return sendApiError(res, 502, 'Unable to look up the document', requestId);
    }
    if (!existing || existing.facility_id !== facilityId) {
      return sendApiError(res, 404, 'Document not found', requestId);
    }
    if (existing.status !== 'pending') {
      return sendApiError(res, 409, 'Document is not pending confirmation', requestId);
    }

    // Don't just trust the client's claim that the upload succeeded --
    // verify the object actually landed in Storage before promoting this
    // row to a visible "confirmed" document. Without this, a failed or
    // abandoned-then-retried upload could get confirmed as pointing at
    // nothing.
    const lastSlash = existing.storage_path.lastIndexOf('/');
    const folder = existing.storage_path.slice(0, lastSlash);
    const basename = existing.storage_path.slice(lastSlash + 1);
    const { data: listing, error: listError } = await admin.storage
      .from('resinex-documents')
      .list(folder, { search: basename });
    if (listError) {
      logApiError({ requestId, route: 'resinex-confirm-document', userId: auth.user.id, facilityId }, listError);
      return sendApiError(res, 502, 'Unable to verify the upload', requestId);
    }
    const storedObject = listing?.find(item => item.name === basename);
    if (!storedObject) {
      return sendApiError(res, 409, 'Upload not found in storage — try uploading again', requestId);
    }

    // Record Storage's own metadata.size rather than the client-supplied
    // fileSize -- the caller controls the request body, so trusting its
    // claim would let a confirmed document's size diverge from what's
    // actually stored.
    const { data: record, error: updateError } = await admin
      .from('resinex_project_documents')
      .update({ status: 'confirmed', file_size: storedObject.metadata?.size ?? null })
      .eq('id', documentId)
      .select()
      .single();
    if (updateError) {
      logApiError({ requestId, route: 'resinex-confirm-document', userId: auth.user.id, facilityId }, updateError);
      return sendApiError(res, 502, 'Unable to confirm the document', requestId);
    }

    return res.status(200).json({ data: record });
  } catch (error) {
    logApiError({ requestId, route: 'resinex-confirm-document', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to confirm document upload', requestId);
  }
}
