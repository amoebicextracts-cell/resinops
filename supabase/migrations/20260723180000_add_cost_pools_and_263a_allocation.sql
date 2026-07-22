-- Adds real IRC §263A indirect-cost capitalization: named cost pools (rent,
-- utilities, depreciation, indirect/QA labor, insurance, etc.), each with
-- its own allocation basis, that get divided across production batches
-- rather than the previous "type a COGS number in by hand" approach.
-- Also adds direct-labor line items to cogs_records, allocation-basis
-- support to the existing cultivation_costs table, and a facility-level
-- QuickBooks chart-of-account mapping used by the CSV export.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.cost_pools (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null check (category in (
    'rent', 'utilities', 'depreciation', 'indirect_labor', 'insurance',
    'repairs_maintenance', 'quality_control', 'other'
  )),
  period_amount numeric not null default 0,
  period text not null default 'monthly' check (period in ('monthly', 'quarterly', 'annual')),
  -- what fraction of this cost pool relates to production/COGS-eligible
  -- activity vs. non-production space or overhead (e.g. only 70% of total
  -- rent is production floor, the rest is retail/office) — the actual
  -- §263A judgment call a facility's accountant would make.
  production_pct numeric not null default 100 check (production_pct between 0 and 100),
  allocation_basis text not null default 'batch_weight' check (allocation_basis in (
    'batch_weight', 'labor_hours', 'unit_count', 'flat_per_batch'
  )),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cost_pools enable row level security;

create policy facility_isolation_select on public.cost_pools for select to authenticated using (private.can_view_facility(facility_id, 'cost_pools'));
create policy facility_isolation_insert on public.cost_pools for insert to authenticated with check (private.can_edit_facility(facility_id, 'cost_pools'));
create policy facility_isolation_update on public.cost_pools for update to authenticated using (private.can_edit_facility(facility_id, 'cost_pools')) with check (private.can_edit_facility(facility_id, 'cost_pools'));
create policy facility_isolation_delete on public.cost_pools for delete to authenticated using (private.can_admin_facility(facility_id, 'cost_pools'));

drop trigger if exists set_updated_at on public.cost_pools;
create trigger set_updated_at before update on public.cost_pools for each row execute function public.set_updated_at();

drop trigger if exists audit_facility_change on public.cost_pools;
create trigger audit_facility_change after insert or update or delete on public.cost_pools for each row execute function private.audit_facility_change();

insert into public.table_scopes (table_name, scope) values ('cost_pools', 'business')
on conflict (table_name) do update set scope = excluded.scope;

-- Direct labor entered per batch (trim techs, extraction techs — roles
-- whose time is naturally tracked per batch), separate from cost_pools
-- above which covers indirect/management labor and other overhead that
-- isn't tracked per batch. Same jsonb-array-of-line-items shape as the
-- existing (UI-less until now) manual_materials column.
alter table public.cogs_records
  add column if not exists labor_lines jsonb not null default '[]'::jsonb;

-- Lets a cultivation_costs entry (media/nutrients/IPM/other for a grow
-- space) allocate across the batches that drew from it automatically,
-- instead of requiring a manually-typed cogs_records.cult_cost figure.
alter table public.cultivation_costs
  add column if not exists allocation_basis text not null default 'batch_weight'
    check (allocation_basis in ('batch_weight', 'time_occupied'));

alter table public.facilities
  add column if not exists default_cultivation_allocation_basis text not null default 'batch_weight'
    check (default_cultivation_allocation_basis in ('batch_weight', 'time_occupied')),
  add column if not exists qb_account_map jsonb not null default '{}'::jsonb;

commit;
