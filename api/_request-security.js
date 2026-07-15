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
