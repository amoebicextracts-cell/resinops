-- Finance.jsx's SKU Pricing tab has always let users set a sales channel
-- (retail/wholesale/direct) per SKU, but skus has no channel column and
-- dbTransforms.js has no override for it — the field was silently stripped
-- by transformForDb on every save, never persisted, never restored on load.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.skus
  add column if not exists channel text not null default 'retail'
    check (channel in ('retail', 'wholesale', 'direct'));

commit;
