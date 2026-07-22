-- Adds a topping-event log to grow_spaces, mirroring the existing
-- mother_plants.cut_log jsonb-array-of-events pattern: each entry is
-- {id, date, node, strainName}, appended to over the life of the grow
-- cycle rather than replaced.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.grow_spaces
  add column if not exists topping_log jsonb not null default '[]'::jsonb;

commit;
