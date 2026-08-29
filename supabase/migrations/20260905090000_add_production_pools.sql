-- Item 3 of the TSW KPI Cost Tracker competitive-feature-adoption list:
-- named production-pool sub-stages. TSW's real concept: one intake lot
-- fractionates into named intermediate WIP pools (Diamond Production,
-- LQD, HTE Refinement, Distillate) that sit between Harvest Batches and
-- Production Batches -- material can flow IN from more than one source
-- batch over time, and OUT into more than one downstream batch, with a
-- running weighted cost-per-gram basis carried along (the same
-- "aggregated cost-per-gram" idea from the still-unbuilt item 2 --
-- building a real pool necessarily needs at least this much of it, since
-- a pool fed by multiple batches at different costs is meaningless for
-- COGS purposes without a cost basis).
--
-- This is genuinely new architecture, confirmed via investigation before
-- writing this: ResinOps' existing isLinked/linkedTo co-product batches
-- (HTE/Heads-Tails auto-created from a Diamonds/THCa-isolate batch) are
-- a *fixed-percentage estimate baked in at the parent batch's creation
-- time*, not a real held balance -- and there is no existing concept of
-- WIP sitting unassigned to any batch at all. See src/lib/reconciliation.js
-- (PR #86) for the adjacent-but-different "everything already assigned to
-- THIS batch reconciles to zero" ledger, and src/ProductionScheduler.jsx's
-- gradeRemainingG (PR #87) for the adjacent-but-different "harvest weight
-- not yet drawn into any production batch" tracking -- neither is a
-- mid-pipeline pool between two production stages.
--
-- production_pools is deliberately just identity/naming -- no stored
-- balance or cost column. Balance and weighted-average cost-per-gram are
-- always derived client-side by replaying production_pool_transactions
-- in order (see src/lib/productionPools.js), matching this app's existing
-- convention of computing ledgers from raw stored facts rather than
-- maintaining a running total that could drift from its own source rows
-- (the same philosophy calcBatchReconciliation already uses).
--
-- production_pool_transactions is an append-only ledger by design: no
-- update policy is defined below, so a correction is delete + re-add,
-- not an edit -- the same reasoning as a real accounting ledger, and
-- simpler than guarding against an edit retroactively changing history
-- the way trim_entries' lock-approved-entry trigger has to.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.production_pools (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text,   -- optional product-category context, e.g. "extract" -- free text, not FK'd to any enum since pool naming is facility-specific
  subcategory text,
  status text not null default 'active' check (status in ('active','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_pool_transactions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  pool_id uuid not null references public.production_pools(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  type text not null check (type in ('deposit','withdrawal')),
  amount_g numeric not null check (amount_g > 0),
  -- Deposit: the cost/gram of the material being contributed (operator-
  -- entered). Withdrawal: the pool's weighted-average cost/gram *at the
  -- moment of withdrawal*, snapshotted here so the ledger stays fully
  -- replayable even if later deposits change the pool's live average --
  -- the withdrawing batch's actual input cost basis must never silently
  -- change after the fact.
  unit_cost_per_g numeric not null default 0,
  source_batch_id uuid references public.production_batches(id) on delete set null,
  destination_batch_id uuid references public.production_batches(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.production_pools to authenticated;
grant select, insert, update, delete on public.production_pool_transactions to authenticated;

create index if not exists production_pools_facility_id_idx on public.production_pools (facility_id);
create index if not exists production_pool_transactions_facility_id_idx on public.production_pool_transactions (facility_id);
create index if not exists production_pool_transactions_pool_id_idx on public.production_pool_transactions (pool_id);
create index if not exists production_pool_transactions_source_batch_id_idx on public.production_pool_transactions (source_batch_id);
create index if not exists production_pool_transactions_destination_batch_id_idx on public.production_pool_transactions (destination_batch_id);

drop trigger if exists set_updated_at on public.production_pools;
create trigger set_updated_at
before update on public.production_pools
for each row execute function public.handle_updated_at();

alter table public.production_pools enable row level security;
alter table public.production_pool_transactions enable row level security;

create policy facility_isolation_select on public.production_pools
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.production_pools
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.production_pools
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.production_pools
  for delete to authenticated using (private.can_admin_facility(facility_id));

create policy facility_isolation_select on public.production_pool_transactions
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.production_pool_transactions
  for insert to authenticated with check (private.can_edit_facility(facility_id));
-- No update policy -- append-only ledger, see comment above.
create policy facility_isolation_delete on public.production_pool_transactions
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.production_pools;
create trigger audit_facility_change
after insert or update or delete on public.production_pools
for each row execute function private.audit_facility_change();

drop trigger if exists audit_facility_change on public.production_pool_transactions;
create trigger audit_facility_change
after insert or update or delete on public.production_pool_transactions
for each row execute function private.audit_facility_change();

commit;
