export function formatApiError(response, payload = {}, fallback = 'Request failed') {
  const message = typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error.trim()
    : fallback;
  const requestId = response?.headers?.get?.('x-request-id') || payload?.requestId;
  return requestId ? `${message} (Reference: ${requestId})` : message;
}
