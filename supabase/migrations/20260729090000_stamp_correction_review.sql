-- ============================================================
-- ResinOps — Stamp reviewer attribution on ai_corrections
-- Mirrors stamp_correction_submission (20260728100000): the client
-- can send approve/reject, but who did it and when is always set
-- server-side, never trusted from the request body.
-- ============================================================

begin;

create or replace function private.stamp_correction_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_correction_review on public.ai_corrections;
create trigger stamp_correction_review before update on public.ai_corrections for each row execute function private.stamp_correction_review();

commit;
