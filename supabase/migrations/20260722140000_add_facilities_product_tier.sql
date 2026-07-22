-- Adds a product tier (home vs. commercial) and a sparse per-module
-- visibility override to facilities, so the sidebar can show a lighter
-- module set for a future non-commercial "home" product while still
-- letting any facility flip individual modules on/off for declutter.
--
-- module_overrides only stores entries that differ from the tier
-- default ({moduleId: boolean}), so modules added later automatically
-- fall back to their tier's default instead of needing a backfill.
--
-- Note: this is a visibility/declutter toggle, not a paywall — nothing
-- here enforces payment or entitlement. Real pay-per-module gating
-- would need a separate server-side entitlements system later.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.facilities
  add column if not exists product_tier text not null default 'commercial' check (product_tier in ('home','commercial')),
  add column if not exists module_overrides jsonb not null default '{}'::jsonb;

commit;
