-- FacilitySettings.jsx has always collected Owner Name/Email/Phone and the
-- METRC/Biotrack tag-system selector, but facilities never had columns for
-- any of them — every edit to those fields was silently discarded by
-- save()'s update() payload (which only sent the fields that DID have
-- columns) and, since there was nothing to read back, they always reset to
-- blank/default on next load too. dba_name already existed as a column but
-- was missing from the save payload the same way (read correctly on load,
-- dropped on save) — no migration needed for that one, just a component fix.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.facilities
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists owner_phone text,
  add column if not exists tag_system text not null default 'METRC';

commit;
