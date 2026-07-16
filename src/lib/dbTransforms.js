// ============================================================
// ResinOps — Supabase Schema Transforms
// src/lib/dbTransforms.js
//
// Handles camelCase (app) ↔ snake_case (Supabase) field mapping
// and strips unknown fields before upsert to prevent errors.
// ============================================================

// Valid columns per table (from Supabase schema)
const SCHEMAS = {
  strains: ['id','created_at','updated_at','facility_id','name','type','lineage','breeder','thca_avg','thc_avg','cbd_avg','terps_avg','dominant_terps','veg_weeks','flower_weeks','yield_g_sqft','aroma','flavor','effects','ai_description','notes'],
  harvest_batches: ['id','created_at','updated_at','facility_id','created_by','batch_number','strain_name','grow_space_id','room_name','harvest_date','plant_count','wet_weight_g','total_dry_weight_g','status','grade_aa_g','grade_a_g','grade_b_g','grade_c_g','trim_g','waste_g','trim_aa','trim_a','trim_b','trim_c','coa_sample_id','lab_name','thca_pct','metrc_tag','metrc_plant_batch','notes','steps','grades','trim_methods','fresh_frozen_splits','is_fresh_frozen','split_from_batch_id'],
  production_batches: ['id','created_at','updated_at','facility_id','created_by','name','category','subcategory','cat_label','strains','scheduled_date','status','input_amt','input_unit','input_material','input_potency_pct','harvest_batch_id','harvest_grade','yield_est','actual_yield','packaging_container','packaging_units_per_pack','pkg_size','vape_hardware','vape_input_type','vape_start_potency','vape_input_terp_pct','target_blend_thc','vape_terp_pct','additive_thc','additive_terp_pct','piece_weight_g','cb_blend_components','cb_targets','cb_blend_result','distillation_apparatus','linked_coc_ids','is_linked','linked_to','metrc_tag','steps','formulation_result','notes','wash_events','freeze_dry_cycles','press_runs','cold_cure_batches','dewax_passes','purge_runs','diamond_sauce_batches','input_material_type'],
  qc_tests: ['id','created_at','updated_at','facility_id','strain_name','sample_id','harvest_batch_id','production_batch_id','batch_type','lab_name','date_submitted','date_reported','thca','cbd','thc','total_thc','cbg','cbn','cbc','thcv','total_terpenes','myrcene','caryophyllene','limonene','linalool','humulene','ocimene','terpinolene','pinene','overall_pass','pesticides_pass','heavy_metals_pass','microbials_pass','foreign_matter','water_activity','moisture_content','tyam','tab','on_hold','hold_reason','notes','batch_name','submitted_date','expected_date','received_date','cbda','total_cannabinoids','bisabolol','valencene','other_terps','aspergillus','salmonella','stec','ecoli','microbial_pass'],
  grow_rooms: ['id','created_at','updated_at','facility_id','created_by','name','room_type','sqft','canopy_sqft','max_plants','light_type','light_count','light_watts','sensor_id','status','reset_days','notes'],
  grow_spaces: ['id','created_at','updated_at','facility_id','created_by','room_id','room_name','strains','clone_date','veg_weeks','flower_weeks','flip_date','projected_harvest','plant_count','status','notes'],
  clone_schedules: ['id','created_at','updated_at','facility_id','strain_name','mother_id','cut_date','root_days','veg_weeks','target_room','cut_qty','status','notes','space_id','planned_plants','harvest_date'],
  mother_plants: ['id','created_at','updated_at','facility_id','strain_name','room_name','established_date','cycle_weeks','avg_cuts_per_cycle','avg_root_rate_pct','status','metrc_tag','notes','room_id','introduced_date','plant_count','cuts_per_plant_per_cycle','cut_log'],
  tc_vessels: ['id','created_at','updated_at','facility_id','accession_id','strain_name','stage','vessel_type','media_formula','transfer_date','expected_transfer','transfer_count','contaminated','notes'],
  cultivation_inputs: ['id','created_at','facility_id','application_date','room_name','grow_space_id','input_type','product_name','manufacturer','rate','rate_unit','area_treated','applied_by','notes','epa_reg_num','volume_applied','volume_unit','cost_per_unit','total_cost','rei_hours','phi_days','application_method','target_pest','temp_f','wind_mph','humidity_pct','species','supplier','release_rate','release_unit','applicator_name','applicator_license_num'],
  spray_log: ['id','created_at','facility_id','application_date','applicator_name','applicator_license','room_name','product_name','epa_reg_number','target_pest','application_method','rate','rate_unit','area_treated','area_unit','rei_hours','phi_days','temp_f','wind_mph','humidity_pct','notes','spray_type','space_id','manufacturer','volume_applied','volume_unit','applicator_id'],
  equipment: ['id','created_at','updated_at','facility_id','name','category','manufacturer','model','serial_number','purchase_date','warranty_expiry','location','status','pm_interval_days','last_pm_date','next_pm_date','notes','asset_tag','purchase_price','vendor_id'],
  facility_map_spaces: ['id','created_at','updated_at','facility_id','name','space_type','sqft','current_batch_id','cleaning_interval_days','last_cleaned_date','status','notes'],
  gmp_sops: ['id','created_at','updated_at','facility_id','title','category','version','effective_date','content','status','approved_by','linked_step_types'],
  gmp_shifts: ['id','created_at','facility_id','shift_date','department','supervisor','notes','entries'],
  gmp_deviations: ['id','created_at','updated_at','facility_id','title','description','severity','status','batch_id','harvest_batch_id','assigned_to','resolved_at','resolution','batch_type','batch_name','step_name','deviation_date','deviation_type','root_cause','corrective_action','preventive_action','reported_by_id','closed_by_id','sop_id'],
  skus: ['id','created_at','updated_at','facility_id','name','sku_code','category','unit_size','unit_price','wholesale_price','active'],
  boms: ['id','created_at','updated_at','facility_id','sku_id','name','lines'],
  sales_orders: ['id','created_at','updated_at','facility_id','created_by','customer_name','customer_license','order_date','status','import_status','lines','notes','distru_order_id'],
  inventory_items: ['id','created_at','updated_at','facility_id','name','category','uom','valuation_method','reorder_at','reorder_qty','requires_coc','notes','cocs','lots','last_cost'],
  labor_types: ['id','created_at','facility_id','name','category','headcount','hourly_rate','notes'],
  employees: ['id','created_at','updated_at','facility_id','name','role','department','status','hire_date','phone','email','pest_license_num','pest_license_category','pest_license_state','pest_license_expiry','certs','trainings','notes'],
  import_history: ['id','created_at','facility_id','imported_by','data_type','file_name','record_count','status','error_message','raw_preview'],
  vendors: ['id','created_at','updated_at','facility_id','name','vendor_type','contact','phone','email','lead_days','notes'],
  purchase_orders: ['id','created_at','updated_at','facility_id','po_num','vendor_id','order_date','expected_delivery','status','items','notes'],
  work_orders: ['id','created_at','updated_at','facility_id','title','category','equipment_id','severity','reported_by','reported_date','status','assigned_to','down_start','down_end','labor_type_id','labor_hours','parts_cost','vendor_id','description','resolution_notes','labor_cost','total_cost'],
  loto_log: ['id','created_at','updated_at','facility_id','equipment_id','date','reason','locked_by','lock_time','reenergized_by','reenergize_time','verified_safe','notes','status'],
  remediation: ['id','created_at','updated_at','facility_id','created_by','source_type','source_id','strain_name','weight_g','lab_name','lab_report_ref','test_date','tyam_cfu','tab_cfu','aspergillus','gy_per_hour','turn_required','status','retest_result','notes','dose'],
  gmp_signoffs: ['id','created_at','updated_at','facility_id','created_by','batch_type','batch_id','step_name','performed_by_id','verified_by_id','performed_at','notes'],
};

