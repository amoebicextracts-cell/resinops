-- Document Control: a versioned library of controlled documents (batch
-- record templates, issued batch records, R&D records, forms) with a
-- required changelog on every version. Lives in the GMP Hub "Documents"
-- tab.
--
-- Two tables:
--   controlled_documents          one row per document (a template such as
--                                 "Pre-Roll Batch Record", or an issued
--                                 record such as GCCNY-TCOOK-1GRPR-111826-B01)
--   controlled_document_versions  one row per uploaded version, never
--                                 edited or deleted by clients: version
--                                 label, changelog, file, SHA-256, status
--
-- Files live in the new private "controlled-documents" Storage bucket.
-- Same model as resinex-documents / signed-documents: no storage.objects
-- policy for anon/authenticated; every upload, confirmation and download
-- goes through api/controlled-documents.js (service role), which re-checks
-- facility membership first. Uploads go browser -> Storage directly via a
-- signed upload URL, so scanned batch records aren't capped by Vercel's
-- request-body limit.
--
-- Versions are insert-only from the client's point of view (select policy
-- only, no insert/update/delete grants): a controlled record's history
-- must not be editable. The only status changes (pending -> current, and
-- the previous current -> superseded) happen inside
-- public.promote_controlled_document_version(), executable by service_role
-- only, so "exactly one current version per document" changes atomically.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

create table if not exists public.controlled_documents (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  -- Stable human key, unique per facility: a METRC batch number for an
  -- issued record (GCCNY-TCOOK-1GRPR-111826-B01) or a template code
  -- (TPL-PREROLL-BR) for a template.
  doc_key text not null check (length(trim(doc_key)) between 1 and 120),
  title text not null check (length(trim(title)) between 1 and 200),
  category text not null default 'other'
    check (category in ('template', 'batch_record', 'rd_record', 'sop', 'form', 'other')),
  product_type text check (product_type is null or length(product_type) <= 60),
  -- R&D runs: whether cannabis input was actually dosed. null for
  -- anything that isn't an R&D record.
  rd_dosed boolean,
  status text not null default 'active' check (status in ('active', 'retired')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, doc_key)
);

create table if not exists public.controlled_document_versions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  document_id uuid not null references public.controlled_documents(id) on delete cascade,
  version_label text not null check (version_label ~ '^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$'),
  changelog text not null check (length(trim(changelog)) between 1 and 8000),
  effective_date date,
  -- 'pending' from the moment an upload URL is minted until the API has
  -- verified the object exists in Storage; then 'current'. Uploading a
  -- newer version moves the old current one to 'superseded'.
  status text not null default 'pending' check (status in ('pending', 'current', 'superseded')),
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text,
  file_size bigint,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null default '',
  uploaded_by uuid references auth.users(id) on delete set null,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, version_label)
);

-- Exactly one current version per document.
create unique index if not exists controlled_document_versions_one_current_idx
  on public.controlled_document_versions (document_id) where status = 'current';
create index if not exists controlled_documents_facility_id_idx on public.controlled_documents (facility_id);
create index if not exists controlled_document_versions_facility_id_idx on public.controlled_document_versions (facility_id);
create index if not exists controlled_document_versions_document_id_idx on public.controlled_document_versions (document_id);

-- A version must belong to the same facility as its document, whoever
-- writes it (service role included) -- same cross-facility guard as the
-- resinex document triggers.
create or replace function private.controlled_documents_validate_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.controlled_documents
    where id = new.document_id and facility_id = new.facility_id
  ) then
    raise exception 'document % does not belong to facility %', new.document_id, new.facility_id;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_controlled_document_version on public.controlled_document_versions;
create trigger validate_controlled_document_version
before insert or update on public.controlled_document_versions
for each row execute function private.controlled_documents_validate_version();

-- Atomic promotion: supersede the current version (if any) and make this
-- one current, in one transaction. Service role only.
create or replace function public.promote_controlled_document_version(p_version_id uuid, p_file_size bigint, p_sha256 text)
returns public.controlled_document_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.controlled_document_versions;
begin
  select * into v from public.controlled_document_versions where id = p_version_id for update;
  if not found then
    raise exception 'version % not found', p_version_id;
  end if;
  if v.status <> 'pending' then
    raise exception 'version % is not pending', p_version_id;
  end if;

  update public.controlled_document_versions
     set status = 'superseded'
   where document_id = v.document_id and status = 'current';

  update public.controlled_document_versions
     set status = 'current', file_size = p_file_size, sha256 = p_sha256, promoted_at = now()
   where id = p_version_id
  returning * into v;

  update public.controlled_documents set updated_at = now() where id = v.document_id;
  return v;
end;
$$;

revoke all on function public.promote_controlled_document_version(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.promote_controlled_document_version(uuid, bigint, text) to service_role;

drop trigger if exists set_updated_at on public.controlled_documents;
create trigger set_updated_at
before update on public.controlled_documents
for each row execute function public.handle_updated_at();

alter table public.controlled_documents enable row level security;
alter table public.controlled_document_versions enable row level security;

insert into public.table_scopes (table_name, scope) values
  ('controlled_documents', 'compliance'),
  ('controlled_document_versions', 'compliance')
on conflict (table_name) do update set scope = excluded.scope;

-- Documents: everyone who can view Compliance reads them; editors may
-- rename, annotate or retire one (column-limited grant). Creating
-- documents goes through the API together with the first version, so
-- there's no client insert. No delete: controlled records are retained.
grant select on public.controlled_documents to authenticated;
grant update (title, notes, status, product_type, rd_dosed) on public.controlled_documents to authenticated;

create policy facility_isolation_select on public.controlled_documents
  for select to authenticated
  using (private.can_view_facility(facility_id, 'controlled_documents'));
create policy facility_isolation_update on public.controlled_documents
  for update to authenticated
  using (private.can_edit_facility(facility_id, 'controlled_documents'))
  with check (private.can_edit_facility(facility_id, 'controlled_documents'));

-- Versions: read-only to clients.
grant select on public.controlled_document_versions to authenticated;

create policy facility_isolation_select on public.controlled_document_versions
  for select to authenticated
  using (private.can_view_facility(facility_id, 'controlled_document_versions'));

drop trigger if exists audit_facility_change on public.controlled_documents;
create trigger audit_facility_change
after insert or update or delete on public.controlled_documents
for each row execute function private.audit_facility_change();

drop trigger if exists audit_facility_change on public.controlled_document_versions;
create trigger audit_facility_change
after insert or update or delete on public.controlled_document_versions
for each row execute function private.audit_facility_change();

-- Private bucket. No storage.objects policy for anon/authenticated -- all
-- access goes through api/controlled-documents.js. 25 MB per file covers
-- multi-page scans of signed batch records.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('controlled-documents', 'controlled-documents', false, 26214400,
        array['application/pdf', 'image/png', 'image/jpeg', 'text/csv', 'text/markdown', 'text/plain'])
on conflict (id) do nothing;

commit;
