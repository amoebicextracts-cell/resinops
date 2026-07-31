// ============================================================
// ResinOps — Real e-signature for GMP closing actions
// api/sign-document.js — Vercel serverless function
//
// Used for exactly three "closing" compliance actions: QC Head batch
// release, SOP approval-to-active, and GMP deviation closure. The client
// builds a jsPDF snapshot of the document, hashes it, and sends the bytes
// here. This endpoint re-verifies the caller's password against their own
// account (a throwaway sign-in, never touching the caller's real browser
// session) before freezing the PDF into private Supabase Storage and
// recording an immutable signature_records row. The actual domain-state
// mutation (setting gmp_signoffs.qc_head_id, gmp_sops.status, etc.)
// happens client-side afterward via the normal RLS-protected db.js path —
// this endpoint's only job is proving identity and freezing the document.
//
// Request format:
// POST /api/sign-document
// { password, documentType, documentId, documentLabel, facilityId, pdfBase64, sha256 }
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityMember } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed, validateSignDocumentPayload } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';
import { createHash } from 'node:crypto';

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
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

  const limited = checkRateLimit(`sign:${auth.user.id}`, { limit: 20, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many signing attempts. Try again later.', requestId);
  }

  const validationError = validateSignDocumentPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);

  const { password, documentType, documentId, documentLabel, facilityId, pdfBase64, sha256 } = req.body;

  // Facility membership is checked before re-authentication -- cheaper,
  // and avoids leaking "your password would have worked" to a non-member.
  const authz = await requireFacilityMember(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return sendApiError(res, 503, 'Server authentication is not configured', requestId);

  // Throwaway client, never touches the caller's real session -- purely
  // to confirm the password is currently correct for this account.
  const reauthClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: reauthError } = await reauthClient.auth.signInWithPassword({ email: auth.user.email, password });
  if (reauthError) return sendApiError(res, 401, 'Password incorrect', requestId);

  let buffer;
  try {
    buffer = Buffer.from(pdfBase64, 'base64');
  } catch {
    return sendApiError(res, 400, 'pdfBase64 could not be decoded', requestId);
  }
  if (buffer.length === 0) return sendApiError(res, 400, 'Decoded document is empty', requestId);

  // Defense in depth -- never trust the client's hash claim for the value
  // that actually gets persisted; recompute it server-side from the bytes.
  const recomputedHash = createHash('sha256').update(buffer).digest('hex');
  if (recomputedHash.toLowerCase() !== sha256.toLowerCase()) {
    return sendApiError(res, 400, 'Document hash mismatch', requestId);
  }

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Document signing is not configured', requestId);

  const storagePath = `${facilityId}/${documentType}/${documentId}/${Date.now()}.pdf`;

  try {
    const { error: uploadError } = await admin.storage
      .from('signed-documents')
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
    if (uploadError) {
      logApiError({ requestId, route: 'sign-document', userId: auth.user.id, facilityId }, uploadError);
      return sendApiError(res, 502, 'Unable to store the signed document', requestId);
    }

    const { data: record, error: insertError } = await admin
      .from('signature_records')
      .insert({
        facility_id: facilityId,
        signed_by: auth.user.id,
        document_type: documentType,
        document_id: documentId,
        document_label: documentLabel,
        sha256: recomputedHash,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (insertError) {
      // Avoid an orphaned Storage object with no matching record.
      await admin.storage.from('signed-documents').remove([storagePath]);
      logApiError({ requestId, route: 'sign-document', userId: auth.user.id, facilityId }, insertError);
      return sendApiError(res, 502, 'Unable to record the signature', requestId);
    }

    return res.status(200).json({ data: record });
  } catch (error) {
    logApiError({ requestId, route: 'sign-document', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to sign document', requestId);
  }
}
