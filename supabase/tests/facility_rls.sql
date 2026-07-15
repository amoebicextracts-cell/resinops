begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('a0000000-0000-0000-0000-000000000001', 'RLS Facility A', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'RLS Facility B', '20000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', now()),
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner', now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.facilities),
  1::bigint,
  'an owner reads only their facility'
);

select is(
  (with changed as (
    update public.facilities
    set facility_name = 'Blocked cross-tenant update'
    where id = 'b0000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'an owner cannot update another facility'
);

select is(
  (with changed as (
    update public.facilities
    set facility_name = 'RLS Facility A Updated'
    where id = 'a0000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*) from changed),
  1::bigint,
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

select is(
  (with changed as (
    update public.facilities
    set facility_name = 'Blocked viewer update'
    where id = 'a0000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'a viewer cannot update facility settings'
);

select is(
  (with changed as (
    update public.facility_members
    set role = 'admin'
    where user_id = '30000000-0000-0000-0000-000000000003'
    returning id
  ) select count(*) from changed),
  0::bigint,
  'a viewer cannot promote their own membership'
);

select * from finish();
rollback;
