-- ResinOps launch foundation: strict facility isolation, roles, and audit history.
-- This migration adopts the existing production schema. It is intentionally not
-- applied automatically; review and test it on a Supabase branch first.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- API credentials belong in server-only environment variables, never in rows
-- readable by browser clients. Production currently contains no values here.
alter table public.facilities
  drop column if exists metrc_api_key,
  drop column if exists flourish_api_key,
  drop column if exists biotrack_api_key,
  drop column if exists kaycha_api_key,
  drop column if exists green_analytics_api_key,
  drop column if exists distru_api_key;

alter table public.facilities
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.facilities as facility
set created_by = (
  select member.user_id
  from public.facility_members as member
  where member.facility_id = facility.id
    and member.role = 'owner'
  order by member.created_at
  limit 1
)
where facility.created_by is null;

alter table public.facilities
  alter column created_by set default auth.uid();

alter table public.facility_members
  alter column role set default 'viewer';

alter table public.facility_members
  drop constraint if exists facility_members_role_check;

alter table public.facility_members
  add constraint facility_members_role_check
  check (role in ('owner', 'admin', 'manager', 'member', 'viewer'));

create unique index if not exists facility_members_facility_user_key
  on public.facility_members (facility_id, user_id);

create index if not exists facility_members_user_facility_idx
  on public.facility_members (user_id, facility_id)
  where accepted_at is not null;

-- Remove every existing policy on tenant-owned tables. Several production
-- tables currently have permissive USING (true) policies that override their
-- facility-scoped policies because permissive policies are combined with OR.
do $drop_policies$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'facilities', 'facility_members', 'profiles',
        'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
        'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
        'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
        'import_history', 'inventory_items', 'labor_types', 'loto_log',
        'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
        'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
        'vendors', 'work_orders'
      ])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$drop_policies$;

drop function if exists public.is_facility_member(uuid);
drop function if exists public.is_facility_owner_or_admin(uuid);

