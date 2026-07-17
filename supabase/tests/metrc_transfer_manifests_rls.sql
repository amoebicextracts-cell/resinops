begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mt-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('26000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mt-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('36000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mt-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('46000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mt-member-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c5000000-0000-0000-0000-000000000001', 'MT Facility A', '16000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000002', 'MT Facility B', '26000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c5000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c5000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('c5000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000004', 'member', now()),
  ('d5000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.metrc_transfer_manifests (id, facility_id, destination_facility_name)
values
  ('e6000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Facility A Destination'),
  ('f6000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002', 'Facility B Destination');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.metrc_transfer_manifests),
  1::bigint,
  'an owner reads only their facility''s transfer manifests'
);

select results_eq(
  $$with changed as (
    update public.metrc_transfer_manifests
    set status = 'pushed'
    where id = 'e6000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update a transfer manifest in their facility'
);

select results_eq(
  $$with changed as (
    update public.metrc_transfer_manifests
    set status = 'pushed'
    where id = 'f6000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility''s transfer manifest'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'metrc_transfer_manifests'
     and action = 'UPDATE'
     and changed_by = '16000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a transfer manifest update creates an audit record'
);

select set_config('request.jwt.claim.sub', '46000000-0000-0000-0000-000000000004', true);

select results_eq(
  $$with inserted as (
    insert into public.metrc_transfer_manifests (facility_id, destination_facility_name)
    values ('c5000000-0000-0000-0000-000000000001', 'Member-drafted Destination')
    returning id
  ) select count(*)::bigint from inserted$$,
  $$values (1::bigint)$$,
  'a member can draft a new transfer manifest in their facility'
);

select set_config('request.jwt.claim.sub', '36000000-0000-0000-0000-000000000003', true);

-- An INSERT that fails a row-level security WITH CHECK clause raises a hard
-- error rather than silently affecting zero rows, so assert on the error.
select throws_ok(
  $$insert into public.metrc_transfer_manifests (facility_id, destination_facility_name)
    values ('c5000000-0000-0000-0000-000000000001', 'Blocked viewer insert')$$,
  '42501',
  null,
  'a viewer cannot draft a transfer manifest'
);

select * from finish();
rollback;
