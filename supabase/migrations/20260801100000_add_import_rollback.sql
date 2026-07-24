-- Adds rollback support to import_history. Today an import_history row
-- only records a filename/count summary — there is no way to know which
-- rows a given import actually created, so a bad import (wrong target
-- picked, garbled AI mapping, duplicate re-upload) can't be undone short
-- of manually hunting rows down. This adds enough bookkeeping to let the
-- UI delete exactly the rows one import wrote, once, safely.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.import_history
  add column if not exists table_name text,
  add column if not exists record_ids jsonb,
  add column if not exists rolled_back boolean not null default false,
  add column if not exists rolled_back_at timestamptz;

commit;