create or replace function private.facility_role(facility uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select member.role
  from public.facility_members as member
  where member.facility_id = facility
    and member.user_id = (select auth.uid())
    and member.accepted_at is not null
  limit 1
$function$;

create or replace function private.is_facility_member(facility uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and private.facility_role(facility) is not null
$function$;

create or replace function private.can_edit_facility(facility uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.facility_role(facility) in ('owner', 'admin', 'manager', 'member')
$function$;

create or replace function private.can_admin_facility(facility uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.facility_role(facility) in ('owner', 'admin')
$function$;

create or replace function private.is_facility_owner(facility uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.facility_role(facility) = 'owner'
$function$;

create or replace function private.can_bootstrap_owner(
  facility uuid,
  candidate_user uuid,
  candidate_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select candidate_user = (select auth.uid())
    and candidate_role = 'owner'
    and exists (
      select 1
      from public.facilities as target
      where target.id = facility
        and target.created_by = (select auth.uid())
    )
    and not exists (
      select 1
      from public.facility_members as existing
      where existing.facility_id = facility
    )
$function$;

create or replace function private.can_bootstrap_facility(facility uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.facilities as target
    where target.id = facility
      and target.created_by = (select auth.uid())
      and not exists (
        select 1
        from public.facility_members as existing
        where existing.facility_id = target.id
      )
  )
$function$;

revoke all on function private.facility_role(uuid) from public, anon;
revoke all on function private.is_facility_member(uuid) from public, anon;
revoke all on function private.can_edit_facility(uuid) from public, anon;
revoke all on function private.can_admin_facility(uuid) from public, anon;
revoke all on function private.is_facility_owner(uuid) from public, anon;
revoke all on function private.can_bootstrap_owner(uuid, uuid, text) from public, anon;
revoke all on function private.can_bootstrap_facility(uuid) from public, anon;
grant execute on function private.facility_role(uuid) to authenticated;
grant execute on function private.is_facility_member(uuid) to authenticated;
grant execute on function private.can_edit_facility(uuid) to authenticated;
grant execute on function private.can_admin_facility(uuid) to authenticated;
grant execute on function private.is_facility_owner(uuid) to authenticated;
grant execute on function private.can_bootstrap_owner(uuid, uuid, text) to authenticated;
grant execute on function private.can_bootstrap_facility(uuid) to authenticated;

-- The auth trigger remains SECURITY DEFINER because auth.users is not writable
-- by application users. Lock down its search path and remove direct RPC access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Facility and membership policies are special because they establish the
-- tenant boundary used by every other table.
alter table public.facilities enable row level security;
alter table public.facility_members enable row level security;
alter table public.profiles enable row level security;

create policy facilities_select_member
on public.facilities for select
to authenticated
using (
  private.is_facility_member(id)
  or private.can_bootstrap_facility(id)
);

create policy facilities_insert_creator
on public.facilities for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy facilities_update_admin
on public.facilities for update
to authenticated
using (private.can_admin_facility(id))
with check (private.can_admin_facility(id));

create policy facility_members_select_member
on public.facility_members for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_facility_member(facility_id)
);

create policy facility_members_insert_admin_or_creator
on public.facility_members for insert
to authenticated
with check (
  private.is_facility_owner(facility_id)
  or (
    private.can_admin_facility(facility_id)
    and role <> 'owner'
  )
  or private.can_bootstrap_owner(facility_id, user_id, role)
);

create policy facility_members_update_admin
on public.facility_members for update
to authenticated
using (
  private.is_facility_owner(facility_id)
  or (
    private.can_admin_facility(facility_id)
    and role <> 'owner'
  )
)
with check (
  private.is_facility_owner(facility_id)
  or (
    private.can_admin_facility(facility_id)
    and role <> 'owner'
  )
);

create policy facility_members_delete_admin
on public.facility_members for delete
to authenticated
using (
  private.is_facility_owner(facility_id)
  or (
    private.can_admin_facility(facility_id)
    and role <> 'owner'
  )
);

create policy profiles_select_self
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_insert_self
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_self
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Apply a single predictable policy set to every facility-owned business table.
do $tenant_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
    'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
    'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
    'import_history', 'inventory_items', 'labor_types', 'loto_log',
    'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
    'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
    'vendors', 'work_orders'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy facility_isolation_select on public.%I for select to authenticated using (private.is_facility_member(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_insert on public.%I for insert to authenticated with check (private.can_edit_facility(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_update on public.%I for update to authenticated using (private.can_edit_facility(facility_id)) with check (private.can_edit_facility(facility_id))',
      table_name
    );
    execute format(
      'create policy facility_isolation_delete on public.%I for delete to authenticated using (private.can_admin_facility(facility_id))',
      table_name
    );
  end loop;
end
$tenant_policies$;

-- Prevent deletion or demotion of the last accepted owner of a facility.
create or replace function private.protect_facility_owners()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  removes_owner boolean;
  remaining_owners integer;
begin
  if tg_op = 'DELETE' then
    removes_owner := old.role = 'owner' and old.accepted_at is not null;
  else
    removes_owner := old.role = 'owner'
      and old.accepted_at is not null
      and (
        new.role <> 'owner'
        or new.accepted_at is null
        or new.facility_id <> old.facility_id
      );
  end if;

  if removes_owner then
    select count(*)
    into remaining_owners
    from public.facility_members as member
    where member.facility_id = old.facility_id
      and member.role = 'owner'
      and member.accepted_at is not null
      and member.id <> old.id;

    if remaining_owners = 0 then
      raise exception 'A facility must retain at least one accepted owner';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function private.protect_facility_owners() from public, anon, authenticated;

drop trigger if exists protect_facility_owners on public.facility_members;
create trigger protect_facility_owners
before update or delete on public.facility_members
for each row execute function private.protect_facility_owners();

-- Immutable audit history for facility-scoped records. Direct client writes are
-- not granted; rows are written only by the trigger function.
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  facility_id uuid not null,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists audit_logs_facility_changed_at_idx
  on public.audit_logs (facility_id, changed_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create policy audit_logs_select_member
on public.audit_logs for select
to authenticated
using (private.is_facility_member(facility_id));

create or replace function private.redact_audit_data(payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select case when payload is null then null else payload - array[
    'metrc_api_key', 'flourish_api_key', 'biotrack_api_key',
    'kaycha_api_key', 'green_analytics_api_key', 'distru_api_key'
  ] end
$function$;

create or replace function private.audit_facility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_payload jsonb;
  new_payload jsonb;
  audit_facility_id uuid;
  audit_record_id text;
begin
  if tg_op <> 'INSERT' then old_payload := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_payload := to_jsonb(new); end if;

  if tg_table_name = 'facilities' then
    audit_facility_id := coalesce(new_payload ->> 'id', old_payload ->> 'id')::uuid;
  else
    audit_facility_id := coalesce(new_payload ->> 'facility_id', old_payload ->> 'facility_id')::uuid;
  end if;
  audit_record_id := coalesce(new_payload ->> 'id', old_payload ->> 'id');

  insert into public.audit_logs (
    facility_id, table_name, record_id, action,
    old_data, new_data, changed_by
  ) values (
    audit_facility_id, tg_table_name, audit_record_id, tg_op,
    private.redact_audit_data(old_payload),
    private.redact_audit_data(new_payload),
    (select auth.uid())
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function private.redact_audit_data(jsonb) from public, anon, authenticated;
revoke all on function private.audit_facility_change() from public, anon, authenticated;

do $audit_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'facilities', 'facility_members',
    'boms', 'clone_schedules', 'cultivation_inputs', 'employees',
    'equipment', 'facility_map_spaces', 'gmp_deviations', 'gmp_shifts',
    'gmp_sops', 'grow_rooms', 'grow_spaces', 'harvest_batches',
    'import_history', 'inventory_items', 'labor_types', 'loto_log',
    'mother_plants', 'production_batches', 'purchase_orders', 'qc_tests',
    'sales_orders', 'skus', 'spray_log', 'strains', 'tc_vessels',
    'vendors', 'work_orders'
  ]
  loop
    execute format('drop trigger if exists audit_facility_change on public.%I', table_name);
    execute format(
      'create trigger audit_facility_change after insert or update or delete on public.%I for each row execute function private.audit_facility_change()',
      table_name
    );
  end loop;
end
$audit_triggers$;

commit;
