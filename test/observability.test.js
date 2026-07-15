import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRequestId,
  initializeApiRequest,
  sendApiError,
} from '../api/_observability.js';
import healthHandler from '../api/health.js';

function responseDouble() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

test('request IDs preserve safe proxy values and reject unsafe input', () => {
  assert.equal(getRequestId({ headers: { 'x-request-id': 'preview_12345678' } }), 'preview_12345678');
  assert.match(getRequestId({ headers: { 'x-request-id': 'bad value with spaces' } }), /^[0-9a-f-]{36}$/);
});

test('API initialization adds tracing and defensive response headers', () => {
  const res = responseDouble();
  const requestId = initializeApiRequest({ headers: {} }, res);
  assert.equal(res.headers['X-Request-ID'], requestId);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('API errors include the support reference without internal details', () => {
  const res = responseDouble();
  sendApiError(res, 503, 'Service unavailable', 'request_12345678');
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, { error: 'Service unavailable', requestId: 'request_12345678' });
});

test('health endpoint reports liveness without dependency or credential details', () => {
  const res = responseDouble();
  healthHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'ok');
  assert.equal(res.payload.service, 'resinops-api');
  const serialized = JSON.stringify(res.payload).toLowerCase();
  assert.doesNotMatch(serialized, /secret|api.?key|configured|supabase|anthropic|metrc/);
});
