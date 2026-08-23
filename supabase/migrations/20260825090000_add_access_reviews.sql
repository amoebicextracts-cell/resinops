-- EU GMP Annex 11 §12 gap: the app already supports fine-grained,
-- section-scoped access control (facility_members.role + scope_roles),
-- but nothing enforces or even records that anyone ever periodically
-- re-examines who has that access and whether it's still appropriate.
-- Annex 11 auditors check for evidence of a recurring access review,
-- not just that RBAC exists.
--
-- access_reviews is an append-only attestation log: one row per member
-- reviewed, grouped by review_batch_id so a single review session
-- (an owner/admin working through the current team list) produces one
-- batch of rows with the same timestamp-ish grouping key. Not
-- registered in table_scopes -- like facility_members and profiles
-- themselves, reviewing who has access is a facility-admin action, not
-- something any per-section scope_roles override should be able to
-- grant, so this uses the same plain 1-arg can_admin_facility()
-- facility_members already uses rather than the 2-arg scoped overload.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

create table if not exists public.access_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  review_batch_id uuid not null,
  member_user_id uuid not null,
  member_role text not null,
  member_scope_roles jsonb not null default '{}'::jsonb,
  decision text not null check (decision in ('confirmed', 'revoke_recommended')),
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now()
);

grant select, insert on public.access_reviews to authenticated;

create index if not exists access_reviews_facility_id_idx
  on public.access_reviews (facility_id);
create index if not exists access_reviews_batch_idx
  on public.access_reviews (review_batch_id);

alter table public.access_reviews enable row level security;

create policy facility_isolation_select on public.access_reviews
  for select to authenticated using (private.can_admin_facility(facility_id));
create policy facility_isolation_insert on public.access_reviews
  for insert to authenticated with check (private.can_admin_facility(facility_id));

-- Append-only by design -- no update or delete policy at all, matching
-- audit_logs and gmp_change_reasons' own tamper-evidence. reviewed_by
-- is always forced to the caller's own identity, never trusted from
-- the client payload, same reasoning as every other identity-binding
-- trigger added this pass -- an access review is only meaningful
-- evidence if it's provably who it says it is.
create or replace function private.stamp_access_review_reviewer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.reviewed_by := (select auth.uid());
  return new;
end;
$function$;

revoke all on function private.stamp_access_review_reviewer() from public, anon, authenticated;

drop trigger if exists stamp_access_review_reviewer on public.access_reviews;
create trigger stamp_access_review_reviewer
before insert on public.access_reviews
for each row execute function private.stamp_access_review_reviewer();

commit;
