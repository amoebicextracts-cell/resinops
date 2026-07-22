-- Equipment depreciation fields + equipment-linked cost pools.
-- Ties the "Equipment Depreciation" cost pool to real asset records instead
-- of a hand-typed monthly figure, and lets a pool project a monthly
-- straight-line depreciation amount from purchase_price/salvage_value/
-- useful_life_months. equipment.status is plain text with no check
-- constraint (confirmed against the live schema), so "planned" (a future
-- purchase not yet owned) is just another allowed string value — no
-- constraint changes needed.

alter table public.equipment
  add column if not exists useful_life_months numeric,
  add column if not exists salvage_value numeric not null default 0,
  add column if not exists depreciation_method text not null default 'straight_line'
    check (depreciation_method in ('straight_line'));

alter table public.cost_pools
  add column if not exists linked_to_equipment boolean not null default false;

comment on column public.equipment.useful_life_months is 'Straight-line depreciation life in months. Null = not depreciated (e.g. still fully under warranty/no cost basis entered).';
comment on column public.equipment.salvage_value is 'Estimated residual value at end of useful life, subtracted from purchase_price before depreciating.';
comment on column public.cost_pools.linked_to_equipment is 'When true, this pool''s period amount is computed from the Equipment Registry (sum of active equipment''s monthly straight-line depreciation) instead of the manually entered period_amount.';
