import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRequestId,
  initializeApiRequest,
  logApiError,
  notifySlack,
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

test('notifySlack is a no-op without a configured webhook URL', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_WEBHOOK_URL;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    notifySlack('should not send');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = originalUrl;
  }
});

test('notifySlack posts Slack-shaped JSON to the configured webhook', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.ALERT_WEBHOOK_URL;
  process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.example/services/test';
  let capturedUrl, capturedBody;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return { ok: true };
  };
  try {
    notifySlack('production incident');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(capturedUrl, 'https://hooks.slack.example/services/test');
    assert.deepEqual(capturedBody, { text: 'production incident' });
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = originalUrl;
  }
});

test('logApiError alerts on unexpected failures and genuine upstream 5xx, not expected 4xx', async () => {
  const originalFetch = global.fetch;
  process.env.ALERT_WEBHOOK_URL = 'https://hooks.slack.example/services/test';
  let callCount = 0;
  global.fetch = async () => { callCount += 1; return { ok: true }; };
  try {
    logApiError({ requestId: 'r1', route: 'invite', upstreamStatus: 409 }, new Error('already registered'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(callCount, 0);

    logApiError({ requestId: 'r2', route: 'invite', upstreamStatus: 502 }, new Error('upstream failed'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(callCount, 1);

    logApiError({ requestId: 'r3', route: 'chat' }, new Error('unexpected'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(callCount, 2);
  } finally {
    global.fetch = originalFetch;
    delete process.env.ALERT_WEBHOOK_URL;
  }
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
