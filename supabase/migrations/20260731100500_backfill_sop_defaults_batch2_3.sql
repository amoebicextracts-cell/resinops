-- ============================================================
-- ResinOps — Backfill batch 2+3 how-to SOPs into existing facilities
-- supabase/migrations/20260731100500_backfill_sop_defaults_batch2_3.sql
--
-- Same idempotent pattern as 20260730100500 - safe to leave in
-- migration history and re-run after any future content batch.
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
