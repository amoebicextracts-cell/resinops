// ============================================================
// ResinOps — CO2 enrichment usage estimator
// src/lib/co2.js
//
// Physics-based estimate of CO2 gas consumption for a cultivation room's
// enrichment cycle, kept separate from lib/cogs.js (cost allocation, not
// physics) — a third leaf module alongside inventory.js/revenue.js that
// cogs.js's calcCultivationCost() imports from.
//
// Raising a sealed room's ppm to a target, then sustaining it against
// continuous air exchange/leakage, are two different physical processes:
// a one-time "charge" volume to hit the setpoint, plus continuous
// replenishment for whatever leaks out while enrichment runs. No per-room
// air-exchange/leak-rate data exists anywhere else in this app, so
// DEFAULT_ACH is a labeled, editable-per-room assumption (grow_rooms
// .co2InjectionRateAch) rather than a hidden constant.
// ============================================================

const AMBIENT_PPM = 400;
const CO2_LB_PER_FT3 = 0.1144;      // ~1 lb CO2 gas ≈ 8.74 ft³ at 70°F / 1 atm
const DEFAULT_ACH = 0.75;            // room-volumes/hr lost to exchange while sealed & enriching
const DEFAULT_CEILING_FT = 8;
const DEFAULT_PPM_TARGET = 1200;
const DEFAULT_HOURS_PER_DAY = 12;

// Days CO2 enrichment ran for a cycle. Explicit cycle.co2DaysEnriched wins
// (correctable at harvest close-out if the real window differed); otherwise
// assumes enrichment runs through the flowering photoperiod only — the
// conventional practice, and the default confirmed with Alex. Veg-stage
// enrichment isn't modeled.
export function daysEnrichedForCycle(cycle) {
  if (cycle?.co2DaysEnriched) return parseInt(cycle.co2DaysEnriched) || 0;
  return (parseFloat(cycle?.flw) || 0) * 7;
}

// Returns the full breakdown (room volume, ppm delta, gas volume/day,
// total, and lbs) so callers can show their work the same way
// resolveBomMaterialLines' materialLines does, not just a final number.
export function calcCo2Usage(room, cycle, daysEnriched) {
  room = room || {};
  cycle = cycle || {};

  const roomVolFt3 = (parseFloat(room.sqft) || 0) * (parseFloat(room.ceilingHeightFt) || DEFAULT_CEILING_FT);
  const targetPpm = parseFloat(cycle.co2PpmTargetOverride) || parseFloat(room.co2PpmTarget) || DEFAULT_PPM_TARGET;
  const deltaPpm = Math.max(0, targetPpm - AMBIENT_PPM);
  const hoursPerDay = parseFloat(cycle.co2HoursPerDayOverride) || parseFloat(room.co2HoursPerDay) || DEFAULT_HOURS_PER_DAY;

  let gasVolFt3PerDay;
  if (room.co2Method === 'burner' && parseFloat(room.co2BurnRateCf) > 0) {
    // Burner output is already a rated flow (ft³ CO2/hr from the
    // manufacturer spec) — used directly rather than re-derived from ppm/ACH.
    gasVolFt3PerDay = parseFloat(room.co2BurnRateCf) * hoursPerDay;
  } else {
    const ach = parseFloat(room.co2InjectionRateAch) || DEFAULT_ACH;
    // One-time charge volume to bring the room from ambient to target ppm,
    // plus continuous replenishment for everything lost to exchange/leakage
    // across the enrichment window (volume-fraction mixing, valid near
    // atmospheric conditions).
    const chargeVolFt3 = roomVolFt3 * (deltaPpm / 1e6);
    gasVolFt3PerDay = chargeVolFt3 * (1 + ach * hoursPerDay);
  }

  const days = daysEnriched ?? (parseInt(cycle.co2DaysEnriched) || 0);
  const gasVolFt3Total = gasVolFt3PerDay * days;

  return {
    roomVolFt3, targetPpm, deltaPpm, hoursPerDay,
    gasVolFt3PerDay, gasVolFt3Total, days,
    lbs: Math.max(0, gasVolFt3Total * CO2_LB_PER_FT3),
  };
}
