-- CI-only fixture for the ResinOps adoption migration.
-- This file is copied into migrations only inside a disposable GitHub runner.
-- It must never be applied to a hosted Supabase project.

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  metrc_api_key text,
  flourish_api_key text,
  biotrack_api_key text,
  kaycha_api_key text,
  green_analytics_api_key text,
  distru_api_key text
);

create table public.facility_members (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint facility_members_role_check check (role in ('owner', 'admin', 'member', 'viewer'))
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $business_tables$
declare
  table_name text;
begin
  foreach table_name in array array[
    'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
    'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
    'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
    'import_history', 'inventory_items', 'labor_types', 'loto_log',
    'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
    'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
    'vendors', 'work_orders'
  ]
  loop
    execute format(
      'create table public.%I (id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete cascade, name text)',
      table_name
    );
  end loop;
end
$business_tables$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Reproduce the unsafe legacy policy shape so the migration must remove it.
do $legacy_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'facilities', 'facility_members', 'profiles',
    'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
    'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
    'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
    'import_history', 'inventory_items', 'labor_types', 'loto_log',
    'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
    'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
    'vendors', 'work_orders'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy legacy_authenticated_all on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end
$legacy_policies$;

