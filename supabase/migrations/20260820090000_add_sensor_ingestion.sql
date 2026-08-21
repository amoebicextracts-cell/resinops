-- Sensor ingestion, phase 1: link a grow_rooms row to a device/port on a
-- third-party environmental sensor platform (starting with AC Infinity --
-- the only platform Alex currently has account access to without a client
-- involved; Growlink/Argus/others can add more `source` values later
-- without a schema change) and store the readings that get polled from it.
--
-- grow_rooms already had an unused `sensor_id` free-text column labeled
-- "Sensor ID (Growlink / future API)" -- this supersedes that with a real
-- table, since a room can have more than one linked sensor/port.
--
-- api/ac-infinity.js's cron-triggered poller writes sensor_readings via the
-- Supabase service-role client (bypasses RLS entirely), polling every
-- linked, active device/port on a schedule (see vercel.json). The
-- audit_facility_change trigger is intentionally NOT attached to
-- sensor_readings (unlike sensor_device_links) -- at a 5-minute poll
-- interval across many rooms, every insert would flood audit_logs with
-- machine-generated noise that isn't a meaningful audit trail entry.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.sensor_device_links (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  grow_room_id uuid not null references public.grow_rooms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'ac_infinity' check (source in ('ac_infinity')),
  external_device_id text not null,
  external_port_id text,
  label text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  device_link_id uuid not null references public.sensor_device_links(id) on delete cascade,
  grow_room_id uuid references public.grow_rooms(id) on delete set null,
  metric text not null check (metric in ('temp_f', 'humidity_pct', 'vpd_kpa')),
  value numeric not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.sensor_device_links to authenticated;
grant select, insert, update, delete on public.sensor_readings to authenticated;

create index if not exists sensor_device_links_facility_id_idx
  on public.sensor_device_links (facility_id);
create index if not exists sensor_device_links_grow_room_id_idx
  on public.sensor_device_links (grow_room_id);

create index if not exists sensor_readings_facility_id_idx
  on public.sensor_readings (facility_id);
create index if not exists sensor_readings_device_link_id_idx
  on public.sensor_readings (device_link_id);
create index if not exists sensor_readings_room_metric_recorded_idx
  on public.sensor_readings (grow_room_id, metric, recorded_at desc);

drop trigger if exists set_updated_at on public.sensor_device_links;
create trigger set_updated_at
before update on public.sensor_device_links
for each row execute function public.handle_updated_at();

-- Same facility-isolation policy shape as resinex_room_equipment (not
-- registered in table_scopes -- most tables added since the section-scoping
-- migration aren't; this stays on the plain facility-membership check).
alter table public.sensor_device_links enable row level security;

create policy facility_isolation_select on public.sensor_device_links
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.sensor_device_links
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.sensor_device_links
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.sensor_device_links
  for delete to authenticated using (private.can_admin_facility(facility_id));

alter table public.sensor_readings enable row level security;

create policy facility_isolation_select on public.sensor_readings
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.sensor_readings
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.sensor_readings
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.sensor_readings
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.sensor_device_links;
create trigger audit_facility_change
after insert or update or delete on public.sensor_device_links
for each row execute function private.audit_facility_change();

commit;
