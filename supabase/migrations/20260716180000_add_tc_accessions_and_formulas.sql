-- TCTracker.jsx has never been wired to Supabase at all — accessions,
-- vessels, and media formulas all live in flat, facility-unscoped
-- localStorage keys. tc_vessels already exists as a table (part of the
-- original schema adoption) but the component has never called it, so
-- accession_id was left as a loose `text` column and half the fields the
-- component actually tracks (label, stage_date, media_base, formula link,
-- explant info, health, contamination detail, the per-vessel event log)
-- were never added. tc_accessions and tc_formulas don't exist at all.
--
-- Since tc_vessels has never been written to in production, it's safe to
-- convert accession_id to a real uuid FK here rather than leaving it as
-- a loose text field. The component fix (separate commit) wires
-- TCTracker.jsx to all three tables.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.tc_accessions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  strain_name text,
  source_type text not null default 'mother_plant'
    check (source_type in ('mother_plant', 'flower_plant', 'seed', 'external_tc', 'other')),
  source_id text,
  initiated_date date,
  initiated_by text,
  purpose text not null default 'preservation'
    check (purpose in ('preservation', 'hlv_cleanup', 'multiplication', 'rejuvenation', 'research')),
  hlv_status text not null default 'unknown'
    check (hlv_status in ('unknown', 'negative', 'suspected', 'confirmed', 'cleared')),
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tc_formulas (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  stage text,
  base text,
  volume numeric,
  agar numeric,
  ph numeric,
  pgr1_name text,
  pgr1_mg numeric,
  pgr2_name text,
  pgr2_mg numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- accession_id may already exist as the loose `text` column from the
-- original schema adoption (production), or not exist at all if tc_vessels
-- was just created by the CI fixture's generic (id, facility_id, name)
-- table shape — handle both rather than assuming one.
do $accession_id_column$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tc_vessels'
      and column_name='accession_id' and data_type='text'
  ) then
    alter table public.tc_vessels alter column accession_id type uuid using nullif(accession_id, '')::uuid;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tc_vessels' and column_name='accession_id'
  ) then
    alter table public.tc_vessels add column accession_id uuid;
  end if;
end
$accession_id_column$;

alter table public.tc_vessels
  add constraint tc_vessels_accession_id_fkey
    foreign key (accession_id) references public.tc_accessions(id) on delete set null;

alter table public.tc_vessels
  add column if not exists label text,
  add column if not exists stage_date date,
  add column if not exists media_base text,
  add column if not exists media_lot_num text,
  add column if not exists formula_id uuid references public.tc_formulas(id) on delete set null,
  add column if not exists explant_date date,
  add column if not exists explant_source text,
  add column if not exists health text,
  add column if not exists contam_type text,
  add column if not exists contam_date date,
  add column if not exists log jsonb not null default '[]'::jsonb;

grant select, insert, update, delete on public.tc_accessions to authenticated;
grant select, insert, update, delete on public.tc_formulas to authenticated;

create index if not exists tc_accessions_facility_id_idx on public.tc_accessions (facility_id);
create index if not exists tc_formulas_facility_id_idx on public.tc_formulas (facility_id);
create index if not exists tc_vessels_accession_id_idx on public.tc_vessels (accession_id);

drop trigger if exists set_updated_at on public.tc_accessions;
create trigger set_updated_at
before update on public.tc_accessions
for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.tc_formulas;
create trigger set_updated_at
before update on public.tc_formulas
for each row execute function public.handle_updated_at();

do $new_tenant_policies$
declare
  table_name text;
begin
  foreach table_name in array array['tc_accessions', 'tc_formulas']
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
$new_tenant_policies$;

do $new_audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array['tc_accessions', 'tc_formulas']
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$new_audit_triggers$;

commit;
