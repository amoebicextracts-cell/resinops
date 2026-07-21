-- Adds a direct per-batch unit price to production_batches so pricing
-- shows at a glance on the batch itself, in addition to the existing
-- cogs_records.rev_per_unit overlay Finance's Cost & P&L page already
-- reads. Purely additive/nullable, same low-risk shape as prior
-- production_batches column additions.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.production_batches
  add column if not exists unit_price numeric;

commit;
