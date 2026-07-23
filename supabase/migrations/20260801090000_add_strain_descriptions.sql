-- Adds strain_descriptions: per (strain × product type) budtender-facing
-- descriptions, separate from the single strains.ai_description field
-- (which stays as the general sales/marketing blurb). Lets a strain carry
-- a distinct description for Flower vs. Vape vs. Pre-Roll vs. Extract,
-- etc. — different formats have different talking points (potency
-- delivery, onset, ideal use case).
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.strain_descriptions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  strain_id uuid not null references public.strains(id) on delete cascade,
  product_type text not null default 'other' check (product_type in ('flower','pre_roll','vape','extract','edible','other')),
  description text not null default '',
  sources jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.strain_descriptions to authenticated;

create index if not exists strain_descriptions_facility_id_idx
  on public.strain_descriptions (facility_id);

create index if not exists strain_descriptions_strain_id_idx
  on public.strain_descriptions (strain_id);

drop trigger if exists set_updated_at on public.strain_descriptions;
create trigger set_updated_at
before update on public.strain_descriptions
for each row execute function public.handle_updated_at();

do $strain_descriptions_policies$
declare
  table_name text;
begin
  foreach table_name in array array['strain_descriptions']
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
$strain_descriptions_policies$;

do $strain_descriptions_audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array['strain_descriptions']
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$strain_descriptions_audit_triggers$;

commit;
