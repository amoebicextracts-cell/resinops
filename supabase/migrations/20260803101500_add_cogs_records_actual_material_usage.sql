-- Captures actual materials used at extraction-batch close-out, entered
-- manually alongside the existing "actual units produced" field, for
-- variance display against the estimated BOM materialLines. Does not feed
-- cost math (materials cost still comes from the BOM/manual-override
-- path already in lib/cogs.js's calcMaterialCost) — this is reporting
-- only.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.cogs_records
  add column if not exists actual_material_usage jsonb;

comment on column public.cogs_records.actual_material_usage is 'Manually-entered actual quantities used per material at batch close-out, shape [{itemId, actualQty, note}] — variance display against the estimated BOM materialLines only, does not feed cost calculations.';

commit;
