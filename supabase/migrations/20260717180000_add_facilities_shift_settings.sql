-- LaborManager.jsx's "Hours per shift" / "Shifts per day" inputs have
-- always been pure local React state (useState({shiftHours:"8",
-- shiftsPerDay:"1"}), no load effect, no save call anywhere) — edits never
-- persisted and never reached Finance.jsx or LaborDashboard.jsx, both of
-- which independently hardcode the same 8/1 defaults rather than sharing
-- a real value. facilities is the natural single source of truth for a
-- facility-wide setting like this (matches FacilitySettings.jsx's existing
-- model for owner/timezone/tag-system), so these columns live there.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.facilities
  add column if not exists shift_hours numeric not null default 8,
  add column if not exists shifts_per_day integer not null default 1;

commit;
