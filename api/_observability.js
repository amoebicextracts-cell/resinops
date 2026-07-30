import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function getRequestId(req) {
  const supplied = req?.headers?.['x-request-id'];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
  return typeof candidate === 'string' && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : randomUUID();
}

export function initializeApiRequest(req, res) {
  const requestId = getRequestId(req);
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return requestId;
}

export function sendApiError(res, status, message, requestId) {
  return res.status(status).json({ error: message, requestId });
}

// Fire-and-forget Slack alert. Wrapped in waitUntil() so the POST completes
// even after the serverless function has already sent its HTTP response —
// without it, Vercel can freeze/recycle the function before a bare fetch()
// finishes, silently dropping the alert.
export function notifySlack(message) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;
  const post = fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: message }),
  }).catch(err => console.error('Slack alert delivery failed:', err?.message || err));
  waitUntil(post);
}

export function logApiError({ requestId, route, userId, facilityId, upstreamStatus }, error) {
  const safeMessage = error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
  console.error(JSON.stringify({
    level: 'error',
    event: 'api_request_failed',
    requestId,
    route,
    userId: userId || null,
    facilityId: facilityId || null,
    upstreamStatus: upstreamStatus || null,
    errorName: error instanceof Error ? error.name : 'Error',
    errorMessage: safeMessage,
  }));

  // Expected upstream 4xx conditions (e.g. "email already registered") are
  // normal control flow, not incidents — only alert on unexpected failures
  // and genuine upstream 5xx.
  if (upstreamStatus && upstreamStatus < 500) return;
  notifySlack(`:rotating_light: ResinOps API error on \`${route}\` (request \`${requestId}\`)\n${safeMessage}`);
}
