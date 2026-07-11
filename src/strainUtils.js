/**
 * strainUtils.js
 * Shared utility for auto-populating the Strain Database from any entry point.
 * Call autoPopulateStrains(names) wherever a strain name is saved.
 */

import { db } from './lib/db';

/**
 * Accepts a single name string, an array of names, or a comma-separated string.
 * For any name not already in the database, creates a stub entry.
 * Returns the array of names that were newly created.
 */
export async function autoPopulateStrains(input, opts = {}) {
  if (!input) return [];

  // Normalise input to an array of clean, non-empty strings
  const rawNames = Array.isArray(input)
    ? input
    : String(input).split(",").map(s => s.trim()).filter(Boolean);

  if (!rawNames.length) return [];

  let existing = [];
  try {
    existing = await db.strains.list();
  } catch {
    return []; // can't check, bail
  }
  
  const existingNamesLower = new Set(existing.map(s => (s.name||"").toLowerCase()));

  const newNames = [];
  for (const name of rawNames) {
    if (!name || existingNamesLower.has(name.toLowerCase())) continue;
    existingNamesLower.add(name.toLowerCase()); // prevent duplicates within the same batch
    
    const entry = {
      id: crypto.randomUUID(),
      name,
      type: "Hybrid",
      parentage: "",
      breeder: opts.breeder || "",
      thcaAvg: "", thcAvg: "", cbdAvg: "", terpsAvg: "",
      dominantTerpenes: "",
      avgYieldGPerSqft: "", avgFlowerWeeks: "",
      aroma: "", flavor: "", effectProfile: "",
      notes: "Auto-added from " + (opts.source || "app"),
      salesDescription: "",
      linkedPhenoHuntId: "",
      status: "active",
    };

    try {
      await db.strains.upsert(entry);
      newNames.push(name);
    } catch (e) {
      console.error("Auto-populate strain failed:", name, e);
    }
  }

  return newNames;
}
