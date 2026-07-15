import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationUrl = new URL(
  '../supabase/migrations/20260715051427_harden_facility_access.sql',
  import.meta.url,
);
const migration = readFileSync(migrationUrl, 'utf8');

const facilityTables = [
  'boms', 'clone_schedules', 'cultivation_inputs', 'employees', 'equipment',
  'facility_map_spaces', 'facility_members', 'gmp_deviations', 'gmp_shifts',
  'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches', 'import_history',
  'inventory_items', 'labor_types', 'loto_log', 'mother_plants',
  'production_batches', 'purchase_orders', 'qc_tests', 'sales_orders', 'skus',
  'spray_log', 'strains', 'tc_vessels', 'vendors', 'work_orders',
];

test('hardening migration covers every facility-owned table', () => {
  for (const table of facilityTables) {
    assert.match(migration, new RegExp(`'${table}'`), `missing ${table}`);
  }
});

test('hardening migration replaces permissive policies with role checks', () => {
  assert.doesNotMatch(migration, /create policy[\s\S]{0,250}(using|with check)\s*\(true\)/i);
  assert.match(migration, /using \(private\.is_facility_member\(facility_id\)\)/);
  assert.match(migration, /with check \(private\.can_edit_facility\(facility_id\)\)/);
  assert.match(migration, /using \(private\.can_admin_facility\(facility_id\)\)/);
});

test('security definer helpers are private and explicitly granted', () => {
  assert.match(migration, /create schema if not exists private/);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke all on function private\.is_facility_member\(uuid\) from public, anon/);
  assert.match(migration, /grant execute on function private\.is_facility_member\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function private\.can_bootstrap_facility\(uuid\) to authenticated/);
});

test('browser-readable integration secrets are removed', () => {
  for (const column of [
    'metrc_api_key', 'flourish_api_key', 'biotrack_api_key',
    'kaycha_api_key', 'green_analytics_api_key', 'distru_api_key',
  ]) {
    assert.match(migration, new RegExp(`drop column if exists ${column}`));
  }
});

test('immutable facility audit history is installed', () => {
  assert.match(migration, /create table if not exists public\.audit_logs/);
  assert.match(migration, /grant select on public\.audit_logs to authenticated/);
  assert.match(migration, /create or replace function private\.audit_facility_change\(\)/);
  assert.doesNotMatch(migration, /grant (insert|update|delete|all) on public\.audit_logs to authenticated/i);
});
