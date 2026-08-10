-- ResinEx phase 2: facility-shell-first capital-expansion planning.
-- resinex_projects is the top-level container (one per planned expansion
-- or greenfield buildout); resinex_facility_shells is the project's
-- facility footprint (one per project for now -- rectangle only, width x
-- depth x ceiling height); resinex_rooms are rectangular rooms placed
-- inside a shell (grow/production/business spaces), optionally linked to
-- an existing grow_rooms or facility_map_spaces record. All dimensions
-- are in feet -- equipment dimensions (added in the phase 1 migration)
-- are in inches, since that's equipment scale, not facility scale; a
-- future equipment-placement phase will need to convert between the two.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.resinex_projects (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  project_type text not null default 'expansion'
    check (project_type in ('greenfield', 'expansion')),
  status text not null default 'planning'
    check (status in ('planning', 'active', 'on_hold', 'complete')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resinex_facility_shells (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.resinex_projects(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  width_ft numeric not null,
  depth_ft numeric not null,
  ceiling_height_ft numeric not null default 12,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resinex_rooms (
  id uuid primary key default gen_random_uuid(),
  shell_id uuid not null references public.resinex_facility_shells(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  name text not null,
  room_type text not null default 'other'
    check (room_type in ('grow', 'production', 'business', 'other')),
  x_ft numeric not null default 0,
  y_ft numeric not null default 0,
  width_ft numeric not null,
  depth_ft numeric not null,
  height_ft numeric,
  color text,
  linked_grow_room_id uuid references public.grow_rooms(id) on delete set null,
  linked_facility_map_space_id uuid references public.facility_map_spaces(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.resinex_projects to authenticated;
grant select, insert, update, delete on public.resinex_facility_shells to authenticated;
grant select, insert, update, delete on public.resinex_rooms to authenticated;

create index if not exists resinex_projects_facility_id_idx
  on public.resinex_projects (facility_id);
create index if not exists resinex_facility_shells_facility_id_idx
  on public.resinex_facility_shells (facility_id);
create index if not exists resinex_facility_shells_project_id_idx
  on public.resinex_facility_shells (project_id);
create index if not exists resinex_rooms_facility_id_idx
  on public.resinex_rooms (facility_id);
create index if not exists resinex_rooms_shell_id_idx
  on public.resinex_rooms (shell_id);

drop trigger if exists set_updated_at on public.resinex_projects;
create trigger set_updated_at
before update on public.resinex_projects
for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.resinex_facility_shells;
create trigger set_updated_at
before update on public.resinex_facility_shells
for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.resinex_rooms;
create trigger set_updated_at
before update on public.resinex_rooms
for each row execute function public.handle_updated_at();

alter table public.resinex_projects enable row level security;
alter table public.resinex_facility_shells enable row level security;
alter table public.resinex_rooms enable row level security;

create policy facility_isolation_select on public.resinex_projects
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_projects
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_projects
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_projects
  for delete to authenticated using (private.can_admin_facility(facility_id));

create policy facility_isolation_select on public.resinex_facility_shells
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_facility_shells
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_facility_shells
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_facility_shells
  for delete to authenticated using (private.can_admin_facility(facility_id));

create policy facility_isolation_select on public.resinex_rooms
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_rooms
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_rooms
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_rooms
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.resinex_projects;
create trigger audit_facility_change
after insert or update or delete on public.resinex_projects
for each row execute function private.audit_facility_change();

drop trigger if exists audit_facility_change on public.resinex_facility_shells;
create trigger audit_facility_change
after insert or update or delete on public.resinex_facility_shells
for each row execute function private.audit_facility_change();

drop trigger if exists audit_facility_change on public.resinex_rooms;
create trigger audit_facility_change
after insert or update or delete on public.resinex_rooms
for each row execute function private.audit_facility_change();

commit;
