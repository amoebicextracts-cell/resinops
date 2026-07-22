# ResinOps — Stack Overview & Dev Code Map

Cannabis cultivation/production operations platform. Single-page React app, Supabase backend, Vercel hosting + serverless functions. Written 2026-07-20, updated 2026-07-22.

## Tech stack

- **Frontend:** React 18.3.1, Vite 5.4.21, plain JS (no TypeScript). No router, no state library (Redux/Zustand/etc.), no CSS framework or UI kit — every module ships its own inline `<style>` template string and manages state with `useState`/`useEffect`. `vite-plugin-pwa` provides installable-PWA + service worker support (`registerType: 'autoUpdate'`, `NetworkOnly` for `/api/*` so API/AI/METRC responses are never cached).
- **Backend:** Supabase (Postgres + Auth + RLS). `@supabase/supabase-js` is the only runtime dependency beyond React.
- **Serverless API:** Vercel functions under `api/*.js` — thin proxies to Anthropic (chat/import) and METRC, plus auth/observability/security helpers. No Express/Next — these are raw Vercel serverless handlers.
- **Hosting:** Vercel (`vercel.json` — SPA rewrite to `index.html`, strict CSP + security headers on every route).
- **CI:** GitHub Actions — standard build/test, a Supabase disposable-database migration test, and an hourly production smoke test.
- **Offline/local mode:** if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aren't set, the whole app falls back to `localStorage` and skips auth entirely — this is a first-class supported mode, not just a dev convenience (see "Local mode" below).

Node 18 (`.nvmrc`), though CI runs Node 22. No sign-up flow in-app — accounts are provisioned out-of-band; `AuthScreen.jsx` only does sign-in / forgot-password / recovery.

## Repository layout

```
src/
  App.jsx            root shell — nav (renders MODULES from lib/modules.js), module routing, chat system prompts
  main.jsx           entry point — React root render + auth gating
  AuthScreen.jsx      sign-in / forgot-password / recovery
  StrainCombo.jsx     shared strain selector, used across several modules
  MigrationTool.jsx   localStorage→Supabase migration UI — NOT imported anywhere, orphaned/dead code
  <35+ top-level page modules — one per nav item, see "Module map" below>
  lib/
    db.js             universal data layer (Supabase ⇄ localStorage) — see "Data layer"
    dbTransforms.js    camelCase(app) ⇄ snake_case(db) field mapping + column allow-list
    supabase.js        Supabase client init, isSupabaseEnabled, current-facility context
    api.js             authenticatedApiFetch() — frontend → /api/* call wrapper
    apiErrors.js        formatApiError() — user-facing error strings w/ request-id
    auth.js             password validation, recovery-URL/event detection
    roles.js            facility RBAC constants (owner/admin/manager/member/viewer)
    markdown.js         tiny inline-markdown tokenizer for chat/AI output rendering
    metrc.js            client-side METRC sync layer on top of api/metrc.js
    modules.js          MODULES nav registry + ALL_SECTION_NAMES — extracted from App.jsx so FacilitySettings.jsx can import it too without a circular import; see "Nav, module tiers & visibility" below
    moduleVisibility.js  isModuleVisible(mod, productTier, overrides) — resolves per-module sidebar visibility
    revenue.js           bookedRevenueForBatch(), pipelineRevenue() — sales_orders is the single source of truth for revenue
    inventory.js         withdrawFifo(), resolveBom(), lineQty(), deductForBatch() — real FIFO stock deduction against BOMs
api/
  chat.js             POST /api/chat — module-scoped AI Assistant (Anthropic, per-module system prompts)
  import.js           POST /api/import — AI-assisted data import / ops-analyst / strain descriptions
  metrc.js             POST /api/metrc — server-side METRC proxy (keys never reach the browser)
  api-metrc.js         back-compat alias → metrc.js
  health.js            GET /api/health — liveness probe (used by production-smoke workflow)
  _auth.js             authenticateRequest() / authorizeFacility() — shared, not routable
  _observability.js     request-id, standard security headers, structured error logging
  _request-security.js  CORS allow-list, rate limiting, per-endpoint payload validation
supabase/
  migrations/          timestamped .sql files, NOT auto-applied (see "Migrations" below)
  ci/production_schema.sql   CI-only fixture schema for the disposable-DB test job
  tests/                pgTAP RLS / security-invariant tests
scripts/
  production-smoke.mjs                  used by the hourly prod smoke workflow
  backup-production-supabase.ps1        manual ops script
  configure-production-smoke.ps1        manual ops script
  verify-backup-restore.ps1             manual ops script
.github/workflows/
  ci.yml                  build + test on PRs/push to master
  database-tests.yml       disposable-DB migration + pgTAP RLS tests on supabase/** changes
  production-smoke.yml     hourly + manual liveness/tenant-isolation check against prod
```

