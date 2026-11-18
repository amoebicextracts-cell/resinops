-- House-format batch records and the vape formulation calculator.
--
-- production_batches.batch_formulation holds everything the vape
-- formulation panel in the Production Scheduler captures and the GMP Hub
-- batch record prints as pre-filled targets: distillate drum / COA /
-- potency and its source, terpene % or target THC, terpene components,
-- label fill, overfill, fill tolerance, lab/retain units, hold-up loss,
-- heat / mix / fill temperatures, and the METRC production batch numbers
-- (finished + bulk). One jsonb column instead of a dozen scalar ones so
-- later product types (infused pre-rolls, edibles) can add fields without
-- another migration. Nullable: batches without a formulation keep working
-- and their batch record prints blanks for the formulation fields.
alter table public.production_batches
  add column if not exists batch_formulation jsonb;
