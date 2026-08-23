-- EU GMP Annex 11 §11 gap: "Computerised systems should be periodically
-- evaluated to confirm that they remain in a valid state and are
-- compliant with GMP." Access reviews (see access_reviews /
-- 20260825090000) cover WHO has access; this covers whether the
-- SYSTEM ITSELF -- ResinOps as a whole, for this facility -- is still
-- fit for GMP purpose: functionality, deviation history, upgrade
-- awareness, performance/reliability, security, and validation status
-- (backup verification, access review currency).
--
-- Same shape and reasoning as access_reviews: a single append-only row
-- per completed evaluation, admin-only, no update/delete, identity of
-- the completer forced server-side. Not registered in table_scopes for
-- the same reason access_reviews isn't -- this is a facility-admin
-- action, not something a per-section scope_roles override should
-- grant.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

create table if not exists public.system_evaluations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  responses jsonb not null default '{}'::jsonb,
  notes text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now()
);

grant select, insert on public.system_evaluations to authenticated;

create index if not exists system_evaluations_facility_id_idx
  on public.system_evaluations (facility_id);

alter table public.system_evaluations enable row level security;

create policy facility_isolation_select on public.system_evaluations
  for select to authenticated using (private.can_admin_facility(facility_id));
create policy facility_isolation_insert on public.system_evaluations
  for insert to authenticated with check (private.can_admin_facility(facility_id));

-- Append-only by design -- no update or delete policy at all, matching
-- access_reviews and gmp_change_reasons. completed_by is always forced
-- to the caller's own identity, never trusted from the client payload.
create or replace function private.stamp_system_evaluation_completer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.completed_by := (select auth.uid());
  return new;
end;
$function$;

revoke all on function private.stamp_system_evaluation_completer() from public, anon, authenticated;

drop trigger if exists stamp_system_evaluation_completer on public.system_evaluations;
create trigger stamp_system_evaluation_completer
before insert on public.system_evaluations
for each row execute function private.stamp_system_evaluation_completer();

commit;
