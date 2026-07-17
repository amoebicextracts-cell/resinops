-- MetrcHub.jsx's "Create Transfer" push button has never had a data model
-- to back it — outbound transfer manifests need transporter/vehicle/route
-- data that doesn't belong on sales_orders (a commercial transaction
-- record, not a regulatory shipment manifest). This table lets a manifest
-- be drafted and edited in ResinOps before ever pushing to METRC, and
-- optionally links back to the sales order it fulfills for context.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.metrc_transfer_manifests (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  destination_facility_name text,
  destination_license_number text,
  transfer_type text,
  planned_route text,
  estimated_departure timestamptz,
  estimated_arrival timestamptz,
  driver_name text,
  driver_license_number text,
  vehicle_make text,
  vehicle_model text,
  vehicle_license_plate text,
  phone_for_questions text,
  packages jsonb not null default '[]'::jsonb,
  metrc_transfer_id text,
  status text not null default 'draft'
    check (status in ('draft', 'pushed', 'failed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.metrc_transfer_manifests to authenticated;

create index if not exists metrc_transfer_manifests_facility_id_idx
  on public.metrc_transfer_manifests (facility_id);
create index if not exists metrc_transfer_manifests_sales_order_id_idx
  on public.metrc_transfer_manifests (sales_order_id);

drop trigger if exists set_updated_at on public.metrc_transfer_manifests;
create trigger set_updated_at
before update on public.metrc_transfer_manifests
for each row execute function public.handle_updated_at();

alter table public.metrc_transfer_manifests enable row level security;

create policy facility_isolation_select on public.metrc_transfer_manifests
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.metrc_transfer_manifests
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.metrc_transfer_manifests
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.metrc_transfer_manifests
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.metrc_transfer_manifests;
create trigger audit_facility_change
after insert or update or delete on public.metrc_transfer_manifests
for each row execute function private.audit_facility_change();

commit;
