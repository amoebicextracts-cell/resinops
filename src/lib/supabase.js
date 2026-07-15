// ============================================================
// ResinOps V2 — Supabase Data Layer
// src/lib/supabase.js
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { isPasswordRecoveryUrl } from './auth.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase consumes recovery tokens and clears the URL while the client is
// initializing. Capture the intent first so React cannot miss the recovery
// event and treat the temporary recovery session as a normal sign-in.
export const passwordRecoveryFromInitialUrl = typeof window !== 'undefined'
  && isPasswordRecoveryUrl(window.location.href);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('ResinOps: Supabase env vars not set — running in localStorage mode');
}

export const supabase = SUPABASE_URL
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const isSupabaseEnabled = !!supabase;

// ── Current facility context ──────────────────────────────────
let _currentFacilityId = null;
let _currentFacilityRole = null;

export function setCurrentFacility(id) { _currentFacilityId = id; }
export function getCurrentFacility() { return _currentFacilityId; }
export function setCurrentFacilityRole(role) { _currentFacilityRole = role || null; }
export function getCurrentFacilityRole() { return _currentFacilityRole; }
