-- FacilityMap.jsx was never wired to any table — it read/wrote a flat,
-- facility-unscoped localStorage key and even crashed on every render
-- (referenced an undeclared `loading` state variable). The existing
-- facility_map_spaces table also doesn't fit the component's real data
-- shape: it only has current_batch_id (singular) where the UI needs a
-- multi-batch assignment list, and no column at all for the cleaning
-- event history (date/type/performed-by/notes per event) the UI logs.
-- This adds the two missing columns; the component fix (separate commit)
-- wires it to db.facility_map_spaces properly.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.facility_map_spaces
  add column if not exists clean_log jsonb not null default '[]'::jsonb,
  add column if not exists assigned_batch_ids uuid[] not null default '{}'::uuid[];

commit;
