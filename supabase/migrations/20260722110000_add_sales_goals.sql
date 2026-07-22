-- Sales goals: a facility can set a revenue target for a period (e.g. a
-- month or quarter). The sales dial on Dashboard/Sales & Pre-Orders tracks
-- the reconciled Sales Orders pipeline revenue against whichever goal's
-- period contains today's date.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  period_start date not null,
  period_end date not null,
  goal_amount numeric not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.sales_goals to authenticated;

create index if not exists sales_goals_facility_id_idx
  on public.sales_goals (facility_id);

drop trigger if exists set_updated_at on public.sales_goals;
create trigger set_updated_at
before update on public.sales_goals
for each row execute function public.handle_updated_at();

do $sales_goals_policies$
declare
  table_name text;
begin
  foreach table_name in array array['sales_goals']
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
$sales_goals_policies$;

do $sales_goals_audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array['sales_goals']
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$sales_goals_audit_triggers$;

commit;
