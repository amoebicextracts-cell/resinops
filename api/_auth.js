import { createClient } from '@supabase/supabase-js';
import { getBearerToken } from './_request-security.js';

function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  };
}

export async function authenticateRequest(req) {
  const token = getBearerToken(req.headers?.authorization || '');
  if (!token) return { error: 'Authentication required', status: 401 };

  const { url, key } = getSupabaseConfig();
  if (!url || !key) return { error: 'Server authentication is not configured', status: 503 };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: 'Invalid or expired session', status: 401 };
  return { user: data.user, supabase, token };
}

export async function authorizeFacility(auth, facilityId, licenseNumber) {
  const { data: membership, error: membershipError } = await auth.supabase
    .from('facility_members')
    .select('facility_id')
    .eq('facility_id', facilityId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (membershipError) return { error: 'Unable to verify facility access', status: 503 };
  if (!membership) return { error: 'Facility access denied', status: 403 };

  const { data: facility, error: facilityError } = await auth.supabase
    .from('facilities')
    .select('id, license_number')
    .eq('id', facilityId)
    .maybeSingle();
  if (facilityError) return { error: 'Unable to verify facility license', status: 503 };
  if (!facility || !facility.license_number || facility.license_number.trim() !== licenseNumber.trim()) {
    return { error: 'METRC license does not match the selected facility', status: 403 };
  }
  return { facility };
}
