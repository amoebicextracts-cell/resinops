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
//
// Note: module_overrides is a plain facility-editable field, not a
// paywall — it hides/shows modules for declutter, it does not gate
// access. Real pay-per-module enforcement would need a separate,
// server-side entitlements system.
// ============================================================

export function isModuleVisible(mod, productTier, overrides) {
  if (mod.tier === "core") return true;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, mod.id)) return !!overrides[mod.id];
  if (productTier === "home") return mod.tier === "home";
  return true;
}
