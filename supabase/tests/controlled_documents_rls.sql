begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dc-owner-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('25000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dc-owner-b@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('35000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dc-viewer-a@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('45000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dc-scoped-a@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c5000000-0000-0000-0000-000000000001', 'DC Facility A', '15000000-0000-0000-0000-000000000001'),
  ('d5000000-0000-0000-0000-000000000002', 'DC Facility B', '25000000-0000-0000-0000-000000000002');

insert into public.facility_members (facility_id, user_id, role, accepted_at)
values
  ('c5000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'owner', now()),
  ('c5000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000003', 'viewer', now()),
  ('d5000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', 'owner', now());

-- A manager whose Compliance section is switched off.
insert into public.facility_members (facility_id, user_id, role, scope_roles, accepted_at)
values ('c5000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000004', 'manager', '{"compliance": "none"}', now());

select ok(has_table_privilege('service_role', 'public.controlled_documents', 'INSERT'), 'the service-role API can create documents');
select ok(has_table_privilege('service_role', 'public.controlled_document_versions', 'INSERT'), 'the service-role API can create versions');

-- Seeded as the service role would (the API writes these).
insert into public.controlled_documents (id, facility_id, doc_key, title, category)
values
  ('e5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'GCCNY-TCOOK-1GRPR-111826-B01', 'Tropicana Cookies 1 g Pre-Roll', 'batch_record'),
  ('f5000000-0000-0000-0000-000000000002', 'd5000000-0000-0000-0000-000000000002', 'B-RECORD', 'Facility B record', 'batch_record');

insert into public.controlled_document_versions (id, facility_id, document_id, version_label, changelog, status, file_name, storage_path)
values
  ('a8000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '1.0', 'Initial version.', 'current', 'v10.pdf', 'p/1'),
  ('a8000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '1.1', 'Added sifter section.', 'pending', 'v11.pdf', 'p/2'),
  ('b8000000-0000-0000-0000-000000000003', 'd5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000002', '1.0', 'Initial version.', 'current', 'b.pdf', 'p/3');

-- Promotion supersedes the old current version atomically.
select public.promote_controlled_document_version('a8000000-0000-0000-0000-000000000002', 1234, repeat('a', 64));
select results_eq(
  $$select version_label, status from public.controlled_document_versions
    where document_id = 'e5000000-0000-0000-0000-000000000001' order by version_label$$,
  $$values ('1.0', 'superseded'), ('1.1', 'current')$$,
  'promoting a version supersedes the previous current one'
);

-- A version can't point at another facility's document.
select throws_ok(
  $$insert into public.controlled_document_versions (facility_id, document_id, version_label, changelog, file_name)
    values ('c5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000002', '2.0', 'x', 'x.pdf')$$,
  'P0001',
  null,
  'a version cannot attach to another facility''s document'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);

select is((select count(*) from public.controlled_documents), 1::bigint, 'an owner sees only their facility''s documents');
select is(public.controlled_documents_access('c5000000-0000-0000-0000-000000000001'), 'edit', 'an owner gets edit access');
select is((select count(*) from public.controlled_document_versions), 2::bigint, 'an owner sees only their facility''s versions');

select throws_ok(
  $$insert into public.controlled_document_versions (facility_id, document_id, version_label, changelog, file_name)
    values ('c5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', '9.0', 'forged', 'x.pdf')$$,
  '42501', null,
  'clients cannot insert versions directly'
);

select throws_ok(
  $$update public.controlled_document_versions set changelog = 'rewritten history' where id = 'a8000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'clients cannot edit a version''s changelog'
);

select throws_ok(
  $$select public.promote_controlled_document_version('a8000000-0000-0000-0000-000000000001', 1, repeat('b', 64))$$,
  '42501', null,
  'clients cannot call the promotion function'
);

select results_eq(
  $$with changed as (
    update public.controlled_documents set status = 'retired'
    where id = 'e5000000-0000-0000-0000-000000000001' returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can retire their facility''s document'
);

select results_eq(
  $$with changed as (
    update public.controlled_documents set status = 'retired'
    where id = 'f5000000-0000-0000-0000-000000000002' returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner cannot touch another facility''s document'
);

select set_config('request.jwt.claim.sub', '35000000-0000-0000-0000-000000000003', true);

select results_eq(
  $$with changed as (
    update public.controlled_documents set title = 'renamed by viewer'
    where id = 'e5000000-0000-0000-0000-000000000001' returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a viewer cannot edit a document'
);
select is(public.controlled_documents_access('c5000000-0000-0000-0000-000000000001'), 'view', 'a viewer gets view access');

select set_config('request.jwt.claim.sub', '45000000-0000-0000-0000-000000000004', true);
select is(public.controlled_documents_access('c5000000-0000-0000-0000-000000000001'), 'none', 'a Compliance scope override of none blocks the API');

select * from finish();
rollback;
