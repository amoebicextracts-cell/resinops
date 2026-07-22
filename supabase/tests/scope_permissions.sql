begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-c@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scoped-c@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('90000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider-d@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitee-c@resinops.test', '', now(), '{}', '{}', now(), now()),
  ('b2000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blocked-c@resinops.test', '', now(), '{}', '{}', now(), now());

insert into public.facilities (id, facility_name, created_by)
values
  ('c0000000-0000-0000-0000-000000000001', 'Scope Facility C', '70000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'Scope Facility D', '90000000-0000-0000-0000-000000000003');

insert into public.facility_members (facility_id, user_id, role, scope_roles, accepted_at)
values
  ('c0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'owner', '{}'::jsonb, now()),
  -- global fallback role is viewer everywhere, but explicitly elevated to
  -- "member" (edit-capable) within the business scope only.
  ('c0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'viewer', '{"business": "member"}'::jsonb, now()),
  ('d0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000003', 'owner', '{}'::jsonb, now()),
  -- a pending invite: accepted_at is null until the invitee self-accepts.
  ('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000e', 'member', '{}'::jsonb, null),
  -- global role would normally grant read access, but "none" explicitly
  -- blocks the cultivation scope regardless.
  ('c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000f', 'member', '{"cultivation": "none"}'::jsonb, now());

insert into public.grow_spaces (id, facility_id, name)
values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Scope test cultivation row');

insert into public.inventory_items (id, facility_id, name)
values ('c2000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Scope test business row');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Owner bypasses scoping entirely, in any scope.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

select results_eq(
  $$with changed as (
    update public.grow_spaces
    set name = 'Owner-updated cultivation row'
    where id = 'c1000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'an owner can edit a cultivation-scoped table regardless of scope_roles'
);

-- A member whose global role is viewer, with no cultivation override, reads
-- but cannot edit cultivation-scoped data.
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);

select is(
  (select count(*) from public.grow_spaces where id = 'c1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a viewer-fallback member can still read a cultivation-scoped row (no scope override needed for view)'
);

select results_eq(
  $$with changed as (
    update public.grow_spaces
    set name = 'Blocked scoped-viewer edit'
    where id = 'c1000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a member with no cultivation scope_roles entry falls back to the global viewer role and cannot edit'
);

-- The same member has an explicit "member" override in the business scope,
-- which is edit-capable.
select results_eq(
  $$with changed as (
    update public.inventory_items
    set name = 'Scoped-member-updated business row'
    where id = 'c2000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (1::bigint)$$,
  'a member with a business:member scope override can edit business-scoped data'
);

select results_eq(
  $$with changed as (
    delete from public.inventory_items
    where id = 'c2000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'a business:member scope override is not admin-level and cannot delete'
);

-- Cross-tenant isolation still holds under the scope-aware functions.
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*) from public.grow_spaces where id = 'c1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'an owner of a different facility cannot view another facility''s cultivation-scoped row'
);

select is(
  (select count(*) from public.inventory_items where id = 'c2000000-0000-0000-0000-000000000001'),
  0::bigint,
  'an owner of a different facility cannot view another facility''s business-scoped row'
);

select results_eq(
  $$with changed as (
    update public.inventory_items
    set name = 'Blocked cross-tenant update'
    where id = 'c2000000-0000-0000-0000-000000000001'
    returning id
  ) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'an owner of a different facility cannot edit another facility''s business-scoped row'
);

-- A pending invitee cannot read facility data until they accept.
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-00000000000e', true);

select is(
  (select count(*) from public.grow_spaces where id = 'c1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a pending (unaccepted) invitee cannot read facility data yet'
);

-- Self-accepting via the RPC flips their own row and immediately grants
-- read access at their assigned global role (member, in this case).
select lives_ok(
  $$select public.accept_facility_invite()$$,
  'a pending invitee can call accept_facility_invite() on their own behalf'
);

select is(
  (select accepted_at is not null from public.facility_members
   where facility_id = 'c0000000-0000-0000-0000-000000000001'
     and user_id = 'a1000000-0000-0000-0000-00000000000e'),
  true,
  'accept_facility_invite() sets accepted_at on the caller''s own pending row'
);

select is(
  (select count(*) from public.grow_spaces where id = 'c1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'after accepting, the new member can read facility data per their assigned role'
);

-- Team-list profile visibility: an accepted co-member can see another
-- member's profile, but an outsider (no shared facility) cannot.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.profiles where id = '80000000-0000-0000-0000-000000000002'),
  1::bigint,
  'an accepted member can see a co-member''s profile for a Team list'
);

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);

select is(
  (select count(*) from public.profiles where id = '80000000-0000-0000-0000-000000000002'),
  0::bigint,
  'a user with no shared facility cannot see another facility''s member profile'
);

-- An explicit "none" scope override blocks even read access, overriding the
-- global role fallback that would otherwise grant it.
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-00000000000f', true);

select is(
  (select count(*) from public.grow_spaces where id = 'c1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a "none" scope override blocks read access even though the global role would normally allow it'
);

select is(
  (select count(*) from public.inventory_items where id = 'c2000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a "none" override on one scope does not affect an unrelated scope (business still readable via global role)'
);

select * from finish();
rollback;
