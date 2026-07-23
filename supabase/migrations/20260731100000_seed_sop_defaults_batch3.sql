-- ============================================================
-- ResinOps — Preloaded how-to content, batch 3 (final batch)
-- supabase/migrations/20260731100000_seed_sop_defaults_batch3.sql
--
-- Processing analytics, Compliance (rest of GMP Hub + logs), People &
-- Labor, Business (Cost & P&L, Batch Margin), Facility, and Settings.
-- Completes coverage of every module in MODULES (src/lib/modules.js).
-- ============================================================

begin;

insert into public.sop_defaults (title, category, content, sort_order) values

('Yield Dashboard', 'Processing', $sop$Yield Dashboard is a read-only report — there's nothing to add here directly. It shows conversion efficiency per strain, calculated automatically from your Harvest Batches and Production Batches data.

1. Open Processing > Yield Dashboard.
2. The table lists every strain with harvest data, showing dry rate and — where applicable — wet hash, freeze-dry, flower rosin, hash rosin, and diamond/sauce conversion percentages.
3. Click a strain row to drill into that strain's detail view.
4. Use the search box to filter the strain list.

If a strain shows no data, it means no harvest batches or production batches with processing steps have been logged for it yet — there's nothing to configure, just log batches normally and this fills in on its own.$sop$, 20),

('Microbial Remediation', 'Processing', $sop$Microbial Remediation is a radiation dose calculator for treating a batch that failed a total yeast/mold or Aspergillus lab test — it doesn't replace your remediation vendor, it helps you track and calculate the dose needed.

1. Open Processing > Remediation. Batches that failed a microbial panel in QC & Lab Testing are automatically flagged here — you don't need to add them manually in that case.
2. To start a new record yourself, click "+ Flag failed batch."
3. Choose the source type (Harvest Batch or Production Batch) and select the specific batch, strain, and weight.
4. Enter the 3rd-party lab test result that triggered the remediation.
5. Save — ResinOps calculates the radiation dose needed based on the entered values.
6. Once remediated, log the retest result to close out the record.$sop$, 21),

('Cultivation Inputs', 'Compliance', $sop$Cultivation Inputs logs nutrients, amendments, and beneficial insect releases — this is cost/usage tracking, not the regulated pesticide log (that's Pesticide Log, a separate module for anything requiring an EPA registration number).

1. Open Compliance > Cultivation Inputs, then click "+ Log application."
2. Select the grow space, date applied, and input type (nutrient, amendment, or beneficial insect).
3. For product-based inputs, enter the product name, manufacturer, rate, rate unit, and volume applied — this also feeds into cultivation cost tracking in Cost & P&L.
4. Save. This gives you a full history per grow space of everything applied and when.$sop$, 22),

('Pesticide Log', 'Compliance', $sop$Pesticide Log is the regulatory record for actual pesticide applications — every entry requires an EPA Registration Number and is built to satisfy NY DEC documentation requirements. If a product doesn't have an EPA reg number, it belongs in Cultivation Inputs instead, not here.

1. Open Compliance > Pesticide Log, then click "+ Log application."
2. Enter the application date, type, and grow space/room.
3. Enter the product/pesticide name, manufacturer, and — required — the EPA Registration Number.
4. Enter the label rate and unit, plus REI (re-entry interval) and PHI (pre-harvest interval) where applicable.
5. Save. If a room has an active PHI restriction (harvest not yet safe based on the application date + PHI), it's flagged automatically at the top of the page with the exact date harvest becomes allowed again — don't harvest from a flagged space before that date.$sop$, 23),

('GMP Hub', 'Compliance', $sop$GMP Hub is your compliance command center — six tabs covering shift logs, step sign-offs, digital batch records, cleaning logs, deviations, and the SOP Library (covered in its own separate Help topic).

1. Open Compliance > GMP Hub.
2. Shift Log tab: click "+ Log shift" to record a shift's date, department, and supervisor, then add each employee's time in/out, which batch they worked on, and task notes.
3. Step Sign-Offs tab: click "+ Record sign-off" to document that a specific production step was performed and verified — this builds your audit trail for critical control points.
4. Batch Record tab: pick a harvest or production batch to view its full compiled digital batch record — everything logged against that batch in one place, useful for audits.
5. Cleaning Log tab is read-only — it pulls cleaning history from every room in Facility Map and Grow Map and flags any room overdue for its next clean based on the reset schedule you set on that room.
6. Deviations tab: click "+ Log deviation" whenever something didn't go according to SOP — describe what happened, its severity, and track it through to a corrective/preventive action (CAPA). Open deviations show as a warning banner at the top of the page until resolved.$sop$, 24),

('Employee Roster', 'People & Labor', $sop$Employee Roster (labeled "Employees" in the sidebar) holds staff profiles, pesticide licenses, GMP certifications, and training records — all in one place per person.

1. Open People & Labor > Employees, then click "+ Add employee."
2. The form has four tabs: Basic Info (name, role, department, status, hire date), Pesticide License, GMP Certs, and Training — fill in whichever apply to that employee.
3. Save. Employees with a pesticide license expiring soon are flagged automatically at the top of the page — renew before it lapses so they stay eligible to apply pesticides under Pesticide Log.
4. Employees added here become selectable throughout the app — as shift supervisors and staff in GMP Hub, applicators in Pesticide Log, and more.$sop$, 25),

('Labor Setup', 'People & Labor', $sop$Labor Setup defines your facility's shift structure and labor roles — set this up before expecting Labor Dashboard to show anything useful.

1. Open People & Labor > Labor Setup.
2. Under Facility Settings, set hours per shift and shifts per day — this calculates your total productive hours per day automatically.
3. Under Labor Types, click "+ Add role" to define a role (e.g. Cultivation Tech, Trimmer) with a headcount and hourly rate. If you'd rather start from a standard roster, click "Reset defaults" instead — note this overwrites whatever roster you currently have.
4. Save. These labor types and rates feed into Labor Dashboard and labor cost estimates in Cost & P&L.$sop$, 26),

('Labor Dashboard', 'People & Labor', $sop$Labor Dashboard is a read-only report comparing daily labor demand (driven by scheduled production batches and cultivation harvest events) against your configured capacity — nothing to add here directly.

1. Open People & Labor > Labor Dashboard.
2. If no labor types are configured yet, you'll see a prompt to load a quick starter set or go set them up properly in Labor Setup.
3. Once labor types exist, the dashboard shows demand vs. capacity by day, so you can spot short-staffed days before they happen.$sop$, 27),

('Cost & P&L', 'Business', $sop$Cost & P&L is ResinOps's full cost-accounting and §280E-structured profit & loss module — nine tabs covering everything from batch-level cost to your annual tax-relevant summary. This is a dense module; the tab list below is meant as a map, not a full accounting course.

1. Open Business > Cost & P&L.
2. Batch COGS — cost of goods sold calculated per production batch, based on your Bill of Materials and labor.
3. P&L Summary — a real profit & loss statement pulling together revenue and costs across the facility.
4. Forecast — projects revenue/costs forward based on your production schedule and sales pipeline.
5. Bill of Materials (BOM) — define what goes into each SKU (materials, packaging, quantities) so COGS can be calculated automatically.
6. Cultivation Costs — allocate cultivation-side costs (media, nutrients, IPM, etc.) across grow spaces or batches.
7. Cost Pools — facility overhead (rent, utilities, etc.) allocated across production per §263A rules, for accurate cost accounting.
8. Operating Expenses — non-deductible facility expenses tracked separately from COGS, the other side of the §280E calculation.
9. SKU Pricing — set wholesale/retail pricing per product SKU, which drives revenue figures throughout the app.
10. 280E Summary — your annual summary structured for §280E tax reporting; exportable as a PDF.

If accounting isn't your background, start with SKU Pricing and Bill of Materials first — most of the other tabs depend on those being set up to show real numbers instead of $0.$sop$, 28),

('Batch Margin Dashboard', 'Business', $sop$Batch Margin Dashboard (labeled "Batch Cost & Margin Dashboard" on the page) is a read-only report showing estimated revenue, COGS, and gross margin across every production batch — nothing to add here directly.

1. Open Business > Batch Margin Dashboard.
2. The top row shows facility-wide totals: booked revenue, projected remaining revenue, estimated COGS, estimated gross profit, and how many batches are on QC hold.
3. Filter the batch list by product type (Flower, Extract, Pre-Roll, Vape) or QC Hold using the buttons above the table.
4. If revenue/COGS show $0, it means SKU Pricing and/or Bill of Materials aren't set up yet in Cost & P&L — configure those first for accurate numbers here.$sop$, 29),

('Maintenance & Facilities', 'Facility', $sop$Maintenance & Facilities tracks equipment work orders, downtime, and your lockout/tagout (LOTO) safety log.

1. Open Facility > Maintenance & Facilities. Two tabs: Work Orders and LOTO Log.
2. Work Orders tab: click "+ New work order" to log an issue — what's broken, its severity, who's assigned, and downtime start/end. Work orders feed the "Open Work Orders" count on the Dashboard.
3. LOTO Log tab: click "+ New LOTO entry" whenever equipment is locked out for safety during service. Equipment currently locked out shows a warning banner at the top of the page — don't re-energize equipment without a proper sign-off logged here.$sop$, 30),

('Equipment Registry', 'Facility', $sop$Equipment Registry is your company-wide asset list — every piece of equipment, its preventive maintenance (PM) schedule, warranty, and service history.

1. Open Facility > Equipment Registry, then click "+ Add equipment."
2. Enter the equipment name, category, and status (Active, In Service, Down, Retired, or Planned for a future purchase).
3. Fill in purchase details, warranty, and PM interval — items due or overdue for PM/calibration are flagged automatically at the top of the page.
4. Save. Equipment logged here becomes selectable in Production Batches (e.g. picking a bucking or trimming machine) and shows up in depreciation calculations in Cost & P&L.$sop$, 31),

('Facility Map', 'Facility', $sop$Facility Map tracks your non-cultivation spaces — processing, dry/cure, storage, packaging, and office areas — separately from Grow Map, which is specifically for cultivation rooms.

1. Open Facility > Facility Map. Two tabs: Spaces and Cleaning Log.
2. Spaces tab: click "+ Add space" to register a room, its type, and cleaning interval.
3. Cleaning Log tab shows cleaning history for these rooms and flags anything overdue.
4. Spaces registered here can be assigned to batches, so you always know where a batch physically sits in your facility.$sop$, 32),

('Facility Settings', 'Getting Started', $sop$Facility Settings holds your facility's identity (used on every export and record), which modules show in the sidebar, and your team.

1. Open the account menu (top right) > Facility Settings, or Settings > Facility Settings in the sidebar.
2. Facility Identity: enter your licensed facility name, DBA name, license type/number, state, address, and contact info — this appears on every export, batch record, and spray log. Click "Save settings" (only facility admins can save).
3. Module Visibility: choose a product tier, then check/uncheck individual modules to show or hide them in the sidebar. This only controls what's visible to declutter navigation — it isn't a paywall and doesn't touch your data. Use "Reset to tier defaults" to undo custom overrides.
4. Team: view your current team members and their roles. Invite a new team member by entering their email and role, then send the invite — they'll get access once they accept.$sop$, 33),

('METRC Sync', 'Getting Started', $sop$METRC Sync connects ResinOps to your state's METRC seed-to-sale system, so plant, harvest, package, lab result, transfer, and employee data can pull in directly instead of manual entry. This requires a real, active METRC account with API access from your state — it can't be tested without one.

1. Open Settings > METRC Sync.
2. Enter your facility's license number and select your state.
3. Click "Test connection" to verify ResinOps can reach METRC with your credentials.
4. Once connected, run a full sync or sync individual categories (harvests, packages, lab results, transfers, employees) as needed.
5. Check the activity log at the bottom of the page for the result of each sync — it shows exactly what succeeded or failed.$sop$, 34);

commit;
