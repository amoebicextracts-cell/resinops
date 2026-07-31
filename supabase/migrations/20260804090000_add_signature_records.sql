-- Real e-signatures for GMP closing actions (QC Head batch release, SOP
-- activation, deviation closure). Insert-only, tamper-evident record of
-- who signed, what was signed, and a hash of the frozen PDF snapshot at
-- sign time. All writes go through api/sign-document.js's service-role
-- client (bypasses RLS by design) after re-verifying the signer's
-- password server-side -- only a SELECT policy is needed here.

begin;

create table if not exists public.signature_records (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  signed_by uuid references auth.users(id) on delete set null,
  document_type text not null check (document_type in ('batch_record','sop','deviation')),
  document_id text not null,
  document_label text not null,
  sha256 text not null,
  storage_path text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.signature_records enable row level security;

create policy facility_isolation_select on public.signature_records
  for select to authenticated
  using (private.can_view_facility(facility_id, 'signature_records'));

drop trigger if exists audit_facility_change on public.signature_records;
create trigger audit_facility_change after insert or update or delete on public.signature_records
  for each row execute function private.audit_facility_change();

insert into public.table_scopes (table_name, scope) values ('signature_records', 'compliance')
on conflict (table_name) do update set scope = excluded.scope;

-- Private bucket for frozen signed-PDF snapshots. No storage.objects RLS
-- policy for anon/authenticated -- all Storage access (upload AND
-- signed-URL retrieval) goes through service-role-authenticated Vercel
-- functions that independently verify facility membership first.
insert into storage.buckets (id, name, public) values ('signed-documents', 'signed-documents', false)
on conflict (id) do nothing;

-- SOP versioning lock: once a SOP version has been signed, further edits
-- must create a new row (new version) rather than silently overwriting
-- the signed content -- otherwise the signature is meaningless.
alter table public.gmp_sops add column if not exists locked_at timestamptz;

commit;
