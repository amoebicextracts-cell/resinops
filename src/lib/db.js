// ============================================================
// ResinOps V2 — Universal Data Layer
// src/lib/db.js
//
// Provides a unified API that works in both:
//   V1 mode: reads/writes localStorage (no Supabase configured)
//   V2 mode: reads/writes Supabase (VITE_SUPABASE_URL set)
//
// Usage:
//   import { db } from './lib/db';
//   const batches = await db.harvest_batches.list();
//   await db.harvest_batches.upsert(batch);
//   await db.harvest_batches.delete(id);
// ============================================================

import { supabase, isSupabaseEnabled, getCurrentFacility } from './supabase';
import { transformForDb, transformFromDb } from './dbTransforms';

// ── localStorage key mapping ──────────────────────────────────
const LS_KEYS = {
  facilities:         'resinops_facility_settings',
  grow_rooms:         'resinops_grow_map',
  grow_spaces:        'resinops_spaces',
  harvest_batches:    'resinops_harvest_batches',
  clone_schedules:    'resinops_clone_sched',
  mother_plants:      'resinops_mothers',
  strains:            'resinops_strains',
  tc_vessels:         'resinops_tc_vessels',
  production_batches: 'resinops_prod',
  qc_tests:           'resinops_qc_tests',
  qc_holds:           'resinops_qc_holds',
  cultivation_inputs: 'resinops_cult_inputs',
  spray_log:          'resinops_spray_log',
  gmp_sops:           'resinops_sops',
  gmp_shifts:         'resinops_shifts',
  gmp_deviations:     'resinops_deviations',
  skus:               'resinops_skus',
  boms:               'resinops_boms',
  sales_orders:       'resinops_orders',
  inventory_items:    'resinops_inventory',
  equipment:          'resinops_equipment',
  facility_map_spaces:'resinops_facility_map',
  labor_types:        'resinops_labor_types',
  import_history:     'resinops_import_history',
  employees:          'resinops_employees',
  vendors:            'resinops_vendors_v2',
  purchase_orders:    'resinops_purchase_orders',
  work_orders:        'resinops_work_orders',
  loto_log:           'resinops_loto_log',
};

// ── localStorage helpers ──────────────────────────────────────
function lsGet(table) {
  const key = LS_KEYS[table];
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const val = raw ? JSON.parse(raw) : [];
    return Array.isArray(val) ? val : (val ? [val] : []);
  } catch { return []; }
}

function lsSet(table, data) {
  const key = LS_KEYS[table];
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(data));
}

function lsUpsert(table, record) {
  const rows = lsGet(table);
  const id = record.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${table}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  const withId = { ...record, id, updated_at: new Date().toISOString() };
  const idx = rows.findIndex(r => String(r.id) === String(id));
  if (idx >= 0) rows[idx] = withId;
  else rows.push({ ...withId, created_at: withId.created_at || new Date().toISOString() });
  lsSet(table, rows);
  return withId;
}

function lsDelete(table, id) {
  const rows = lsGet(table).filter(r => String(r.id) !== String(id));
  lsSet(table, rows);
}

// ── Supabase helpers ──────────────────────────────────────────
async function sbList(table, filters = {}) {
  let q = supabase.from(table).select('*');
  const fid = getCurrentFacility();
  if (fid && table !== 'facilities' && table !== 'profiles') {
    q = q.eq('facility_id', fid);
  }
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  // Transform each row from Supabase columns to app field names
  return (data || []).map(row => transformFromDb(table, row));
}

