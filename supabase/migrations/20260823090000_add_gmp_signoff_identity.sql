-- EU GMP Annex 11 §14 gap: gmp_signoffs' worker/supervisor/manager/
-- qc_head tier sign-offs (GMPHub.jsx's signOffTier()) are a plain
-- employee-picker dropdown today -- nothing checks that the logged-in
-- caller actually IS the employee being credited with the sign-off, so
-- any compliance-scope editor could attribute a sign-off to anyone.
-- Even the qc_head "Sign & Release" flow, which already wraps a real
-- password-reverified e-signature (signature_records) around freezing
-- the batch record PDF, still writes whatever qc_head_id was picked
-- from the same free dropdown -- the two could disagree.
--
-- This generalizes the identity-binding pattern already proven on
-- trim_entries (20260822090000_add_employee_login_binding.sql) to all
-- four tier columns on gmp_signoffs. It does NOT touch gmp_deviations'
-- reported_by_id/closed_by_id or gmp_shifts.supervisor -- those are
-- descriptive "who did this" fields filled out on a form (often after
-- the fact, sometimes by someone other than the named person, e.g. an
-- admin logging a historical record), not a live "I am signing this
-- right now" action the way a tier sign-off or a trim-entry approval
-- is. Binding those to auth.uid() would break legitimate data entry,
-- not close a real gap.
--
-- Coupled to a client-side fix in the same change: signOffTier() now
-- calls db.gmp_signoffs.update(existing.id, patch) for a tier signing
-- onto an ALREADY-EXISTING row, instead of upsert()-ing the whole row.
-- supabase-js's upsert() compiles to INSERT ... ON CONFLICT DO UPDATE,
-- and Postgres fires BEFORE INSERT triggers (and evaluates the INSERT
-- policy's WITH CHECK) against the full candidate row before the
-- ON CONFLICT branch is taken -- so a second tier signing onto a row
-- that already has an earlier tier's _id set would otherwise re-run
-- this trigger's INSERT-path check against that earlier tier too, with
-- old treated as null, incorrectly re-validating someone else's
-- already-legitimate sign-off against the CURRENT caller's identity.
-- (This is the exact bug closed on trim_entries' approval path in the
-- same prior migration this one extends -- see db.js's sbUpdate().)
-- Real INSERTs (the first tier to sign a batch+step) are unaffected;
-- only the second-and-later tier signing onto an existing row needed
-- to change from upsert() to update().
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

-- Fires whenever any of the four tier _id columns is being SET (was
-- null or different, now non-null) -- covers both the INSERT path (a
-- brand-new gmp_signoffs row created by the first tier to sign) and the
-- UPDATE path (a later tier signing onto an existing row), since
-- signOffTier() upserts into one shared row per batch+step. Unsigning
-- (setting a tier back to null via unsignTier()) and editing unrelated
-- fields like notes are NOT gated by this -- only the act of setting a
-- tier's signer is.
create or replace function private.enforce_gmp_signoff_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  tier text;
  new_id uuid;
  old_id uuid;
begin
  foreach tier in array array['worker', 'supervisor', 'manager', 'qc_head']
  loop
    new_id := (to_jsonb(new) ->> (tier || '_id'))::uuid;
    old_id := case when TG_OP = 'UPDATE' then (to_jsonb(old) ->> (tier || '_id'))::uuid else null end;
    if new_id is not null and new_id is distinct from old_id then
      if not exists (
        select 1 from public.employees
        where id = new_id
          and user_id = (select auth.uid())
      ) then
        raise exception 'You can only sign off as your own linked employee record';
      end if;
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function private.enforce_gmp_signoff_identity() from public, anon, authenticated;

drop trigger if exists enforce_gmp_signoff_identity on public.gmp_signoffs;
create trigger enforce_gmp_signoff_identity
before insert or update on public.gmp_signoffs
for each row execute function private.enforce_gmp_signoff_identity();

commit;
