-- Add cogs_records (per-batch COGS overrides + revenue inputs) and
-- cultivation_costs (per-grow-space cultivation supply costs) tables.
-- Finance.jsx has read/edited both of these as pure React state since it
-- was written — no backing table ever existed, so every material/labor
-- override, units sold, revenue figure, and cultivation cost entered on
-- the Cost & P&L page evaporated on refresh. This creates the tables and
-- wires them up as 1:1 overlays (unique FK) on production_batches and
-- grow_spaces respectively, using the same facility-isolation policy
-- shape, audit trigger, and indexing convention as prior migrations.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.cogs_records (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  production_batch_id uuid not null references public.production_batches(id) on delete cascade,
  material_cost_override numeric,
  -- override_materials/manual_materials are read by Finance.jsx's COGS
  -- calculator (calcBatchCOGS) but not yet wired to any UI control —
  -- persisting them now avoids a second schema gap if that UI lands later.
  override_materials boolean not null default false,
  manual_materials jsonb,
  labor_cost_override numeric,
  test_fee numeric,
  cult_cost numeric,
  actual_units integer,
  deduct_trigger text not null default 'creation'
    check (deduct_trigger in ('creation', 'completion', 'manual')),
  units_sold integer,
  sku_price_id uuid references public.skus(id) on delete set null,
  rev_per_unit numeric,
  total_rev_override numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_batch_id)
);

create table if not exists public.cultivation_costs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  grow_space_id uuid not null references public.grow_spaces(id) on delete cascade,
  media numeric,
  nutrients numeric,
  ipm numeric,
  other numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grow_space_id)
);

-- The base schema's blanket grant to `authenticated` only covered tables
-- that existed when it ran; these tables are new and need it explicitly.
grant select, insert, update, delete on public.cogs_records to authenticated;
grant select, insert, update, delete on public.cultivation_costs to authenticated;

create index if not exists cogs_records_facility_id_idx
  on public.cogs_records (facility_id);

create index if not exists cultivation_costs_facility_id_idx
  on public.cultivation_costs (facility_id);

drop trigger if exists set_updated_at on public.cogs_records;
create trigger set_updated_at
before update on public.cogs_records
for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.cultivation_costs;
create trigger set_updated_at
before update on public.cultivation_costs
for each row execute function public.handle_updated_at();

-- Same facility-isolation policy shape as every other tenant-owned table
-- (see the July 15 hardening migration's $tenant_policies$ block).
do $new_tenant_policies$
declare
  table_name text;
begin
  foreach table_name in array array['cogs_records', 'cultivation_costs']
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
  foreach table_name in array array['cogs_records', 'cultivation_costs']
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
