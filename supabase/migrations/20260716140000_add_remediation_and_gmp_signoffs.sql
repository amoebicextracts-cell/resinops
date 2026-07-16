-- Add remediation (microbial dose-calc) and gmp_signoffs (GMP step sign-off)
-- tables. Both features have existed in the app UI for a while but had no
-- backing table, so records only ever lived in browser localStorage and were
-- never actually durable or facility-isolated. This migration creates the
-- tables fresh and applies the same facility-isolation policy shape, audit
-- trigger, and indexing convention as the July 15 hardening migration.
--
-- Like that migration, this is not applied automatically; review and run it
-- through the disposable database job (or `supabase test db`) first.

begin;

create table if not exists public.remediation (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  -- Polymorphic reference to the failed batch — either harvest_batches.id or
  -- production_batches.id depending on source_type. Not a foreign key since
  -- it can point to either table; source_type disambiguates.
  source_type text not null check (source_type in ('harvest', 'production')),
  source_id uuid,
  strain_name text,
  weight_g numeric,
  lab_name text,
  lab_report_ref text,
  test_date date,
  tyam_cfu numeric,
  tab_cfu numeric,
  aspergillus boolean not null default false,
  gy_per_hour numeric,
  turn_required boolean not null default true,
  status text not null default 'flagged'
    check (status in ('flagged', 'scheduled', 'irradiated', 'passed', 'failed')),
  retest_result text,
  notes text,
  -- Computed dose breakdown (rTyam, rTab, higher, totalDoseGy, totalHours, ...)
  -- stored as-calculated at save time, matching how other modules persist
  -- composite calculated results (e.g. production_batches.cb_blend_result).
  dose jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gmp_signoffs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  -- Polymorphic reference, same shape as remediation.source_id above.
  batch_type text not null check (batch_type in ('harvest', 'production')),
  batch_id uuid,
  step_name text not null,
  performed_by_id uuid references public.employees(id) on delete set null,
  verified_by_id uuid references public.employees(id) on delete set null,
  performed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The base schema's blanket grant to `authenticated` only covered tables
-- that existed when it ran; these tables are new and need it explicitly.
-- RLS policies restrict rows, but that's on top of this base table grant,
-- not a substitute for it.
grant select, insert, update, delete on public.remediation to authenticated;
grant select, insert, update, delete on public.gmp_signoffs to authenticated;

create index if not exists remediation_facility_id_idx
  on public.remediation (facility_id);
create index if not exists remediation_source_idx
  on public.remediation (source_type, source_id);

create index if not exists gmp_signoffs_facility_id_idx
  on public.gmp_signoffs (facility_id);
create index if not exists gmp_signoffs_batch_idx
  on public.gmp_signoffs (batch_type, batch_id);

drop trigger if exists set_updated_at on public.remediation;
create trigger set_updated_at
before update on public.remediation
for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.gmp_signoffs;
create trigger set_updated_at
before update on public.gmp_signoffs
for each row execute function public.handle_updated_at();

-- Same facility-isolation policy shape as every other tenant-owned table
-- (see the July 15 hardening migration's $tenant_policies$ block).
do $new_tenant_policies$
declare
  table_name text;
begin
  foreach table_name in array array['remediation', 'gmp_signoffs']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy facility_isolation_select on public.%I for select to authenticated using (private.is_facility_member(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_insert on public.%I for insert to authenticated with check (private.can_edit_facility(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_update on public.%I for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_delete on public.%I for delete to authenticated using (private.can_admin_facility(facility_id))',
      table_name
    );
  end loop;
end
$new_tenant_policies$;

-- Same immutable audit trigger as every other tenant-owned table.
do $new_audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array['remediation', 'gmp_signoffs']
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$new_audit_triggers$;

commit;
