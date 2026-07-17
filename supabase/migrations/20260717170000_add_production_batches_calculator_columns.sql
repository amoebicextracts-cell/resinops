-- ProductionScheduler.jsx's trim/packaging/kief/tincture/S2S calculator
-- inputs have never had columns — flagged when ProductionScheduler's actual
-- persistence bug ("batches don't save at all") was fixed earlier this
-- session and deliberately deferred as separate-scoped, the same way
-- HarvestBatches.jsx's smaller 7-field calculator gap was later fixed
-- directly. This is that same fix, just a bigger field list (~30 fields
-- vs 7) — still purely additive/nullable, same low-risk shape.
--
-- Note: pkgLabel (a derived display string, recomputed from pkgIdx +
-- pkgOpts at render time) is deliberately NOT added here, matching the
-- existing subLabel precedent already documented in dbTransforms.js —
-- it's a derived value, not source data. packSize is a genuinely
-- different field from the existing pkg_size column (which nothing
-- actually writes to — a dead FIELD_OVERRIDES entry from an unrelated
-- local variable of the same name in a calculator function), so this
-- adds pack_size as its own column rather than repurposing pkg_size.
--
-- Not applied automatically; review and run it through the disposable
-- database job (or `supabase test db`) first.

begin;

alter table public.production_batches
  add column if not exists pkg_idx integer,
  add column if not exists stem_waste_pct numeric,
  add column if not exists moisture_loss_pct numeric,
  add column if not exists fill_waste_pct numeric,
  add column if not exists cone_weight numeric,
  add column if not exists pack_size numeric,
  add column if not exists overfill_g numeric,
  add column if not exists sauce_sep_method text,
  add column if not exists extract_input_type text,
  add column if not exists tinc_bottle_size numeric,
  add column if not exists tinc_potency_mg_per_ml numeric,
  add column if not exists kief_sift boolean not null default false,
  add column if not exists kief_40_pct numeric,
  add column if not exists kief_100_pct numeric,
  add column if not exists cannabinoids jsonb,
  add column if not exists trim_type text,
  add column if not exists trim_machine text,
  add column if not exists trim_throughput numeric,
  add column if not exists trimmer_count integer,
  add column if not exists grams_per_trimmer_day numeric,
  add column if not exists preroll_machine text,
  add column if not exists preroll_throughput numeric,
  add column if not exists packaging_type text,
  add column if not exists packaging_staff integer,
  add column if not exists packaging_baseline numeric,
  add column if not exists vape_terp_source text,
  add column if not exists vape_terp_src_potency numeric,
  add column if not exists s2s_system text,
  add column if not exists s2s_source_tags text,
  add column if not exists s2s_output_tags text,
  add column if not exists input_source text;

commit;
