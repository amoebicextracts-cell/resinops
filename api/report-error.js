// ============================================================
// ResinOps — In-app error/issue reporting
// api/report-error.js — Vercel serverless function
//
// Fed by two callers in src/App.jsx: the ErrorBoundary's componentDidCatch
// (automatic, best-effort, no user action needed) and a manual "Report an
// issue" button in the sidebar footer. Both just relay a short message to
// the same Slack channel api/_observability.js's logApiError already alerts
// to, via notifySlack() — this is a client-visible mirror of that same
// channel, not a separate alerting path.
//
// Request format:
// POST /api/report-error
// { message, module, facilityId }
// ============================================================

import { authenticateRequest } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed, validateErrorReportPayload } from './_request-security.js';
import { initializeApiRequest, logApiError, notifySlack, sendApiError } from './_observability.js';

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

  const limited = checkRateLimit(`report-error:${auth.user.id}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many reports sent. Try again later.', requestId);
  }

  const validationError = validateErrorReportPayload(req.body);
  if (validationError) return sendApiError(res, 400, validationError, requestId);

  const { message, module = '', facilityId = '' } = req.body;

  try {
    notifySlack(
      `:bug: ResinOps issue report${module ? ` in \`${module}\`` : ''}\n` +
      `User: ${auth.user.email || auth.user.id}${facilityId ? ` · Facility: ${facilityId}` : ''}\n` +
      `${message.slice(0, 2000)}`
    );
    return res.status(200).json({ data: { received: true } });
  } catch (error) {
    logApiError({ requestId, route: 'report-error', userId: auth.user.id, facilityId }, error);
    return sendApiError(res, 500, 'Unable to submit report', requestId);
  }
}
