-- cultivation_costs' media/nutrients/ipm/other are all hand-entered flat
-- dollar figures. CO2 is different: it's primarily a *computed* estimate
-- (lib/co2.js, using grow_rooms/grow_spaces physical config), so co2_override
-- exists as an escape hatch that short-circuits to a hand-entered $ figure,
-- mirroring the existing cogs_records.cult_cost override precedent — not a
-- plain input column like the other four. co2_actual_lbs is a manual
-- actual-usage entry captured at harvest close-out, for variance display
-- against the estimate only; it doesn't feed cost math.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.cultivation_costs
  add column if not exists co2_override numeric,
  add column if not exists co2_actual_lbs numeric;

comment on column public.cultivation_costs.co2_override is 'Hand-entered $ that short-circuits the computed CO2 cost line for this grow space, same precedent as cogs_records.cult_cost.';
comment on column public.cultivation_costs.co2_actual_lbs is 'Actual CO2 usage in lbs, entered manually at harvest close-out for variance display against the estimate — does not feed cost calculations.';

commit;
