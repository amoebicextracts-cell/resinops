export const FACILITY_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  MEMBER: 'member',
  VIEWER: 'viewer',
});

const EDIT_ROLES = new Set([
  FACILITY_ROLES.OWNER,
  FACILITY_ROLES.ADMIN,
  FACILITY_ROLES.MANAGER,
  FACILITY_ROLES.MEMBER,
]);

const ADMIN_ROLES = new Set([
  FACILITY_ROLES.OWNER,
  FACILITY_ROLES.ADMIN,
]);

export function canEditFacilityData(role) {
  return EDIT_ROLES.has(role);
}

export function canAdministerFacility(role) {
  return ADMIN_ROLES.has(role);
}

export function isFacilityOwner(role) {
  return role === FACILITY_ROLES.OWNER;
}
