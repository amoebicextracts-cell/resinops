-- Gram-level mass-balance reconciliation for extraction batches, scoped
-- against Top Secret Workshops' TSW KPI Cost Tracker (topsecretcertified.com):
-- their whole pitch is "every gram from intake accounted for, reconciled
-- to zero." ResinOps already tracks most of the pieces needed for this --
-- production_batches.input_amt (intake), dewaxPasses/purgeRuns pre/post
-- weigh-in pairs (real recorded loss), and isLinked HTE/Heads-Tails
-- co-product batches -- but actual_yield is free text ("1,180 units /
-- 32.4g"), not a summable number, and there's no catch-all bucket for a
-- loss that isn't already captured by a dewax/purge pass (e.g. transfer
-- loss, residual solvent loss right after the extraction run itself).
--
-- Two additive columns, following the same jsonb-array-on-the-batch-row
-- convention already used for wash_events/freeze_dry_cycles/purge_runs/
-- dewax_passes -- no new table, no new RLS: this rides on
-- production_batches' existing facility-isolation policies and audit
-- trigger unchanged.
--
-- actual_yield_g is deliberately separate from the existing actual_yield
-- text field rather than replacing it -- every other production category
-- (edibles, vapes, pre-rolls) still wants the free-text field's
-- flexibility ("1,180 units"), and this is scoped to extraction batches
-- only (see src/lib/reconciliation.js's RECONCILABLE_SUBS).
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.production_batches
  add column if not exists actual_yield_g numeric,
  add column if not exists loss_entries jsonb not null default '[]'::jsonb;

commit;