## Module map (src/*.jsx, grouped by nav section — see `src/lib/modules.js`)

Regrouped 2026-07-22: the old standalone "Genetics" section was folded into Cultivation, and METRC Sync moved out of Compliance into the pinned Settings block at the bottom of the sidebar (alongside Data & Imports / Facility Settings). Sections are now collapsible accordions in the sidebar (state persisted to `localStorage.resinops_nav_collapsed`); whichever section contains the active module always force-expands.

**Operations Hub** — `Dashboard.jsx` (alerts/overview), `OpsAnalyst.jsx` (plain-English Q&A over facility data). *AI Assistant tab has no dedicated file — rendered inline in App.jsx using api/chat.js's system prompts.*

**Cultivation** — `GrowMap.jsx` (room/space repository), `Scheduler.jsx` (grow scheduler), `CloneScheduler.jsx`, `MotherPlantManager.jsx`, `HarvestBatches.jsx`, `StrainDatabase.jsx`, `PhenoHunt.jsx`, `TCTracker.jsx` (tissue culture) — the last three moved here 2026-07-22, previously their own "Genetics" section.

**Processing** — `ProductionScheduler.jsx` (batch intake→inventory, the biggest module — now also validates/links a packaging inventory item + its CoC and triggers real inventory deduction on batch creation), `YieldDashboard.jsx`, `Remediation.jsx` (irradiation dose calc for failed microbials).

**Compliance** — `GMPHub.jsx` (SOPs, deviations, shift log, step sign-offs, digital batch record), `QCTesting.jsx` (COA panels, auto-holds), `CultivationInputs.jsx` (nutrients/amendments/beneficial releases — cost log, now with a "By Grow Cycle" grouped view), `SprayLog.jsx` (regulated pesticide log, same grouped-view toggle), `IPMTracker.jsx` (pest scouting/beneficial releases/scheduling — added 2026-07-20, deliberately separate from the two above). *`MetrcHub.jsx` moved out of this section 2026-07-22 — see "Settings" below.*

**People & Labor** — `LaborDashboard.jsx`, `Employees.jsx`, `LaborManager.jsx` (Labor Setup — roster + hourly rates + Roles Summary).

**Business** — `InventoryERP.jsx` (adjustments now really withdraw stock FIFO via `lib/inventory.js`, not just clamp a new lot), `SalesOrders.jsx` (customer picker, Goals tab driving `SalesGoalDial`), `Customers.jsx` (dispensary/wholesale CRM — accounts, pipeline stage, order-history rollup), `Finance.jsx` (Cost & P&L, 280E COGS, real BOM editor, "Deduct inventory now" button), `BatchDashboard.jsx` (margin dashboard — booked vs. projected revenue split via `lib/revenue.js`, material cost now resolved from real BOMs via `lib/inventory.js`'s `resolveBom`/`lineQty` instead of the old fuzzy product-name string match).

**Facility** — `Maintenance.jsx` (work orders + LOTO log), `Equipment.jsx`, `FacilityMap.jsx` (processing/dry-cure/storage spaces, batch assignment).

**Settings** (pinned block at the bottom of the sidebar, outside the collapsible accordion) — `DataManager.jsx` (AI import, demo-data loader, backup/restore), `FacilitySettings.jsx` (also now hosts the Modules tier/visibility card, see below), `MetrcHub.jsx` (moved here 2026-07-22 from Compliance).

## Data layer (`src/lib/db.js` + `dbTransforms.js`)

Every table is accessed through `db.<table>.list/get/upsert/delete()`. `LS_KEYS` in `db.js` is the single registry mapping table name → localStorage key; add a table there and `db.<table>.*` exists automatically (nothing else in `db.js` needs touching).

- **Supabase mode** (`isSupabaseEnabled`): `sbUpsert`/`sbList` run every record through `transformForDb`/`transformFromDb` in `dbTransforms.js`. `SCHEMAS[table]` is the authoritative column allow-list (anything not listed is **silently stripped** before insert) and `FIELD_OVERRIDES[table]` renames irregular camelCase↔snake_case pairs. A reverse map is built automatically so a db column can round-trip back to *multiple* legacy app-side field names.
- **localStorage mode**: `lsUpsert`/`lsGet` are raw passthroughs — **no transform runs at all**. This matters: a field-name shape that only works because `FIELD_OVERRIDES` papers over it in Supabase mode will silently break in local mode (hit this exact bug seeding Labor Setup demo data on 2026-07-20 — fixed by seeding the canonical short-name shape instead of the renamed one). When touching seed/import code, sanity-check both modes, not just whichever one you happen to be testing against.
- `supabase/migrations/` is **not auto-applied** — every migration carries a header comment saying so; run through the disposable-DB CI job or `supabase test db` before it takes effect anywhere real.

## Nav, module tiers & visibility (added 2026-07-22)

Every entry in `src/lib/modules.js`'s `MODULES` array carries a `tier`: `"core"` (always visible, not toggleable — Dashboard, AI Assistant, AI Operations Analyst, Data & Imports, Facility Settings), `"home"` (visible by default on both product tiers — the cultivation-only modules a hobbyist/home grower would use), or `"commercial"` (hidden by default when a facility's product tier is `"home"`).

