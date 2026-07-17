-- Scheduler.jsx called JSON.stringify(strains) before handing the array to
-- db.grow_spaces.upsert(), even though grow_spaces.strains is jsonb (which
-- the Supabase client already serializes automatically). The result was a
-- jsonb value whose content is itself a JSON *string* of the array, not the
-- array — any code doing space.strains.filter()/.map() on a row saved
-- through that path throws TypeError: strains.filter is not a function.
-- The component bug is fixed separately; this repairs any row that was
-- already saved with the double-encoded shape. Idempotent — only touches
-- rows where the stored value is a JSON string rather than an array/object,
-- so it's a no-op if no such rows exist.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

-- Guarded: the CI fixture's generic table shape doesn't include this
-- column at all, only the real production schema does.
do $repair$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='grow_spaces' and column_name='strains'
  ) then
    update public.grow_spaces
    set strains = (strains #>> '{}')::jsonb
    where jsonb_typeof(strains) = 'string';
  end if;
end
$repair$;

commit;
