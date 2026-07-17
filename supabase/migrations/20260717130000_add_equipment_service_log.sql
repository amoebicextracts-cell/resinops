-- Equipment.jsx's service/PM history log (openService()/saveService()) has
-- never persisted — serviceLog is pure React state, and vendors was never
-- loaded either (db.vendors.list() was never called despite two vendor
-- dropdowns reading from it). The equipment record itself was already
-- fixed earlier this session; only the service-log sub-feature was missed.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.equipment_service_log (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  service_date date not null default current_date,
  service_type text not null default 'pm'
    check (service_type in ('pm', 'calibration', 'repair', 'inspection')),
  tech text,
  vendor_id uuid references public.vendors(id) on delete set null,
  cost numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.equipment_service_log to authenticated;

create index if not exists equipment_service_log_facility_id_idx
  on public.equipment_service_log (facility_id);
create index if not exists equipment_service_log_equipment_id_idx
  on public.equipment_service_log (equipment_id);

drop trigger if exists set_updated_at on public.equipment_service_log;
create trigger set_updated_at
before update on public.equipment_service_log
for each row execute function public.handle_updated_at();

alter table public.equipment_service_log enable row level security;

create policy facility_isolation_select on public.equipment_service_log
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.equipment_service_log
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.equipment_service_log
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.equipment_service_log
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.equipment_service_log;
create trigger audit_facility_change
after insert or update or delete on public.equipment_service_log
for each row execute function private.audit_facility_change();

commit;
