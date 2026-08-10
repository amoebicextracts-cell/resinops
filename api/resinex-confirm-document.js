// ============================================================
// ResinEx — Confirm a document upload (write the metadata row)
// api/resinex-confirm-document.js — Vercel serverless function
//
// Called after the browser has already uploaded a file directly to
// Storage via a signed URL from api/resinex-create-upload-url.js. Doing
// the metadata insert server-side (service role), instead of a separate
// client-side db.js call, means a failed insert can immediately roll back
// the just-uploaded Storage object in the same request -- the same
// atomic-ish upload-then-insert-then-cleanup-on-failure shape
// api/sign-document.js uses, adapted for a two-step (signed-URL) upload.
//
// Request format:
// POST /api/resinex-confirm-document
// { facilityId, projectId, storagePath, fileName, mimeType, fileSize, category, notes }
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityEditor } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';

const CATEGORIES = new Set(['quote', 'blueprint', 'schematic', 'invoice', 'other']);

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validateConfirmDocumentPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { facilityId, projectId, storagePath, fileName, category } = body;
  if (typeof facilityId !== 'string' || !facilityId.trim()) return 'facilityId is required';
  if (typeof projectId !== 'string' || !projectId.trim()) return 'projectId is required';
  if (typeof storagePath !== 'string' || !storagePath.trim()) return 'storagePath is required';
  if (typeof fileName !== 'string' || !fileName.trim()) return 'fileName is required';
  if (category !== undefined && !CATEGORIES.has(category)) return 'Invalid category';
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

  const { facilityId, projectId, storagePath, fileName, mimeType, fileSize, category, notes } = req.body;

  const authz = await requireFacilityEditor(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);

  // storagePath must be the one this facility/project was actually issued
  // -- refuse to confirm an arbitrary path (e.g. copied from another
  // facility's document) as this member's own document.
  if (!storagePath.startsWith(`${facilityId}/${projectId}/`)) {
    return sendApiError(res, 400, 'storagePath does not match this facility/project', requestId);
  }

  const { data: project, error: projectError } = await auth.supabase
    .from('resinex_projects')
    .select('id')
    .eq('id', projectId)
    .eq('facility_id', facilityId)
    .maybeSingle();
  if (projectError) return sendApiError(res, 503, 'Unable to verify project access', requestId);
  if (!project) return sendApiError(res, 404, 'Project not found for this facility', requestId);

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Document confirmation is not configured', requestId);

  try {
    const { data: record, error: insertError } = await admin
      .from('resinex_project_documents')
      .insert({
        project_id: projectId,
        facility_id: facilityId,
        uploaded_by: auth.user.id,
        file_name: fileName,
        mime_type: mimeType || null,
        file_size: fileSize || null,
        category: category || 'other',
        storage_path: storagePath,
        notes: notes || null,
      })
      .select()
      .single();

    if (insertError) {
      // Roll back the orphaned Storage object -- mirrors sign-document.js's
      // upload-then-insert-then-cleanup-on-failure shape.
      await admin.storage.from('resinex-documents').remove([storagePath]);
      logApiError({ requestId, route: 'resinex-confirm-document', userId: auth.user.id, facilityId }, insertError);
      return sendApiError(res, 502, 'Unable to save the document record', requestId);
    }

    return res.status(200).json({ data: record });
  } catch (error) {
    await admin.storage.from('resinex-documents').remove([storagePath]).catch(() => {});
    logApiError({ requestId, route: 'resinex-confirm-document', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to confirm document upload', requestId);
  }
}
