// ============================================================
// ResinOps V2 — METRC Client Sync
// src/lib/metrc.js
//
// Client-side METRC integration layer.
// All actual API calls go through /api/metrc (server-side).
// This module handles sync logic, data mapping, and UI state.
// ============================================================

import { db } from './db';
import { getCurrentFacility } from './supabase';
import { authenticatedApiFetch } from './api';

// ── State configuration ───────────────────────────────────────
export const METRC_STATES = {
  AK: { name: 'Alaska',       abbr: 'AK', subdomain: 'api-ak' },
  AZ: { name: 'Arizona',      abbr: 'AZ', subdomain: 'api-az' },
  CA: { name: 'California',   abbr: 'CA', subdomain: 'api-ca' },
  CO: { name: 'Colorado',     abbr: 'CO', subdomain: 'api-co' },
  IL: { name: 'Illinois',     abbr: 'IL', subdomain: 'api-il' },
  LA: { name: 'Louisiana',    abbr: 'LA', subdomain: 'api-la' },
  MA: { name: 'Massachusetts',abbr: 'MA', subdomain: 'api-ma' },
  MD: { name: 'Maryland',     abbr: 'MD', subdomain: 'api-md' },
  ME: { name: 'Maine',        abbr: 'ME', subdomain: 'api-me' },
  MI: { name: 'Michigan',     abbr: 'MI', subdomain: 'api-mi' },
  MO: { name: 'Missouri',     abbr: 'MO', subdomain: 'api-mo' },
  MT: { name: 'Montana',      abbr: 'MT', subdomain: 'api-mt' },
  NM: { name: 'New Mexico',   abbr: 'NM', subdomain: 'api-nm' },
  NV: { name: 'Nevada',       abbr: 'NV', subdomain: 'api-nv' },
  NY: { name: 'New York',     abbr: 'NY', subdomain: 'api-ny' },
  OH: { name: 'Ohio',         abbr: 'OH', subdomain: 'api-oh' },
  OK: { name: 'Oklahoma',     abbr: 'OK', subdomain: 'api-ok' },
  OR: { name: 'Oregon',       abbr: 'OR', subdomain: 'api-or' },
  WA: { name: 'Washington',   abbr: 'WA', subdomain: 'api-wa' },
  WV: { name: 'West Virginia',abbr: 'WV', subdomain: 'api-wv' },
};

// ── Core API call ─────────────────────────────────────────────
export async function metrcCall(action, state, licenseNumber, params = {}, body = null, method = null) {
  const res = await authenticatedApiFetch('/api/metrc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, state, licenseNumber, params, body }),
  }, { includeFacility: true });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `METRC call failed: ${action}`);
  return json.data;
}

