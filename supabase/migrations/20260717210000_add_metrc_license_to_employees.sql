-- syncEmployees() in lib/metrc.js pulls METRC's per-employee facility
-- registration (License.Number / License.ExpirationDate) — this is a
-- general METRC agent/employee credential, not a pesticide applicator
-- certification, so it does not belong in the existing pest_license_num/
-- pest_license_expiry columns (those are populated by Employees.jsx and
-- read by CultivationInputs.jsx specifically for spray-log applicator
-- matching; conflating the two would silently corrupt that data). Gets
-- its own columns instead.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.employees
  add column if not exists metrc_license_number text,
  add column if not exists metrc_license_expiry date;

commit;
