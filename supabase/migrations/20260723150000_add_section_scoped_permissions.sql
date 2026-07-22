-- Adds section-level (Cultivation / Processing / Compliance / People & Labor /
-- Business / Facility) permission scoping on top of the existing 5-tier
-- facility role, so an owner/admin can grant a member access to some sections
-- of the app's data but not others. This is a real RLS boundary, not a UI-only
-- gate — mirrors the shape of `facilities.module_overrides` (sparse override
-- over a coarser default) added earlier for the Home/Commercial tier system.
--
-- `facility_members.role` remains the facility-wide default and the
-- owner/admin "sees and edits everything regardless of scope" escape hatch.
-- `facility_members.scope_roles` is a sparse {scope: role} map; a scope
-- missing from the map falls back to the member's global `role`.
--
-- The `facilities` / `facility_members` / `audit_logs` tables keep their
-- existing facility-wide (non-scoped) policies untouched — only the 39
-- business/data tables get the new scope-aware policies. `profiles` gets one
-- narrow addition (below) so a Team management screen can show co-members'
-- names/emails, which the existing self-only policy didn't allow.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.facility_members
  add column if not exists scope_roles jsonb not null default '{}'::jsonb;

create table if not exists public.table_scopes (
  table_name text primary key,
  scope text not null check (scope in (
    'cultivation', 'processing', 'compliance', 'people_labor', 'business', 'facility'
  ))
);

alter table public.table_scopes enable row level security;
revoke all on public.table_scopes from anon, authenticated;
grant select on public.table_scopes to authenticated;

create policy table_scopes_select_authenticated
on public.table_scopes for select
to authenticated
using (true);

insert into public.table_scopes (table_name, scope) values
  ('grow_rooms', 'cultivation'), ('grow_spaces', 'cultivation'),
  ('clone_schedules', 'cultivation'), ('mother_plants', 'cultivation'),
  ('harvest_batches', 'cultivation'), ('strains', 'cultivation'),
  ('pheno_hunts', 'cultivation'), ('tc_accessions', 'cultivation'),
  ('tc_vessels', 'cultivation'), ('tc_formulas', 'cultivation'),
  ('ipm_log', 'cultivation'), ('cultivation_inputs', 'cultivation'),
  ('production_batches', 'processing'), ('boms', 'processing'),
  ('qc_tests', 'compliance'), ('gmp_sops', 'compliance'),
  ('gmp_deviations', 'compliance'), ('gmp_shifts', 'compliance'),
  ('gmp_signoffs', 'compliance'), ('spray_log', 'compliance'),
  ('remediation', 'compliance'), ('metrc_transfer_manifests', 'compliance'),
  ('employees', 'people_labor'), ('labor_types', 'people_labor'),
  ('inventory_items', 'business'), ('vendors', 'business'),
  ('purchase_orders', 'business'), ('sales_orders', 'business'),
  ('customers', 'business'), ('sales_goals', 'business'),
  ('skus', 'business'), ('cogs_records', 'business'),
  ('cultivation_costs', 'business'),
  ('equipment', 'facility'), ('equipment_service_log', 'facility'),
  ('work_orders', 'facility'), ('loto_log', 'facility'),
  ('facility_map_spaces', 'facility'),
  ('import_history', 'business')
on conflict (table_name) do update set scope = excluded.scope;

-- Resolves the caller's effective role within a table's scope: an explicit
-- scope_roles entry wins, otherwise the member's global role applies.
create or replace function private.member_scope_role(facility uuid, tbl text)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  -- owner/admin bypass scoping entirely, even if a scope_roles entry
  -- somehow says otherwise (defensive — only an owner/admin can set
  -- scope_roles in the first place, but this keeps the bypass airtight).
  select case
    when private.facility_role(facility) in ('owner', 'admin') then private.facility_role(facility)
    else coalesce(
      (
        select member.scope_roles ->> scoped.scope
        from public.facility_members as member
        join public.table_scopes as scoped on scoped.table_name = tbl
        where member.facility_id = facility
          and member.user_id = (select auth.uid())
          and member.accepted_at is not null
        limit 1
      ),
      private.facility_role(facility)
    )
  end
$function$;