// Explicit field renames: app name → Supabase column
// Only needed for fields that don't follow standard camelCase→snake_case
const FIELD_OVERRIDES = {
  strains: {
    parentage: 'lineage',
    effectProfile: 'effects',
    salesDescription: 'ai_description',
    dominantTerpenes: 'dominant_terps',
    avgVegWeeks: 'veg_weeks',
    avgFlowerWeeks: 'flower_weeks',
    avgYieldGPerSqft: 'yield_g_sqft',
    thcaAvg: 'thca_avg',
    thcAvg: 'thc_avg',
    cbdAvg: 'cbd_avg',
    terpsAvg: 'terps_avg',
  },
  harvest_batches: {
    strainName: 'strain_name',
    spaceName: 'room_name',
    space_name: 'room_name',
    spaceId: 'grow_space_id',
    batchNumber: 'batch_number',
    harvestDate: 'harvest_date',
    d: 'harvest_date',
    plantCount: 'plant_count',
    plants: 'plant_count',
    wetWeight: 'wet_weight_g',
    wetWeightG: 'wet_weight_g',
    totalDryWeight: 'total_dry_weight_g',
    total_dry_weight: 'total_dry_weight_g',
    gradeAA: 'grade_aa_g',
    gradeA: 'grade_a_g',
    gradeB: 'grade_b_g',
    gradeC: 'grade_c_g',
    trimWeight: 'trim_g',
    wasteWeight: 'waste_g',
    trimMethods: 'trim_methods',
    coaSampleId: 'coa_sample_id',
    labName: 'lab_name',
    thca: 'thca_pct',
    metrcTag: 'metrc_tag',
    metrcPlantBatch: 'metrc_plant_batch',
    freshFrozenSplits: 'fresh_frozen_splits',
    isFreshFrozen: 'is_fresh_frozen',
    splitFromBatchId: 'split_from_batch_id',
  },
  production_batches: {
    cat: 'category',
    catLabel: 'cat_label',
    // NOTE: subLabel intentionally has no override — it used to incorrectly
    // map to 'subcategory', the same column as `sub`. Since subLabel is
    // inserted later in ProductionScheduler's save object, it was silently
    // overwriting the real subcategory code with its own display text on
    // every save (e.g. "hash" becoming "Ice Water Hash"), which broke every
    // isHash/isRosin/isBhoProduct check on reload. subLabel is a derived
    // display string — recompute it from `sub` + the SUBS lookup wherever
    // it's needed rather than persisting it.
    sub: 'subcategory',
    d: 'scheduled_date',
    scheduledDate: 'scheduled_date',
    inputAmt: 'input_amt',
    inputUnit: 'input_unit',
    unit: 'input_unit',
    inputMaterial: 'input_material',
    inputPotencyPct: 'input_potency_pct',
    harvestBatchId: 'harvest_batch_id',
    harvestGrade: 'harvest_grade',
    yieldEst: 'yield_est',
    actual_yield: 'actual_yield',
    actualYield: 'actual_yield',
    packagingContainer: 'packaging_container',
    packagingUnitsPerPack: 'packaging_units_per_pack',
    pkgSize: 'pkg_size',
    vapeHardware: 'vape_hardware',
    vapeInputType: 'vape_input_type',
    vapeStartPotency: 'vape_start_potency',
    vapeInputTerpPct: 'vape_input_terp_pct',
    targetBlendThc: 'target_blend_thc',
    vapeTerpPct: 'vape_terp_pct',
    additiveThc: 'additive_thc',
    additiveTerpPct: 'additive_terp_pct',
    pieceWeightG: 'piece_weight_g',
    cbBlendComponents: 'cb_blend_components',
    cbTargets: 'cb_targets',
    cbBlendResult: 'cb_blend_result',
    distillationApparatus: 'distillation_apparatus',
    linkedCocIds: 'linked_coc_ids',
    isLinked: 'is_linked',
    linkedTo: 'linked_to',
    metrcTag: 'metrc_tag',
    formulationResult: 'formulation_result',
    washEvents: 'wash_events',
    freezeDryCycles: 'freeze_dry_cycles',
    pressRuns: 'press_runs',
    coldCureBatches: 'cold_cure_batches',
    dewaxPasses: 'dewax_passes',
    purgeRuns: 'purge_runs',
    diamondSauceBatches: 'diamond_sauce_batches',
    inputMaterialType: 'input_material_type',
  },
  qc_tests: {
    strainName: 'strain_name',
    sampleId: 'sample_id',
    harvestBatchId: 'harvest_batch_id',
    productionBatchId: 'production_batch_id',
    batchName: 'batch_name',
    batchType: 'batch_type',
    labName: 'lab_name',
    dateSubmitted: 'date_submitted',
    dateReported: 'date_reported',
    submittedDate: 'submitted_date',
    expectedDate: 'expected_date',
    receivedDate: 'received_date',
    totalThc: 'total_thc',
    totalTerpenes: 'total_terpenes',
    totalCannabinoids: 'total_cannabinoids',
    overallPass: 'overall_pass',
    pesticidesPass: 'pesticides_pass',
    heavyMetalsPass: 'heavy_metals_pass',
    microbialsPass: 'microbials_pass',
    microbialPass: 'microbial_pass',
    foreignMatter: 'foreign_matter',
    foreignMatterPass: 'foreign_matter',
    waterActivity: 'water_activity',
    moistureContent: 'moisture_content',
    onHold: 'on_hold',
    holdReason: 'hold_reason',
  },
  grow_rooms: {
    roomType: 'room_type',
    type: 'room_type',
    canopySqft: 'canopy_sqft',
    canopy: 'canopy_sqft',
    maxPlants: 'max_plants',
    lightType: 'light_type',
    lightCount: 'light_count',
    lightWatts: 'light_watts',
    sensorId: 'sensor_id',
    resetDays: 'reset_days',
  },
  grow_spaces: {
    roomId: 'room_id',
    roomName: 'room_name',
    name: 'room_name',
    cloneDate: 'clone_date',
    vegWeeks: 'veg_weeks',
    flowerWeeks: 'flower_weeks',
    flipDate: 'flip_date',
    projectedHarvest: 'projected_harvest',
    plantCount: 'plant_count',
  },
  clone_schedules: {
    strainName: 'strain_name',
    motherId: 'mother_id',
    cutDate: 'cut_date',
    rootDays: 'root_days',
    vegWeeks: 'veg_weeks',
    targetRoom: 'target_room',
    cutQty: 'cut_qty',
    spaceId: 'space_id',
    plannedPlants: 'planned_plants',
    harvestDate: 'harvest_date',
  },
  mother_plants: {
    strainName: 'strain_name',
    roomName: 'room_name',
    roomId: 'room_id',
    establishedDate: 'established_date',
    introducedDate: 'introduced_date',
    cycleWeeks: 'cycle_weeks',
    avgCutsPerCycle: 'avg_cuts_per_cycle',
    avgRootRatePct: 'avg_root_rate_pct',
    metrcTag: 'metrc_tag',
    plantCount: 'plant_count',
    cutsPerPlantPerCycle: 'cuts_per_plant_per_cycle',
    cutLog: 'cut_log',
  },
  tc_vessels: {
    accessionId: 'accession_id',
    strainName: 'strain_name',
    vesselType: 'vessel_type',
    mediaFormula: 'media_formula',
    transferDate: 'transfer_date',
    expectedTransfer: 'expected_transfer',
    transferCount: 'transfer_count',
  },
  cultivation_inputs: {
    applicationDate: 'application_date',
    roomName: 'room_name',
    spaceName: 'room_name',
    growSpaceId: 'grow_space_id',
    spaceId: 'grow_space_id',
    inputType: 'input_type',
    type: 'input_type',
    productName: 'product_name',
    product: 'product_name',
    rateUnit: 'rate_unit',
    areaTreated: 'area_treated',
    areaApplied: 'area_treated',
    appliedBy: 'applied_by',
    applicatorId: 'applied_by',
    date: 'application_date',
    epaRegNum: 'epa_reg_num',
    volumeApplied: 'volume_applied',
    volumeUnit: 'volume_unit',
    costPerUnit: 'cost_per_unit',
    totalCost: 'total_cost',
    rei: 'rei_hours',
    phi: 'phi_days',
    applicationMethod: 'application_method',
    targetPest: 'target_pest',
    weatherTemp: 'temp_f',
    weatherWind: 'wind_mph',
    weatherHumidity: 'humidity_pct',
    species: 'species',
    supplier: 'supplier',
    releaseRate: 'release_rate',
    releaseUnit: 'release_unit',
    applicatorName: 'applicator_name',
    applicatorLicenseNum: 'applicator_license_num',
  },
  spray_log: {
    applicationDate: 'application_date',
    date: 'application_date',
    applicatorName: 'applicator_name',
    applicatorLicense: 'applicator_license',
    applicatorLicenseNum: 'applicator_license',
    roomName: 'room_name',
    spaceName: 'room_name',
    spaceId: 'space_id',
    productName: 'product_name',
    product: 'product_name',
    epaRegNumber: 'epa_reg_number',
    epaRegNum: 'epa_reg_number',
    targetPest: 'target_pest',
    applicationMethod: 'application_method',
    rateUnit: 'rate_unit',
    areaTreated: 'area_treated',
    areaApplied: 'area_treated',
    areaUnit: 'area_unit',
    reiHours: 'rei_hours',
    rei: 'rei_hours',
    phiDays: 'phi_days',
    phi: 'phi_days',
    tempF: 'temp_f',
    weatherTemp: 'temp_f',
    windMph: 'wind_mph',
    weatherWind: 'wind_mph',
    humidityPct: 'humidity_pct',
    weatherHumidity: 'humidity_pct',
    type: 'spray_type',
    manufacturer: 'manufacturer',
    volumeApplied: 'volume_applied',
    volumeUnit: 'volume_unit',
    applicatorId: 'applicator_id',
  },
  equipment: {
    serialNumber: 'serial_number',
    serial: 'serial_number',
    purchaseDate: 'purchase_date',
    warrantyExpiry: 'warranty_expiry',
    warrantyExpires: 'warranty_expiry',
    pmIntervalDays: 'pm_interval_days',
    pmFreqDays: 'pm_interval_days',
    lastPmDate: 'last_pm_date',
    lastServiceDate: 'last_pm_date',
    nextPmDate: 'next_pm_date',
    cat: 'category',
    make: 'manufacturer',
    assetTag: 'asset_tag',
    purchasePrice: 'purchase_price',
    vendorId: 'vendor_id',
  },
  facility_map_spaces: {
    spaceType: 'space_type',
    currentBatchId: 'current_batch_id',
    cleaningIntervalDays: 'cleaning_interval_days',
    lastCleanedDate: 'last_cleaned_date',
  },
  gmp_sops: {
    effectiveDate: 'effective_date',
    department: 'category',
    approvedBy: 'approved_by',
    linkedStepTypes: 'linked_step_types',
  },
  gmp_shifts: {
    shiftDate: 'shift_date',
  },
  gmp_deviations: {
    batchId: 'batch_id',
    harvestBatchId: 'harvest_batch_id',
    assignedTo: 'assigned_to',
    resolvedAt: 'resolved_at',
    batchType: 'batch_type',
    batchName: 'batch_name',
    stepName: 'step_name',
    date: 'deviation_date',
    type: 'deviation_type',
    rootCause: 'root_cause',
    correctiveAction: 'corrective_action',
    preventiveAction: 'preventive_action',
    reportedById: 'reported_by_id',
    closedById: 'closed_by_id',
    sopId: 'sop_id',
  },
  skus: {
    skuCode: 'sku_code',
    unitSize: 'unit_size',
    unitPrice: 'unit_price',
    wholesalePrice: 'wholesale_price',
    product: 'name',
    price: 'unit_price',
  },
  boms: {
    skuId: 'sku_id',
    product: 'name',
    items: 'lines',
  },
  sales_orders: {
    customerName: 'customer_name',
    customerLicense: 'customer_license',
    orderDate: 'order_date',
    importStatus: 'import_status',
    distruOrderId: 'distru_order_id',
  },
  inventory_items: {
    valuationMethod: 'valuation_method',
    vm: 'valuation_method',
    n: 'name',
    cat: 'category',
    reorderAt: 'reorder_at',
    reorderQty: 'reorder_qty',
    requiresCoc: 'requires_coc',
    lastCost: 'last_cost',
  },
  labor_types: {
    hourlyRate: 'hourly_rate',
    rate: 'hourly_rate',
    n: 'name',
    cat: 'category',
    count: 'headcount',
  },
  employees: {
    hireDate: 'hire_date',
    pestLicenseNum: 'pest_license_num',
    pestLicenseCategory: 'pest_license_category',
    pestLicenseState: 'pest_license_state',
    pestLicenseExpiry: 'pest_license_expiry',
  },
  import_history: {
    importedBy: 'imported_by',
    dataType: 'data_type',
    fileName: 'file_name',
    recordCount: 'record_count',
    errorMessage: 'error_message',
    rawPreview: 'raw_preview',
  },
  vendors: {
    n: 'name',
    vendorType: 'vendor_type',
    leadDays: 'lead_days',
  },
  purchase_orders: {
    poNum: 'po_num',
    vendorId: 'vendor_id',
    date: 'order_date',
    expectedDelivery: 'expected_delivery',
  },
  work_orders: {
    cat: 'category',
    equipId: 'equipment_id',
    reportedBy: 'reported_by',
    reportedDate: 'reported_date',
    assignedTo: 'assigned_to',
    downStart: 'down_start',
    downEnd: 'down_end',
    laborTypeId: 'labor_type_id',
    laborHours: 'labor_hours',
    partsCost: 'parts_cost',
    vendorId: 'vendor_id',
    resolutionNotes: 'resolution_notes',
    laborCost: 'labor_cost',
    totalCost: 'total_cost',
  },
  loto_log: {
    equipId: 'equipment_id',
    lockedBy: 'locked_by',
    lockTime: 'lock_time',
    reenergizedBy: 'reenergized_by',
    reenergizeTime: 'reenergize_time',
    verifiedSafe: 'verified_safe',
  },
  remediation: {
    sourceType: 'source_type',
    sourceId: 'source_id',
    strainName: 'strain_name',
    weightG: 'weight_g',
    labName: 'lab_name',
    labReportRef: 'lab_report_ref',
    testDate: 'test_date',
    tyamCfu: 'tyam_cfu',
    tabCfu: 'tab_cfu',
    gyPerHour: 'gy_per_hour',
    turnRequired: 'turn_required',
    retestResult: 'retest_result',
  },
  gmp_signoffs: {
    batchType: 'batch_type',
    batchId: 'batch_id',
    stepName: 'step_name',
    performedById: 'performed_by_id',
    verifiedById: 'verified_by_id',
    timestamp: 'performed_at',
  },
};

