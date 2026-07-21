-- IPM Tracker: pest scouting, beneficial insect releases, and threshold
-- actions, kept separate from both the regulated pesticide Spray Log
-- (spray_log) and the cost-tracking Cultivation Inputs log
-- (cultivation_inputs). Demo data previously logged a beneficial-insect
-- release into spray_log under a type value that isn't a real Spray Log
-- category, making it render as an unlabeled pesticide application —
-- this table gives IPM activity its own home instead.
--
-- batch_ids is a jsonb array of production_batches ids so a planned
-- (future-dated) entry can be tied to specific upcoming batches before
-- they're harvested/processed, then marked completed later.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.ipm_log (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  entry_type text not null check (entry_type in ('scouting','beneficial_release','threshold_action','note')),
  room_name text,
  grow_space_id uuid references public.grow_spaces(id) on delete set null,
  batch_ids jsonb not null default '[]'::jsonb,
  scheduled_date date,
  performed_date date,
  status text not null default 'planned' check (status in ('planned','completed')),
  target_pest text,
  species text,
  release_rate numeric,
  release_unit text,
  pest_count integer,
  threshold_exceeded boolean not null default false,
  action_taken text,
  performed_by uuid references public.employees(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.ipm_log to authenticated;

create index if not exists ipm_log_facility_id_idx
  on public.ipm_log (facility_id);

drop trigger if exists set_updated_at on public.ipm_log;
create trigger set_updated_at
before update on public.ipm_log
for each row execute function public.handle_updated_at();

-- Same facility-isolation policy shape as every other tenant-owned table
-- (see the July 15 hardening migration's $tenant_policies$ block).
do $ipm_log_policies$
declare
  table_name text;
begin
  foreach table_name in array array['ipm_log']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy facility_isolation_select on public.%I for select to authenticated using (private.is_facility_member(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_insert on public.%I for insert to authenticated with check (private.can_edit_facility(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_update on public.%I for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_delete on public.%I for delete to authenticated using (private.can_admin_facility(facility_id))',
      table_name
    );
  end loop;
end
$ipm_log_policies$;

-- Same immutable audit trigger as every other tenant-owned table.
do $ipm_log_audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array['ipm_log']
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$ipm_log_audit_triggers$;

commit;
