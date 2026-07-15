import { pathToFileURL } from 'node:url';

const DEFAULT_HEALTH_URL = 'https://resinops-deploy.vercel.app/api/health';

async function readJson(response, label) {
  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  return payload;
}

export async function runHealthCheck({
  fetchImpl = fetch,
  healthUrl = DEFAULT_HEALTH_URL,
  now = Date.now(),
} = {}) {
  const response = await fetchImpl(healthUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response, 'ResinOps health endpoint');
  const reportedAt = Date.parse(payload.timestamp);

  if (payload.status !== 'ok' || payload.service !== 'resinops-api') {
    throw new Error('ResinOps health payload failed its service contract');
  }
  if (!Number.isFinite(reportedAt) || Math.abs(now - reportedAt) > 10 * 60_000) {
    throw new Error('ResinOps health timestamp is missing or stale');
  }
  if (!/^(development|[0-9a-f]{7})$/.test(payload.version)) {
    throw new Error('ResinOps health version is malformed');
  }
  if (typeof payload.requestId !== 'string' || payload.requestId.length < 8) {
    throw new Error('ResinOps health response is missing a request reference');
  }

  return { version: payload.version, requestId: payload.requestId };
}

async function getRestRows(
  fetchImpl,
  supabaseUrl,
  apiKey,
  table,
  query = 'select=id',
  accessToken = apiKey,
) {
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      accept: 'application/json',
      apikey: apiKey,
      authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response, `Supabase ${table} check`);
  if (!Array.isArray(payload)) throw new Error(`Supabase ${table} check did not return rows`);
  return payload;
}

export async function runAnonymousRlsChecks({ fetchImpl = fetch, supabaseUrl, anonKey }) {
  for (const table of ['facilities', 'facility_members', 'audit_logs']) {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/${table}?select=id`, {
      headers: { accept: 'application/json', apikey: anonKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) continue;
    const rows = await readJson(response, `Anonymous Supabase ${table} check`);
    if (!Array.isArray(rows)) throw new Error(`Anonymous Supabase ${table} check did not return rows`);
    if (rows.length !== 0) {
      throw new Error(`Anonymous access exposed ${rows.length} row(s) from ${table}`);
    }
  }
}

export async function runAuthenticatedRlsChecks({
  fetchImpl = fetch,
  supabaseUrl,
  anonKey,
  email,
  password,
  facilityId,
  forbiddenFacilityId,
}) {
  const authResponse = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15_000),
  });
  const session = await readJson(authResponse, 'Supabase smoke-user sign in');
  if (typeof session.access_token !== 'string') throw new Error('Smoke-user sign in returned no access token');

  const ownRows = await getRestRows(
    fetchImpl,
    supabaseUrl,
    anonKey,
    'facilities',
    `select=id&id=eq.${encodeURIComponent(facilityId)}`,
    session.access_token,
  );
  if (ownRows.length !== 1) throw new Error('Smoke user cannot read its assigned facility');

  const forbiddenRows = await getRestRows(
    fetchImpl,
    supabaseUrl,
    anonKey,
    'facilities',
    `select=id&id=eq.${encodeURIComponent(forbiddenFacilityId)}`,
    session.access_token,
  );
  if (forbiddenRows.length !== 0) throw new Error('Smoke user can read a forbidden facility');

  await getRestRows(
    fetchImpl,
    supabaseUrl,
    anonKey,
    'audit_logs',
    'select=id&limit=1',
    session.access_token,
  );
}

function completeGroup(env, names, label) {
  const present = names.filter((name) => env[name]);
  if (present.length > 0 && present.length !== names.length) {
    throw new Error(`${label} is only partially configured`);
  }
  return present.length === names.length;
}

export async function main(env = process.env) {
  const health = await runHealthCheck({ healthUrl: env.HEALTH_URL || DEFAULT_HEALTH_URL });
  console.log(`Health check passed for ${health.version} (${health.requestId})`);

  const publicNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const hasPublicConfig = completeGroup(env, publicNames, 'Anonymous RLS smoke configuration');
  if (hasPublicConfig) {
    await runAnonymousRlsChecks({
      supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''),
      anonKey: env.SUPABASE_ANON_KEY,
    });
    console.log('Anonymous RLS checks passed');
  } else {
    console.log('Anonymous RLS checks skipped: GitHub secrets are not configured');
  }

  const authenticatedNames = [
    'SMOKE_USER_EMAIL', 'SMOKE_USER_PASSWORD',
    'SMOKE_FACILITY_ID', 'SMOKE_FORBIDDEN_FACILITY_ID',
  ];
  const hasAuthenticatedConfig = completeGroup(
    env,
    authenticatedNames,
    'Authenticated RLS smoke configuration',
  );
  if (hasAuthenticatedConfig) {
    if (!hasPublicConfig) throw new Error('Authenticated RLS checks require Supabase URL and anon key');
    await runAuthenticatedRlsChecks({
      supabaseUrl: env.SUPABASE_URL.replace(/\/$/, ''),
      anonKey: env.SUPABASE_ANON_KEY,
      email: env.SMOKE_USER_EMAIL,
      password: env.SMOKE_USER_PASSWORD,
      facilityId: env.SMOKE_FACILITY_ID,
      forbiddenFacilityId: env.SMOKE_FORBIDDEN_FACILITY_ID,
    });
    console.log('Authenticated tenant-isolation and audit-read checks passed');
  } else {
    console.log('Authenticated RLS checks skipped: dedicated smoke-user secrets are not configured');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Production smoke test failed: ${error.message}`);
    process.exitCode = 1;
  });
}
