// ============================================================
// ResinOps — AC Infinity sensor proxy + poller
// api/ac-infinity.js — Vercel serverless function
//
// AC Infinity has no official public API. Everything below is built against
// the community's reverse-engineered documentation of their app's own cloud
// API (e.g. github.com/keithah/homebridge-acinfinity), current as of
// December 2025 — AC Infinity could change endpoints/fields without notice,
// and this should be re-verified against a live account if requests start
// failing. Credentials (AC_INFINITY_EMAIL / AC_INFINITY_PASSWORD) live only
// in Vercel env vars, same as METRC's keys — never sent to the browser.
//
// Two request shapes:
//   POST /api/ac-infinity  { action: "devices.list", facilityId }
//     User-authenticated (normal session), used by the GrowMap "link a
//     sensor" UI. Returns AC Infinity's raw device-list JSON as-is, not
//     reshaped into an assumed device/port structure — the exact nesting of
//     ports per device isn't documented anywhere we could verify, so the
//     linking UI shows this raw JSON and a device/port ID gets read off it
//     directly rather than guessed at in code.
//   GET /api/ac-infinity?action=cron.poll
//     Triggered by Vercel Cron (see vercel.json's `crons`), authenticated
//     via the `Authorization: Bearer $CRON_SECRET` header Vercel sends
//     automatically when a CRON_SECRET env var is set — not a user session.
//     Polls every active sensor_device_links row across every facility and
//     writes readings via the Supabase service-role client (bypasses RLS,
//     same pattern as api/invite.js).
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, requireFacilityEditor } from './_auth.js';
import { applyCors, checkRateLimit, isOriginAllowed } from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';

const AC_BASE = 'http://www.acinfinityserver.com';
const AC_APP_VERSION = '1.9.7';

// Per-cold-start cache. Community docs report tokens as not visibly
// expiring, but acRequest() re-logs-in once on any non-200 `code` anyway,
// since an expired/invalid token is the most likely cause of one.
let cachedAppId = null;

async function acLogin() {
  const email = process.env.AC_INFINITY_EMAIL;
  const password = process.env.AC_INFINITY_PASSWORD;
  if (!email || !password) {
    throw new Error('AC Infinity integration is not configured (AC_INFINITY_EMAIL / AC_INFINITY_PASSWORD)');
  }
  const res = await fetch(`${AC_BASE}/api/user/appUserLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    // appPasswordl (sic) — the community-documented field name really does
    // carry that typo; AC Infinity's own app only sends the first 25 chars.
    body: new URLSearchParams({ appEmail: email, appPasswordl: password.slice(0, 25) }),
  });
  if (!res.ok) throw new Error(`AC Infinity login failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200 || !json.data?.appId) {
    throw new Error(`AC Infinity login failed: ${json.msg || `code ${json.code}`}`);
  }
  cachedAppId = json.data.appId;
  return cachedAppId;
}

async function acRequest(path, formFields, { retry = true } = {}) {
  const appId = cachedAppId || await acLogin();
  const res = await fetch(`${AC_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      token: appId,
      phoneType: '1',
      appVersion: AC_APP_VERSION,
      minversion: '3.5',
    },
    body: new URLSearchParams(formFields),
  });
  if (!res.ok) throw new Error(`AC Infinity request to ${path} failed: HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 200) {
    if (retry) {
      cachedAppId = null;
      await acLogin();
      return acRequest(path, formFields, { retry: false });
    }
    throw new Error(`AC Infinity request to ${path} failed: ${json.msg || `code ${json.code}`}`);
  }
  return json.data;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// getdevModeSettingList returns temperature/humidity/vpdnums each scaled by
// 100 (community-documented); any field AC Infinity omits for a given
// device/port is simply skipped rather than written as a false zero.
function readingsFromDevMode(data) {
  const readings = [];
  if (!data) return readings;
  if (typeof data.temperature === 'number') readings.push({ metric: 'temp_f', value: data.temperature / 100 });
  if (typeof data.humidity === 'number') readings.push({ metric: 'humidity_pct', value: data.humidity / 100 });
  if (typeof data.vpdnums === 'number') readings.push({ metric: 'vpd_kpa', value: data.vpdnums / 100 });
  return readings;
}

async function runPoll() {
  const admin = getServiceRoleClient();
  if (!admin) throw new Error('Sensor polling is not configured (SUPABASE_SERVICE_ROLE_KEY)');

  const { data: links, error } = await admin
    .from('sensor_device_links')
    .select('id, facility_id, grow_room_id, external_device_id, external_port_id')
    .eq('source', 'ac_infinity')
    .eq('active', true);
  if (error) throw new Error(`Could not load sensor_device_links: ${error.message}`);

  let linksPolled = 0;
  let readingsWritten = 0;
  let failed = 0;

  for (const link of links || []) {
    try {
      const data = await acRequest('/api/dev/getdevModeSettingList', {
        devId: link.external_device_id,
        port: link.external_port_id || '',
      });
      linksPolled++;
      const readings = readingsFromDevMode(data);
      if (readings.length > 0) {
        const recordedAt = new Date().toISOString();
        const rows = readings.map((r) => ({
          facility_id: link.facility_id,
          device_link_id: link.id,
          grow_room_id: link.grow_room_id,
          metric: r.metric,
          value: r.value,
          recorded_at: recordedAt,
        }));
        const { error: insertError } = await admin.from('sensor_readings').insert(rows);
        if (insertError) throw insertError;
        readingsWritten += rows.length;
      }
    } catch (err) {
      failed++;
      console.error(JSON.stringify({
        level: 'error',
        event: 'ac_infinity_poll_link_failed',
        deviceLinkId: link.id,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
    // AC Infinity's own connection-based rate limiting kicks in on rapid
    // sequential calls (community-documented guidance: ~500ms apart).
    await sleep(500);
  }

  return { linksPolled, readingsWritten, failed };
}

export default async function handler(req, res) {
  const requestId = initializeApiRequest(req, res);
  applyCors(req, res);
  if (!isOriginAllowed(req.headers?.origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.method === 'GET' ? req.query?.action : (req.body?.action || req.query?.action);

  if (action === 'cron.poll') {
    const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
    if (!process.env.CRON_SECRET || req.headers?.authorization !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const result = await runPoll();
      return res.status(200).json(result);
    } catch (err) {
      logApiError({ requestId, route: 'ac-infinity:cron.poll' }, err);
      return sendApiError(res, 502, 'AC Infinity poll failed', requestId);
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return sendApiError(res, auth.status, auth.error, requestId);

  const { facilityId } = req.body || {};
  if (!facilityId) return sendApiError(res, 400, 'facilityId is required', requestId);

  const access = await requireFacilityEditor(auth, facilityId);
  if (access.error) return sendApiError(res, access.status, access.error, requestId);

  const limited = checkRateLimit(`ac-infinity:${auth.user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return sendApiError(res, 429, 'Too many requests. Try again shortly.', requestId);
  }

  if (action === 'devices.list') {
    try {
      const appId = cachedAppId || await acLogin();
      const data = await acRequest('/api/user/devInfoListAll', { userId: appId });
      return res.status(200).json({ data });
    } catch (err) {
      logApiError({ requestId, route: 'ac-infinity:devices.list', userId: auth.user.id, facilityId }, err);
      return sendApiError(res, 502, 'AC Infinity request failed', requestId);
    }
  }

  return sendApiError(res, 400, `Unknown action: ${action}`, requestId);
}
