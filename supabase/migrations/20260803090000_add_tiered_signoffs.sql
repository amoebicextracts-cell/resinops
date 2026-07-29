-- Tiered GMP step sign-offs: worker -> supervisor -> manager -> QC/
-- Production head, configurable per facility (which tiers a given step
-- requires, and whether missing sign-offs actually block anything or
-- are tracked-only). Employees.role/department already serve as the
-- free-text job title -- this adds a controlled `tier` alongside those
-- specifically for sign-off requirement matching, since free text can't
-- reliably be checked against ("is this person a supervisor?").
--
-- gmp_signoffs gets new per-tier columns rather than replacing
-- performed_by_id/verified_by_id, so any existing rows (and the old
-- 2-tier shape) keep working -- the new UI just stops writing to the
-- old columns going forward.

begin;

alter table public.employees
  add column if not exists tier text
  check (tier is null or tier in ('worker', 'supervisor', 'manager', 'qc_head'));

alter table public.gmp_signoffs
  add column if not exists worker_id uuid references public.employees(id) on delete set null,
  add column if not exists worker_at timestamptz,
  add column if not exists supervisor_id uuid references public.employees(id) on delete set null,
  add column if not exists supervisor_at timestamptz,
  add column if not exists manager_id uuid references public.employees(id) on delete set null,
  add column if not exists manager_at timestamptz,
  add column if not exists qc_head_id uuid references public.employees(id) on delete set null,
  add column if not exists qc_head_at timestamptz;

-- One in-progress sign-off record per batch+step -- the UI upserts into
-- this row as each tier signs off, rather than creating a new row per
-- approval.
create unique index if not exists idx_gmp_signoffs_batch_step
  on public.gmp_signoffs (batch_type, batch_id, step_name);

alter table public.facilities
  add column if not exists step_signoff_requirements jsonb not null default '{}'::jsonb,
  add column if not exists signoff_enforcement text not null default 'track_only'
  check (signoff_enforcement in ('track_only', 'hard_block'));

commit;