`facilities.product_tier` (`'home'|'commercial'`, default `'commercial'`) and `facilities.module_overrides` (sparse `jsonb` `{moduleId: boolean}` map, default `{}`) were added in `20260722140000_add_facilities_product_tier.sql`. `src/lib/moduleVisibility.js`'s `isModuleVisible(mod, productTier, overrides)` resolves visibility: core always wins, then an explicit override, then the tier default. This is **not a paywall** — `module_overrides` is a plain facility-editable declutter toggle (see the migration and module's own header comments); real pay-per-module enforcement would need a separate server-side entitlements system (Stripe + an entitlements table + RLS/edge-function checks that don't trust the client) — not built yet, this just lays the groundwork (clean tier tags on every module, a facility-level product tier column).

`FacilitySettings.jsx` has a "Modules" card: a Home/Commercial tier selector, every non-core module listed by section with a checkbox reflecting `module_overrides[id] ?? tierDefault`, and a "Reset to tier defaults" button that clears `module_overrides` back to `{}`. **Known gap:** `App.jsx` only fetches `product_tier`/`module_overrides` from the `facilities` row on mount, so a tier/override change saved in Facility Settings doesn't repaint the sidebar until the next page load — confirmed via live browser testing 2026-07-22. Low-priority fix would be lifting that fetch to a shared context or having `FacilitySettings.jsx` push the new values back into `App.jsx` state after save.

## Light/dark theme (added 2026-07-22)

The whole app's color palette is defined once as CSS custom properties in `App.jsx`'s injected `<style>` block (`:root { --bg, --surface, --text, --accent, --amber, --danger, ... }`); every other module's own inline `<style>` template references those same `var(--...)` names rather than redefining them, so a single override block is enough to retheme the entire UI. A `:root[data-theme="light"]` block with light-palette equivalents sits right after the dark defaults; a `theme` state in `ResinOps()` (`App.jsx`) toggles `document.documentElement`'s `data-theme` attribute and persists the choice to `localStorage.resinops_theme` (default `"dark"`, matching prior behavior for existing users). The toggle button (☀️/🌙) sits in the top-right header, left of the account menu. `AuthScreen.jsx` and `main.jsx`'s loading screen intentionally keep their own hardcoded dark styling — they're pre-auth branded screens, not in-app content, and aren't affected by the toggle.

## Local ("offline") mode

Unset `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (e.g. `.env.local`) and the app skips `AuthScreen` entirely, using `localStorage` for every table. This is how the app was manually verified end-to-end during the 2026-07-20 session (Supabase login requires credentials that shouldn't be typed by an automated agent) — restart the dev server with those two vars blanked to reproduce.

## Demo data

`DataManager.jsx`'s `loadDemoData()` is the single seed script for the "Cascade Peak Cannabis LLC" demo facility — one big function, one `for` loop per table, using a `uid()` helper that hashes short human-readable fake IDs (`"pb_001"`) into deterministic UUIDs, so clicking "Load Demo Data" repeatedly updates the same rows instead of duplicating. Cross-table references (e.g. a production batch's `harvestBatchId`) go through the same `uid()` so they stay consistent. As of 2026-07-22 this covers every module including IPM Tracker, Mother Plant Manager, Step Sign-Offs, Work Orders, LOTO Log, Customers, Sales Goals, and a real (non-placeholder) BOM shape referenced by both the Finance BOM editor and inventory deduction.

## Known gaps / oddities worth knowing about

- `MigrationTool.jsx` exists but is never imported — dead code or a manually-invoked one-off, not wired into the nav.
- `BatchDashboard.jsx`'s "Batch Margin Dashboard" pricing and `Finance.jsx`'s "Cost & P&L" pricing (`cogs_records.rev_per_unit`, plus `production_batches.unit_price` added 2026-07-20) are two independent pricing paths that don't feed each other. Revenue itself, however, is now unified — both derive booked/pipeline figures from `sales_orders` via `lib/revenue.js` (added 2026-07-22), so this gap is now scoped to *pricing/COGS entry*, not revenue.
- Vite's `manualChunks` grouping in `vite.config.js` predates several newer modules (e.g. `IPMTracker.jsx`, `MetrcHub.jsx`, `Customers.jsx`) and doesn't perfectly mirror the nav sections — cosmetic/perf only, not a correctness issue.
- Sidebar module tier/visibility changes (Facility Settings → Modules) require a page reload to take effect — see "Nav, module tiers & visibility" above.
