import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runAnonymousRlsChecks,
  runAuthenticatedRlsChecks,
  runHealthCheck,
} from '../scripts/production-smoke.mjs';

const now = Date.parse('2026-07-15T19:00:00.000Z');

test('production health smoke enforces the public response contract', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    status: 'ok',
    service: 'resinops-api',
    version: '23f9cb1',
    timestamp: new Date(now).toISOString(),
    requestId: 'request_12345678',
  }), { status: 200 });

  const result = await runHealthCheck({ fetchImpl, now });
  assert.deepEqual(result, { version: '23f9cb1', requestId: 'request_12345678' });
});

test('anonymous RLS smoke requires every protected table to return zero rows', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response('[]', { status: 200 });
  };

  await runAnonymousRlsChecks({
    fetchImpl,
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'public-key',
  });
  assert.equal(calls.length, 3);
});

test('anonymous RLS smoke fails closed if a tenant row is exposed', async () => {
  const fetchImpl = async (url) => new Response(
    url.includes('/facilities?') ? '[{"id":"exposed"}]' : '[]',
    { status: 200 },
  );

  await assert.rejects(
    runAnonymousRlsChecks({
      fetchImpl,
      supabaseUrl: 'https://project.supabase.co',
      anonKey: 'public-key',
    }),
    /Anonymous access exposed/,
  );
});

test('anonymous RLS smoke accepts explicit API permission denial', async () => {
  const fetchImpl = async () => new Response('{"message":"permission denied"}', { status: 403 });
  await runAnonymousRlsChecks({
    fetchImpl,
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'public-key',
  });
});

test('authenticated RLS smoke proves own access, cross-tenant denial, and audit readability', async () => {
  const restHeaders = [];
  const fetchImpl = async (url, options = {}) => {
    if (url.includes('/auth/v1/token')) {
      return new Response('{"access_token":"user-token"}', { status: 200 });
    }
    restHeaders.push(options.headers);
    if (url.includes('id=eq.own-facility')) {
      return new Response('[{"id":"own-facility"}]', { status: 200 });
    }
    if (url.includes('id=eq.other-facility')) {
      return new Response('[]', { status: 200 });
    }
    if (url.includes('/audit_logs?')) {
      return new Response('[]', { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await runAuthenticatedRlsChecks({
    fetchImpl,
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'public-key',
    email: 'smoke@example.test',
    password: 'not-logged',
    facilityId: 'own-facility',
    forbiddenFacilityId: 'other-facility',
  });
  assert.equal(restHeaders.length, 3);
  for (const headers of restHeaders) {
    assert.equal(headers.apikey, 'public-key');
    assert.equal(headers.authorization, 'Bearer user-token');
  }
});
