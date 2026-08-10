// ============================================================
// ResinEx — Retrieve a previously-uploaded project document
// api/resinex-get-document-url.js — Vercel serverless function
//
// Storage bucket "resinex-documents" is private with no client-facing
// policy; every read goes through this endpoint, which re-verifies the
// requester's facility membership before minting a short-lived signed URL.
// Mirrors api/get-signed-document.js.
//
// Request format:
// POST /api/resinex-get-document-url
// { documentId, facilityId }
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityMember } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validateGetDocumentUrlPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { documentId, facilityId } = body;
  if (typeof documentId !== 'string' || !documentId.trim()) return 'documentId is required';
  if (typeof facilityId !== 'string' || !facilityId.trim()) return 'facilityId is required';
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

  const limited = checkRateLimit(`resinex-get-document-url:${auth.user.id}`, { limit: 120, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many requests. Try again later.', requestId);
  }

  const validationError = validateGetDocumentUrlPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);

  const { documentId, facilityId } = req.body;

  const authz = await requireFacilityMember(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Document retrieval is not configured', requestId);

  try {
    const { data: record, error: recordError } = await admin
      .from('resinex_project_documents')
      .select('storage_path, facility_id')
      .eq('id', documentId)
      .maybeSingle();
    if (recordError) {
      logApiError({ requestId, route: 'resinex-get-document-url', userId: auth.user.id, facilityId }, recordError);
      return sendApiError(res, 502, 'Unable to look up the document', requestId);
    }
    if (!record || record.facility_id !== facilityId) {
      return sendApiError(res, 404, 'Document not found', requestId);
    }

    const { data: signed, error: urlError } = await admin.storage
      .from('resinex-documents')
      .createSignedUrl(record.storage_path, 300);
    if (urlError || !signed?.signedUrl) {
      logApiError({ requestId, route: 'resinex-get-document-url', userId: auth.user.id, facilityId }, urlError || new Error('createSignedUrl returned no URL'));
      return sendApiError(res, 502, 'Unable to retrieve the document', requestId);
    }

    return res.status(200).json({ data: { url: signed.signedUrl } });
  } catch (error) {
    logApiError({ requestId, route: 'resinex-get-document-url', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to retrieve document', requestId);
  }
}
