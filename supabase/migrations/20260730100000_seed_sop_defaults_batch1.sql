-- ============================================================
-- ResinOps — Preloaded how-to content, batch 1
-- supabase/migrations/20260730100000_seed_sop_defaults_batch1.sql
--
-- Core daily-use modules. Content lives in sop_defaults (see
-- 20260730090000) and is copied into every facility's SOP Library by
-- the seed_default_sops trigger on creation. This migration only
-- affects the catalog, not any existing facility - existing facilities
-- don't automatically get these until a manual backfill is run.
-- ============================================================

begin;

insert into public.sop_defaults (title, category, content, sort_order) values

('Dashboard', 'Getting Started', $sop$The Dashboard is the first screen you see after signing in. It's a quick health check for your facility — you don't need to open other modules just to see how things stand.

1. The greeting bar at the top shows your facility name, today's date, and flags if anything needs attention.
2. The Sales Goal bar shows progress toward this month's revenue target (set in Sales & Pre-Orders > Goals).
3. The six stat tiles give an at-a-glance summary: Confirmed Revenue, Pending Pipeline, Active Accounts, Production Batches, QC Holds, and Open Work Orders.
4. The Open Deviations tile flags any compliance issues awaiting corrective action (tracked in Compliance > GMP Hub).
5. The Sales Pipeline panel lists your largest open orders by dollar value.
6. The Revenue Per Pound panel shows overall efficiency: revenue per pound produced, total pounds produced, and completed batch count.

Tip: click any tile or panel heading to jump straight into that module.$sop$, 1),

