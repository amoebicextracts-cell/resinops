-- Fixes a pre-existing CI-only failure discovered while validating an
-- unrelated PR: the CI disposable fixture (supabase/ci/production_schema.sql)
-- creates gmp_sops generically as just (id, facility_id, name) — real
-- production's gmp_sops already has title/category/version/content/
-- linked_step_types/status (it predates the migrations history, same as
-- grow_rooms/grow_spaces). The immediately-preceding migration
-- (20260730090000)'s seed_default_sops() trigger inserts into all of
-- those columns, which works fine against real production but fails
-- against the CI fixture the moment anything downstream tries to write a
-- gmp_sops row referencing them (20260730100500's backfill).
--
-- `add column if not exists` is a safe no-op against real production
-- (the columns already exist there) and patches the CI fixture to match
-- — same guard convention 20260730090000 already used for gmp_sops.source.
-- Deliberately timestamped right after 20260730090000 (not appended at
-- the end of the migration list) so it runs before anything that needs
-- it during a full fresh replay; this ordering has no effect on a real
-- project (adding already-existing columns is a no-op regardless of
-- when it runs relative to other applied migrations).
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.gmp_sops
  add column if not exists title text,
  add column if not exists category text,
  add column if not exists version text,
  add column if not exists content text,
  add column if not exists linked_step_types text,
  add column if not exists status text;

commit;
