-- StrainDatabase.jsx has always had a Status dropdown (Active/Retired/In
-- Testing) and links strains promoted from a winning pheno hunt back to
-- their originating hunt (linkedPhenoHuntId) — neither ever had a column,
-- so both were silently dropped on every save. A strain marked "Retired"
-- reverts to Active on reload; the pheno-hunt link never survives either.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.strains
  add column if not exists status text not null default 'active',
  add column if not exists linked_pheno_hunt_id uuid references public.pheno_hunts(id) on delete set null;

commit;
