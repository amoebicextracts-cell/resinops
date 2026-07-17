-- pkg_size on production_batches has never been written to — the only
-- app-side "pkgSize" is a local parameter name inside ProductionScheduler.
-- jsx's calcPkgDays() calculator function, unrelated to any saved field
-- (flagged as a dead FIELD_OVERRIDES entry when pack_size, the real
-- pre-roll pack-count field, got its own column in the July 17 calculator
-- migration rather than being forced into this one). Dropping the column
-- and its dead override now that it's been confirmed to hold no live data.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.production_batches
  drop column if exists pkg_size;

commit;
