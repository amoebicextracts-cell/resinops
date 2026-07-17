begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ph-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('25000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ph-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('35000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ph-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('45000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ph-member-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c4000000-0000-0000-0000-000000000001', 'PH Facility A', '15000000-0000-0000-0000-000000000001'),
  ('d4000000-0000-0000-0000-000000000002', 'PH Facility B', '25000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c4000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c4000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('c4000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000004', 'member', now()),
  ('d4000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', 'owner', now());

insert into public.pheno_hunts (id, facility_id, strain_name)
values
  ('e5000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'Facility A Cross'),
  ('f5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002', 'Facility B Cross');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.pheno_hunts),
  1::bigint,
  'an owner reads only their facility''s pheno hunts'
);

select results_eq(
  $$with changed as (
    update public.pheno_hunts
    set seeds = '[{"phenoNum":"1","sex":"female"}]'::jsonb
    where id = 'e5000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can update a pheno hunt''s seeds in their facility'
);

select results_eq(
  $$with changed as (
    update public.pheno_hunts
    set seeds = '[{"phenoNum":"1","sex":"female"}]'::jsonb
    where id = 'f5000000-0000-0000-0000-000000000002'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot update another facility''s pheno hunt'
);

select is(
  (select count(*) from public.audit_logs
   where table_name = 'pheno_hunts'
     and action = 'UPDATE'
     and changed_by = '15000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a pheno hunt update creates an audit record'
);

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000004', true);

select results_eq(
  $$with inserted as (
    insert into public.pheno_hunts (facility_id, strain_name)
    values ('c4000000-0000-0000-0000-000000000001', 'Member-started Cross')
    returning id
  ) select count(*)::bigint from inserted$$,
  $$values (1::bigint)$$,
  'a member can start a new pheno hunt in their facility'
);

select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000003', true);

-- An INSERT that fails a row-level security WITH CHECK clause raises a hard
-- error rather than silently affecting zero rows, so assert on the error.
select throws_ok(
  $$insert into public.pheno_hunts (facility_id, strain_name)
    values ('c4000000-0000-0000-0000-000000000001', 'Blocked viewer insert')$$,
  '42501',
  null,
  'a viewer cannot start a pheno hunt'
);

select * from finish();
rollback;
