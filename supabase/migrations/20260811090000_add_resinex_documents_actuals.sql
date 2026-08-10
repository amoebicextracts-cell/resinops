-- ResinEx phase 5: document archive + actuals tracking. Lets a facility
-- log real quotes/blueprints/schematics against a capex project, and
-- track real ("actual") costs against the original estimate as bids come
-- in. Files themselves live in the new private "resinex-documents"
-- Storage bucket, uploaded via a direct signed-upload-URL flow (not
-- proxied through a Vercel function body, unlike the signed-documents/
-- e-signature pattern -- that one caps around 3-4MB, too small for real
-- scanned blueprints/vendor quotes). No storage.objects RLS policy here
-- either, matching signed-documents' precedent: every Storage read/write/
-- delete goes through a dedicated Vercel function
-- (api/resinex-create-upload-url.js, api/resinex-confirm-document.js,
-- api/resinex-get-document-url.js, api/resinex-delete-document.js) that
-- independently re-verifies facility membership first.
--
-- RLS on both tables only checks the row's own submitted facility_id --
-- it doesn't verify that project_id (or, for actuals, linked_document_id)
-- actually belongs to that same facility. An editor authorized for their
-- own facility could otherwise submit a project_id/document_id borrowed
-- from another facility, creating a cross-facility relationship (and,
-- since project_id cascades on delete, one facility's project deletion
-- could cascade into another facility's document/actuals rows). The two
-- trigger functions below close that gap at the database layer, so it
-- holds regardless of whether the write comes through client RLS or a
-- service-role API function.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.resinex_project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.resinex_projects(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  category text not null default 'other'
    check (category in ('quote', 'blueprint', 'schematic', 'invoice', 'other')),
  -- Row is written as 'pending' the moment an upload URL is minted --
  -- before the browser has even started the direct-to-Storage upload --
  -- and flipped to 'confirmed' only after resinex-confirm-document.js
  -- verifies the object actually exists in Storage. An upload that never
  -- gets confirmed (browser closed, connectivity lost) leaves a
  -- queryable, discoverable 'pending' row instead of a completely
  -- untracked Storage object. Deleting a document (resinex-delete-
  -- document.js) removes the metadata row before the Storage object, so
  -- a failure on the Storage side after that point similarly leaves an
  -- orphaned object with no row, not a broken confirmed document. Both
  -- failure modes were flagged across several rounds of Greptile review
  -- on PR #46 and are accepted as the same residual risk class:
  -- harmless, invisible orphaned Storage objects that still need a
  -- periodic reconciliation job to actually free storage (not built in
  -- this phase) -- but neither can leave a user-visible document pointing
  -- at nothing.
  status text not null default 'pending'
    check (status in ('pending', 'confirmed')),
  storage_path text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resinex_project_actuals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.resinex_projects(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  description text not null,
  category text not null default 'other'
    check (category in ('equipment', 'labor', 'permit', 'construction', 'other')),
  estimated_amount numeric,
  actual_amount numeric,
  status text not null default 'estimated'
    check (status in ('estimated', 'quoted', 'confirmed', 'paid')),
  linked_document_id uuid references public.resinex_project_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.resinex_validate_document_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.resinex_projects
    where id = new.project_id and facility_id = new.facility_id
  ) then
    raise exception 'project % does not belong to facility %', new.project_id, new.facility_id;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_document_project on public.resinex_project_documents;
create trigger validate_document_project
before insert or update on public.resinex_project_documents
for each row execute function private.resinex_validate_document_project();

create or replace function private.resinex_validate_actual_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.resinex_projects
    where id = new.project_id and facility_id = new.facility_id
  ) then
    raise exception 'project % does not belong to facility %', new.project_id, new.facility_id;
  end if;
  -- status = 'confirmed' matters here, not just facility/project match --
  -- otherwise a pending (possibly abandoned) upload could be linked as an
  -- actual's attachment even though the app's UI only ever offers
  -- confirmed documents in that dropdown. The UI filter alone isn't a
  -- real boundary; a direct insert/update could still submit a pending
  -- document_id without this check.
  if new.linked_document_id is not null and not exists (
    select 1 from public.resinex_project_documents
    where id = new.linked_document_id
      and facility_id = new.facility_id
      and project_id = new.project_id
      and status = 'confirmed'
  ) then
    raise exception 'linked document % is not a confirmed document in project %/facility %', new.linked_document_id, new.project_id, new.facility_id;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_actual_refs on public.resinex_project_actuals;
create trigger validate_actual_refs
before insert or update on public.resinex_project_actuals
for each row execute function private.resinex_validate_actual_refs();

grant select, insert, update, delete on public.resinex_project_documents to authenticated;
grant select, insert, update, delete on public.resinex_project_actuals to authenticated;

create index if not exists resinex_project_documents_facility_id_idx on public.resinex_project_documents (facility_id);
create index if not exists resinex_project_documents_project_id_idx on public.resinex_project_documents (project_id);
create index if not exists resinex_project_actuals_facility_id_idx on public.resinex_project_actuals (facility_id);
create index if not exists resinex_project_actuals_project_id_idx on public.resinex_project_actuals (project_id);

drop trigger if exists set_updated_at on public.resinex_project_documents;
create trigger set_updated_at
before update on public.resinex_project_documents
for each row execute function public.handle_updated_at();

drop trigger if exists set_updated_at on public.resinex_project_actuals;
create trigger set_updated_at
before update on public.resinex_project_actuals
for each row execute function public.handle_updated_at();

alter table public.resinex_project_documents enable row level security;
alter table public.resinex_project_actuals enable row level security;

create policy facility_isolation_select on public.resinex_project_documents
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_project_documents
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_project_documents
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_project_documents
  for delete to authenticated using (private.can_admin_facility(facility_id));

create policy facility_isolation_select on public.resinex_project_actuals
  for select to authenticated using (private.is_facility_member(facility_id));
create policy facility_isolation_insert on public.resinex_project_actuals
  for insert to authenticated with check (private.can_edit_facility(facility_id));
create policy facility_isolation_update on public.resinex_project_actuals
  for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id));
create policy facility_isolation_delete on public.resinex_project_actuals
  for delete to authenticated using (private.can_admin_facility(facility_id));

drop trigger if exists audit_facility_change on public.resinex_project_documents;
create trigger audit_facility_change
after insert or update or delete on public.resinex_project_documents
for each row execute function private.audit_facility_change();

drop trigger if exists audit_facility_change on public.resinex_project_actuals;
create trigger audit_facility_change
after insert or update or delete on public.resinex_project_actuals
for each row execute function private.audit_facility_change();

insert into storage.buckets (id, name, public)
values ('resinex-documents', 'resinex-documents', false)
on conflict (id) do nothing;

commit;
