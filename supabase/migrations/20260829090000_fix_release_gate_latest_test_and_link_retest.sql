-- Two related fixes, both prompted by the same real gap: a batch that
-- passes microbial remediation (irradiation) and gets a real retest done
-- had no way to ever become sellable again, because:
--
--   1. check_batch_release_block() (20260828090000) checked whether ANY
--      qc_tests row for a batch had on_hold = true, ever -- not whether
--      the MOST RECENT test says so. A batch's original failed test
--      permanently blocked it even after a passing retest, since the old
--      failing row never stopped existing and was never distinguished
--      from a newer passing one.
--
--   2. Remediation.jsx's "Retested — Passed" status was a bare dropdown
--      value with no real retest data behind it and no linkage back to
--      qc_tests at all -- selecting it never touched the original QC
--      hold, so there was no code path that could have cleared it even
--      if check_batch_release_block were fixed alone.
--
-- Fixing #1 alone without #2 would do nothing (nothing creates a newer
-- passing qc_tests row today). Fixing #2 alone without #1 would create a
-- correct new row that still gets ignored by the EXISTS-any-row check.
-- Both are required together.
--
-- remediation.retest_qc_test_id links a remediation record to the real
-- qc_tests row its retest created (built in the matching Remediation.jsx
-- change), so the UI can show "this remediation's retest COA is X" and
-- an operator can find their way back to it -- including to sign it
-- durably via the existing "Sign & Finalize COA" flow, unchanged, since
-- it's a real qc_tests row like any other.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

alter table public.remediation
  add column if not exists retest_qc_test_id uuid references public.qc_tests(id) on delete set null;

create or replace function public.check_batch_release_block(p_batch_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_facility_id uuid;
  v_steps jsonb;
  v_signoff_enforcement text;
  v_requirements jsonb;
  v_step jsonb;
  v_step_name text;
  v_required_tiers text[];
  v_tier text;
  v_signoff record;
  v_latest_on_hold boolean;
begin
  select pb.facility_id, pb.steps, f.signoff_enforcement, coalesce(f.step_signoff_requirements, '{}'::jsonb)
    into v_facility_id, v_steps, v_signoff_enforcement, v_requirements
    from public.production_batches pb
    join public.facilities f on f.id = pb.facility_id
    where pb.id = p_batch_id;

  if v_facility_id is null then
    return null; -- batch not found -- not this function's job to police that
  end if;

  if not private.can_view_facility(v_facility_id, 'production_batches') then
    return null;
  end if;

  -- Only the MOST RECENT qc_tests row for this batch governs release --
  -- a superseded failing test must not permanently block a batch a later,
  -- real retest has since cleared. Ties (identical created_at) are
  -- vanishingly unlikely given timestamptz precision, so no secondary
  -- tiebreaker is needed.
  select on_hold into v_latest_on_hold
    from public.qc_tests
    where production_batch_id = p_batch_id
      and batch_type = 'production'
    order by created_at desc
    limit 1;

  if v_latest_on_hold then
    return 'Batch is on hold due to a failed QC test result.';
  end if;

  if v_signoff_enforcement = 'hard_block' then
    for v_step in select * from jsonb_array_elements(coalesce(v_steps, '[]'::jsonb))
    loop
      v_step_name := v_step->>'n';
      if v_step_name is null or not (v_requirements ? v_step_name) then
        continue; -- no explicit requirement configured for this step -- not our call to guess one
      end if;

      v_required_tiers := array(select jsonb_array_elements_text(v_requirements->v_step_name));
      if v_required_tiers is null or array_length(v_required_tiers, 1) is null then
        continue;
      end if;

      select * into v_signoff from public.gmp_signoffs
        where batch_type = 'production' and batch_id = p_batch_id and step_name = v_step_name
        limit 1;

      foreach v_tier in array v_required_tiers loop
        if v_signoff is null
          or (v_tier = 'worker' and v_signoff.worker_id is null)
          or (v_tier = 'supervisor' and v_signoff.supervisor_id is null)
          or (v_tier = 'manager' and v_signoff.manager_id is null)
          or (v_tier = 'qc_head' and v_signoff.qc_head_id is null)
        then
          return format('Step "%s" is missing a required %s sign-off.', v_step_name, v_tier);
        end if;
      end loop;
    end loop;
  end if;

  return null;
end;
$function$;

commit;
