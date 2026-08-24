-- Third customer-facing Annex 11 feature (§16, Business Continuity): lets
-- a facility document ITS OWN continuity plan -- failure scenarios
-- specific to running a licensed cannabis facility (power/utility loss,
-- equipment failure, a key licensed employee unavailable, security
-- breach, supply disruption, regulatory/license issues) and how it
-- responds to each -- mirroring the shape of ResinOps' own
-- docs/business-continuity-plan.md, but for the customer's operation,
-- not ResinOps' own Vercel/Supabase infrastructure.
--
-- Deliberately scoped to the scenario list, the actionable/repeatable
-- part of a BCP, rather than also modeling the document's one-off prose
-- sections (roles/communication, known gaps) as table rows -- those
-- don't repeat the way a list of scenarios does. A `notes` field on
-- each scenario covers anything scenario-specific that doesn't fit the
-- structured columns.
--
-- Registered in table_scopes as 'compliance', same scope as
-- risk_register/gmp_deviations/qc_tests.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

create table if not exists public.bcp_scenarios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  category text not null default 'other'
    check (category in ('utility', 'equipment', 'security', 'personnel', 'regulatory', 'supply_chain', 'natural_disaster', 'other')),
  impact_description text,
  response_plan text,
  recovery_time_target text,
  owner text,
  status text not null default 'draft' check (status in ('draft', 'active', 'needs_review')),
  last_reviewed_date date,
  next_review_date date,
  notes text
);

grant select, insert, update, delete on public.bcp_scenarios to authenticated;

create index if not exists bcp_scenarios_facility_id_idx on public.bcp_scenarios (facility_id);

alter table public.bcp_scenarios enable row level security;

insert into public.table_scopes (table_name, scope) values ('bcp_scenarios', 'compliance')
on conflict (table_name) do nothing;

create policy facility_isolation_select on public.bcp_scenarios
  for select to authenticated using (private.can_view_facility(facility_id, 'bcp_scenarios'));
create policy facility_isolation_insert on public.bcp_scenarios
  for insert to authenticated with check (private.can_edit_facility(facility_id, 'bcp_scenarios'));
create policy facility_isolation_update on public.bcp_scenarios
  for update to authenticated using (private.can_edit_facility(facility_id, 'bcp_scenarios'));
create policy facility_isolation_delete on public.bcp_scenarios
  for delete to authenticated using (private.can_admin_facility(facility_id, 'bcp_scenarios'));

-- created_by is always forced to the caller's own identity, matching
-- risk_register's stamp trigger -- never trusted from the client.
create or replace function private.stamp_bcp_scenario_author()
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

revoke all on function private.stamp_bcp_scenario_author() from public, anon, authenticated;

drop trigger if exists stamp_bcp_scenario_author on public.bcp_scenarios;
create trigger stamp_bcp_scenario_author
before insert or update on public.bcp_scenarios
for each row execute function private.stamp_bcp_scenario_author();

commit;
