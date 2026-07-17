-- HarvestBatches.jsx's bucking-machine and trim-method calculator settings
-- (buckMachine/buckThroughput, trimType/trimMachine/trimThroughput/
-- trimmerCount/gramsPerTrimmerDay) have no columns in harvest_batches —
-- same class of gap already deferred in ProductionScheduler.jsx's own
-- calculator inputs, but small enough here (7 fields, not ~30) to just
-- fix directly rather than defer again.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.harvest_batches
  add column if not exists buck_machine text,
  add column if not exists buck_throughput numeric,
  add column if not exists trim_type text,
  add column if not exists trim_machine text,
  add column if not exists trim_throughput numeric,
  add column if not exists trimmer_count integer,
  add column if not exists grams_per_trimmer_day numeric;

commit;