// Build reverse maps (Supabase → app) automatically.
// Multiple app-side field names can legitimately map to the same db column —
// e.g. a legacy alias plus the real current component field name. Collect
// ALL of them per column instead of keeping only the first, so every valid
// app-side name gets populated on read regardless of which order they were
// declared in. (Previously only the first-declared alias won, which meant
// whichever name a component actually used could silently come back empty
// even though saving worked fine — the bug behind several "field not
// populating" reports this session.)
const REVERSE_OVERRIDES = {};
for (const [table, map] of Object.entries(FIELD_OVERRIDES)) {
  REVERSE_OVERRIDES[table] = {};
  for (const [appKey, dbKey] of Object.entries(map)) {
    if (!REVERSE_OVERRIDES[table][dbKey]) REVERSE_OVERRIDES[table][dbKey] = [];
    REVERSE_OVERRIDES[table][dbKey].push(appKey);
  }
}

/**
 * Transform a record from app format to Supabase format.
 * Renames fields and strips any that don't exist in the table schema.
 */
export function transformForDb(tableName, record) {
  const schema = SCHEMAS[tableName];
  if (!schema) return record; // unknown table, pass through

  const overrides = FIELD_OVERRIDES[tableName] || {};
  const validCols = new Set(schema);
  const result = {};

  for (const [key, value] of Object.entries(record)) {
    // Skip internal/transient fields
    if (key === 'created_at' || key === 'updated_at') continue;

    // Check if there's an explicit rename
    const mappedKey = overrides[key] || key;

    // Only include if it's a valid column
    if (validCols.has(mappedKey)) {
      result[mappedKey] = (value === "" || value === undefined) ? null : value;
    }
  }

  return result;
}

/**
 * Transform a record from Supabase format back to app format.
 * Renames snake_case columns back to every camelCase app field name that
 * maps to them.
 */
export function transformFromDb(tableName, record) {
  if (!record) return record;
  const reverseMap = REVERSE_OVERRIDES[tableName];
  if (!reverseMap) return record;

  const result = { ...record };
  for (const [dbKey, appKeys] of Object.entries(reverseMap)) {
    if (dbKey in result) {
      for (const appKey of appKeys) {
        if (dbKey !== appKey) result[appKey] = result[dbKey];
      }
    }
  }
  return result;
}

export { SCHEMAS };

