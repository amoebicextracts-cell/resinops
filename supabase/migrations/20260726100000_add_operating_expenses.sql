-- Tracks the other side of §280E: pure SG&A that was never eligible for
-- any COGS treatment (marketing, admin salaries, legal/professional fees,
-- a separate retail storefront's costs, non-production insurance) so the
-- Annual 280E Summary can show what's genuinely disallowed alongside what
-- §263A lets a facility capitalize. Deliberately a simple dated ledger
-- (one row per expense/payment) rather than a recurring-formula shape
-- like cost_pools — matches every other dated/annual-rollup concept in
-- this app (batches, orders, harvest records).
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null check (category in (
    'g_and_a', 'marketing', 'admin_salaries', 'legal_professional',
    'insurance_nonprod', 'retail_operations', 'other'
  )),
  amount numeric not null default 0,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operating_expenses enable row level security;

create policy facility_isolation_select on public.operating_expenses for select to authenticated using (private.can_view_facility(facility_id, 'operating_expenses'));
create policy facility_isolation_insert on public.operating_expenses for insert to authenticated with check (private.can_edit_facility(facility_id, 'operating_expenses'));
create policy facility_isolation_update on public.operating_expenses for update to authenticated using (private.can_edit_facility(facility_id, 'operating_expenses')) with check (private.can_edit_facility(facility_id, 'operating_expenses'));
create policy facility_isolation_delete on public.operating_expenses for delete to authenticated using (private.can_admin_facility(facility_id, 'operating_expenses'));

drop trigger if exists set_updated_at on public.operating_expenses;
create trigger set_updated_at before update on public.operating_expenses for each row execute function public.set_updated_at();

drop trigger if exists audit_facility_change on public.operating_expenses;
create trigger audit_facility_change after insert or update or delete on public.operating_expenses for each row execute function private.audit_facility_change();

insert into public.table_scopes (table_name, scope) values ('operating_expenses', 'business')
on conflict (table_name) do update set scope = excluded.scope;

commit;
