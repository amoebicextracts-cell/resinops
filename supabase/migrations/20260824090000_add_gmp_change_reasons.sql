-- EU GMP Annex 11 §9 gap: audit_logs captures who/what/when via full
-- row snapshots, but nothing captures WHY -- auditors increasingly
-- expect a documented justification alongside reversals of previously
-- finalized GMP state, not just the fact that a change happened.
--
-- Adds a small append-only table for exactly those reasons, rather
-- than bolting a "reason" column onto audit_logs itself: that table is
-- populated automatically by a single generic trigger shared across
-- ~30 tenant tables with no per-action app input at all, and most of
-- those tables' routine edits have no meaningful "why" to ask for
-- (nobody needs to justify fixing a typo in a vendor's phone number).
-- Reasons are only required for the two specific reversal actions
-- closed here:
--   1. Un-signing a GMP Hub tier sign-off (unsignTier()) -- previously
--      a bare window.confirm() with no reason captured at all.
--   2. Reopening a closed deviation -- previously not even possible
--      through the UI, but closed deviations' substantive fields
--      (root cause, corrective action, etc.) could still be silently
--      re-saved with zero lock and zero trace beyond the generic
--      before/after snapshot -- the same class of gap already closed
--      on trim_entries (lock_approved_trim_entry) and gmp_signoffs
--      (identity binding). This migration adds the missing lock and a
--      real reopen-with-reason flow for deviations.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

create table if not exists public.gmp_change_reasons (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  reason text not null check (char_length(btrim(reason)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert on public.gmp_change_reasons to authenticated;

create index if not exists gmp_change_reasons_facility_id_idx
  on public.gmp_change_reasons (facility_id);
create index if not exists gmp_change_reasons_record_idx
  on public.gmp_change_reasons (table_name, record_id);

alter table public.gmp_change_reasons enable row level security;

insert into public.table_scopes (table_name, scope)
values ('gmp_change_reasons', 'compliance')
on conflict (table_name) do nothing;

create policy facility_isolation_select on public.gmp_change_reasons
  for select to authenticated using (private.can_view_facility(facility_id, 'gmp_change_reasons'));
create policy facility_isolation_insert on public.gmp_change_reasons
  for insert to authenticated with check (private.can_edit_facility(facility_id, 'gmp_change_reasons'));

-- Append-only by design -- no update or delete policy at all, matching
-- audit_logs' own tamper-evidence. created_by is always forced to the
-- caller's own identity, never trusted from the client payload, same
-- reasoning as every other identity-binding trigger added this pass.
create or replace function private.stamp_change_reason_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$function$;

revoke all on function private.stamp_change_reason_author() from public, anon, authenticated;

drop trigger if exists stamp_change_reason_author on public.gmp_change_reasons;
create trigger stamp_change_reason_author
before insert on public.gmp_change_reasons
for each row execute function private.stamp_change_reason_author();

-- Locks a closed deviation's substantive fields, mirroring
-- lock_approved_trim_entry's shape exactly: checked against old.status
-- alone (not "old and new both still closed"), so a single UPDATE that
-- flips status back to open while ALSO changing root_cause in the same
-- statement is still blocked -- reopening and editing must be two
-- separate, separately-audited steps.
create or replace function private.lock_closed_deviation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'closed' then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.severity is distinct from old.severity
      or new.deviation_type is distinct from old.deviation_type
      or new.root_cause is distinct from old.root_cause
      or new.corrective_action is distinct from old.corrective_action
      or new.preventive_action is distinct from old.preventive_action
      or new.step_name is distinct from old.step_name
      or new.batch_id is distinct from old.batch_id
      or new.batch_type is distinct from old.batch_type
    then
      raise exception 'Cannot edit a closed deviation''s fields in the same update that reopens it -- reopen it first (with a reason), then edit';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.lock_closed_deviation() from public, anon, authenticated;

drop trigger if exists lock_closed_deviation on public.gmp_deviations;
create trigger lock_closed_deviation
before update on public.gmp_deviations
for each row execute function private.lock_closed_deviation();

commit;
