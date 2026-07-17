-- GrowMap.jsx's room form has always had a "Last harvest date" field,
-- used to compute the cleaning-room countdown (isCleaningReady() checks
-- space.lastHarvestDate + resetDays against today) — but grow_rooms never
-- had a column for it, so the value was silently stripped by
-- transformForDb on every save and the countdown never worked for any
-- room actually saved through Supabase.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.grow_rooms
  add column if not exists last_harvest_date date;

commit;
