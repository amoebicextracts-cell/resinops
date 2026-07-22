-- AI chat persistence + a shared, cross-facility corrections knowledge
-- base — the "moat": when a facility flags an AI answer as wrong and a
-- correction is approved, future answers (for every client, not just the
-- one that flagged it) get that correction injected into their system
-- prompt. ai_conversations/ai_messages are ordinary facility-scoped
-- tables. ai_corrections is the one genuinely new RLS shape in this
-- app — approved rows are readable across every facility, since
-- retrieval has to work for everyone, not just the submitter. Nothing
-- in this app has a cross-tenant admin concept yet, so this migration
-- introduces one (profiles.is_platform_admin) rather than inventing an
-- ad hoc allowlist.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  module text not null check (module in ('ai-assistant','ops-analyst','cultivation','post-harvest','extraction','facility')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy facility_isolation_select on public.ai_conversations for select to authenticated using (private.can_view_facility(facility_id, 'ai_conversations'));
create policy facility_isolation_insert on public.ai_conversations for insert to authenticated with check (private.can_edit_facility(facility_id, 'ai_conversations'));
create policy facility_isolation_update on public.ai_conversations for update to authenticated using (private.can_edit_facility(facility_id, 'ai_conversations')) with check (private.can_edit_facility(facility_id, 'ai_conversations'));
create policy facility_isolation_delete on public.ai_conversations for delete to authenticated using (private.can_admin_facility(facility_id, 'ai_conversations'));

create policy facility_isolation_select on public.ai_messages for select to authenticated using (private.can_view_facility(facility_id, 'ai_messages'));
create policy facility_isolation_insert on public.ai_messages for insert to authenticated with check (private.can_edit_facility(facility_id, 'ai_messages'));
create policy facility_isolation_update on public.ai_messages for update to authenticated using (private.can_edit_facility(facility_id, 'ai_messages')) with check (private.can_edit_facility(facility_id, 'ai_messages'));
create policy facility_isolation_delete on public.ai_messages for delete to authenticated using (private.can_admin_facility(facility_id, 'ai_messages'));

drop trigger if exists set_updated_at on public.ai_conversations;
create trigger set_updated_at before update on public.ai_conversations for each row execute function public.set_updated_at();
drop trigger if exists audit_facility_change on public.ai_conversations;
create trigger audit_facility_change after insert or update or delete on public.ai_conversations for each row execute function private.audit_facility_change();
drop trigger if exists audit_facility_change on public.ai_messages;
create trigger audit_facility_change after insert or update or delete on public.ai_messages for each row execute function private.audit_facility_change();

insert into public.table_scopes (table_name, scope) values
  ('ai_conversations', 'business'),
  ('ai_messages', 'business')
on conflict (table_name) do update set scope = excluded.scope;

-- ── Platform admin ──────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_platform_admin boolean not null default false;
update public.profiles set is_platform_admin = true where email = 'amoebicextracts@gmail.com';

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- Lets the review queue resolve a submitting facility's name even when
-- the platform admin isn't a member of that facility. Additive: RLS
-- select policies are OR'd together, so this only ever widens visibility
-- beyond the existing facilities_select_member policy, never narrows it.
create policy facilities_select_platform_admin on public.facilities for select to authenticated using (private.is_platform_admin());

-- ── Corrections knowledge base ──────────────────────────────────────────
create table if not exists public.ai_corrections (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('ai-assistant','ops-analyst','cultivation','post-harvest','extraction','facility','all')),
  tags text[] not null default '{}',
  question_context text,
  correction_text text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by_facility_id uuid references public.facilities(id) on delete set null,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  source_message_id uuid references public.ai_messages(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_corrections enable row level security;

-- Approved corrections are readable across every facility (retrieval
-- needs this); a submitter can also see their own pending/rejected
-- rows, and the platform admin sees everything (review queue).
create policy corrections_select on public.ai_corrections for select to authenticated using (
  status = 'approved' or submitted_by_user_id = auth.uid() or private.is_platform_admin()
);
create policy corrections_insert on public.ai_corrections for insert to authenticated with check (true);
-- Only the platform admin can change status (approve/reject) or edit tags.
create policy corrections_update on public.ai_corrections for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy corrections_delete on public.ai_corrections for delete to authenticated using (private.is_platform_admin());

-- Forces status/attribution server-side regardless of what a client
-- sends on insert, so nobody can submit a pre-approved correction.
create or replace function private.stamp_correction_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_platform_admin() then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  new.submitted_by_user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_correction_submission on public.ai_corrections;
create trigger stamp_correction_submission before insert on public.ai_corrections for each row execute function private.stamp_correction_submission();

drop trigger if exists set_updated_at on public.ai_corrections;
create trigger set_updated_at before update on public.ai_corrections for each row execute function public.set_updated_at();

commit;
