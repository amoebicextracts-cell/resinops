-- Lets Batch COGS materials lock in at the moment of real inventory
-- deduction instead of always live-matching whatever BOM currently
-- resolves for a batch's category/subcategory. Reuses the existing
-- override_materials/manual_materials columns as the actual lock
-- mechanism (already wired into calcMaterialCost); this column is
-- display/audit metadata only, so the UI can show when and why a
-- batch's materials stopped tracking live recipe edits.

alter table public.cogs_records add column if not exists materials_locked_at timestamptz;

comment on column public.cogs_records.materials_locked_at is 'Set when materials were locked in from a real inventory deduction (see override_materials/manual_materials) rather than a live BOM re-match. Null = still live-matching the current recipe.';
