import { initializeApiRequest, sendApiError } from './_observability.js';

export default function handler(req, res) {
  const requestId = initializeApiRequest(req, res);
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return sendApiError(res, 405, 'Method not allowed', requestId);
  }

  const payload = {
    status: 'ok',
    service: 'resinops-api',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'development',
    timestamp: new Date().toISOString(),
    requestId,
  };

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
}
