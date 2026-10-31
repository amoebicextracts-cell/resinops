-- production_batches.actual_yield is free text everywhere in the app (the
-- batch form's placeholder is "e.g. 1,180 units / 32.4g", and
-- 20260903090000_add_batch_reconciliation.sql describes it as text), but the
-- production column is numeric. Two consequences:
--   1. Any value with unit text fails to save ("invalid input syntax for
--      type numeric").
--   2. A bare number that did save comes back as a JS number, and the
--      Dashboard's .match() on it threw "c.match is not a function" for the
--      first real facility to record an actual yield.
-- Converting to text is lossless for existing values (1200 -> '1200') and
-- matches what every reader already expects. No view, policy, or function
-- references the column's type; the audit trigger copies whole rows as
-- jsonb and is type-agnostic.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

alter table public.production_batches
  alter column actual_yield type text using actual_yield::text;
