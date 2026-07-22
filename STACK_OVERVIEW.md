# ResinOps — Stack Overview & Dev Code Map

Cannabis cultivation/production operations platform. Single-page React app, Supabase backend, Vercel hosting + serverless functions. Written 2026-07-20.

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
  App.jsx            root shell — nav (MODULES array), module routing, chat system prompts
  main.jsx           entry point — React root render + auth gating
  AuthScreen.jsx      sign-in / forgot-password / recovery
  StrainCombo.jsx     shared strain selector, used across several modules
  MigrationTool.jsx   localStorage→Supabase migration UI — NOT imported anywhere, orphaned/dead code
  <35 top-level page modules — one per nav item, see "Module map" below>
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

## Module map (src/*.jsx, grouped by nav section in App.jsx)

**Operations Hub** — `Dashboard.jsx` (alerts/overview), `OpsAnalyst.jsx` (plain-English Q&A over facility data). *AI Assistant tab has no dedicated file — rendered inline in App.jsx using api/chat.js's system prompts.*

**Cultivation** — `GrowMap.jsx` (room/space repository), `Scheduler.jsx` (grow scheduler), `CloneScheduler.jsx`, `MotherPlantManager.jsx`, `HarvestBatches.jsx`.

**Processing** — `ProductionScheduler.jsx` (batch intake→inventory, the biggest module), `YieldDashboard.jsx`, `Remediation.jsx` (irradiation dose calc for failed microbials).

**Genetics** — `StrainDatabase.jsx`, `PhenoHunt.jsx`, `TCTracker.jsx` (tissue culture).

**Compliance** — `MetrcHub.jsx`, `GMPHub.jsx` (SOPs, deviations, shift log, step sign-offs, digital batch record), `QCTesting.jsx` (COA panels, auto-holds), `CultivationInputs.jsx` (nutrients/amendments/beneficial releases — cost log), `SprayLog.jsx` (regulated pesticide log), `IPMTracker.jsx` (pest scouting/beneficial releases/scheduling — added 2026-07-20, deliberately separate from the two above).

**People & Labor** — `LaborDashboard.jsx`, `Employees.jsx`, `LaborManager.jsx` (Labor Setup — roster + hourly rates + Roles Summary).

**Business** — `InventoryERP.jsx`, `SalesOrders.jsx`, `Finance.jsx` (Cost & P&L, 280E COGS), `BatchDashboard.jsx` (margin dashboard — has its **own** SKU-based pricing, separate from Finance's `cogs_records` overlay — don't conflate the two when changing pricing).

**Facility** — `Maintenance.jsx` (work orders + LOTO log), `Equipment.jsx`, `FacilityMap.jsx` (processing/dry-cure/storage spaces, batch assignment).

**Platform / Settings** — `DataManager.jsx` (AI import, demo-data loader, backup/restore), `FacilitySettings.jsx`.

## Data layer (`src/lib/db.js` + `dbTransforms.js`)

Every table is accessed through `db.<table>.list/get/upsert/delete()`. `LS_KEYS` in `db.js` is the single registry mapping table name → localStorage key; add a table there and `db.<table>.*` exists automatically (nothing else in `db.js` needs touching).

- **Supabase mode** (`isSupabaseEnabled`): `sbUpsert`/`sbList` run every record through `transformForDb`/`transformFromDb` in `dbTransforms.js`. `SCHEMAS[table]` is the authoritative column allow-list (anything not listed is **silently stripped** before insert) and `FIELD_OVERRIDES[table]` renames irregular camelCase↔snake_case pairs. A reverse map is built automatically so a db column can round-trip back to *multiple* legacy app-side field names.
- **localStorage mode**: `lsUpsert`/`lsGet` are raw passthroughs — **no transform runs at all**. This matters: a field-name shape that only works because `FIELD_OVERRIDES` papers over it in Supabase mode will silently break in local mode (hit this exact bug seeding Labor Setup demo data on 2026-07-20 — fixed by seeding the canonical short-name shape instead of the renamed one). When touching seed/import code, sanity-check both modes, not just whichever one you happen to be testing against.
- `supabase/migrations/` is **not auto-applied** — every migration carries a header comment saying so; run through the disposable-DB CI job or `supabase test db` before it takes effect anywhere real.

## Local ("offline") mode

Unset `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (e.g. `.env.local`) and the app skips `AuthScreen` entirely, using `localStorage` for every table. This is how the app was manually verified end-to-end during the 2026-07-20 session (Supabase login requires credentials that shouldn't be typed by an automated agent) — restart the dev server with those two vars blanked to reproduce.

## Demo data

`DataManager.jsx`'s `loadDemoData()` is the single seed script for the "Cascade Peak Cannabis LLC" demo facility — one big function, one `for` loop per table, using a `uid()` helper that hashes short human-readable fake IDs (`"pb_001"`) into deterministic UUIDs, so clicking "Load Demo Data" repeatedly updates the same rows instead of duplicating. Cross-table references (e.g. a production batch's `harvestBatchId`) go through the same `uid()` so they stay consistent. As of 2026-07-20 this covers every module including IPM Tracker, Mother Plant Manager, Step Sign-Offs, Work Orders, and LOTO Log.

## Known gaps / oddities worth knowing about

- `MigrationTool.jsx` exists but is never imported — dead code or a manually-invoked one-off, not wired into the nav.
- `BatchDashboard.jsx`'s "Batch Margin Dashboard" pricing (SKU-matched) and `Finance.jsx`'s "Cost & P&L" pricing (`cogs_records.rev_per_unit`, plus `production_batches.unit_price` added 2026-07-20) are two independent pricing paths that don't feed each other.
- Vite's `manualChunks` grouping in `vite.config.js` predates several newer modules (e.g. `IPMTracker.jsx`, `MetrcHub.jsx`) and doesn't perfectly mirror the nav sections — cosmetic/perf only, not a correctness issue.
