-- ============================================================
-- ResinOps — Backfill preloaded how-to SOPs into existing facilities
-- supabase/migrations/20260730100500_backfill_sop_defaults_existing_facilities.sql
--
-- seed_default_sops only fires on facility creation, so facilities
-- that already existed before the sop_defaults catalog was populated
-- need a one-time catch-up. Idempotent (NOT EXISTS guard on
-- facility_id + title + source) - safe to leave in migration history
-- and safe to re-run manually after adding future content batches.
-- ============================================================

begin;

insert into public.gmp_sops (facility_id, title, category, version, content, linked_step_types, status, source)
select f.id, d.title, d.category, d.version, d.content, d.linked_step_types, 'active', 'resinops-default'
from public.facilities f
cross join public.sop_defaults d
where not exists (
  select 1 from public.gmp_sops g
  where g.facility_id = f.id and g.title = d.title and g.source = 'resinops-default'
);

commit;
