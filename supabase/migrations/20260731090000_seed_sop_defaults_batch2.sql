-- ============================================================
-- ResinOps — Preloaded how-to content, batch 2 (Cultivation + AI Ops Analyst)
-- supabase/migrations/20260731090000_seed_sop_defaults_batch2.sql
-- ============================================================

begin;

insert into public.sop_defaults (title, category, content, sort_order) values

('AI Operations Analyst', 'AI Tools', $sop$AI Operations Analyst answers plain-English questions about your own facility's real data — not general cannabis knowledge (that's AI Assistant). Ask it things like "what's my average yield this month" or "which strains are underperforming."

1. Open AI Tools > AI Operations Analyst.
2. Type a question about your facility's harvests, revenue, compliance, or strain performance, or tap one of the suggestion chips to get started.
3. The Analyst answers using your actual ResinOps data — production batches, sales orders, harvest batches, etc. If little or no data is loaded yet, it will tell you so and answers will be limited.
4. Remember: this is decision support, not an approved SOP or compliance determination — always verify safety-critical, pesticide, extraction, and regulatory actions against your actual procedures and current regulations before acting on an answer.
5. Use "History" to reopen a past conversation.$sop$, 11),

('Grow Map', 'Cultivation', $sop$Grow Map is the master list of every physical room and grow space in your facility — it's the foundation other cultivation modules (Grow Scheduler, Clone Scheduler, Mother Plant Manager) pull their room lists from.

1. Open Cultivation > Grow Map, then click "+ Add room / space."
2. Enter the room name, type, and status (e.g. active, cleaning).
3. Fill in square footage, canopy square footage, and max plant count.
4. Enter light type, light count, and watts per fixture.
5. Set the clean & reset duration in days — this is used elsewhere to calculate realistic turnaround between harvests.
6. Optionally record the last harvest date and a sensor ID (for future climate integrations).
7. Save. This room now appears as a selectable option in Grow Scheduler, Clone Scheduler, and Mother Plant Manager.

Set this up first if you're new to ResinOps — most other cultivation modules depend on rooms already existing here.$sop$, 12),

('Grow Scheduler', 'Cultivation', $sop$Grow Scheduler (labeled "Cultivation Scheduler" on the page) tracks a grow from clone cut through to harvest — every milestone in one timeline.

1. Open Cultivation > Grow Scheduler, then click "+ Add Grow Space."
2. Pick an existing room from Grow Map, or type a new space name if you haven't set one up yet.
3. Set the clone cut date.
4. Add one or more strains to the space along with plant counts per strain.
5. Enter veg weeks and flower weeks — the scheduler uses these to project the harvest date automatically.
6. Save. Use "↓ Export schedule" to download a shareable timeline of all active grow spaces.

This module is the throughline connecting Clone Scheduler (working backward from a harvest date) to Harvest Batches (logging the actual result).$sop$, 13),

('Clone Scheduler', 'Cultivation', $sop$Clone Scheduler works backward from a target harvest date to tell you exactly when to cut clones — useful for planning multiple strains/rooms against a fixed calendar.

1. Open Cultivation > Clone Scheduler. Facility-wide defaults for veg weeks and clone rooting days are set at the top — override them per schedule as needed.
2. Click "+ Add clone schedule."
3. Enter the strain name and pick the target grow space (pulled from Grow Map).
4. Enter the plant count needed and the expected harvest date.
5. Enter veg weeks and rooting days for this specific run (or leave the facility defaults).
6. ResinOps calculates the exact clone cut date for you, accounting for the room's clean & reset time from Grow Map.
7. Save. Schedules with a cut date due within 7 days are flagged at the top of the page.$sop$, 14),

('Mother Plant Manager', 'Cultivation', $sop$Mother Plant Manager tracks your mother plants by strain and room, and flags when they're due for another round of cuts.

1. Open Cultivation > Mother Plant Manager, then click "+ Add mother plant."
2. Select or type the strain, and pick the room/space it lives in.
3. Enter cycle timing details — how often you take cuts and how many cuts you get per cycle.
4. Save. The dashboard at the top shows active strains, total mother plants, cuts available per cycle, and any mother sets overdue for cuts.
5. Log a cut when you take one, which resets that plant's cycle timer.

This feeds directly into Clone Scheduler — knowing what's available to cut informs what you can actually plan.$sop$, 15),

('Strain Database', 'Cultivation', $sop$Strain Database is your strain registry — parentage, genetics, average lab results, yield data, and AI-generated descriptions for sales and budtender use.

1. Open Cultivation > Strain Database, then click "+ Add strain."
2. Enter the strain name, type (Indica/Sativa/Hybrid/etc.), and status (active, retired, or in testing).
3. Enter parentage/genetics and breeder/seed bank if known.
4. Average COA data (THCa, THC, CBD, total terpenes, dominant terpenes) can be entered manually or will populate over time as lab results roll in.
5. Enter average yield and average flower time if known.
6. Click "✨ Generate description with AI" to auto-draft a sales/budtender-facing description — review and edit before saving, since it's a starting point, not a final approved description.
7. If you've run a Pheno Hunt, any "keeper" phenotype can be imported directly into the Strain Database with one click from the banner at the top of the page instead of starting from scratch.$sop$, 16),

('Pheno Hunt Tracker', 'Cultivation', $sop$Pheno Hunt Tracker follows a seed-by-seed hunt from germination through scoring to picking a "keeper" phenotype to bring into full production.

1. Open Cultivation > Pheno Hunt Tracker, then click "+ New pheno hunt" to start tracking a cross/seed batch.
2. Open that hunt, then click "+ Add pheno" for each individual seed/plant you're evaluating.
3. Score and log each pheno as it develops — including COA results once tested.
4. Mark your top performer(s) as a "keeper."
5. From Strain Database, keeper phenos show up as one-click imports so you don't have to re-enter everything you already tracked here.$sop$, 17),

('TC Tracker', 'Cultivation', $sop$TC Tracker manages tissue culture propagation — a lab-based cloning method used to keep clean, disease-free genetic stock. This is a specialized module; skip it if your facility doesn't do tissue culture.

1. Open Cultivation > TC Tracker.
2. "+ Accession" logs a new tissue culture source line you're starting from (a strain entering the TC pipeline).
3. "+ Media formula" records a recipe/formula used for growing media — reusable across vessels.
4. "+ New vessel" tracks one physical culture container through its stages, from explant to transfer, including any contamination events.
5. Vessels move through the pipeline toward acclimatization and eventual transfer to your mother room.$sop$, 18),

('IPM Tracker', 'Cultivation', $sop$IPM Tracker logs pest scouting and beneficial insect releases — separate from the regulated Pesticide Spray Log (that's for actual chemical/EPA-registered applications) and Cultivation Inputs (that's for nutrient cost tracking).

1. Open Cultivation > IPM Tracker, then click "+ Log IPM entry."
2. Choose the entry type, the room/grow space, and the target pest (e.g. thrips, russet mites).
3. Mark it "Planned (future)" with a scheduled date, or "Completed" with the date it was actually performed, and who performed it.
4. Save. This gives you a running IPM history per room, useful for spotting recurring pest pressure by space.$sop$, 19);

commit;
