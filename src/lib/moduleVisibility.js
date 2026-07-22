// ============================================================
// ResinOps — Module tier/visibility resolution
// src/lib/moduleVisibility.js
//
// A module's visibility is resolved in this order:
//   1. "core" modules are always visible (not toggleable).
//   2. An explicit per-facility override (set/cleared in Facility
//      Settings) always wins over the tier default.
//   3. Otherwise, "home"-tier facilities only see "home" modules;
//      "commercial"-tier facilities see everything by default.
//   4. If the caller's own per-scope permissions are known (Supabase mode
//      only), a module in a section they have no access to is hidden too.
//
// Note: module_overrides is a plain facility-editable field, not a
// paywall — it hides/shows modules for declutter, it does not gate
// access. Real pay-per-module enforcement would need a separate,
// server-side entitlements system. Step 4 is the same kind of thing —
// a UX convenience that mirrors the database-enforced section scoping
// added in supabase/migrations/20260723150000_add_section_scoped_permissions.sql,
// not a second copy of the security boundary. The database is still the
// real enforcement; this just avoids showing a page that would come back
// empty.
// ============================================================

import { MODULE_SECTION } from "./modules.js";

const SECTION_TO_SCOPE = {
  "Cultivation": "cultivation",
  "Processing": "processing",
  "Compliance": "compliance",
  "People & Labor": "people_labor",
  "Business": "business",
  "Facility": "facility",
};

const EDIT_ROLES = new Set(["owner", "admin", "manager", "member"]);
const VIEW_ROLES = new Set(["owner", "admin", "manager", "member", "viewer"]);

export function isModuleVisible(mod, productTier, overrides, scopeRoles, globalRole) {
  if (mod.tier === "core") return true;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, mod.id)) {
    if (!overrides[mod.id]) return false;
  } else if (productTier === "home" && mod.tier !== "home") {
    return false;
  }

  // No globalRole means there's no real facility membership loaded — local
  // (no-Supabase) mode, or a brief loading window — so skip scope filtering
  // entirely rather than treating "not loaded yet" as "hide everything".
  if (!globalRole) return true;

  // Owner/admin always see everything, regardless of scope_roles, matching
  // the database's own "owner/admin bypasses scoping" rule.
  if (globalRole === "owner" || globalRole === "admin") return true;

  const section = MODULE_SECTION[mod.id];
  const scope = section && SECTION_TO_SCOPE[section];
  if (scope) {
    // An explicit 'none' override must win even though it's falsy-adjacent
    // — don't let it fall through to the global-role fallback.
    const hasOverride = scopeRoles && Object.prototype.hasOwnProperty.call(scopeRoles, scope);
    const effectiveRole = hasOverride ? scopeRoles[scope] : globalRole;
    if (!VIEW_ROLES.has(effectiveRole)) return false;
  }
  return true;
}

export { EDIT_ROLES as SCOPE_EDIT_ROLES };
