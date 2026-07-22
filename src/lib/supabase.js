// ============================================================
// ResinOps V2 — Supabase Data Layer
// src/lib/supabase.js
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { isPasswordRecoveryUrl, isInviteUrl } from './auth.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase consumes recovery/invite tokens and clears the URL while the
// client is initializing. Capture the intent first so React cannot miss the
// recovery/invite event and treat the temporary session as a normal sign-in.
export const passwordRecoveryFromInitialUrl = typeof window !== 'undefined'
  && isPasswordRecoveryUrl(window.location.href);

export const inviteFromInitialUrl = typeof window !== 'undefined'
  && isInviteUrl(window.location.href);

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
let _currentFacilityScopeRoles = {};

export function setCurrentFacility(id) { _currentFacilityId = id; }
export function getCurrentFacility() { return _currentFacilityId; }
export function setCurrentFacilityRole(role) { _currentFacilityRole = role || null; }
export function getCurrentFacilityRole() { return _currentFacilityRole; }
export function setCurrentFacilityScopeRoles(scopeRoles) { _currentFacilityScopeRoles = scopeRoles || {}; }
export function getCurrentFacilityScopeRoles() { return _currentFacilityScopeRoles; }
