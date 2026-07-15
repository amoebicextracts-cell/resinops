begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('50000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('60000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('a0000000-0000-0000-0000-000000000001', 'RLS Facility A', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'RLS Facility B', '20000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', now()),
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('a0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 'admin', now()),
  ('a0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000005', 'manager', now()),
  ('a0000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000006', 'member', now()),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.inventory_items (id, facility_id, name)
values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Facility A inventory'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Facility B inventory');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.facilities),
  1::bigint,
  'an owner reads only their facility'
);

select results_eq(
  $$with changed as (
    update public.facilities
    set facility_name = 'Blocked cross-tenant update'
    where id = 'b0000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility'
);

select results_eq(
  $$with changed as (
    update public.facilities
    set facility_name = 'RLS Facility A Updated'
    where id = 'a0000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update their facility'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'facilities'
     and action = 'UPDATE'
     and changed_by = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  'an authorized change creates an audit record'
);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*) from public.facilities),
  1::bigint,
  'a viewer reads their facility'
);

select results_eq(
  $$with changed as (
    update public.facilities
    set facility_name = 'Blocked viewer update'
    where id = 'a0000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a viewer cannot update facility settings'
);

select results_eq(
  $$with changed as (
    update public.facility_members
    set role = 'admin'
    where user_id = '30000000-0000-0000-0000-000000000003'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a viewer cannot promote their own membership'
);

select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', true);

select results_eq(
  $$with changed as (
    update public.facilities
    set facility_name = 'Admin-updated Facility A'
    where id = 'a0000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an admin can update their facility settings'
);

select results_eq(
  $$with changed as (
    update public.facilities
    set facility_name = 'Blocked admin cross-tenant update'
    where id = 'b0000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an admin cannot update another facility'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000005', true);

select results_eq(
  $$with changed as (
    update public.inventory_items
    set name = 'Manager-updated inventory'
    where id = 'a1000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'a manager can update operational records in their facility'
);

select results_eq(
  $$with changed as (
    update public.facilities
    set facility_name = 'Blocked manager facility update'
    where id = 'a0000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a manager cannot update facility settings'
);

select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000006', true);

select results_eq(
  $$with changed as (
    update public.inventory_items
    set name = 'Member-updated inventory'
    where id = 'a1000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'a member can update operational records in their facility'
);

select results_eq(
  $$with changed as (
    delete from public.inventory_items
    where id = 'a1000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a member cannot delete operational records'
);

select * from finish();
rollback;
