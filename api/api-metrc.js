// ============================================================
// ResinOps V2 — METRC API Proxy
// api/metrc.js — Vercel serverless function
//
// All METRC calls go through this server-side function.
// API keys are NEVER exposed to the browser.
//
// Request format:
// POST /api/metrc
// {
//   action: "plants.active" | "harvests.active" | "labtests.results" | etc.
//   state: "NY" | "CO" | "OR" etc.
//   licenseNumber: "123-456789" (operator's METRC license)
//   params: {} // optional query params
//   body: {} // optional POST body
//   method: "GET" | "POST" | "PUT" (default GET)
// }
// ============================================================

// State → METRC API subdomain mapping
const METRC_STATES = {
  AK: 'api-ak', AL: 'api-al', AZ: 'api-az', CA: 'api-ca',
  CO: 'api-co', IL: 'api-il', LA: 'api-la', MA: 'api-ma',
  MD: 'api-md', ME: 'api-me', MI: 'api-mi', MO: 'api-mo',
  MT: 'api-mt', NM: 'api-nm', NV: 'api-nv', NY: 'api-mn',
  OH: 'api-oh', OK: 'api-ok', OR: 'api-or', WA: 'api-wa',
  WV: 'api-wv',
};

// Action → METRC endpoint mapping
const ENDPOINTS = {
  // Plants
  'plants.active':          { path: '/plants/v1/active',          method: 'GET' },
  'plants.vegetative':      { path: '/plants/v1/vegetative',       method: 'GET' },
  'plants.flowering':       { path: '/plants/v1/flowering',        method: 'GET' },
  'plants.onhold':          { path: '/plants/v1/onhold',           method: 'GET' },
  'plants.inactive':        { path: '/plants/v1/inactive',         method: 'GET' },
  'plants.create':          { path: '/plants/v1/plantings',        method: 'POST' },
  'plants.manicure':        { path: '/plants/v1/manicure/packages',method: 'POST' },
  'plants.harvest':         { path: '/plants/v1/harvestplants',    method: 'POST' },
  'plants.move':            { path: '/plants/v1/moveplants',       method: 'PUT' },
  'plants.change_growth':   { path: '/plants/v1/changegrowthphases', method: 'PUT' },
  'plants.destroy':         { path: '/plants/v1/destroyplants',    method: 'POST' },
  'plants.batches':         { path: '/plantbatches/v1/active',     method: 'GET' },

  // Harvests
  'harvests.active':        { path: '/harvests/v1/active',         method: 'GET' },
  'harvests.onhold':        { path: '/harvests/v1/onhold',         method: 'GET' },
  'harvests.inactive':      { path: '/harvests/v1/inactive',       method: 'GET' },
  'harvests.create':        { path: '/harvests/v1/create/packages', method: 'POST' },
  'harvests.remove_waste':  { path: '/harvests/v1/removewaste',    method: 'POST' },
  'harvests.finish':        { path: '/harvests/v1/finish',         method: 'POST' },
  'harvests.unfinish':      { path: '/harvests/v1/unfinish',       method: 'POST' },

  // Packages
  'packages.active':        { path: '/packages/v1/active',         method: 'GET' },
  'packages.onhold':        { path: '/packages/v1/onhold',         method: 'GET' },
  'packages.inactive':      { path: '/packages/v1/inactive',       method: 'GET' },
  'packages.create':        { path: '/packages/v1',                method: 'POST' },
  'packages.update':        { path: '/packages/v1',                method: 'PUT' },
  'packages.change_item':   { path: '/packages/v1/change/item',    method: 'PUT' },
  'packages.adjust':        { path: '/packages/v1/adjust',         method: 'PUT' },
  'packages.finish':        { path: '/packages/v1/finish',         method: 'PUT' },
  'packages.unfinish':      { path: '/packages/v1/unfinish',       method: 'PUT' },

  // Lab Tests / COAs
  'labtests.results':       { path: '/labtests/v1/results',        method: 'GET' },
  'labtests.states':        { path: '/labtests/v1/states',         method: 'GET' },
  'labtests.types':         { path: '/labtests/v1/types',          method: 'GET' },
  'labtests.record':        { path: '/labtests/v1/record',         method: 'POST' },

  // Transfers
  'transfers.incoming':     { path: '/transfers/v1/incoming',      method: 'GET' },
  'transfers.outgoing':     { path: '/transfers/v1/outgoing',      method: 'GET' },
  'transfers.rejected':     { path: '/transfers/v1/rejected',      method: 'GET' },
  'transfers.create':       { path: '/transfers/v1/external/incoming', method: 'POST' },
  'transfers.deliveries':   { path: '/transfers/v1/{id}/deliveries', method: 'GET' },
  'transfers.packages':     { path: '/transfers/v1/delivery/{id}/packages', method: 'GET' },

  // Rooms
  'rooms.active':           { path: '/rooms/v1/active',            method: 'GET' },
  'rooms.create':           { path: '/rooms/v1',                   method: 'POST' },
  'rooms.update':           { path: '/rooms/v1',                   method: 'PUT' },
  'rooms.delete':           { path: '/rooms/v1',                   method: 'DELETE' },

  // Strains
  'strains.active':         { path: '/strains/v1/active',          method: 'GET' },
  'strains.create':         { path: '/strains/v1',                 method: 'POST' },
  'strains.update':         { path: '/strains/v1',                 method: 'PUT' },

  // Items
  'items.active':           { path: '/items/v1/active',            method: 'GET' },
  'items.categories':       { path: '/items/v1/categories',        method: 'GET' },
  'items.create':           { path: '/items/v1',                   method: 'POST' },
  'items.update':           { path: '/items/v1',                   method: 'PUT' },

  // Employees
  'employees.list':         { path: '/employees/v1',               method: 'GET' },

  // Facilities
  'facilities.list':        { path: '/facilities/v1',              method: 'GET' },

  // Tags
  'tags.available':         { path: '/tags/v1/available/plant',    method: 'GET' },
  'tags.used':              { path: '/tags/v1/used',               method: 'GET' },
  'tags.voided':            { path: '/tags/v1/voided',             method: 'GET' },

  // Sales
  'sales.active':           { path: '/sales/v1/receipts/active',   method: 'GET' },
  'sales.inactive':         { path: '/sales/v1/receipts/inactive', method: 'GET' },
  'sales.create':           { path: '/sales/v1/receipts',          method: 'POST' },

  // Processing
  'processing.active':      { path: '/processing/v1/packages/active', method: 'GET' },
};