('AI Assistant', 'AI Tools', $sop$The AI Assistant is a chat-based expert you can ask cultivation, extraction, compliance, or general operations questions — like having an experienced consultant on call.

1. Open AI Tools > AI Assistant from the sidebar.
2. Type your question in the box at the bottom (e.g. "What's the ideal VPD range during late flower?") and press Enter, or tap one of the suggested questions to get started.
3. The Assistant answers in plain language, referencing NY-specific rules where relevant.
4. If an answer looks wrong or doesn't match how your facility actually does things, click "Suggest a correction" underneath that answer, describe the correct answer, and submit. Corrections you submit are reviewed before they're applied — this keeps the Assistant accurate over time.
5. Use "History" (bottom right) to reopen a past conversation, or "Clear conversation" to start fresh.
6. "Save chat" downloads the conversation as a file you can open in Word or print.

Note: AI Operations Analyst (right above AI Assistant in the sidebar) is a related but different tool — ask it plain-English questions about your own facility's data (harvests, revenue, compliance, strain performance) instead of general knowledge questions.$sop$, 2),

('Harvest Batches', 'Cultivation', $sop$Harvest Batches track everything that happens to a plant after it comes down: drying, bucking, trimming, curing, and final graded weights.

1. Open Cultivation > Harvest Batches, then click "+ New Harvest Batch."
2. Optionally pick a "Source grow space" to auto-fill the strain and plant count from an active grow. Otherwise, enter the strain name, plant count, and harvest date manually.
3. Enter the wet weight at harvest in grams (the page shows the equivalent in pounds automatically).
4. Fill in the processing steps as they happen — bucking (pick a machine and throughput, or apply your own days), then trimming (machine or hand, with throughput/trimmer count).
5. As trim work finishes, enter final graded weights (A, B, C grade, etc.) in the grading section — you can also record a seed-to-sale package tag per grade.
6. Click "Create Harvest Batch" to save, or "Save Changes" if editing an existing one.
7. Use "↓ Export" to download a printable summary of all harvest batches and their timelines.

Harvest batches later become the material you draw from in Production Batches.$sop$, 3),

('Production Batches', 'Processing', $sop$Production Batches track everything made from harvested material — packaged flower, pre-rolls, vape, extract/concentrate, tincture, and more.

1. Open Processing > Production Batches (or Batch Scheduler), then click "+ Add Batch."
2. Pick a "Product category" first (Whole Flower, Ground Flower, Pre-Roll, Extract/Concentrate, Vape, Tincture, etc.) — the rest of the form adjusts to show only the fields relevant to that product type.
3. Link the batch to its source Harvest Batch material where applicable, so the app can track real inventory deduction.
4. Fill in the category-specific processing fields (these vary — e.g. extraction batches ask for wash/freeze-dry/press/purge steps; packaged flower asks for packaging container and unit counts).
5. Enter or track cannabinoid/terpene numbers where relevant — a valid, non-expired Certificate of Conformity is required before some fields unlock, so run QC testing first if needed.
6. Save the batch. Its status (Upcoming / In Progress / Complete) is calculated automatically from its scheduled dates and steps.
7. The full batch list shows product, strains, input material, estimated vs. actual yield, cannabinoids, and status at a glance — click "Export" for a shareable summary.

This module is complex because it covers every product type in one place — if you're setting up a specific extraction method for the first time, it's worth a short walkthrough with support the first time.$sop$, 4),

('Inventory', 'Business', $sop$Inventory tracks raw materials, packaging, vendors, purchase orders, vendor bills, and Certificates of Conformity (CoCs) for anything you receive.

1. Open Business > Inventory. There are six tabs: Items, Vendors, Purchase Orders, Accounts Payable, Certificates of Conformity, and Stock Ledger.
2. Items tab: click "+ Add item" to add a raw material, packaging component, or supply. Set its reorder point so ResinOps can flag when you're running low.
3. Vendors tab: click "+ Add vendor" before creating a purchase order — a PO needs a vendor on file.
4. Purchase Orders tab: click "+ New PO," pick a vendor, then add line items (select an existing item or "+ Add new item…" inline). Save to track it through fulfillment.
5. Accounts Payable tab: click "+ Add Invoice" to log a vendor bill against a PO, and track amount paid and due date for aging.
6. Certificates of Conformity tab: click "+ Add CoC" against any item to record lab-verified compliance status (pass/fail, expiry date) — items need a valid, unexpired CoC before certain downstream steps (like Production Batches) will let you use them.
7. Stock Ledger tab is a read-only running history of every quantity change for audit purposes.$sop$, 5),

('Sales & Pre-Orders', 'Business', $sop$Sales & Pre-Orders tracks committed and pending sales against what you actually have (or will have) available to sell.

1. Open Business > Sales & Pre-Orders. There are four tabs: Availability Board, Orders & Holds, Accounts Receivable, and Goals.
2. Availability Board shows what production batches are sellable right now, and what's still pending.
3. To create an order: go to Orders & Holds, click "+ New order," pick a customer account (or "+ New customer…" to add one on the spot), set the order date, then add line items — select the batch/product, quantity, and unit price. A batch on QC hold can't be selected until it clears.
4. Save the order — it now counts toward "Committed value (open)" and shows on the Dashboard's Sales Pipeline panel.
5. Accounts Receivable tab tracks what customers owe you and how overdue it is (aging).
6. Goals tab is where you set the monthly revenue target shown on the Dashboard's Sales Goal bar.$sop$, 6),

('Customers / Accounts', 'Business', $sop$Customers / Accounts is your CRM — dispensary and wholesale account records, contact info, and order history rollups.

1. Open Business > Customers, then click "+ Add customer."
2. Fill in the account/dispensary name, license number, account type (dispensary, processor, wholesale, or other), contact name, phone, email, address, and pipeline stage (lead, prospect, active, or inactive).
3. Save — the account now appears in the list and becomes selectable when creating orders in Sales & Pre-Orders.
4. Click any account name to open its detail view: lifetime order count, lifetime revenue, last order date, and full order history.
5. Use "Edit" or the ✕ delete button from the list or detail view to update or remove an account.
6. Use the stage filter dropdown above the table to narrow the list to one pipeline stage at a time.$sop$, 7),

('QC & Lab Testing', 'Compliance', $sop$QC & Lab Testing tracks every Certificate of Analysis (COA) — cannabinoid, terpene, and microbial panel results from your lab.

1. Open Compliance > QC Testing, then click "+ New test submission."
2. The form has five tabs: Sample Info, Cannabinoids, Terpenes, Microbial, and Other Panels — fill in each as results come back.
3. On Sample Info, choose the source type (Harvest Batch or Production Batch) and link the specific batch, then enter the strain, sample ID/CoC number, lab name, and the submitted/expected/received dates.
4. Enter panel results as they arrive on the corresponding tabs.
5. Save. If any panel fails, the batch is automatically put on hold from Sales & Pre-Orders and flagged in Compliance > GMP Hub for remediation — you don't need to manually lock it.
6. Tip: instead of typing results by hand, you can upload the lab's COA PDF directly in Data & Imports — ResinOps reads it automatically and creates the test record (and a harvest batch, if it doesn't exist yet) for you.$sop$, 8),

('Data & Imports', 'Settings', $sop$Data & Imports lets you bring in existing spreadsheets, lab PDFs, and other records instead of typing everything in by hand — useful for getting set up quickly or catching up after time away from the software.

1. Open Settings > Data & Imports. There are four tabs: AI Import, Import History, Backup & Restore, and Storage.
2. On AI Import, drag a file onto the drop zone (or click to browse). Supported formats: CSV, Excel, PDF (including lab COAs), Word, and JSON.
3. Leave "Data type" set to "Auto-detect from file content" for most files — ResinOps reads the file and figures out which module it belongs to. If a file is unusual or ambiguous, you can pick the target module from the dropdown yourself instead.
4. Review the preview screen before confirming — it shows the detected type, how many records were found, a confidence score, and a sample record. If something looks mapped incorrectly, click "Cancel / start over" and try again with an explicit data type selected.
5. Click "Import records" to save, or cancel if the preview doesn't look right.
6. If you don't have a file in a format ResinOps can read, use "Download Import Templates" to grab a blank spreadsheet for any module, fill it out, and upload that instead.
7. Import History tab shows every past import with its result. Backup & Restore and Storage tabs handle full data exports and file storage usage.$sop$, 9),

('How to use the SOP Library', 'Compliance', $sop$The SOP Library (inside Compliance > GMP Hub) is where your facility's own real operating procedures live — sanitation, harvest handling, PPE requirements, and anything else you want documented and repeatable. It's different from this Help section: Help explains how to use the ResinOps software; the SOP Library holds your facility's actual procedures.

1. Open Compliance > GMP Hub, then select the "SOP Library" tab.
2. Click "+ Add SOP."
3. Fill in the SOP title, department, version, effective date, who approved it, and status (e.g. draft or active).
4. Write the procedure itself in the content box — steps, required PPE, critical control points, and acceptance criteria.
5. Optionally link the SOP to specific batch step types, so it's easy to find from the relevant production step later.
6. Save. The SOP now appears in your library and can be edited or removed at any time.

Note: a starter set of ResinOps how-to guides (like this one) is preloaded into this same library automatically — you can tell them apart because they're reference material about the software, not your facility's actual procedures.$sop$, 10);

commit;
