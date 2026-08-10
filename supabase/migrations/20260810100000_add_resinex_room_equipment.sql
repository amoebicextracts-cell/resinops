-- ResinEx phase 3: equipment placement inside rooms. resinex_room_equipment
-- joins a real equipment row (phase 1 -- inches-based dims, may be
-- status='planned') to a resinex_rooms row (phase 2 -- feet-based).
-- Position is stored in ROOM-LOCAL feet (not shell-global), matching the
-- coordinate space the 2D editor already drags rooms within, so the drag/
-- clamp logic for equipment is the same shape as the existing room
-- drag/clamp logic, just clamped against the room's own width_ft/depth_ft
-- instead of the shell's.
--
-- No uniqueness constraint on equipment_id: the same physical equipment
-- row is allowed to appear in more than one resinex_rooms placement across
-- DIFFERENT projects (e.g. duplicating a project to compare two layout
-- scenarios that both plan to use the same forklift). "Don't place the
-- same unit twice in one layout" is enforced only in the UI, scoped to
-- the current project -- not a DB constraint.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.resinex_room_equipment (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.resinex_rooms(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  x_ft numeric not null default 0,
  y_ft numeric not null default 0,
  rotation_deg integer not null default 0
    check (rotation_deg in (0, 90, 180, 270)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.resinex_room_equipment to authenticated;

create index if not exists resinex_room_equipment_facility_id_idx
  on public.resinex_room_equipment (facility_id);
create index if not exists resinex_room_equipment_room_id_idx
  on public.resinex_room_equipment (room_id);
create index if not exists resinex_room_equipment_equipment_id_idx
  on public.resinex_room_equipment (equipment_id);

drop trigger if exists set_updated_at on public.resinex_room_equipment;
create trigger set_updated_at
before update on public.resinex_room_equipment
for each row execute function public.handle_updated_at();

alter table public.resinex_room_equipment enable row level security;

create policy facility_isolation_select on public.resinex_room_equipment
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_room_equipment
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_room_equipment
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_room_equipment
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.resinex_room_equipment;
create trigger audit_facility_change
after insert or update or delete on public.resinex_room_equipment
for each row execute function private.audit_facility_change();

commit;
