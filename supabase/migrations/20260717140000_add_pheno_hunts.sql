-- PhenoHunt.jsx has never been wired to Supabase — hunts (and every seed
-- inside them) live in a single flat, facility-unscoped localStorage key.
-- No table exists for it at all.
--
-- Seeds are stored as a jsonb array on the hunt row rather than a separate
-- table, matching the existing pattern for other batch-scoped child arrays
-- (harvest_batches.grades, production_batches.steps, mother_plants.cut_log)
-- — nothing in the app queries seeds independently of their hunt, they're
-- always read/written in the context of "the active hunt."
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.pheno_hunts (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  strain_name text,
  breeder text,
  seed_source text,
  seed_count integer,
  germ_date date,
  notes text,
  seeds jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.pheno_hunts to authenticated;

create index if not exists pheno_hunts_facility_id_idx
  on public.pheno_hunts (facility_id);

drop trigger if exists set_updated_at on public.pheno_hunts;
create trigger set_updated_at
before update on public.pheno_hunts
for each row execute function public.handle_updated_at();

alter table public.pheno_hunts enable row level security;

create policy facility_isolation_select on public.pheno_hunts
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.pheno_hunts
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.pheno_hunts
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.pheno_hunts
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.pheno_hunts;
create trigger audit_facility_change
after insert or update or delete on public.pheno_hunts
for each row execute function private.audit_facility_change();

commit;
