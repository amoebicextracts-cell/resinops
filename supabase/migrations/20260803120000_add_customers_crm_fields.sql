-- Twenty-CRM-inspired customer management upgrade: a real timestamped
-- activity log (replacing reliance on the single flat notes box for
-- interaction history), a follow-up/reminder date, and a deal-value field
-- for the new kanban pipeline board. Additive only -- the existing notes
-- column is untouched, and activity_log defaults to an empty array so no
-- backfill is needed for existing customers.

alter table public.customers
  add column if not exists activity_log jsonb not null default '[]'::jsonb,
  add column if not exists follow_up_date date,
  add column if not exists follow_up_note text,
  add column if not exists deal_value numeric;
