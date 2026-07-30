-- Item 5 of the pilot-readiness punch list: resinops.com/terms.html and
-- /privacy.html are real published pages, but nothing ever recorded a user
-- agreeing to them. Enforced server-side inside accept_facility_invite
-- (the only place a brand-new invited user completes signup) rather than
-- relying solely on a client-side checkbox, which a direct RPC call could
-- bypass.

alter table public.facility_members
  add column if not exists terms_accepted_at timestamptz;

-- create or replace function cannot change an existing function's
-- parameter list -- it would only add a second, overloaded function,
-- leaving the old zero-arg accept_facility_invite() callable and
-- completely bypassing the terms-acceptance check below. Drop it first.
drop function if exists public.accept_facility_invite();

create or replace function public.accept_facility_invite(p_terms_accepted boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not p_terms_accepted then
    raise exception 'Terms of Service and Privacy Policy must be accepted to continue.';
  end if;

  update public.facility_members
  set accepted_at = now(),
      terms_accepted_at = now()
  where user_id = (select auth.uid())
    and accepted_at is null;
end
$function$;

revoke all on function public.accept_facility_invite(boolean) from public, anon;
grant execute on function public.accept_facility_invite(boolean) to authenticated;
