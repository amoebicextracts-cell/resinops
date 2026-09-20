-- ResinEx 3D: optional shape override on the Equipment Registry.
-- The 3D view draws each piece of equipment as a procedural shape (tank,
-- rack, bench, ...). By default the shape is guessed from the equipment's
-- name and category (src/resinex/equipmentShapes.js); this column lets a
-- user pin a specific shape when the guess is wrong. NULL means "guess",
-- which is the state of every existing row, so nothing changes for
-- equipment that already exists.
--
-- Keep the allowed values in sync with SHAPE_TYPES in
-- src/resinex/equipmentShapes.js.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first, and apply it BEFORE deploying
-- the app change that adds the "3D shape" dropdown to the Equipment form.
-- Until this column exists, saving an equipment row with a shape chosen
-- fails (rows saved without touching the dropdown are unaffected).

begin;

alter table public.equipment
  add column if not exists shape_type text
    constraint equipment_shape_type_check
    check (shape_type is null or shape_type in ('box', 'tank', 'rack', 'bench', 'overhead', 'line'));

comment on column public.equipment.shape_type is 'Optional ResinEx 3D shape override: box, tank, rack, bench, overhead or line. NULL = guess from name/category.';

commit;
