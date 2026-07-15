import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACILITY_ROLES,
  canAdministerFacility,
  canEditFacilityData,
  isFacilityOwner,
} from '../src/lib/roles.js';

test('facility roles have the expected edit permissions', () => {
  assert.equal(canEditFacilityData(FACILITY_ROLES.OWNER), true);
  assert.equal(canEditFacilityData(FACILITY_ROLES.ADMIN), true);
  assert.equal(canEditFacilityData(FACILITY_ROLES.MANAGER), true);
  assert.equal(canEditFacilityData(FACILITY_ROLES.MEMBER), true);
  assert.equal(canEditFacilityData(FACILITY_ROLES.VIEWER), false);
  assert.equal(canEditFacilityData(null), false);
});

test('only owners and admins can administer a facility', () => {
  assert.equal(canAdministerFacility(FACILITY_ROLES.OWNER), true);
  assert.equal(canAdministerFacility(FACILITY_ROLES.ADMIN), true);
  assert.equal(canAdministerFacility(FACILITY_ROLES.MANAGER), false);
  assert.equal(canAdministerFacility(FACILITY_ROLES.MEMBER), false);
  assert.equal(canAdministerFacility(FACILITY_ROLES.VIEWER), false);
});

test('owner detection is exact and fails closed', () => {
  assert.equal(isFacilityOwner(FACILITY_ROLES.OWNER), true);
  assert.equal(isFacilityOwner('Owner'), false);
  assert.equal(isFacilityOwner(undefined), false);
});
