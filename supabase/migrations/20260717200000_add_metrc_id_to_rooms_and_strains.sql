-- syncRooms()/syncStrains() in lib/metrc.js normalize METRC's numeric
-- facility-scoped Id onto a metrc_id field, but grow_rooms/strains never
-- had a column for it — silently dropped by transformForDb(), and with
-- nothing to dedupe against, every sync run inserted a fresh row (a new
-- id, since none was ever supplied) instead of updating the room/strain
-- from the last run. harvest_batches/production_batches already have
-- metrc_tag for the same purpose; rooms and strains only expose METRC's
-- opaque numeric Id, not a human-readable tag, hence the different name.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.grow_rooms
  add column if not exists metrc_id text;

alter table public.strains
  add column if not exists metrc_id text;

create index if not exists idx_grow_rooms_metrc_id on public.grow_rooms(facility_id, metrc_id) where metrc_id is not null;
create index if not exists idx_strains_metrc_id on public.strains(facility_id, metrc_id) where metrc_id is not null;

commit;
