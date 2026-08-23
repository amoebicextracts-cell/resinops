# Supplier and service-provider qualification

Closes the Annex 11 §3 (Suppliers and Service Providers) gap: this is
the first time ResinOps' actual third-party dependencies have been
inventoried and assessed in one place, rather than living only in
`package.json`, `vercel.json`, and scattered API route comments.

Compliance certifications below are drawn from each vendor's own
published trust/security pages as of 2026-08-23 (cited per vendor) —
**self-reported by the vendor, not independently audited by ResinOps.**
That's the same self-assessment limitation named throughout this
project's other Annex 11 documentation, applied here to suppliers
instead of to ResinOps' own controls.

## Critical infrastructure suppliers

### Supabase — database, authentication, file storage

- **Role**: sole system of record for all tenant data (Postgres),
  identity/session management (Auth), and private document storage
  (batch-record/COA/SOP signed PDFs, resinex project documents).
- **Data access**: full access to all production data by design — this
  is not a vendor that merely processes a subset of data, it *is* the
  data layer.
- **Published compliance**: SOC 2 Type 2, HIPAA-compliant configuration
  (BAA available), ISO 27001 certified, GDPR-compliant deployment
  options with a Data Processing Agreement available for EU-region
  projects. ([supabase.com/security](https://supabase.com/security))
- **Qualification status**: Qualified, in active production use since
  project inception. Current plan tier: Pro (confirmed directly in the
  Supabase dashboard).
- **Key dependency risk**: single point of failure for the entire
  application — see [business-continuity-plan.md](./business-continuity-plan.md)
  for the mitigations in place (independent daily backups, both
  Supabase's own and ResinOps' custom pipeline) and what isn't yet
  mitigated (no Point-in-Time Recovery, unrehearsed restore drill).

### Vercel — application hosting, serverless functions, cron scheduling

- **Role**: hosts the frontend build and every `api/*` serverless
  function (all authentication-gated business logic, all third-party
  API proxying). Also runs the scheduled backup and AC Infinity polling
  crons.
- **Data access**: every request passes through Vercel's edge/serverless
  runtime; it does not persist application data itself, but transiently
  handles all of it in transit and holds every secret environment
  variable (Supabase service-role key, METRC/AC-Infinity credentials,
  Anthropic API key).
- **Published compliance**: SOC 2 Type 2, ISO 27001:2013, GDPR
  compliant, HIPAA support for enterprise customers, PCI DSS v4.0
  compliant, EU-US Data Privacy Framework certified.
  ([vercel.com/security](https://vercel.com/security))
- **Qualification status**: Qualified, in active production use since
  project inception.
- **Key dependency risk**: holds every other supplier's credentials as
  environment variables — a Vercel account compromise is effectively a
  compromise of every integration below it, not just Vercel itself.

### Anthropic — AI assistant / chat feature (`api/chat.js`)

- **Role**: powers the in-app AI chat/assistant feature. Receives
  whatever context a user's chat session sends (facility data the user
  chooses to discuss), not a standing feed of all production data.
- **Data access**: only what's included in an individual chat request's
  prompt/context — scoped per-request, not a persistent data-sharing
  relationship.
- **Published compliance**: SOC 2 Type I & Type II (covering the
  commercial API tier), ISO 27001:2022, ISO/IEC 42001:2023 (AI
  management systems), HIPAA-ready configuration with a BAA available.
  Commercial API inputs/outputs are deleted within 30 days by default;
  a stricter Zero-Data-Retention arrangement is available.
  ([privacy.claude.com](https://privacy.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained),
  [trust.anthropic.com](https://trust.anthropic.com/))
- **Qualification status**: Qualified, in active production use.
  ResinOps has not confirmed which specific data-retention terms (30-day
  default vs. Zero-Data-Retention) apply to its own account — worth
  confirming and recording here once checked.

### Google Cloud Storage — off-site production backup retention

- **Role**: stores the 7-year-retained, restore-verified production
  database backups (bucket `resinops-production-backups-able-armor`),
  independent of Supabase's own infrastructure. See
  [backup-retention.md](./backup-retention.md) for the full access model
  (Workload Identity Federation, write-only service account).
- **Data access**: receives a full database dump once per day, after
  it's already passed restore verification. No read or delete access is
  granted to the pipeline that writes it (deliberately — see
  backup-retention.md).
- **Published compliance**: Google Cloud publishes SOC 1/2/3, ISO
  27001/27017/27018, HIPAA, and PCI DSS compliance offerings across its
  platform, including Cloud Storage. (Not independently re-verified
  against Google's live compliance-reports portal as part of this
  assessment — see the self-assessment caveat above.)
- **Qualification status**: Qualified, in active production use.
- **Known gap, already named in backup-retention.md**: the GCP project
  (`able-armor-504314-n3`) sits under a personal Google account, not a
  dedicated ResinOps organization — worth revisiting before this
  supplier relationship scales past one person's account boundary.

## Operational / lower-criticality suppliers

### AC Infinity — environmental sensor and controller data ingestion

- **Role**: pulls climate/environmental sensor data from a facility's
  AC Infinity grow-room controllers into ResinOps.
- **Data access**: one-way read of device/sensor data only; no
  ResinOps data is sent to AC Infinity.
- **Published compliance**: **none found.** AC Infinity has no official
  public API and no published enterprise security/compliance
  documentation — it's a consumer grow-equipment product, not an
  enterprise API vendor.
- **Integration model — the actual finding of this qualification
  review**: this integration is built against the *community's
  reverse-engineered* understanding of AC Infinity's own mobile-app
  cloud API (`api/ac-infinity.js`), cross-checked against a third-party
  open-source Home Assistant integration, not an official partner
  relationship. It authenticates with a real AC Infinity account's
  **email and password** stored as Vercel environment variables, not a
  scoped API key or OAuth token — meaning the credential has the same
  access a person logging into the AC Infinity consumer app would have,
  and AC Infinity could change or break the underlying endpoints without
  any notice to ResinOps, since there's no vendor relationship to be
  notified through.
- **Qualification status**: **Conditionally qualified — accepted risk,
  not a fully qualified enterprise supplier.** This is fine for an
  optional, non-GMP-critical convenience feature (environmental
  monitoring) but should not be treated as equivalent in reliability to
  the suppliers above. If environmental data ever becomes GMP-relevant
  in a way that requires a reliable audit trail, this integration's
  informal foundation should be revisited before depending on it for
  that purpose.

### METRC — state seed-to-sale regulatory system

- **Role**: not yet an active supplier. `api/metrc.js` exists and is
  fully built (read sync and write actions) but has zero configured
  credentials in any environment — confirmed directly via `vercel env
  ls production`.
- **Qualification status**: **Not yet applicable.** Becoming a METRC
  data source (read) or, further, a registered METRC software
  integrator capable of writes, requires ResinOps to hold a real
  business license with an EIN and apply to METRC as a software vendor
  — a prerequisite that has not been completed. See
  `api/metrc.js`'s own header comment and
  [risk-assessment.md](./risk-assessment.md)'s SEC-4 for the fuller
  context. This entry exists so the future qualification step isn't
  forgotten, not because METRC is currently a live supplier.

## Known gaps in this qualification

- No standing schedule exists yet for re-checking a supplier's
  published compliance status — it should be re-verified at minimum
  annually, or whenever a supplier-dependent incident occurs.
- Anthropic's specific data-retention terms for ResinOps' own account
  haven't been confirmed against the account settings/contract.
- AC Infinity's informal integration model is accepted as-is for now;
  it has not been escalated to Alex as a decision requiring sign-off
  beyond what's written here. Worth an explicit go/no-go if
  environmental data is ever tied to a GMP release decision.
