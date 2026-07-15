import { getCurrentFacility, isSupabaseEnabled, supabase } from './supabase';
export { formatApiError } from './apiErrors.js';

export async function authenticatedApiFetch(path, options = {}, { includeFacility = false } = {}) {
  if (!isSupabaseEnabled || !supabase) {
    throw new Error('Sign in is required to use hosted AI and METRC services.');
  }
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw new Error('Your session expired. Sign in again.');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  let body = options.body;
  if (includeFacility) {
    const facilityId = getCurrentFacility();
    if (!facilityId) throw new Error('Select a facility before using METRC.');
    const parsed = typeof body === 'string' ? JSON.parse(body) : (body || {});
    body = JSON.stringify({ ...parsed, facilityId });
    headers.set('Content-Type', 'application/json');
  }

  return fetch(path, { ...options, headers, body });
}
