-- Accounts Payable. Separate from purchase_orders because real AP isn't
-- limited to inventory purchases — rent, utilities, insurance, and
-- professional services all generate vendor bills with no PO behind
-- them. po_id is nullable so an invoice can optionally tie back to a
-- specific inventory PO. Payment is a single running total
-- (amount_paid), not a dated payment-transaction ledger — sufficient for
-- "how much do we owe" and aging; status (paid/partial/unpaid) is always
-- derived client-side, never stored.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  po_id uuid references public.purchase_orders(id) on delete set null,
  invoice_number text,
  invoice_date date not null default current_date,
  due_date date,
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_invoices enable row level security;

create policy facility_isolation_select on public.vendor_invoices for select to authenticated using (private.can_view_facility(facility_id, 'vendor_invoices'));
create policy facility_isolation_insert on public.vendor_invoices for insert to authenticated with check (private.can_edit_facility(facility_id, 'vendor_invoices'));
create policy facility_isolation_update on public.vendor_invoices for update to authenticated using (private.can_edit_facility(facility_id, 'vendor_invoices')) with check (private.can_edit_facility(facility_id, 'vendor_invoices'));
create policy facility_isolation_delete on public.vendor_invoices for delete to authenticated using (private.can_admin_facility(facility_id, 'vendor_invoices'));

drop trigger if exists set_updated_at on public.vendor_invoices;
create trigger set_updated_at before update on public.vendor_invoices for each row execute function public.set_updated_at();

drop trigger if exists audit_facility_change on public.vendor_invoices;
create trigger audit_facility_change after insert or update or delete on public.vendor_invoices for each row execute function private.audit_facility_change();

insert into public.table_scopes (table_name, scope) values ('vendor_invoices', 'business')
on conflict (table_name) do update set scope = excluded.scope;

-- Accounts Receivable — payment tracking on top of the existing order.
-- An order's lines already compute the invoice amount; no separate
-- customer-invoice entity needed.
alter table public.sales_orders
  add column if not exists due_date date,
  add column if not exists amount_paid numeric not null default 0;

commit;
