begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('13000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('23000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('33000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('43000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tc-member-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c2000000-0000-0000-0000-000000000001', 'TC Facility A', '13000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000002', 'TC Facility B', '23000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c2000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c2000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('c2000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000004', 'member', now()),
  ('d2000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.tc_accessions (id, facility_id, strain_name, source_type)
values
  ('e3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Facility A Kush', 'mother_plant'),
  ('f3000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'Facility B OG', 'mother_plant');

insert into public.tc_formulas (id, facility_id, name, stage)
values
  ('a6000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Facility A Formula', 'stage1'),
  ('b6000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 'Facility B Formula', 'stage1');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.tc_accessions),
  1::bigint,
  'an owner reads only their facility''s TC accessions'
);

select is(
  (select count(*) from public.tc_formulas),
  1::bigint,
  'an owner reads only their facility''s TC media formulas'
);

select results_eq(
  $$with changed as (
    update public.tc_accessions
    set hlv_status = 'cleared'
    where id = 'e3000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update a TC accession in their facility'
);

select results_eq(
  $$with changed as (
    update public.tc_accessions
    set hlv_status = 'cleared'
    where id = 'f3000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility''s TC accession'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'tc_accessions'
     and action = 'UPDATE'
     and changed_by = '13000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a TC accession update creates an audit record'
);

select set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000004', true);

select results_eq(
  $$with inserted as (
    insert into public.tc_formulas (facility_id, name, stage)
    values ('c2000000-0000-0000-0000-000000000001', 'Member Formula', 'stage2')
    returning id
  ) select count(*)::bigint from inserted$$,
  $$values (1::bigint)$$,
  'a member can create a TC media formula in their facility'
);

select set_config('request.jwt.claim.sub', '33000000-0000-0000-0000-000000000003', true);

-- An INSERT that fails a row-level security WITH CHECK clause raises a hard
-- error rather than silently affecting zero rows, so assert on the error.
select throws_ok(
  $$insert into public.tc_accessions (facility_id, strain_name, source_type)
    values ('c2000000-0000-0000-0000-000000000001', 'Blocked viewer insert', 'mother_plant')$$,
  '42501',
  null,
  'a viewer cannot create a TC accession'
);

select * from finish();
rollback;
