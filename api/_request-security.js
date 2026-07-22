const DEFAULT_ORIGINS = [
  'https://app.resinops.com',
  'https://resinops.com',
  'http://localhost:5173',
];

const rateBuckets = new Map();

export function getBearerToken(header = '') {
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1] || null;
}

export function getAllowedOrigins(env = process.env) {
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const preview = env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : [];
  return new Set([...DEFAULT_ORIGINS, ...configured, ...preview]);
}

export function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (origin && getAllowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID');
}

export function isOriginAllowed(origin, env = process.env) {
  return !origin || getAllowedOrigins(env).has(origin);
}

export function serializedSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

export function validateAiPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { system = '', prompt, history = [], purpose = 'general-chat' } = body;
  const purposes = new Set(['general-chat', 'data-import', 'operations-analyst', 'strain-description']);
  if (!purposes.has(purpose)) return 'Unknown AI request purpose';
  if (typeof prompt !== 'string' || !prompt.trim()) return 'prompt is required';
  if (prompt.length > 150_000) return 'prompt is too large';
  if (typeof system !== 'string' || system.length > 50_000) return 'system prompt is too large';
  if (!Array.isArray(history) || history.length > 20) return 'history is invalid or too long';
  for (const message of history) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 20_000) {
      return 'history contains an invalid message';
    }
  }
  if (serializedSize(body) > 1_000_000) return 'Request body is too large';
  return null;
}

export function validateChatPayload(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return 'Invalid request body';
  if (body.messages.length < 1 || body.messages.length > 20) return 'messages is invalid or too long';
  if (serializedSize(body) > 250_000) return 'Request body is too large';
  for (const message of body.messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 20_000) {
      return 'messages contains an invalid message';
    }
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FACILITY_ROLES = new Set(['owner', 'admin', 'manager', 'member', 'viewer']);
// A scope override may additionally be 'none' (explicitly no access to that
// scope) — unlike the global `role`, which must always be one of the 5 real
// facility roles.
const SCOPE_ROLE_VALUES = new Set([...FACILITY_ROLES, 'none']);
const PERMISSION_SCOPES = new Set(['cultivation', 'processing', 'compliance', 'people_labor', 'business', 'facility']);

export function validateInvitePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { email, facilityId, role, scopeRoles = {} } = body;
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email) || email.length > 254) return 'A valid email is required';
  if (typeof facilityId !== 'string' || !facilityId.trim()) return 'facilityId is required';
  if (typeof role !== 'string' || !FACILITY_ROLES.has(role)) return 'Unknown role';
  if (!scopeRoles || typeof scopeRoles !== 'object' || Array.isArray(scopeRoles)) return 'scopeRoles must be an object';
  for (const [scope, scopeRole] of Object.entries(scopeRoles)) {
    if (!PERMISSION_SCOPES.has(scope)) return `Unknown permission scope: ${scope}`;
    if (!SCOPE_ROLE_VALUES.has(scopeRole)) return `Unknown role for scope ${scope}`;
  }
  return null;
}

export function checkRateLimit(key, { limit, windowMs }, now = Date.now()) {
  const existing = rateBuckets.get(key);
  if (!existing || now - existing.startedAt >= windowMs) {
    rateBuckets.set(key, { count: 1, startedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - existing.startedAt)) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function isMetrcWriteAction(endpoint) {
  return endpoint?.method !== 'GET';
}

export function validateMetrcPayload(body, states, endpoints) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body';
  const { action, state, licenseNumber, facilityId, params = {}, body: requestBody = null } = body;
  if (!endpoints[action]) return 'Unknown METRC action';
  if (typeof state !== 'string' || !states[state.toUpperCase()]) return 'Unsupported METRC state';
  if (typeof licenseNumber !== 'string' || !licenseNumber.trim() || licenseNumber.length > 100) return 'licenseNumber is required';
  if (typeof facilityId !== 'string' || !facilityId.trim() || facilityId.length > 100) return 'facilityId is required';
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'params must be an object';
  if (serializedSize({ params, body: requestBody }) > 250_000) return 'METRC request is too large';
  return null;
}
