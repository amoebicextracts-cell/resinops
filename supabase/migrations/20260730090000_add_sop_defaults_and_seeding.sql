-- ============================================================
-- ResinOps — Preloaded "how to use ResinOps" SOPs
-- supabase/migrations/20260730090000_add_sop_defaults_and_seeding.sql
--
-- gmp_sops already holds a facility's own real operational SOPs.
-- This adds a `source` flag to tell a ResinOps-authored software
-- how-to guide apart from a facility's own procedure, a platform-
-- level catalog table (sop_defaults) holding the canonical content,
-- and a trigger that copies the catalog into gmp_sops for every new
-- facility - regardless of how that facility gets created (today
-- that's manual/SQL, since there's no self-serve signup yet).
-- ============================================================

begin;

alter table public.gmp_sops
  add column if not exists source text not null default 'facility-custom'
  check (source in ('resinops-default','facility-custom'));

create table if not exists public.sop_defaults (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  version text not null default '1.0',
  content text not null,
  linked_step_types text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sop_defaults enable row level security;

-- Platform content, not facility content - only the platform admin
-- can read it directly. Nobody needs client-side insert/update/delete;
-- it's authored and maintained through migrations.
create policy sop_defaults_select_admin on public.sop_defaults for select to authenticated using (private.is_platform_admin());

drop trigger if exists set_updated_at on public.sop_defaults;
create trigger set_updated_at before update on public.sop_defaults for each row execute function public.set_updated_at();

create or replace function private.seed_default_sops()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gmp_sops (facility_id, title, category, version, content, linked_step_types, status, source)
  select new.id, title, category, version, content, linked_step_types, 'active', 'resinops-default'
  from public.sop_defaults
  order by sort_order;
  return new;
end;
$$;

drop trigger if exists seed_default_sops on public.facilities;
create trigger seed_default_sops after insert on public.facilities for each row execute function private.seed_default_sops();

commit;
