-- Adds a real Customers/Accounts entity so Sales Orders can link to an
-- actual account (contact info, pipeline stage, order-history rollup)
-- instead of a bare free-text customer name/license. sales_orders keeps
-- customer_name/customer_license as denormalized display fields so
-- existing orders and CSV imports keep working without a linked account.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  license_number text,
  contact_name text,
  phone text,
  email text,
  address text,
  account_type text not null default 'dispensary' check (account_type in ('dispensary','processor','wholesale','other')),
  pipeline_stage text not null default 'active' check (pipeline_stage in ('lead','prospect','active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales_orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

grant select, insert, update, delete on public.customers to authenticated;

create index if not exists customers_facility_id_idx
  on public.customers (facility_id);

create index if not exists sales_orders_customer_id_idx
  on public.sales_orders (customer_id);

drop trigger if exists set_updated_at on public.customers;
create trigger set_updated_at
before update on public.customers
for each row execute function public.handle_updated_at();

do $customers_policies$
declare
  table_name text;
begin
  foreach table_name in array array['customers']
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
$customers_policies$;

do $customers_audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array['customers']
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$customers_audit_triggers$;

commit;
