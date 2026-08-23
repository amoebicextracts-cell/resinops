-- EU GMP Annex 11 §7/§17 gap: signature_records (20260804090000) already
-- gives batch_record/sop/deviation a durable, cryptographically-hashed,
-- signed-PDF archival trail -- but qc_tests (the actual COA / lab pass-
-- fail data that justifies every release decision) has none. A test
-- result can be edited after the fact with no trace, and nothing ties
-- the "PASS" a QC Head relies on to sign off a batch_record to an
-- immutable snapshot of that lab result at the moment it was relied on.
-- This is the highest-priority remaining durable-archival gap: it's the
-- source data for a release decision, not just the decision itself.
--
-- Same infrastructure as the other three types -- signature_records,
-- the signed-documents bucket, api/sign-document.js -- is fully generic
-- over document_type already, so this only needs the CHECK constraint
-- widened and a lock column + trigger on qc_tests, mirroring
-- gmp_sops.locked_at / lock_closed_deviation's shape.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

alter table public.qc_tests add column if not exists locked_at timestamptz;

alter table public.signature_records drop constraint if exists signature_records_document_type_check;
alter table public.signature_records add constraint signature_records_document_type_check
  check (document_type in ('batch_record', 'sop', 'deviation', 'qc_test'));

-- Locks a signed QC test's result data. Unlike lock_closed_deviation's
-- explicit field list, qc_tests has ~50 result columns (every
-- cannabinoid/terpene/microbial panel value), so this diffs the whole
-- row instead of naming each one -- any change to a real data column
-- while locked is blocked; locked_at/updated_at are excluded from the
-- diff since setting locked_at is exactly the update this trigger must
-- itself allow through.
create or replace function private.lock_finalized_qc_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  ignore_keys text[] := array['locked_at', 'updated_at'];
begin
  if old.locked_at is not null then
    if (to_jsonb(new) - ignore_keys) is distinct from (to_jsonb(old) - ignore_keys) then
      raise exception 'Cannot edit a signed QC test result -- results are locked once signed';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.lock_finalized_qc_test() from public, anon, authenticated;

drop trigger if exists lock_finalized_qc_test on public.qc_tests;
create trigger lock_finalized_qc_test
before update on public.qc_tests
for each row execute function private.lock_finalized_qc_test();

commit;
