-- ResinEx foundation, phase 1: physical dimensions on the Equipment
-- Registry so a future 3D facility/equipment-placement view has real
-- width/depth/height/weight to place real (and planned) assets.
-- footprint_sqft is a generated column (derived from width/depth) so it
-- can never drift out of sync. Because it's generated, it must NOT be
-- added to dbTransforms.js SCHEMAS.equipment -- Postgres rejects any
-- explicit value for a generated column on insert/update, and this app's
-- upsert always sends whatever keys survive transformForDb. Keeping it
-- out of SCHEMAS guarantees it's dropped from every write while still
-- reading back fine (db.js always selects '*').
--
-- Real-owned vs. planned-for-expansion equipment: equipment.status
-- already supports "planned" (plain text, no check constraint) and
-- Equipment.jsx already renders it as "Planned -- future purchase" --
-- reused as-is, no new column this phase.

alter table public.equipment
  add column if not exists width_in numeric,
  add column if not exists depth_in numeric,
  add column if not exists height_in numeric,
  add column if not exists weight_lbs numeric,
  add column if not exists footprint_sqft numeric
    generated always as (round((width_in * depth_in) / 144.0, 2)) stored;

comment on column public.equipment.width_in is 'Physical footprint width, inches. Feeds the future ResinEx 3D equipment-placement view.';
comment on column public.equipment.depth_in is 'Physical footprint depth, inches.';
comment on column public.equipment.height_in is 'Physical height, inches (clearance planning).';
comment on column public.equipment.weight_lbs is 'Equipment weight, lbs (floor load / rigging planning).';
comment on column public.equipment.footprint_sqft is 'Derived floor footprint in sqft = width_in * depth_in / 144. Read-only (generated column) -- never send this field in an upsert payload.';
