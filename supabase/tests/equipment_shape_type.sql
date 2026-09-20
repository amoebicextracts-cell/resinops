begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shape-owner@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values ('c5000000-0000-0000-0000-000000000001', 'Shape Facility', '15000000-0000-0000-0000-000000000001');

select has_column('public', 'equipment', 'shape_type', 'equipment has a shape_type column');

select lives_ok(
  $$insert into public.equipment (id, facility_id, name, shape_type)
    values ('e5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Solvent Tank', 'tank')$$,
  'a known shape_type is accepted'
);

select lives_ok(
  $$insert into public.equipment (id, facility_id, name)
    values ('e5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'Unpinned Unit')$$,
  'shape_type is optional'
);

select is(
  (select shape_type from public.equipment where id = 'e5000000-0000-0000-0000-000000000002'),
  null::text,
  'shape_type defaults to null (auto)'
);

select throws_ok(
  $$insert into public.equipment (id, facility_id, name, shape_type)
    values ('e5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 'Bad Shape', 'spaceship')$$,
  '23514',
  null,
  'an unknown shape_type is rejected by the check constraint'
);

select * from finish();
rollback;
