begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eq-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('24000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eq-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('34000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'eq-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c3000000-0000-0000-0000-000000000001', 'EQ Facility A', '14000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002', 'EQ Facility B', '24000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c3000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c3000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('d3000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.equipment (id, facility_id, name)
values
  ('e4000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Facility A Extractor'),
  ('f4000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000002', 'Facility B Extractor');

insert into public.equipment_service_log (id, facility_id, equipment_id, service_type)
values
  ('a7000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'pm'),
  ('b7000000-0000-0000-0000-000000000002', 'd3000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000002', 'pm');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.equipment_service_log),
  1::bigint,
  'an owner reads only their facility''s equipment service log'
);

select results_eq(
  $$with changed as (
    update public.equipment_service_log
    set notes = 'checked belts'
    where id = 'a7000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update a service log entry in their facility'
);

select results_eq(
  $$with changed as (
    update public.equipment_service_log
    set notes = 'checked belts'
    where id = 'b7000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility''s service log entry'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'equipment_service_log'
     and action = 'UPDATE'
     and changed_by = '14000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a service log update creates an audit record'
);

select results_eq(
  $$with inserted as (
    insert into public.equipment_service_log (facility_id, equipment_id, service_type)
    values ('c3000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'repair')
    returning id
  ) select count(*)::bigint from inserted$$,
  $$values (1::bigint)$$,
  'an owner can log a new service entry in their facility'
);

select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000003', true);

-- An INSERT that fails a row-level security WITH CHECK clause raises a hard
-- error rather than silently affecting zero rows, so assert on the error.
select throws_ok(
  $$insert into public.equipment_service_log (facility_id, equipment_id, service_type)
    values ('c3000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'repair')$$,
  '42501',
  null,
  'a viewer cannot log a service entry'
);

select * from finish();
rollback;
