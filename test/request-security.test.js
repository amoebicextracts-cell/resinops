import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkRateLimit,
  getBearerToken,
  isMetrcWriteAction,
  isOriginAllowed,
  validateAiPayload,
  validateMetrcPayload,
} from '../api/_request-security.js';

test('bearer token parsing accepts only a single well-formed token', () => {
  assert.equal(getBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(getBearerToken('bearer token'), 'token');
  assert.equal(getBearerToken('Basic token'), null);
  assert.equal(getBearerToken('Bearer two tokens'), null);
  assert.equal(getBearerToken(''), null);
});

test('CORS rejects unknown origins and supports configured preview origins', () => {
  assert.equal(isOriginAllowed('https://evil.example', {}), false);
  assert.equal(isOriginAllowed('https://app.resinops.com', {}), true);
  assert.equal(isOriginAllowed('https://preview.example', { ALLOWED_ORIGINS: 'https://preview.example' }), true);
  assert.equal(isOriginAllowed(undefined, {}), true);
});

test('AI payload validation bounds purpose, history, and body size', () => {
  assert.equal(validateAiPayload({ purpose: 'general-chat', prompt: 'hello', history: [] }), null);
  assert.match(validateAiPayload({ purpose: 'anything', prompt: 'hello' }), /purpose/i);
  assert.match(validateAiPayload({ purpose: 'general-chat', prompt: 'hello', history: [{ role: 'system', content: 'bad' }] }), /history/i);
  assert.match(validateAiPayload({ purpose: 'data-import', prompt: 'x'.repeat(150_001) }), /large/i);
});

test('rate limiter blocks excess requests within a window', () => {
  const key = `test-${Math.random()}`;
  assert.equal(checkRateLimit(key, { limit: 2, windowMs: 1_000 }, 0).allowed, true);
  assert.equal(checkRateLimit(key, { limit: 2, windowMs: 1_000 }, 1).allowed, true);
  const blocked = checkRateLimit(key, { limit: 2, windowMs: 1_000 }, 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(checkRateLimit(key, { limit: 2, windowMs: 1_000 }, 1_001).allowed, true);
});

test('METRC validation requires facility scope and known actions', () => {
  const states = { NY: 'api-ny' };
  const endpoints = { 'facilities.list': { method: 'GET' }, 'packages.create': { method: 'POST' } };
  const valid = { action: 'facilities.list', state: 'NY', licenseNumber: 'OCM-123', facilityId: 'facility-1' };
  assert.equal(validateMetrcPayload(valid, states, endpoints), null);
  assert.match(validateMetrcPayload({ ...valid, facilityId: '' }, states, endpoints), /facilityId/i);
  assert.match(validateMetrcPayload({ ...valid, action: 'unknown' }, states, endpoints), /unknown/i);
  assert.match(validateMetrcPayload({ ...valid, state: 'XX' }, states, endpoints), /state/i);
});

test('METRC writes are distinguishable for deny-by-default enforcement', () => {
  assert.equal(isMetrcWriteAction({ method: 'GET' }), false);
  assert.equal(isMetrcWriteAction({ method: 'POST' }), true);
  assert.equal(isMetrcWriteAction({ method: 'DELETE' }), true);
});
