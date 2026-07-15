import { randomUUID } from 'node:crypto';

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
}
