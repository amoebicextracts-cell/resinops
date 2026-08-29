-- Item 5 of the TSW KPI Cost Tracker competitive-feature-adoption list:
-- a configurable max transfer-loss % that warns. Scoped as a single
-- facility-wide threshold, editable in Facility Settings alongside the
-- other production-wide defaults (default_cultivation_allocation_basis,
-- step_signoff_requirements) -- same additive-column convention, no new
-- table/RLS since this rides on facilities' existing policies.
--
-- Nullable, defaulting to unset (no cap configured, no warning shown) --
-- deliberately not a hard release gate: the reconciliation ledger this
-- checks against (see src/lib/reconciliation.js, PR #86) is explicitly
-- "informational only, doesn't block saving or release," and this
-- threshold is a warning on top of that same ledger, not a stricter
-- policy than the feature it's built on.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.facilities
  add column if not exists max_transfer_loss_pct numeric;

commit;
