begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('12000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cc-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('22000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cc-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('32000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cc-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('42000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cc-member-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c1000000-0000-0000-0000-000000000001', 'CC Facility A', '12000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'CC Facility B', '22000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c1000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c1000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('c1000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000004', 'member', now()),
  ('d1000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.production_batches (id, facility_id, name)
values
  ('e2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Facility A Batch'),
  ('f2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'Facility B Batch');

insert into public.grow_spaces (id, facility_id, name)
values
  ('a3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Facility A Space'),
  ('b3000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'Facility B Space'),
  ('a3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Facility A Space 2');

insert into public.cogs_records (id, facility_id, production_batch_id, test_fee)
values
  ('a4000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 350),
  ('b4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 350);

insert into public.cultivation_costs (id, facility_id, grow_space_id, media)
values
  ('a5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 100),
  ('b5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000002', 100);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.cogs_records),
  1::bigint,
  'an owner reads only their facility''s COGS records'
);

select is(
  (select count(*) from public.cultivation_costs),
  1::bigint,
  'an owner reads only their facility''s cultivation costs'
);

select results_eq(
  $$with changed as (
    update public.cogs_records
    set units_sold = 50
    where id = 'a4000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update a COGS record in their facility'
);

select results_eq(
  $$with changed as (
    update public.cogs_records
    set units_sold = 50
    where id = 'b4000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility''s COGS record'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'cogs_records'
     and action = 'UPDATE'
     and changed_by = '12000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a COGS record update creates an audit record'
);

select set_config('request.jwt.claim.sub', '42000000-0000-0000-0000-000000000004', true);

select results_eq(
  $$with inserted as (
    insert into public.cultivation_costs (facility_id, grow_space_id, nutrients)
    values ('c1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 25)
    returning id
  ) select count(*)::bigint from inserted$$,
  $$values (1::bigint)$$,
  'a member can record cultivation costs in their facility'
);

select set_config('request.jwt.claim.sub', '32000000-0000-0000-0000-000000000003', true);

-- An INSERT that fails a row-level security WITH CHECK clause raises a hard
-- error rather than silently affecting zero rows, so assert on the error.
select throws_ok(
  $$insert into public.cogs_records (facility_id, production_batch_id, test_fee)
    values ('c1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 999)$$,
  '42501',
  null,
  'a viewer cannot create a COGS record'
);

select * from finish();
rollback;
