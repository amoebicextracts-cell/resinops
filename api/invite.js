// ============================================================
// ResinOps — Facility member invite
// api/invite.js — Vercel serverless function
//
// Creates a new Supabase Auth user (or reuses an unaccepted invite) and a
// pending facility_members row, then sends the invite email. Requires
// SUPABASE_SERVICE_ROLE_KEY — never exposed to the browser — because
// creating an Auth user on someone else's behalf isn't possible with the
// anon key. Callers must already be an owner/admin of the target facility,
// verified with their own (non-privileged) session first.
//
// Request format:
// POST /api/invite
// { email, facilityId, role, scopeRoles: { cultivation: "member", ... } }
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityAdmin } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed, validateInvitePayload } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';

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

  const limited = checkRateLimit(`invite:${auth.user.id}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many invites sent. Try again later.', requestId);
  }

  const validationError = validateInvitePayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);

  const { email, facilityId, role, scopeRoles = {} } = req.body;

  const authz = await requireFacilityAdmin(auth, facilityId);
  if (authz.error) return sendApiError(res, authz.status, authz.error, requestId);

  const admin = getServiceRoleClient();
  if (!admin) return sendApiError(res, 503, 'Invite sending is not configured', requestId);

  const origin = req.headers?.origin || (process.env.ALLOWED_ORIGINS || '').split(',')[0]?.trim();

  try {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/accept-invite`,
    });

    if (inviteError) {
      const alreadyExists = /already registered|already exists|already been registered/i.test(inviteError.message || '');
      logApiError({ requestId, route: 'invite', userId: auth.user.id, facilityId, upstreamStatus: alreadyExists ? 409 : 502 }, inviteError);
      return sendApiError(
        res,
        alreadyExists ? 409 : 502,
        alreadyExists
          ? 'This email already has a ResinOps account. Adding an existing account to a facility isn\'t supported from this form yet.'
          : 'Unable to send the invite email',
        requestId
      );
    }

    const invitedUserId = inviteData?.user?.id;
    if (!invitedUserId) {
      logApiError({ requestId, route: 'invite', userId: auth.user.id, facilityId }, new Error('inviteUserByEmail returned no user id'));
      return sendApiError(res, 502, 'Invite email sent, but membership setup failed', requestId);
    }

    const { error: memberError } = await admin
      .from('facility_members')
      .upsert(
        { facility_id: facilityId, user_id: invitedUserId, role, scope_roles: scopeRoles, accepted_at: null },
        { onConflict: 'facility_id,user_id' }
      );

    if (memberError) {
      logApiError({ requestId, route: 'invite', userId: auth.user.id, facilityId }, memberError);
      return sendApiError(res, 502, 'Invite email sent, but membership setup failed', requestId);
    }

    return res.status(200).json({ data: { invited: email, role, scopeRoles } });
  } catch (error) {
    logApiError({ requestId, route: 'invite', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to send invite', requestId);
  }
}
