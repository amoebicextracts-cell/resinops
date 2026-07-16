begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('21000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('31000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('41000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rs-member-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c0000000-0000-0000-0000-000000000001', 'RS Facility A', '11000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'RS Facility B', '21000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c0000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c0000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('c0000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000004', 'member', now()),
  ('d0000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.remediation (id, facility_id, source_type, strain_name, status)
values
  ('e1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'harvest', 'Facility A Kush', 'flagged'),
  ('f1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'harvest', 'Facility B OG', 'flagged');

insert into public.gmp_signoffs (id, facility_id, batch_type, step_name)
values
  ('a2000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'harvest', 'Facility A trim'),
  ('b2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'harvest', 'Facility B trim');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.remediation),
  1::bigint,
  'an owner reads only their facility''s remediation records'
);

select is(
  (select count(*) from public.gmp_signoffs),
  1::bigint,
  'an owner reads only their facility''s sign-offs'
);

select results_eq(
  $$with changed as (
    update public.remediation
    set status = 'passed'
    where id = 'e1000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update a remediation record in their facility'
);

select results_eq(
  $$with changed as (
    update public.remediation
    set status = 'passed'
    where id = 'f1000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility''s remediation record'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'remediation'
     and action = 'UPDATE'
     and changed_by = '11000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a remediation update creates an audit record'
);

select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000004', true);

select results_eq(
  $$with inserted as (
    insert into public.gmp_signoffs (facility_id, batch_type, step_name)
    values ('c0000000-0000-0000-0000-000000000001', 'harvest', 'Member-recorded step')
    returning id
  ) select count(*)::bigint from inserted$$,
  $$values (1::bigint)$$,
  'a member can record a sign-off in their facility'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000003', true);

-- An INSERT that fails a row-level security WITH CHECK clause raises a hard
-- error (there's no ambiguous "which rows" to just silently return zero of,
-- unlike UPDATE/DELETE with a WHERE clause), so assert on the error instead.
select throws_ok(
  $$insert into public.remediation (facility_id, source_type, strain_name)
    values ('c0000000-0000-0000-0000-000000000001', 'harvest', 'Blocked viewer insert')$$,
  '42501',
  null,
  'a viewer cannot create a remediation record'
);

select results_eq(
  $$with changed as (
    delete from public.gmp_signoffs
    where id = 'a2000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a viewer cannot delete a sign-off'
);

select * from finish();
rollback;
