begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('1b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-owner@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('2b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-member@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('3b000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-other-owner@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by) values
  ('cb000000-0000-0000-0000-000000000001', 'OB Facility A', '1b000000-0000-0000-0000-000000000001'),
  ('db000000-0000-0000-0000-000000000002', 'OB Facility B', '3b000000-0000-0000-0000-000000000003');

insert into public.facility_members (facility_id, user_id, role, accepted_at) values
  ('cb000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'owner', now()),
  ('cb000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000002', 'member', now()),
  ('db000000-0000-0000-0000-000000000002', '3b000000-0000-0000-0000-000000000003', 'owner', now());

-- e1: former employee, no login. e2: the member's own record. e3: another facility's employee.
insert into public.employees (id, facility_id, name, user_id) values
  ('eb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'Former Worker', null),
  ('eb000000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000001', 'Member Worker', '2b000000-0000-0000-0000-000000000002'),
  ('eb000000-0000-0000-0000-000000000003', 'db000000-0000-0000-0000-000000000002', 'Other Facility Worker', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Owner ──
select set_config('request.jwt.claim.sub', '1b000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, worker_id)
    values ('ab000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 1', 'eb000000-0000-0000-0000-000000000001')$$,
  'P0001', 'You can only sign off as your own linked employee record',
  'an owner still cannot sign as someone else without an on-behalf reason'
);

select lives_ok(
  $$insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, worker_id, worker_at, on_behalf)
    values ('ab000000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 2',
            'eb000000-0000-0000-0000-000000000001', '2026-03-21T16:00:00Z',
            '{"worker":{"reason":"Historical backfill","entered_by":"3b000000-0000-0000-0000-000000000003","entered_at":"2020-01-01"}}')$$,
  'an owner can record a sign-off on behalf of a former employee with a reason'
);

select is(
  (select on_behalf -> 'worker' ->> 'entered_by' from public.gmp_signoffs where id = 'ab000000-0000-0000-0000-000000000002'),
  '1b000000-0000-0000-0000-000000000001',
  'entered_by is stamped from the caller, not taken from the client'
);

select ok(
  (select (on_behalf -> 'worker' ->> 'entered_at')::timestamptz > now() - interval '1 minute' from public.gmp_signoffs where id = 'ab000000-0000-0000-0000-000000000002'),
  'entered_at is stamped by the server'
);

select throws_ok(
  $$insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, worker_id, on_behalf)
    values ('ab000000-0000-0000-0000-000000000003', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 3',
            'eb000000-0000-0000-0000-000000000001', '{"worker":{"reason":"   "}}')$$,
  'P0001', 'You can only sign off as your own linked employee record',
  'a blank reason is rejected'
);

select throws_ok(
  $$insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, qc_head_id, on_behalf)
    values ('ab000000-0000-0000-0000-000000000004', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 4',
            'eb000000-0000-0000-0000-000000000001', '{"qc_head":{"reason":"Historical backfill"}}')$$,
  'P0001', 'You can only sign off as your own linked employee record',
  'QC Head cannot be recorded on behalf'
);

select throws_ok(
  $$insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, worker_id, on_behalf)
    values ('ab000000-0000-0000-0000-000000000005', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 5',
            'eb000000-0000-0000-0000-000000000003', '{"worker":{"reason":"Historical backfill"}}')$$,
  'P0001', 'You can only sign off as your own linked employee record',
  'an employee from another facility cannot be recorded'
);

update public.gmp_signoffs set on_behalf = '{}'::jsonb, notes = 'edited'
where id = 'ab000000-0000-0000-0000-000000000002';

select is(
  (select on_behalf -> 'worker' ->> 'reason' from public.gmp_signoffs where id = 'ab000000-0000-0000-0000-000000000002'),
  'Historical backfill',
  'the on-behalf marker cannot be stripped while the signer is unchanged'
);

update public.gmp_signoffs set worker_id = null, worker_at = null
where id = 'ab000000-0000-0000-0000-000000000002';

select is(
  (select on_behalf from public.gmp_signoffs where id = 'ab000000-0000-0000-0000-000000000002'),
  '{}'::jsonb,
  'unsigning a tier clears its marker'
);

-- ── Member (not an admin) ──
select set_config('request.jwt.claim.sub', '2b000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, worker_id, on_behalf)
    values ('ab000000-0000-0000-0000-000000000006', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 6',
            'eb000000-0000-0000-0000-000000000001', '{"worker":{"reason":"Historical backfill"}}')$$,
  'P0001', 'You can only sign off as your own linked employee record',
  'a non-admin member cannot record on behalf'
);

insert into public.gmp_signoffs (id, facility_id, batch_type, step_name, worker_id, on_behalf)
values ('ab000000-0000-0000-0000-000000000007', 'cb000000-0000-0000-0000-000000000001', 'production', 'Step 7',
        'eb000000-0000-0000-0000-000000000002', '{"worker":{"reason":"pretend proxy"}}');

select is(
  (select on_behalf from public.gmp_signoffs where id = 'ab000000-0000-0000-0000-000000000007'),
  '{}'::jsonb,
  'signing as yourself is recorded as a personal sign-off'
);

select * from finish();
rollback;
