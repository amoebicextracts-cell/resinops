-- Lets a platform admin (Alex) control which modules a specific client
-- facility sees, without the client being able to change it back
-- themselves. Reuses the existing facilities.product_tier /
-- module_overrides columns and src/lib/moduleVisibility.js's resolution
-- logic entirely -- this only adds a write path a platform admin can use
-- on ANY facility, not just their own.
--
-- private.is_platform_admin() and the facilities_select_platform_admin
-- policy already exist (20260728100000_add_ai_chat_and_corrections.sql),
-- so a platform admin can already read every facility. The missing piece
-- is a write path: facilities_update_admin only lets a facility's own
-- admin/owner update it. Rather than grant platform admins a blanket
-- UPDATE on the whole facilities row (license number, owner contact info,
-- etc.), this is a narrow SECURITY DEFINER function that can only ever
-- touch product_tier/module_overrides, keeping the admin bypass's write
-- surface obvious and auditable.
--
-- Not applied automatically; review and run it through the disposable
-- database job first.

begin;

create or replace function public.set_facility_module_access(
  p_facility_id uuid,
  p_product_tier text,
  p_module_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_platform_admin() then
    raise exception 'Only a platform admin can set a facility''s module access.';
  end if;
  if p_product_tier not in ('home', 'commercial') then
    raise exception 'Invalid product_tier: %', p_product_tier;
  end if;
  update public.facilities
  set product_tier = p_product_tier,
      module_overrides = coalesce(p_module_overrides, '{}'::jsonb)
  where id = p_facility_id;
end;
$function$;

grant execute on function public.set_facility_module_access(uuid, text, jsonb) to authenticated;

commit;
