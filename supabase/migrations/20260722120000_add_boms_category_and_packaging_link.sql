-- Two small additive changes needed for real inventory recipes:
--
-- 1. boms is keyed by sku_id in the real schema, but the app's only
--    working BOM data (Finance.jsx's DEFAULT_BOMS fallback array) is
--    actually keyed by "category|subcategory" matching a production
--    batch's cat/sub — not a SKU. Add category/subcategory columns
--    rather than redesigning SKU-recipe linkage in this pass.
-- 2. production_batches gets a packaging_item_id so the Packaging &
--    Container picker in Production Scheduler can reference a real
--    inventory item (and therefore its Certificate of Conformity)
--    instead of being a purely cosmetic label.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.boms
  add column if not exists category text,
  add column if not exists subcategory text;

alter table public.production_batches
  add column if not exists packaging_item_id uuid references public.inventory_items(id) on delete set null;

commit;
