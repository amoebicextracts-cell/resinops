-- Identity binding: lets an employees row be linked to a real login
-- account, so actions that claim to be "done by employee X" can actually
-- be verified against who's logged in, rather than trusting a client-side
-- dropdown selection. Closes the gap flagged in review on trim_entries'
-- approval workflow: previously any editor-role member could attribute an
-- approval to any employee's name with nothing checking it was really them.
--
-- Two things this adds, both DB-enforced (not just hidden in the UI --
-- matches this app's own stated Team-management philosophy):
--   1. Only an admin-tier member can change who an employee is linked to.
--   2. Approving a trim entry now requires the caller to actually BE the
--      linked employee, not just pick a name from a dropdown.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.employees
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- One login account maps to at most one employee record per facility (not
-- globally unique -- the same person could in principle be a real employee
-- at more than one facility this app manages, each its own roster row).
create unique index if not exists employees_facility_user_unique
  on public.employees (facility_id, user_id) where user_id is not null;

-- employees is registered in table_scopes (people_labor, see the
-- section-scoping migration), so its real RLS resolves admin-ness through
-- the 2-arg private.can_admin_facility(facility, table_name) overload --
-- member_scope_role-aware, not the plain 1-arg version still used by
-- facilities/facility_members/profiles/audit_logs. Calling the wrong
-- overload here would let this trigger disagree with employees' own
-- update policy for anyone with a people_labor scope_roles override, so
-- it's called the same way employees' real RLS does.
create or replace function private.enforce_employee_user_link_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.user_id is distinct from old.user_id then
    if not private.can_admin_facility(new.facility_id, 'employees') then
      raise exception 'Only a facility admin/owner can change which login an employee is linked to';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_employee_user_link_admin_only() from public, anon, authenticated;

drop trigger if exists enforce_employee_user_link_admin_only on public.employees;
create trigger enforce_employee_user_link_admin_only
before update on public.employees
for each row execute function private.enforce_employee_user_link_admin_only();

-- Fires whenever a trim_entries row is becoming (or already is) approved
-- with an approver set -- editing other fields, or moving status back to
-- pending, isn't gated by this at all; only the act of approving is.
create or replace function private.enforce_trim_entry_approver_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'approved' and new.approved_by_employee_id is not null
    and (old.approved_by_employee_id is distinct from new.approved_by_employee_id or old.status is distinct from new.status)
  then
    if not exists (
      select 1 from public.employees
      where id = new.approved_by_employee_id
        and user_id = (select auth.uid())
    ) then
      raise exception 'You can only approve trim entries as your own linked employee record';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_trim_entry_approver_identity() from public, anon, authenticated;

drop trigger if exists enforce_trim_entry_approver_identity on public.trim_entries;
create trigger enforce_trim_entry_approver_identity
before update on public.trim_entries
for each row execute function private.enforce_trim_entry_approver_identity();

commit;