// ── Test connection ───────────────────────────────────────────
export async function testMetrcConnection(state, licenseNumber) {
  try {
    const facilities = await metrcCall('facilities.list', state, licenseNumber);
    return { success: true, facilities };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Data normalizers — METRC → ResinOps schema ────────────────

function normalizeRoom(metrcRoom) {
  return {
    metrc_id: metrcRoom.Id,
    name: metrcRoom.Name,
    room_type: 'Indoor', // METRC doesn't track type — operator sets this in ResinOps
    status: 'active',
    notes: `Synced from METRC | ID: ${metrcRoom.Id}`,
  };
}

function normalizeStrain(metrcStrain) {
  return {
    metrc_id: metrcStrain.Id,
    name: metrcStrain.Name,
    type: metrcStrain.IndicaDominantPercentage > 60 ? 'Indica-dominant' :
          metrcStrain.SativaDominantPercentage > 60 ? 'Sativa-dominant' : 'Hybrid',
    thca_avg: null,
    notes: `THC: ${metrcStrain.TestingStatus || 'N/A'} | Synced from METRC`,
  };
}

function normalizePlantBatch(metrcBatch) {
  return {
    metrc_tag: metrcBatch.Name,
    strain_name: metrcBatch.StrainName,
    room_name: metrcBatch.LocationName,
    plant_count: metrcBatch.Count,
    status: metrcBatch.PlantBatchTypeName?.toLowerCase() || 'active',
    clone_date: metrcBatch.PlantedDate,
    notes: `METRC batch | Type: ${metrcBatch.PlantBatchTypeName}`,
  };
}

function normalizeHarvest(metrcHarvest) {
  return {
    metrc_tag: metrcHarvest.Name,
    batch_number: metrcHarvest.Name,
    strain_name: metrcHarvest.StrainNames?.join(', ') || '',
    room_name: metrcHarvest.DryingLocationName || metrcHarvest.HarvestingLocationName,
    harvest_date: metrcHarvest.HarvestStartDate,
    wet_weight_g: metrcHarvest.TotalWetWeight * 28.3495, // METRC uses oz
    total_dry_weight_g: metrcHarvest.TotalRestoredWeight * 28.3495,
    plant_count: metrcHarvest.PlantCount,
    status: metrcHarvest.IsOnHold ? 'on_hold' : 
            metrcHarvest.Finished ? 'done' : 'drying',
    notes: `Synced from METRC | Unit of weight: ${metrcHarvest.UnitOfWeightName}`,
  };
}

function normalizePackage(metrcPkg) {
  return {
    metrc_tag: metrcPkg.Label,
    name: `${metrcPkg.ItemName} — ${metrcPkg.Label}`,
    category: mapItemCategory(metrcPkg.ItemProductCategoryName),
    status: metrcPkg.IsOnHold ? 'on_hold' : 
            metrcPkg.Finished ? 'done' : 'active',
    actual_yield: metrcPkg.Quantity,
    input_unit: metrcPkg.UnitOfMeasureName,
    notes: `METRC package | Category: ${metrcPkg.ItemProductCategoryName}`,
  };
}

function normalizeLabTest(metrcTest) {
  // Map METRC lab test results to ResinOps QC test schema
  const results = {};
  (metrcTest.Results || []).forEach(r => {
    const key = r.TestTypeName?.toLowerCase().replace(/\s+/g,'_');
    if (key) results[key] = r.Value;
  });

  return {
    sample_id: metrcTest.PackageLabel,
    metrc_package_tag: metrcTest.PackageLabel,
    lab_name: metrcTest.LabFacilityName,
    date_submitted: metrcTest.TestPerformedDate,
    date_reported: metrcTest.ResultReleaseDateTime,
    overall_pass: metrcTest.OverallPassed,
    thca: results['thca'] || results['delta_9_thca'] || null,
    thc: results['delta_9_thc'] || results['thc'] || null,
    cbd: results['cbd'] || null,
    cbg: results['cbg'] || null,
    cbn: results['cbn'] || null,
    total_thc: results['total_thc'] || null,
    total_terpenes: results['total_terpenes'] || null,
    pesticides_pass: !metrcTest.Results?.find(r => r.TestTypeName?.includes('Pesticide') && !r.Passed),
    heavy_metals_pass: !metrcTest.Results?.find(r => r.TestTypeName?.includes('Heavy Metal') && !r.Passed),
    microbials_pass: !metrcTest.Results?.find(r => r.TestTypeName?.includes('Microbial') && !r.Passed),
    moisture_content: results['moisture'] || results['water_activity'] || null,
    notes: `Synced from METRC | Release: ${metrcTest.ResultReleaseDateTime}`,
    _raw_metrc: metrcTest, // preserve full METRC response
  };
}

function normalizeEmployee(metrcEmp) {
  return {
    name: `${metrcEmp.FirstName} ${metrcEmp.LastName}`,
    license_number: metrcEmp.License?.Number,
    license_expiry: metrcEmp.License?.ExpirationDate,
    notes: `METRC license: ${metrcEmp.License?.Number} | Synced from METRC`,
  };
}

function mapItemCategory(metrcCategory) {
  const map = {
    'Buds': 'whole_flower',
    'Flower': 'whole_flower',
    'Shake/Trim': 'trim',
    'Pre-Roll Flower': 'pre_roll',
    'Pre-Roll Infused': 'pre_roll',
    'Concentrate (Each)': 'extract',
    'Concentrate (Weight)': 'extract',
    'Vape Cartridge (Each)': 'vape',
    'Edible (Each)': 'edible',
    'Edible (Weight)': 'edible',
    'Tincture (Volume)': 'tincture',
    'Topical (Volume)': 'topical',
    'Topical (Weight)': 'topical',
    'Hemp Concentrate': 'extract',
    'Capsule (Each)': 'edible',
  };
  return map[metrcCategory] || 'other';
}

// ── Sync functions ────────────────────────────────────────────

export async function syncRooms(state, licenseNumber, onProgress) {
  onProgress?.('Fetching rooms from METRC...');
  const rooms = await metrcCall('rooms.active', state, licenseNumber);
  if (!Array.isArray(rooms)) return { synced: 0 };

  let synced = 0;
  for (const room of rooms) {
    await db.grow_rooms.upsert({
      ...normalizeRoom(room),
      facility_id: getCurrentFacility(),
    });
    synced++;
    onProgress?.(`Syncing rooms... ${synced}/${rooms.length}`);
  }
  return { synced };
}

export async function syncStrains(state, licenseNumber, onProgress) {
  onProgress?.('Fetching strains from METRC...');
  const strains = await metrcCall('strains.active', state, licenseNumber);
  if (!Array.isArray(strains)) return { synced: 0 };

  let synced = 0;
  for (const strain of strains) {
    await db.strains.upsert({
      ...normalizeStrain(strain),
      facility_id: getCurrentFacility(),
    });
    synced++;
  }
  onProgress?.(`✓ ${synced} strains synced`);
  return { synced };
}

export async function syncHarvests(state, licenseNumber, onProgress) {
  onProgress?.('Fetching active harvests from METRC...');
  const [active, inactive] = await Promise.all([
    metrcCall('harvests.active', state, licenseNumber),
    metrcCall('harvests.inactive', state, licenseNumber, { lastModifiedStart: thirtyDaysAgo() }),
  ]);

  const all = [...(Array.isArray(active) ? active : []), ...(Array.isArray(inactive) ? inactive : [])];
  let synced = 0;
  for (const harvest of all) {
    await db.harvest_batches.upsert({
      ...normalizeHarvest(harvest),
      facility_id: getCurrentFacility(),
    });
    synced++;
    onProgress?.(`Syncing harvests... ${synced}/${all.length}`);
  }
  return { synced };
}

export async function syncLabResults(state, licenseNumber, onProgress) {
  onProgress?.('Fetching lab results from METRC...');
  // METRC requires a package label or date range for lab results
  const results = await metrcCall('labtests.results', state, licenseNumber, {
    lastModifiedStart: thirtyDaysAgo(),
    lastModifiedEnd: new Date().toISOString(),
  });

  if (!Array.isArray(results)) return { synced: 0 };

  let synced = 0;
  for (const test of results) {
    const normalized = normalizeLabTest(test);
    await db.qc_tests.upsert({
      ...normalized,
      facility_id: getCurrentFacility(),
    });

    // Auto-link to harvest batch if sample ID matches
    if (normalized.sample_id) {
      const harvests = await db.harvest_batches.list();
      const match = harvests.find(h =>
        h.coa_sample_id === normalized.sample_id ||
        h.metrc_tag === normalized.metrc_package_tag
      );
      if (match) {
        await db.harvest_batches.upsert({
          ...match,
          coa_sample_id: normalized.sample_id,
          lab_name: normalized.lab_name,
          thca_pct: normalized.thca,
        });
      }
    }
    synced++;
    onProgress?.(`Syncing lab results... ${synced}/${results.length}`);
  }
  return { synced };
}

export async function syncPackages(state, licenseNumber, onProgress) {
  onProgress?.('Fetching packages from METRC...');
  const packages = await metrcCall('packages.active', state, licenseNumber);
  if (!Array.isArray(packages)) return { synced: 0 };

  let synced = 0;
  for (const pkg of packages) {
    await db.production_batches.upsert({
      ...normalizePackage(pkg),
      facility_id: getCurrentFacility(),
    });
    synced++;
  }
  onProgress?.(`✓ ${synced} packages synced`);
  return { synced };
}

export async function syncEmployees(state, licenseNumber, onProgress) {
  onProgress?.('Fetching employees from METRC...');
  const employees = await metrcCall('employees.list', state, licenseNumber);
  if (!Array.isArray(employees)) return { synced: 0 };

  let synced = 0;
  for (const emp of employees) {
    await db.employees.upsert({
      ...normalizeEmployee(emp),
      facility_id: getCurrentFacility(),
    });
    synced++;
  }
  onProgress?.(`✓ ${synced} employees synced`);
  return { synced };
}

export async function syncTransfers(state, licenseNumber, onProgress) {
  onProgress?.('Fetching transfers from METRC...');
  const [incoming, outgoing] = await Promise.all([
    metrcCall('transfers.incoming', state, licenseNumber, { lastModifiedStart: thirtyDaysAgo() }),
    metrcCall('transfers.outgoing', state, licenseNumber, { lastModifiedStart: thirtyDaysAgo() }),
  ]);

  // Map outgoing transfers → sales orders
  let synced = 0;
  for (const transfer of (Array.isArray(outgoing) ? outgoing : [])) {
    await db.sales_orders.upsert({
      facility_id: getCurrentFacility(),
      customer_name: transfer.RecipientFacilityName,
      customer_license: transfer.RecipientFacilityLicenseNumber,
      order_date: transfer.CreatedDateTime?.split('T')[0],
      status: 'open',
      import_status: 'confirmed',
      metrc_transfer_id: transfer.Id,
      notes: `METRC transfer #${transfer.ManifestNumber}`,
      lines: (transfer.DeliveryPackages || []).map(p => ({
        product: p.ProductName || p.PackageLabel,
        qty: p.ShippedQuantity,
        unit: p.ShippedUnitOfMeasureName,
        metrc_label: p.PackageLabel,
      })),
    });
    synced++;
  }
  onProgress?.(`✓ ${synced} transfers synced`);
  return { synced, incoming: incoming?.length || 0 };
}

// ── Full sync ─────────────────────────────────────────────────
export async function syncAll(state, licenseNumber, onProgress) {
  const results = {};
  const steps = [
    ['rooms',       () => syncRooms(state, licenseNumber, onProgress)],
    ['strains',     () => syncStrains(state, licenseNumber, onProgress)],
    ['harvests',    () => syncHarvests(state, licenseNumber, onProgress)],
    ['lab_results', () => syncLabResults(state, licenseNumber, onProgress)],
    ['packages',    () => syncPackages(state, licenseNumber, onProgress)],
    ['employees',   () => syncEmployees(state, licenseNumber, onProgress)],
    ['transfers',   () => syncTransfers(state, licenseNumber, onProgress)],
  ];

  for (const [key, fn] of steps) {
    try {
      results[key] = await fn();
    } catch (err) {
      console.error(`METRC sync error [${key}]:`, err.message);
      results[key] = { error: err.message, synced: 0 };
    }
  }

  onProgress?.('✓ METRC sync complete');
  return results;
}

// ── METRC write operations ────────────────────────────────────

export async function createMetrcPackage(state, licenseNumber, packageData) {
  // Create a package in METRC from a ResinOps production batch
  const body = [{
    Tag: packageData.metrcTag,
    Location: packageData.locationName,
    Item: packageData.itemName,
    Quantity: packageData.quantity,
    UnitOfMeasure: packageData.unitOfMeasure,
    PatientLicenseNumber: null,
    Note: packageData.notes || '',
    IsProductionBatch: packageData.isProductionBatch || false,
    ProductionBatchNumber: packageData.batchNumber || '',
    IsTradeSample: false,
    ActualDate: packageData.date || new Date().toISOString().split('T')[0],
  }];
  return metrcCall('packages.create', state, licenseNumber, {}, body, 'POST');
}

export async function createMetrcHarvest(state, licenseNumber, harvestData) {
  const body = [{
    Plant: harvestData.metrcPlantTag,
    Weight: harvestData.wetWeightOz, // METRC uses oz
    UnitOfWeight: 'Ounces',
    DryingLocation: harvestData.dryingLocation,
    PatientLicenseNumber: null,
    ActualDate: harvestData.harvestDate,
  }];
  return metrcCall('plants.harvest', state, licenseNumber, {}, body, 'POST');
}

export async function recordLabTest(state, licenseNumber, labTestData) {
  const body = [{
    Label: labTestData.packageLabel,
    ResultDate: labTestData.testDate,
    Cannabinoids: labTestData.cannabinoids?.map(c => ({
      Type: c.type,
      Value: c.value,
    })) || [],
    Terpenes: labTestData.terpenes?.map(t => ({
      Type: t.type,
      Value: t.value,
    })) || [],
    Pesticides: labTestData.pesticides || [],
    HeavyMetals: labTestData.heavyMetals || [],
    Mycotoxins: labTestData.mycotoxins || [],
    Microbials: labTestData.microbials || [],
  }];
  return metrcCall('labtests.record', state, licenseNumber, {}, body, 'POST');
}

// ── Utilities ─────────────────────────────────────────────────
function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

export function getMetrcStateOptions() {
  return Object.entries(METRC_STATES).map(([abbr, info]) => ({
    value: abbr,
    label: `${info.name} (${abbr})`,
  }));
}
