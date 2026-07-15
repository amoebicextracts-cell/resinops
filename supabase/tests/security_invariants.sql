begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'facilities'
      and column_name = any (array[
        'metrc_api_key', 'flourish_api_key', 'biotrack_api_key',
        'kaycha_api_key', 'green_analytics_api_key', 'distru_api_key'
      ])
  ),
  0::bigint,
  'browser-readable integration credential columns are removed'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'facilities', 'facility_members', 'profiles',
        'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
        'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
        'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
        'import_history', 'inventory_items', 'labor_types', 'loto_log',
        'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
        'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
        'vendors', 'work_orders'
      ])
      and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
  ),
  0::bigint,
  'no tenant table retains an unconditional authenticated policy'
);

select is(
  (
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'facilities', 'facility_members', 'profiles', 'audit_logs',
        'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
        'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
        'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
        'import_history', 'inventory_items', 'labor_types', 'loto_log',
        'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
        'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
        'vendors', 'work_orders'
      ])
      and not relation.relrowsecurity
  ),
  0::bigint,
  'RLS is enabled on every tenant-owned table'
);

select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any (array['is_facility_member', 'is_facility_owner_or_admin'])
  ),
  0::bigint,
  'legacy security-definer helpers are removed from the public schema'
);

select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'anonymous clients cannot execute the auth trigger function'
);

select is(
  has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'authenticated clients cannot execute the auth trigger function'
);

select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  0::bigint,
  'clients cannot write directly to immutable audit history'
);

select is(
  (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('private', 'public')
      and procedure.prosecdef
      and procedure.proname = any (array[
        'facility_role', 'is_facility_member', 'can_edit_facility',
        'can_admin_facility', 'is_facility_owner', 'can_bootstrap_owner',
        'can_bootstrap_facility', 'protect_facility_owners',
        'audit_facility_change', 'handle_new_user'
      ])
      and not coalesce(procedure.proconfig, array[]::text[]) @> array['search_path=""']
  ),
  0::bigint,
  'security-definer functions use an empty fixed search path'
);

select * from finish();
rollback;

