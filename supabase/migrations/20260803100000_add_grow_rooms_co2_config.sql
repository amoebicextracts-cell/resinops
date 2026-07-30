-- CO2 enrichment is a real cultivation cost/consumable that GrowMap.jsx has
-- never had any fields for. Adds the room-level physical config needed to
-- estimate usage: room volume (via ceiling height, sqft already exists),
-- delivery method (tank/regulator vs combustion burner — these are
-- physically different and use different rate units), the method-specific
-- rate, default PPM target / enrichment hours, and an explicit link to
-- which inventory item the room's CO2 draws from (kept explicit rather
-- than name-matched, since cultivation-grade and extraction-grade CO2 are
-- tracked as separate inventory items).
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.grow_rooms
  add column if not exists ceiling_height_ft numeric,
  add column if not exists co2_method text check (co2_method in ('tank', 'burner')),
  add column if not exists co2_ppm_target integer,
  add column if not exists co2_hours_per_day numeric,
  add column if not exists co2_injection_rate_ach numeric,
  add column if not exists co2_burn_rate_cf numeric,
  add column if not exists co2_inventory_item_id uuid references public.inventory_items(id) on delete set null;

comment on column public.grow_rooms.ceiling_height_ft is 'Room ceiling height in feet — combined with sqft to get room volume for CO2 enrichment calculations.';
comment on column public.grow_rooms.co2_method is 'CO2 delivery method: tank/regulator (direct injection) or burner (combustion, produces CO2 as a byproduct of burning propane/nat. gas).';
comment on column public.grow_rooms.co2_ppm_target is 'Default CO2 enrichment target in ppm for cycles in this room (overridable per grow_spaces cycle).';
comment on column public.grow_rooms.co2_hours_per_day is 'Default hours/day CO2 enrichment runs in this room (overridable per grow_spaces cycle).';
comment on column public.grow_rooms.co2_injection_rate_ach is 'Tank/regulator method only: room-volumes/hour lost to air exchange while sealed & enriching, used to estimate continuous replenishment need.';
comment on column public.grow_rooms.co2_burn_rate_cf is 'Burner method only: rated CO2 output in ft3/hr per the burner''s manufacturer spec sheet.';
comment on column public.grow_rooms.co2_inventory_item_id is 'Which inventory_items row this room''s CO2 enrichment draws from — explicit link avoids fragile name-matching, and keeps cultivation-grade CO2 distinct from extraction-grade CO2.';

commit;
