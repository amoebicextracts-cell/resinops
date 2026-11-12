-- Sign-offs recorded on behalf of another employee.
--
-- enforce_gmp_signoff_identity (20260823090000) only lets a caller set a
-- tier's _id to their own linked employee record. That is right for live
-- sign-offs, but it leaves no honest way to enter historical records for
-- work done by someone who never had a login or has since left the
-- company. Writing their name from someone else's login would defeat the
-- control, and editing the trigger away would make backfilled rows look
-- self-signed.
--
-- This adds an explicit, visible "recorded on behalf" path:
--   * gmp_signoffs.on_behalf is a jsonb map keyed by tier, e.g.
--       {"worker": {"entered_by": <auth uid>, "entered_at": <ts>,
--                   "reason": "Historical backfill"}}
--   * A tier may be set to someone else's employee id only when the
--     client asks for it (on_behalf.<tier>.reason is non-blank), the
--     caller is an owner/admin of the row's facility, the employee
--     belongs to that facility, and the tier is not qc_head (QC Head
--     release is a password-reverified e-signature and stays personal).
--   * entered_by and entered_at are stamped by the trigger from
--     auth.uid() and now(); whatever the client sent there is ignored.
--   * An existing tier's on_behalf entry can't be added, edited or
--     removed while that tier's signer stays the same, so the marker
--     can't be stripped later to make a proxy sign-off look personal.
--     Unsigning a tier (or re-signing it as yourself) clears its entry.
--
-- Not applied automatically; review and run it in the Supabase SQL
-- editor after the disposable database job passes.

begin;

alter table public.gmp_signoffs
  add column if not exists on_behalf jsonb not null default '{}'::jsonb;

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
  requested jsonb;
  previous jsonb;
  marks jsonb;
begin
  marks := coalesce(new.on_behalf, '{}'::jsonb);
  if jsonb_typeof(marks) <> 'object' then
    marks := '{}'::jsonb;
  end if;

  foreach tier in array array['worker', 'supervisor', 'manager', 'qc_head']
  loop
    new_id := (to_jsonb(new) ->> (tier || '_id'))::uuid;
    old_id := case when TG_OP = 'UPDATE' then (to_jsonb(old) ->> (tier || '_id'))::uuid else null end;
    requested := marks -> tier;
    previous := case when TG_OP = 'UPDATE' then coalesce(old.on_behalf, '{}'::jsonb) -> tier else null end;

    if new_id is null then
      -- Unsigned (or never signed): no marker.
      marks := marks - tier;

    elsif new_id is distinct from old_id then
      if exists (
        select 1 from public.employees
        where id = new_id
          and user_id = (select auth.uid())
      ) then
        -- Signing as yourself is a personal sign-off.
        marks := marks - tier;
      elsif tier <> 'qc_head'
        and requested is not null
        and jsonb_typeof(requested) = 'object'
        and length(btrim(coalesce(requested ->> 'reason', ''))) > 0
        and private.can_admin_facility(new.facility_id)
        and exists (
          select 1 from public.employees
          where id = new_id
            and facility_id = new.facility_id
        )
      then
        marks := marks || jsonb_build_object(tier, jsonb_build_object(
          'entered_by', (select auth.uid()),
          'entered_at', now(),
          'reason', btrim(requested ->> 'reason')
        ));
      else
        raise exception 'You can only sign off as your own linked employee record';
      end if;

    else
      -- Signer unchanged: keep whatever marker was there before.
      if previous is null then
        marks := marks - tier;
      else
        marks := marks || jsonb_build_object(tier, previous);
      end if;
    end if;
  end loop;

  new.on_behalf := marks;
  return new;
end;
$function$;

revoke all on function private.enforce_gmp_signoff_identity() from public, anon, authenticated;

drop trigger if exists enforce_gmp_signoff_identity on public.gmp_signoffs;
create trigger enforce_gmp_signoff_identity
before insert or update on public.gmp_signoffs
for each row execute function private.enforce_gmp_signoff_identity();

commit;
