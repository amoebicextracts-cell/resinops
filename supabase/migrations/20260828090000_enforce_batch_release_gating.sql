-- EU GMP Annex 11 §15 gap (flagged as the top finding in the Annex 11
-- traceability matrix, 2026-08-23): a batch that failed QC (qc_tests.on_hold)
-- or hasn't completed its required sign-offs can still be sold today,
-- because the hold/gate logic in src/SalesOrders.jsx and
-- src/BatchDashboard.jsx is entirely client-side React -- nothing in the
-- database blocks a direct write that creates or edits a sales order
-- against a bad batch.
--
-- sales_orders has no separate line-items table -- lines is a single
-- jsonb array column on the order row (dbTransforms.js SCHEMAS.sales_orders),
-- keyed as {batchId, qty, unitPrice} pointing at production_batches.id.
-- So this can't be a plain FK/CHECK constraint; it has to be a trigger
-- that unnests the jsonb array.
--
-- Two independent checks, both scoped deliberately narrow to avoid
-- surprising or breaking existing order-management flows:
--
--   1. QC hold -- always enforced, unconditionally, matching the app's
--      existing semantics (qc_tests.on_hold already has no facility-level
--      opt-out anywhere in the UI).
--
--   2. Sign-off completeness -- only enforced when the facility has
--      explicitly chosen signoff_enforcement = 'hard_block' AND has an
--      EXPLICIT step_signoff_requirements entry for a step the batch
--      actually has. GMPHub.jsx's client-side getRequiredTiers() also
--      falls back to guessing required tiers from step-name keywords when
--      nothing is explicitly configured -- that heuristic is deliberately
--      NOT reimplemented here. A DB trigger that blocks real sales should
--      only act on what an admin explicitly configured, not a keyword
--      guess; reimplementing a fuzzy heuristic in plpgsql that could drift
--      from the JS version over time is worse than a narrower DB check.
--
-- The trigger only re-validates when NEW.lines actually differs from
-- OLD.lines -- routine order-management edits (setOrderStatus,
-- setOrderPayment, setOrderDueDate in SalesOrders.jsx all spread the
-- existing order and touch unrelated fields) must never be blocked just
-- because a referenced batch's hold status changed after the order was
-- placed. Canceling or annotating an old order should always be possible;
-- only *committing new or changed line content* against a bad batch is
-- blocked.
--
-- check_batch_release_block is exposed in the public schema (not private)
-- and grants EXECUTE to authenticated so it can also be called via RPC
-- from server-side code outside this trigger (e.g. before pushing a real
-- transfer/sale to METRC in api/metrc.js) -- one shared source of truth
-- for "can this batch be released" rather than duplicating the logic.
--
-- Known deliberate scope limit: this does not (and structurally cannot,
-- without a real finished-goods inventory ledger, which doesn't exist
-- yet) enforce sellable-quantity limits -- only the hold/sign-off gates.
-- It also does not close the separate api/metrc.js direct-push bypass --
-- that needs its own dedicated fix after further investigation of the
-- METRC payload shape.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

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
begin
  select pb.facility_id, pb.steps, f.signoff_enforcement, coalesce(f.step_signoff_requirements, '{}'::jsonb)
    into v_facility_id, v_steps, v_signoff_enforcement, v_requirements
    from public.production_batches pb
    join public.facilities f on f.id = pb.facility_id
    where pb.id = p_batch_id;

  if v_facility_id is null then
    return null; -- batch not found -- not this function's job to police that
  end if;

  -- This function is grantable to `authenticated` for RPC use outside the
  -- trigger (see comment above) -- without this check, any authenticated
  -- user could probe another tenant's hold/sign-off status by guessing a
  -- batch id, which is exactly the cross-tenant leak the facility_id-scoped
  -- RLS policies elsewhere in this schema exist to prevent.
  if not private.can_view_facility(v_facility_id, 'production_batches') then
    return null;
  end if;

  if exists (
    select 1 from public.qc_tests
    where production_batch_id = p_batch_id
      and batch_type = 'production'
      and on_hold = true
  ) then
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

revoke all on function public.check_batch_release_block(uuid) from public, anon;
grant execute on function public.check_batch_release_block(uuid) to authenticated;

create or replace function private.enforce_batch_release_on_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_line jsonb;
  v_batch_id uuid;
  v_reason text;
begin
  if tg_op = 'UPDATE' and new.lines is not distinct from old.lines then
    return new;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb))
  loop
    if v_line->>'batchId' is null or v_line->>'batchId' = '' then
      continue;
    end if;

    begin
      v_batch_id := (v_line->>'batchId')::uuid;
    exception when others then
      continue; -- not a real batch id -- don't block on malformed/legacy data
    end;

    v_reason := public.check_batch_release_block(v_batch_id);
    if v_reason is not null then
      raise exception 'Cannot save this sales order: %', v_reason;
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function private.enforce_batch_release_on_sale() from public, anon, authenticated;

drop trigger if exists enforce_batch_release_on_sale on public.sales_orders;
create trigger enforce_batch_release_on_sale
before insert or update on public.sales_orders
for each row execute function private.enforce_batch_release_on_sale();

commit;