-- 'none' is a valid scope_roles override value (unlike the global `role`
-- column, which can never be 'none' — a member always has some baseline
-- facility role) meaning "explicitly no access to this scope," overriding
-- the global role fallback. Every other check below already uses an
-- explicit allow-list, so 'none' naturally falls through to false there;
-- this one needs the same explicit list instead of "is not null", since
-- 'none' is a non-null string.
create or replace function private.can_view_facility(facility uuid, tbl text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.member_scope_role(facility, tbl) in ('owner', 'admin', 'manager', 'member', 'viewer')
$function$;

create or replace function private.can_edit_facility(facility uuid, tbl text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.member_scope_role(facility, tbl) in ('owner', 'admin', 'manager', 'member')
$function$;

create or replace function private.can_admin_facility(facility uuid, tbl text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.member_scope_role(facility, tbl) in ('owner', 'admin')
$function$;

revoke all on function private.member_scope_role(uuid, text) from public, anon;
revoke all on function private.can_view_facility(uuid, text) from public, anon;
revoke all on function private.can_edit_facility(uuid, text) from public, anon;
revoke all on function private.can_admin_facility(uuid, text) from public, anon;
grant execute on function private.member_scope_role(uuid, text) to authenticated;
grant execute on function private.can_view_facility(uuid, text) to authenticated;
grant execute on function private.can_edit_facility(uuid, text) to authenticated;
grant execute on function private.can_admin_facility(uuid, text) to authenticated;

-- A newly invited user needs to flip their own pending row's accepted_at,
-- but the existing facility_members update policy only allows owners/admins
-- to update rows — an invitee isn't a member yet, so isn't covered by it.
-- A blanket "users can update their own row" policy would let a member
-- rewrite their own role/scope_roles (privilege escalation), so this is
-- deliberately a narrow security-definer function that only ever flips
-- accepted_at from null to now() on the caller's own row(s), nothing else.
-- No facility parameter: it accepts every pending invite addressed to the
-- caller's own identity, which is what the accept-invite screen needs
-- without having to thread a facility id through the email link's redirect.
-- Lives in `public` (unlike the `private.*` RLS-internal helpers above)
-- because it's the client's RPC entry point — PostgREST only exposes
-- functions in `public` for `supabase.rpc()` calls.
create or replace function public.accept_facility_invite()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.facility_members
  set accepted_at = now()
  where user_id = (select auth.uid())
    and accepted_at is null;
end
$function$;

revoke all on function public.accept_facility_invite() from public, anon;
grant execute on function public.accept_facility_invite() to authenticated;

-- A Team management screen needs to show co-members' names/emails, but the
-- existing profiles_select_self policy only lets a user see their own row.
-- Add a narrow, additive policy (RLS policies are OR'd together, so this
-- only ever widens access, never narrows profiles_select_self) permitting a
-- user to see another user's profile if they share at least one accepted
-- facility membership.
create or replace function private.shares_facility_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  -- Only the caller needs to be an accepted member — the target can be a
  -- still-pending invitee, so an admin can see a pending invite's name/email
  -- in a Team list before it's accepted.
  select exists (
    select 1
    from public.facility_members as mine
    join public.facility_members as theirs
      on theirs.facility_id = mine.facility_id
    where mine.user_id = (select auth.uid())
      and mine.accepted_at is not null
      and theirs.user_id = target_user
  )
$function$;

revoke all on function private.shares_facility_with(uuid) from public, anon;
grant execute on function private.shares_facility_with(uuid) to authenticated;

create policy profiles_select_facility_co_member
on public.profiles for select
to authenticated
using (private.shares_facility_with(id));

-- Replace the four generic facility-isolation policies on every business
-- table with scope-aware equivalents. The 1-arg private.can_edit_facility /
-- private.can_admin_facility overloads (still used by facilities /
-- facility_members / profiles / audit_logs) are untouched.
do $rescope_policies$
declare
  table_name text;
begin
  foreach table_name in array (select array_agg(t.table_name) from public.table_scopes as t)
  loop
    execute format('drop policy if exists facility_isolation_select on public.%I', table_name);
    execute format('drop policy if exists facility_isolation_insert on public.%I', table_name);
    execute format('drop policy if exists facility_isolation_update on public.%I', table_name);
    execute format('drop policy if exists facility_isolation_delete on public.%I', table_name);

    execute format(
      'create policy facility_isolation_select on public.%I for select to authenticated using (private.can_view_facility(facility_id, %L))',
      table_name, table_name
    );
    execute format(
      'create policy facility_isolation_insert on public.%I for insert to authenticated with check (private.can_edit_facility(facility_id, %L))',
      table_name, table_name
    );
    execute format(
      'create policy facility_isolation_update on public.%I for update to authenticated using (private.can_edit_facility(facility_id, %L)) with check (private.can_edit_facility(facility_id, %L))',
      table_name, table_name, table_name
    );
    execute format(
      'create policy facility_isolation_delete on public.%I for delete to authenticated using (private.can_admin_facility(facility_id, %L))',
      table_name, table_name
    );
  end loop;
end
$rescope_policies$;

commit;
