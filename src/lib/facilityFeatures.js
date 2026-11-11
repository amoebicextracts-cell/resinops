// ============================================================
// ResinOps — Facility feature flags shared with every module
// src/lib/facilityFeatures.js
//
// App.jsx resolves these once from the facility's product tier and module
// overrides (see moduleVisibility.js) and provides them here, so modules
// outside the Cultivation section can adapt without each re-reading the
// facilities row. Default (no provider) = a cultivating facility, which
// keeps every module's original behaviour.
// ============================================================

import { createContext, useContext } from "react";

export const FacilityFeaturesContext = createContext({ cultivates: true });

export function useFacilityFeatures() {
  return useContext(FacilityFeaturesContext);
}