async function sbUpsert(table, record) {
  const fid = getCurrentFacility();
  // Transform app field names → Supabase column names and strip invalid fields
  const transformed = transformForDb(table, record);
  const withFacility = (fid && table !== 'facilities' && table !== 'profiles')
    ? { ...transformed, facility_id: fid }
    : transformed;
  const { data, error } = await supabase
    .from(table)
    .upsert(withFacility, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  // Transform Supabase columns back to app field names
  return transformFromDb(table, data);
}

async function sbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ── Universal table interface factory ────────────────────────
function makeTable(tableName) {
  return {
    list:   (filters)      => isSupabaseEnabled
      ? sbList(tableName, filters)
      : Promise.resolve(lsGet(tableName)),

    get:    (id)           => isSupabaseEnabled
      ? supabase.from(tableName).select('*').eq('id', id).single().then(r => { if(r.error) throw r.error; return r.data; })
      : Promise.resolve(lsGet(tableName).find(r => String(r.id) === String(id))),

    upsert: (record)       => isSupabaseEnabled
      ? sbUpsert(tableName, record)
      : Promise.resolve(lsUpsert(tableName, record)),

    delete: (id)           => isSupabaseEnabled
      ? sbDelete(tableName, id)
      : Promise.resolve(lsDelete(tableName, id)),

    // Convenience: replace entire table (for bulk import)
    replaceAll: (records)  => isSupabaseEnabled
      ? Promise.reject(new Error('replaceAll not supported in Supabase mode — use upsert per record'))
      : Promise.resolve(lsSet(tableName, records)),
  };
}

// ── The db object — use this everywhere ──────────────────────
export const db = Object.fromEntries(
  Object.keys(LS_KEYS).map(table => [table, makeTable(table)])
);

// ── Auth helpers ──────────────────────────────────────────────
export const auth = {
  signUp: async (email, password, fullName) => {
    if (!isSupabaseEnabled) return { error: 'Supabase not configured' };
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    });
    return { data, error };
  },

  signIn: async (email, password) => {
    if (!isSupabaseEnabled) return { error: 'Supabase not configured' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  },

  signOut: async () => {
    if (!isSupabaseEnabled) return;
    await supabase.auth.signOut();
  },

  getSession: async () => {
    if (!isSupabaseEnabled) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  },

  getUser: async () => {
    if (!isSupabaseEnabled) return null;
    const { data } = await supabase.auth.getUser();
    return data?.user || null;
  },

  onAuthStateChange: (callback) => {
    if (!isSupabaseEnabled) return { data: { subscription: { unsubscribe: () => {} } } };
    return supabase.auth.onAuthStateChange(callback);
  },
};

// ── Facility helpers ──────────────────────────────────────────
export const facilities = {
  // Get all facilities the current user belongs to
  listMine: async () => {
    if (!isSupabaseEnabled) {
      const settings = JSON.parse(localStorage.getItem('resinops_facility_settings') || '{}');
      return settings.facilityName ? [{ id: 'local', ...settings }] : [];
    }
    const { data, error } = await supabase
      .from('facility_members')
      .select('*, facility:facilities(*)')
      .eq('user_id', (await auth.getUser())?.id);
    if (error) throw error;
    return (data || []).map(m => m.facility);
  },

  create: async (facilityData) => {
    if (!isSupabaseEnabled) {
      localStorage.setItem('resinops_facility_settings', JSON.stringify(facilityData));
      return { id: 'local', ...facilityData };
    }
    // Create facility
    const { data: facility, error } = await supabase
      .from('facilities')
      .insert(facilityData)
      .select()
      .single();
    if (error) throw error;

    // Add creator as owner
    const user = await auth.getUser();
    await supabase.from('facility_members').insert({
      facility_id: facility.id,
      user_id: user.id,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

    return facility;
  },
};

// ── Migration helper: localStorage → Supabase ─────────────────
export async function migrateLocalStorageToSupabase(facilityId) {
  if (!isSupabaseEnabled) throw new Error('Supabase not configured');

  const results = {};

  for (const [table, lsKey] of Object.entries(LS_KEYS)) {
    if (table === 'facilities') continue;
    try {
      const raw = localStorage.getItem(lsKey);
      const records = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(records) || records.length === 0) continue;

      // Add facility_id to each record
      const withFacility = records.map(r => ({
        ...r,
        facility_id: facilityId,
        id: r.id ? String(r.id) : undefined, // Supabase needs string/uuid IDs
      }));

      const { error } = await supabase.from(table).upsert(withFacility, { onConflict: 'id' });
      results[table] = error ? { error: error.message } : { count: records.length };
    } catch (e) {
      results[table] = { error: e.message };
    }
  }

  return results;
}
