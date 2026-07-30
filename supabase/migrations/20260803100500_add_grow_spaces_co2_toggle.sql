-- Per-cycle CO2 enrichment toggle, sitting alongside the room-level config
-- added in 20260803100000_add_grow_rooms_co2_config.sql. A cycle can
-- enable/disable enrichment and optionally override the room's default
-- PPM target / hours-per-day; co2_days_enriched lets the grower correct
-- how many days enrichment actually ran (defaults to flowerWeeks*7 in the
-- app when left null, since CO2 enrichment conventionally runs through
-- flower only).
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.grow_spaces
  add column if not exists co2_enrichment_enabled boolean not null default false,
  add column if not exists co2_ppm_target_override integer,
  add column if not exists co2_hours_per_day_override numeric,
  add column if not exists co2_days_enriched integer;

comment on column public.grow_spaces.co2_enrichment_enabled is 'Whether CO2 enrichment is toggled on for this specific grow cycle.';
comment on column public.grow_spaces.co2_ppm_target_override is 'Optional per-cycle override of the room''s default co2_ppm_target.';
comment on column public.grow_spaces.co2_hours_per_day_override is 'Optional per-cycle override of the room''s default co2_hours_per_day.';
comment on column public.grow_spaces.co2_days_enriched is 'Days CO2 enrichment actually ran for this cycle. Null falls back to flower_weeks*7 in the app (flower-only default).';

commit;
