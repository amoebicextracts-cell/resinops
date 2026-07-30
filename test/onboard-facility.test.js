import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlan, onboardFacility, parseArgs, validateArgs } from '../scripts/onboard-facility.mjs';

test('parseArgs reads flags and defaults to dry-run', () => {
  const args = parseArgs(['--name', 'Green Wells LLC', '--owner-email', 'owner@example.com']);
  assert.equal(args.name, 'Green Wells LLC');
  assert.equal(args.ownerEmail, 'owner@example.com');
  assert.equal(args.confirm, false);
});

test('parseArgs requires --confirm to leave dry-run mode', () => {
  const args = parseArgs(['--name', 'x', '--owner-email', 'a@b.com', '--confirm']);
  assert.equal(args.confirm, true);
});

test('validateArgs requires a facility name and a plausible owner email', () => {
  assert.match(validateArgs({ ownerEmail: 'a@b.com' }), /name/i);
  assert.match(validateArgs({ name: 'Green Wells LLC' }), /email/i);
  assert.match(validateArgs({ name: 'Green Wells LLC', ownerEmail: 'not-an-email' }), /email/i);
  assert.equal(validateArgs({ name: 'Green Wells LLC', ownerEmail: 'owner@example.com' }), null);
});

test('buildPlan normalizes optional license fields to null when absent', () => {
  const plan = buildPlan({ name: '  Green Wells LLC  ', ownerEmail: ' owner@example.com ' });
  assert.deepEqual(plan, {
    facility: { facility_name: 'Green Wells LLC', license_number: null, license_type: null },
    owner: { email: 'owner@example.com', role: 'owner' },
  });
});

test('onboardFacility in dry-run mode writes nothing and returns the plan', async () => {
  const result = await onboardFacility(
    { name: 'Green Wells LLC', ownerEmail: 'owner@example.com', confirm: false },
    { clientFactory: () => { throw new Error('should not be called in dry-run'); } },
  );
  assert.equal(result.dryRun, true);
  assert.equal(result.plan.facility.facility_name, 'Green Wells LLC');
});

test('onboardFacility rejects invalid input even when --confirm is set', async () => {
  await assert.rejects(
    onboardFacility({ ownerEmail: 'owner@example.com', confirm: true }),
    /name/i,
  );
});

function fakeAdminClient({ facilityId = 'facility-1', invitedUserId = 'user-1' } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        insert(payload) {
          calls.push({ table, op: 'insert', payload });
          return this;
        },
        select() { return this; },
        single: async () => ({ data: { id: facilityId }, error: null }),
        upsert(payload, opts) {
          calls.push({ table, op: 'upsert', payload, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
    auth: {
      admin: {
        inviteUserByEmail: async (email) => {
          calls.push({ op: 'invite', email });
          return { data: { user: { id: invitedUserId } }, error: null };
        },
      },
    },
  };
}

test('onboardFacility with --confirm creates the facility, invites the owner, and creates a pending membership', async () => {
  const client = fakeAdminClient();
  const result = await onboardFacility(
    { name: 'Green Wells LLC', ownerEmail: 'owner@example.com', license: 'OCM-123', licenseType: 'Adult-Use Cultivator', confirm: true },
    { env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' }, clientFactory: () => client },
  );
  assert.equal(result.dryRun, false);
  assert.equal(result.facilityId, 'facility-1');
  assert.equal(result.invitedUserId, 'user-1');
  assert.equal(result.invited, 'owner@example.com');

  const insertCall = client.calls.find(c => c.op === 'insert');
  assert.deepEqual(insertCall.payload, { facility_name: 'Green Wells LLC', license_number: 'OCM-123', license_type: 'Adult-Use Cultivator' });

  const memberCall = client.calls.find(c => c.op === 'upsert');
  assert.deepEqual(memberCall.payload, { facility_id: 'facility-1', user_id: 'user-1', role: 'owner', accepted_at: null });
  assert.deepEqual(memberCall.opts, { onConflict: 'facility_id,user_id' });
});

test('onboardFacility with --confirm fails clearly without service-role credentials', async () => {
  await assert.rejects(
    onboardFacility(
      { name: 'Green Wells LLC', ownerEmail: 'owner@example.com', confirm: true },
      { env: {}, clientFactory: () => null },
    ),
    /SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test('onboardFacility surfaces a clear error if the invite fails after facility creation', async () => {
  const client = fakeAdminClient();
  client.auth.admin.inviteUserByEmail = async () => ({ data: null, error: { message: 'email rejected' } });
  await assert.rejects(
    onboardFacility(
      { name: 'Green Wells LLC', ownerEmail: 'owner@example.com', confirm: true },
      { env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'key' }, clientFactory: () => client },
    ),
    /facility-1.*invite email failed/s,
  );
});
