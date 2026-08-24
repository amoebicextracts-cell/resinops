-- Second customer-facing Annex 11 feature: lets a facility keep its own
-- living risk register (§1, Risk Management), complementing the
-- vendor-qualification tracking just shipped (§3). Mirrors the shape of
-- ResinOps' own docs/risk-assessment.md (likelihood x impact x
-- mitigation x residual) but as an ongoing log a facility maintains for
-- itself, not a static document ResinOps writes about its own platform.
--
-- Registered in table_scopes as 'compliance', matching gmp_deviations/
-- gmp_sops/qc_tests -- risk entries are compliance-relevant records, not
-- business/facility-admin ones.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

create table if not exists public.risk_register (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  category text not null default 'other'
    check (category in ('data_integrity', 'availability', 'security', 'process', 'regulatory', 'other')),
  description text,
  likelihood text not null default 'medium' check (likelihood in ('low', 'medium', 'high')),
  impact text not null default 'medium' check (impact in ('low', 'medium', 'high')),
  overall text not null default 'medium' check (overall in ('low', 'medium', 'high')),
  mitigation text,
  residual_notes text,
  status text not null default 'open' check (status in ('open', 'mitigated', 'accepted', 'closed')),
  owner text,
  identified_date date not null default current_date,
  next_review_date date,
  notes text
);

grant select, insert, update, delete on public.risk_register to authenticated;

create index if not exists risk_register_facility_id_idx on public.risk_register (facility_id);

alter table public.risk_register enable row level security;

insert into public.table_scopes (table_name, scope) values ('risk_register', 'compliance')
on conflict (table_name) do nothing;

create policy facility_isolation_select on public.risk_register
  for select to authenticated using (private.can_view_facility(facility_id, 'risk_register'));
create policy facility_isolation_insert on public.risk_register
  for insert to authenticated with check (private.can_edit_facility(facility_id, 'risk_register'));
create policy facility_isolation_update on public.risk_register
  for update to authenticated using (private.can_edit_facility(facility_id, 'risk_register'));
create policy facility_isolation_delete on public.risk_register
  for delete to authenticated using (private.can_admin_facility(facility_id, 'risk_register'));

-- created_by is always forced to the caller's own identity, matching
-- every other identity-stamping trigger in this project -- never
-- trusted from the client payload.
create or replace function private.stamp_risk_register_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.stamp_risk_register_author() from public, anon, authenticated;

drop trigger if exists stamp_risk_register_author on public.risk_register;
create trigger stamp_risk_register_author
before insert or update on public.risk_register
for each row execute function private.stamp_risk_register_author();

commit;
