// ============================================================
// ResinEx — Mint a direct signed-upload URL for a project document
// api/resinex-create-upload-url.js — Vercel serverless function
//
// Storage bucket "resinex-documents" is private with no client-facing
// policy. Unlike api/sign-document.js (which proxies the whole file
// through this function's request body -- fine for small generated
// PDFs, too small for real scanned blueprints/vendor quotes), this
// endpoint only authorizes the upload: the browser then uploads the
// file directly to Supabase Storage via the returned signed URL,
// bypassing Vercel's serverless body-size limit entirely.
//
// Request format:
// POST /api/resinex-create-upload-url
// { facilityId, projectId, fileName, mimeType }
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

function validateCreateUploadUrlPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { facilityId, projectId, fileName } = body;
  if (typeof facilityId !== 'string' || !facilityId.trim()) return 'facilityId is required';
  if (typeof projectId !== 'string' || !projectId.trim()) return 'projectId is required';
  if (typeof fileName !== 'string' || !fileName.trim()) return 'fileName is required';
  return null;
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-150);
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

  const limited = checkRateLimit(`resinex-upload-url:${auth.user.id}`, { limit: 60, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many upload requests. Try again later.', requestId);
  }

  const validationError = validateCreateUploadUrlPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);

  const { facilityId, projectId, fileName } = req.body;

  // create-upload-url must gate at the same tier as the metadata insert it
  // precedes (facility_isolation_insert requires can_edit_facility) --
  // otherwise a viewer-role member could write untracked objects into the
  // bucket that can never be confirmed into a real document row.
  const authz = await requireFacilityEditor(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);

  // Confirm the project is actually this member's own -- runs under the
  // caller's own RLS-scoped client, so it only finds a match if both the
  // project exists and belongs to a facility the caller can view.
  const { data: project, error: projectError } = await auth.supabase
    .from('resinex_projects')
    .select('id')
    .eq('id', projectId)
    .eq('facility_id', facilityId)
    .maybeSingle();
  if (projectError) return sendApiError(res, 503, 'Unable to verify project access', requestId);
  if (!project) return sendApiError(res, 404, 'Project not found for this facility', requestId);

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Document upload is not configured', requestId);

  const storagePath = `${facilityId}/${projectId}/${Date.now()}-${sanitizeFileName(fileName)}`;

  try {
    const { data, error } = await admin.storage
      .from('resinex-documents')
      .createSignedUploadUrl(storagePath);
    if (error || !data?.token) {
      logApiError({ requestId, route: 'resinex-create-upload-url', userId: auth.user.id, facilityId }, error || new Error('createSignedUploadUrl returned no token'));
      return sendApiError(res, 502, 'Unable to create an upload URL', requestId);
    }
    return res.status(200).json({ data: { path: storagePath, token: data.token } });
  } catch (error) {
    logApiError({ requestId, route: 'resinex-create-upload-url', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to create an upload URL', requestId);
  }
}
