-- ResinEx phase 6: expansion Gantt view. A buildout/permitting/
-- procurement task timeline for a capex project -- the capex analog to
-- ResinOps' existing operational Gantt views (Scheduler.jsx/
-- ProductionScheduler.jsx). depends_on_task_id is purely informational
-- (shown as a label on the dependent task in the UI), not used to
-- auto-recalculate dates -- a real critical-path scheduling engine is
-- out of scope, consistent with ResinEx's "estimator, not a 1:1" framing.
--
-- Includes the cross-facility-reference validation trigger pattern from
-- the start (applied reactively to resinex_project_documents/
-- resinex_project_actuals in phase 5 only after Greptile review flagged
-- the gap) -- RLS alone only checks the row's own submitted facility_id,
-- not that project_id/depends_on_task_id actually belong to it.
--
-- This table has no Storage/file involvement, so phase 5's
-- service-role-only-write lesson (needed there because a forged
-- storage_path could get a private file signed and exposed) doesn't
-- apply -- plain client-side RLS-governed CRUD via db.js is appropriate
-- here, same as every other ResinEx table except resinex_project_documents.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.resinex_expansion_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.resinex_projects(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  name text not null,
  category text not null default 'other'
    check (category in ('permitting', 'construction', 'procurement', 'inspection', 'other')),
  start_date date not null,
  duration_days integer not null default 1 check (duration_days > 0),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'complete', 'blocked')),
  depends_on_task_id uuid references public.resinex_expansion_tasks(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.resinex_validate_task_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.resinex_projects
    where id = new.project_id and facility_id = new.facility_id
  ) then
    raise exception 'project % does not belong to facility %', new.project_id, new.facility_id;
  end if;
  if new.depends_on_task_id is not null and not exists (
    select 1 from public.resinex_expansion_tasks
    where id = new.depends_on_task_id
      and facility_id = new.facility_id
      and project_id = new.project_id
  ) then
    raise exception 'depends_on_task_id % does not belong to project %/facility %', new.depends_on_task_id, new.project_id, new.facility_id;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_task_refs on public.resinex_expansion_tasks;
create trigger validate_task_refs
before insert or update on public.resinex_expansion_tasks
for each row execute function private.resinex_validate_task_refs();

grant select, insert, update, delete on public.resinex_expansion_tasks to authenticated;

create index if not exists resinex_expansion_tasks_facility_id_idx on public.resinex_expansion_tasks (facility_id);
create index if not exists resinex_expansion_tasks_project_id_idx on public.resinex_expansion_tasks (project_id);

drop trigger if exists set_updated_at on public.resinex_expansion_tasks;
create trigger set_updated_at
before update on public.resinex_expansion_tasks
for each row execute function public.handle_updated_at();

alter table public.resinex_expansion_tasks enable row level security;

create policy facility_isolation_select on public.resinex_expansion_tasks
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_expansion_tasks
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_expansion_tasks
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_expansion_tasks
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.resinex_expansion_tasks;
create trigger audit_facility_change
after insert or update or delete on public.resinex_expansion_tasks
for each row execute function private.audit_facility_change();

commit;
