/**
 * strainUtils.js
 * Shared utility for auto-populating the Strain Database from any entry point.
 * Call autoPopulateStrains(names) wherever a strain name is saved.
 */

const STORAGE_KEY = "resinops_strains";

function readStrains() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

function writeStrains(strains) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(strains));
}

/**
 * Accepts a single name string, an array of names, or a comma-separated string.
 * For any name not already in the database, creates a stub entry.
 * Returns the array of names that were newly created.
 */
export function autoPopulateStrains(input, opts = {}) {
  if (!input) return [];

  // Normalise input to an array of clean, non-empty strings
  const rawNames = Array.isArray(input)
    ? input
    : String(input).split(",").map(s => s.trim()).filter(Boolean);

  if (!rawNames.length) return [];

  const existing = readStrains();
  const existingNamesLower = new Set(existing.map(s => s.name.toLowerCase()));

  const newEntries = [];
  rawNames.forEach(name => {
    if (!name || existingNamesLower.has(name.toLowerCase())) return;
    existingNamesLower.add(name.toLowerCase()); // prevent duplicates within the same batch
    newEntries.push({
      id: "str_auto_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
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
    });
  });

  if (newEntries.length) {
    writeStrains([...existing, ...newEntries]);
  }

  return newEntries.map(e => e.name);
}
