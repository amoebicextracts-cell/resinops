-- TrimmerOne-style individual trimmer tracking: harvest_batches already
-- carries batch-level trim_methods/trimmer_count/grams_per_trimmer_day, but
-- those are planning estimates, not measured per-person actuals. This adds
-- the actuals layer: one row per trimmer per weigh-in, a lightweight
-- submit/approve workflow (mirrors the tier concept Employees.jsx already
-- uses for GMP sign-offs, without wiring into gmp_signoffs itself -- that
-- table is a per-step/per-batch formal GMP record, a different domain from
-- "did a supervisor confirm this weight"), and a piece-rate field on
-- labor_types alongside the existing hourly_rate, so payroll can be
-- calculated from grams x $/gram for roles that are paid that way.
--
-- Photo attachment (TrimmerOne has this) is intentionally NOT built here --
-- would need its own Storage bucket + signed-upload endpoints (see
-- api/resinex-create-upload-url.js's pattern), a real scope decision on
-- its own rather than bundled into this pass.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.labor_types
  add column if not exists piece_rate numeric;

create table if not exists public.trim_entries (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  harvest_batch_id uuid not null references public.harvest_batches(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  entry_date date not null default current_date,
  grams_trimmed numeric not null check (grams_trimmed > 0),
  grade text, -- optional grade tier this trimmer worked (aa/a/b/c), free text to match harvest_batches' own grade labels
  piece_rate numeric, -- snapshot of labor_types.piece_rate at submission time -- a later rate change must never rewrite past payroll
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by_employee_id uuid references public.employees(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.trim_entries to authenticated;

create index if not exists trim_entries_facility_id_idx on public.trim_entries (facility_id);
create index if not exists trim_entries_harvest_batch_id_idx on public.trim_entries (harvest_batch_id);
create index if not exists trim_entries_employee_id_idx on public.trim_entries (employee_id);
create index if not exists trim_entries_status_idx on public.trim_entries (status);

drop trigger if exists set_updated_at on public.trim_entries;
create trigger set_updated_at
before update on public.trim_entries
for each row execute function public.handle_updated_at();

-- Same facility-isolation policy shape as resinex_room_equipment -- not
-- registered in table_scopes, matching most tables added since the
-- section-scoping migration. A trimmer submitting their own entry and a
-- manager approving it both just need can_edit_facility (member+); this
-- app has no existing pattern for a stricter "insert allowed, but only a
-- higher tier can flip status" RLS rule, so that boundary is UI convention
-- here, the same way gmp_signoffs' tiered sign-offs already work today.
alter table public.trim_entries enable row level security;

create policy facility_isolation_select on public.trim_entries
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.trim_entries
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.trim_entries
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.trim_entries
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.trim_entries;
create trigger audit_facility_change
after insert or update or delete on public.trim_entries
for each row execute function private.audit_facility_change();

commit;
