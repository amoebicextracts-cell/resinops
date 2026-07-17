-- syncTransfers() in lib/metrc.js has always written metrc_transfer_id
-- when mapping an outgoing METRC transfer to a sales order, but
-- sales_orders never had a column for it — silently dropped, and with
-- nothing to dedupe against (same root cause as the syncRooms/syncStrains/
-- syncHarvests/syncPackages/syncEmployees fix), every sync run inserted a
-- fresh sales order for the same METRC transfer instead of updating it.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.sales_orders
  add column if not exists metrc_transfer_id text;

create index if not exists idx_sales_orders_metrc_transfer_id on public.sales_orders(facility_id, metrc_transfer_id) where metrc_transfer_id is not null;

commit;