// Rate limiting — simple in-memory (per cold start)
let lastCallTime = 0;
const MIN_INTERVAL_MS = 200; // 200ms between calls = 5 req/sec max

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function metrcRequest(state, softwareKey, userKey, licenseNumber, action, params = {}, body = null, method = null) {
  const subdomain = METRC_STATES[state.toUpperCase()];
  if (!subdomain) throw new Error(`State ${state} not supported by METRC`);

  const endpoint = ENDPOINTS[action];
  if (!endpoint) throw new Error(`Unknown METRC action: ${action}`);

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastCallTime = Date.now();

  // Build URL
  const baseUrl = `https://${subdomain}.metrc.com`;
  let path = endpoint.path;

  // Replace path params like {id}
  if (params._pathId) {
    path = path.replace('{id}', params._pathId);
    delete params._pathId;
  }

  // Build query string — always include licenseNumber
  const queryParams = new URLSearchParams({
    licenseNumber,
    ...params,
  });

  const url = `${baseUrl}${path}?${queryParams.toString()}`;
  const httpMethod = method || endpoint.method;

  // Auth — METRC uses HTTP Basic Auth
  // Software API key is username, User API key is password
  const credentials = Buffer.from(`${softwareKey}:${userKey}`).toString('base64');

  const options = {
    method: httpMethod,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body && (httpMethod === 'POST' || httpMethod === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`METRC API error ${response.status}: ${errorText}`);
  }

  // Some endpoints return empty body on success
  const text = await response.text();
  if (!text || text.trim() === '') return { success: true };

  try {
    return JSON.parse(text);
  } catch {
    return { success: true, raw: text };
  }
}

// Main handler
export default async function handler(req, res) {
  // CORS — restrict to our own domain
  const allowedOrigins = ['https://app.resinops.com', 'https://resinops.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action,
    state,
    licenseNumber,
    params = {},
    body = null,
    method = null,
  } = req.body || {};

  // Validate required fields
  if (!action) return res.status(400).json({ error: 'action is required' });
  if (!state)  return res.status(400).json({ error: 'state is required' });
  if (!licenseNumber) return res.status(400).json({ error: 'licenseNumber is required' });

  // Get API keys from environment — NEVER from the request
  const softwareKey = process.env.METRC_SOFTWARE_KEY;
  const userKey = process.env[`METRC_USER_KEY_${licenseNumber.replace(/-/g,'_').toUpperCase()}`]
    || process.env.METRC_USER_KEY; // fallback for single-operator

  if (!softwareKey) return res.status(500).json({ error: 'METRC_SOFTWARE_KEY not configured' });
  if (!userKey)     return res.status(500).json({ error: 'METRC user key not configured for this license' });

  try {
    const data = await metrcRequest(state, softwareKey, userKey, licenseNumber, action, params, body, method);
    return res.status(200).json({ data });
  } catch (err) {
    console.error('METRC API error:', err.message);
    return res.status(502).json({ error: err.message });
  }
}
